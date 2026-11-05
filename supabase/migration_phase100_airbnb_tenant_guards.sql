-- Phase98 was applied to the isolated test project; repair additively.
BEGIN;
CREATE TRIGGER trg_tenant_id_immutable BEFORE UPDATE OF tenant_id ON public.airbnb_performance_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();
CREATE TRIGGER trg_tenant_id_immutable BEFORE UPDATE OF tenant_id ON public.airbnb_listing_changes
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();
INSERT INTO public.schema_migrations(version, name) VALUES (98, 'airbnb_performance') ON CONFLICT (version) DO NOTHING;
INSERT INTO public.schema_migrations(version, name) VALUES (100, 'airbnb_tenant_guards') ON CONFLICT (version) DO NOTHING;
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_tenant_id_immutable' AND tgrelid IN ('public.airbnb_performance_records'::regclass, 'public.airbnb_listing_changes'::regclass) AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'PHASE100_TENANT_GUARDS_MISSING';
  END IF;
  IF (SELECT count(*) FROM public.schema_migrations WHERE version IN (98,100)) <> 2 THEN RAISE EXCEPTION 'PHASE100_LEDGER_MISSING'; END IF;
  RAISE NOTICE 'PHASE 100 OK: Airbnb tenant guards and migration ledger';
END;
$$;
COMMIT;
