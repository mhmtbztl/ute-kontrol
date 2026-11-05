-- Domain conflicts are not transaction serialization failures. Return 23505
-- so the HTTP layer reports a conflict rather than retrying the same stale edit.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_airbnb_performance(p_tenant_id uuid, p_listing_id uuid, p_start date, p_end date, p_metrics jsonb, p_notes text DEFAULT '', p_expected_id uuid DEFAULT NULL)
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
  IF v_old.id IS DISTINCT FROM p_expected_id THEN RAISE EXCEPTION 'AIRBNB_RECORD_CHANGED' USING ERRCODE = '23505'; END IF;
  IF v_old.id IS NOT NULL THEN UPDATE public.airbnb_performance_records SET is_current = false WHERE id = v_old.id; END IF;
  INSERT INTO public.airbnb_performance_records(tenant_id, channel_listing_id, period_start, period_end, metrics, notes, supersedes_id)
    VALUES (p_tenant_id, p_listing_id, p_start, p_end, p_metrics, COALESCE(p_notes, ''), v_old.id) RETURNING * INTO v_new;
  RETURN to_jsonb(v_new);
END;
$$;
CREATE OR REPLACE FUNCTION public.record_airbnb_listing_change(p_tenant_id uuid, p_listing_id uuid, p_date date, p_kind text, p_notes text, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.airbnb_listing_changes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.can_manage_tenant(p_tenant_id), false) THEN RAISE EXCEPTION 'AIRBNB_ACCESS_DENIED' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.property_channel_listings WHERE tenant_id = p_tenant_id AND id = p_listing_id AND channel_code = 'AIRBNB' AND status <> 'ARCHIVED') THEN RAISE EXCEPTION 'AIRBNB_LISTING_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_request_id IS NULL OR p_date IS NULL OR p_kind IS NULL OR p_kind NOT IN ('COVER','PHOTOS','TITLE','PRICE','OTHER') OR p_notes IS NULL OR length(trim(p_notes)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INVALID_AIRBNB_CHANGE' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.airbnb_listing_changes(id, tenant_id, channel_listing_id, change_date, kind, notes)
    VALUES(p_request_id, p_tenant_id, p_listing_id, p_date, p_kind, trim(p_notes)) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_row FROM public.airbnb_listing_changes WHERE id = p_request_id AND tenant_id = p_tenant_id AND channel_listing_id = p_listing_id AND change_date = p_date AND kind = p_kind AND notes = trim(p_notes);
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'AIRBNB_CHANGE_CONFLICT' USING ERRCODE = '23505'; END IF;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.record_airbnb_performance(uuid,uuid,date,date,jsonb,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_airbnb_listing_change(uuid,uuid,date,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_airbnb_performance(uuid,uuid,date,date,jsonb,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_airbnb_listing_change(uuid,uuid,date,text,text,uuid) TO authenticated;
INSERT INTO public.schema_migrations(version, name) VALUES (102, 'airbnb_conflict_response') ON CONFLICT (version) DO NOTHING;
DO $$
BEGIN
  IF position('40001' in pg_get_functiondef('public.record_airbnb_performance(uuid,uuid,date,date,jsonb,text,uuid)'::regprocedure)) > 0
     OR position('23505' in pg_get_functiondef('public.record_airbnb_performance(uuid,uuid,date,date,jsonb,text,uuid)'::regprocedure)) = 0
     OR position('23505' in pg_get_functiondef('public.record_airbnb_listing_change(uuid,uuid,date,text,text,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'PHASE102_CONFLICT_CODE_INVALID';
  END IF;
  RAISE NOTICE 'PHASE 102 OK: non-retryable Airbnb conflict responses';
END;
$$;
COMMIT;
