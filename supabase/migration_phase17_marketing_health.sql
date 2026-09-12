-- =============================================================================
-- LEXBNB PHASE 17 — IMMUTABLE MARKETING HEALTH SNAPSHOTS
-- Missing inputs remain explicit; backend-derived scores cannot be forged.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.property_marketing_health_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    input_fingerprint CHAR(64) NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
    scoring_version VARCHAR(50) NOT NULL,
    as_of TIMESTAMPTZ NOT NULL,
    status VARCHAR(25) NOT NULL CHECK (status IN ('REPORTABLE', 'INSUFFICIENT_DATA')),
    score NUMERIC(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    coverage_percent NUMERIC(5,2) NOT NULL CHECK (coverage_percent >= 0 AND coverage_percent <= 100),
    confidence_index NUMERIC(4,3) NOT NULL CHECK (confidence_index >= 0 AND confidence_index <= 1),
    confidence_tier VARCHAR(20) NOT NULL CHECK (confidence_tier IN ('INSUFFICIENT', 'MEDIUM', 'HIGH')),
    components JSONB NOT NULL CHECK (jsonb_typeof(components) = 'array'),
    missing_components JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(missing_components) = 'array'),
    scoring_method VARCHAR(60) NOT NULL DEFAULT 'RENORMALIZED_AVAILABLE_COMPONENTS'
        CHECK (scoring_method = 'RENORMALIZED_AVAILABLE_COMPONENTS'),
    missing_data_imputed BOOLEAN NOT NULL DEFAULT FALSE CHECK (missing_data_imputed = FALSE),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, property_id, input_fingerprint, scoring_version),
    CONSTRAINT fk_marketing_health_property_tenant
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES public.properties (tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT chk_marketing_health_reportability CHECK (
        (status = 'REPORTABLE' AND score IS NOT NULL AND coverage_percent >= 50
            AND confidence_tier IN ('MEDIUM', 'HIGH'))
        OR (status = 'INSUFFICIENT_DATA' AND score IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_marketing_health_property_asof
    ON public.property_marketing_health_snapshots (tenant_id, property_id, as_of DESC);

ALTER TABLE public.property_marketing_health_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view listing marketing health" ON public.property_marketing_health_snapshots;
CREATE POLICY "Members view listing marketing health"
ON public.property_marketing_health_snapshots FOR SELECT
USING (public.is_tenant_member(tenant_id));

-- No authenticated direct mutation policy is intentional. A service-role
-- worker records immutable, idempotent snapshots.
