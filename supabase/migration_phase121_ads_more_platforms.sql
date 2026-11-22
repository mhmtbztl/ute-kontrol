-- Lexbnb phase121 — reklam verisinde TikTok ve "Diger" platform (kullanici, 21.11.2026:
-- "tum reklam platformlarindan en kolay sekilde cekebilmeliyiz", "tiktok vs ekleyelim").
--
-- phase72 reklam donemlerini yalniz META/GOOGLE ile sinirliyordu; kampanya defteri
-- (phase31 marketing_campaigns) zaten META/GOOGLE/TIKTOK/OTHER kabul ediyor.
--
-- Kararlar:
--   * Yeni tablo/sutun yok. Yalniz `ad_metric_periods.platform` CHECK'i ve iki yazma
--     fonksiyonunun (save_ad_metric_period phase72, import_ad_metric_batch phase113)
--     platform kapisi genisler: META, GOOGLE, TIKTOK, OTHER.
--   * Fonksiyon govdeleri bu dosyaya KOPYALANMAZ: uzun govdeyi elle tasimak surum
--     kaymasi yaratir (phase113 govdesi 250+ satir). Goc, veritabanindaki guncel
--     govdeyi okur, yalniz platform listesini degistirir ve calistirir; desen
--     bulunamazsa (govde beklenenden farkliysa) DURUR. Imza, yetki ve GRANT'lar
--     CREATE OR REPLACE ile aynen kalir.
--   * "Diger" (OTHER): Pinterest, Yandex vb. elle girilen reklam; dosya okunmaz.
--   * Dagitim sirasi: istemci TikTok/Diger'i yalniz goc uygulandiysa kaydeder; goc
--     yoksa sunucu reddeder ve istemci nedeni soyler (ads_period_service).

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 113) THEN
        RAISE EXCEPTION 'PHASE121_REQUIRES_PHASE113';
    END IF;
END
$pre$;

-- 1. Tablo kisiti (phase72'de satir ici CHECK; adi katalogdan bulunur).
DO $constraint$
DECLARE
    v_name TEXT;
BEGIN
    FOR v_name IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'public.ad_metric_periods'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) ILIKE '%platform%'
    LOOP
        EXECUTE format('ALTER TABLE public.ad_metric_periods DROP CONSTRAINT %I', v_name);
    END LOOP;
END
$constraint$;

ALTER TABLE public.ad_metric_periods
    ADD CONSTRAINT ad_metric_periods_platform_check
    CHECK (platform IN ('META', 'GOOGLE', 'TIKTOK', 'OTHER'));

-- 2. Iki yazma fonksiyonunun platform kapisi.
DO $functions$
DECLARE
    v_sig TEXT;
    v_old TEXT;
    v_new TEXT;
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'public.save_ad_metric_period(uuid,uuid,uuid,text,date,date,text,text,numeric,bigint,bigint,bigint,bigint,bigint,text)',
        'public.import_ad_metric_batch(uuid,jsonb,jsonb)'
    ] LOOP
        v_old := pg_get_functiondef(v_sig::regprocedure);
        v_new := replace(v_old, 'NOT IN (''META'', ''GOOGLE'')', 'NOT IN (''META'', ''GOOGLE'', ''TIKTOK'', ''OTHER'')');
        v_new := replace(v_new, 'Platform META veya GOOGLE olmali.', 'Platform META, GOOGLE, TIKTOK veya OTHER olmali.');
        IF v_new = v_old THEN
            RAISE EXCEPTION 'PHASE121_PLATFORM_GATE_NOT_FOUND: %', v_sig;
        END IF;
        EXECUTE v_new;
    END LOOP;
END
$functions$;

DO $verify$
DECLARE
    v_def TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'ad_metric_periods_platform_check'
                      AND conrelid = 'public.ad_metric_periods'::regclass
                      AND pg_get_constraintdef(oid) LIKE '%TIKTOK%' AND pg_get_constraintdef(oid) LIKE '%OTHER%') THEN
        RAISE EXCEPTION 'PHASE121_PLATFORM_CHECK_MISSING';
    END IF;
    v_def := pg_get_functiondef('public.import_ad_metric_batch(uuid,jsonb,jsonb)'::regprocedure);
    IF v_def NOT LIKE '%''TIKTOK'', ''OTHER''%' OR v_def LIKE '%NOT IN (''META'', ''GOOGLE'')%' THEN
        RAISE EXCEPTION 'PHASE121_IMPORT_GATE_NOT_WIDENED';
    END IF;
    v_def := pg_get_functiondef('public.save_ad_metric_period(uuid,uuid,uuid,text,date,date,text,text,numeric,bigint,bigint,bigint,bigint,bigint,text)'::regprocedure);
    IF v_def NOT LIKE '%''TIKTOK'', ''OTHER''%' OR v_def LIKE '%NOT IN (''META'', ''GOOGLE'')%' THEN
        RAISE EXCEPTION 'PHASE121_SAVE_GATE_NOT_WIDENED';
    END IF;
    IF has_function_privilege('anon', 'public.import_ad_metric_batch(uuid,jsonb,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE121_ANON_CAN_IMPORT';
    END IF;
    IF has_table_privilege('anon', 'public.ad_metric_periods', 'SELECT') THEN
        RAISE EXCEPTION 'PHASE121_ANON_CAN_SELECT';
    END IF;
    RAISE NOTICE 'PHASE 121 OK — reklam donemlerinde TikTok ve Diger platform.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (121, 'phase121_ads_more_platforms')
ON CONFLICT (version) DO NOTHING;

COMMIT;
