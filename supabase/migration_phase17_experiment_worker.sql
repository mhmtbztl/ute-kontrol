-- =============================================================================
-- LEXBNB PHASE 17 — LEASED OBSERVATIONAL EXPERIMENT EVALUATION WORKER
-- Exact-window snapshots are linked as immutable evidence; results are non-causal.
-- =============================================================================

ALTER TABLE public.listing_change_experiments
    ADD COLUMN IF NOT EXISTS attempt_count SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lease_token UUID,
    ADD COLUMN IF NOT EXISTS error_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS error_detail TEXT;

ALTER TABLE public.listing_change_experiments
    DROP CONSTRAINT IF EXISTS listing_change_experiments_status_check;
ALTER TABLE public.listing_change_experiments
    ADD CONSTRAINT listing_change_experiments_status_check CHECK (
        status IN ('COLLECTING', 'READY', 'PROCESSING', 'EVALUATED', 'FAILED', 'CANCELLED')
    );

ALTER TABLE public.listing_change_experiments
    DROP CONSTRAINT IF EXISTS chk_listing_experiment_worker_lease;
ALTER TABLE public.listing_change_experiments
    ADD CONSTRAINT chk_listing_experiment_worker_lease CHECK (
        attempt_count BETWEEN 0 AND 3
        AND ((status = 'PROCESSING' AND lease_expires_at IS NOT NULL AND lease_token IS NOT NULL)
          OR (status <> 'PROCESSING' AND lease_expires_at IS NULL AND lease_token IS NULL))
    ) NOT VALID;

CREATE OR REPLACE FUNCTION public.claim_listing_change_experiment(p_experiment_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_experiment public.listing_change_experiments%ROWTYPE;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;

    UPDATE public.listing_change_experiments
    SET status = 'FAILED', error_code = 'WORKER_RETRY_EXHAUSTED',
        error_detail = 'The evaluation worker lease expired three times.',
        lease_expires_at = NULL, lease_token = NULL, updated_at = NOW()
    WHERE status = 'PROCESSING' AND lease_expires_at <= NOW() AND attempt_count >= 3;

    SELECT * INTO v_experiment
    FROM public.listing_change_experiments experiment
    WHERE (experiment.status IN ('COLLECTING', 'READY')
        OR (experiment.status = 'PROCESSING' AND experiment.lease_expires_at <= NOW() AND experiment.attempt_count < 3))
      AND experiment.after_end_exclusive <= CURRENT_DATE
      AND (p_experiment_id IS NULL OR experiment.id = p_experiment_id)
    ORDER BY experiment.after_end_exclusive, experiment.created_at, experiment.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN RETURN NULL; END IF;

    UPDATE public.listing_change_experiments
    SET status = 'PROCESSING', attempt_count = attempt_count + 1,
        lease_expires_at = NOW() + INTERVAL '5 minutes', lease_token = gen_random_uuid(),
        error_code = NULL, error_detail = NULL, updated_at = NOW()
    WHERE id = v_experiment.id
    RETURNING * INTO v_experiment;

    RETURN to_jsonb(v_experiment);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_listing_change_experiment(
    p_experiment_id UUID,
    p_lease_token UUID,
    p_before_snapshot_id UUID,
    p_after_snapshot_id UUID,
    p_evaluation_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_experiment public.listing_change_experiments%ROWTYPE;
    v_verdict TEXT;
    v_confidence TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF p_evaluation_payload IS NULL OR jsonb_typeof(p_evaluation_payload) <> 'object'
       OR p_evaluation_payload ->> 'method' IS DISTINCT FROM 'BEFORE_AFTER_OBSERVATIONAL'
       OR p_evaluation_payload -> 'causalClaim' IS DISTINCT FROM 'false'::jsonb
       OR p_evaluation_payload ->> 'experimentId' IS DISTINCT FROM p_experiment_id::TEXT THEN
        RAISE EXCEPTION 'INVALID_EXPERIMENT_EVALUATION_PAYLOAD' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_experiment FROM public.listing_change_experiments
    WHERE id = p_experiment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EXPERIMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
    IF v_experiment.status <> 'PROCESSING' OR v_experiment.lease_token IS DISTINCT FROM p_lease_token THEN
        RAISE EXCEPTION 'EXPERIMENT_NOT_PROCESSING' USING ERRCODE = '55000';
    END IF;
    IF p_evaluation_payload ->> 'tenantId' IS DISTINCT FROM v_experiment.tenant_id::TEXT
       OR p_evaluation_payload ->> 'propertyId' IS DISTINCT FROM v_experiment.property_id::TEXT
       OR p_evaluation_payload ->> 'channelListingId' IS DISTINCT FROM v_experiment.channel_listing_id::TEXT
       OR p_evaluation_payload ->> 'metric' IS DISTINCT FROM v_experiment.primary_metric THEN
        RAISE EXCEPTION 'EXPERIMENT_EVALUATION_SCOPE_MISMATCH' USING ERRCODE = '22023';
    END IF;

    v_verdict := p_evaluation_payload ->> 'verdict';
    v_confidence := p_evaluation_payload ->> 'confidenceTier';
    IF v_verdict NOT IN ('POSITIVE_ASSOCIATION', 'NEGATIVE_ASSOCIATION', 'NO_CLEAR_CHANGE', 'CONFOUNDED', 'INSUFFICIENT_DATA')
       OR v_confidence NOT IN ('INSUFFICIENT', 'LOW', 'MEDIUM', 'HIGH') THEN
        RAISE EXCEPTION 'INVALID_EXPERIMENT_EVALUATION_RESULT' USING ERRCODE = '22023';
    END IF;
    IF v_verdict <> 'INSUFFICIENT_DATA' AND (p_before_snapshot_id IS NULL OR p_after_snapshot_id IS NULL) THEN
        RAISE EXCEPTION 'EXPERIMENT_EVIDENCE_REQUIRED' USING ERRCODE = '22023';
    END IF;

    IF p_before_snapshot_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.channel_performance_snapshots snapshot
        WHERE snapshot.id = p_before_snapshot_id
          AND snapshot.tenant_id = v_experiment.tenant_id
          AND snapshot.channel_listing_id = v_experiment.channel_listing_id
          AND snapshot.period_start = v_experiment.before_start_date
          AND snapshot.period_end_exclusive = v_experiment.before_end_exclusive
          AND snapshot.validation_status IN ('VALID', 'PARTIAL')
    ) THEN RAISE EXCEPTION 'INVALID_BEFORE_SNAPSHOT' USING ERRCODE = '22023'; END IF;

    IF p_after_snapshot_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.channel_performance_snapshots snapshot
        WHERE snapshot.id = p_after_snapshot_id
          AND snapshot.tenant_id = v_experiment.tenant_id
          AND snapshot.channel_listing_id = v_experiment.channel_listing_id
          AND snapshot.period_start = v_experiment.after_start_date
          AND snapshot.period_end_exclusive = v_experiment.after_end_exclusive
          AND snapshot.validation_status IN ('VALID', 'PARTIAL')
    ) THEN RAISE EXCEPTION 'INVALID_AFTER_SNAPSHOT' USING ERRCODE = '22023'; END IF;

    IF p_before_snapshot_id IS NOT NULL THEN
        INSERT INTO public.listing_experiment_snapshots (tenant_id, channel_listing_id, experiment_id, snapshot_id, window_role)
        VALUES (v_experiment.tenant_id, v_experiment.channel_listing_id, v_experiment.id, p_before_snapshot_id, 'BEFORE')
        ON CONFLICT (tenant_id, experiment_id, snapshot_id) DO NOTHING;
    END IF;
    IF p_after_snapshot_id IS NOT NULL THEN
        INSERT INTO public.listing_experiment_snapshots (tenant_id, channel_listing_id, experiment_id, snapshot_id, window_role)
        VALUES (v_experiment.tenant_id, v_experiment.channel_listing_id, v_experiment.id, p_after_snapshot_id, 'AFTER')
        ON CONFLICT (tenant_id, experiment_id, snapshot_id) DO NOTHING;
    END IF;

    UPDATE public.listing_change_experiments
    SET status = 'EVALUATED', verdict = v_verdict, confidence_tier = v_confidence,
        confounders = COALESCE(p_evaluation_payload -> 'confounders', '[]'::jsonb),
        evaluation_payload = p_evaluation_payload, evaluated_at = NOW(),
        lease_expires_at = NULL, lease_token = NULL, error_code = NULL, error_detail = NULL,
        updated_at = NOW()
    WHERE id = v_experiment.id;

    RETURN jsonb_build_object('experimentId', v_experiment.id, 'status', 'EVALUATED', 'verdict', v_verdict);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_listing_change_experiment(
    p_experiment_id UUID, p_lease_token UUID, p_error_code TEXT, p_error_detail TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated INTEGER;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(trim(p_error_code), '') IS NULL THEN
        RAISE EXCEPTION 'EXPERIMENT_ERROR_CODE_REQUIRED' USING ERRCODE = '22023';
    END IF;
    UPDATE public.listing_change_experiments
    SET status = 'FAILED', error_code = left(trim(p_error_code), 100),
        error_detail = left(p_error_detail, 2000), lease_expires_at = NULL,
        lease_token = NULL, updated_at = NOW()
    WHERE id = p_experiment_id AND status = 'PROCESSING' AND lease_token = p_lease_token;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'EXPERIMENT_NOT_ACTIVE' USING ERRCODE = '55000'; END IF;
    RETURN jsonb_build_object('experimentId', p_experiment_id, 'status', 'FAILED');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_listing_change_experiment(UUID) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.complete_listing_change_experiment(UUID, UUID, UUID, UUID, JSONB) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.fail_listing_change_experiment(UUID, UUID, TEXT, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_listing_change_experiment(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_listing_change_experiment(UUID, UUID, UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_listing_change_experiment(UUID, UUID, TEXT, TEXT) TO service_role;
