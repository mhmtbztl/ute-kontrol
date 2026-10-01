-- Lexbnb phase76 — phase72 ad_metric_periods tenant_id degismezlik tamiri.
-- Phase72 test projesine uygulandiktan sonra phase41 ileri kural agi eksik
-- tetikleyiciyi yakaladi. Uygulanmis goc degistirilmez; tamir yeni phase'tir.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 74) THEN
        RAISE EXCEPTION 'PHASE76_REQUIRES_PHASE74';
    END IF;
END
$pre$;

DROP TRIGGER IF EXISTS trg_tenant_id_immutable ON public.ad_metric_periods;
CREATE TRIGGER trg_tenant_id_immutable
    BEFORE UPDATE OF tenant_id ON public.ad_metric_periods
    FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();

DO $verify$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_trigger t
         WHERE t.tgrelid = 'public.ad_metric_periods'::regclass
           AND t.tgname = 'trg_tenant_id_immutable'
           AND NOT t.tgisinternal
    ) THEN
        RAISE EXCEPTION 'PHASE76_TENANT_ID_TRIGGER_MISSING';
    END IF;
    RAISE NOTICE 'PHASE 76 OK — ad_metric_periods tenant_id degismez.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (76, 'phase76_ads_tenant_guard')
ON CONFLICT (version) DO NOTHING;

COMMIT;
