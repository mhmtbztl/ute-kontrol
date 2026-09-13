-- =============================================================================
-- PHASE 21: ISLETME VERISINI SIFIRLAMA
-- =============================================================================
-- SORUN:
--   "Sıfırla" tusu bulut hesabinda HICBIR SEY yapmiyordu. cleanResetAll()
--   yalnizca bir uyari kutusu gosterip cikiyordu:
--     "Bu islem bulut hesabinizdaki kayitlari silmez."
--   Musteri deneme verisini temizleyip temiz baslangic yapamiyor, kayitlari
--   tek tek silmek zorunda kaliyordu. Kapanmis bir donem varsa tek tek silmek
--   de mumkun degildi.
--
-- COZUM:
--   reset_tenant_data() — tek transaction, isletme sahibine ozel, yazili
--   onay zorunlu. Isletmenin TUM operasyonel verisini siler; isletmenin
--   kendisi, ekip uyeleri ve uyelikler KALIR. Yani hesap kapanmaz, sadece
--   defterler bosalir.
--
--   Silme sirasinda kapanmis donem ve degistirilemezlik korumalari devre disi
--   kalir: bu bilincli, onaylanmis, butunsel bir sifirlamadir; yarim kalmasi
--   kismi veriyle daha kotu bir duruma yol acardi. Ayni istisna hesap
--   silmede de var (fn_tenant_is_being_deleted).
--
-- CALISTIRMA: Supabase Dashboard -> SQL Editor -> tamamini yapistir -> Run
-- Idempotenttir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sifirlama sirasinda korumalari askiya alan bayrak
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tenant_reset_in_progress()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    SELECT COALESCE(current_setting('lexbnb.tenant_reset', TRUE), '') = 'on';
$fn$;

REVOKE ALL ON FUNCTION public.fn_tenant_reset_in_progress() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_tenant_reset_in_progress() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_tenant_reset_in_progress() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Bes engelleyici korumaya sifirlama istisnasi
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_booking_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF public.fn_tenant_reset_in_progress() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.check_in           IS NOT DISTINCT FROM NEW.check_in
           AND OLD.check_out      IS NOT DISTINCT FROM NEW.check_out
           AND OLD.gross_amount   IS NOT DISTINCT FROM NEW.gross_amount
           AND OLD.ota_commission IS NOT DISTINCT FROM NEW.ota_commission
           AND OLD.cleaning_fee   IS NOT DISTINCT FROM NEW.cleaning_fee
           AND OLD.discount       IS NOT DISTINCT FROM NEW.discount
           AND OLD.status         IS NOT DISTINCT FROM NEW.status
           AND OLD.property_id    IS NOT DISTINCT FROM NEW.property_id THEN
            RETURN NEW;
        END IF;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF public.fn_range_touches_closed_period(OLD.tenant_id, OLD.check_in, OLD.check_out - 1) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu rezervasyonun konakladigi donem (% baslangicli) kapatilmistir. Kayit degistirilemez veya silinemez.',
                to_char(OLD.check_in, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF public.fn_range_touches_closed_period(NEW.tenant_id, NEW.check_in, NEW.check_out - 1) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Konaklama kapatilmis bir doneme (% baslangicli) denk geliyor. Kayit olusturulamaz veya buraya tasinamaz.',
                to_char(NEW.check_in, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.guard_expense_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF public.fn_tenant_reset_in_progress() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF public.fn_range_touches_closed_period(OLD.tenant_id, OLD.expense_date, OLD.expense_date) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu gider kapatilmis bir doneme (%) ait. Degistirilemez veya silinemez.',
                to_char(OLD.expense_date, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF public.fn_range_touches_closed_period(NEW.tenant_id, NEW.expense_date, NEW.expense_date) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu donem (%) kapatilmistir. Gider ekleme veya buraya tasima yapilamaz.',
                to_char(NEW.expense_date, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.guard_monthly_close_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_jwt_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
    v_flag     TEXT := COALESCE(current_setting('lexbnb.close_rpc', TRUE), '');
BEGIN
    IF v_flag = 'on' OR public.fn_tenant_reset_in_progress() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF v_jwt_role IN ('', 'service_role') THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'IMMUTABILITY_BREACH: Ay kapanis kaydi silinemez. Donemi yeniden acmak icin reopen_monthly_period_atomic kullanin (denetim izi korunur).'
            USING ERRCODE = '42501';
    END IF;

    RAISE EXCEPTION 'IMMUTABILITY_BREACH: Ay kapanis kaydi dogrudan degistirilemez. close_monthly_period_atomic / reopen_monthly_period_atomic kullanin.'
        USING ERRCODE = '42501';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.guard_quote_accepted_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF public.fn_tenant_reset_in_progress() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF OLD.status = 'ACCEPTED' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'IMMUTABILITY_BREACH: Kabul edilmiş fiyat teklifi silinemez' USING ERRCODE = '42501';
        END IF;
        IF NEW.status != 'ACCEPTED' OR NEW.quoted_total != OLD.quoted_total THEN
            RAISE EXCEPTION 'IMMUTABILITY_BREACH: Kabul edilmiş fiyat teklifinin içeriği değiştirilemez' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.guard_scheduled_message_sent_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF public.fn_tenant_reset_in_progress() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
            RETURN OLD;
        END IF;

        IF OLD.status = 'SENT' THEN
            RAISE EXCEPTION 'IMMUTABILITY_BREACH: Gönderilmiş mesaj silinemez (Audit Trail)' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'SENT' THEN
            IF NEW.status != 'SENT' OR NEW.rendered_body != OLD.rendered_body OR NEW.recipient_snapshot != OLD.recipient_snapshot THEN
                RAISE EXCEPTION 'IMMUTABILITY_BREACH: Gönderilmiş mesajın içeriği veya durumu değiştirilemez' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 3. Sifirlama
-- -----------------------------------------------------------------------------
-- Isletmenin TUM operasyonel verisini siler. KALANLAR:
--   tenants          — isletmenin kendisi
--   tenant_members   — ekip ve roller
--   tenant_migrations— tek seferlik aktarim izleri
-- Yani hesap acik kalir, ekip yerinde durur; yalnizca defterler bosalir.
CREATE OR REPLACE FUNCTION public.reset_tenant_data(
    p_tenant_id UUID,
    p_confirm   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_user_id  UUID := auth.uid();
    v_jwt_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
    v_role     TEXT;
    v_sayim    JSONB;
    v_tablo    TEXT;
    v_silinen  BIGINT;
    v_toplam   BIGINT := 0;
    -- Silme sirasi: cocuklar once. Kalanlari FK cascade halleder.
    v_tablolar TEXT[] := ARRAY[
        'operation_evidence', 'operations_audit_logs', 'operational_tasks',
        'recurring_task_rules', 'property_checklist_templates',
        'message_delivery_logs', 'scheduled_messages', 'message_automation_rules',
        'message_templates', 'property_guest_settings',
        'extension_offers', 'booking_quotes',
        'rate_change_logs', 'pricing_events', 'pricing_overrides',
        'pricing_rules', 'pricing_profiles', 'daily_rates',
        'cleaning_tasks', 'maintenance_tickets',
        'expenses', 'bookings', 'guests', 'leads',
        'monthly_financial_closes', 'monthly_targets', 'finance_import_batches',
        'executive_alerts', 'user_notifications', 'audit_logs',
        'tenant_invitations', 'tenant_onboarding',
        'properties'
    ];
BEGIN
    IF v_user_id IS NULL AND v_jwt_role <> 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;

    IF v_jwt_role <> 'service_role' THEN
        SELECT role INTO v_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

        IF v_role IS NULL OR v_role <> 'owner' THEN
            RAISE EXCEPTION 'UNAUTHORIZED: İşletme verisini yalnızca işletme sahibi sıfırlayabilir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF COALESCE(btrim(p_confirm), '') <> 'VERILERI SIFIRLA' THEN
        RAISE EXCEPTION 'CONFIRMATION_REQUIRED: Onaylamak için tam olarak "VERILERI SIFIRLA" yazmalısınız.'
            USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('lexbnb.tenant_reset', 'on', TRUE);

    v_sayim := '{}'::jsonb;
    FOREACH v_tablo IN ARRAY v_tablolar LOOP
        IF to_regclass('public.' || v_tablo) IS NOT NULL THEN
            EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_tablo)
                USING p_tenant_id;
            GET DIAGNOSTICS v_silinen = ROW_COUNT;
            IF v_silinen > 0 THEN
                v_sayim := v_sayim || jsonb_build_object(v_tablo, v_silinen);
                v_toplam := v_toplam + v_silinen;
            END IF;
        END IF;
    END LOOP;

    PERFORM set_config('lexbnb.tenant_reset', 'off', TRUE);

    -- Sifirlamanin kendisi denetim kaydina yazilir (silinen audit_logs'tan sonra).
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
        BEGIN
            INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, details)
            VALUES (p_tenant_id, v_user_id, 'TENANT_DATA_RESET', 'tenant',
                    jsonb_build_object('deleted', v_sayim, 'total', v_toplam, 'at', NOW()));
        EXCEPTION WHEN OTHERS THEN
            -- audit_logs semasi farkliysa sifirlama yine de basarili sayilir.
            NULL;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant_id', p_tenant_id,
        'total_deleted', v_toplam,
        'deleted', v_sayim
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.reset_tenant_data(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_tenant_data(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_tenant_data(UUID, TEXT) TO authenticated, service_role;

-- =============================================================================
-- DOGRULAMA
-- =============================================================================
DO $verify$
BEGIN
    IF to_regprocedure('public.reset_tenant_data(UUID, TEXT)') IS NULL THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: reset_tenant_data olusmadi';
    END IF;
    IF to_regprocedure('public.fn_tenant_reset_in_progress()') IS NULL THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: fn_tenant_reset_in_progress olusmadi';
    END IF;
    IF has_function_privilege('anon', 'public.reset_tenant_data(UUID, TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: anon sifirlama cagirabiliyor!';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.reset_tenant_data(UUID, TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: authenticated cagiramiyor!';
    END IF;
    -- Bayrak varsayilan olarak KAPALI olmali; aksi halde tum korumalar acik kalirdi.
    IF public.fn_tenant_reset_in_progress() THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: sifirlama bayragi varsayilan olarak acik!';
    END IF;
    RAISE NOTICE 'DOGRULAMA: OK - reset_tenant_data yerinde, koruma istisnalari tanimli, bayrak kapali.';
END
$verify$;
