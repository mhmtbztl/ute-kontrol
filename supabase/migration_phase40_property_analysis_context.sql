-- =============================================================================
-- LEXBNB PHASE 40 — PROPERTY MARKET LOCATION AND PUBLIC PROFILE CONTEXT
-- =============================================================================
-- This data deliberately lives outside `properties`. GitHub Pages can publish
-- client code before an operator applies this migration; keeping the new
-- columns in a separate table prevents an unapplied migration from breaking
-- ordinary property create/update operations.

BEGIN;

CREATE TABLE IF NOT EXISTS public.property_analysis_context (
  property_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  country_code CHAR(2),
  admin_area VARCHAR(120),
  city VARCHAR(120),
  district_region VARCHAR(160),
  social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_property_analysis_context_property_tenant
    FOREIGN KEY (tenant_id, property_id)
    REFERENCES public.properties (tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT chk_property_analysis_country
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT chk_property_analysis_social_object
    CHECK (jsonb_typeof(social_links) = 'object'),
  CONSTRAINT chk_property_analysis_social_keys
    CHECK (
      social_links - 'website' - 'instagram' - 'facebook' - 'tiktok'
        - 'youtube' - 'googleBusiness' = '{}'::jsonb
    ),
  CONSTRAINT chk_property_analysis_social_size
    CHECK (pg_column_size(social_links) <= 8192),
  CONSTRAINT chk_property_analysis_social_https
    CHECK (
      (NOT (social_links ? 'website') OR
        (jsonb_typeof(social_links -> 'website') = 'string'
          AND social_links ->> 'website' ~ '^https://[^[:space:]]+$'
          AND social_links ->> 'website' !~* '^https://[^/[:space:]]*@'))
      AND (NOT (social_links ? 'instagram') OR
        (jsonb_typeof(social_links -> 'instagram') = 'string'
          AND social_links ->> 'instagram' ~ '^https://[^[:space:]]+$'
          AND social_links ->> 'instagram' !~* '^https://[^/[:space:]]*@'))
      AND (NOT (social_links ? 'facebook') OR
        (jsonb_typeof(social_links -> 'facebook') = 'string'
          AND social_links ->> 'facebook' ~ '^https://[^[:space:]]+$'
          AND social_links ->> 'facebook' !~* '^https://[^/[:space:]]*@'))
      AND (NOT (social_links ? 'tiktok') OR
        (jsonb_typeof(social_links -> 'tiktok') = 'string'
          AND social_links ->> 'tiktok' ~ '^https://[^[:space:]]+$'
          AND social_links ->> 'tiktok' !~* '^https://[^/[:space:]]*@'))
      AND (NOT (social_links ? 'youtube') OR
        (jsonb_typeof(social_links -> 'youtube') = 'string'
          AND social_links ->> 'youtube' ~ '^https://[^[:space:]]+$'
          AND social_links ->> 'youtube' !~* '^https://[^/[:space:]]*@'))
      AND (NOT (social_links ? 'googleBusiness') OR
        (jsonb_typeof(social_links -> 'googleBusiness') = 'string'
          AND social_links ->> 'googleBusiness' ~ '^https://[^[:space:]]+$'
          AND social_links ->> 'googleBusiness' !~* '^https://[^/[:space:]]*@'))
    )
);

CREATE INDEX IF NOT EXISTS idx_property_analysis_context_tenant
  ON public.property_analysis_context (tenant_id, property_id);

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.property_analysis_context;
CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.property_analysis_context
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.property_analysis_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_analysis_context_select ON public.property_analysis_context;
DROP POLICY IF EXISTS property_analysis_context_insert ON public.property_analysis_context;
DROP POLICY IF EXISTS property_analysis_context_update ON public.property_analysis_context;
DROP POLICY IF EXISTS property_analysis_context_delete ON public.property_analysis_context;

CREATE POLICY property_analysis_context_select
ON public.property_analysis_context FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY property_analysis_context_insert
ON public.property_analysis_context FOR INSERT TO authenticated
WITH CHECK (
  public.is_tenant_member(tenant_id)
  AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

CREATE POLICY property_analysis_context_update
ON public.property_analysis_context FOR UPDATE TO authenticated
USING (
  public.is_tenant_member(tenant_id)
  AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
)
WITH CHECK (
  public.is_tenant_member(tenant_id)
  AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

CREATE POLICY property_analysis_context_delete
ON public.property_analysis_context FOR DELETE TO authenticated
USING (
  public.is_tenant_member(tenant_id)
  AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

REVOKE ALL ON TABLE public.property_analysis_context FROM PUBLIC;
REVOKE ALL ON TABLE public.property_analysis_context FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.property_analysis_context TO authenticated;

CREATE OR REPLACE FUNCTION public.save_property_analysis_context(
  p_tenant_id UUID,
  p_property_id UUID,
  p_country_code TEXT DEFAULT NULL,
  p_admin_area TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_district_region TEXT DEFAULT NULL,
  p_social_links JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_country TEXT := upper(NULLIF(btrim(COALESCE(p_country_code, '')), ''));
  v_social JSONB := COALESCE(p_social_links, '{}'::jsonb);
BEGIN
  IF auth.uid() IS NULL
     OR COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_PROPERTY_ANALYSIS_CONTEXT_WRITE' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.properties
    WHERE tenant_id = p_tenant_id AND id = p_property_id
  ) THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND_IN_TENANT' USING ERRCODE = 'P0002';
  END IF;

  IF v_country IS NOT NULL AND v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'INVALID_COUNTRY_CODE' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_admin_area, '')) > 120
     OR length(COALESCE(p_city, '')) > 120
     OR length(COALESCE(p_district_region, '')) > 160 THEN
    RAISE EXCEPTION 'PROPERTY_ANALYSIS_LOCATION_TOO_LONG' USING ERRCODE = '22001';
  END IF;
  IF jsonb_typeof(v_social) <> 'object'
     OR v_social - 'website' - 'instagram' - 'facebook' - 'tiktok'
          - 'youtube' - 'googleBusiness' <> '{}'::jsonb
     OR pg_column_size(v_social) > 8192 THEN
    RAISE EXCEPTION 'INVALID_SOCIAL_LINKS' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(v_social) AS item(key, value)
    WHERE jsonb_typeof(item.value) <> 'string'
       OR item.value #>> '{}' !~ '^https://[^[:space:]]+$'
       OR item.value #>> '{}' ~* '^https://[^/[:space:]]*@'
  ) THEN
    RAISE EXCEPTION 'HTTPS_PUBLIC_URL_REQUIRED' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.property_analysis_context (
    property_id, tenant_id, country_code, admin_area, city, district_region,
    social_links, created_by, updated_by
  ) VALUES (
    p_property_id, p_tenant_id, v_country,
    NULLIF(btrim(COALESCE(p_admin_area, '')), ''),
    NULLIF(btrim(COALESCE(p_city, '')), ''),
    NULLIF(btrim(COALESCE(p_district_region, '')), ''),
    v_social, auth.uid(), auth.uid()
  )
  ON CONFLICT (property_id) DO UPDATE SET
    country_code = EXCLUDED.country_code,
    admin_area = EXCLUDED.admin_area,
    city = EXCLUDED.city,
    district_region = EXCLUDED.district_region,
    social_links = EXCLUDED.social_links,
    updated_by = auth.uid(),
    updated_at = NOW()
  WHERE public.property_analysis_context.tenant_id = p_tenant_id;

  RETURN jsonb_build_object('success', TRUE, 'propertyId', p_property_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_property_analysis_context(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_property_analysis_context(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_property_analysis_context(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) TO authenticated;

DO $verify$
DECLARE
  v_policy_count INTEGER;
  v_is_rls BOOLEAN;
  v_is_definer BOOLEAN;
BEGIN
  IF to_regclass('public.property_analysis_context') IS NULL THEN
    RAISE EXCEPTION 'PHASE40_CONTEXT_TABLE_MISSING';
  END IF;

  SELECT relrowsecurity INTO v_is_rls
  FROM pg_catalog.pg_class
  WHERE oid = 'public.property_analysis_context'::regclass;
  IF NOT COALESCE(v_is_rls, FALSE) THEN
    RAISE EXCEPTION 'PHASE40_RLS_DISABLED';
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'property_analysis_context';
  IF v_policy_count <> 4 THEN
    RAISE EXCEPTION 'PHASE40_POLICY_MISSING';
  END IF;

  IF has_table_privilege('anon', 'public.property_analysis_context', 'SELECT')
     OR has_table_privilege('anon', 'public.property_analysis_context', 'INSERT')
     OR has_table_privilege('anon', 'public.property_analysis_context', 'UPDATE')
     OR has_table_privilege('anon', 'public.property_analysis_context', 'DELETE') THEN
    RAISE EXCEPTION 'PHASE40_ANON_TABLE_OPEN';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.save_property_analysis_context(uuid,uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PHASE40_ANON_FUNCTION_OPEN';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.save_property_analysis_context(uuid,uuid,text,text,text,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PHASE40_AUTH_FUNCTION_MISSING';
  END IF;

  SELECT prosecdef INTO v_is_definer
  FROM pg_catalog.pg_proc
  WHERE oid = 'public.save_property_analysis_context(uuid,uuid,text,text,text,text,jsonb)'::regprocedure;
  IF COALESCE(v_is_definer, TRUE) THEN
    RAISE EXCEPTION 'PHASE40_FUNCTION_NOT_INVOKER';
  END IF;

  RAISE NOTICE 'PHASE 40 OK — property analysis context is tenant-safe and ready';
END;
$verify$;

COMMIT;
