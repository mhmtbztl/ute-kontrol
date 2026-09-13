-- =============================================================================
-- LEXBNB PHASE 17 — IDEMPOTENT OBSERVATIONAL CHANGE EVALUATION REQUESTS
-- Serializes requests per listing and reuses an identical collecting/ready job.
-- =============================================================================

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
    v_change_type TEXT := upper(trim(p_change_type));
    v_primary_metric TEXT := upper(trim(p_primary_metric));
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

    -- Transaction-scoped serialization closes the SELECT/INSERT race without
    -- imposing a permanent uniqueness rule on historical evaluated records.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_tenant_id::text || ':' || p_channel_listing_id::text, 0)
    );

    SELECT experiment.id INTO v_experiment_id
    FROM public.listing_change_experiments experiment
    WHERE experiment.tenant_id = p_tenant_id
      AND experiment.property_id = p_property_id
      AND experiment.channel_listing_id = p_channel_listing_id
      AND experiment.change_type = v_change_type
      AND experiment.change_date = p_change_date
      AND experiment.before_start_date = p_before_start_date
      AND experiment.before_end_exclusive = p_before_end_exclusive
      AND experiment.after_start_date = p_after_start_date
      AND experiment.after_end_exclusive = p_after_end_exclusive
      AND experiment.primary_metric = v_primary_metric
      AND experiment.old_media_id IS NOT DISTINCT FROM p_old_media_id
      AND experiment.new_media_id IS NOT DISTINCT FROM p_new_media_id
      AND experiment.status IN ('COLLECTING', 'READY', 'PROCESSING')
    ORDER BY experiment.created_at DESC
    LIMIT 1;

    IF v_experiment_id IS NOT NULL THEN RETURN v_experiment_id; END IF;

    INSERT INTO public.listing_change_experiments (
        tenant_id, property_id, channel_listing_id, change_type,
        old_media_id, new_media_id, change_date,
        before_start_date, before_end_exclusive,
        after_start_date, after_end_exclusive, primary_metric, created_by
    ) VALUES (
        p_tenant_id, p_property_id, p_channel_listing_id, v_change_type,
        p_old_media_id, p_new_media_id, p_change_date,
        p_before_start_date, p_before_end_exclusive,
        p_after_start_date, p_after_end_exclusive, v_primary_metric, auth.uid()
    ) RETURNING id INTO v_experiment_id;

    RETURN v_experiment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_listing_change_evaluation(
    UUID, UUID, UUID, TEXT, DATE, DATE, DATE, DATE, DATE, TEXT, UUID, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_listing_change_evaluation(
    UUID, UUID, UUID, TEXT, DATE, DATE, DATE, DATE, DATE, TEXT, UUID, UUID
) TO authenticated;
