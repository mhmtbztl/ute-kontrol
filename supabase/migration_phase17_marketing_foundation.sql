-- =============================================================================
-- LEXBNB PHASE 17 — REVENUE, DISTRIBUTION & LISTING INTELLIGENCE FOUNDATION
-- Channel listings, immutable raw performance snapshots and role-aware RLS.
-- =============================================================================

-- A composite candidate key lets every marketing FK prove tenant ownership at
-- the database boundary instead of trusting a client-supplied tenant_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_properties_tenant_id_pair
    ON public.properties (tenant_id, id);

-- -----------------------------------------------------------------------------
-- 1. PROPERTY CHANNEL LISTINGS
-- A property can have more than one listing on the same distribution channel.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_channel_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    channel_code VARCHAR(30) NOT NULL CHECK (
        channel_code IN ('AIRBNB', 'BOOKING_COM', 'VRBO', 'EXPEDIA', 'DIRECT', 'OTHER_OTA')
    ),
    external_listing_id VARCHAR(200),
    display_name VARCHAR(200),
    external_url TEXT,
    payout_currency CHAR(3) NOT NULL DEFAULT 'TRY'
        CHECK (payout_currency ~ '^[A-Z]{3}$'),
    listing_timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'PAUSED', 'DISCONNECTED', 'ARCHIVED')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),
    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, id),
    CONSTRAINT fk_channel_listing_property_tenant
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES public.properties (tenant_id, id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_listing_external_identity
    ON public.property_channel_listings (tenant_id, channel_code, external_listing_id)
    WHERE external_listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channel_listings_tenant_property
    ON public.property_channel_listings (tenant_id, property_id, status);

-- -----------------------------------------------------------------------------
-- 2. IMPORT BATCHES
-- Provenance and idempotency live outside individual metric rows.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_metric_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    source_type VARCHAR(30) NOT NULL CHECK (
        source_type IN ('MANUAL', 'CSV', 'AIRBNB_API', 'BOOKING_API', 'PMS_IMPORT')
    ),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'VALIDATED', 'COMMITTED', 'REJECTED')),
    source_schema_version VARCHAR(50) NOT NULL,
    idempotency_key VARCHAR(200) NOT NULL,
    source_file_name TEXT,
    validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(validation_summary) = 'object'),
    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_marketing_import_batches_tenant_created
    ON public.marketing_metric_import_batches (tenant_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. IMMUTABLE RAW PERFORMANCE SNAPSHOTS
-- Derived CTR/conversion values deliberately do not live in this table.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.channel_performance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    channel_listing_id UUID NOT NULL,
    import_batch_id UUID NOT NULL,
    period_start DATE NOT NULL,
    period_end_exclusive DATE NOT NULL,
    metric_definition_version VARCHAR(50) NOT NULL,
    impressions BIGINT,
    listing_views BIGINT,
    booking_attempts BIGINT,
    platform_reported_bookings BIGINT,
    wishlist_saves BIGINT,
    validation_status VARCHAR(20) NOT NULL DEFAULT 'VALID'
        CHECK (validation_status IN ('VALID', 'PARTIAL', 'NEEDS_REVIEW')),
    validation_issues JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(validation_issues) = 'array'),
    notes TEXT,
    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, import_batch_id, channel_listing_id, period_start, period_end_exclusive),
    CONSTRAINT chk_channel_snapshot_period
        CHECK (period_end_exclusive > period_start),
    CONSTRAINT chk_channel_snapshot_nonnegative_counts CHECK (
        (impressions IS NULL OR impressions >= 0)
        AND (listing_views IS NULL OR listing_views >= 0)
        AND (booking_attempts IS NULL OR booking_attempts >= 0)
        AND (platform_reported_bookings IS NULL OR platform_reported_bookings >= 0)
        AND (wishlist_saves IS NULL OR wishlist_saves >= 0)
    ),
    CONSTRAINT chk_channel_snapshot_funnel_order CHECK (
        (impressions IS NULL OR listing_views IS NULL OR listing_views <= impressions)
        AND (listing_views IS NULL OR booking_attempts IS NULL OR booking_attempts <= listing_views)
        AND (booking_attempts IS NULL OR platform_reported_bookings IS NULL OR platform_reported_bookings <= booking_attempts)
        AND (booking_attempts IS NOT NULL OR listing_views IS NULL OR platform_reported_bookings IS NULL OR platform_reported_bookings <= listing_views)
        AND (listing_views IS NULL OR wishlist_saves IS NULL OR wishlist_saves <= listing_views)
    ),
    CONSTRAINT fk_channel_snapshot_listing_tenant
        FOREIGN KEY (tenant_id, channel_listing_id)
        REFERENCES public.property_channel_listings (tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_channel_snapshot_batch_tenant
        FOREIGN KEY (tenant_id, import_batch_id)
        REFERENCES public.marketing_metric_import_batches (tenant_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_channel_snapshots_listing_period
    ON public.channel_performance_snapshots
    (tenant_id, channel_listing_id, period_start, period_end_exclusive);

-- Read model: rates are derived from raw counters and remain NULL when their
-- denominator is missing or zero.
CREATE OR REPLACE VIEW public.channel_performance_rates
WITH (security_invoker = true)
AS
SELECT
    s.id,
    s.tenant_id,
    s.channel_listing_id,
    s.import_batch_id,
    s.period_start,
    s.period_end_exclusive,
    s.metric_definition_version,
    s.impressions,
    s.listing_views,
    s.booking_attempts,
    s.platform_reported_bookings,
    s.wishlist_saves,
    CASE WHEN s.impressions > 0 AND s.listing_views IS NOT NULL
        THEN ROUND((s.listing_views::NUMERIC / s.impressions::NUMERIC) * 100, 3)
        ELSE NULL END AS search_to_view_ctr_percent,
    CASE WHEN s.listing_views > 0 AND s.platform_reported_bookings IS NOT NULL
        THEN ROUND((s.platform_reported_bookings::NUMERIC / s.listing_views::NUMERIC) * 100, 3)
        ELSE NULL END AS view_to_booking_conversion_percent,
    CASE WHEN s.impressions > 0 AND s.platform_reported_bookings IS NOT NULL
        THEN ROUND((s.platform_reported_bookings::NUMERIC / s.impressions::NUMERIC) * 100, 3)
        ELSE NULL END AS search_to_booking_conversion_percent,
    s.validation_status,
    s.validation_issues,
    s.notes,
    s.created_at
FROM public.channel_performance_snapshots s;

-- -----------------------------------------------------------------------------
-- 4. UPDATED-AT SUPPORT
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_marketing_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_channel_listings_updated_at
    ON public.property_channel_listings;
CREATE TRIGGER trg_touch_channel_listings_updated_at
BEFORE UPDATE ON public.property_channel_listings
FOR EACH ROW EXECUTE FUNCTION public.touch_marketing_updated_at();

DROP TRIGGER IF EXISTS trg_touch_marketing_import_batches_updated_at
    ON public.marketing_metric_import_batches;
CREATE TRIGGER trg_touch_marketing_import_batches_updated_at
BEFORE UPDATE ON public.marketing_metric_import_batches
FOR EACH ROW EXECUTE FUNCTION public.touch_marketing_updated_at();

-- -----------------------------------------------------------------------------
-- 5. ROLE-AWARE ROW LEVEL SECURITY
-- Snapshots are append-only to authenticated clients. Corrections are imported
-- as a new batch, preserving provenance.
-- -----------------------------------------------------------------------------
ALTER TABLE public.property_channel_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_metric_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_performance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view channel listings" ON public.property_channel_listings;
CREATE POLICY "Members view channel listings"
ON public.property_channel_listings FOR SELECT
USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers insert channel listings" ON public.property_channel_listings;
CREATE POLICY "Managers insert channel listings"
ON public.property_channel_listings FOR INSERT
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

DROP POLICY IF EXISTS "Managers update channel listings" ON public.property_channel_listings;
CREATE POLICY "Managers update channel listings"
ON public.property_channel_listings FOR UPDATE
USING (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
)
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

DROP POLICY IF EXISTS "Managers delete channel listings" ON public.property_channel_listings;
CREATE POLICY "Managers delete channel listings"
ON public.property_channel_listings FOR DELETE
USING (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

DROP POLICY IF EXISTS "Members view marketing imports" ON public.marketing_metric_import_batches;
CREATE POLICY "Members view marketing imports"
ON public.marketing_metric_import_batches FOR SELECT
USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Staff create marketing imports" ON public.marketing_metric_import_batches;
CREATE POLICY "Staff create marketing imports"
ON public.marketing_metric_import_batches FOR INSERT
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
    AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Staff update own draft marketing imports" ON public.marketing_metric_import_batches;
CREATE POLICY "Staff update own draft marketing imports"
ON public.marketing_metric_import_batches FOR UPDATE
USING (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
    AND status = 'DRAFT'
    AND created_by = auth.uid()
)
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
    AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Members view channel snapshots" ON public.channel_performance_snapshots;
CREATE POLICY "Members view channel snapshots"
ON public.channel_performance_snapshots FOR SELECT
USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Staff append channel snapshots" ON public.channel_performance_snapshots;
CREATE POLICY "Staff append channel snapshots"
ON public.channel_performance_snapshots FOR INSERT
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
    AND created_by = auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.marketing_metric_import_batches batch
        WHERE batch.tenant_id = channel_performance_snapshots.tenant_id
          AND batch.id = channel_performance_snapshots.import_batch_id
          AND batch.status = 'DRAFT'
          AND (
              batch.created_by = auth.uid()
              OR public.get_tenant_role(channel_performance_snapshots.tenant_id)
                  IN ('owner', 'admin', 'manager')
          )
    )
);

REVOKE INSERT, UPDATE, DELETE ON public.channel_performance_rates FROM authenticated;
GRANT SELECT ON public.channel_performance_rates TO authenticated;
