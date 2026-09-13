-- =============================================================================
-- LEXBNB PHASE 23 — CAPRAZ KIRACI YETKI ACIGININ KAPATILMASI
--
-- SORUN (uretimde dogrulandi, 2026-09-14):
--   Phase 17 fonksiyonlarinin yetki kontrolu soyleydi:
--
--       IF auth.uid() IS NULL
--          OR public.get_tenant_role(p_tenant_id) NOT IN ('owner','admin','manager') THEN
--           RAISE EXCEPTION 'UNAUTHORIZED...';
--       END IF;
--
--   Cagiran kisi HEDEF kiracinin uyesi DEGILSE get_tenant_role NULL doner.
--   SQL uc degerli mantiginda:
--       NULL NOT IN ('owner','admin','manager')  ->  NULL   (TRUE degil)
--       FALSE OR NULL                            ->  NULL
--       IF NULL THEN ...                         ->  CALISMAZ
--
--   Yani koruma tam olarak korumasi gereken durumda -- yabanci bir kiracidan
--   gelen cagrida -- sessizce devre disi kaliyordu.
--
--   Uretimde kanitlandi: B kiracisinin sahibi, A kiracisinin mulkune
--   save_property_channel_listing ile ilan yazdi. Olusan satirda
--   tenant_id = A, created_by = B. Bu, CLAUDE.md'nin temel vaadinin
--   ("bir musterinin verisi asla baska bir musteriye gorunmez") ihlalidir.
--
--   Phase 16 ayni kontrolu DOGRU yaziyordu:
--       IF v_role IS NULL OR v_role NOT IN (...) THEN
--   Phase 17 bu kontrolun IS NULL yarisini dusurdu.
--
-- COZUM:
--   Etkilenen 7 fonksiyon, korumasi COALESCE(..., '') ile NULL-guvenli hale
--   getirilmis govdeleriyle yeniden tanimlanir. Imzalar ve davranis aynidir;
--   degisen tek sey, uye olmayan cagiranin artik reddedilmesidir.
--
--   Bu dosya supabase/migration_phase17_*.sql kaynaklarindan OTOMATIK
--   uretilmistir; govdeler elle kopyalanmamistir.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- save_property_channel_listing  (kaynak: migration_phase17_channel_listing_rpc.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_property_channel_listing(
    p_tenant_id UUID,
    p_property_id UUID,
    p_channel_code TEXT,
    p_external_listing_id TEXT,
    p_display_name TEXT DEFAULT NULL,
    p_external_url TEXT DEFAULT NULL,
    p_payout_currency TEXT DEFAULT 'TRY'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_channel TEXT := upper(trim(p_channel_code));
    v_external_id TEXT := trim(p_external_listing_id);
    v_currency TEXT := upper(trim(COALESCE(p_payout_currency, 'TRY')));
    v_listing public.property_channel_listings%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL
       OR COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_CHANNEL_LISTING_WRITE' USING ERRCODE = '42501';
    END IF;
    IF v_channel NOT IN ('AIRBNB', 'BOOKING_COM', 'VRBO', 'EXPEDIA', 'DIRECT', 'OTHER_OTA') THEN
        RAISE EXCEPTION 'INVALID_CHANNEL_CODE' USING ERRCODE = '22023';
    END IF;
    IF v_external_id IS NULL OR length(v_external_id) < 1 OR length(v_external_id) > 200 THEN
        RAISE EXCEPTION 'CHANNEL_LISTING_REFERENCE_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF v_currency !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'INVALID_PAYOUT_CURRENCY' USING ERRCODE = '22023';
    END IF;
    IF p_external_url IS NOT NULL AND trim(p_external_url) <> ''
       AND trim(p_external_url) !~* '^https://[^[:space:]]+$' THEN
        RAISE EXCEPTION 'HTTPS_CHANNEL_URL_REQUIRED' USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.properties
    WHERE tenant_id = p_tenant_id AND id = p_property_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PROPERTY_NOT_FOUND_IN_TENANT' USING ERRCODE = 'P0002';
    END IF;

    -- Serialize the natural external identity so concurrent retries cannot both
    -- pass the SELECT and race into the partial unique index.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        p_tenant_id::TEXT || ':' || v_channel || ':' || v_external_id, 0
    ));

    SELECT * INTO v_listing
    FROM public.property_channel_listings
    WHERE tenant_id = p_tenant_id AND channel_code = v_channel
      AND external_listing_id = v_external_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_listing.property_id <> p_property_id THEN
            RAISE EXCEPTION 'CHANNEL_LISTING_REFERENCE_BELONGS_TO_ANOTHER_PROPERTY' USING ERRCODE = '23505';
        END IF;
        UPDATE public.property_channel_listings
        SET display_name = NULLIF(trim(p_display_name), ''),
            external_url = NULLIF(trim(p_external_url), ''),
            payout_currency = v_currency,
            status = 'ACTIVE', updated_at = NOW()
        WHERE tenant_id = p_tenant_id AND id = v_listing.id
        RETURNING * INTO v_listing;
        RETURN jsonb_build_object('listingId', v_listing.id, 'reused', TRUE);
    END IF;

    INSERT INTO public.property_channel_listings (
        tenant_id, property_id, channel_code, external_listing_id, display_name,
        external_url, payout_currency, status, created_by
    ) VALUES (
        p_tenant_id, p_property_id, v_channel, v_external_id,
        NULLIF(trim(p_display_name), ''), NULLIF(trim(p_external_url), ''),
        v_currency, 'ACTIVE', auth.uid()
    ) RETURNING * INTO v_listing;

    RETURN jsonb_build_object('listingId', v_listing.id, 'reused', FALSE);
END;
$$;

-- ---------------------------------------------------------------------------
-- record_manual_channel_snapshot  (kaynak: migration_phase17_manual_snapshot.sql)
-- ---------------------------------------------------------------------------
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
       OR COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner', 'admin', 'manager', 'staff') THEN
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

-- ---------------------------------------------------------------------------
-- record_property_marketing_benchmark  (kaynak: migration_phase17_health_benchmarks.sql)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- review_marketing_finding  (kaynak: migration_phase17_findings_actions.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_marketing_finding(
    p_finding_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_finding public.marketing_findings%ROWTYPE;
    v_action TEXT := upper(trim(p_action));
    v_task_id UUID;
BEGIN
    SELECT * INTO v_finding
    FROM public.marketing_findings
    WHERE id = p_finding_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MARKETING_FINDING_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    IF auth.uid() IS NULL
       OR COALESCE(public.get_tenant_role(v_finding.tenant_id), '') NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MARKETING_REVIEW' USING ERRCODE = '42501';
    END IF;

    IF v_finding.status IN ('DISMISSED', 'RESOLVED', 'STALE') THEN
        RAISE EXCEPTION 'TERMINAL_MARKETING_FINDING' USING ERRCODE = '22023';
    END IF;

    IF v_action = 'ACKNOWLEDGE' THEN
        UPDATE public.marketing_findings
        SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(),
            reviewed_by = auth.uid(), updated_at = NOW()
        WHERE id = p_finding_id;

        UPDATE public.executive_alerts
        SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(),
            acknowledged_by = auth.uid(), updated_at = NOW()
        WHERE tenant_id = v_finding.tenant_id AND marketing_finding_id = p_finding_id;

    ELSIF v_action = 'DISMISS' THEN
        IF p_reason IS NULL OR trim(p_reason) = '' THEN
            RAISE EXCEPTION 'DISMISS_REASON_REQUIRED' USING ERRCODE = '22023';
        END IF;

        UPDATE public.marketing_findings
        SET status = 'DISMISSED', dismissed_at = NOW(), dismissal_reason = trim(p_reason),
            reviewed_by = auth.uid(), updated_at = NOW()
        WHERE id = p_finding_id;

        UPDATE public.executive_alerts
        SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = auth.uid(), updated_at = NOW()
        WHERE tenant_id = v_finding.tenant_id AND marketing_finding_id = p_finding_id;

    ELSIF v_action = 'RESOLVE' THEN
        UPDATE public.marketing_findings
        SET status = 'RESOLVED', resolved_at = NOW(),
            reviewed_by = auth.uid(), updated_at = NOW()
        WHERE id = p_finding_id;

        UPDATE public.executive_alerts
        SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = auth.uid(), updated_at = NOW()
        WHERE tenant_id = v_finding.tenant_id AND marketing_finding_id = p_finding_id;

    ELSIF v_action = 'ACCEPT_TASK' THEN
        IF v_finding.action_kind NOT IN ('RESHOOT', 'ON_SITE_CONTENT') THEN
            RAISE EXCEPTION 'NON_PHYSICAL_FINDING_CANNOT_CREATE_TASK' USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.operational_tasks (
            tenant_id, property_id, marketing_finding_id, task_type, task_subtype,
            title, description, status, priority, source, source_event_id, metadata
        ) VALUES (
            v_finding.tenant_id, v_finding.property_id, v_finding.id,
            'GENERAL', 'MARKETING_CREATIVE', v_finding.title,
            v_finding.recommended_action, 'TODO',
            CASE
                WHEN v_finding.impact_score >= 8 AND v_finding.urgency_score >= 9 THEN 'CRITICAL'
                WHEN v_finding.impact_score >= 7 OR v_finding.urgency_score >= 7 THEN 'HIGH'
                WHEN v_finding.impact_score >= 4 OR v_finding.urgency_score >= 4 THEN 'MEDIUM'
                ELSE 'LOW'
            END,
            'MANUAL', 'MKT:' || v_finding.id::TEXT,
            jsonb_build_object('marketingFindingId', v_finding.id, 'actionKind', v_finding.action_kind)
        )
        ON CONFLICT (tenant_id, source_event_id)
            WHERE source_event_id IS NOT NULL
        DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            priority = EXCLUDED.priority,
            marketing_finding_id = EXCLUDED.marketing_finding_id,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        RETURNING id INTO v_task_id;

        UPDATE public.marketing_findings
        SET status = 'ACKNOWLEDGED', accepted_for_task = TRUE,
            acknowledged_at = COALESCE(acknowledged_at, NOW()),
            reviewed_by = auth.uid(), updated_at = NOW()
        WHERE id = p_finding_id;

        UPDATE public.executive_alerts
        SET status = 'ACKNOWLEDGED', acknowledged_at = COALESCE(acknowledged_at, NOW()),
            acknowledged_by = auth.uid(), updated_at = NOW()
        WHERE tenant_id = v_finding.tenant_id AND marketing_finding_id = p_finding_id;
    ELSE
        RAISE EXCEPTION 'INVALID_MARKETING_REVIEW_ACTION' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
        'findingId', p_finding_id,
        'action', v_action,
        'taskId', v_task_id
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- request_listing_change_evaluation  (kaynak: migration_phase17_change_impact_idempotency.sql)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- request_photo_analysis  (kaynak: migration_phase17_photo_job_idempotency.sql)
-- ---------------------------------------------------------------------------
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
    v_run public.photo_analysis_runs%ROWTYPE;
    v_run_id UUID;
BEGIN
    IF auth.uid() IS NULL
       OR NOT public.is_tenant_member(p_tenant_id)
       OR COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner', 'admin', 'manager') THEN
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

    SELECT * INTO v_run
    FROM public.photo_analysis_runs
    WHERE tenant_id = p_tenant_id
      AND property_id = p_property_id
      AND status IN ('QUEUED', 'PROCESSING')
    ORDER BY requested_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        IF v_run.prompt_version = p_prompt_version
           AND v_run.schema_version = p_schema_version
           AND v_run.property_context_hash = p_property_context_hash THEN
            RETURN v_run.id;
        END IF;
        RAISE EXCEPTION 'ANALYSIS_ALREADY_ACTIVE_FOR_DIFFERENT_CONTEXT' USING ERRCODE = '55000';
    END IF;

    SELECT * INTO v_run
    FROM public.photo_analysis_runs
    WHERE tenant_id = p_tenant_id
      AND property_id = p_property_id
      AND prompt_version = p_prompt_version
      AND schema_version = p_schema_version
      AND property_context_hash = p_property_context_hash
      AND status IN ('SUCCEEDED', 'PARTIAL')
      AND completed_at >= NOW() - INTERVAL '5 minutes'
    ORDER BY completed_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN v_run.id;
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
        SELECT id INTO v_run_id
        FROM public.photo_analysis_runs
        WHERE tenant_id = p_tenant_id
          AND property_id = p_property_id
          AND status IN ('QUEUED', 'PROCESSING')
          AND prompt_version = p_prompt_version
          AND schema_version = p_schema_version
          AND property_context_hash = p_property_context_hash
        ORDER BY requested_at DESC
        LIMIT 1;
        IF v_run_id IS NOT NULL THEN RETURN v_run_id; END IF;
        RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- change_channel_cover_and_measure  (kaynak: migration_phase17_cover_change.sql)
-- ---------------------------------------------------------------------------
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

-- =============================================================================
-- DOGRULAMA — basarisizsa goc durur (CLAUDE.md bolum 4.2)
-- =============================================================================
DO $verify$
DECLARE
    v_name TEXT;
    v_def TEXT;
    v_broken TEXT[] := ARRAY[]::TEXT[];
    v_names TEXT[] := ARRAY[
        'save_property_channel_listing',
        'record_manual_channel_snapshot',
        'record_property_marketing_benchmark',
        'review_marketing_finding',
        'request_listing_change_evaluation',
        'request_photo_analysis',
        'change_channel_cover_and_measure'
    ];
BEGIN
    FOREACH v_name IN ARRAY v_names LOOP
        SELECT pg_get_functiondef(p.oid) INTO v_def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_name
        ORDER BY p.oid DESC
        LIMIT 1;

        -- Duz metin aramasi: regex kacisi (ve LIKE'in '_' joker karakteri)
        -- bu kontrolu sessizce yanlis yapabilirdi.
        IF v_def IS NULL THEN
            v_broken := array_append(v_broken, v_name || ' (bulunamadi)');
        ELSIF strpos(v_def, 'get_tenant_role(p_tenant_id) NOT IN') > 0
           OR strpos(v_def, 'get_tenant_role(v_finding.tenant_id) NOT IN') > 0 THEN
            v_broken := array_append(v_broken, v_name || ' (ciplak NOT IN)');
        ELSIF strpos(v_def, 'COALESCE(public.get_tenant_role') = 0 THEN
            v_broken := array_append(v_broken, v_name || ' (COALESCE yok)');
        END IF;
    END LOOP;

    IF array_length(v_broken, 1) > 0 THEN
        RAISE EXCEPTION 'PHASE23_GUARD_STILL_NULL_UNSAFE: %', array_to_string(v_broken, ', ');
    END IF;

    RAISE NOTICE 'PHASE 23 OK — % fonksiyonun kiraci korumasi NULL-guvenli.', array_length(v_names, 1);
END
$verify$;
