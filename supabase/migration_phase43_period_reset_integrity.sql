-- =============================================================================
-- LEXBNB PHASE 43 — AY KAPANISI, SIFIRLAMA VE HESAP KAPATMA BUTUNLUGU
-- =============================================================================
--   1. close_monthly_period_atomic: ay BITMEDEN kapatilamaz. "Bugun"
--      Europe/Istanbul takvimine gore hesaplanir (kayitlar o gune yazilir).
--      phase20 yalnizca henuz BASLAMAMIS ayi reddediyordu.
--   2. reset_tenant_data: financial_transactions silme listesine girer (FK
--      RESTRICT sifirlamayi kilitliyordu). Sifirlamanin kendi denetim kaydi,
--      silmeden SONRA ve tablonun gercek sutunlariyla yazilir; hata YUTULMAZ.
--   3. Kapali donem: rezervasyonun kanal, misafir adi, kisi sayilari ve net
--      oda geliri de degismez (kanal raporu geriye donuk degisiyordu).
--      Temizlik gorevleri korumaya girer: tarih, tutar ve mulk degismez,
--      ekleme/silme yapilmaz; odeme durumu degisebilir (odeme sonradan olur).
--   4. Hesap kapatma: silinen kullaniciyi gosteren kolonlar bosalir.
--        - guard_created_by UPDATE'te created_by'i eski degere geri yaziyordu;
--          ON DELETE SET NULL boylece etkisiz kaliyor, satir silinmis
--          kullaniciyi gostermeye devam ediyordu. Artik kullanici gercekten
--          yoksa NULL'a izin verilir. Var olan sarkik degerler temizlenir.
--        - financial_transactions.created_by ve
--          monthly_financial_closes.reopened_by ON DELETE SET NULL olur.
--        - Kapanis kaydi korumasi, yalnizca silinmis kullanicinin kimligini
--          bosaltan guncellemeye izin verir; baska hicbir alan degismez.
--
-- Yeni koruma tetikleyicisi (temizlik) sifirlama ve isletme silme
-- istisnalarini tanimlar (CLAUDE.md 3.7).
--
-- CALISTIRMA: Supabase Dashboard -> SQL Editor -> tamamini yapistir -> Run
-- Idempotenttir. phase41'den SONRA uygulanmalidir.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Ay kapanisi: ay bitmeden kapatilamaz
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_monthly_period_atomic(p_tenant_id UUID, p_year INTEGER, p_month INTEGER, p_snapshot JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id   UUID := auth.uid();
    v_jwt_role  TEXT := COALESCE(auth.jwt() ->> 'role', '');
    v_user_role TEXT;
    v_server    JSONB;
    v_client_rev NUMERIC;
    v_server_rev NUMERIC;
    v_delta     NUMERIC;
    v_matches   BOOLEAN;
    v_row       public.monthly_financial_closes%ROWTYPE;
    v_today     DATE := (NOW() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
    IF v_user_id IS NULL AND v_jwt_role <> 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis. Lutfen once giris yapin.'
            USING ERRCODE = '28000';
    END IF;

    IF v_jwt_role <> 'service_role' THEN
        SELECT role INTO v_user_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'manager') THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Ay kapanisi yapabilmek icin isletme yoneticisi yetkisi gereklidir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_month < 1 OR p_month > 12 THEN
        RAISE EXCEPTION 'INVALID_PERIOD: Ay 1-12 araliginda olmalidir.' USING ERRCODE = '22023';
    END IF;

    -- Ay BITMEDEN kapatilamaz: kalan gunlere kayit girilemez hale gelirdi.
    -- (Henuz baslamamis ay da bu kosula dahildir.)
    IF (make_date(p_year, p_month, 1) + INTERVAL '1 month')::date > v_today THEN
        RAISE EXCEPTION 'PERIOD_NOT_ENDED: % donemi henuz bitmedi; ay sona ermeden kapatilamaz.',
            to_char(make_date(p_year, p_month, 1), 'YYYY-MM')
            USING ERRCODE = '22023';
    END IF;

    -- Sunucu tarafi anlik goruntu: kaydin resmi rakami budur.
    v_server := public.compute_month_close_snapshot(p_tenant_id, p_year, p_month);

    v_server_rev := COALESCE((v_server ->> 'revenue')::numeric, 0);
    v_client_rev := COALESCE(
        NULLIF(p_snapshot #>> '{financial,revenue}', '')::numeric,
        NULLIF(p_snapshot ->> 'revenue', '')::numeric
    );
    v_delta   := CASE WHEN v_client_rev IS NULL THEN NULL ELSE round(v_client_rev - v_server_rev, 2) END;
    v_matches := CASE WHEN v_delta IS NULL THEN NULL ELSE abs(v_delta) < 0.01 END;

    PERFORM set_config('lexbnb.close_rpc', 'on', TRUE);

    INSERT INTO public.monthly_financial_closes (
        tenant_id, year, month, status, closed_at, closed_by,
        snapshot_json, server_snapshot_json, client_matches_server, revenue_delta,
        history_json, updated_at
    ) VALUES (
        p_tenant_id, p_year, p_month, 'CLOSED', NOW(), v_user_id,
        p_snapshot, v_server, v_matches, v_delta,
        jsonb_build_array(jsonb_build_object(
            'action', 'CLOSED', 'at', NOW(), 'by', v_user_id,
            'serverRevenue', v_server_rev, 'clientRevenue', v_client_rev)),
        NOW()
    )
    ON CONFLICT (tenant_id, year, month) DO UPDATE
    SET status = 'CLOSED',
        closed_at = NOW(),
        closed_by = v_user_id,
        snapshot_json = p_snapshot,
        server_snapshot_json = v_server,
        client_matches_server = v_matches,
        revenue_delta = v_delta,
        reopened_at = NULL,
        reopened_by = NULL,
        reopen_reason = NULL,
        history_json = COALESCE(public.monthly_financial_closes.history_json, '[]'::jsonb)
                       || jsonb_build_object('action', 'CLOSED', 'at', NOW(), 'by', v_user_id,
                                             'serverRevenue', v_server_rev, 'clientRevenue', v_client_rev),
        updated_at = NOW()
    RETURNING * INTO v_row;

    PERFORM set_config('lexbnb.close_rpc', 'off', TRUE);

    RETURN jsonb_build_object(
        'success', TRUE,
        'id', v_row.id,
        'tenant_id', v_row.tenant_id,
        'year', v_row.year,
        'month', v_row.month,
        'status', v_row.status,
        'closed_at', v_row.closed_at,
        'server_snapshot', v_server,
        'client_matches_server', v_matches,
        'revenue_delta', v_delta
    );
END;
$$;

REVOKE ALL ON FUNCTION public.close_monthly_period_atomic(UUID, INTEGER, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_monthly_period_atomic(UUID, INTEGER, INTEGER, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_monthly_period_atomic(UUID, INTEGER, INTEGER, JSONB) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Veri sifirlama: financial_transactions + denetim kaydi
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_tenant_data(p_tenant_id UUID, p_confirm TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id  UUID := auth.uid();
    v_jwt_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
    v_role     TEXT;
    v_sayim    JSONB;
    v_tablo    TEXT;
    v_silinen  BIGINT;
    v_toplam   BIGINT := 0;
    -- Silme sirasi: cocuklar once. Kalanlari FK cascade halleder.
    -- financial_transactions bookings ve properties'e RESTRICT ile bagli:
    -- ondan once gelmek zorunda.
    v_tablolar TEXT[] := ARRAY[
        'financial_transactions',
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
        -- phase31 defterleri
        'marketing_campaigns', 'influencer_collabs',
        'housekeeping_status_overrides', 'property_pricing_ladder',
        'property_operator_notes',
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

    -- Sifirlamanin kendi izi: audit_logs yukarida bosaldi, bu kayit ondan
    -- SONRA yazilir ve kalir. Yazilamazsa sifirlama da geri alinir — izsiz
    -- sifirlama olmaz.
    INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (p_tenant_id, v_user_id, 'TENANT_DATA_RESET', 'tenant', p_tenant_id,
            jsonb_build_object('deleted', v_sayim, 'total', v_toplam, 'at', NOW()));

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant_id', p_tenant_id,
        'total_deleted', v_toplam,
        'deleted', v_sayim
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_tenant_data(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_tenant_data(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_tenant_data(UUID, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3a. Kapali donem: rezervasyonun raporlanan alanlari
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_booking_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.fn_tenant_reset_in_progress() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    -- Raporlara giren alanlar degismiyorsa (not, misafir baglantisi, telefon,
    -- created_by bosalmasi) guncelleme serbesttir.
    IF TG_OP = 'UPDATE' THEN
        IF OLD.check_in             IS NOT DISTINCT FROM NEW.check_in
           AND OLD.check_out        IS NOT DISTINCT FROM NEW.check_out
           AND OLD.gross_amount     IS NOT DISTINCT FROM NEW.gross_amount
           AND OLD.ota_commission   IS NOT DISTINCT FROM NEW.ota_commission
           AND OLD.cleaning_fee     IS NOT DISTINCT FROM NEW.cleaning_fee
           AND OLD.discount         IS NOT DISTINCT FROM NEW.discount
           AND OLD.net_room_revenue IS NOT DISTINCT FROM NEW.net_room_revenue
           AND OLD.status           IS NOT DISTINCT FROM NEW.status
           AND OLD.property_id      IS NOT DISTINCT FROM NEW.property_id
           AND OLD.channel          IS NOT DISTINCT FROM NEW.channel
           AND OLD.guest_name       IS NOT DISTINCT FROM NEW.guest_name
           AND OLD.pax              IS NOT DISTINCT FROM NEW.pax
           AND OLD.guest_count      IS NOT DISTINCT FROM NEW.guest_count
           AND OLD.adults           IS NOT DISTINCT FROM NEW.adults
           AND OLD.children         IS NOT DISTINCT FROM NEW.children
           AND OLD.infants          IS NOT DISTINCT FROM NEW.infants THEN
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
$$;

-- -----------------------------------------------------------------------------
-- 3b. Kapali donem: temizlik gorevleri
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_cleaning_task_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Sifirlama ve isletme silme istisnalari (CLAUDE.md 3.7).
    IF public.fn_tenant_reset_in_progress() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    -- Odeme durumu, aciklama, personel adi, rezervasyon baglantisinin
    -- bosalmasi serbest: odeme kapanistan sonra yapilir.
    IF TG_OP = 'UPDATE'
       AND OLD.task_date   IS NOT DISTINCT FROM NEW.task_date
       AND OLD.amount      IS NOT DISTINCT FROM NEW.amount
       AND OLD.property_id IS NOT DISTINCT FROM NEW.property_id THEN
        RETURN NEW;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF public.fn_range_touches_closed_period(OLD.tenant_id, OLD.task_date, OLD.task_date) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu temizlik kapatilmis bir doneme (%) ait. Tarihi, tutari veya mulku degistirilemez; silinemez.',
                to_char(OLD.task_date, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF public.fn_range_touches_closed_period(NEW.tenant_id, NEW.task_date, NEW.task_date) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu donem (%) kapatilmistir. Temizlik eklenemez veya buraya tasinamaz.',
                to_char(NEW.task_date, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_cleaning_task_closed_period() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_cleaning_task_closed_period() FROM anon;

DROP TRIGGER IF EXISTS trg_guard_cleaning_task_closed_period ON public.cleaning_tasks;
CREATE TRIGGER trg_guard_cleaning_task_closed_period
    BEFORE INSERT OR UPDATE OR DELETE ON public.cleaning_tasks
    FOR EACH ROW EXECUTE FUNCTION public.guard_cleaning_task_closed_period();

-- -----------------------------------------------------------------------------
-- 4a. created_by: silinmis kullaniciyi gostermez
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER: auth.users varlik kontrolu icin. Tetikleyici fonksiyonu
-- dogrudan cagrilamaz (donus tipi trigger), yani varlik oraculu olusmaz.
CREATE OR REPLACE FUNCTION public.guard_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  IF TG_OP = 'UPDATE' THEN
    -- ON DELETE SET NULL: kullanici gercekten silindiyse bosalmaya izin ver.
    -- Aksi halde created_by degistirilemez.
    IF NEW.created_by IS NULL AND OLD.created_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.created_by) THEN
      RETURN NEW;
    END IF;
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_created_by() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_created_by() FROM anon;

-- Gider korumasi kapali donemde HER guncellemeyi reddediyordu; created_by'in
-- bosalmasi da buna dahildi. Kapali donemde gider girmis bir kullanici
-- hesabini kapatamazdi. Yalnizca created_by degisiyorsa izin verilir
-- (guard_created_by onu zaten yalnizca silinmis kullanici icin bosaltir).
CREATE OR REPLACE FUNCTION public.guard_expense_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.fn_tenant_reset_in_progress() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'created_by') = (to_jsonb(OLD) - 'created_by') THEN
        RETURN NEW;
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
$$;

-- Daha once silinmis kullanicilari gosteren sarkik degerleri temizle.
DO $dangling$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['bookings', 'cleaning_tasks', 'expenses', 'leads', 'properties'] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format(
                'UPDATE public.%I x SET created_by = NULL
                  WHERE x.created_by IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.created_by)', t);
        END IF;
    END LOOP;
END
$dangling$;

-- -----------------------------------------------------------------------------
-- 4b. financial_transactions.created_by ve kapanis reopened_by: SET NULL
-- -----------------------------------------------------------------------------
ALTER TABLE public.financial_transactions ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_created_by_fkey;
ALTER TABLE public.financial_transactions
    ADD CONSTRAINT financial_transactions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.monthly_financial_closes DROP CONSTRAINT IF EXISTS monthly_financial_closes_reopened_by_fkey;
ALTER TABLE public.monthly_financial_closes
    ADD CONSTRAINT monthly_financial_closes_reopened_by_fkey
    FOREIGN KEY (reopened_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 4c. Kapanis kaydi korumasi: yalnizca silinmis kullanici kimligi bosalabilir
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_monthly_close_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

    -- Hesap kapatma: ON DELETE SET NULL ile gelen guncelleme. Yalnizca
    -- closed_by / reopened_by bosalir, o kullanici gercekten silinmistir ve
    -- baska HICBIR alan degismez. Kimin kapattigi history_json'da kalir.
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - 'closed_by' - 'reopened_by') = (to_jsonb(OLD) - 'closed_by' - 'reopened_by')
       AND (NEW.closed_by IS NOT DISTINCT FROM OLD.closed_by
            OR (NEW.closed_by IS NULL
                AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.closed_by)))
       AND (NEW.reopened_by IS NOT DISTINCT FROM OLD.reopened_by
            OR (NEW.reopened_by IS NULL
                AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.reopened_by))) THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'IMMUTABILITY_BREACH: Ay kapanis kaydi silinemez. Donemi yeniden acmak icin reopen_monthly_period_atomic kullanin (denetim izi korunur).'
            USING ERRCODE = '42501';
    END IF;

    RAISE EXCEPTION 'IMMUTABILITY_BREACH: Ay kapanis kaydi dogrudan degistirilemez. close_monthly_period_atomic / reopen_monthly_period_atomic kullanin.'
        USING ERRCODE = '42501';
END;
$$;

-- -----------------------------------------------------------------------------
-- DOGRULAMA — basarisizsa goc COMMIT edilmez.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_def  TEXT;
    v_list TEXT;
BEGIN
    -- 1) Ay bitmeden kapanis yok
    v_def := pg_get_functiondef('public.close_monthly_period_atomic(uuid, integer, integer, jsonb)'::regprocedure);
    IF strpos(v_def, 'PERIOD_NOT_ENDED') = 0 OR strpos(v_def, 'Europe/Istanbul') = 0 THEN
        RAISE EXCEPTION 'PHASE43_PERIOD_NOT_ENDED_GATE_MISSING';
    END IF;
    IF strpos(v_def, 'PERIOD_NOT_ENDED') > strpos(v_def, 'compute_month_close_snapshot') THEN
        RAISE EXCEPTION 'PHASE43_PERIOD_GATE_AFTER_SNAPSHOT';
    END IF;
    IF has_function_privilege('anon', 'public.close_monthly_period_atomic(uuid, integer, integer, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE43_CLOSE_ANON_EXECUTABLE';
    END IF;

    -- 2) Sifirlama
    v_def := pg_get_functiondef('public.reset_tenant_data(uuid, text)'::regprocedure);
    IF strpos(v_def, '''financial_transactions''') = 0
       OR strpos(v_def, '''financial_transactions''') > strpos(v_def, '''bookings''') THEN
        RAISE EXCEPTION 'PHASE43_RESET_FINANCIAL_TRANSACTIONS_ORDER';
    END IF;
    IF strpos(v_def, 'WHEN OTHERS') > 0 THEN
        RAISE EXCEPTION 'PHASE43_RESET_STILL_SWALLOWS_ERRORS';
    END IF;
    IF strpos(v_def, 'details') > 0 THEN
        RAISE EXCEPTION 'PHASE43_RESET_WRITES_NONEXISTENT_COLUMN';
    END IF;
    IF strpos(v_def, 'TENANT_DATA_RESET') < strpos(v_def, '''lexbnb.tenant_reset'', ''off''') THEN
        RAISE EXCEPTION 'PHASE43_RESET_AUDIT_BEFORE_DELETE';
    END IF;
    IF has_function_privilege('anon', 'public.reset_tenant_data(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE43_RESET_ANON_EXECUTABLE';
    END IF;

    -- 3) Kapali donem korumalari
    v_def := pg_get_functiondef('public.guard_booking_closed_period()'::regprocedure);
    IF strpos(v_def, 'OLD.channel') = 0 OR strpos(v_def, 'OLD.guest_name') = 0 OR strpos(v_def, 'OLD.pax') = 0 THEN
        RAISE EXCEPTION 'PHASE43_BOOKING_GUARD_FIELDS_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.cleaning_tasks'::regclass
                   AND tgname = 'trg_guard_cleaning_task_closed_period' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE43_CLEANING_GUARD_TRIGGER_MISSING';
    END IF;
    v_def := pg_get_functiondef('public.guard_cleaning_task_closed_period()'::regprocedure);
    IF strpos(v_def, 'fn_tenant_reset_in_progress') = 0 OR strpos(v_def, 'fn_tenant_is_being_deleted') = 0 THEN
        RAISE EXCEPTION 'PHASE43_CLEANING_GUARD_RESET_EXEMPTION_MISSING';
    END IF;

    -- 4) Silinmis kullanici
    SELECT string_agg(conrelid::regclass::text || '.' || conname, ', ') INTO v_list
    FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'auth.users'::regclass
      AND connamespace = 'public'::regnamespace AND confdeltype IN ('a', 'r');
    IF v_list IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE43_USER_FK_BLOCKS_ACCOUNT_DELETION: %', v_list;
    END IF;
    v_def := pg_get_functiondef('public.guard_created_by()'::regprocedure);
    IF strpos(v_def, 'auth.users') = 0 THEN
        RAISE EXCEPTION 'PHASE43_CREATED_BY_GUARD_BLOCKS_SET_NULL';
    END IF;
    v_def := pg_get_functiondef('public.guard_monthly_close_write()'::regprocedure);
    IF strpos(v_def, 'IMMUTABILITY_BREACH') = 0 OR strpos(v_def, '''closed_by'' - ''reopened_by''') = 0 THEN
        RAISE EXCEPTION 'PHASE43_CLOSE_GUARD_CONTRACT';
    END IF;

    RAISE NOTICE 'PHASE 43 OK — ay kapanisi, sifirlama ve hesap kapatma butunlugu yerinde.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (43, 'phase43_period_reset_integrity')
ON CONFLICT (version) DO NOTHING;

COMMIT;
