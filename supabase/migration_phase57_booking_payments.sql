-- =============================================================================
-- LEXBNB PHASE 57 — REZERVASYON ODEME DEFTERI: KAPORA, ARA ODEME, KALAN (A2-G3)
-- =============================================================================
-- Kullanici karari (ENVANTER Rezervasyonlar): rezervasyonda alinan kapora ve
-- sonraki odemeler kaydedilir, kalan tutar gorulur.
--
-- Ilkeler:
--   * ODEME NAKIT HAREKETIDIR, CIROYU DEGISTIRMEZ. Gelir K-04 geregi
--     gecelere tahakkuk eder (§3.4); bu tablo o hesaba hic girmez.
--     compute_month_close_snapshot ve get_executive_dashboard_snapshot
--     degismedi — canli suit odeme ekleyip rakamin ayni kaldigini olcer.
--   * KALAN SAKLANMAZ, HESAPLANIR: booking_payment_balances gorunumu
--     (tahsil edilecek = gross_amount - discount; K-04 "Toplam Gelir"in
--     rezervasyon satiri). Saklanan bir "kalan" ile odemeler ayrisirdi.
--   * bookings'e SUTUN EKLENMEDI (§3.4 dagitim tuzagi).
--
-- Kapanmis donem (§3.4.1): koruma ODEME TARIHINE (paid_on) gore. Gerekce:
-- odeme konaklamanin gelirine degil nakit tablosuna yazilir; kapanmis ayin
-- tahsilat rakami muhurlu kalmali. Konaklamasi kapanmis ayda olan
-- rezervasyonun kalan odemesi sonradan (acik ayda) alinabilir — gercek hayat
-- tam olarak budur. Gider defteri (expense_date) ile ayni mantik.
--
-- Rezervasyon silme: odemesi olan rezervasyon SESSIZCE silinmez (tahsil
-- edilmis para kaybolurdu); BOOKING_HAS_PAYMENTS ile reddedilir. Once odeme
-- silinir ya da rezervasyon iptal edilir. Sifirlama ve isletme silme
-- (CLAUDE.md 3.7, fn_tenant_reset_in_progress / fn_tenant_is_being_deleted)
-- istisnadir: odemeler cascade ile gider. reset_tenant_data degismedi.
--
-- RLS: okuma can_read_sales (sales kapora kaydeder — kullanici karari),
-- yazma can_write_sales, silme yalniz yonetim. staff goremez.
-- Bagimlilik: phase53 (rol yardimcilari), phase43 (kapanmis donem yardimcisi).
-- Uygulama: docs/PHASE57_DEPLOY_PACKAGE.md
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 53) THEN
        RAISE EXCEPTION 'PHASE57_REQUIRES_PHASE53';
    END IF;
END
$pre$;

CREATE TABLE public.booking_payments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    booking_id  UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    paid_on     DATE NOT NULL,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    kind        TEXT NOT NULL CHECK (kind IN ('DEPOSIT', 'INTERIM', 'BALANCE')),
    method      TEXT CHECK (method IS NULL OR method IN ('CASH', 'BANK_TRANSFER', 'CARD', 'OTA', 'OTHER')),
    note        TEXT CHECK (note IS NULL OR length(note) <= 1000),
    created_by  UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX booking_payments_booking_idx ON public.booking_payments(booking_id);
CREATE INDEX booking_payments_tenant_date_idx ON public.booking_payments(tenant_id, paid_on);

COMMENT ON TABLE public.booking_payments IS
    'Rezervasyon tahsilati (nakit hareketi). Ciroya girmez; kalan booking_payment_balances ile hesaplanir.';
COMMENT ON COLUMN public.booking_payments.kind IS 'DEPOSIT = kapora, INTERIM = ara odeme, BALANCE = kalan odemesi';

-- Kiraci esitligi + kapanmis donem (odeme tarihi)
CREATE OR REPLACE FUNCTION public.guard_booking_payment()
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

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = NEW.booking_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_BOOKING: Rezervasyon bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.paid_on    IS NOT DISTINCT FROM NEW.paid_on
       AND OLD.amount     IS NOT DISTINCT FROM NEW.amount
       AND OLD.booking_id IS NOT DISTINCT FROM NEW.booking_id THEN
        RETURN NEW;  -- tur, yontem, not kapanistan sonra da duzeltilebilir
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE')
       AND public.fn_range_touches_closed_period(OLD.tenant_id, OLD.paid_on, OLD.paid_on) THEN
        RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu odeme kapatilmis bir doneme (%) ait. Tarihi, tutari ve rezervasyonu degistirilemez; silinemez.',
            to_char(OLD.paid_on, 'YYYY-MM') USING ERRCODE = '42501';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE')
       AND public.fn_range_touches_closed_period(NEW.tenant_id, NEW.paid_on, NEW.paid_on) THEN
        RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu donem (%) kapatilmistir. Odeme eklenemez veya buraya tasinamaz.',
            to_char(NEW.paid_on, 'YYYY-MM') USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_booking_payment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_booking_payment() FROM anon;

CREATE TRIGGER trg_guard_booking_payment
    BEFORE INSERT OR UPDATE OR DELETE ON public.booking_payments
    FOR EACH ROW EXECUTE FUNCTION public.guard_booking_payment();

-- Odemesi olan rezervasyon silinmez (sifirlama / isletme silme haric)
CREATE OR REPLACE FUNCTION public.guard_booking_delete_with_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
    v_total NUMERIC;
BEGIN
    IF public.fn_tenant_reset_in_progress() OR public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;
    SELECT count(*), COALESCE(sum(amount), 0) INTO v_count, v_total
    FROM public.booking_payments WHERE booking_id = OLD.id;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'BOOKING_HAS_PAYMENTS: Bu rezervasyonda % odeme kaydi (toplam %) var. Silmeden once odemeleri silin ya da rezervasyonu iptal edin.',
            v_count, v_total USING ERRCODE = '23503';
    END IF;
    RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_booking_delete_with_payments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_booking_delete_with_payments() FROM anon;

CREATE TRIGGER trg_guard_booking_delete_with_payments
    BEFORE DELETE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.guard_booking_delete_with_payments();

-- phase41 kurallari
CREATE TRIGGER trg_tenant_id_immutable BEFORE UPDATE OF tenant_id ON public.booking_payments
    FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.booking_payments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.booking_payments FROM PUBLIC;
REVOKE ALL ON public.booking_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booking_payments TO authenticated;

CREATE POLICY booking_payments_select ON public.booking_payments FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY booking_payments_insert ON public.booking_payments FOR INSERT TO authenticated
    WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY booking_payments_update ON public.booking_payments FOR UPDATE TO authenticated
    USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY booking_payments_delete ON public.booking_payments FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

-- Kalan: tek hesap yeri. security_invoker: cagiranin RLS'i gecerli (bookings
-- ve booking_payments'i okuyamayan bu gorunumden de bir sey goremez).
CREATE VIEW public.booking_payment_balances
WITH (security_invoker = true) AS
SELECT b.id                                   AS booking_id,
       b.tenant_id,
       (b.gross_amount - b.discount)          AS amount_due,
       COALESCE(p.paid_total, 0)              AS paid_total,
       COALESCE(p.payment_count, 0)           AS payment_count,
       (b.gross_amount - b.discount) - COALESCE(p.paid_total, 0) AS remaining,
       p.last_paid_on
FROM public.bookings b
LEFT JOIN (
    SELECT booking_id, sum(amount) AS paid_total, count(*) AS payment_count, max(paid_on) AS last_paid_on
    FROM public.booking_payments
    GROUP BY booking_id
) p ON p.booking_id = b.id;

COMMENT ON VIEW public.booking_payment_balances IS
    'Tahsil edilecek = gross_amount - discount (K-04 Toplam Gelir satiri). remaining < 0 fazla odemedir; uydurulmaz, gosterilir.';
REVOKE ALL ON public.booking_payment_balances FROM PUBLIC;
REVOKE ALL ON public.booking_payment_balances FROM anon;
GRANT SELECT ON public.booking_payment_balances TO authenticated;

DO $verify$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.booking_payments'::regclass) THEN
        RAISE EXCEPTION 'PHASE57_RLS_OFF';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.booking_payments'::regclass AND tgname = 'trg_tenant_id_immutable') THEN
        RAISE EXCEPTION 'PHASE57_TENANT_IMMUTABLE_MISSING';
    END IF;
    IF has_table_privilege('anon', 'public.booking_payments', 'SELECT')
       OR has_table_privilege('anon', 'public.booking_payment_balances', 'SELECT') THEN
        RAISE EXCEPTION 'PHASE57_ANON_OPEN';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.booking_payment_balances'::regclass
                   AND 'security_invoker=true' = ANY (reloptions)) THEN
        RAISE EXCEPTION 'PHASE57_VIEW_NOT_INVOKER';
    END IF;
    -- bookings'e sutun eklenmedi (§3.4)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings'
               AND column_name IN ('paid_total', 'remaining', 'deposit', 'deposit_amount', 'balance')) THEN
        RAISE EXCEPTION 'PHASE57_BOOKINGS_COLUMN_ADDED';
    END IF;
    -- Ciro hesaplari odemeyi okumaz
    IF strpos(pg_get_functiondef('public.compute_month_close_snapshot(uuid,integer,integer)'::regprocedure), 'booking_payments') > 0
       OR strpos(pg_get_functiondef('public.get_executive_dashboard_snapshot(uuid,text,uuid)'::regprocedure), 'booking_payments') > 0 THEN
        RAISE EXCEPTION 'PHASE57_PAYMENTS_IN_REVENUE';
    END IF;
    RAISE NOTICE 'PHASE 57 OK — odeme defteri: nakit hareketi, ciroya girmez, kalan hesaplanir.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (57, 'phase57_booking_payments')
ON CONFLICT (version) DO NOTHING;

COMMIT;
