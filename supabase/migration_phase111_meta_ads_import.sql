-- Lexbnb phase111 — Meta CSV ice aktarimi: kampanya acma + cakisan gunleri degistirme.
--
-- phase82'nin toplu RPC'si uc yerde takiliyordu (kullanici, 05.11.2026):
--   1. Her kampanya once elle acilmak zorundaydi; eslesmeyen ad tum aktarimi durduruyordu.
--   2. Ayni gunleri kapsayan ikinci yukleme (ay ortasi + ay sonu indirme) gun
--      tekilligine (campaign_id, day) takilip tumuyle reddediliyordu.
--   3. Mesaj/arama disindaki sonuc sayisi (profil ziyareti, acilis sayfasi
--      goruntuleme) ve dosyadaki ek sayac sutunlari hic saklanamiyordu.
--
-- Kararlar:
--   * Yeni sutunlar nullable ve YALNIZ RPC'den yazilir. Istemci tabloya dogrudan
--     yazmadigi icin goc uygulanmadan yayina cikan kod kayit akisini kirmaz (§3.4).
--   * Cakisan eski donem ancak yeni dosya onun TUM gunlerini kapsiyorsa silinir.
--     "1-31 Ekim" kaydinin ustune yalniz 1 Ekim gelirse 2-31 Ekim kaybolmaz:
--     ADS_PARTIAL_OVERLAP ile tum islem durur.
--   * Eski donemin gider satirlari ayni islemde silinir; kapanmis aya dusen gider
--     mevcut koruma tetikleyicisiyle tum aktarimi reddeder (yarim aktarim olmaz).
--   * Gider yazdigi icin yetki can_write_ledger (§3.3.1), kampanya ve reklam
--     metrigi yonetim isi oldugu icin can_manage_tenant — ikisi birden.
--   * Oran sutunlari (CTR, CPM, siklik, sonuc basina ucret) saklanmaz: taban
--     sayilardan hesaplanir; Meta'nin oranini donemler boyunca toplamak yanlis olur.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 82) THEN
        RAISE EXCEPTION 'PHASE111_REQUIRES_PHASE82';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 107) THEN
        RAISE EXCEPTION 'PHASE111_REQUIRES_PHASE107';
    END IF;
END
$pre$;

ALTER TABLE public.ad_metric_periods
    ADD COLUMN IF NOT EXISTS results BIGINT,
    ADD COLUMN IF NOT EXISTS extra_metrics JSONB;

ALTER TABLE public.ad_metric_periods
    DROP CONSTRAINT IF EXISTS ad_metric_periods_results_check,
    ADD CONSTRAINT ad_metric_periods_results_check CHECK (results IS NULL OR results >= 0),
    DROP CONSTRAINT IF EXISTS ad_metric_periods_extra_metrics_check,
    ADD CONSTRAINT ad_metric_periods_extra_metrics_check
        CHECK (extra_metrics IS NULL OR jsonb_typeof(extra_metrics) = 'object');

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
        UPDATE public.ad_metric_periods
           SET results = NULLIF(v_item->>'results', '')::bigint, extra_metrics = v_extra
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
                    WHERE table_schema = 'public' AND table_name = 'ad_metric_periods' AND column_name = 'results') THEN
        RAISE EXCEPTION 'PHASE111_RESULTS_COLUMN_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'ad_metric_periods' AND column_name = 'extra_metrics') THEN
        RAISE EXCEPTION 'PHASE111_EXTRA_METRICS_COLUMN_MISSING';
    END IF;
    SELECT pg_get_functiondef('public.import_ad_metric_batch(uuid,jsonb,jsonb)'::regprocedure) INTO v_def;
    IF strpos(v_def, 'can_write_ledger') = 0 OR strpos(v_def, 'can_manage_tenant') = 0 THEN
        RAISE EXCEPTION 'PHASE111_AUTHZ_MISSING';
    END IF;
    IF strpos(v_def, 'ADS_PARTIAL_OVERLAP') = 0 THEN
        RAISE EXCEPTION 'PHASE111_PARTIAL_OVERLAP_GUARD_MISSING';
    END IF;
    IF has_function_privilege('anon', 'public.import_ad_metric_batch(uuid,jsonb,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE111_ANON_CAN_EXECUTE';
    END IF;
    RAISE NOTICE 'PHASE 111 OK — Meta CSV ice aktarimi: kampanya acma, cakisan gunleri degistirme, sonuc ve ek metrikler.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (111, 'phase111_meta_ads_import')
ON CONFLICT (version) DO NOTHING;

COMMIT;
