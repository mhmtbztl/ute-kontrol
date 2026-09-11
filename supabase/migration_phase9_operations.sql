-- =============================================================================
-- LEXBNB PHASE 9 — OPERATIONS CONTROL CENTER & RESERVATION-DRIVEN WORKFLOWS
-- Database Migration: operational_tasks, operation_evidence, maintenance_tickets,
-- property_checklist_templates, recurring_task_rules, operations_audit_logs,
-- RLS Policies, Cross-Tenant Isolation Triggers, and resolve_maintenance_ticket_atomic RPC
-- =============================================================================

-- 1. Table: operational_tasks (Operasyonel Görevler)
CREATE TABLE IF NOT EXISTS public.operational_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('CLEANING', 'CHECKIN_PREP', 'CHECKOUT', 'INSPECTION', 'MAINTENANCE', 'INVENTORY', 'GENERAL')),
    task_subtype VARCHAR(50) DEFAULT 'STANDARD',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED')),
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    priority_score INT NOT NULL DEFAULT 0,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    due_at TIMESTAMPTZ,
    sla_breach_at TIMESTAMPTZ,
    is_sla_breached BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    evidence_note TEXT,
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
    source VARCHAR(50) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('BOOKING_EVENT', 'RECURRING', 'MANUAL', 'MAINTENANCE_TICKET')),
    source_event_id VARCHAR(100),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotency index: Prevent duplicate task creation for the same source event per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_tasks_source_event 
ON public.operational_tasks(tenant_id, source_event_id) 
WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operational_tasks_tenant_prop ON public.operational_tasks(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_operational_tasks_tenant_due ON public.operational_tasks(tenant_id, due_at);
CREATE INDEX IF NOT EXISTS idx_operational_tasks_status ON public.operational_tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_operational_tasks_booking ON public.operational_tasks(booking_id);

-- 2. Table: maintenance_tickets (Arıza & Bakım Biletleri)
CREATE TABLE IF NOT EXISTS public.maintenance_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    operational_task_id UUID REFERENCES public.operational_tasks(id) ON DELETE SET NULL,
    expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
    category VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'RESOLVED', 'CANCELLED')),
    reported_by UUID REFERENCES auth.users(id),
    assigned_to UUID REFERENCES auth.users(id),
    booking_impact BOOLEAN NOT NULL DEFAULT FALSE,
    estimated_cost NUMERIC(10,2) DEFAULT 0,
    actual_cost NUMERIC(10,2) DEFAULT 0,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tenant_prop ON public.maintenance_tickets(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tenant_status ON public.maintenance_tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_expense ON public.maintenance_tickets(expense_id);

-- 3. Table: operation_evidence (Fotoğraf ve Tamamlama Kanıtları)
CREATE TABLE IF NOT EXISTS public.operation_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    operational_task_id UUID REFERENCES public.operational_tasks(id) ON DELETE CASCADE,
    maintenance_ticket_id UUID REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
    evidence_type VARCHAR(50) NOT NULL CHECK (evidence_type IN ('BEFORE', 'AFTER', 'COMPLETION', 'DAMAGE', 'GENERAL')),
    storage_path VARCHAR(500) NOT NULL,
    public_url TEXT,
    note TEXT,
    uploaded_by UUID REFERENCES auth.users(id),
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_evidence_single_parent CHECK (
        (operational_task_id IS NOT NULL AND maintenance_ticket_id IS NULL) OR
        (operational_task_id IS NULL AND maintenance_ticket_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_evidence_task ON public.operation_evidence(operational_task_id);
CREATE INDEX IF NOT EXISTS idx_evidence_ticket ON public.operation_evidence(maintenance_ticket_id);
CREATE INDEX IF NOT EXISTS idx_evidence_tenant ON public.operation_evidence(tenant_id);

-- 4. Table: property_checklist_templates (Kontrol Listesi Şablonları)
CREATE TABLE IF NOT EXISTS public.property_checklist_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL DEFAULT 'CLEANING',
    template_name VARCHAR(150) NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_tenant_prop ON public.property_checklist_templates(tenant_id, property_id);

-- 5. Table: recurring_task_rules (Tekrarlayan Görev Kuralları)
CREATE TABLE IF NOT EXISTS public.recurring_task_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL DEFAULT 'MAINTENANCE',
    task_subtype VARCHAR(50) DEFAULT 'PREVENTIVE',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    frequency VARCHAR(50) NOT NULL CHECK (frequency IN ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEASONAL')),
    day_of_week INT CHECK (day_of_week >= 0 AND day_of_week <= 6),
    day_of_month INT CHECK (day_of_month >= 1 AND day_of_month <= 31),
    assigned_to UUID REFERENCES auth.users(id),
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_generated_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_tenant_prop ON public.recurring_task_rules(tenant_id, property_id);

-- 6. Table: operations_audit_logs (Operasyon Denetim Kütüğü)
CREATE TABLE IF NOT EXISTS public.operations_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.operational_tasks(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL CHECK (action IN ('CREATED', 'ASSIGNED', 'STARTED', 'BLOCKED', 'COMPLETED', 'CANCELLED', 'REOPENED')),
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    performed_by UUID REFERENCES auth.users(id),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operations_audit_task ON public.operations_audit_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_operations_audit_tenant ON public.operations_audit_logs(tenant_id);

-- =============================================================================
-- CROSS-TENANT ISOLATION TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_task_tenant_isolation()
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

    IF NEW.booking_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.bookings
            WHERE id = NEW.booking_id AND tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_BOOKING_VIOLATION: Seçilen rezervasyon aktif işletmeye ait değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.assigned_to IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tenant_members
            WHERE tenant_id = NEW.tenant_id AND user_id = NEW.assigned_to
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_STAFF_VIOLATION: Görev atanan kullanıcı bu işletmenin üyesi değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_task_tenant_isolation ON public.operational_tasks;
CREATE TRIGGER trg_verify_task_tenant_isolation
BEFORE INSERT OR UPDATE ON public.operational_tasks
FOR EACH ROW
EXECUTE FUNCTION public.check_task_tenant_isolation();

CREATE OR REPLACE FUNCTION public.check_maintenance_tenant_isolation()
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

    IF NEW.booking_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.bookings
            WHERE id = NEW.booking_id AND tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_BOOKING_VIOLATION: Seçilen rezervasyon aktif işletmeye ait değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.assigned_to IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tenant_members
            WHERE tenant_id = NEW.tenant_id AND user_id = NEW.assigned_to
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_STAFF_VIOLATION: Bakım atanan personel bu işletmenin üyesi değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'RESOLVED' AND OLD.expense_id IS NOT NULL AND NEW.actual_cost != OLD.actual_cost THEN
            RAISE EXCEPTION 'FINALIZED_MAINTENANCE_COST_IMMUTABLE: Muhasebeleşmiş bakım maliyeti doğrudan değiştirilemez. Lütfen düzeltme akışını kullanın.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_maintenance_tenant_isolation ON public.maintenance_tickets;
CREATE TRIGGER trg_verify_maintenance_tenant_isolation
BEFORE INSERT OR UPDATE ON public.maintenance_tickets
FOR EACH ROW
EXECUTE FUNCTION public.check_maintenance_tenant_isolation();

CREATE OR REPLACE FUNCTION public.check_evidence_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.operational_task_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.operational_tasks
            WHERE id = NEW.operational_task_id AND tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_EVIDENCE_VIOLATION: Kanıt eklenen görev bu işletmeye ait değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.maintenance_ticket_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.maintenance_tickets
            WHERE id = NEW.maintenance_ticket_id AND tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_EVIDENCE_VIOLATION: Kanıt eklenen bakım kaydı bu işletmeye ait değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_evidence_tenant_isolation ON public.operation_evidence;
CREATE TRIGGER trg_verify_evidence_tenant_isolation
BEFORE INSERT OR UPDATE ON public.operation_evidence
FOR EACH ROW
EXECUTE FUNCTION public.check_evidence_tenant_isolation();

CREATE OR REPLACE FUNCTION public.check_recurring_tenant_isolation()
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

    IF NEW.assigned_to IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tenant_members
            WHERE tenant_id = NEW.tenant_id AND user_id = NEW.assigned_to
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_STAFF_VIOLATION: Atanan personel bu işletmenin üyesi değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_recurring_tenant_isolation ON public.recurring_task_rules;
CREATE TRIGGER trg_verify_recurring_tenant_isolation
BEFORE INSERT OR UPDATE ON public.recurring_task_rules
FOR EACH ROW
EXECUTE FUNCTION public.check_recurring_tenant_isolation();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.operational_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_task_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view tasks" ON public.operational_tasks;
CREATE POLICY "Members view tasks" ON public.operational_tasks
FOR SELECT USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Staff manage tasks" ON public.operational_tasks;
CREATE POLICY "Staff manage tasks" ON public.operational_tasks
FOR ALL USING (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
) WITH CHECK (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
);

DROP POLICY IF EXISTS "Members view maintenance" ON public.maintenance_tickets;
CREATE POLICY "Members view maintenance" ON public.maintenance_tickets
FOR SELECT USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Staff manage maintenance" ON public.maintenance_tickets;
CREATE POLICY "Staff manage maintenance" ON public.maintenance_tickets
FOR ALL USING (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
) WITH CHECK (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
);

DROP POLICY IF EXISTS "Members view evidence" ON public.operation_evidence;
CREATE POLICY "Members view evidence" ON public.operation_evidence
FOR SELECT USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Staff insert evidence" ON public.operation_evidence;
CREATE POLICY "Staff insert evidence" ON public.operation_evidence
FOR INSERT WITH CHECK (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
);

DROP POLICY IF EXISTS "Members view templates" ON public.property_checklist_templates;
CREATE POLICY "Members view templates" ON public.property_checklist_templates
FOR SELECT USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Staff manage templates" ON public.property_checklist_templates;
CREATE POLICY "Staff manage templates" ON public.property_checklist_templates
FOR ALL USING (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
) WITH CHECK (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

DROP POLICY IF EXISTS "Members view recurring" ON public.recurring_task_rules;
CREATE POLICY "Members view recurring" ON public.recurring_task_rules
FOR SELECT USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Staff manage recurring" ON public.recurring_task_rules;
CREATE POLICY "Staff manage recurring" ON public.recurring_task_rules
FOR ALL USING (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
) WITH CHECK (
    public.is_tenant_member(tenant_id) 
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

DROP POLICY IF EXISTS "Members view operations audit" ON public.operations_audit_logs;
CREATE POLICY "Members view operations audit" ON public.operations_audit_logs
FOR SELECT USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "System insert operations audit" ON public.operations_audit_logs;
CREATE POLICY "System insert operations audit" ON public.operations_audit_logs
FOR INSERT WITH CHECK (
    public.is_tenant_member(tenant_id)
);

-- =============================================================================
-- ATOMIC RPC: resolve_maintenance_ticket_atomic
-- =============================================================================
CREATE OR REPLACE FUNCTION public.resolve_maintenance_ticket_atomic(
    p_tenant_id UUID,
    p_ticket_id UUID,
    p_actual_cost NUMERIC,
    p_category TEXT DEFAULT 'Tadilat',
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_ticket public.maintenance_tickets%ROWTYPE;
    v_expense_id UUID := NULL;
    v_expense_desc TEXT;
    v_category TEXT;
BEGIN
    IF v_user_id IS NULL AND coalesce(auth.jwt() ->> 'role', '') != 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '28000';
    END IF;

    IF coalesce(auth.jwt() ->> 'role', '') != 'service_role' THEN
        SELECT role INTO v_user_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id;

        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'manager', 'staff') THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Bakım kaydını kapatmak için yetkiniz bulunmuyor.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO v_ticket
    FROM public.maintenance_tickets
    WHERE id = p_ticket_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_ticket.id IS NULL THEN
        RAISE EXCEPTION 'TICKET_NOT_FOUND: Bakım kaydı bulunamadı veya yetkiniz yok.'
            USING ERRCODE = '42501';
    END IF;

    IF v_ticket.status = 'RESOLVED' AND v_ticket.expense_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'ticket_id', v_ticket.id,
            'status', v_ticket.status,
            'expense_id', v_ticket.expense_id,
            'actual_cost', v_ticket.actual_cost,
            'already_resolved', true
        );
    END IF;

    v_expense_id := v_ticket.expense_id;

    IF p_actual_cost IS NOT NULL AND p_actual_cost > 0 AND v_expense_id IS NULL THEN
        v_category := coalesce(nullif(trim(p_category), ''), 'Tadilat');
        v_expense_desc := coalesce(nullif(trim(p_description), ''), 'Bakım Gideri: ' || v_ticket.title);

        INSERT INTO public.expenses (
            tenant_id,
            property_id,
            booking_id,
            expense_date,
            category,
            amount,
            description,
            expense_type,
            created_by
        ) VALUES (
            p_tenant_id,
            v_ticket.property_id,
            v_ticket.booking_id,
            CURRENT_DATE,
            v_category,
            p_actual_cost,
            v_expense_desc,
            'OPEX',
            v_user_id
        ) RETURNING id INTO v_expense_id;
    END IF;

    UPDATE public.maintenance_tickets
    SET status = 'RESOLVED',
        actual_cost = coalesce(p_actual_cost, v_ticket.actual_cost, 0),
        expense_id = v_expense_id,
        resolved_at = NOW(),
        updated_at = NOW()
    WHERE id = v_ticket.id;

    RETURN jsonb_build_object(
        'success', true,
        'ticket_id', v_ticket.id,
        'status', 'RESOLVED',
        'expense_id', v_expense_id,
        'actual_cost', coalesce(p_actual_cost, v_ticket.actual_cost, 0),
        'already_resolved', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_maintenance_ticket_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_maintenance_ticket_atomic FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_maintenance_ticket_atomic TO authenticated, service_role;
