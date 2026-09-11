-- =============================================================================
-- LEXBNB PHASE 12 — EXECUTIVE CONTROL CENTER & NOTIFICATIONS MIGRATION
-- Multi-Tenant Tables: executive_alerts, user_notifications, tenant_onboarding
-- Strict RLS Policies, Tenant Spoofing Defense, and Read-Only Snapshot RPC
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. TABLE: executive_alerts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.executive_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  alert_code VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')),
  domain VARCHAR(40) NOT NULL CHECK (domain IN ('OPERATIONS', 'FINANCE', 'GUEST_EXPERIENCE', 'PRICING', 'SALES_CRM', 'READINESS')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  title VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  metric VARCHAR(150),
  recommended_action TEXT NOT NULL,
  deep_link VARCHAR(255) NOT NULL,
  source_metrics JSONB DEFAULT '[]'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_executive_alerts_tenant ON public.executive_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_executive_alerts_status ON public.executive_alerts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_executive_alerts_property ON public.executive_alerts(property_id);

-- -----------------------------------------------------------------------------
-- 2. TABLE: user_notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key VARCHAR(255) NOT NULL,
  domain VARCHAR(40) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  deep_link VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD', 'READ', 'ACKNOWLEDGED', 'RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_tenant ON public.user_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_event_key ON public.user_notifications(tenant_id, event_key);

-- -----------------------------------------------------------------------------
-- 3. TABLE: tenant_onboarding
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
  progress_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_onboarding_tenant ON public.tenant_onboarding(tenant_id);

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.executive_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_executive_alerts" ON public.executive_alerts;
CREATE POLICY "tenant_isolation_executive_alerts" ON public.executive_alerts
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_user_notifications" ON public.user_notifications;
CREATE POLICY "tenant_isolation_user_notifications" ON public.user_notifications
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_isolation_tenant_onboarding" ON public.tenant_onboarding;
CREATE POLICY "tenant_isolation_tenant_onboarding" ON public.tenant_onboarding
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 5. ATOMIC RPC: acknowledge_notification_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_notification_atomic(
  p_notification_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notif RECORD;
BEGIN
  SELECT * INTO v_notif
  FROM public.user_notifications
  WHERE id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOTIFICATION_NOT_FOUND');
  END IF;

  -- Ensure caller belongs to notification tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = v_notif.tenant_id AND user_id = auth.uid()
  ) AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Tenant membership mismatch';
  END IF;

  UPDATE public.user_notifications
  SET status = 'ACKNOWLEDGED',
      acknowledged_at = NOW()
  WHERE id = p_notification_id;

  RETURN jsonb_build_object('success', true, 'id', p_notification_id, 'status', 'ACKNOWLEDGED');
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. ATOMIC RPC: resolve_executive_alert_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_executive_alert_atomic(
  p_alert_id UUID,
  p_resolved_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alert RECORD;
  v_user UUID;
BEGIN
  v_user := COALESCE(p_resolved_by, auth.uid());

  SELECT * INTO v_alert
  FROM public.executive_alerts
  WHERE id = p_alert_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALERT_NOT_FOUND');
  END IF;

  -- Ensure caller belongs to alert tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = v_alert.tenant_id AND user_id = auth.uid()
  ) AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Tenant membership mismatch';
  END IF;

  UPDATE public.executive_alerts
  SET status = 'RESOLVED',
      resolved_at = NOW(),
      resolved_by = v_user,
      updated_at = NOW()
  WHERE id = p_alert_id;

  RETURN jsonb_build_object('success', true, 'id', p_alert_id, 'status', 'RESOLVED');
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. READ-ONLY SNAPSHOT RPC: get_executive_dashboard_snapshot
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_executive_dashboard_snapshot(
  p_target_month TEXT,
  p_property_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_total_revenue NUMERIC(12, 2) := 0;
  v_total_expenses NUMERIC(12, 2) := 0;
  v_net_profit NUMERIC(12, 2) := 0;
  v_booked_nights INTEGER := 0;
  v_open_tasks_count INTEGER := 0;
  v_critical_tasks_count INTEGER := 0;
  v_open_alerts_count INTEGER := 0;
BEGIN
  -- Resolve active tenant for caller
  SELECT tm.tenant_id INTO v_tenant_id
  FROM public.tenant_members tm
  WHERE tm.user_id = auth.uid()
  LIMIT 1;

  IF v_tenant_id IS NULL AND auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: No active tenant found for current session';
  END IF;

  -- Aggregate monthly revenue from bookings
  SELECT COALESCE(SUM(b.gross_amount), 0), COUNT(b.id)
  INTO v_total_revenue, v_booked_nights
  FROM public.bookings b
  WHERE b.tenant_id = v_tenant_id
    AND b.status != 'CANCELLED'
    AND to_char(b.check_in, 'YYYY-MM') = p_target_month
    AND (p_property_id IS NULL OR b.property_id = p_property_id);

  -- Aggregate expenses
  SELECT COALESCE(SUM(e.amount), 0)
  INTO v_total_expenses
  FROM public.finance_transactions e
  WHERE e.tenant_id = v_tenant_id
    AND e.type = 'EXPENSE'
    AND to_char(e.transaction_date, 'YYYY-MM') = p_target_month
    AND (p_property_id IS NULL OR e.property_id = p_property_id);

  v_net_profit := v_total_revenue - v_total_expenses;

  -- Aggregate operational tasks
  SELECT COUNT(t.id), COUNT(CASE WHEN t.priority = 'CRITICAL' THEN 1 END)
  INTO v_open_tasks_count, v_critical_tasks_count
  FROM public.operational_tasks t
  WHERE t.tenant_id = v_tenant_id
    AND t.status IN ('TODO', 'IN_PROGRESS')
    AND (p_property_id IS NULL OR t.property_id = p_property_id);

  -- Aggregate open alerts
  SELECT COUNT(a.id)
  INTO v_open_alerts_count
  FROM public.executive_alerts a
  WHERE a.tenant_id = v_tenant_id
    AND a.status = 'OPEN'
    AND (p_property_id IS NULL OR a.property_id = p_property_id);

  RETURN jsonb_build_object(
    'target_month', p_target_month,
    'property_id', p_property_id,
    'total_revenue', v_total_revenue,
    'total_expenses', v_total_expenses,
    'net_profit', v_net_profit,
    'booked_nights', v_booked_nights,
    'open_tasks_count', v_open_tasks_count,
    'critical_tasks_count', v_critical_tasks_count,
    'open_alerts_count', v_open_alerts_count
  );
END;
$$;
