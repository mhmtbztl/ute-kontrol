-- =============================================================================
-- LEXBNB PHASE 6 — FINANCE & EXPENSES ENHANCEMENT MIGRATION
-- Database-Level CHECK Constraints, Cross-Tenant Isolation Trigger & Booking FK
-- =============================================================================

-- 1. Ensure booking_id and expense_type columns exist on public.expenses
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS expense_type VARCHAR(20) DEFAULT 'OPEX';

-- 2. Idempotent CHECK Constraints on public.expenses
ALTER TABLE public.expenses
DROP CONSTRAINT IF EXISTS chk_expense_positive_amount;
ALTER TABLE public.expenses
ADD CONSTRAINT chk_expense_positive_amount CHECK (amount > 0);

ALTER TABLE public.expenses
DROP CONSTRAINT IF EXISTS chk_expense_type;
ALTER TABLE public.expenses
ADD CONSTRAINT chk_expense_type CHECK (expense_type IN ('OPEX', 'CAPEX'));

ALTER TABLE public.expenses
DROP CONSTRAINT IF EXISTS chk_expense_category_not_empty;
ALTER TABLE public.expenses
ADD CONSTRAINT chk_expense_category_not_empty CHECK (length(trim(category)) > 0);

-- 3. Cross-Tenant Foreign Reference Protection Trigger
-- Guarantees that an expense for Tenant A can NEVER link to a property or booking of Tenant B
CREATE OR REPLACE FUNCTION public.check_expense_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Verify property belongs to the exact same tenant
    IF NEW.property_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = NEW.property_id AND tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_PROPERTY_VIOLATION: Seçilen mülk aktif işletmeye ait değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Verify booking belongs to the exact same tenant
    IF NEW.booking_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.bookings
            WHERE id = NEW.booking_id AND tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_BOOKING_VIOLATION: Seçilen rezervasyon aktif işletmeye ait değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_expense_tenant_isolation ON public.expenses;
CREATE TRIGGER trg_verify_expense_tenant_isolation
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.check_expense_tenant_isolation();

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_booking_id ON public.expenses(booking_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_prop ON public.expenses(tenant_id, property_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_type ON public.expenses(tenant_id, expense_type);
