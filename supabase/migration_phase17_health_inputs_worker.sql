-- =============================================================================
-- LEXBNB PHASE 17 — RAW HEALTH INPUTS AND IMMUTABLE SNAPSHOT WRITER
-- No authenticated client can provide a final health score.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.property_marketing_health_inputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    component_key VARCHAR(40) NOT NULL CHECK (component_key IN (
        'PHOTO_QUALITY', 'CLICK_PERFORMANCE', 'CONVERSION_POWER', 'VISIBILITY_STRENGTH',
        'NET_ECONOMICS', 'REVIEW_STRENGTH', 'AVAILABILITY_FLEX', 'LISTING_DEPTH'
    )),
    measurement_kind VARCHAR(30) NOT NULL CHECK (measurement_kind IN ('DIRECT_SCORE', 'RATIO', 'NET_ECONOMICS')),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'UNAVAILABLE')),
    observed_value NUMERIC,
    reference_value NUMERIC,
    sample_size NUMERIC,
    min_sample_size NUMERIC,
    confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    reason VARCHAR(100),
    source_kind VARCHAR(60) NOT NULL,
    source_record_id TEXT,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
    input_fingerprint CHAR(64) NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
    as_of TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, property_id, component_key, input_fingerprint),
    CONSTRAINT fk_marketing_health_input_property_tenant
        FOREIGN KEY (tenant_id, property_id) REFERENCES public.properties (tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT chk_marketing_health_input_kind CHECK (
        (component_key = 'PHOTO_QUALITY' AND measurement_kind = 'DIRECT_SCORE')
        OR (component_key = 'NET_ECONOMICS' AND measurement_kind = 'NET_ECONOMICS')
        OR (component_key IN ('CLICK_PERFORMANCE', 'CONVERSION_POWER', 'VISIBILITY_STRENGTH',
            'REVIEW_STRENGTH', 'AVAILABILITY_FLEX', 'LISTING_DEPTH') AND measurement_kind = 'RATIO')
    ),
    CONSTRAINT chk_marketing_health_input_values CHECK (
        (status = 'UNAVAILABLE' AND reason IS NOT NULL)
        OR (status = 'AVAILABLE' AND observed_value IS NOT NULL AND sample_size IS NOT NULL
            AND ((measurement_kind = 'DIRECT_SCORE' AND observed_value BETWEEN 0 AND 100 AND confidence IS NOT NULL)
              OR (measurement_kind = 'RATIO' AND reference_value > 0 AND min_sample_size > 0)
              OR (measurement_kind = 'NET_ECONOMICS' AND reference_value > 0)))
    ),
    CONSTRAINT chk_marketing_health_input_expiry CHECK (expires_at IS NULL OR expires_at > as_of)
);

CREATE INDEX IF NOT EXISTS idx_marketing_health_inputs_latest
    ON public.property_marketing_health_inputs (tenant_id, property_id, component_key, as_of DESC);

ALTER TABLE public.property_marketing_health_inputs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view marketing health inputs" ON public.property_marketing_health_inputs;
CREATE POLICY "Members view marketing health inputs"
ON public.property_marketing_health_inputs FOR SELECT
USING (public.is_tenant_member(tenant_id));

ALTER TABLE public.property_marketing_health_snapshots
    ADD COLUMN IF NOT EXISTS source_input_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

CREATE OR REPLACE FUNCTION public.persist_property_marketing_health_snapshot(
    p_tenant_id UUID,
    p_property_id UUID,
    p_input_fingerprint TEXT,
    p_scoring_version TEXT,
    p_as_of TIMESTAMPTZ,
    p_result JSONB,
    p_source_input_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_snapshot_id UUID;
    v_status TEXT := p_result ->> 'status';
    v_score NUMERIC := NULLIF(p_result ->> 'score', '')::NUMERIC;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF p_input_fingerprint !~ '^[0-9a-f]{64}$' OR NULLIF(trim(p_scoring_version), '') IS NULL
       OR jsonb_typeof(p_result -> 'components') <> 'array'
       OR jsonb_typeof(p_result -> 'missingComponents') <> 'array'
       OR p_result ->> 'scoringMethod' IS DISTINCT FROM 'RENORMALIZED_AVAILABLE_COMPONENTS'
       OR p_result -> 'missingDataImputed' IS DISTINCT FROM 'false'::jsonb THEN
        RAISE EXCEPTION 'INVALID_MARKETING_HEALTH_RESULT' USING ERRCODE = '22023';
    END IF;
    IF cardinality(COALESCE(p_source_input_ids, ARRAY[]::UUID[])) = 0 THEN
        RAISE EXCEPTION 'HEALTH_SOURCE_INPUT_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(DISTINCT input.id) FROM public.property_marketing_health_inputs input
        WHERE input.id = ANY(p_source_input_ids) AND input.tenant_id = p_tenant_id
          AND input.property_id = p_property_id) <> cardinality(p_source_input_ids) THEN
        RAISE EXCEPTION 'HEALTH_SOURCE_SCOPE_MISMATCH' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.property_marketing_health_snapshots (
        tenant_id, property_id, input_fingerprint, scoring_version, as_of,
        status, score, coverage_percent, confidence_index, confidence_tier,
        components, missing_components, scoring_method, missing_data_imputed, source_input_ids
    ) VALUES (
        p_tenant_id, p_property_id, p_input_fingerprint, trim(p_scoring_version), p_as_of,
        v_status, v_score, (p_result ->> 'coveragePercent')::NUMERIC,
        (p_result ->> 'confidenceIndex')::NUMERIC, p_result ->> 'confidenceTier',
        p_result -> 'components', p_result -> 'missingComponents',
        p_result ->> 'scoringMethod', FALSE, p_source_input_ids
    )
    ON CONFLICT (tenant_id, property_id, input_fingerprint, scoring_version)
    DO NOTHING
    RETURNING id INTO v_snapshot_id;
    IF v_snapshot_id IS NULL THEN
        SELECT id INTO v_snapshot_id FROM public.property_marketing_health_snapshots
        WHERE tenant_id = p_tenant_id AND property_id = p_property_id
          AND input_fingerprint = p_input_fingerprint AND scoring_version = trim(p_scoring_version);
    END IF;
    RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_property_marketing_health_snapshot(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB, UUID[]) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_property_marketing_health_snapshot(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, JSONB, UUID[]) TO service_role;

-- No INSERT/UPDATE/DELETE policies are intentional. Trusted service-role importers
-- append raw component inputs; only the worker RPC writes final snapshots.
