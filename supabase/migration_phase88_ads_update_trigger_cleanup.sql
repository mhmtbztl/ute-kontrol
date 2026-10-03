-- Lexbnb phase88 — phase82 reklam gun senkronunda yinelenen UPDATE tetikleyicisini kaldirir.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 86) THEN
        RAISE EXCEPTION 'PHASE88_REQUIRES_PHASE86';
    END IF;
END
$pre$;

-- AFTER UPDATE tetikleyicisi ayni fonksiyonla eski gunleri silip yeni gunleri
-- tek transaction icinde yazar. Phase82'deki BEFORE kopyasi ayni isi iki kez
-- yaptigi icin kaldirilir; tekillik ve rollback korumasi degismez.
DROP TRIGGER IF EXISTS trg_ad_metric_period_days_update
ON public.ad_metric_periods;

DO $verify$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.ad_metric_periods'::regclass
           AND tgname = 'trg_ad_metric_period_days_update'
           AND NOT tgisinternal
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.ad_metric_periods'::regclass
           AND tgname = 'trg_ad_metric_period_days_update_insert'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'PHASE88_ADS_UPDATE_TRIGGER_CONTRACT';
    END IF;
    RAISE NOTICE 'PHASE 88 OK — reklam donemi UPDATE gun senkronu tek tetikleyici kullaniyor.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (88, 'phase88_ads_update_trigger_cleanup')
ON CONFLICT (version) DO NOTHING;

COMMIT;
