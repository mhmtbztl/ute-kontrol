-- =============================================================================
-- PHASE 20: AY KAPANISI BUTUNLUGU
-- =============================================================================
-- 2026-09-13'te CANLI ORTAMDA dogrulanan alti ayri acik. Hepsi tek bir kok
-- nedenden geliyor: kapanis korumasi rezervasyonun yalnizca check_in ayina
-- bakiyordu ve kapanis kaydinin kendisi hic korunmuyordu.
--
--   A) Kapali aydaki rezervasyonun tarihi ACIK bir aya tasinabiliyordu.
--      Canli olcum: Mayis kapatildi -> rezervasyon 05-10'dan 06-10'a tasindi
--      -> IZIN VERILDI. Kapali Mayis'in cirosu 50.000 TL azaldi.
--
--   B) Ayni sey giderler icin de gecerliydi (05-12 -> 06-12 IZIN VERILDI).
--
--   C) Kapanis kaydi dogrudan PostgREST uzerinden status='OPEN' yapilabiliyor
--      ya da tamamen SILINEBILIYORDU. Anlik goruntu (snapshot) ile birlikte
--      kayit yok oluyordu; hicbir iz kalmiyordu. "Degistirilemezlik" garantisi
--      anahtari ustunde birakilmis bir kapiydi.
--
--   D) manager rolu hem kapatabiliyor hem de kapanis kaydini silebiliyordu.
--
--   E) Henuz baslamamis bir ay kapatilabiliyordu (2099-12 kabul edildi).
--      Sonuc: o aya hic rezervasyon girilemez hale geliyor.
--
--   F) Aylari kesen rezervasyon korumayi tamamen deliyordu: Mayis kapaliyken
--      04-28 -> 05-03 rezervasyonu KABUL EDILDI. Gelir gece bazinda dagitildigi
--      icin (USALI accrual) bu, kapali Mayis'a 3 gecelik ciro ekliyordu.
--
-- COZUM:
--   1. Korumalar artik konaklamanin TUM gece araligina bakiyor; hem ESKI hem
--      YENI satir icin. Kapali bir aya deger hicbir yazma gecmez.
--   2. Kapanis kaydi yalnizca RPC uzerinden degisir. Dogrudan INSERT/UPDATE/
--      DELETE tetikleyici tarafindan reddedilir.
--   3. Kapanisi geri acmak artik ayri, gerekce zorunlu, owner/admin'e ozel bir
--      islem: reopen_monthly_period_atomic. Her kapama/acma history_json'a
--      yazilir; anlik goruntu asla silinmez.
--   4. Anlik goruntu artik SUNUCUDA hesaplaniyor. Istemcinin gonderdigi rakam
--      da saklaniyor ve ikisi karsilastiriliyor: uyusmuyorsa kayit isaretleniyor.
--      Bir muhasebe kapanisinin rakamini tarayiciya hesaplatmak kabul edilemez.
--   5. Baslamamis ay kapatilamaz.
--
-- CALISTIRMA: Supabase Dashboard -> SQL Editor -> tamamini yapistir -> Run
-- Idempotenttir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Kapanis kaydina denetim izi alanlari
-- -----------------------------------------------------------------------------
ALTER TABLE public.monthly_financial_closes
    ADD COLUMN IF NOT EXISTS server_snapshot_json  JSONB,
    ADD COLUMN IF NOT EXISTS history_json          JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS reopened_at           TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reopened_by           UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS reopen_reason         TEXT,
    ADD COLUMN IF NOT EXISTS client_matches_server BOOLEAN,
    ADD COLUMN IF NOT EXISTS revenue_delta         NUMERIC(14,2);

-- -----------------------------------------------------------------------------
-- 2. Yardimci: bir tarih araligi kapali bir aya deguyor mu?
-- -----------------------------------------------------------------------------
-- p_start ile p_end_inclusive arasindaki HERHANGI bir gun kapali bir aya
-- dusuyorsa TRUE. Rezervasyonlarda p_end_inclusive = check_out - 1 (son gece).
CREATE OR REPLACE FUNCTION public.fn_range_touches_closed_period(
    p_tenant_id     UUID,
    p_start         DATE,
    p_end_inclusive DATE
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $fn$
    SELECT EXISTS (
        SELECT 1
        FROM public.monthly_financial_closes c
        WHERE c.tenant_id = p_tenant_id
          AND c.status = 'CLOSED'
          AND make_date(c.year, c.month, 1) <= GREATEST(p_start, p_end_inclusive)
          AND (make_date(c.year, c.month, 1) + INTERVAL '1 month - 1 day')::date >= LEAST(p_start, p_end_inclusive)
    );
$fn$;

REVOKE ALL ON FUNCTION public.fn_range_touches_closed_period(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_range_touches_closed_period(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_range_touches_closed_period(UUID, DATE, DATE) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Rezervasyon korumasi: TUM konaklama araligi, hem ESKI hem YENI satir
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_booking_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    -- Isletme siliniyorsa bu cascade'dir, kullanici girisimi degil.
    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    -- Finansal/operasyonel olmayan alan degisikligine (not, misafir adi, telefon)
    -- kapali donemde de izin verilir.
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

    -- ESKI satir: kaydin BULUNDUGU donem kapaliysa oradan cikarilamaz.
    -- (A ve F aciklarini bu blok kapatir.)
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF public.fn_range_touches_closed_period(OLD.tenant_id, OLD.check_in, OLD.check_out - 1) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu rezervasyonun konakladigi donem (% baslangicli) kapatilmistir. Kayit degistirilemez veya silinemez.',
                to_char(OLD.check_in, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- YENI satir: kapali bir aya gece dusuremezsiniz.
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF public.fn_range_touches_closed_period(NEW.tenant_id, NEW.check_in, NEW.check_out - 1) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Konaklama kapatilmis bir doneme (% baslangicli) denk geliyor. Kayit olusturulamaz veya buraya tasinamaz.',
                to_char(NEW.check_in, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_booking_closed_period ON public.bookings;
CREATE TRIGGER trg_guard_booking_closed_period
BEFORE INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.guard_booking_closed_period();

-- -----------------------------------------------------------------------------
-- 4. Gider korumasi: hem ESKI hem YENI tarih
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_expense_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    -- ESKI tarih kapaliysa gider oradan cikarilamaz. (B acigi)
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF public.fn_range_touches_closed_period(OLD.tenant_id, OLD.expense_date, OLD.expense_date) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu gider kapatilmis bir doneme (%) ait. Degistirilemez veya silinemez.',
                to_char(OLD.expense_date, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- YENI tarih kapali bir aya dusemez.
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF public.fn_range_touches_closed_period(NEW.tenant_id, NEW.expense_date, NEW.expense_date) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu donem (%) kapatilmistir. Gider ekleme veya buraya tasima yapilamaz.',
                to_char(NEW.expense_date, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_guard_expense_closed_period ON public.expenses;
CREATE TRIGGER trg_guard_expense_closed_period
BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.guard_expense_closed_period();

-- -----------------------------------------------------------------------------
-- 5. Sunucu tarafi anlik goruntu (USALI gece bazli tahakkuk)
-- -----------------------------------------------------------------------------
-- core/financial_metrics_service.js ile ayni kurali uygular:
--   oda geliri     = (brut - temizlik - indirim) / gece  * o aya dusen geceler
--   temizlik geliri= temizlik / gece                     * o aya dusen geceler
--   ciro           = (brut - indirim) / gece             * o aya dusen geceler
-- Iptal edilen rezervasyonlar haric.
CREATE OR REPLACE FUNCTION public.compute_month_close_snapshot(
    p_tenant_id UUID,
    p_year      INT,
    p_month     INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $fn$
DECLARE
    v_start DATE := make_date(p_year, p_month, 1);
    v_end   DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::date;
    v_sold_nights      BIGINT  := 0;
    v_room_revenue     NUMERIC := 0;
    v_cleaning_revenue NUMERIC := 0;
    v_revenue          NUMERIC := 0;
    v_ota_commission   NUMERIC := 0;
    v_booking_count    BIGINT  := 0;
    v_opex             NUMERIC := 0;
    v_capex            NUMERIC := 0;
    v_available_nights BIGINT  := 0;
BEGIN
    WITH geceler AS (
        SELECT b.id,
               (b.check_out - b.check_in)::numeric AS toplam_gece,
               b.gross_amount, b.cleaning_fee, b.discount, b.ota_commission
        FROM public.bookings b
        CROSS JOIN LATERAL generate_series(b.check_in, b.check_out - 1, INTERVAL '1 day') AS g(gece)
        WHERE b.tenant_id = p_tenant_id
          AND COALESCE(b.status, 'CONFIRMED') <> 'CANCELLED'
          AND b.check_out > b.check_in
          AND g.gece::date BETWEEN v_start AND v_end
    )
    SELECT COUNT(*),
           COUNT(DISTINCT id),
           COALESCE(SUM(GREATEST(0, gross_amount - cleaning_fee - discount) / toplam_gece), 0),
           COALESCE(SUM(cleaning_fee / toplam_gece), 0),
           COALESCE(SUM((gross_amount - discount) / toplam_gece), 0),
           COALESCE(SUM(ota_commission / toplam_gece), 0)
      INTO v_sold_nights, v_booking_count, v_room_revenue,
           v_cleaning_revenue, v_revenue, v_ota_commission
      FROM geceler;

    SELECT COALESCE(SUM(CASE WHEN COALESCE(e.expense_type, 'OPEX') <> 'CAPEX' THEN e.amount ELSE 0 END), 0),
           COALESCE(SUM(CASE WHEN COALESCE(e.expense_type, 'OPEX')  = 'CAPEX' THEN e.amount ELSE 0 END), 0)
      INTO v_opex, v_capex
      FROM public.expenses e
     WHERE e.tenant_id = p_tenant_id
       AND e.expense_date BETWEEN v_start AND v_end;

    -- Musait gece = (ayin gun sayisi) x (mulk sayisi).
    -- NOT: properties tablosunda aktiflik/devreye girme tarihi alani yok; mulk
    -- eklendigi anda gecmise donuk de musait sayiliyor. Alan eklendiginde bu
    -- hesap da guncellenmeli (core/financial_metrics_service.js ayni varsayimi
    -- activationDate ile destekliyor).
    SELECT COALESCE(COUNT(*), 0) * (v_end - v_start + 1)
      INTO v_available_nights
      FROM public.properties p
     WHERE p.tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'schemaVersion', 2,
        'computedBy',    'server',
        'computedAt',    now(),
        'period',        to_char(v_start, 'YYYY-MM'),
        'bookingCount',  v_booking_count,
        'soldNights',    v_sold_nights,
        'availableNights', v_available_nights,
        'revenue',          round(v_revenue, 2),
        'roomRevenue',      round(v_room_revenue, 2),
        'cleaningRevenue',  round(v_cleaning_revenue, 2),
        'otaCommission',    round(v_ota_commission, 2),
        'manualOpex',       round(v_opex, 2),
        'capex',            round(v_capex, 2),
        -- USALI: OTA komisyonu ve temizlik maliyeti gelirden dusulmez, gider yazilir.
        'totalOpex',        round(v_opex + v_ota_commission + v_cleaning_revenue, 2),
        'netProfit',        round(v_revenue - (v_opex + v_ota_commission + v_cleaning_revenue) - v_capex, 2),
        'occupancy',        CASE WHEN v_available_nights > 0
                                 THEN round((v_sold_nights::numeric / v_available_nights) * 100, 2)
                                 ELSE NULL END,
        'adr',              CASE WHEN v_sold_nights > 0
                                 THEN round(v_room_revenue / v_sold_nights, 2) ELSE NULL END,
        'revpar',           CASE WHEN v_available_nights > 0
                                 THEN round(v_room_revenue / v_available_nights, 2) ELSE NULL END
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.compute_month_close_snapshot(UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_month_close_snapshot(UUID, INT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_month_close_snapshot(UUID, INT, INT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Kapanis kaydi degistirilemezligi
-- -----------------------------------------------------------------------------
-- Kapanis kaydi yalnizca RPC uzerinden yazilir. RPC'ler islem suresince
-- lexbnb.close_rpc bayragini kaldirir; tetikleyici bunu arar.
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
    -- RPC icinden geliyorsa serbest.
    IF v_flag = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- Servis anahtari veya dogrudan SQL (JWT yok): bakim/gocler icin serbest.
    IF v_jwt_role IN ('', 'service_role') THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- Isletme siliniyorsa cascade'dir.
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

DROP TRIGGER IF EXISTS trg_guard_monthly_close_write ON public.monthly_financial_closes;
CREATE TRIGGER trg_guard_monthly_close_write
BEFORE INSERT OR UPDATE OR DELETE ON public.monthly_financial_closes
FOR EACH ROW
EXECUTE FUNCTION public.guard_monthly_close_write();

-- -----------------------------------------------------------------------------
-- 7. Ay kapatma (yeniden yazildi)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_monthly_period_atomic(
    p_tenant_id UUID,
    p_year      INT,
    p_month     INT,
    p_snapshot  JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
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

    -- (E acigi) Henuz baslamamis bir ay kapatilamaz.
    IF make_date(p_year, p_month, 1) > CURRENT_DATE THEN
        RAISE EXCEPTION 'FUTURE_PERIOD: Henuz baslamamis bir donem (%) kapatilamaz.',
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
$fn$;

REVOKE ALL ON FUNCTION public.close_monthly_period_atomic(UUID, INT, INT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_monthly_period_atomic(UUID, INT, INT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_monthly_period_atomic(UUID, INT, INT, JSONB) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. Donemi yeniden acma (yeni)
-- -----------------------------------------------------------------------------
-- Muhurlu bir donemi acmak, kapatmaktan daha agir bir karardir:
--   * yalnizca owner / admin
--   * gerekce zorunlu
--   * kayit SILINMEZ, anlik goruntu korunur, history_json'a islenir
CREATE OR REPLACE FUNCTION public.reopen_monthly_period_atomic(
    p_tenant_id UUID,
    p_year      INT,
    p_month     INT,
    p_reason    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_user_id   UUID := auth.uid();
    v_jwt_role  TEXT := COALESCE(auth.jwt() ->> 'role', '');
    v_user_role TEXT;
    v_row       public.monthly_financial_closes%ROWTYPE;
BEGIN
    IF v_user_id IS NULL AND v_jwt_role <> 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis. Lutfen once giris yapin.'
            USING ERRCODE = '28000';
    END IF;

    IF v_jwt_role <> 'service_role' THEN
        SELECT role INTO v_user_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Kapatilmis bir donemi yalnizca isletme sahibi veya yonetici (admin) yeniden acabilir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
        RAISE EXCEPTION 'REASON_REQUIRED: Donemi yeniden acmak icin en az 10 karakterlik bir gerekce yazmalisiniz. Bu gerekce denetim kaydina islenir.'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_row
    FROM public.monthly_financial_closes
    WHERE tenant_id = p_tenant_id AND year = p_year AND month = p_month;

    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Bu donem icin bir kapanis kaydi yok; zaten acik.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_row.status <> 'CLOSED' THEN
        RAISE EXCEPTION 'ALREADY_OPEN: Bu donem (%) zaten acik.',
            to_char(make_date(p_year, p_month, 1), 'YYYY-MM')
            USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('lexbnb.close_rpc', 'on', TRUE);

    UPDATE public.monthly_financial_closes
       SET status = 'OPEN',
           reopened_at = NOW(),
           reopened_by = v_user_id,
           reopen_reason = btrim(p_reason),
           history_json = COALESCE(history_json, '[]'::jsonb)
                          || jsonb_build_object('action', 'REOPENED', 'at', NOW(),
                                                'by', v_user_id, 'reason', btrim(p_reason)),
           updated_at = NOW()
     WHERE id = v_row.id
    RETURNING * INTO v_row;

    PERFORM set_config('lexbnb.close_rpc', 'off', TRUE);

    RETURN jsonb_build_object(
        'success', TRUE,
        'id', v_row.id,
        'year', v_row.year,
        'month', v_row.month,
        'status', v_row.status,
        'reopened_at', v_row.reopened_at,
        'reason', v_row.reopen_reason
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.reopen_monthly_period_atomic(UUID, INT, INT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_monthly_period_atomic(UUID, INT, INT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reopen_monthly_period_atomic(UUID, INT, INT, TEXT) TO authenticated, service_role;

-- =============================================================================
-- DOGRULAMA
-- =============================================================================
DO $verify$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.fn_range_touches_closed_period(UUID, DATE, DATE)',
        'public.compute_month_close_snapshot(UUID, INT, INT)',
        'public.close_monthly_period_atomic(UUID, INT, INT, JSONB)',
        'public.reopen_monthly_period_atomic(UUID, INT, INT, TEXT)',
        'public.guard_monthly_close_write()'
    ] LOOP
        IF to_regprocedure(v_fn) IS NULL THEN
            RAISE EXCEPTION 'DOGRULAMA BASARISIZ: % olusmadi', v_fn;
        END IF;
    END LOOP;

    FOREACH v_fn IN ARRAY ARRAY[
        'public.fn_range_touches_closed_period(UUID, DATE, DATE)',
        'public.compute_month_close_snapshot(UUID, INT, INT)',
        'public.close_monthly_period_atomic(UUID, INT, INT, JSONB)',
        'public.reopen_monthly_period_atomic(UUID, INT, INT, TEXT)'
    ] LOOP
        IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'DOGRULAMA BASARISIZ: anon % cagirabiliyor!', v_fn;
        END IF;
        IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'DOGRULAMA BASARISIZ: authenticated % cagiramiyor!', v_fn;
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_guard_monthly_close_write'
          AND tgrelid = 'public.monthly_financial_closes'::regclass
    ) THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: kapanis degistirilemezlik tetikleyicisi yok';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'monthly_financial_closes'
          AND column_name = 'history_json'
    ) THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: history_json sutunu yok';
    END IF;

    RAISE NOTICE 'DOGRULAMA: OK - kapanis butunlugu yerinde (aralik korumasi, degistirilemezlik, sunucu anlik goruntusu, yeniden acma).';
END
$verify$;
