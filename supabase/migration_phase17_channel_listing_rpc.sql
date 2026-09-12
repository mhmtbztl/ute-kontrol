-- =============================================================================
-- LEXBNB PHASE 17 — TENANT-SAFE CHANNEL LISTING SETUP
-- =============================================================================

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
       OR public.get_tenant_role(p_tenant_id) NOT IN ('owner', 'admin', 'manager') THEN
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

REVOKE ALL ON FUNCTION public.save_property_channel_listing(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_property_channel_listing(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
