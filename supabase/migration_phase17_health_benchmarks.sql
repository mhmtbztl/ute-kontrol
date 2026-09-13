-- =============================================================================
-- LEXBNB PHASE 17 — IMMUTABLE, SOURCE-ATTRIBUTED MARKETING BENCHMARKS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.property_marketing_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    benchmark_fingerprint CHAR(64) NOT NULL CHECK (benchmark_fingerprint ~ '^[0-9a-f]{64}$'),
    source_kind VARCHAR(40) NOT NULL CHECK (source_kind IN ('PORTFOLIO_HISTORY', 'MARKET_PROVIDER', 'MANUAL_RESEARCH')),
    source_record_id TEXT,
    effective_from DATE NOT NULL,
    effective_to_exclusive DATE,
    search_to_view_ctr_percent NUMERIC(8,3) CHECK (search_to_view_ctr_percent IS NULL OR search_to_view_ctr_percent > 0),
    view_to_booking_conversion_percent NUMERIC(8,3) CHECK (view_to_booking_conversion_percent IS NULL OR view_to_booking_conversion_percent > 0),
    normalized_impressions_per_listing_day NUMERIC(14,3) CHECK (normalized_impressions_per_listing_day IS NULL OR normalized_impressions_per_listing_day > 0),
    recommended_active_media_count INTEGER CHECK (recommended_active_media_count IS NULL OR recommended_active_media_count > 0),
    max_distribution_cost_percent NUMERIC(6,3) CHECK (max_distribution_cost_percent IS NULL OR (max_distribution_cost_percent >= 0 AND max_distribution_cost_percent <= 100)),
    minimum_direct_reservation_share_percent NUMERIC(6,3) CHECK (minimum_direct_reservation_share_percent IS NULL OR (minimum_direct_reservation_share_percent >= 0 AND minimum_direct_reservation_share_percent <= 100)),
    confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
    recorded_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, property_id, benchmark_fingerprint),
    CONSTRAINT fk_marketing_benchmark_property_tenant
        FOREIGN KEY (tenant_id, property_id) REFERENCES public.properties (tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT chk_marketing_benchmark_window CHECK (effective_to_exclusive IS NULL OR effective_to_exclusive > effective_from),
    CONSTRAINT chk_marketing_benchmark_has_value CHECK (num_nonnulls(
        search_to_view_ctr_percent, view_to_booking_conversion_percent,
        normalized_impressions_per_listing_day, recommended_active_media_count,
        max_distribution_cost_percent, minimum_direct_reservation_share_percent
    ) > 0)
);

-- Keep reruns safe when this migration existed before the economics fields.
ALTER TABLE public.property_marketing_benchmarks
    ADD COLUMN IF NOT EXISTS max_distribution_cost_percent NUMERIC(6,3)
        CHECK (max_distribution_cost_percent IS NULL OR (max_distribution_cost_percent >= 0 AND max_distribution_cost_percent <= 100)),
    ADD COLUMN IF NOT EXISTS minimum_direct_reservation_share_percent NUMERIC(6,3)
        CHECK (minimum_direct_reservation_share_percent IS NULL OR (minimum_direct_reservation_share_percent >= 0 AND minimum_direct_reservation_share_percent <= 100));
ALTER TABLE public.property_marketing_benchmarks DROP CONSTRAINT IF EXISTS chk_marketing_benchmark_has_value;
ALTER TABLE public.property_marketing_benchmarks ADD CONSTRAINT chk_marketing_benchmark_has_value CHECK (num_nonnulls(
    search_to_view_ctr_percent, view_to_booking_conversion_percent,
    normalized_impressions_per_listing_day, recommended_active_media_count,
    max_distribution_cost_percent, minimum_direct_reservation_share_percent
) > 0);

CREATE INDEX IF NOT EXISTS idx_property_marketing_benchmarks_effective
    ON public.property_marketing_benchmarks (tenant_id, property_id, effective_from DESC);
ALTER TABLE public.property_marketing_benchmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view property marketing benchmarks" ON public.property_marketing_benchmarks;
CREATE POLICY "Members view property marketing benchmarks"
ON public.property_marketing_benchmarks FOR SELECT
USING (public.is_tenant_member(tenant_id));

DROP FUNCTION IF EXISTS public.record_property_marketing_benchmark(
    UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, JSONB
);
CREATE OR REPLACE FUNCTION public.record_property_marketing_benchmark(
    p_tenant_id UUID, p_property_id UUID, p_benchmark_fingerprint TEXT,
    p_source_kind TEXT, p_source_record_id TEXT, p_effective_from DATE,
    p_effective_to_exclusive DATE, p_search_to_view_ctr_percent NUMERIC,
    p_view_to_booking_conversion_percent NUMERIC,
    p_normalized_impressions_per_listing_day NUMERIC,
    p_recommended_active_media_count INTEGER, p_max_distribution_cost_percent NUMERIC,
    p_minimum_direct_reservation_share_percent NUMERIC, p_confidence NUMERIC, p_evidence JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
    IF auth.uid() IS NULL OR COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MARKETING_BENCHMARK' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.properties WHERE tenant_id = p_tenant_id AND id = p_property_id) THEN
        RAISE EXCEPTION 'BENCHMARK_PROPERTY_SCOPE_MISMATCH' USING ERRCODE = '42501';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        p_tenant_id::TEXT || ':' || p_property_id::TEXT || ':' || p_benchmark_fingerprint, 0));
    SELECT id INTO v_id FROM public.property_marketing_benchmarks
    WHERE tenant_id = p_tenant_id AND property_id = p_property_id
      AND benchmark_fingerprint = p_benchmark_fingerprint;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    INSERT INTO public.property_marketing_benchmarks (
        tenant_id, property_id, benchmark_fingerprint, source_kind, source_record_id,
        effective_from, effective_to_exclusive, search_to_view_ctr_percent,
        view_to_booking_conversion_percent, normalized_impressions_per_listing_day,
        recommended_active_media_count, max_distribution_cost_percent,
        minimum_direct_reservation_share_percent, confidence, evidence
    ) VALUES (
        p_tenant_id, p_property_id, p_benchmark_fingerprint, upper(trim(p_source_kind)),
        NULLIF(trim(p_source_record_id), ''), p_effective_from, p_effective_to_exclusive,
        p_search_to_view_ctr_percent, p_view_to_booking_conversion_percent,
        p_normalized_impressions_per_listing_day, p_recommended_active_media_count,
        p_max_distribution_cost_percent, p_minimum_direct_reservation_share_percent,
        p_confidence, COALESCE(p_evidence, '{}'::jsonb)
    ) RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_property_marketing_benchmark(
    UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, NUMERIC, NUMERIC, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_property_marketing_benchmark(
    UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, INTEGER, NUMERIC, NUMERIC, NUMERIC, JSONB
) TO authenticated;

-- No direct mutation policies: benchmark history is append-only through the RPC.
