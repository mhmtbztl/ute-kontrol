-- =============================================================================
-- LEXBNB PHASE 17 — LISTING CHANGE IMPACT EVALUATION
-- Observational before/after evidence with immutable snapshot provenance.
-- Depends on the Phase 17 foundation and media migrations.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_snapshot_tenant_listing_id
    ON public.channel_performance_snapshots (tenant_id, channel_listing_id, id);

CREATE TABLE IF NOT EXISTS public.listing_change_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    channel_listing_id UUID NOT NULL,
    change_type VARCHAR(40) NOT NULL CHECK (change_type IN (
        'COVER_MEDIA', 'GALLERY_ORDER', 'LISTING_CONTENT', 'PRICE', 'POLICY'
    )),
    old_media_id UUID,
    new_media_id UUID,
    change_date DATE NOT NULL,
    before_start_date DATE NOT NULL,
    before_end_exclusive DATE NOT NULL,
    after_start_date DATE NOT NULL,
    after_end_exclusive DATE NOT NULL,
    primary_metric VARCHAR(60) NOT NULL CHECK (primary_metric IN (
        'SEARCH_TO_VIEW_CTR_PERCENT', 'VIEW_TO_BOOKING_CONVERSION_PERCENT'
    )),
    minimum_days_per_window SMALLINT NOT NULL DEFAULT 14
        CHECK (minimum_days_per_window >= 7 AND minimum_days_per_window <= 90),
    minimum_sample_per_window INTEGER NOT NULL DEFAULT 300
        CHECK (minimum_sample_per_window > 0),
    max_price_drift_percent NUMERIC(6,3) NOT NULL DEFAULT 15
        CHECK (max_price_drift_percent >= 0 AND max_price_drift_percent <= 100),
    status VARCHAR(20) NOT NULL DEFAULT 'COLLECTING' CHECK (
        status IN ('COLLECTING', 'READY', 'EVALUATED', 'CANCELLED')
    ),
    verdict VARCHAR(30) CHECK (verdict IN (
        'POSITIVE_ASSOCIATION', 'NEGATIVE_ASSOCIATION', 'NO_CLEAR_CHANGE',
        'CONFOUNDED', 'INSUFFICIENT_DATA'
    )),
    confidence_tier VARCHAR(20) CHECK (confidence_tier IN (
        'INSUFFICIENT', 'LOW', 'MEDIUM', 'HIGH'
    )),
    confounders JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(confounders) = 'array'),
    evaluation_payload JSONB CHECK (
        evaluation_payload IS NULL OR jsonb_typeof(evaluation_payload) = 'object'
    ),
    evaluated_at TIMESTAMPTZ,
    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, property_id, id),
    UNIQUE (tenant_id, channel_listing_id, id),
    CONSTRAINT fk_listing_experiment_property_tenant
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES public.properties (tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_listing_experiment_listing_same_property
        FOREIGN KEY (tenant_id, property_id, channel_listing_id)
        REFERENCES public.property_channel_listings (tenant_id, property_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_listing_experiment_old_media_same_property
        FOREIGN KEY (tenant_id, property_id, old_media_id)
        REFERENCES public.property_media (tenant_id, property_id, id)
        ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT fk_listing_experiment_new_media_same_property
        FOREIGN KEY (tenant_id, property_id, new_media_id)
        REFERENCES public.property_media (tenant_id, property_id, id)
        ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT chk_listing_experiment_windows CHECK (
        before_end_exclusive > before_start_date
        AND after_end_exclusive > after_start_date
        AND (before_end_exclusive - before_start_date) >= minimum_days_per_window
        AND (after_end_exclusive - after_start_date) >= minimum_days_per_window
        AND before_end_exclusive <= change_date
        AND after_start_date >= change_date
    ),
    CONSTRAINT chk_listing_experiment_result_state CHECK (
        (status = 'EVALUATED' AND verdict IS NOT NULL AND confidence_tier IS NOT NULL
            AND evaluation_payload IS NOT NULL AND evaluated_at IS NOT NULL)
        OR (status <> 'EVALUATED' AND verdict IS NULL AND confidence_tier IS NULL
            AND evaluation_payload IS NULL AND evaluated_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_listing_experiments_due
    ON public.listing_change_experiments
    (tenant_id, status, after_end_exclusive)
    WHERE status IN ('COLLECTING', 'READY');

CREATE TABLE IF NOT EXISTS public.listing_experiment_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    channel_listing_id UUID NOT NULL,
    experiment_id UUID NOT NULL,
    snapshot_id UUID NOT NULL,
    window_role VARCHAR(10) NOT NULL CHECK (window_role IN ('BEFORE', 'AFTER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, experiment_id, snapshot_id),
    CONSTRAINT fk_experiment_snapshot_experiment_same_listing
        FOREIGN KEY (tenant_id, channel_listing_id, experiment_id)
        REFERENCES public.listing_change_experiments (tenant_id, channel_listing_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_experiment_snapshot_source_same_listing
        FOREIGN KEY (tenant_id, channel_listing_id, snapshot_id)
        REFERENCES public.channel_performance_snapshots (tenant_id, channel_listing_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_listing_experiment_snapshots_window
    ON public.listing_experiment_snapshots (tenant_id, experiment_id, window_role);

-- Managers register a change and its measurement windows. Snapshot selection,
-- readiness and results remain worker-owned so clients cannot forge evidence.
CREATE OR REPLACE FUNCTION public.request_listing_change_evaluation(
    p_tenant_id UUID,
    p_property_id UUID,
    p_channel_listing_id UUID,
    p_change_type TEXT,
    p_change_date DATE,
    p_before_start_date DATE,
    p_before_end_exclusive DATE,
    p_after_start_date DATE,
    p_after_end_exclusive DATE,
    p_primary_metric TEXT DEFAULT 'SEARCH_TO_VIEW_CTR_PERCENT',
    p_old_media_id UUID DEFAULT NULL,
    p_new_media_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_experiment_id UUID;
BEGIN
    IF auth.uid() IS NULL
       OR COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_LISTING_CHANGE_EVALUATION' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.property_channel_listings listing
        WHERE listing.tenant_id = p_tenant_id
          AND listing.property_id = p_property_id
          AND listing.id = p_channel_listing_id
    ) THEN
        RAISE EXCEPTION 'LISTING_PROPERTY_TENANT_MISMATCH' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.listing_change_experiments (
        tenant_id, property_id, channel_listing_id, change_type,
        old_media_id, new_media_id, change_date,
        before_start_date, before_end_exclusive,
        after_start_date, after_end_exclusive, primary_metric, created_by
    ) VALUES (
        p_tenant_id, p_property_id, p_channel_listing_id, upper(trim(p_change_type)),
        p_old_media_id, p_new_media_id, p_change_date,
        p_before_start_date, p_before_end_exclusive,
        p_after_start_date, p_after_end_exclusive, upper(trim(p_primary_metric)), auth.uid()
    )
    RETURNING id INTO v_experiment_id;

    RETURN v_experiment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_listing_change_evaluation(
    UUID, UUID, UUID, TEXT, DATE, DATE, DATE, DATE, DATE, TEXT, UUID, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_listing_change_evaluation(
    UUID, UUID, UUID, TEXT, DATE, DATE, DATE, DATE, DATE, TEXT, UUID, UUID
) TO authenticated;

ALTER TABLE public.listing_change_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_experiment_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view listing change experiments" ON public.listing_change_experiments;
CREATE POLICY "Members view listing change experiments"
ON public.listing_change_experiments FOR SELECT
USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Members view listing experiment evidence" ON public.listing_experiment_snapshots;
CREATE POLICY "Members view listing experiment evidence"
ON public.listing_experiment_snapshots FOR SELECT
USING (public.is_tenant_member(tenant_id));

-- No authenticated direct mutation policies are intentional. The request RPC
-- creates experiments; a service-role worker links snapshots and records results.

DROP TRIGGER IF EXISTS trg_touch_listing_change_experiments_updated_at
    ON public.listing_change_experiments;
CREATE TRIGGER trg_touch_listing_change_experiments_updated_at
BEFORE UPDATE ON public.listing_change_experiments
FOR EACH ROW EXECUTE FUNCTION public.touch_marketing_updated_at();
