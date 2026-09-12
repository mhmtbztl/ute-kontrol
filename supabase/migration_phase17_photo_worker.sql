-- =============================================================================
-- LEXBNB PHASE 17 — SERVICE-ROLE PHOTO ANALYSIS WORKER LIFECYCLE
-- Atomic claim, validated aggregate persistence and terminal failure recording.
-- =============================================================================

ALTER TABLE public.photo_analysis_runs
    ADD COLUMN IF NOT EXISTS result_payload JSONB,
    ADD COLUMN IF NOT EXISTS result_schema_validated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attempt_count SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lease_token UUID;

UPDATE public.photo_analysis_runs
SET lease_expires_at = NOW(), lease_token = gen_random_uuid()
WHERE status = 'PROCESSING' AND (lease_expires_at IS NULL OR lease_token IS NULL);

ALTER TABLE public.photo_analysis_runs
    DROP CONSTRAINT IF EXISTS chk_photo_analysis_run_result_payload;
ALTER TABLE public.photo_analysis_runs
    ADD CONSTRAINT chk_photo_analysis_run_result_payload CHECK (
        result_payload IS NULL OR jsonb_typeof(result_payload) = 'object'
    );

ALTER TABLE public.photo_analysis_runs
    DROP CONSTRAINT IF EXISTS chk_photo_analysis_success_result;
ALTER TABLE public.photo_analysis_runs
    ADD CONSTRAINT chk_photo_analysis_success_result CHECK (
        status <> 'SUCCEEDED'
        OR (result_payload IS NOT NULL AND result_schema_validated_at IS NOT NULL)
    ) NOT VALID;

ALTER TABLE public.photo_analysis_runs
    DROP CONSTRAINT IF EXISTS chk_photo_analysis_worker_lease;
ALTER TABLE public.photo_analysis_runs
    ADD CONSTRAINT chk_photo_analysis_worker_lease CHECK (
        attempt_count BETWEEN 0 AND 3
        AND ((status = 'PROCESSING' AND lease_expires_at IS NOT NULL AND lease_token IS NOT NULL)
          OR (status <> 'PROCESSING' AND lease_expires_at IS NULL AND lease_token IS NULL))
    ) NOT VALID;

CREATE OR REPLACE FUNCTION public.claim_photo_analysis_run(p_run_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_run public.photo_analysis_runs%ROWTYPE;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;

    UPDATE public.photo_analysis_runs
    SET status = 'FAILED', error_code = 'WORKER_RETRY_EXHAUSTED',
        error_detail = 'The analysis worker lease expired three times.',
        completed_at = NOW(), lease_expires_at = NULL, lease_token = NULL
    WHERE status = 'PROCESSING' AND lease_expires_at <= NOW() AND attempt_count >= 3;

    SELECT * INTO v_run
    FROM public.photo_analysis_runs run
    WHERE (run.status = 'QUEUED'
        OR (run.status = 'PROCESSING' AND run.lease_expires_at <= NOW() AND run.attempt_count < 3))
      AND (p_run_id IS NULL OR run.id = p_run_id)
    ORDER BY run.requested_at, run.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN RETURN NULL; END IF;

    UPDATE public.photo_analysis_runs
    SET status = 'PROCESSING', started_at = COALESCE(started_at, NOW()),
        lease_expires_at = NOW() + INTERVAL '5 minutes', attempt_count = attempt_count + 1,
        lease_token = gen_random_uuid(),
        error_code = NULL, error_detail = NULL
    WHERE id = v_run.id
    RETURNING * INTO v_run;

    RETURN to_jsonb(v_run);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_photo_analysis_run(
    p_run_id UUID,
    p_lease_token UUID,
    p_provider TEXT,
    p_model_version TEXT,
    p_provider_request_id TEXT,
    p_usage_metadata JSONB,
    p_result_payload JSONB,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_run public.photo_analysis_runs%ROWTYPE;
    v_item_count INTEGER;
    v_cached_count INTEGER;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(trim(p_provider), '') IS NULL OR NULLIF(trim(p_model_version), '') IS NULL
       OR jsonb_typeof(COALESCE(p_usage_metadata, '{}'::jsonb)) <> 'object'
       OR p_result_payload IS NULL OR jsonb_typeof(p_result_payload) <> 'object'
       OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'INVALID_PHOTO_ANALYSIS_COMPLETION' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_run FROM public.photo_analysis_runs WHERE id = p_run_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PHOTO_ANALYSIS_RUN_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF v_run.status <> 'PROCESSING' OR v_run.lease_token IS DISTINCT FROM p_lease_token THEN
        RAISE EXCEPTION 'PHOTO_ANALYSIS_RUN_NOT_PROCESSING' USING ERRCODE = '55000';
    END IF;
    IF p_result_payload ->> 'runId' IS DISTINCT FROM v_run.id::TEXT
       OR p_result_payload ->> 'propertyId' IS DISTINCT FROM v_run.property_id::TEXT
       OR p_result_payload ->> 'schemaVersion' IS DISTINCT FROM v_run.schema_version THEN
        RAISE EXCEPTION 'PHOTO_ANALYSIS_RESULT_SCOPE_MISMATCH' USING ERRCODE = '22023';
    END IF;

    SELECT count(*), count(*) FILTER (WHERE item.status = 'CACHED')
    INTO v_item_count, v_cached_count
    FROM jsonb_to_recordset(p_items) AS item(
        "mediaId" UUID, status TEXT, "cacheKey" TEXT,
        "resultPayload" JSONB, confidence NUMERIC, "errorCode" TEXT
    );
    IF v_item_count < 1 OR v_item_count <> (
        SELECT count(DISTINCT item."mediaId")
        FROM jsonb_to_recordset(p_items) AS item("mediaId" UUID)
    ) THEN
        RAISE EXCEPTION 'INVALID_OR_DUPLICATE_ANALYSIS_ITEMS' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_items) AS item(
            "mediaId" UUID, status TEXT, "cacheKey" TEXT,
            "resultPayload" JSONB, confidence NUMERIC, "errorCode" TEXT
        )
        LEFT JOIN public.property_media media
          ON media.tenant_id = v_run.tenant_id
         AND media.property_id = v_run.property_id
         AND media.id = item."mediaId"
        WHERE media.id IS NULL OR media.media_status <> 'ACTIVE'
           OR item.status NOT IN ('CACHED', 'SUCCEEDED')
           OR item."cacheKey" !~ '^[0-9a-f]{64}$'
           OR jsonb_typeof(item."resultPayload") <> 'object'
           OR item.confidence IS NULL OR item.confidence < 0 OR item.confidence > 1
           OR item."errorCode" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'INVALID_ANALYSIS_ITEM_PAYLOAD' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.photo_analysis_items (
        tenant_id, property_id, run_id, media_id, status,
        cache_key, result_payload, confidence, error_code
    )
    SELECT v_run.tenant_id, v_run.property_id, v_run.id, item."mediaId",
           item.status, item."cacheKey", item."resultPayload", item.confidence, NULL
    FROM jsonb_to_recordset(p_items) AS item(
        "mediaId" UUID, status TEXT, "cacheKey" TEXT,
        "resultPayload" JSONB, confidence NUMERIC, "errorCode" TEXT
    );

    UPDATE public.photo_analysis_runs
    SET status = 'SUCCEEDED', provider = trim(p_provider), model_version = trim(p_model_version),
        provider_request_id = p_provider_request_id,
        cached_item_count = v_cached_count,
        analyzed_item_count = v_item_count - v_cached_count,
        usage_metadata = COALESCE(p_usage_metadata, '{}'::jsonb),
        result_payload = p_result_payload, result_schema_validated_at = NOW(),
        completed_at = NOW(), lease_expires_at = NULL, lease_token = NULL,
        error_code = NULL, error_detail = NULL
    WHERE id = v_run.id;

    RETURN jsonb_build_object('runId', v_run.id, 'status', 'SUCCEEDED',
        'cachedItemCount', v_cached_count, 'analyzedItemCount', v_item_count - v_cached_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_photo_analysis_run(
    p_run_id UUID,
    p_lease_token UUID,
    p_error_code TEXT,
    p_error_detail TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(trim(p_error_code), '') IS NULL THEN
        RAISE EXCEPTION 'PHOTO_ANALYSIS_ERROR_CODE_REQUIRED' USING ERRCODE = '22023';
    END IF;
    UPDATE public.photo_analysis_runs
    SET status = 'FAILED', error_code = left(trim(p_error_code), 100),
        error_detail = left(p_error_detail, 2000), completed_at = NOW(),
        lease_expires_at = NULL, lease_token = NULL
    WHERE id = p_run_id AND status = 'PROCESSING' AND lease_token = p_lease_token;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RAISE EXCEPTION 'PHOTO_ANALYSIS_RUN_NOT_ACTIVE' USING ERRCODE = '55000';
    END IF;
    RETURN jsonb_build_object('runId', p_run_id, 'status', 'FAILED');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_photo_analysis_run(UUID) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.complete_photo_analysis_run(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.fail_photo_analysis_run(UUID, UUID, TEXT, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_photo_analysis_run(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_photo_analysis_run(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_photo_analysis_run(UUID, UUID, TEXT, TEXT) TO service_role;
