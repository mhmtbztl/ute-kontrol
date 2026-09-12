-- =============================================================================
-- LEXBNB PHASE 17 — PRIVATE MEDIA LIBRARY & AI ANALYSIS JOB FOUNDATION
-- Depends on migration_phase17_marketing_foundation.sql.
-- =============================================================================

-- Private originals and derivatives. No permanent public URLs are stored.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'property-media',
    'property-media',
    FALSE,
    26214400,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Invalid storage paths return NULL instead of raising a UUID cast error in RLS.
CREATE OR REPLACE FUNCTION public.marketing_storage_tenant_id(p_object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_prefix TEXT;
BEGIN
    v_prefix := split_part(COALESCE(p_object_name, ''), '/', 1);
    IF v_prefix ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RETURN v_prefix::UUID;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.marketing_storage_tenant_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketing_storage_tenant_id(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.marketing_storage_property_id(p_object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_part TEXT;
BEGIN
    v_part := split_part(COALESCE(p_object_name, ''), '/', 2);
    IF v_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RETURN v_part::UUID;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.marketing_storage_property_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.marketing_storage_property_id(TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 1. PROPERTY MEDIA LIBRARY
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    original_storage_path TEXT NOT NULL,
    original_file_name TEXT,
    mime_type VARCHAR(100) NOT NULL CHECK (mime_type IN (
        'image/jpeg', 'image/png', 'image/webp', 'image/heic'
    )),
    content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
    width_px INTEGER CHECK (width_px IS NULL OR width_px > 0),
    height_px INTEGER CHECK (height_px IS NULL OR height_px > 0),
    media_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (media_status IN ('UPLOADING', 'ACTIVE', 'FAILED', 'ARCHIVED')),
    room_category VARCHAR(40) CHECK (room_category IN (
        'EXTERIOR', 'LIVING_ROOM', 'BEDROOM', 'BATHROOM', 'KITCHEN',
        'DINING', 'POOL', 'SPA', 'VIEW_TERRACE', 'AMENITY', 'OTHER'
    )),
    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, property_id, id),
    UNIQUE (tenant_id, property_id, content_sha256),
    UNIQUE (tenant_id, original_storage_path),
    CONSTRAINT fk_property_media_property_tenant
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES public.properties (tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT chk_property_media_storage_prefix
        CHECK (original_storage_path LIKE tenant_id::TEXT || '/' || property_id::TEXT || '/%')
);

CREATE INDEX IF NOT EXISTS idx_property_media_library
    ON public.property_media (tenant_id, property_id, media_status, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. MEDIA VERSIONS
-- Original bytes are never overwritten. Display and analysis derivatives are
-- separate version records.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_media_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    media_id UUID NOT NULL,
    parent_version_id UUID,
    version_type VARCHAR(30) NOT NULL CHECK (version_type IN (
        'ORIGINAL', 'USER_EDITED', 'AI_ENHANCED', 'THUMBNAIL', 'ANALYSIS_PROXY'
    )),
    storage_path TEXT NOT NULL,
    content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    operations JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(operations) = 'array'),
    is_current_display BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, property_id, id),
    UNIQUE (tenant_id, storage_path),
    CONSTRAINT fk_media_version_media_tenant_property
        FOREIGN KEY (tenant_id, property_id, media_id)
        REFERENCES public.property_media (tenant_id, property_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_media_version_parent_tenant_property
        FOREIGN KEY (tenant_id, property_id, parent_version_id)
        REFERENCES public.property_media_versions (tenant_id, property_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT chk_media_version_storage_prefix
        CHECK (storage_path LIKE tenant_id::TEXT || '/' || property_id::TEXT || '/%')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_media_current_display_version
    ON public.property_media_versions (tenant_id, media_id)
    WHERE is_current_display = TRUE;

CREATE INDEX IF NOT EXISTS idx_media_versions_media
    ON public.property_media_versions (tenant_id, property_id, media_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. CHANNEL-SPECIFIC MEDIA PLACEMENT
-- Enforces that the channel listing and media belong to the same property.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_listings_tenant_property_id
    ON public.property_channel_listings (tenant_id, property_id, id);

CREATE TABLE IF NOT EXISTS public.channel_media_placements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    channel_listing_id UUID NOT NULL,
    media_id UUID NOT NULL,
    display_order INTEGER NOT NULL CHECK (display_order > 0),
    is_cover BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, channel_listing_id, media_id),
    CONSTRAINT fk_media_placement_listing_same_property
        FOREIGN KEY (tenant_id, property_id, channel_listing_id)
        REFERENCES public.property_channel_listings (tenant_id, property_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_media_placement_media_same_property
        FOREIGN KEY (tenant_id, property_id, media_id)
        REFERENCES public.property_media (tenant_id, property_id, id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_channel_media_order
    ON public.channel_media_placements (tenant_id, channel_listing_id, display_order)
    WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_channel_cover
    ON public.channel_media_placements (tenant_id, channel_listing_id)
    WHERE is_active = TRUE AND is_cover = TRUE;

-- -----------------------------------------------------------------------------
-- 4. BACKEND-OWNED AI RUNS AND ITEMS
-- Authenticated clients may request and read runs, but cannot forge results.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.photo_analysis_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED', 'PROCESSING', 'PARTIAL', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    provider VARCHAR(50),
    model_version VARCHAR(100),
    prompt_version VARCHAR(50) NOT NULL,
    schema_version VARCHAR(50) NOT NULL,
    property_context_hash CHAR(64) NOT NULL CHECK (property_context_hash ~ '^[0-9a-f]{64}$'),
    provider_request_id TEXT,
    cached_item_count INTEGER NOT NULL DEFAULT 0 CHECK (cached_item_count >= 0),
    analyzed_item_count INTEGER NOT NULL DEFAULT 0 CHECK (analyzed_item_count >= 0),
    usage_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(usage_metadata) = 'object'),
    error_code VARCHAR(100),
    error_detail TEXT,
    requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, property_id, id),
    CONSTRAINT fk_photo_analysis_run_property_tenant
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES public.properties (tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT chk_photo_analysis_run_timestamps CHECK (
        (started_at IS NULL OR started_at >= requested_at)
        AND (completed_at IS NULL OR completed_at >= COALESCE(started_at, requested_at))
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_photo_analysis_per_property
    ON public.photo_analysis_runs (tenant_id, property_id)
    WHERE status IN ('QUEUED', 'PROCESSING');

CREATE TABLE IF NOT EXISTS public.photo_analysis_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    run_id UUID NOT NULL,
    media_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('CACHED', 'SUCCEEDED', 'FAILED')),
    cache_key CHAR(64) NOT NULL CHECK (cache_key ~ '^[0-9a-f]{64}$'),
    result_payload JSONB CHECK (result_payload IS NULL OR jsonb_typeof(result_payload) = 'object'),
    confidence NUMERIC(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    error_code VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, run_id, media_id),
    CONSTRAINT fk_photo_analysis_item_run_same_property
        FOREIGN KEY (tenant_id, property_id, run_id)
        REFERENCES public.photo_analysis_runs (tenant_id, property_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_photo_analysis_item_media_same_property
        FOREIGN KEY (tenant_id, property_id, media_id)
        REFERENCES public.property_media (tenant_id, property_id, id)
        ON DELETE CASCADE,
    CONSTRAINT chk_photo_analysis_item_result CHECK (
        (status IN ('CACHED', 'SUCCEEDED') AND result_payload IS NOT NULL AND error_code IS NULL)
        OR (status = 'FAILED' AND error_code IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_photo_analysis_cache_lookup
    ON public.photo_analysis_items (tenant_id, cache_key)
    WHERE status IN ('CACHED', 'SUCCEEDED');

-- Controlled client entry point. Provider/model and results remain worker-owned.
CREATE OR REPLACE FUNCTION public.request_photo_analysis(
    p_tenant_id UUID,
    p_property_id UUID,
    p_prompt_version TEXT,
    p_schema_version TEXT,
    p_property_context_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_run_id UUID;
BEGIN
    IF auth.uid() IS NULL
       OR NOT public.is_tenant_member(p_tenant_id)
       OR public.get_tenant_role(p_tenant_id) NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_PHOTO_ANALYSIS_REQUEST' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.tenant_id = p_tenant_id AND p.id = p_property_id
    ) THEN
        RAISE EXCEPTION 'PROPERTY_TENANT_MISMATCH' USING ERRCODE = '42501';
    END IF;

    IF p_prompt_version IS NULL OR trim(p_prompt_version) = ''
       OR p_schema_version IS NULL OR trim(p_schema_version) = ''
       OR p_property_context_hash IS NULL
       OR p_property_context_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'INVALID_ANALYSIS_VERSION_OR_CONTEXT_HASH' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.photo_analysis_runs (
        tenant_id, property_id, prompt_version, schema_version,
        property_context_hash, requested_by
    ) VALUES (
        p_tenant_id, p_property_id, p_prompt_version, p_schema_version,
        p_property_context_hash, auth.uid()
    )
    RETURNING id INTO v_run_id;

    RETURN v_run_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'ANALYSIS_ALREADY_ACTIVE' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.request_photo_analysis(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_photo_analysis(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. TABLE RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.property_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_media_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_media_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_analysis_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view property media" ON public.property_media;
CREATE POLICY "Members view property media" ON public.property_media FOR SELECT
USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers insert property media" ON public.property_media;
CREATE POLICY "Managers insert property media" ON public.property_media FOR INSERT
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
    AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Managers update property media" ON public.property_media;
CREATE POLICY "Managers update property media" ON public.property_media FOR UPDATE
USING (public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'))
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

DROP POLICY IF EXISTS "Managers delete property media" ON public.property_media;
CREATE POLICY "Managers delete property media" ON public.property_media FOR DELETE
USING (public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'));

DROP POLICY IF EXISTS "Members view media versions" ON public.property_media_versions;
CREATE POLICY "Members view media versions" ON public.property_media_versions FOR SELECT
USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers insert media versions" ON public.property_media_versions;
CREATE POLICY "Managers insert media versions" ON public.property_media_versions FOR INSERT
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
    AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Managers update media versions" ON public.property_media_versions;
CREATE POLICY "Managers update media versions" ON public.property_media_versions FOR UPDATE
USING (public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'))
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

DROP POLICY IF EXISTS "Managers delete media versions" ON public.property_media_versions;
CREATE POLICY "Managers delete media versions" ON public.property_media_versions FOR DELETE
USING (public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'));

DROP POLICY IF EXISTS "Members view channel media placements" ON public.channel_media_placements;
CREATE POLICY "Members view channel media placements" ON public.channel_media_placements FOR SELECT
USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers insert channel media placements" ON public.channel_media_placements;
CREATE POLICY "Managers insert channel media placements" ON public.channel_media_placements FOR INSERT
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
    AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Managers update channel media placements" ON public.channel_media_placements;
CREATE POLICY "Managers update channel media placements" ON public.channel_media_placements FOR UPDATE
USING (public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'))
WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

DROP POLICY IF EXISTS "Managers delete channel media placements" ON public.channel_media_placements;
CREATE POLICY "Managers delete channel media placements" ON public.channel_media_placements FOR DELETE
USING (public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'));

DROP POLICY IF EXISTS "Members view photo analysis runs" ON public.photo_analysis_runs;
CREATE POLICY "Members view photo analysis runs" ON public.photo_analysis_runs FOR SELECT
USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Members view photo analysis items" ON public.photo_analysis_items;
CREATE POLICY "Members view photo analysis items" ON public.photo_analysis_items FOR SELECT
USING (public.is_tenant_member(tenant_id));

-- No authenticated INSERT/UPDATE/DELETE policy exists for AI run/item tables.
-- request_photo_analysis() creates QUEUED runs; a service-role worker owns state.

DROP TRIGGER IF EXISTS trg_touch_property_media_updated_at ON public.property_media;
CREATE TRIGGER trg_touch_property_media_updated_at
BEFORE UPDATE ON public.property_media
FOR EACH ROW EXECUTE FUNCTION public.touch_marketing_updated_at();

DROP TRIGGER IF EXISTS trg_touch_channel_media_placements_updated_at ON public.channel_media_placements;
CREATE TRIGGER trg_touch_channel_media_placements_updated_at
BEFORE UPDATE ON public.channel_media_placements
FOR EACH ROW EXECUTE FUNCTION public.touch_marketing_updated_at();

-- -----------------------------------------------------------------------------
-- 6. PRIVATE STORAGE RLS
-- Object path: <tenant_uuid>/<property_uuid>/<media_uuid>/<file>
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members read private property media" ON storage.objects;
CREATE POLICY "Members read private property media"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'property-media'
    AND public.is_tenant_member(public.marketing_storage_tenant_id(name))
    AND EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.tenant_id = public.marketing_storage_tenant_id(name)
          AND p.id = public.marketing_storage_property_id(name)
    )
);

DROP POLICY IF EXISTS "Managers upload private property media" ON storage.objects;
CREATE POLICY "Managers upload private property media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'property-media'
    AND public.get_tenant_role(public.marketing_storage_tenant_id(name))
        IN ('owner', 'admin', 'manager')
    AND EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.tenant_id = public.marketing_storage_tenant_id(name)
          AND p.id = public.marketing_storage_property_id(name)
    )
);

DROP POLICY IF EXISTS "Managers update private property media" ON storage.objects;
CREATE POLICY "Managers update private property media"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'property-media'
    AND public.get_tenant_role(public.marketing_storage_tenant_id(name))
        IN ('owner', 'admin', 'manager')
    AND EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.tenant_id = public.marketing_storage_tenant_id(name)
          AND p.id = public.marketing_storage_property_id(name)
    )
)
WITH CHECK (
    bucket_id = 'property-media'
    AND public.get_tenant_role(public.marketing_storage_tenant_id(name))
        IN ('owner', 'admin', 'manager')
    AND EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.tenant_id = public.marketing_storage_tenant_id(name)
          AND p.id = public.marketing_storage_property_id(name)
    )
);

DROP POLICY IF EXISTS "Managers delete private property media" ON storage.objects;
CREATE POLICY "Managers delete private property media"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'property-media'
    AND public.get_tenant_role(public.marketing_storage_tenant_id(name))
        IN ('owner', 'admin', 'manager')
    AND EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.tenant_id = public.marketing_storage_tenant_id(name)
          AND p.id = public.marketing_storage_property_id(name)
    )
);
