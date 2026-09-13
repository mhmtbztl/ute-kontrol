-- =============================================================================
-- LEXBNB PHASE 17 — IDEMPOTENT PHOTO ANALYSIS REQUESTS
-- Replaces the initial request RPC without changing its public signature.
-- =============================================================================

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

REVOKE ALL ON FUNCTION public.request_photo_analysis(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_photo_analysis(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
