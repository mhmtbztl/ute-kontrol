-- =============================================================================
-- LEXBNB PHASE 8 — FINANCIAL INTELLIGENCE & MONTHLY PERFORMANCE MIGRATION
-- Database-Level Tables: monthly_targets, monthly_financial_closes, finance_import_batches
-- Constraints, RLS Policies, Closed Period Protection Triggers, and Atomic Close RPC
-- =============================================================================

-- 1. Table: monthly_targets (Aylık Hedefler)
CREATE TABLE IF NOT EXISTS public.monthly_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
    year INT NOT NULL CHECK (year >= 2020 AND year <= 2100),
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    revenue_target NUMERIC(12,2) DEFAULT 0 CHECK (revenue_target >= 0),
    net_profit_target NUMERIC(12,2) DEFAULT 0,
    margin_target NUMERIC(5,2) DEFAULT 0,
    occupancy_target NUMERIC(5,2) DEFAULT 0 CHECK (occupancy_target >= 0 AND occupancy_target <= 100),
    adr_target NUMERIC(10,2) DEFAULT 0 CHECK (adr_target >= 0),
    revpar_target NUMERIC(10,2) DEFAULT 0 CHECK (revpar_target >= 0),
    max_expense_target NUMERIC(12,2) DEFAULT 0 CHECK (max_expense_target >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique indexes: Portfolio target (property_id IS NULL) vs Property target (property_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_targets_portfolio 
ON public.monthly_targets(tenant_id, year, month) 
WHERE property_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_targets_property 
ON public.monthly_targets(tenant_id, property_id, year, month) 
WHERE property_id IS NOT NULL;

-- Cross-tenant isolation trigger on monthly_targets
CREATE OR REPLACE FUNCTION public.check_target_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.property_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = NEW.property_id AND tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_PROPERTY_VIOLATION: Seçilen mülk aktif işletmeye ait değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_target_tenant_isolation ON public.monthly_targets;
CREATE TRIGGER trg_verify_target_tenant_isolation
BEFORE INSERT OR UPDATE ON public.monthly_targets
FOR EACH ROW
EXECUTE FUNCTION public.check_target_tenant_isolation();

-- RLS on monthly_targets
ALTER TABLE public.monthly_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view targets" ON public.monthly_targets;
CREATE POLICY "Members view targets" ON public.monthly_targets
FOR SELECT USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Staff manage targets" ON public.monthly_targets;
CREATE POLICY "Staff manage targets" ON public.monthly_targets
FOR ALL USING (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
) WITH CHECK (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
);

-- 2. Table: monthly_financial_closes (Ay Sonu Kapanışları)
CREATE TABLE IF NOT EXISTS public.monthly_financial_closes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    year INT NOT NULL CHECK (year >= 2020 AND year <= 2100),
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES auth.users(id),
    snapshot_json JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_monthly_close UNIQUE (tenant_id, year, month)
);

ALTER TABLE public.monthly_financial_closes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view closes" ON public.monthly_financial_closes;
CREATE POLICY "Members view closes" ON public.monthly_financial_closes
FOR SELECT USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers update closes" ON public.monthly_financial_closes;
CREATE POLICY "Managers update closes" ON public.monthly_financial_closes
FOR ALL USING (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
) WITH CHECK (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

-- 3. Table: finance_import_batches (Excel / CSV İçe Aktarım Logu)
CREATE TABLE IF NOT EXISTS public.finance_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    file_hash VARCHAR(64) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    row_count INT NOT NULL DEFAULT 0,
    imported_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    imported_by UUID REFERENCES auth.users(id),
    CONSTRAINT uq_tenant_import_file UNIQUE (tenant_id, file_hash)
);

ALTER TABLE public.finance_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view imports" ON public.finance_import_batches;
CREATE POLICY "Members view imports" ON public.finance_import_batches
FOR SELECT USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Staff insert imports" ON public.finance_import_batches;
CREATE POLICY "Staff insert imports" ON public.finance_import_batches
FOR INSERT WITH CHECK (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
);

-- 4. Closed Period Protection Triggers
-- Prevents financial or operational tampering with closed accounting periods

-- Expense closed period guard
CREATE OR REPLACE FUNCTION public.guard_expense_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_date DATE;
    v_tenant_id UUID;
    v_is_closed BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_date := OLD.expense_date;
        v_tenant_id := OLD.tenant_id;
    ELSE
        v_date := NEW.expense_date;
        v_tenant_id := NEW.tenant_id;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.monthly_financial_closes
        WHERE tenant_id = v_tenant_id
          AND year = EXTRACT(YEAR FROM v_date)::INT
          AND month = EXTRACT(MONTH FROM v_date)::INT
          AND status = 'CLOSED'
    ) INTO v_is_closed;

    IF v_is_closed THEN
        RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu dönem (%-%) kapatılmıştır. Gider ekleme, güncelleme veya silme yapılamaz.',
            EXTRACT(YEAR FROM v_date)::INT, EXTRACT(MONTH FROM v_date)::INT
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_expense_closed_period ON public.expenses;
CREATE TRIGGER trg_guard_expense_closed_period
BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.guard_expense_closed_period();

-- Booking closed period guard (guards financial / operational mutations during closed periods)
CREATE OR REPLACE FUNCTION public.guard_booking_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_check_in DATE;
    v_tenant_id UUID;
    v_is_closed BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_check_in := OLD.check_in;
        v_tenant_id := OLD.tenant_id;
    ELSE
        v_check_in := NEW.check_in;
        v_tenant_id := NEW.tenant_id;
        
        -- If updating non-KPI fields only (e.g. notes only without dates/amounts/status change), permit update
        IF TG_OP = 'UPDATE' THEN
            IF OLD.check_in IS NOT DISTINCT FROM NEW.check_in 
               AND OLD.check_out IS NOT DISTINCT FROM NEW.check_out 
               AND OLD.gross_amount IS NOT DISTINCT FROM NEW.gross_amount 
               AND OLD.ota_commission IS NOT DISTINCT FROM NEW.ota_commission 
               AND OLD.cleaning_fee IS NOT DISTINCT FROM NEW.cleaning_fee 
               AND OLD.discount IS NOT DISTINCT FROM NEW.discount 
               AND OLD.status IS NOT DISTINCT FROM NEW.status 
               AND OLD.property_id IS NOT DISTINCT FROM NEW.property_id THEN
                RETURN NEW;
            END IF;
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.monthly_financial_closes
        WHERE tenant_id = v_tenant_id
          AND year = EXTRACT(YEAR FROM v_check_in)::INT
          AND month = EXTRACT(MONTH FROM v_check_in)::INT
          AND status = 'CLOSED'
    ) INTO v_is_closed;

    IF v_is_closed THEN
        RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu dönem (%-%) kapatılmıştır. Rezervasyon üzerinde finansal veya operasyonel değişiklik yapılamaz.',
            EXTRACT(YEAR FROM v_check_in)::INT, EXTRACT(MONTH FROM v_check_in)::INT
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_closed_period ON public.bookings;
CREATE TRIGGER trg_guard_booking_closed_period
BEFORE INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.guard_booking_closed_period();

-- 5. Atomic RPC: close_monthly_period_atomic
CREATE OR REPLACE FUNCTION public.close_monthly_period_atomic(
    p_tenant_id UUID,
    p_year INT,
    p_month INT,
    p_snapshot JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_close_row public.monthly_financial_closes%ROWTYPE;
BEGIN
    -- 1. Authentication check
    IF v_user_id IS NULL AND coalesce(auth.jwt() ->> 'role', '') != 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '28000';
    END IF;

    -- 2. Authorization check
    IF coalesce(auth.jwt() ->> 'role', '') != 'service_role' THEN
        SELECT role INTO v_user_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id;

        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'manager') THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Ay kapanışı yapabilmek için işletme yöneticisi yetkisi gereklidir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 3. Concurrency / Row lock upsert
    INSERT INTO public.monthly_financial_closes (
        tenant_id,
        year,
        month,
        status,
        closed_at,
        closed_by,
        snapshot_json,
        updated_at
    ) VALUES (
        p_tenant_id,
        p_year,
        p_month,
        'CLOSED',
        NOW(),
        v_user_id,
        p_snapshot,
        NOW()
    )
    ON CONFLICT (tenant_id, year, month) DO UPDATE
    SET status = 'CLOSED',
        closed_at = NOW(),
        closed_by = v_user_id,
        snapshot_json = p_snapshot,
        updated_at = NOW()
    RETURNING * INTO v_close_row;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_close_row.id,
        'tenant_id', v_close_row.tenant_id,
        'year', v_close_row.year,
        'month', v_close_row.month,
        'status', v_close_row.status,
        'closed_at', v_close_row.closed_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.close_monthly_period_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_monthly_period_atomic FROM anon;
GRANT EXECUTE ON FUNCTION public.close_monthly_period_atomic TO authenticated, service_role;
