-- =============================================================================
-- LEXBNB PHASE 41 — ROL VE KIRACI YETKILERININ SIKILASTIRILMASI
-- =============================================================================
-- Bu goc yedi yetki boslugunu tek transaction'da kapatir:
--
--   1. Mesaj kuyrugu worker RPC'leri (`claim_scheduled_messages_atomic`,
--      `record_message_delivery_result_atomic`) yalniz service_role'e acilir;
--      `authenticated` yetkisi geri alinir. Uygulamada bunlari tarayicidan
--      cagiran bir yol yoktur; worker islemidir (phase17 worker'lari gibi).
--   2. `accept_extension_offer_atomic` rezervasyon yazar; cagiranin oturumu
--      ve hedef isletmedeki rolu, kayit aranmadan ONCE dogrulanir. Izinli
--      roller bookings UPDATE politikasiyla aynidir.
--   3. phase10 ve phase12 tablolarinda "uye olan her seyi yazar" (FOR ALL)
--      politikalari yerine rol bazli politikalar gelir. Okuma uyelere acik
--      kalir; yazma rolune gore. `user_notifications` kisiseldir: kullanici
--      yalniz kendi bildirimini gorur ve degistirir. Bildirim/uyari RPC'leri
--      (phase29/39) ayni kurala baglanir — tablo yolu kapanip RPC yolu acik
--      kalsaydi kural yine delinirdi. phase29/39 kazanimlari korunur.
--   4. `delete_booking_atomic` RLS ile ayni rolleri ister (owner/admin/manager).
--   5. `tenant_id` sutunu olan HER tabloda degismezlik tetikleyicisi bulunur.
--      phase24 tetikleyiciyi yalniz o an var olan tablolara kurmustu; sonra
--      acilan tablolar ciplak kalmisti. Dogrulama blogu eksik tablo kalirsa
--      durur.
--   6. `anon` rolunun public semasindaki tum tablo, gorunum ve dizi yetkileri
--      geri alinir; ileride acilacak tablolar icin varsayilan yetki de.
--      Uygulamada giris oncesi hicbir akis tablo okumaz.
--   7. `create_tenant_and_owner`, uyeligi olan kullanici icin yeni isletme
--      acmaz. Ayni kullanici icin eszamanli iki cagri advisory lock ile
--      siraya girer.
--   8. `schema_migrations` tablosunda RLS acilir (politika yok: yalniz
--      service_role ve tablo sahibi erisir).
--
-- Tum rol kontrolleri `COALESCE(get_tenant_role(..), '')` kalibindadir:
-- yabanci kiracida rol NULL doner ve `NULL NOT IN (...)` korumayi sessizce
-- atlar (CLAUDE.md 7).
--
-- CALISTIRMA: Supabase Dashboard -> SQL Editor -> tamamini yapistir -> Run
-- Idempotenttir. phase39'dan SONRA uygulanmalidir.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Mesaj kuyrugu worker RPC'leri: yalniz service_role
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_scheduled_messages_atomic(
    p_tenant_id UUID,
    p_worker_id VARCHAR,
    p_batch_size INTEGER DEFAULT 10,
    p_stale_timeout_minutes INTEGER DEFAULT 5
)
RETURNS SETOF public.scheduled_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;

    -- Reclaim stale PROCESSING messages
    UPDATE public.scheduled_messages
    SET status = 'SCHEDULED',
        claimed_at = NULL,
        claimed_by = NULL,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND status = 'PROCESSING'
      AND claimed_at < (NOW() - (p_stale_timeout_minutes || ' minutes')::interval);

    -- Claim due SCHEDULED messages
    RETURN QUERY
    WITH target_messages AS (
        SELECT id
        FROM public.scheduled_messages
        WHERE tenant_id = p_tenant_id
          AND status = 'SCHEDULED'
          AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.scheduled_messages sm
    SET status = 'PROCESSING',
        claimed_at = NOW(),
        claimed_by = p_worker_id,
        updated_at = NOW()
    FROM target_messages tm
    WHERE sm.id = tm.id
    RETURNING sm.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_scheduled_messages_atomic(UUID, VARCHAR, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_scheduled_messages_atomic(UUID, VARCHAR, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_scheduled_messages_atomic(UUID, VARCHAR, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_messages_atomic(UUID, VARCHAR, INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.record_message_delivery_result_atomic(
    p_tenant_id UUID,
    p_message_id UUID,
    p_status VARCHAR,
    p_recipient_snapshot VARCHAR,
    p_provider VARCHAR,
    p_provider_response_id VARCHAR DEFAULT NULL,
    p_error_code VARCHAR DEFAULT NULL,
    p_error_category VARCHAR DEFAULT NULL,
    p_failure_message TEXT DEFAULT NULL,
    p_max_retries INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_msg public.scheduled_messages%ROWTYPE;
    v_new_status VARCHAR;
    v_retry_count INT;
    v_next_scheduled TIMESTAMPTZ;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_msg
    FROM public.scheduled_messages
    WHERE id = p_message_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_msg.id IS NULL THEN
        RAISE EXCEPTION 'MESSAGE_NOT_FOUND' USING ERRCODE = '42501';
    END IF;

    v_retry_count := v_msg.retry_count;

    IF p_status = 'SUCCESS' THEN
        v_new_status := 'SENT';
        UPDATE public.scheduled_messages
        SET status = 'SENT',
            recipient_snapshot = coalesce(p_recipient_snapshot, v_msg.recipient_snapshot, v_msg.recipient),
            provider_message_id = p_provider_response_id,
            sent_at = NOW(),
            claimed_at = NULL,
            claimed_by = NULL,
            updated_at = NOW()
        WHERE id = v_msg.id;

        INSERT INTO public.message_delivery_logs (
            tenant_id, scheduled_message_id, attempted_at, channel, provider, status, provider_response_id
        ) VALUES (
            p_tenant_id, v_msg.id, NOW(), v_msg.channel, p_provider, 'SUCCESS', p_provider_response_id
        );

    ELSIF p_status = 'SKIPPED' THEN
        v_new_status := 'SKIPPED';
        UPDATE public.scheduled_messages
        SET status = 'SKIPPED',
            failure_code = p_error_code,
            failure_message = p_failure_message,
            claimed_at = NULL,
            claimed_by = NULL,
            updated_at = NOW()
        WHERE id = v_msg.id;

        INSERT INTO public.message_delivery_logs (
            tenant_id, scheduled_message_id, attempted_at, channel, provider, status, error_code, error_category
        ) VALUES (
            p_tenant_id, v_msg.id, NOW(), v_msg.channel, p_provider, 'SKIPPED', p_error_code, p_error_category
        );

    ELSIF p_status = 'TRANSIENT_ERROR' AND v_retry_count < p_max_retries THEN
        v_retry_count := v_retry_count + 1;
        v_next_scheduled := NOW() + ((power(2, v_retry_count) * 5) || ' minutes')::interval;
        v_new_status := 'SCHEDULED';

        UPDATE public.scheduled_messages
        SET status = 'SCHEDULED',
            retry_count = v_retry_count,
            scheduled_at = v_next_scheduled,
            failure_code = p_error_code,
            failure_message = p_failure_message,
            claimed_at = NULL,
            claimed_by = NULL,
            updated_at = NOW()
        WHERE id = v_msg.id;

        INSERT INTO public.message_delivery_logs (
            tenant_id, scheduled_message_id, attempted_at, channel, provider, status, error_code, error_category
        ) VALUES (
            p_tenant_id, v_msg.id, NOW(), v_msg.channel, p_provider, 'TRANSIENT_ERROR', p_error_code, p_error_category
        );

    ELSE
        v_new_status := 'FAILED';
        UPDATE public.scheduled_messages
        SET status = 'FAILED',
            failure_code = p_error_code,
            failure_message = p_failure_message,
            failed_at = NOW(),
            claimed_at = NULL,
            claimed_by = NULL,
            updated_at = NOW()
        WHERE id = v_msg.id;

        INSERT INTO public.message_delivery_logs (
            tenant_id, scheduled_message_id, attempted_at, channel, provider, status, error_code, error_category
        ) VALUES (
            p_tenant_id, v_msg.id, NOW(), v_msg.channel, p_provider, 'PERMANENT_ERROR', p_error_code, p_error_category
        );
    END IF;

    RETURN jsonb_build_object(
        'message_id', v_msg.id,
        'status', v_new_status,
        'retry_count', v_retry_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_message_delivery_result_atomic(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_message_delivery_result_atomic(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.record_message_delivery_result_atomic(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_message_delivery_result_atomic(UUID, UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, INTEGER) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. accept_extension_offer_atomic: oturum + rol, kayit aranmadan ONCE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_extension_offer_atomic(
    p_tenant_id UUID,
    p_offer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_offer public.extension_offers%ROWTYPE;
    v_booking public.bookings%ROWTYPE;
    v_new_checkout DATE;
    v_conflict_count INT;
BEGIN
    -- Yetki, satir kilidinden ONCE (phase25/29 kalibi). Izinli roller
    -- bookings UPDATE politikasiyla ayni: teklif kabulu rezervasyon yazar.
    IF auth.role() IS DISTINCT FROM 'service_role' AND (
         auth.uid() IS NULL
         OR COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner', 'admin', 'manager', 'staff')
       ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED_EXTENSION_ACCEPT' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_offer
    FROM public.extension_offers
    WHERE id = p_offer_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_offer.id IS NULL THEN
        RAISE EXCEPTION 'OFFER_NOT_FOUND: Uzatma teklifi bulunamadı' USING ERRCODE = '42501';
    END IF;

    IF v_offer.status != 'OFFERED' THEN
        RAISE EXCEPTION 'OFFER_INACTIVE: Bu teklif artık geçerli değil (Durum: %)', v_offer.status USING ERRCODE = '42501';
    END IF;

    IF v_offer.expires_at < NOW() THEN
        UPDATE public.extension_offers SET status = 'EXPIRED', updated_at = NOW() WHERE id = v_offer.id;
        RAISE EXCEPTION 'OFFER_EXPIRED: Uzatma teklifinin süresi dolmuş' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = v_offer.booking_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_booking.id IS NULL OR v_booking.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'BOOKING_INVALID: Rezervasyon bulunamadı veya iptal edilmiş' USING ERRCODE = '42501';
    END IF;

    IF v_booking.check_out != v_offer.target_date THEN
        UPDATE public.extension_offers SET status = 'REVOKED', updated_at = NOW() WHERE id = v_offer.id;
        RAISE EXCEPTION 'DATES_CHANGED: Rezervasyon çıkış tarihi değiştiği için teklif geçersiz kaldı' USING ERRCODE = '42501';
    END IF;

    v_new_checkout := v_offer.target_date + INTERVAL '1 day';

    SELECT count(*) INTO v_conflict_count
    FROM public.bookings
    WHERE property_id = v_offer.property_id
      AND id != v_booking.id
      AND status != 'CANCELLED'
      AND daterange(check_in, check_out, '[)') && daterange(v_offer.target_date, v_new_checkout, '[)');

    IF v_conflict_count > 0 THEN
        UPDATE public.extension_offers SET status = 'REVOKED', updated_at = NOW() WHERE id = v_offer.id;
        RAISE EXCEPTION 'OVERBOOKING_PREVENTED: Sonraki gece için başka bir rezervasyon bulunmaktadır' USING ERRCODE = '42501';
    END IF;

    UPDATE public.bookings
    SET check_out = v_new_checkout,
        gross_amount = round(gross_amount + v_offer.offered_price, 2),
        net_room_revenue = round(net_room_revenue + v_offer.offered_price, 2),
        updated_at = NOW()
    WHERE id = v_booking.id;

    UPDATE public.extension_offers
    SET status = 'ACCEPTED',
        accepted_at = NOW(),
        updated_at = NOW()
    WHERE id = v_offer.id;

    RETURN jsonb_build_object(
        'success', true,
        'offer_id', v_offer.id,
        'booking_id', v_booking.id,
        'new_checkout', v_new_checkout,
        'added_amount', v_offer.offered_price
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_extension_offer_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_extension_offer_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_extension_offer_atomic(UUID, UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3a. phase10 tablolari: okuma uyelere, yazma role gore
-- -----------------------------------------------------------------------------
-- Ayarlar ve sablonlar: owner/admin/manager yazar.
DO $pol$
DECLARE
    t TEXT;
    old_name TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['property_guest_settings', 'message_templates', 'message_automation_rules'] LOOP
        old_name := CASE t
            WHEN 'property_guest_settings' THEN 'prop_guest_settings_tenant_all'
            WHEN 'message_templates' THEN 'message_templates_tenant_all'
            ELSE 'message_rules_tenant_all'
        END;
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_name, t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);

        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id))', t || '_select', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
            WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))$f$, t || '_insert', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
            USING (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))
            WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))$f$, t || '_update', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
            USING (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))$f$, t || '_delete', t);
    END LOOP;
END
$pol$;

-- Operasyonel kayitlar: staff da yazar (bookings ile ayni), silme yonetimde.
DO $pol$
DECLARE
    t TEXT;
    old_name TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['scheduled_messages', 'extension_offers'] LOOP
        old_name := t || '_tenant_all';
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_name, t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);

        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id))', t || '_select', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
            WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager', 'staff'))$f$, t || '_insert', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
            USING (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager', 'staff'))
            WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager', 'staff'))$f$, t || '_update', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
            USING (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))$f$, t || '_delete', t);
    END LOOP;
END
$pol$;

-- Teslim kayitlari denetim kanitidir: istemci yalniz okur. Yazan tek yol
-- record_message_delivery_result_atomic (service_role).
DROP POLICY IF EXISTS delivery_logs_tenant_all ON public.message_delivery_logs;
DROP POLICY IF EXISTS message_delivery_logs_select ON public.message_delivery_logs;
CREATE POLICY message_delivery_logs_select ON public.message_delivery_logs
    FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- -----------------------------------------------------------------------------
-- 3b. phase12 tablolari
-- -----------------------------------------------------------------------------
-- Yonetici uyarilari ve kurulum durumu: okuma uyelere, yazma yonetime.
DO $pol$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['executive_alerts', 'tenant_onboarding'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_isolation_' || t, t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);

        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id))', t || '_select', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
            WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))$f$, t || '_insert', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
            USING (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))
            WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))$f$, t || '_update', t);
        EXECUTE format($f$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
            USING (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin'))$f$, t || '_delete', t);
    END LOOP;
END
$pol$;

-- Kisisel bildirimler: kullanici yalniz KENDI bildirimini gorur/degistirir.
-- user_id NULL olan (isletme geneli) bildirimleri uyeler gorur; durumunu
-- herkes adina degistirmek yonetimin isidir.
DROP POLICY IF EXISTS tenant_isolation_user_notifications ON public.user_notifications;
DROP POLICY IF EXISTS user_notifications_select ON public.user_notifications;
DROP POLICY IF EXISTS user_notifications_insert ON public.user_notifications;
DROP POLICY IF EXISTS user_notifications_update ON public.user_notifications;
DROP POLICY IF EXISTS user_notifications_delete ON public.user_notifications;

CREATE POLICY user_notifications_select ON public.user_notifications
    FOR SELECT TO authenticated
    USING (public.is_tenant_member(tenant_id) AND (user_id = auth.uid() OR user_id IS NULL));

CREATE POLICY user_notifications_insert ON public.user_notifications
    FOR INSERT TO authenticated
    WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'));

CREATE POLICY user_notifications_update ON public.user_notifications
    FOR UPDATE TO authenticated
    USING (
        public.is_tenant_member(tenant_id) AND (
            user_id = auth.uid()
            OR (user_id IS NULL AND COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))
        )
    )
    WITH CHECK (
        public.is_tenant_member(tenant_id) AND (
            user_id = auth.uid()
            OR (user_id IS NULL AND COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))
        )
    );

CREATE POLICY user_notifications_delete ON public.user_notifications
    FOR DELETE TO authenticated
    USING (
        public.is_tenant_member(tenant_id) AND (
            user_id = auth.uid()
            OR (user_id IS NULL AND COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'))
        )
    );

-- -----------------------------------------------------------------------------
-- 3c. Bildirim/uyari RPC'leri ayni kurala (phase29 + phase39 korunur)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_notification_atomic(
  p_notification_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_owner_id  UUID;
  v_rows      INT;
BEGIN
  -- Yetki, satir kilidinden ONCE. "Bulunamadi" ile "yetkisiz" ayni hataya
  -- dusurulur; varlik oraculu boyle kapanir. (phase29)
  SELECT tenant_id, user_id INTO v_tenant_id, v_owner_id
  FROM public.user_notifications
  WHERE id = p_notification_id;

  IF NOT FOUND
     OR (
       auth.role() IS DISTINCT FROM 'service_role'
       AND NOT (
         EXISTS (
           SELECT 1 FROM public.tenant_members
           WHERE tenant_id = v_tenant_id AND user_id = auth.uid()
         )
         AND (
           v_owner_id = auth.uid()
           OR (v_owner_id IS NULL
               AND COALESCE(public.get_tenant_role(v_tenant_id), '') IN ('owner', 'admin', 'manager'))
         )
       )
     ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_NOTIFICATION_ACK' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_notifications
  SET status = 'ACKNOWLEDGED',
      acknowledged_at = NOW()
  WHERE id = p_notification_id;

  -- phase39: yukaridaki SELECT ile bu UPDATE arasinda kilit yok. Satir o
  -- aralikta silindiyse 0 satir etkilenir; `success: true` demek yalan olur.
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'id', p_notification_id,
      'error', 'NOTIFICATION_GONE'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_notification_id, 'status', 'ACKNOWLEDGED');
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_notification_atomic(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acknowledge_notification_atomic(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_notification_atomic(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_executive_alert_atomic(
  p_alert_id UUID,
  p_resolved_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_user      UUID;
  v_rows      INT;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.executive_alerts
  WHERE id = p_alert_id;

  IF NOT FOUND
     OR (
       auth.role() IS DISTINCT FROM 'service_role'
       AND COALESCE(public.get_tenant_role(v_tenant_id), '') NOT IN ('owner', 'admin', 'manager')
     ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ALERT_RESOLVE' USING ERRCODE = '42501';
  END IF;

  -- p_resolved_by CAGIRANDAN gelen bir degerdir; "kim cozdu" denetim izini
  -- cagiranin yazmasina izin verilmez. auth.uid() varsa o kullanilir. (phase29)
  v_user := COALESCE(auth.uid(), p_resolved_by);

  UPDATE public.executive_alerts
  SET status = 'RESOLVED',
      resolved_at = NOW(),
      resolved_by = v_user,
      updated_at = NOW()
  WHERE id = p_alert_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'id', p_alert_id,
      'error', 'ALERT_GONE'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_alert_id, 'status', 'RESOLVED');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_executive_alert_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_executive_alert_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_executive_alert_atomic(UUID, UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. delete_booking_atomic: RLS "Managers delete bookings" ile ayni roller
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_booking_atomic(p_booking_id UUID, p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id       UUID;
    v_user_role     TEXT;
    v_booking       RECORD;
    v_removed_tasks INT := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_user_role
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_TENANT: Belirtilen işletmeye erişim yetkiniz bulunmuyor.'
            USING ERRCODE = '42501';
    END IF;

    IF v_user_role NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Rezervasyon silme yetkiniz bulunmuyor.'
            USING ERRCODE = '42501';
    END IF;

    -- Rezervasyon gercekten bu isletmeye mi ait?
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id AND tenant_id = p_tenant_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadı veya bu işletmeye ait değil.'
            USING ERRCODE = 'P0002';
    END IF;

    -- Odenmemis temizlik gorevlerini sil. Odenmis olanlara DOKUNULMAZ; onlarin
    -- booking_id'si FK sayesinde (ON DELETE SET NULL) kendiliginden bosalir ve
    -- odeme gecmisi korunur.
    WITH silinen AS (
        DELETE FROM public.cleaning_tasks
        WHERE booking_id = p_booking_id
          AND tenant_id = p_tenant_id
          AND is_paid = FALSE
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_removed_tasks FROM silinen;

    -- Rezervasyonu sil. Kapanmis donem korumasi burada devreye girerse
    -- EXCEPTION firlar ve yukaridaki temizlik silme de GERI ALINIR.
    DELETE FROM public.bookings
    WHERE id = p_booking_id AND tenant_id = p_tenant_id;

    RETURN json_build_object(
        'deleted', TRUE,
        'booking_id', p_booking_id,
        'removed_cleaning_tasks', v_removed_tasks
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_booking_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_booking_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_booking_atomic(UUID, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. tenant_id degismezligi: sutunu olan HER tabloya
-- -----------------------------------------------------------------------------
DO $trg$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND NOT EXISTS (
              SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = c.oid AND t.tgname = 'trg_tenant_id_immutable'
          )
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_tenant_id_immutable BEFORE UPDATE OF tenant_id ON public.%I '
            'FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable()',
            r.relname
        );
    END LOOP;
END
$trg$;

-- -----------------------------------------------------------------------------
-- 6. anon: public semasinda tablo/gorunum/dizi yetkisi yok
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
-- Bu gocu calistiran rolun ileride acacagi nesneler icin varsayilan.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- -----------------------------------------------------------------------------
-- 7. create_tenant_and_owner: uyeligi olan kullanici yeni isletme acmaz
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_tenant_and_owner(p_company_name TEXT, p_full_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_email TEXT;
    v_tenant_id UUID;
    v_slug TEXT;
BEGIN
    -- 1. Authenticated session zorunlu
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılmamış! Lütfen önce giriş yapın.';
    END IF;

    -- 2. Ayni kullanici icin eszamanli cagrilar siraya girer; ikincisi
    --    birincinin yarattigi uyeligi gorur.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('create_tenant_and_owner:' || v_user_id::text, 0)
    );

    -- 3. Uyeligi olan kullanici yeni isletme acmaz. Giriste gecici bir okuma
    --    hatasi "hic isletmesi yok" sanilirsa ikinci, bos bir isletme
    --    dogmamali.
    IF EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = v_user_id) THEN
        RAISE EXCEPTION 'MEMBERSHIP_EXISTS: Bu hesap zaten bir işletmeye bağlı; yeni işletme açılmadı.'
            USING ERRCODE = '23505';
    END IF;

    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    -- 4. Profile bağla / güncelle
    INSERT INTO public.profiles (id, full_name)
    VALUES (v_user_id, COALESCE(p_full_name, split_part(v_user_email, '@', 1)))
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        updated_at = NOW();

    -- 5. Tenant oluştur
    v_slug := lower(regexp_replace(p_company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(v_user_id::text, 1, 6);

    INSERT INTO public.tenants (name, slug, created_by)
    VALUES (p_company_name, v_slug, v_user_id)
    RETURNING id INTO v_tenant_id;

    -- 6. tenant_members (owner) oluştur
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (v_tenant_id, v_user_id, 'owner')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    -- 7. Denetim kaydı ekle
    INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tenant_id, v_user_id, 'CREATE_TENANT', 'tenant', v_tenant_id, jsonb_build_object(
        'name', p_company_name,
        'slug', v_slug,
        'role', 'owner'
    ));

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'tenant_name', p_company_name,
        'tenant_slug', v_slug,
        'role', 'owner'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_and_owner(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_and_owner(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_and_owner(TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. schema_migrations: RLS acik, politika yok
-- -----------------------------------------------------------------------------
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- DOGRULAMA — basarisizsa goc COMMIT edilmez.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_def   TEXT;
    v_list  TEXT;
    v_authz INT;
    v_lock  INT;
    v_fn    TEXT;
BEGIN
    -- 1) Worker RPC'leri
    FOREACH v_fn IN ARRAY ARRAY[
        'public.claim_scheduled_messages_atomic(uuid, character varying, integer, integer)',
        'public.record_message_delivery_result_atomic(uuid, uuid, character varying, character varying, character varying, character varying, character varying, character varying, text, integer)'
    ] LOOP
        IF strpos(pg_get_functiondef(v_fn::regprocedure), 'SERVICE_ROLE_REQUIRED') = 0 THEN
            RAISE EXCEPTION 'PHASE41_WORKER_GATE_MISSING: %', v_fn;
        END IF;
        IF has_function_privilege('authenticated', v_fn, 'EXECUTE') OR has_function_privilege('anon', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'PHASE41_WORKER_RPC_STILL_CLIENT_EXECUTABLE: %', v_fn;
        END IF;
        IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'PHASE41_WORKER_RPC_SERVICE_ROLE_LOST: %', v_fn;
        END IF;
    END LOOP;

    -- 2) Teklif kabulu: rol kontrolu kilitten once
    v_def := pg_get_functiondef('public.accept_extension_offer_atomic(uuid, uuid)'::regprocedure);
    v_authz := strpos(v_def, 'UNAUTHORIZED_EXTENSION_ACCEPT');
    v_lock  := strpos(v_def, 'FOR UPDATE');
    IF v_authz = 0 OR v_lock < v_authz THEN
        RAISE EXCEPTION 'PHASE41_EXTENSION_AUTHZ_ORDER (authz=%, lock=%)', v_authz, v_lock;
    END IF;
    IF strpos(v_def, 'COALESCE(public.get_tenant_role(p_tenant_id), '''')') = 0 THEN
        RAISE EXCEPTION 'PHASE41_EXTENSION_NULL_ROLE_GUARD_MISSING';
    END IF;
    IF has_function_privilege('anon', 'public.accept_extension_offer_atomic(uuid, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE41_EXTENSION_ANON_EXECUTABLE';
    END IF;

    -- 3) FOR ALL uyelik politikalari kalmadi; her tabloda rol bazli yazma var
    SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_list
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('property_guest_settings', 'message_templates', 'message_automation_rules',
                        'scheduled_messages', 'message_delivery_logs', 'extension_offers',
                        'executive_alerts', 'user_notifications', 'tenant_onboarding')
      AND (cmd = 'ALL' OR roles::text NOT LIKE '%authenticated%');
    IF v_list IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE41_BROAD_POLICY_REMAINS: %', v_list;
    END IF;

    SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_list
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('property_guest_settings', 'message_templates', 'message_automation_rules',
                        'scheduled_messages', 'extension_offers', 'executive_alerts', 'tenant_onboarding')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND COALESCE(qual, '') || COALESCE(with_check, '') NOT LIKE '%get_tenant_role%';
    IF v_list IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE41_WRITE_POLICY_WITHOUT_ROLE: %', v_list;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
               AND tablename = 'message_delivery_logs' AND cmd <> 'SELECT') THEN
        RAISE EXCEPTION 'PHASE41_DELIVERY_LOGS_CLIENT_WRITABLE';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'user_notifications' AND cmd = 'SELECT'
                   AND qual LIKE '%auth.uid()%') THEN
        RAISE EXCEPTION 'PHASE41_NOTIFICATIONS_NOT_PERSONAL';
    END IF;

    -- 3c) Bildirim/uyari RPC'leri: phase29 + phase39 kazanimlari yerinde
    v_def := pg_get_functiondef('public.acknowledge_notification_atomic(uuid)'::regprocedure);
    v_authz := strpos(v_def, 'UNAUTHORIZED_NOTIFICATION_ACK');
    v_lock  := strpos(v_def, 'FOR UPDATE');
    IF v_authz = 0 OR (v_lock <> 0 AND v_lock < v_authz)
       OR strpos(v_def, 'ROW_COUNT') = 0 OR strpos(v_def, 'NOTIFICATION_GONE') = 0
       OR strpos(v_def, 'NOTIFICATION_NOT_FOUND') > 0
       OR strpos(v_def, 'v_owner_id = auth.uid()') = 0 THEN
        RAISE EXCEPTION 'PHASE41_NOTIFICATION_RPC_CONTRACT';
    END IF;
    v_def := pg_get_functiondef('public.resolve_executive_alert_atomic(uuid, uuid)'::regprocedure);
    v_authz := strpos(v_def, 'UNAUTHORIZED_ALERT_RESOLVE');
    v_lock  := strpos(v_def, 'FOR UPDATE');
    IF v_authz = 0 OR (v_lock <> 0 AND v_lock < v_authz)
       OR strpos(v_def, 'ROW_COUNT') = 0 OR strpos(v_def, 'ALERT_GONE') = 0
       OR strpos(v_def, 'ALERT_NOT_FOUND') > 0
       OR strpos(v_def, 'COALESCE(auth.uid(), p_resolved_by)') = 0
       OR strpos(v_def, 'COALESCE(public.get_tenant_role(v_tenant_id), '''')') = 0 THEN
        RAISE EXCEPTION 'PHASE41_ALERT_RPC_CONTRACT';
    END IF;
    IF has_function_privilege('anon', 'public.acknowledge_notification_atomic(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.resolve_executive_alert_atomic(uuid, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE41_NOTIFICATION_RPC_ANON_EXECUTABLE';
    END IF;

    -- 4) Rezervasyon silme rolu
    v_def := pg_get_functiondef('public.delete_booking_atomic(uuid, uuid)'::regprocedure);
    IF strpos(v_def, 'v_user_role NOT IN (''owner'', ''admin'', ''manager'')') = 0 THEN
        RAISE EXCEPTION 'PHASE41_DELETE_BOOKING_ROLE_GATE_MISSING';
    END IF;

    -- 5) tenant_id degismezligi: eksik tablo kalmadi
    SELECT string_agg(c.relname, ', ') INTO v_list
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = 'trg_tenant_id_immutable');
    IF v_list IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE41_TENANT_ID_TRIGGER_MISSING: %', v_list;
    END IF;

    -- 6) anon'un hicbir tablo yetkisi kalmadi
    SELECT string_agg(c.relname, ', ') INTO v_list
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
      AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE'));
    IF v_list IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE41_ANON_TABLE_PRIVILEGE_REMAINS: %', v_list;
    END IF;

    -- 7) Ikinci isletme kapisi
    v_def := pg_get_functiondef('public.create_tenant_and_owner(text, text)'::regprocedure);
    IF strpos(v_def, 'MEMBERSHIP_EXISTS') = 0 OR strpos(v_def, 'pg_advisory_xact_lock') = 0 THEN
        RAISE EXCEPTION 'PHASE41_SECOND_TENANT_GATE_MISSING';
    END IF;
    IF strpos(v_def, 'MEMBERSHIP_EXISTS') > strpos(v_def, 'INSERT INTO public.tenants') THEN
        RAISE EXCEPTION 'PHASE41_SECOND_TENANT_GATE_AFTER_INSERT';
    END IF;

    -- 8) schema_migrations RLS
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.schema_migrations'::regclass) THEN
        RAISE EXCEPTION 'PHASE41_SCHEMA_MIGRATIONS_RLS_OFF';
    END IF;

    RAISE NOTICE 'PHASE 41 OK — rol ve kiraci yetkileri sikilastirildi.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (41, 'phase41_role_authz_hardening')
ON CONFLICT (version) DO NOTHING;

COMMIT;
