-- =============================================================================
-- LEXBNB PHASE 24 — RGVQI AUDIT REMEDIATION
-- Apply after phases 20-23 in one transaction.
-- =============================================================================
BEGIN;

-- Property lifecycle: operational removal is an archive, never financial erasure.
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS activated_on DATE;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS deactivated_on DATE;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
UPDATE public.properties SET activated_on = created_at::date WHERE activated_on IS NULL;
ALTER TABLE public.properties ALTER COLUMN activated_on SET DEFAULT CURRENT_DATE;

DROP POLICY IF EXISTS "Managers delete properties" ON public.properties;

CREATE OR REPLACE FUNCTION public.guard_property_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(current_setting('lexbnb.allow_property_purge', true), '') <> 'on' THEN
    RAISE EXCEPTION 'PROPERTY_ARCHIVE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_property_hard_delete ON public.properties;
CREATE TRIGGER trg_guard_property_hard_delete
BEFORE DELETE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.guard_property_hard_delete();

-- Tenant ownership is immutable for every tenant-scoped record. Moving a row is
-- never an authorization operation; create a new row through an explicit flow.
CREATE OR REPLACE FUNCTION public.guard_tenant_id_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'TENANT_ID_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_tenant_id_immutable ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_tenant_id_immutable BEFORE UPDATE OF tenant_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable()',
      r.table_name
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_tenant_member_identity_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'TENANT_MEMBER_IDENTITY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tenant_member_identity_immutable ON public.tenant_members;
CREATE TRIGGER trg_tenant_member_identity_immutable
BEFORE UPDATE OF tenant_id, user_id ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_member_identity_immutable();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
    WHERE c.table_schema='public' AND c.column_name='updated_at' AND t.table_type='BASE TABLE'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', r.table_name);
    EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', r.table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_created_by()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND auth.uid() IS NOT NULL THEN NEW.created_by := auth.uid(); END IF;
  IF TG_OP = 'UPDATE' THEN NEW.created_by := OLD.created_by; END IF;
  RETURN NEW;
END;
$$;
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['properties','bookings','expenses','cleaning_tasks','leads']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_created_by ON public.%I', table_name);
    EXECUTE format('CREATE TRIGGER trg_guard_created_by BEFORE INSERT OR UPDATE OF created_by ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_created_by()', table_name);
  END LOOP;
END $$;

-- Audit events are server/trigger-only. SECURITY DEFINER must not be a client
-- escape hatch around the table's default-deny INSERT policy.
REVOKE ALL ON FUNCTION public.log_audit_event(UUID, VARCHAR, VARCHAR, UUID, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_audit_event(UUID, VARCHAR, VARCHAR, UUID, JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.log_audit_event(UUID, VARCHAR, VARCHAR, UUID, JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, VARCHAR, VARCHAR, UUID, JSONB, JSONB) TO service_role;

-- Canonical booking money contract.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS chk_booking_money_nonnegative;
ALTER TABLE public.bookings ADD CONSTRAINT chk_booking_money_nonnegative CHECK (
  gross_amount >= 0 AND ota_commission >= 0 AND cleaning_fee >= 0 AND discount >= 0
) NOT VALID;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS chk_booking_money_bounds;
ALTER TABLE public.bookings ADD CONSTRAINT chk_booking_money_bounds CHECK (
  discount <= gross_amount
  AND cleaning_fee <= gross_amount - discount
  AND ota_commission <= gross_amount - discount
) NOT VALID;

CREATE OR REPLACE FUNCTION public.canonicalize_booking_money()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.gross_amount < 0 OR NEW.discount < 0 OR NEW.cleaning_fee < 0 OR NEW.ota_commission < 0
     OR NEW.discount > NEW.gross_amount
     OR NEW.cleaning_fee > NEW.gross_amount - NEW.discount
     OR NEW.ota_commission > NEW.gross_amount - NEW.discount THEN
    RAISE EXCEPTION 'INVALID_BOOKING_MONEY' USING ERRCODE = '22003';
  END IF;
  -- Net room revenue excludes the guest cleaning charge and discount. OTA is an
  -- operating/distribution expense and therefore is not deducted here.
  NEW.net_room_revenue := round(NEW.gross_amount - NEW.cleaning_fee - NEW.discount, 2);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_canonicalize_booking_money ON public.bookings;
CREATE TRIGGER trg_canonicalize_booking_money
BEFORE INSERT OR UPDATE OF gross_amount, cleaning_fee, discount, ota_commission, net_room_revenue
ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.canonicalize_booking_money();

-- Availability must be explicit rather than inferred from a ticket title/status.
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS blocks_availability BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS downtime_start DATE;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS downtime_end DATE;
ALTER TABLE public.maintenance_tickets DROP CONSTRAINT IF EXISTS chk_maintenance_downtime;
ALTER TABLE public.maintenance_tickets ADD CONSTRAINT chk_maintenance_downtime CHECK (
  (blocks_availability = FALSE AND downtime_start IS NULL AND downtime_end IS NULL)
  OR (blocks_availability = TRUE AND downtime_start IS NOT NULL AND downtime_end IS NOT NULL AND downtime_end >= downtime_start)
) NOT VALID;

-- Cash/accrual ledger for payments, refunds, taxes, chargebacks and owner payouts.
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE RESTRICT,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'PAYMENT', 'REFUND', 'PARTIAL_REFUND', 'CANCELLATION_FEE', 'NO_SHOW_FEE',
    'CHARGEBACK', 'TAX', 'DEPOSIT', 'DAMAGE_CHARGE', 'OWNER_PAYOUT'
  )),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'TRY' CHECK (currency ~ '^[A-Z]{3}$'),
  occurred_on DATE NOT NULL,
  recognition_basis TEXT NOT NULL DEFAULT 'CASH' CHECK (recognition_basis IN ('CASH', 'ACCRUAL')),
  external_reference TEXT,
  notes TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, external_reference)
);
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_set_updated_at ON public.financial_transactions;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_guard_created_by ON public.financial_transactions;
CREATE TRIGGER trg_guard_created_by BEFORE INSERT OR UPDATE OF created_by ON public.financial_transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_created_by();
CREATE INDEX IF NOT EXISTS idx_financial_transactions_tenant_date
  ON public.financial_transactions(tenant_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_booking
  ON public.financial_transactions(tenant_id, booking_id);

DROP POLICY IF EXISTS "Members view financial transactions" ON public.financial_transactions;
CREATE POLICY "Members view financial transactions" ON public.financial_transactions FOR SELECT
  USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "Finance roles insert financial transactions" ON public.financial_transactions;
CREATE POLICY "Finance roles insert financial transactions" ON public.financial_transactions FOR INSERT
  WITH CHECK (public.get_tenant_role(tenant_id) IN ('owner','admin','manager'));
DROP POLICY IF EXISTS "Finance roles update financial transactions" ON public.financial_transactions;
CREATE POLICY "Finance roles update financial transactions" ON public.financial_transactions FOR UPDATE
  USING (public.get_tenant_role(tenant_id) IN ('owner','admin','manager'))
  WITH CHECK (public.get_tenant_role(tenant_id) IN ('owner','admin','manager'));
DROP POLICY IF EXISTS "Finance roles delete financial transactions" ON public.financial_transactions;
CREATE POLICY "Finance roles delete financial transactions" ON public.financial_transactions FOR DELETE
  USING (public.get_tenant_role(tenant_id) IN ('owner','admin'));

-- Month close uses the same contract as core/financial_metrics_service.js.
CREATE OR REPLACE FUNCTION public.compute_month_close_snapshot(
  p_tenant_id UUID, p_year INT, p_month INT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '' AS $$
DECLARE
  v_start DATE := make_date(p_year, p_month, 1);
  v_end DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::date;
  v_sold BIGINT := 0; v_bookings BIGINT := 0; v_available BIGINT := 0; v_downtime BIGINT := 0;
  v_room NUMERIC := 0; v_cleaning_revenue NUMERIC := 0; v_revenue NUMERIC := 0;
  v_ota NUMERIC := 0; v_opex NUMERIC := 0; v_capex NUMERIC := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_tenant_member(p_tenant_id)) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_TENANT' USING ERRCODE = '42501';
  END IF;
  WITH nights AS (
    SELECT b.id, (b.check_out - b.check_in)::numeric total_nights,
           b.gross_amount, b.cleaning_fee, b.discount, b.ota_commission
    FROM public.bookings b
    CROSS JOIN LATERAL generate_series(b.check_in, b.check_out - 1, interval '1 day') g(night)
    WHERE b.tenant_id = p_tenant_id AND b.status <> 'CANCELLED'
      AND g.night::date BETWEEN v_start AND v_end
  )
  SELECT COUNT(*), COUNT(DISTINCT id),
         COALESCE(SUM((gross_amount - cleaning_fee - discount) / total_nights),0),
         COALESCE(SUM(cleaning_fee / total_nights),0),
         COALESCE(SUM((gross_amount - discount) / total_nights),0),
         COALESCE(SUM(ota_commission / total_nights),0)
    INTO v_sold, v_bookings, v_room, v_cleaning_revenue, v_revenue, v_ota FROM nights;
  SELECT COALESCE(SUM(e.amount) FILTER (WHERE COALESCE(e.expense_type,'OPEX') <> 'CAPEX'),0),
         COALESCE(SUM(e.amount) FILTER (WHERE e.expense_type = 'CAPEX'),0)
    INTO v_opex, v_capex FROM public.expenses e
    WHERE e.tenant_id = p_tenant_id AND e.expense_date BETWEEN v_start AND v_end;
  SELECT COALESCE(SUM(GREATEST(0,
    LEAST(v_end, COALESCE(p.deactivated_on, v_end)) - GREATEST(v_start, p.activated_on) + 1
  )),0) INTO v_available FROM public.properties p
  WHERE p.tenant_id = p_tenant_id AND p.activated_on <= v_end
    AND COALESCE(p.deactivated_on, v_end) >= v_start;
  SELECT COUNT(*) INTO v_downtime FROM (
    SELECT DISTINCT m.property_id, d.day::date
    FROM public.maintenance_tickets m
    CROSS JOIN LATERAL generate_series(
      GREATEST(v_start, m.downtime_start), LEAST(v_end, m.downtime_end), interval '1 day'
    ) d(day)
    WHERE m.tenant_id = p_tenant_id AND m.blocks_availability = TRUE
      AND m.downtime_start <= v_end AND m.downtime_end >= v_start
  ) blocked;
  v_available := GREATEST(0, v_available - v_downtime);
  RETURN jsonb_build_object(
    'schemaVersion',3,'computedBy','server','computedAt',now(),'period',to_char(v_start,'YYYY-MM'),
    'bookingCount',v_bookings,'soldNights',v_sold,'availableNights',v_available,
    'revenue',round(v_revenue,2),'roomRevenue',round(v_room,2),
    'cleaningRevenue',round(v_cleaning_revenue,2),'otaCommission',round(v_ota,2),
    'manualOpex',round(v_opex,2),'capex',round(v_capex,2),
    'totalOpex',round(v_opex + v_ota,2),
    'netProfit',round(v_revenue - v_opex - v_ota - v_capex,2),
    'occupancy',CASE WHEN v_available > 0 THEN round(v_sold::numeric/v_available*100,2) ELSE NULL END,
    'adr',CASE WHEN v_sold > 0 THEN round(v_room/v_sold,2) ELSE NULL END,
    'revpar',CASE WHEN v_available > 0 THEN round(v_room/v_available,2) ELSE NULL END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.compute_month_close_snapshot(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_month_close_snapshot(UUID, INT, INT) TO authenticated, service_role;

-- Reliable invitation delivery outbox. A service-role worker calls Supabase Auth;
-- browser clients can neither read nor mutate delivery jobs.
CREATE TABLE IF NOT EXISTS public.invitation_delivery_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id UUID NOT NULL UNIQUE REFERENCES public.tenant_invitations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.invitation_delivery_outbox ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_set_updated_at ON public.invitation_delivery_outbox;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.invitation_delivery_outbox
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
REVOKE ALL ON public.invitation_delivery_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invitation_delivery_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_invitation_delivery()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'PENDING' THEN
    INSERT INTO public.invitation_delivery_outbox(invitation_id, tenant_id, email)
    VALUES (NEW.id, NEW.tenant_id, lower(NEW.email))
    ON CONFLICT (invitation_id) DO UPDATE SET
      email=EXCLUDED.email, status='PENDING', attempts=0, last_error=NULL,
      available_at=NOW(), sent_at=NULL, updated_at=NOW();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enqueue_invitation_delivery ON public.tenant_invitations;
CREATE TRIGGER trg_enqueue_invitation_delivery
AFTER INSERT OR UPDATE OF status, email ON public.tenant_invitations
FOR EACH ROW EXECUTE FUNCTION public.enqueue_invitation_delivery();

CREATE OR REPLACE FUNCTION public.claim_invitation_deliveries(p_limit INT DEFAULT 20)
RETURNS SETOF public.invitation_delivery_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.invitation_delivery_outbox
    WHERE status IN ('PENDING','FAILED') AND available_at <= NOW() AND attempts < 5
    ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT GREATEST(1, LEAST(p_limit,100))
  )
  UPDATE public.invitation_delivery_outbox o SET
    status='PROCESSING', attempts=o.attempts+1, updated_at=NOW()
  FROM picked WHERE o.id=picked.id RETURNING o.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_invitation_deliveries(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invitation_deliveries(INT) TO service_role;

-- The explicit active tenant is mandatory; never choose LIMIT 1 membership.
DROP FUNCTION IF EXISTS public.get_executive_dashboard_snapshot(TEXT, UUID);
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
    SELECT b.id, b.gross_amount, b.discount, b.ota_commission,
           (b.check_out - b.check_in)::numeric AS total_nights
    FROM public.bookings b
    CROSS JOIN LATERAL generate_series(b.check_in, b.check_out - 1, interval '1 day') g(night)
    WHERE b.tenant_id = p_tenant_id AND b.status <> 'CANCELLED'
      AND (p_property_id IS NULL OR b.property_id = p_property_id)
      AND g.night::date BETWEEN v_start AND v_end
  )
  SELECT COUNT(*), COALESCE(SUM((gross_amount - discount) / total_nights),0),
         COALESCE(SUM(ota_commission / total_nights),0)
    INTO v_sold_nights, v_revenue, v_ota FROM nights;

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
    'total_expenses', round(v_manual_expenses + v_ota,2),
    'net_profit', round(v_revenue - v_manual_expenses - v_ota,2),
    'booked_nights', v_sold_nights, 'available_nights', v_available_nights,
    'occupancy', CASE WHEN v_available_nights > 0 THEN round(v_sold_nights::numeric / v_available_nights * 100,2) ELSE NULL END,
    'open_tasks_count', v_open_tasks, 'critical_tasks_count', v_critical_tasks,
    'open_alerts_count', v_open_alerts
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_executive_dashboard_snapshot(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_executive_dashboard_snapshot(UUID, TEXT, UUID) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON public.schema_migrations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.schema_migrations TO service_role;
INSERT INTO public.schema_migrations(version, name)
VALUES (24, 'phase24_audit_remediation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
