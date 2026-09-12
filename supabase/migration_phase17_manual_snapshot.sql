-- =============================================================================
-- LEXBNB PHASE 17 — IDEMPOTENT MANUAL FUNNEL SNAPSHOT RPC
-- One atomic write path; raw snapshots remain immutable after creation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_manual_channel_snapshot(
    p_tenant_id UUID,
    p_channel_listing_id UUID,
    p_period_start DATE,
    p_period_end_exclusive DATE,
    p_idempotency_key TEXT,
    p_impressions BIGINT DEFAULT NULL,
    p_listing_views BIGINT DEFAULT NULL,
    p_booking_attempts BIGINT DEFAULT NULL,
    p_platform_reported_bookings BIGINT DEFAULT NULL,
    p_wishlist_saves BIGINT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_batch_id UUID;
    v_snapshot public.channel_performance_snapshots%ROWTYPE;
    v_status TEXT;
    v_present_count INTEGER;
BEGIN
    IF auth.uid() IS NULL
       OR public.get_tenant_role(p_tenant_id) NOT IN ('owner', 'admin', 'manager', 'staff') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MARKETING_SNAPSHOT' USING ERRCODE = '42501';
    END IF;

    IF p_period_start IS NULL OR p_period_end_exclusive IS NULL
       OR p_period_end_exclusive <= p_period_start THEN
        RAISE EXCEPTION 'INVALID_SNAPSHOT_PERIOD' USING ERRCODE = '22023';
    END IF;
    IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 16
       OR length(p_idempotency_key) > 200 THEN
        RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
    END IF;
    IF p_impressions IS NULL AND p_listing_views IS NULL AND p_booking_attempts IS NULL
       AND p_platform_reported_bookings IS NULL AND p_wishlist_saves IS NULL THEN
        RAISE EXCEPTION 'AT_LEAST_ONE_FUNNEL_COUNTER_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(p_impressions, 0) < 0 OR COALESCE(p_listing_views, 0) < 0
       OR COALESCE(p_booking_attempts, 0) < 0 OR COALESCE(p_platform_reported_bookings, 0) < 0
       OR COALESCE(p_wishlist_saves, 0) < 0 THEN
        RAISE EXCEPTION 'NEGATIVE_FUNNEL_COUNTER' USING ERRCODE = '22023';
    END IF;
    IF (p_impressions IS NOT NULL AND p_listing_views IS NOT NULL AND p_listing_views > p_impressions)
       OR (p_listing_views IS NOT NULL AND p_booking_attempts IS NOT NULL AND p_booking_attempts > p_listing_views)
       OR (p_booking_attempts IS NOT NULL AND p_platform_reported_bookings IS NOT NULL
           AND p_platform_reported_bookings > p_booking_attempts)
       OR (p_booking_attempts IS NULL AND p_listing_views IS NOT NULL
           AND p_platform_reported_bookings IS NOT NULL AND p_platform_reported_bookings > p_listing_views)
       OR (p_listing_views IS NOT NULL AND p_wishlist_saves IS NOT NULL AND p_wishlist_saves > p_listing_views) THEN
        RAISE EXCEPTION 'INVALID_FUNNEL_ORDER' USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.property_channel_listings
    WHERE tenant_id = p_tenant_id AND id = p_channel_listing_id AND status <> 'ARCHIVED';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CHANNEL_LISTING_NOT_FOUND_IN_TENANT' USING ERRCODE = 'P0002';
    END IF;

    v_present_count := num_nonnulls(p_impressions, p_listing_views, p_booking_attempts,
        p_platform_reported_bookings, p_wishlist_saves);
    v_status := CASE WHEN v_present_count = 5 THEN 'VALID' ELSE 'PARTIAL' END;

    INSERT INTO public.marketing_metric_import_batches (
        tenant_id, source_type, status, source_schema_version, idempotency_key,
        validation_summary, created_by
    ) VALUES (
        p_tenant_id, 'MANUAL', 'DRAFT', 'marketing-funnel-v1', trim(p_idempotency_key),
        jsonb_build_object('coveragePercent', v_present_count * 20, 'presentFields', v_present_count), auth.uid()
    )
    ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
        SET idempotency_key = EXCLUDED.idempotency_key
    RETURNING id INTO v_batch_id;

    SELECT * INTO v_snapshot
    FROM public.channel_performance_snapshots
    WHERE tenant_id = p_tenant_id AND import_batch_id = v_batch_id
    LIMIT 1;

    IF FOUND THEN
        IF v_snapshot.channel_listing_id IS DISTINCT FROM p_channel_listing_id
           OR v_snapshot.period_start IS DISTINCT FROM p_period_start
           OR v_snapshot.period_end_exclusive IS DISTINCT FROM p_period_end_exclusive
           OR v_snapshot.impressions IS DISTINCT FROM p_impressions
           OR v_snapshot.listing_views IS DISTINCT FROM p_listing_views
           OR v_snapshot.booking_attempts IS DISTINCT FROM p_booking_attempts
           OR v_snapshot.platform_reported_bookings IS DISTINCT FROM p_platform_reported_bookings
           OR v_snapshot.wishlist_saves IS DISTINCT FROM p_wishlist_saves
           OR v_snapshot.notes IS DISTINCT FROM NULLIF(trim(p_notes), '') THEN
            RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH' USING ERRCODE = '22023';
        END IF;
        RETURN jsonb_build_object('snapshotId', v_snapshot.id, 'importBatchId', v_batch_id,
            'reused', TRUE, 'validationStatus', v_snapshot.validation_status);
    END IF;

    INSERT INTO public.channel_performance_snapshots (
        tenant_id, channel_listing_id, import_batch_id, period_start, period_end_exclusive,
        metric_definition_version, impressions, listing_views, booking_attempts,
        platform_reported_bookings, wishlist_saves, validation_status, validation_issues,
        notes, created_by
    ) VALUES (
        p_tenant_id, p_channel_listing_id, v_batch_id, p_period_start, p_period_end_exclusive,
        'marketing-funnel-v1', p_impressions, p_listing_views, p_booking_attempts,
        p_platform_reported_bookings, p_wishlist_saves, v_status,
        CASE WHEN v_status = 'PARTIAL' THEN jsonb_build_array('PARTIAL_FUNNEL') ELSE '[]'::jsonb END,
        NULLIF(trim(p_notes), ''), auth.uid()
    ) RETURNING * INTO v_snapshot;

    UPDATE public.marketing_metric_import_batches
    SET status = 'COMMITTED', updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND id = v_batch_id;

    RETURN jsonb_build_object('snapshotId', v_snapshot.id, 'importBatchId', v_batch_id,
        'reused', FALSE, 'validationStatus', v_snapshot.validation_status);
END;
$$;

REVOKE ALL ON FUNCTION public.record_manual_channel_snapshot(
    UUID, UUID, DATE, DATE, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_manual_channel_snapshot(
    UUID, UUID, DATE, DATE, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, TEXT
) TO authenticated;
