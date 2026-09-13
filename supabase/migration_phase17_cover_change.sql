-- =============================================================================
-- LEXBNB PHASE 17 — ATOMIC COVER CHANGE + OBSERVATIONAL MEASUREMENT HANDOFF
-- Depends on media placement and idempotent listing change migrations.
-- Changes only Lexbnb's recorded placement; it does not publish to an OTA.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.change_channel_cover_and_measure(
    p_tenant_id UUID,
    p_property_id UUID,
    p_channel_listing_id UUID,
    p_expected_old_media_id UUID,
    p_new_media_id UUID,
    p_primary_metric TEXT DEFAULT 'SEARCH_TO_VIEW_CTR_PERCENT'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_media_id UUID;
    v_new_placement_id UUID;
    v_experiment_id UUID;
    v_change_date DATE := CURRENT_DATE;
    v_primary_metric TEXT := upper(trim(p_primary_metric));
BEGIN
    IF auth.uid() IS NULL
       OR COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_CHANNEL_COVER_CHANGE' USING ERRCODE = '42501';
    END IF;
    IF p_expected_old_media_id IS NULL OR p_new_media_id IS NULL
       OR p_expected_old_media_id = p_new_media_id THEN
        RAISE EXCEPTION 'DISTINCT_COVER_MEDIA_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF v_primary_metric NOT IN ('SEARCH_TO_VIEW_CTR_PERCENT', 'VIEW_TO_BOOKING_CONVERSION_PERCENT') THEN
        RAISE EXCEPTION 'INVALID_PRIMARY_METRIC' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_tenant_id::TEXT || ':' || p_channel_listing_id::TEXT, 0)
    );
    PERFORM 1 FROM public.property_channel_listings listing
    WHERE listing.tenant_id = p_tenant_id AND listing.property_id = p_property_id
      AND listing.id = p_channel_listing_id AND listing.status = 'ACTIVE'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACTIVE_LISTING_SCOPE_MISMATCH' USING ERRCODE = '42501';
    END IF;
    SELECT placement.media_id INTO v_current_media_id
    FROM public.channel_media_placements placement
    WHERE placement.tenant_id = p_tenant_id
      AND placement.property_id = p_property_id
      AND placement.channel_listing_id = p_channel_listing_id
      AND placement.is_active = TRUE AND placement.is_cover = TRUE
    FOR UPDATE;

    -- A network retry after a committed change returns the existing active
    -- measurement instead of creating a second change or experiment.
    IF v_current_media_id = p_new_media_id THEN
        SELECT experiment.id INTO v_experiment_id
        FROM public.listing_change_experiments experiment
        WHERE experiment.tenant_id = p_tenant_id
          AND experiment.property_id = p_property_id
          AND experiment.channel_listing_id = p_channel_listing_id
          AND experiment.change_type = 'COVER_MEDIA'
          AND experiment.old_media_id = p_expected_old_media_id
          AND experiment.new_media_id = p_new_media_id
          AND experiment.primary_metric = v_primary_metric
          AND experiment.status IN ('COLLECTING', 'READY', 'PROCESSING')
        ORDER BY experiment.created_at DESC LIMIT 1;
        IF v_experiment_id IS NULL THEN
            RAISE EXCEPTION 'COVER_ALREADY_CHANGED_WITHOUT_ACTIVE_MEASUREMENT' USING ERRCODE = '40001';
        END IF;
        RETURN jsonb_build_object('oldMediaId', p_expected_old_media_id, 'newMediaId', p_new_media_id,
            'experimentId', v_experiment_id, 'changeDate', v_change_date, 'idempotentReplay', TRUE,
            'externalPublishStatus', 'NOT_ATTEMPTED');
    END IF;
    IF v_current_media_id IS NULL THEN
        RAISE EXCEPTION 'CURRENT_ACTIVE_COVER_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF v_current_media_id IS DISTINCT FROM p_expected_old_media_id THEN
        RAISE EXCEPTION 'STALE_EXPECTED_COVER' USING ERRCODE = '40001';
    END IF;
    SELECT placement.id INTO v_new_placement_id
        FROM public.channel_media_placements placement
        JOIN public.property_media media
          ON media.tenant_id = placement.tenant_id AND media.property_id = placement.property_id
         AND media.id = placement.media_id
        WHERE placement.tenant_id = p_tenant_id AND placement.property_id = p_property_id
          AND placement.channel_listing_id = p_channel_listing_id
          AND placement.media_id = p_new_media_id AND placement.is_active = TRUE
          AND media.media_status = 'ACTIVE'
        FOR UPDATE OF placement;
    IF v_new_placement_id IS NULL THEN
        RAISE EXCEPTION 'NEW_MEDIA_REQUIRES_ACTIVE_CHANNEL_PLACEMENT' USING ERRCODE = '23514';
    END IF;

    UPDATE public.channel_media_placements SET is_cover = FALSE
    WHERE tenant_id = p_tenant_id AND property_id = p_property_id
      AND channel_listing_id = p_channel_listing_id AND media_id = p_expected_old_media_id
      AND is_active = TRUE AND is_cover = TRUE;
    UPDATE public.channel_media_placements SET is_cover = TRUE
    WHERE tenant_id = p_tenant_id AND property_id = p_property_id
      AND id = v_new_placement_id AND channel_listing_id = p_channel_listing_id
      AND media_id = p_new_media_id AND is_active = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NEW_MEDIA_PLACEMENT_CHANGED_CONCURRENTLY' USING ERRCODE = '40001';
    END IF;

    v_experiment_id := public.request_listing_change_evaluation(
        p_tenant_id, p_property_id, p_channel_listing_id, 'COVER_MEDIA', v_change_date,
        v_change_date - 14, v_change_date, v_change_date, v_change_date + 14,
        v_primary_metric, p_expected_old_media_id, p_new_media_id
    );
    RETURN jsonb_build_object('oldMediaId', p_expected_old_media_id, 'newMediaId', p_new_media_id,
        'experimentId', v_experiment_id, 'changeDate', v_change_date, 'idempotentReplay', FALSE,
        'externalPublishStatus', 'NOT_ATTEMPTED');
END;
$$;

REVOKE ALL ON FUNCTION public.change_channel_cover_and_measure(UUID, UUID, UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_channel_cover_and_measure(UUID, UUID, UUID, UUID, UUID, TEXT) TO authenticated;
