-- =============================================================================
-- LEXBNB PHASE 45 — TEMIZLIK MALIYETI VE ODEME KOMISYONU SOZLESMESI (K-04)
-- =============================================================================
-- Kullanici karari (23-25 Eylul 2026):
--
--   Temizlik gideri "temizlik YAPILDI" aninda dogar ve yapildigi gunun ayina
--   yazilir. Rezervasyon kaydi gider yazmaz; misafir odeyip gelmezse temizlik
--   yapilmaz ve ne gider ne borc olusur. "Odendi" yalniz odeme durumudur.
--
--   Odeme komisyonu (POS / sanal POS kesintisi) rezervasyon basina girilir ve
--   OTA komisyonu gibi gecelere tahakkukla dagitilan bir GIDERDIR; ciroyu
--   azaltmaz.
--
-- Bu goc:
--   1. cleaning_tasks'a durum (PLANNED / DONE / SKIPPED) ve completed_at ekler,
--      gecmis veriyi uydurmadan esler.
--   2. Kapali donem korumasini durum degisimini de kapsayacak sekilde genisletir.
--   3. booking_payment_commissions tablosunu acar. bookings'e SUTUN EKLENMEZ:
--      goc uygulanana kadar rezervasyon kaydini kirardi (CLAUDE.md 3.4).
--   4. Kapanis ve yonetici snapshot'larina yapilmis temizlik maliyetini ve
--      odeme komisyonunu ekler.
--
-- Eski istemciyle uyumludur: eski "Odendi" akisi hala EXP-CLEAN-* gider satiri
-- yazar ve is_paid'i isaretler. Durum tetikleyicisi odenen gorevi DONE yapar;
-- snapshot EXP-CLEAN-* satiri olan gorevi ikinci kez saymaz.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Temizlik gorevi durumu
-- -----------------------------------------------------------------------------
ALTER TABLE public.cleaning_tasks
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PLANNED';
ALTER TABLE public.cleaning_tasks
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Gecmis veri. Odenmis gorev yapilmistir. Iptal edilmis rezervasyonun
-- odenmemis gorevi yapilmamistir. Geri kalani BILINMIYOR ve PLANNED kalir;
-- arayuz "yapildi mi?" diye sorar (3.6: uydurulmaz). completed_at bos kalir:
-- ne zaman yapildigini bilmiyoruz.
UPDATE public.cleaning_tasks SET status = 'DONE'
 WHERE is_paid = TRUE AND status = 'PLANNED';
UPDATE public.cleaning_tasks ct SET status = 'SKIPPED'
  FROM public.bookings b
 WHERE ct.booking_id = b.id AND b.status = 'CANCELLED'
   AND ct.is_paid = FALSE AND ct.status = 'PLANNED';

ALTER TABLE public.cleaning_tasks DROP CONSTRAINT IF EXISTS chk_cleaning_task_status;
ALTER TABLE public.cleaning_tasks ADD CONSTRAINT chk_cleaning_task_status
    CHECK (status IN ('PLANNED', 'DONE', 'SKIPPED'));
-- Odenmis ama yapilmamis temizlik olmaz.
ALTER TABLE public.cleaning_tasks DROP CONSTRAINT IF EXISTS chk_cleaning_task_paid_done;
ALTER TABLE public.cleaning_tasks ADD CONSTRAINT chk_cleaning_task_paid_done
    CHECK (NOT is_paid OR status = 'DONE');

CREATE INDEX IF NOT EXISTS idx_cleaning_tenant_status_date
    ON public.cleaning_tasks(tenant_id, status, task_date);

-- Durum esitlemesi + rezervasyon baginin kiracisi.
-- Adi bilerek trg_cleaning_* : BEFORE tetikleyicileri ada gore sirali calisir
-- ve bu, kapali donem korumasindan (trg_guard_*) ONCE calismalidir; boylece
-- eski istemcinin "Odendi"si durum degisimi olarak korumaya gorunur.
CREATE OR REPLACE FUNCTION public.sync_cleaning_task_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.is_paid AND NEW.status = 'PLANNED' THEN
        NEW.status := 'DONE';
    END IF;

    IF NEW.status = 'DONE' THEN
        IF NEW.completed_at IS NULL AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'DONE') THEN
            NEW.completed_at := now();
        END IF;
    ELSE
        NEW.completed_at := NULL;
    END IF;

    IF NEW.booking_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR OLD.booking_id IS DISTINCT FROM NEW.booking_id)
       AND NOT EXISTS (
           SELECT 1 FROM public.bookings b
            WHERE b.id = NEW.booking_id AND b.tenant_id = NEW.tenant_id
       ) THEN
        RAISE EXCEPTION 'CROSS_TENANT_BOOKING: Rezervasyon bu isletmeye ait degil.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_cleaning_task_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cleaning_task_status() FROM anon;

DROP TRIGGER IF EXISTS trg_cleaning_task_status_sync ON public.cleaning_tasks;
CREATE TRIGGER trg_cleaning_task_status_sync
    BEFORE INSERT OR UPDATE ON public.cleaning_tasks
    FOR EACH ROW EXECUTE FUNCTION public.sync_cleaning_task_status();

-- -----------------------------------------------------------------------------
-- 2. Kapali donem: durum degisimi de gideri degistirir
-- -----------------------------------------------------------------------------
-- phase43 govdesiyle ayni; tek fark serbest gecis kosuluna `status`un
-- eklenmesi. Kapanmis ayda "yapildi -> yapilmadi" o ayin giderini degistirir.
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
    -- bosalmasi serbest: odeme kapanistan sonra yapilir. Durum (yapildi /
    -- yapilmadi) serbest DEGIL: gideri o belirler.
    IF TG_OP = 'UPDATE'
       AND OLD.task_date   IS NOT DISTINCT FROM NEW.task_date
       AND OLD.amount      IS NOT DISTINCT FROM NEW.amount
       AND OLD.property_id IS NOT DISTINCT FROM NEW.property_id
       AND OLD.status      IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF public.fn_range_touches_closed_period(OLD.tenant_id, OLD.task_date, OLD.task_date) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu temizlik kapatilmis bir doneme (%) ait. Tarihi, tutari, durumu veya mulku degistirilemez; silinemez.',
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

-- -----------------------------------------------------------------------------
-- 3. Rezervasyon basina odeme komisyonu
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_payment_commissions (
    booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
    tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    amount     NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_payment_commissions_tenant
    ON public.booking_payment_commissions(tenant_id);

ALTER TABLE public.booking_payment_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view payment commissions" ON public.booking_payment_commissions;
CREATE POLICY "Members view payment commissions" ON public.booking_payment_commissions
    FOR SELECT TO authenticated
    USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Booking roles insert payment commissions" ON public.booking_payment_commissions;
CREATE POLICY "Booking roles insert payment commissions" ON public.booking_payment_commissions
    FOR INSERT TO authenticated
    WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager', 'staff'));
DROP POLICY IF EXISTS "Booking roles update payment commissions" ON public.booking_payment_commissions;
CREATE POLICY "Booking roles update payment commissions" ON public.booking_payment_commissions
    FOR UPDATE TO authenticated
    USING (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager', 'staff'))
    WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager', 'staff'));
DROP POLICY IF EXISTS "Managers delete payment commissions" ON public.booking_payment_commissions;
CREATE POLICY "Managers delete payment commissions" ON public.booking_payment_commissions
    FOR DELETE TO authenticated
    USING (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'));

REVOKE ALL ON public.booking_payment_commissions FROM PUBLIC;
REVOKE ALL ON public.booking_payment_commissions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_payment_commissions TO authenticated;
GRANT ALL ON public.booking_payment_commissions TO service_role;

DROP TRIGGER IF EXISTS trg_tenant_id_immutable ON public.booking_payment_commissions;
CREATE TRIGGER trg_tenant_id_immutable
    BEFORE UPDATE OF tenant_id ON public.booking_payment_commissions
    FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.booking_payment_commissions;
CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON public.booking_payment_commissions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Rezervasyon ayni kiracinin olmali ve konaklamanin gecelerinden biri bile
-- kapanmis bir aya dusuyorsa komisyon degismez (kapanis rakamini degistirir).
CREATE OR REPLACE FUNCTION public.guard_booking_payment_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_in  DATE;
    v_out DATE;
BEGIN
    IF public.fn_tenant_reset_in_progress() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT b.check_in, b.check_out INTO v_in, v_out
          FROM public.bookings b WHERE b.id = OLD.booking_id;
        -- Rezervasyon cascade ile silinirken satir artik yoktur; rezervasyonun
        -- kendi korumasi o silmeyi zaten denetledi.
        IF FOUND AND public.fn_range_touches_closed_period(OLD.tenant_id, v_in, v_out - 1) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu rezervasyon kapatilmis bir doneme ait. Odeme komisyonu degistirilemez.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        SELECT b.check_in, b.check_out INTO v_in, v_out
          FROM public.bookings b
         WHERE b.id = NEW.booking_id AND b.tenant_id = NEW.tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'CROSS_TENANT_BOOKING: Rezervasyon bu isletmeye ait degil.'
                USING ERRCODE = '42501';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.amount IS NOT DISTINCT FROM NEW.amount
           AND OLD.booking_id IS NOT DISTINCT FROM NEW.booking_id THEN
            RETURN NEW;
        END IF;
        IF public.fn_range_touches_closed_period(NEW.tenant_id, v_in, v_out - 1) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu rezervasyon kapatilmis bir doneme ait. Odeme komisyonu eklenemez.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_booking_payment_commission() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_booking_payment_commission() FROM anon;

DROP TRIGGER IF EXISTS trg_guard_booking_payment_commission ON public.booking_payment_commissions;
CREATE TRIGGER trg_guard_booking_payment_commission
    BEFORE INSERT OR UPDATE OR DELETE ON public.booking_payment_commissions
    FOR EACH ROW EXECUTE FUNCTION public.guard_booking_payment_commission();

-- -----------------------------------------------------------------------------
-- 4a. Kapanis snapshot'i (schemaVersion 4)
-- -----------------------------------------------------------------------------
-- Temizlik maliyeti = bu ayda YAPILMIS gorevlerin tutari. Eski istemcinin
-- "Odendi" aninda yazdigi EXP-CLEAN-* gider satiri olan gorev, o satir
-- uzerinden (elle giderlerin icinde) zaten sayiliyor; ikinci kez sayilmaz.
CREATE OR REPLACE FUNCTION public.compute_month_close_snapshot(
  p_tenant_id UUID, p_year INT, p_month INT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_start DATE := make_date(p_year, p_month, 1);
  v_end DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::date;
  v_sold BIGINT := 0; v_bookings BIGINT := 0; v_available BIGINT := 0; v_downtime BIGINT := 0;
  v_room NUMERIC := 0; v_cleaning_revenue NUMERIC := 0; v_revenue NUMERIC := 0;
  v_ota NUMERIC := 0; v_payment NUMERIC := 0; v_opex NUMERIC := 0; v_capex NUMERIC := 0;
  v_cleaning_cost NUMERIC := 0; v_cleaning_debt NUMERIC := 0; v_total_opex NUMERIC := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_tenant_member(p_tenant_id)) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_TENANT' USING ERRCODE = '42501';
  END IF;
  WITH nights AS (
    SELECT b.id, (b.check_out - b.check_in)::numeric total_nights,
           b.gross_amount, b.cleaning_fee, b.discount, b.ota_commission,
           COALESCE(pc.amount, 0) AS payment_commission
    FROM public.bookings b
    LEFT JOIN public.booking_payment_commissions pc ON pc.booking_id = b.id
    CROSS JOIN LATERAL generate_series(b.check_in, b.check_out - 1, interval '1 day') g(night)
    WHERE b.tenant_id = p_tenant_id AND b.status <> 'CANCELLED'
      AND g.night::date BETWEEN v_start AND v_end
  )
  SELECT COUNT(*), COUNT(DISTINCT id),
         COALESCE(SUM((gross_amount - cleaning_fee - discount) / total_nights),0),
         COALESCE(SUM(cleaning_fee / total_nights),0),
         COALESCE(SUM((gross_amount - discount) / total_nights),0),
         COALESCE(SUM(ota_commission / total_nights),0),
         COALESCE(SUM(payment_commission / total_nights),0)
    INTO v_sold, v_bookings, v_room, v_cleaning_revenue, v_revenue, v_ota, v_payment FROM nights;
  SELECT COALESCE(SUM(e.amount) FILTER (WHERE COALESCE(e.expense_type,'OPEX') <> 'CAPEX'),0),
         COALESCE(SUM(e.amount) FILTER (WHERE e.expense_type = 'CAPEX'),0)
    INTO v_opex, v_capex FROM public.expenses e
    WHERE e.tenant_id = p_tenant_id AND e.expense_date BETWEEN v_start AND v_end;
  SELECT COALESCE(SUM(ct.amount),0),
         COALESCE(SUM(ct.amount) FILTER (WHERE NOT ct.is_paid),0)
    INTO v_cleaning_cost, v_cleaning_debt
    FROM public.cleaning_tasks ct
   WHERE ct.tenant_id = p_tenant_id AND ct.status = 'DONE'
     AND ct.task_date BETWEEN v_start AND v_end
     AND NOT EXISTS (
       SELECT 1 FROM public.expenses e
        WHERE e.tenant_id = ct.tenant_id
          AND e.legacy_id IN ('EXP-CLEAN-' || ct.id::text, 'EXP-CLEAN-' || ct.legacy_id)
     );
  SELECT COALESCE(SUM(GREATEST(0,
    LEAST(v_end, COALESCE(p.deactivated_on, v_end)) - GREATEST(v_start, p.activated_on) + 1
  )),0) INTO v_available FROM public.properties p
  WHERE p.tenant_id = p_tenant_id AND p.activated_on <= v_end
    AND COALESCE(p.deactivated_on, v_end) >= v_start;
  SELECT COUNT(*) INTO v_downtime FROM (
    SELECT DISTINCT m.property_id, d.day::date
    FROM public.maintenance_tickets m
    CROSS JOIN LATERAL generate_series(
      GREATEST(v_start, m.downtime_start), LEAST(v_end, m.downtime_end), interval '1 day'
    ) d(day)
    WHERE m.tenant_id = p_tenant_id AND m.blocks_availability = TRUE
      AND m.downtime_start <= v_end AND m.downtime_end >= v_start
  ) blocked;
  v_available := GREATEST(0, v_available - v_downtime);
  v_total_opex := v_opex + v_ota + v_payment + v_cleaning_cost;
  RETURN jsonb_build_object(
    'schemaVersion',4,'computedBy','server','computedAt',now(),'period',to_char(v_start,'YYYY-MM'),
    'bookingCount',v_bookings,'soldNights',v_sold,'availableNights',v_available,
    'revenue',round(v_revenue,2),'roomRevenue',round(v_room,2),
    'cleaningRevenue',round(v_cleaning_revenue,2),'otaCommission',round(v_ota,2),
    'paymentCommission',round(v_payment,2),
    'cleaningCost',round(v_cleaning_cost,2),'cleaningDebt',round(v_cleaning_debt,2),
    'manualOpex',round(v_opex,2),'capex',round(v_capex,2),
    'totalOpex',round(v_total_opex,2),
    'netProfit',round(v_revenue - v_total_opex - v_capex,2),
    'occupancy',CASE WHEN v_available > 0 THEN round(v_sold::numeric/v_available*100,2) ELSE NULL END,
    'adr',CASE WHEN v_sold > 0 THEN round(v_room/v_sold,2) ELSE NULL END,
    'revpar',CASE WHEN v_available > 0 THEN round(v_room/v_available,2) ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.compute_month_close_snapshot(UUID, INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_month_close_snapshot(UUID, INT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_month_close_snapshot(UUID, INT, INT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4b. Yonetici snapshot'i — ayni sozlesme, mulk filtresiyle
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_executive_dashboard_snapshot(
  p_tenant_id UUID,
  p_target_month TEXT,
  p_property_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_revenue NUMERIC := 0;
  v_room_revenue NUMERIC := 0;
  v_cleaning_revenue NUMERIC := 0;
  v_manual_opex NUMERIC := 0;
  v_capex NUMERIC := 0;
  v_ota NUMERIC := 0;
  v_payment NUMERIC := 0;
  v_cleaning_cost NUMERIC := 0;
  v_cleaning_debt NUMERIC := 0;
  v_operating NUMERIC := 0;
  v_sold_nights BIGINT := 0;
  v_available_nights BIGINT := 0;
  v_downtime BIGINT := 0;
  v_open_tasks BIGINT := 0;
  v_critical_tasks BIGINT := 0;
  v_open_alerts BIGINT := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_TENANT' USING ERRCODE = '42501';
  END IF;
  IF p_target_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'INVALID_TARGET_MONTH' USING ERRCODE = '22007';
  END IF;
  v_start := (p_target_month || '-01')::date;
  v_end := (v_start + INTERVAL '1 month - 1 day')::date;
  IF p_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties WHERE id = p_property_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'INVALID_PROPERTY' USING ERRCODE = '42501';
  END IF;

  WITH nights AS (
    SELECT b.id, b.gross_amount, b.cleaning_fee, b.discount, b.ota_commission,
           COALESCE(pc.amount, 0) AS payment_commission,
           (b.check_out - b.check_in)::numeric AS total_nights
    FROM public.bookings b
    LEFT JOIN public.booking_payment_commissions pc ON pc.booking_id = b.id
    CROSS JOIN LATERAL generate_series(b.check_in, b.check_out - 1, interval '1 day') g(night)
    WHERE b.tenant_id = p_tenant_id AND b.status <> 'CANCELLED'
      AND (p_property_id IS NULL OR b.property_id = p_property_id)
      AND g.night::date BETWEEN v_start AND v_end
  )
  SELECT COUNT(*),
         COALESCE(SUM((gross_amount - discount) / total_nights),0),
         COALESCE(SUM((gross_amount - cleaning_fee - discount) / total_nights),0),
         COALESCE(SUM(cleaning_fee / total_nights),0),
         COALESCE(SUM(ota_commission / total_nights),0),
         COALESCE(SUM(payment_commission / total_nights),0)
    INTO v_sold_nights, v_revenue, v_room_revenue, v_cleaning_revenue, v_ota, v_payment FROM nights;

  SELECT
    COALESCE(SUM(e.amount) FILTER (WHERE COALESCE(e.expense_type, 'OPEX') = 'OPEX'),0),
    COALESCE(SUM(e.amount) FILTER (WHERE e.expense_type = 'CAPEX'),0)
    INTO v_manual_opex, v_capex
  FROM public.expenses e WHERE e.tenant_id = p_tenant_id
    AND e.expense_date BETWEEN v_start AND v_end
    AND (p_property_id IS NULL OR e.property_id = p_property_id);

  SELECT COALESCE(SUM(ct.amount),0),
         COALESCE(SUM(ct.amount) FILTER (WHERE NOT ct.is_paid),0)
    INTO v_cleaning_cost, v_cleaning_debt
    FROM public.cleaning_tasks ct
   WHERE ct.tenant_id = p_tenant_id AND ct.status = 'DONE'
     AND ct.task_date BETWEEN v_start AND v_end
     AND (p_property_id IS NULL OR ct.property_id = p_property_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.expenses e
        WHERE e.tenant_id = ct.tenant_id
          AND e.legacy_id IN ('EXP-CLEAN-' || ct.id::text, 'EXP-CLEAN-' || ct.legacy_id)
     );

  SELECT COALESCE(SUM(GREATEST(0,
    LEAST(v_end, COALESCE(p.deactivated_on, v_end)) - GREATEST(v_start, p.activated_on) + 1
  )),0) INTO v_available_nights
  FROM public.properties p WHERE p.tenant_id = p_tenant_id
    AND (p_property_id IS NULL OR p.id = p_property_id)
    AND p.activated_on <= v_end AND COALESCE(p.deactivated_on, v_end) >= v_start;

  SELECT COUNT(*) INTO v_downtime FROM (
    SELECT DISTINCT m.property_id, d.day::date
    FROM public.maintenance_tickets m
    CROSS JOIN LATERAL generate_series(
      GREATEST(v_start, m.downtime_start), LEAST(v_end, m.downtime_end), interval '1 day'
    ) d(day)
    WHERE m.tenant_id = p_tenant_id AND m.blocks_availability = TRUE
      AND (p_property_id IS NULL OR m.property_id = p_property_id)
      AND m.downtime_start <= v_end AND m.downtime_end >= v_start
  ) blocked;
  v_available_nights := GREATEST(0, v_available_nights - v_downtime);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE priority = 'CRITICAL')
    INTO v_open_tasks, v_critical_tasks FROM public.operational_tasks
    WHERE tenant_id = p_tenant_id AND status IN ('TODO','IN_PROGRESS')
      AND (p_property_id IS NULL OR property_id = p_property_id);
  SELECT COUNT(*) INTO v_open_alerts FROM public.executive_alerts
    WHERE tenant_id = p_tenant_id AND status = 'OPEN'
      AND (p_property_id IS NULL OR property_id = p_property_id);

  v_operating := v_manual_opex + v_ota + v_payment + v_cleaning_cost;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id, 'target_month', p_target_month, 'property_id', p_property_id,
    'total_revenue', round(v_revenue,2),
    'room_revenue', round(v_room_revenue,2),
    'cleaning_revenue', round(v_cleaning_revenue,2),
    'manual_opex', round(v_manual_opex,2),
    'ota_commission', round(v_ota,2),
    'payment_commission', round(v_payment,2),
    'cleaning_cost', round(v_cleaning_cost,2),
    'cleaning_debt', round(v_cleaning_debt,2),
    'operating_expenses', round(v_operating,2),
    'capex', round(v_capex,2),
    'total_expenses', round(v_operating + v_capex,2),
    'operating_profit', round(v_revenue - v_operating,2),
    'net_profit', round(v_revenue - v_operating - v_capex,2),
    'booked_nights', v_sold_nights, 'available_nights', v_available_nights,
    'occupancy', CASE WHEN v_available_nights > 0 THEN round(v_sold_nights::numeric / v_available_nights * 100,2) ELSE NULL END,
    'open_tasks_count', v_open_tasks, 'critical_tasks_count', v_critical_tasks,
    'open_alerts_count', v_open_alerts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_executive_dashboard_snapshot(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_executive_dashboard_snapshot(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_executive_dashboard_snapshot(UUID, TEXT, UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Dogrulama
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_def TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'cleaning_tasks' AND column_name = 'status') THEN
        RAISE EXCEPTION 'PHASE45_STATUS_COLUMN_MISSING';
    END IF;
    IF EXISTS (SELECT 1 FROM public.cleaning_tasks WHERE is_paid AND status <> 'DONE') THEN
        RAISE EXCEPTION 'PHASE45_PAID_NOT_DONE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.cleaning_tasks'::regclass
                   AND tgname = 'trg_cleaning_task_status_sync' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE45_STATUS_TRIGGER_MISSING';
    END IF;
    -- Esitleme, kapali donem korumasindan once calismali (ada gore sira).
    IF 'trg_cleaning_task_status_sync' >= 'trg_guard_cleaning_task_closed_period' THEN
        RAISE EXCEPTION 'PHASE45_TRIGGER_ORDER';
    END IF;

    v_def := pg_get_functiondef('public.guard_cleaning_task_closed_period()'::regprocedure);
    IF strpos(v_def, 'OLD.status') = 0 THEN
        RAISE EXCEPTION 'PHASE45_CLOSED_PERIOD_STATUS_UNGUARDED';
    END IF;
    IF strpos(v_def, 'fn_tenant_reset_in_progress') = 0 OR strpos(v_def, 'fn_tenant_is_being_deleted') = 0 THEN
        RAISE EXCEPTION 'PHASE45_CLOSED_PERIOD_EXEMPTIONS_LOST';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.booking_payment_commissions'::regclass AND relrowsecurity) THEN
        RAISE EXCEPTION 'PHASE45_PAYMENT_RLS_OFF';
    END IF;
    IF has_table_privilege('anon', 'public.booking_payment_commissions', 'SELECT') THEN
        RAISE EXCEPTION 'PHASE45_PAYMENT_ANON_OPEN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.booking_payment_commissions'::regclass
                   AND tgname = 'trg_tenant_id_immutable') THEN
        RAISE EXCEPTION 'PHASE45_PAYMENT_TENANT_IMMUTABLE_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.booking_payment_commissions'::regclass
                   AND tgname = 'trg_guard_booking_payment_commission') THEN
        RAISE EXCEPTION 'PHASE45_PAYMENT_GUARD_MISSING';
    END IF;

    v_def := pg_get_functiondef('public.compute_month_close_snapshot(uuid,integer,integer)'::regprocedure);
    IF strpos(v_def, 'cleaningCost') = 0 OR strpos(v_def, 'paymentCommission') = 0
       OR strpos(v_def, '''schemaVersion'',4') = 0 OR strpos(v_def, 'EXP-CLEAN-') = 0 THEN
        RAISE EXCEPTION 'PHASE45_CLOSE_SNAPSHOT_CONTRACT';
    END IF;
    v_def := pg_get_functiondef('public.get_executive_dashboard_snapshot(uuid,text,uuid)'::regprocedure);
    IF strpos(v_def, 'cleaning_cost') = 0 OR strpos(v_def, 'payment_commission') = 0
       OR strpos(v_def, 'EXP-CLEAN-') = 0 THEN
        RAISE EXCEPTION 'PHASE45_EXECUTIVE_SNAPSHOT_CONTRACT';
    END IF;

    IF has_function_privilege('anon', 'public.compute_month_close_snapshot(uuid,integer,integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_executive_dashboard_snapshot(uuid,text,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE45_ANON_EXECUTE_OPEN';
    END IF;

    RAISE NOTICE 'PHASE 45 OK — temizlik maliyeti ve odeme komisyonu sozlesmesi yerinde.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (45, 'phase45_cleaning_cost_contract')
ON CONFLICT (version) DO NOTHING;

COMMIT;
