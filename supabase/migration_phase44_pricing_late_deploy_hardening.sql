BEGIN;

CREATE OR REPLACE FUNCTION public.guard_pricing_write_authorization()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  v_role TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED_PRICING_WRITE' USING ERRCODE = '28000';
  END IF;
  v_role := public.get_tenant_role(v_tenant_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'staff') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_PRICING_WRITE' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pricing_write_authorization() FROM PUBLIC, anon;

DO $tables$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pricing_profiles', 'pricing_rules', 'pricing_events', 'pricing_overrides',
    'daily_rates', 'rate_change_logs', 'booking_quotes'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION 'PHASE44_PHASE11_TABLE_MISSING: %', v_table;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_table);
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = ('public.' || v_table)::regclass
        AND tgname = 'trg_tenant_id_immutable' AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_tenant_id_immutable BEFORE UPDATE OF tenant_id ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable()', v_table
      );
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_pricing_write_authz ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_pricing_write_authz BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.guard_pricing_write_authorization()', v_table
    );
  END LOOP;
END
$tables$;

REVOKE ALL ON FUNCTION public.save_manual_pricing_override_atomic(UUID, UUID, DATE, DATE, NUMERIC, TEXT, BOOLEAN, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_booking_quote_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_pricing_override_atomic(UUID, UUID, DATE, DATE, NUMERIC, TEXT, BOOLEAN, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_booking_quote_atomic(UUID, UUID) TO authenticated, service_role;

DO $verify$
DECLARE
  v_table TEXT;
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pricing_profiles', 'pricing_rules', 'pricing_events', 'pricing_overrides',
    'daily_rates', 'rate_change_logs', 'booking_quotes'
  ] LOOP
    IF has_table_privilege('anon', ('public.' || v_table)::regclass, 'SELECT')
       OR has_table_privilege('anon', ('public.' || v_table)::regclass, 'INSERT')
       OR has_table_privilege('anon', ('public.' || v_table)::regclass, 'UPDATE')
       OR has_table_privilege('anon', ('public.' || v_table)::regclass, 'DELETE') THEN
      RAISE EXCEPTION 'PHASE44_ANON_TABLE_PRIVILEGE: %', v_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = ('public.' || v_table)::regclass
        AND tgname = 'trg_tenant_id_immutable' AND NOT tgisinternal
    ) THEN
      v_missing := array_append(v_missing, v_table);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = ('public.' || v_table)::regclass
        AND tgname = 'trg_pricing_write_authz' AND NOT tgisinternal
    ) THEN
      RAISE EXCEPTION 'PHASE44_PRICING_AUTHZ_TRIGGER_MISSING: %', v_table;
    END IF;
  END LOOP;
  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'PHASE44_TENANT_TRIGGER_MISSING: %', array_to_string(v_missing, ', ');
  END IF;
  IF to_regprocedure('public.save_manual_pricing_override_atomic(uuid,uuid,date,date,numeric,text,boolean,integer)') IS NULL
     OR to_regprocedure('public.accept_booking_quote_atomic(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'PHASE44_PRICING_RPC_MISSING';
  END IF;
  IF strpos(pg_get_functiondef('public.guard_pricing_write_authorization()'::regprocedure), 'v_role IS NULL') = 0 THEN
    RAISE EXCEPTION 'PHASE44_PRICING_ROLE_NULL_GUARD_MISSING';
  END IF;
  IF has_function_privilege('anon', 'public.save_manual_pricing_override_atomic(uuid,uuid,date,date,numeric,text,boolean,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.accept_booking_quote_atomic(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE44_ANON_RPC_EXECUTABLE';
  END IF;
  RAISE NOTICE 'PHASE 44 OK — gec phase11 nesneleri phase41 yetki ve tenant_id sozlesmesine uygun.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (44, 'phase44_pricing_late_deploy_hardening')
ON CONFLICT (version) DO NOTHING;

COMMIT;
