-- Lexbnb phase113 — reklam verisinin az satirla saklanmasi (kullanici, 05.11.2026).
--
-- Kullanici: "az veri harcayacak sekilde yapalim; SaaS'ta backend masrafim artabilir."
--
-- phase111 ile Meta'nin gunluk dokumu her gun x kampanya icin AYRI donem satiri
-- aciyordu ve phase72'nin gider dagitimi her donem icin ayri gider satiri yaziyordu:
-- 6 kampanyali bir ay = 186 donem + 186 gider satiri (+ 186 gun kilidi).
--
-- phase113'ten sonra istemci gunluk dokumu kampanya x takvim ayi basina TEK
-- doneme toplar; gunluk kirilim ayni satirda kucuk bir JSON dizisinde durur
-- (`daily_metrics`). Ayni ay: 6 donem + 6 gider satiri. Grafikler gunluk egriyi
-- bu diziden cizer.
--
-- Kararlar:
--   * Yeni tablo yok, phase72/82 fonksiyonlari degismez. Gider yine
--     save_ad_metric_period'un tek dagitimindan gecer; tek donem tek ay oldugu
--     icin tek gider satiri dogar.
--   * Gunluk dizi ile donem toplami AYNI sayiyi soylemek zorunda: gunluk
--     harcamalarin toplami donem harcamasina esit degilse (1 kurus pay) aktarim
--     durur (ADS_DAILY_SPEND_MISMATCH). Aksi halde grafik ile Finans farkli
--     rakam gosterirdi.
--   * Dizi elemani yalniz d (gun), s (harcama), i (gosterim), c (tiklama),
--     r (sonuc) tasir; kisa anahtarlar bilerek — satir basina bayt.
--     Olculmeyen deger null kalir (§3.6). Erisim gunluk tutulmaz: gunluk
--     erisimler toplanamaz.
--   * Ay ortasi + ay sonu yukleme: istemci mevcut ayin gunluk dizisini yeni
--     dosyayla birlestirip tek satir gonderir; sunucu icin bu tam kapsama ve
--     phase111'in degistirme yoludur. Gunluk dizisi olmayan eski aylik kaydin
--     kismi kapsamasi yine ADS_PARTIAL_OVERLAP ile durur.
--   * Yazma yalniz RPC'den: goc uygulanmadan yayina cikan kod kayit akisini
--     kirmaz (§3.4); istemci `daily` gondermez ve phase111 yolu calisir.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 111) THEN
        RAISE EXCEPTION 'PHASE113_REQUIRES_PHASE111';
    END IF;
END
$pre$;

ALTER TABLE public.ad_metric_periods
    ADD COLUMN IF NOT EXISTS daily_metrics JSONB;

ALTER TABLE public.ad_metric_periods
    DROP CONSTRAINT IF EXISTS ad_metric_periods_daily_metrics_check,
    ADD CONSTRAINT ad_metric_periods_daily_metrics_check
        CHECK (daily_metrics IS NULL OR jsonb_typeof(daily_metrics) = 'array');

CREATE OR REPLACE FUNCTION public.import_ad_metric_batch(
    p_tenant_id UUID,
    p_new_campaigns JSONB,
    p_rows JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_new JSONB := COALESCE(p_new_campaigns, '[]'::jsonb);
    v_item JSONB;
    v_key TEXT;
    v_name TEXT;
    v_platform TEXT;
    v_budget NUMERIC;
    v_campaign_id UUID;
    v_map JSONB := '{}'::jsonb;
    v_created JSONB := '[]'::jsonb;
    v_resolved JSONB := '[]'::jsonb;
    v_extra JSONB;
    v_daily JSONB;
    v_day JSONB;
    v_day_date DATE;
    v_metric RECORD;
    v_period RECORD;
    v_campaign_name TEXT;
    v_id UUID;
    v_replaced INTEGER := 0;
    v_inserted INTEGER := 0;
    v_spend NUMERIC(14,2) := 0;
BEGIN
    -- Yetki kayit aramadan once (§7). NOT NULL = NULL tuzagi icin COALESCE.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Oturum gerekli.' USING ERRCODE = '42501';
    END IF;
    IF NOT COALESCE(public.can_manage_tenant(p_tenant_id), false) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Reklam metriklerini yonetme yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    IF NOT COALESCE(public.can_write_ledger(p_tenant_id), false) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Reklam gideri finans defterine yazilir; finans yazma izniniz yok.' USING ERRCODE = '42501';
    END IF;

    IF jsonb_typeof(v_new) <> 'array' OR jsonb_array_length(v_new) > 200 THEN
        RAISE EXCEPTION 'ADS_BATCH_INVALID: Yeni kampanya listesi en fazla 200 olabilir.' USING ERRCODE = '22023';
    END IF;
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array'
       OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 3000 THEN
        RAISE EXCEPTION 'ADS_BATCH_INVALID: 1-3000 satir gerekli.' USING ERRCODE = '22023';
    END IF;

    -- 1. Yeni kampanyalar. Ayni ad + platform zaten varsa (cift tiklama, eszamanli
    --    ikinci sekme) yenisi acilmaz, mevcut kullanilir.
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_new) LOOP
        v_key := NULLIF(btrim(COALESCE(v_item->>'key', '')), '');
        v_name := btrim(COALESCE(v_item->>'name', ''));
        v_platform := v_item->>'platform';
        IF v_key IS NULL OR v_name = '' OR char_length(v_name) > 160 THEN
            RAISE EXCEPTION 'ADS_NEW_CAMPAIGN_INVALID: Kampanya anahtari ve adi (en fazla 160 karakter) zorunlu.' USING ERRCODE = '22023';
        END IF;
        IF v_platform IS NULL THEN
            RAISE EXCEPTION 'ADS_NEW_CAMPAIGN_INVALID: Platform zorunlu.' USING ERRCODE = '22023';
        END IF;
        IF v_platform NOT IN ('META', 'GOOGLE') THEN
            RAISE EXCEPTION 'ADS_NEW_CAMPAIGN_INVALID: Platform META veya GOOGLE olmali.' USING ERRCODE = '22023';
        END IF;
        IF v_map ? v_key THEN
            RAISE EXCEPTION 'ADS_NEW_CAMPAIGN_INVALID: Ayni kampanya anahtari iki kez gonderildi.' USING ERRCODE = '22023';
        END IF;
        v_budget := NULLIF(v_item->>'budget', '')::numeric;
        IF v_budget IS NOT NULL AND v_budget < 0 THEN
            RAISE EXCEPTION 'ADS_NEW_CAMPAIGN_INVALID: Butce negatif olamaz.' USING ERRCODE = '22023';
        END IF;

        SELECT id INTO v_campaign_id FROM public.marketing_campaigns
         WHERE tenant_id = p_tenant_id AND platform = v_platform AND name = v_name
         ORDER BY created_at LIMIT 1;
        IF v_campaign_id IS NULL THEN
            INSERT INTO public.marketing_campaigns(tenant_id, name, platform, budget, status, created_by)
            VALUES (p_tenant_id, v_name, v_platform, COALESCE(v_budget, 0), 'ACTIVE', auth.uid())
            RETURNING id INTO v_campaign_id;
            v_created := v_created || jsonb_build_array(jsonb_build_object('key', v_key, 'id', v_campaign_id, 'name', v_name));
        END IF;
        v_map := v_map || jsonb_build_object(v_key, v_campaign_id);
    END LOOP;

    -- 2. Satirlarin kampanyasini coz ve ek alanlari dogrula.
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
        v_key := NULLIF(btrim(COALESCE(v_item->>'campaign_key', '')), '');
        IF v_key IS NOT NULL THEN
            IF NOT (v_map ? v_key) THEN
                RAISE EXCEPTION 'ADS_CAMPAIGN_KEY_UNKNOWN: Satir bilinmeyen yeni kampanyaya bagli.' USING ERRCODE = '22023';
            END IF;
            v_campaign_id := (v_map->>v_key)::uuid;
        ELSE
            v_campaign_id := NULLIF(v_item->>'campaign_id', '')::uuid;
        END IF;
        IF v_campaign_id IS NULL THEN
            RAISE EXCEPTION 'ADS_CAMPAIGN_REQUIRED: Her satir bir kampanyaya bagli olmali.' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.marketing_campaigns WHERE id = v_campaign_id AND tenant_id = p_tenant_id) THEN
            RAISE EXCEPTION 'ADS_CAMPAIGN_NOT_FOUND';
        END IF;
        IF NULLIF(v_item->>'period_start', '') IS NULL OR NULLIF(v_item->>'period_end', '') IS NULL THEN
            RAISE EXCEPTION 'ADS_BATCH_INVALID: Donem baslangic ve bitisi zorunlu.' USING ERRCODE = '22023';
        END IF;
        IF (v_item->>'period_end')::date < (v_item->>'period_start')::date THEN
            RAISE EXCEPTION 'ADS_BATCH_INVALID: Bitis baslangictan once olamaz.' USING ERRCODE = '22023';
        END IF;
        IF NULLIF(v_item->>'results', '') IS NOT NULL AND (v_item->>'results')::bigint < 0 THEN
            RAISE EXCEPTION 'ADS_BATCH_INVALID: Sonuc negatif olamaz.' USING ERRCODE = '22023';
        END IF;

        v_extra := v_item->'extra_metrics';
        IF v_extra IS NOT NULL AND jsonb_typeof(v_extra) <> 'null' THEN
            IF jsonb_typeof(v_extra) <> 'object' THEN
                RAISE EXCEPTION 'ADS_EXTRA_METRICS_INVALID: Ek metrikler nesne olmali.' USING ERRCODE = '22023';
            END IF;
            IF (SELECT count(*) FROM jsonb_object_keys(v_extra)) > 40 THEN
                RAISE EXCEPTION 'ADS_EXTRA_METRICS_INVALID: En fazla 40 ek metrik.' USING ERRCODE = '22023';
            END IF;
            FOR v_metric IN SELECT key, value FROM jsonb_each(v_extra) LOOP
                IF char_length(v_metric.key) = 0 OR char_length(v_metric.key) > 120 THEN
                    RAISE EXCEPTION 'ADS_EXTRA_METRICS_INVALID: Metrik adi 1-120 karakter olmali.' USING ERRCODE = '22023';
                END IF;
                IF jsonb_typeof(v_metric.value) <> 'number' THEN
                    RAISE EXCEPTION 'ADS_EXTRA_METRICS_INVALID: % sayi olmali.', v_metric.key USING ERRCODE = '22023';
                END IF;
                IF (v_metric.value #>> '{}')::numeric < 0 THEN
                    RAISE EXCEPTION 'ADS_EXTRA_METRICS_INVALID: % negatif olamaz.', v_metric.key USING ERRCODE = '22023';
                END IF;
            END LOOP;
        END IF;

        -- Gunluk kirilim (phase113). Kosullar ardisik IF: cast kendi onkosulundan
        -- sonra calisir (§5.11).
        v_daily := v_item->'daily';
        IF v_daily IS NOT NULL AND jsonb_typeof(v_daily) <> 'null' THEN
            IF jsonb_typeof(v_daily) <> 'array' THEN
                RAISE EXCEPTION 'ADS_DAILY_INVALID: Gunluk kirilim dizi olmali.' USING ERRCODE = '22023';
            END IF;
            IF jsonb_array_length(v_daily) < 1 OR jsonb_array_length(v_daily) > 31 THEN
                RAISE EXCEPTION 'ADS_DAILY_INVALID: Gunluk kirilim 1-31 gun olmali.' USING ERRCODE = '22023';
            END IF;
            FOR v_day IN SELECT value FROM jsonb_array_elements(v_daily) LOOP
                IF jsonb_typeof(v_day) <> 'object' THEN
                    RAISE EXCEPTION 'ADS_DAILY_INVALID: Gun kaydi nesne olmali.' USING ERRCODE = '22023';
                END IF;
                IF jsonb_typeof(v_day->'d') IS DISTINCT FROM 'string' THEN
                    RAISE EXCEPTION 'ADS_DAILY_INVALID: Gun tarihi zorunlu.' USING ERRCODE = '22023';
                END IF;
                v_day_date := (v_day->>'d')::date;
                IF v_day_date < (v_item->>'period_start')::date OR v_day_date > (v_item->>'period_end')::date THEN
                    RAISE EXCEPTION 'ADS_DAILY_INVALID: % donem disinda.', v_day_date USING ERRCODE = '22023';
                END IF;
                IF jsonb_typeof(v_day->'s') IS DISTINCT FROM 'number' THEN
                    RAISE EXCEPTION 'ADS_DAILY_INVALID: % icin harcama sayi olmali.', v_day_date USING ERRCODE = '22023';
                END IF;
                FOR v_metric IN SELECT key, value FROM jsonb_each(v_day) LOOP
                    IF v_metric.key NOT IN ('d', 's', 'i', 'c', 'r') THEN
                        RAISE EXCEPTION 'ADS_DAILY_INVALID: Bilinmeyen gunluk alan %.', v_metric.key USING ERRCODE = '22023';
                    END IF;
                    IF v_metric.key <> 'd' AND jsonb_typeof(v_metric.value) <> 'null' THEN
                        IF jsonb_typeof(v_metric.value) <> 'number' THEN
                            RAISE EXCEPTION 'ADS_DAILY_INVALID: % / % sayi olmali.', v_day_date, v_metric.key USING ERRCODE = '22023';
                        END IF;
                        IF (v_metric.value #>> '{}')::numeric < 0 THEN
                            RAISE EXCEPTION 'ADS_DAILY_INVALID: % / % negatif olamaz.', v_day_date, v_metric.key USING ERRCODE = '22023';
                        END IF;
                        IF v_metric.key <> 's' THEN
                            IF (v_metric.value #>> '{}')::numeric <> trunc((v_metric.value #>> '{}')::numeric) THEN
                                RAISE EXCEPTION 'ADS_DAILY_INVALID: % / % tam sayi olmali.', v_day_date, v_metric.key USING ERRCODE = '22023';
                            END IF;
                        END IF;
                    END IF;
                END LOOP;
            END LOOP;
            IF (SELECT count(DISTINCT value->>'d') FROM jsonb_array_elements(v_daily)) <> jsonb_array_length(v_daily) THEN
                RAISE EXCEPTION 'ADS_DAILY_INVALID: Ayni gun iki kez var.' USING ERRCODE = '22023';
            END IF;
            IF abs((SELECT sum((value->>'s')::numeric) FROM jsonb_array_elements(v_daily))
                   - COALESCE(NULLIF(v_item->>'spend', '')::numeric, 0)) > 0.01 THEN
                RAISE EXCEPTION 'ADS_DAILY_SPEND_MISMATCH: Gunluk harcamalarin toplami donem harcamasina esit degil.' USING ERRCODE = '22023';
            END IF;
        END IF;

        v_resolved := v_resolved || jsonb_build_array(v_item || jsonb_build_object('campaign_id', v_campaign_id));
    END LOOP;

    -- 3. Cakisan eski donemler: tamamen kapsananlar degisir, kismen kapsanan durdurur.
    FOR v_period IN
        SELECT p.id, p.campaign_id, p.period_start, p.period_end
          FROM public.ad_metric_periods p
         WHERE p.tenant_id = p_tenant_id
           AND EXISTS (
               SELECT 1 FROM jsonb_to_recordset(v_resolved) AS i(campaign_id UUID, period_start DATE, period_end DATE)
                WHERE i.campaign_id = p.campaign_id
                  AND p.period_start <= i.period_end AND p.period_end >= i.period_start)
         ORDER BY p.period_start
         FOR UPDATE OF p
    LOOP
        IF EXISTS (
            SELECT 1 FROM generate_series(v_period.period_start, v_period.period_end, interval '1 day') d
             WHERE NOT EXISTS (
                 SELECT 1 FROM jsonb_to_recordset(v_resolved) AS i(campaign_id UUID, period_start DATE, period_end DATE)
                  WHERE i.campaign_id = v_period.campaign_id
                    AND d::date BETWEEN i.period_start AND i.period_end)
        ) THEN
            SELECT name INTO v_campaign_name FROM public.marketing_campaigns WHERE id = v_period.campaign_id;
            RAISE EXCEPTION 'ADS_PARTIAL_OVERLAP: "%" icin kayitli % - % donemi dosyada tam karsilanmiyor. Dosyayi bu donemin tamamini kapsayacak sekilde indirin ya da eski donemi silin.',
                v_campaign_name, v_period.period_start, v_period.period_end USING ERRCODE = '23P01';
        END IF;
        DELETE FROM public.expenses
         WHERE tenant_id = p_tenant_id AND legacy_id LIKE 'ADS_PERIOD:' || v_period.id::text || ':%';
        DELETE FROM public.ad_metric_periods WHERE id = v_period.id AND tenant_id = p_tenant_id;
        v_replaced := v_replaced + 1;
    END LOOP;

    -- 4. Yeni donemler. Gider dagitimi phase72'nin tek fonksiyonundan gecer.
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_resolved) LOOP
        v_id := public.save_ad_metric_period(
            NULL,
            p_tenant_id,
            (v_item->>'campaign_id')::uuid,
            v_item->>'platform',
            (v_item->>'period_start')::date,
            (v_item->>'period_end')::date,
            v_item->>'result_type',
            v_item->>'result_metric',
            NULLIF(v_item->>'spend', '')::numeric,
            NULLIF(v_item->>'impressions', '')::bigint,
            NULLIF(v_item->>'reach', '')::bigint,
            NULLIF(v_item->>'clicks', '')::bigint,
            NULLIF(v_item->>'messages', '')::bigint,
            NULLIF(v_item->>'calls', '')::bigint,
            COALESCE(NULLIF(v_item->>'source', ''), 'CSV')
        );
        v_extra := CASE WHEN jsonb_typeof(v_item->'extra_metrics') = 'object' AND v_item->'extra_metrics' <> '{}'::jsonb
                        THEN v_item->'extra_metrics' END;
        v_daily := CASE WHEN jsonb_typeof(v_item->'daily') = 'array' THEN v_item->'daily' END;
        UPDATE public.ad_metric_periods
           SET results = NULLIF(v_item->>'results', '')::bigint, extra_metrics = v_extra, daily_metrics = v_daily
         WHERE id = v_id AND tenant_id = p_tenant_id;
        v_inserted := v_inserted + 1;
        v_spend := v_spend + COALESCE(NULLIF(v_item->>'spend', '')::numeric, 0);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'created_campaigns', v_created,
        'campaign_map', v_map,
        'replaced_periods', v_replaced,
        'inserted_periods', v_inserted,
        'spend_total', v_spend
    );
END;
$$;

REVOKE ALL ON FUNCTION public.import_ad_metric_batch(UUID, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_ad_metric_batch(UUID, JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_ad_metric_batch(UUID, JSONB, JSONB) TO authenticated;

DO $verify$
DECLARE v_def TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'ad_metric_periods' AND column_name = 'daily_metrics') THEN
        RAISE EXCEPTION 'PHASE113_DAILY_METRICS_COLUMN_MISSING';
    END IF;
    SELECT pg_get_functiondef('public.import_ad_metric_batch(uuid,jsonb,jsonb)'::regprocedure) INTO v_def;
    IF strpos(v_def, 'can_write_ledger') = 0 OR strpos(v_def, 'can_manage_tenant') = 0 THEN
        RAISE EXCEPTION 'PHASE113_AUTHZ_MISSING';
    END IF;
    IF strpos(v_def, 'ADS_PARTIAL_OVERLAP') = 0 THEN
        RAISE EXCEPTION 'PHASE113_PARTIAL_OVERLAP_GUARD_MISSING';
    END IF;
    IF strpos(v_def, 'ADS_DAILY_SPEND_MISMATCH') = 0 OR strpos(v_def, 'daily_metrics') = 0 THEN
        RAISE EXCEPTION 'PHASE113_DAILY_GUARD_MISSING';
    END IF;
    IF has_function_privilege('anon', 'public.import_ad_metric_batch(uuid,jsonb,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE113_ANON_CAN_EXECUTE';
    END IF;
    RAISE NOTICE 'PHASE 113 OK — reklam gunluk dokumu kampanya x ay basina tek satir.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (113, 'phase113_ads_daily_compact')
ON CONFLICT (version) DO NOTHING;

COMMIT;
