-- =============================================================================
-- LEXBNB PHASE 22 — PAZARLAMA FONKSIYONLARINDAN anon YETKISININ GERI ALINMASI
--
-- SORUN:
--   Supabase, public semasindaki yeni fonksiyonlara varsayilan olarak `anon`
--   rolune EXECUTE verir. `REVOKE ALL ... FROM PUBLIC` bunu KALDIRMAZ, cunku
--   anon'a verilen dogrudan bir grant'tir (CLAUDE.md bolum 7).
--
--   Phase 17 goclerinin hicbiri anon'u ayrica revoke etmedi. Uretimde
--   dogrulandi: kimligi dogrulanmamis bir cagri
--       POST /rest/v1/rpc/review_marketing_finding
--   SECURITY DEFINER govdesine kadar girdi ve yalnizca kayit bulunamadigi icin
--   (MARKETING_FINDING_NOT_FOUND) durdu.
--
--   Veri sizintisi olmadi: her kullanici yuzeyli fonksiyonun govdesinde
--   auth.uid() + get_tenant_role() kontrolu, her worker fonksiyonunda
--   SERVICE_ROLE_REQUIRED kontrolu var. Bu goc, derinlemesine savunmanin
--   eksik ilk katmanini geri koyar: anon fonksiyon govdesine hic girmemeli.
--
-- KAPSAM:
--   Yalnizca anon geri alinir. authenticated ve service_role erisimi
--   degismez, dolayisiyla uygulama davranisi aynen korunur.
-- =============================================================================

DO $phase22$
DECLARE
    v_signature TEXT;
    v_signatures TEXT[] := ARRAY[
        'public.change_channel_cover_and_measure(UUID, UUID, UUID, UUID, UUID, TEXT)',
        'public.claim_listing_change_experiment(UUID)',
        'public.claim_photo_analysis_run(UUID)',
        'public.complete_listing_change_experiment(UUID, UUID, UUID, UUID, JSONB)',
        'public.complete_photo_analysis_run(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB)',
        'public.fail_listing_change_experiment(UUID, UUID, TEXT, TEXT)',
        'public.fail_photo_analysis_run(UUID, UUID, TEXT, TEXT)',
        'public.marketing_storage_property_id(TEXT)',
        'public.marketing_storage_tenant_id(TEXT)',
        'public.persist_property_marketing_health_snapshot(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB, UUID[])',
        'public.record_manual_channel_snapshot(UUID, UUID, DATE, DATE, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT)',
        'public.record_property_marketing_benchmark(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, NUMERIC, NUMERIC, JSONB)',
        'public.record_property_marketing_health_input(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)',
        'public.request_listing_change_evaluation(UUID, UUID, UUID, TEXT, DATE, DATE, DATE, DATE, DATE, TEXT, UUID, UUID)',
        'public.request_photo_analysis(UUID, UUID, TEXT, TEXT, TEXT)',
        'public.review_marketing_finding(UUID, TEXT, TEXT)',
        'public.save_property_channel_listing(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)',
        'public.sync_marketing_finding_from_task()',
        'public.touch_marketing_updated_at()',
        'public.upsert_marketing_finding(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE, DATE, TIMESTAMPTZ)'
    ];
BEGIN
    FOREACH v_signature IN ARRAY v_signatures LOOP
        IF to_regprocedure(v_signature) IS NULL THEN
            RAISE EXCEPTION 'PHASE22_MISSING_FUNCTION: %', v_signature;
        END IF;
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_signature);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_signature);
    END LOOP;
END
$phase22$;

-- -----------------------------------------------------------------------------
-- Kullanici yuzeyli fonksiyonlarin authenticated erisimi acikca yeniden verilir.
-- (Worker fonksiyonlarina KASITLI olarak verilmez; onlar service_role ile
--  cagrilir ve govdelerinde SERVICE_ROLE_REQUIRED kontrolu vardir.)
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.change_channel_cover_and_measure(UUID, UUID, UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_storage_property_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_storage_tenant_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_channel_snapshot(UUID, UUID, DATE, DATE, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_property_marketing_benchmark(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, NUMERIC, NUMERIC, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_listing_change_evaluation(UUID, UUID, UUID, TEXT, DATE, DATE, DATE, DATE, DATE, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_photo_analysis(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_marketing_finding(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_property_channel_listing(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- =============================================================================
-- DOGRULAMA — basarisizsa goc durur (CLAUDE.md bolum 4.2)
-- =============================================================================
DO $verify$
DECLARE
    v_signature TEXT;
    v_leaked TEXT[] := ARRAY[]::TEXT[];
    v_lost TEXT[] := ARRAY[]::TEXT[];
    v_anon_functions TEXT[] := ARRAY[
        'public.change_channel_cover_and_measure(UUID, UUID, UUID, UUID, UUID, TEXT)',
        'public.claim_listing_change_experiment(UUID)',
        'public.claim_photo_analysis_run(UUID)',
        'public.complete_listing_change_experiment(UUID, UUID, UUID, UUID, JSONB)',
        'public.complete_photo_analysis_run(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB)',
        'public.fail_listing_change_experiment(UUID, UUID, TEXT, TEXT)',
        'public.fail_photo_analysis_run(UUID, UUID, TEXT, TEXT)',
        'public.marketing_storage_property_id(TEXT)',
        'public.marketing_storage_tenant_id(TEXT)',
        'public.persist_property_marketing_health_snapshot(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB, UUID[])',
        'public.record_manual_channel_snapshot(UUID, UUID, DATE, DATE, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT)',
        'public.record_property_marketing_benchmark(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, NUMERIC, NUMERIC, JSONB)',
        'public.record_property_marketing_health_input(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)',
        'public.request_listing_change_evaluation(UUID, UUID, UUID, TEXT, DATE, DATE, DATE, DATE, DATE, TEXT, UUID, UUID)',
        'public.request_photo_analysis(UUID, UUID, TEXT, TEXT, TEXT)',
        'public.review_marketing_finding(UUID, TEXT, TEXT)',
        'public.save_property_channel_listing(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)',
        'public.sync_marketing_finding_from_task()',
        'public.touch_marketing_updated_at()',
        'public.upsert_marketing_finding(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE, DATE, TIMESTAMPTZ)'
    ];
    v_authenticated_functions TEXT[] := ARRAY[
        'public.change_channel_cover_and_measure(UUID, UUID, UUID, UUID, UUID, TEXT)',
        'public.record_manual_channel_snapshot(UUID, UUID, DATE, DATE, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT)',
        'public.record_property_marketing_benchmark(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, NUMERIC, NUMERIC, JSONB)',
        'public.request_photo_analysis(UUID, UUID, TEXT, TEXT, TEXT)',
        'public.review_marketing_finding(UUID, TEXT, TEXT)',
        'public.save_property_channel_listing(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT)'
    ];
BEGIN
    FOREACH v_signature IN ARRAY v_anon_functions LOOP
        IF has_function_privilege('anon', to_regprocedure(v_signature), 'EXECUTE') THEN
            v_leaked := array_append(v_leaked, v_signature);
        END IF;
    END LOOP;

    FOREACH v_signature IN ARRAY v_authenticated_functions LOOP
        IF NOT has_function_privilege('authenticated', to_regprocedure(v_signature), 'EXECUTE') THEN
            v_lost := array_append(v_lost, v_signature);
        END IF;
    END LOOP;

    IF array_length(v_leaked, 1) > 0 THEN
        RAISE EXCEPTION 'PHASE22_ANON_STILL_EXECUTABLE: %', array_to_string(v_leaked, ', ');
    END IF;

    IF array_length(v_lost, 1) > 0 THEN
        RAISE EXCEPTION 'PHASE22_AUTHENTICATED_ACCESS_LOST: %', array_to_string(v_lost, ', ');
    END IF;

    RAISE NOTICE 'PHASE 22 OK — % fonksiyondan anon geri alindi, kullanici erisimi korundu.',
        array_length(v_anon_functions, 1);
END
$verify$;
