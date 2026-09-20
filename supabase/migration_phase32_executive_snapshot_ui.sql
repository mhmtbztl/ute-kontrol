-- =============================================================================
-- LEXBNB PHASE 32 — EXECUTIVE SNAPSHOT UI CONTRACT
-- =============================================================================
-- The executive UI needs room revenue to calculate ADR and RevPAR without
-- rebuilding financial totals from the browser cache. Existing arguments and
-- grants stay unchanged; the JSON response gains only `room_revenue`.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_executive_dashboard_snapshot(
  p_tenant_id UUID,
  p_target_month TEXT,
  p_property_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_revenue NUMERIC := 0;
  v_room_revenue NUMERIC := 0;
  v_manual_expenses NUMERIC := 0;
  v_ota NUMERIC := 0;
  v_sold_nights BIGINT := 0;
  v_available_nights BIGINT := 0;
  v_downtime BIGINT := 0;
  v_open_tasks BIGINT := 0;
  v_critical_tasks BIGINT := 0;
  v_open_alerts BIGINT := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_TENANT' USING ERRCODE = '42501';
  END IF;
  IF p_target_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'INVALID_TARGET_MONTH' USING ERRCODE = '22007';
  END IF;
  v_start := (p_target_month || '-01')::date;
  v_end := (v_start + INTERVAL '1 month - 1 day')::date;
  IF p_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties WHERE id = p_property_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'INVALID_PROPERTY' USING ERRCODE = '42501';
  END IF;

  WITH nights AS (
    SELECT b.id, b.gross_amount, b.cleaning_fee, b.discount, b.ota_commission,
           (b.check_out - b.check_in)::numeric AS total_nights
    FROM public.bookings b
    CROSS JOIN LATERAL generate_series(b.check_in, b.check_out - 1, interval '1 day') g(night)
    WHERE b.tenant_id = p_tenant_id AND b.status <> 'CANCELLED'
      AND (p_property_id IS NULL OR b.property_id = p_property_id)
      AND g.night::date BETWEEN v_start AND v_end
  )
  SELECT COUNT(*),
         COALESCE(SUM((gross_amount - discount) / total_nights),0),
         COALESCE(SUM((gross_amount - cleaning_fee - discount) / total_nights),0),
         COALESCE(SUM(ota_commission / total_nights),0)
    INTO v_sold_nights, v_revenue, v_room_revenue, v_ota FROM nights;

  SELECT COALESCE(SUM(e.amount),0) INTO v_manual_expenses
  FROM public.expenses e WHERE e.tenant_id = p_tenant_id
    AND e.expense_date BETWEEN v_start AND v_end
    AND (p_property_id IS NULL OR e.property_id = p_property_id);

  SELECT COALESCE(SUM(GREATEST(0,
    LEAST(v_end, COALESCE(p.deactivated_on, v_end)) - GREATEST(v_start, p.activated_on) + 1
  )),0) INTO v_available_nights
  FROM public.properties p WHERE p.tenant_id = p_tenant_id
    AND (p_property_id IS NULL OR p.id = p_property_id)
    AND p.activated_on <= v_end AND COALESCE(p.deactivated_on, v_end) >= v_start;

  SELECT COUNT(*) INTO v_downtime FROM (
    SELECT DISTINCT m.property_id, d.day::date
    FROM public.maintenance_tickets m
    CROSS JOIN LATERAL generate_series(
      GREATEST(v_start, m.downtime_start), LEAST(v_end, m.downtime_end), interval '1 day'
    ) d(day)
    WHERE m.tenant_id = p_tenant_id AND m.blocks_availability = TRUE
      AND (p_property_id IS NULL OR m.property_id = p_property_id)
      AND m.downtime_start <= v_end AND m.downtime_end >= v_start
  ) blocked;
  v_available_nights := GREATEST(0, v_available_nights - v_downtime);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE priority = 'CRITICAL')
    INTO v_open_tasks, v_critical_tasks FROM public.operational_tasks
    WHERE tenant_id = p_tenant_id AND status IN ('TODO','IN_PROGRESS')
      AND (p_property_id IS NULL OR property_id = p_property_id);
  SELECT COUNT(*) INTO v_open_alerts FROM public.executive_alerts
    WHERE tenant_id = p_tenant_id AND status = 'OPEN'
      AND (p_property_id IS NULL OR property_id = p_property_id);

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id, 'target_month', p_target_month, 'property_id', p_property_id,
    'total_revenue', round(v_revenue,2),
    'room_revenue', round(v_room_revenue,2),
    'total_expenses', round(v_manual_expenses + v_ota,2),
    'net_profit', round(v_revenue - v_manual_expenses - v_ota,2),
    'booked_nights', v_sold_nights, 'available_nights', v_available_nights,
    'occupancy', CASE WHEN v_available_nights > 0 THEN round(v_sold_nights::numeric / v_available_nights * 100,2) ELSE NULL END,
    'open_tasks_count', v_open_tasks, 'critical_tasks_count', v_critical_tasks,
    'open_alerts_count', v_open_alerts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_executive_dashboard_snapshot(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_executive_dashboard_snapshot(UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_executive_dashboard_snapshot(UUID, TEXT, UUID) TO authenticated, service_role;

DO $$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.get_executive_dashboard_snapshot(uuid,text,uuid)'::regprocedure)
    INTO v_definition;
  IF v_definition NOT LIKE '%room_revenue%' THEN
    RAISE EXCEPTION 'PHASE32_ROOM_REVENUE_MISSING';
  END IF;
  IF has_function_privilege('anon', 'public.get_executive_dashboard_snapshot(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE32_ANON_EXECUTE_OPEN';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_executive_dashboard_snapshot(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE32_AUTHENTICATED_EXECUTE_MISSING';
  END IF;
  RAISE NOTICE 'PHASE 32 OK — executive snapshot UI contract ready';
END;
$$;

COMMIT;
