-- Airbnb-reported metrics are independent of legacy derived funnel rates.
BEGIN;
CREATE TABLE public.airbnb_performance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_listing_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  metrics jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  supersedes_id uuid REFERENCES public.airbnb_performance_records(id),
  is_current boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, channel_listing_id) REFERENCES public.property_channel_listings(tenant_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX airbnb_performance_current_period ON public.airbnb_performance_records(tenant_id, channel_listing_id, period_start, period_end) WHERE is_current;
CREATE INDEX airbnb_performance_tenant ON public.airbnb_performance_records(tenant_id, id);
CREATE TABLE public.airbnb_listing_changes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_listing_id uuid NOT NULL,
  change_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('COVER','PHOTOS','TITLE','PRICE','OTHER')),
  notes text NOT NULL CHECK (length(trim(notes)) BETWEEN 1 AND 1000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, channel_listing_id) REFERENCES public.property_channel_listings(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX airbnb_changes_tenant ON public.airbnb_listing_changes(tenant_id, id);
ALTER TABLE public.airbnb_performance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airbnb_listing_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY airbnb_performance_read ON public.airbnb_performance_records FOR SELECT TO authenticated USING (public.can_read_ledger(tenant_id));
CREATE POLICY airbnb_changes_read ON public.airbnb_listing_changes FOR SELECT TO authenticated USING (public.can_read_ledger(tenant_id));
REVOKE ALL ON TABLE public.airbnb_performance_records, public.airbnb_listing_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.airbnb_performance_records, public.airbnb_listing_changes TO authenticated;
GRANT ALL ON TABLE public.airbnb_performance_records, public.airbnb_listing_changes TO service_role;

CREATE FUNCTION public.record_airbnb_performance(p_tenant_id uuid, p_listing_id uuid, p_start date, p_end date, p_metrics jsonb, p_notes text DEFAULT '', p_expected_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_old public.airbnb_performance_records%ROWTYPE;
  v_new public.airbnb_performance_records%ROWTYPE;
  v_key text;
  v_value jsonb;
  v_present boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.can_manage_tenant(p_tenant_id), false) THEN
    RAISE EXCEPTION 'AIRBNB_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.property_channel_listings WHERE tenant_id = p_tenant_id AND id = p_listing_id AND channel_code = 'AIRBNB' AND status <> 'ARCHIVED') THEN
    RAISE EXCEPTION 'AIRBNB_LISTING_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_metrics IS NULL OR jsonb_typeof(p_metrics) <> 'object'
     OR length(COALESCE(p_notes, '')) > 1000 OR pg_column_size(p_metrics) > 4096 THEN
    RAISE EXCEPTION 'INVALID_AIRBNB_INPUT' USING ERRCODE = '22023';
  END IF;
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_metrics) LOOP
    IF v_key NOT IN ('views','impressions','favorites','totalConversion','firstPageRate','searchConversion','bookingConversion') THEN
      RAISE EXCEPTION 'INVALID_AIRBNB_METRIC' USING ERRCODE = '22023';
    END IF;
    IF v_value <> 'null'::jsonb THEN
      IF jsonb_typeof(v_value) <> 'number' THEN RAISE EXCEPTION 'INVALID_AIRBNB_NUMBER' USING ERRCODE = '22023'; END IF;
      IF v_value::text::numeric < 0 OR (v_key IN ('views','impressions','favorites') AND (v_value::text::numeric <> trunc(v_value::text::numeric) OR v_value::text::numeric > 9007199254740991))
         OR (v_key NOT IN ('views','impressions','favorites') AND v_value::text::numeric > 100) THEN
        RAISE EXCEPTION 'INVALID_AIRBNB_RANGE' USING ERRCODE = '22023';
      END IF;
      v_present := true;
    END IF;
  END LOOP;
  IF NOT v_present THEN RAISE EXCEPTION 'AIRBNB_METRIC_REQUIRED' USING ERRCODE = '22023'; END IF;
  -- Serialize creation and correction, including an initially absent interval.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || p_listing_id::text || p_start::text || p_end::text, 0));
  SELECT * INTO v_old FROM public.airbnb_performance_records
    WHERE tenant_id = p_tenant_id AND channel_listing_id = p_listing_id AND period_start = p_start AND period_end = p_end AND is_current FOR UPDATE;
  IF v_old.id IS NOT NULL AND v_old.metrics = p_metrics AND v_old.notes = COALESCE(p_notes, '') THEN RETURN to_jsonb(v_old); END IF;
  IF v_old.id IS DISTINCT FROM p_expected_id THEN RAISE EXCEPTION 'AIRBNB_RECORD_CHANGED' USING ERRCODE = '40001'; END IF;
  IF v_old.id IS NOT NULL THEN UPDATE public.airbnb_performance_records SET is_current = false WHERE id = v_old.id; END IF;
  INSERT INTO public.airbnb_performance_records(tenant_id, channel_listing_id, period_start, period_end, metrics, notes, supersedes_id)
    VALUES (p_tenant_id, p_listing_id, p_start, p_end, p_metrics, COALESCE(p_notes, ''), v_old.id) RETURNING * INTO v_new;
  RETURN to_jsonb(v_new);
END;
$$;
CREATE FUNCTION public.record_airbnb_listing_change(p_tenant_id uuid, p_listing_id uuid, p_date date, p_kind text, p_notes text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.airbnb_listing_changes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.can_manage_tenant(p_tenant_id), false) THEN RAISE EXCEPTION 'AIRBNB_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.property_channel_listings WHERE tenant_id = p_tenant_id AND id = p_listing_id AND channel_code = 'AIRBNB' AND status <> 'ARCHIVED') THEN RAISE EXCEPTION 'AIRBNB_LISTING_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_request_id IS NULL OR p_date IS NULL OR p_kind IS NULL OR p_kind NOT IN ('COVER','PHOTOS','TITLE','PRICE','OTHER') OR p_notes IS NULL OR length(trim(p_notes)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INVALID_AIRBNB_CHANGE' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.airbnb_listing_changes(id, tenant_id, channel_listing_id, change_date, kind, notes)
    VALUES(p_request_id, p_tenant_id, p_listing_id, p_date, p_kind, trim(p_notes)) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_row FROM public.airbnb_listing_changes WHERE id = p_request_id AND tenant_id = p_tenant_id AND channel_listing_id = p_listing_id AND change_date = p_date AND kind = p_kind AND notes = trim(p_notes);
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'AIRBNB_CHANGE_CONFLICT' USING ERRCODE = '40001'; END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.record_airbnb_performance(uuid,uuid,date,date,jsonb,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_airbnb_listing_change(uuid,uuid,date,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_airbnb_performance(uuid,uuid,date,date,jsonb,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_airbnb_listing_change(uuid,uuid,date,text,text,uuid) TO authenticated;
DO $$
DECLARE v_table text; v_fn text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['airbnb_performance_records','airbnb_listing_changes'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=v_table AND c.relrowsecurity) THEN RAISE EXCEPTION 'PHASE98_RLS_MISSING'; END IF;
    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT') OR has_table_privilege('authenticated', 'public.' || v_table, 'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'PHASE98_TABLE_ACCESS'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_table AND cmd='SELECT') THEN RAISE EXCEPTION 'PHASE98_POLICY_MISSING'; END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY['public.record_airbnb_performance(uuid,uuid,date,date,jsonb,text,uuid)','public.record_airbnb_listing_change(uuid,uuid,date,text,text,uuid)'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN RAISE EXCEPTION 'PHASE98_RPC_ACCESS'; END IF;
  END LOOP;
  RAISE NOTICE 'PHASE 98 OK: Airbnb performance and change history';
END;
$$;
COMMIT;
