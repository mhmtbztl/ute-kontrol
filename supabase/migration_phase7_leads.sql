-- =============================================================================
-- LEXBNB PHASE 7 — LEADS & CRM ATOMIC CONVERSION MIGRATION
-- Database-Level Columns, CHECK Constraints, Cross-Tenant Isolation Trigger,
-- and Atomic convert_lead_to_booking_atomic RPC
-- =============================================================================

-- 1. Ensure columns exist on public.leads
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS converted_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255);

-- 2. Clean/Normalize legacy status if any dirty records exist before applying constraints
UPDATE public.leads
SET status = 'NEW'
WHERE status IS NULL OR status NOT IN ('NEW', 'CONTACTED', 'QUOTE_SENT', 'FOLLOW_UP', 'WON', 'LOST');

-- 3. Database-Level CHECK Constraints on public.leads
ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS chk_lead_guest_identity;
ALTER TABLE public.leads
ADD CONSTRAINT chk_lead_guest_identity CHECK (
    length(trim(COALESCE(guest_name, ''))) > 0 OR length(trim(COALESCE(guest_phone, ''))) > 0
);

ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS chk_lead_dates;
ALTER TABLE public.leads
ADD CONSTRAINT chk_lead_dates CHECK (
    requested_check_in IS NULL OR requested_check_out IS NULL OR requested_check_out > requested_check_in
);

ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS chk_lead_pax;
ALTER TABLE public.leads
ADD CONSTRAINT chk_lead_pax CHECK (
    pax IS NULL OR pax > 0
);

ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS chk_lead_quote;
ALTER TABLE public.leads
ADD CONSTRAINT chk_lead_quote CHECK (
    quote_amount IS NULL OR quote_amount >= 0
);

ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS chk_lead_status;
ALTER TABLE public.leads
ADD CONSTRAINT chk_lead_status CHECK (
    status IN ('NEW', 'CONTACTED', 'QUOTE_SENT', 'FOLLOW_UP', 'WON', 'LOST')
);

-- 4. Cross-Tenant Foreign Reference Protection Trigger
-- Guarantees that a lead for Tenant A can NEVER reference a property or booking of Tenant B
CREATE OR REPLACE FUNCTION public.check_lead_tenant_isolation()
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
    IF NEW.converted_booking_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.bookings
            WHERE id = NEW.converted_booking_id AND tenant_id = NEW.tenant_id
        ) THEN
            RAISE EXCEPTION 'CROSS_TENANT_BOOKING_VIOLATION: Seçilen rezervasyon aktif işletmeye ait değildir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_lead_tenant_isolation ON public.leads;
CREATE TRIGGER trg_verify_lead_tenant_isolation
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.check_lead_tenant_isolation();

-- 5. Atomic Lead -> Booking Conversion RPC
-- Re-uses the verified Phase 5 create_booking_atomic() RPC engine inside the same transaction
CREATE OR REPLACE FUNCTION public.convert_lead_to_booking_atomic(
    p_lead_id UUID,
    p_tenant_id UUID,
    p_property_id UUID DEFAULT NULL,
    p_booking_code TEXT DEFAULT NULL,
    p_check_in DATE DEFAULT NULL,
    p_check_out DATE DEFAULT NULL,
    p_pax INT DEFAULT NULL,
    p_gross_amount NUMERIC DEFAULT NULL,
    p_ota_commission NUMERIC DEFAULT 0,
    p_cleaning_fee NUMERIC DEFAULT 0,
    p_discount NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_lead public.leads%ROWTYPE;
    v_prop_id UUID;
    v_check_in DATE;
    v_check_out DATE;
    v_gross NUMERIC;
    v_pax INT;
    v_channel TEXT;
    v_notes TEXT;
    v_net_room_revenue NUMERIC;
    v_booking_json JSONB;
    v_booking_id UUID;
    v_attempts INT := 0;
    v_code TEXT;
BEGIN
    -- [1] Authentication Verification
    IF v_user_id IS NULL AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '28000';
    END IF;

    -- [2] Tenant Membership & Role Authorization Verification
    IF auth.role() != 'service_role' THEN
        SELECT role INTO v_user_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id;

        IF v_user_role IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED_TENANT: Belirtilen işletmeye erişim yetkiniz bulunmuyor.'
                USING ERRCODE = '42501';
        END IF;

        IF v_user_role NOT IN ('owner', 'admin', 'manager', 'staff') THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu rol ile rezervasyona dönüştürme yapılamaz (Viewer yetkisi yetersizdir).'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- [3] Lead Existence & Row Locking (FOR UPDATE)
    SELECT * INTO v_lead
    FROM public.leads
    WHERE id = p_lead_id
      AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LEAD_NOT_FOUND: Belirtilen talep bulunamadı veya erişim yetkiniz yok.'
            USING ERRCODE = '42501';
    END IF;

    -- [4] Duplicate Conversion Protection
    -- If lead is already converted or WON, reject with ALREADY_CONVERTED
    IF v_lead.converted_booking_id IS NOT NULL OR v_lead.status = 'WON' THEN
        RAISE EXCEPTION 'ALREADY_CONVERTED: Bu talep zaten bir rezervasyona dönüştürülmüş.'
            USING ERRCODE = '23505';
    END IF;

    -- [5] Resolve Conversion Target Values (Override or fallback to Lead record)
    v_prop_id := COALESCE(p_property_id, v_lead.property_id);
    IF v_prop_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_PROPERTY: Rezervasyona dönüştürmek için bir mülk seçilmelidir.'
            USING ERRCODE = '22023';
    END IF;

    v_check_in := COALESCE(p_check_in, v_lead.requested_check_in);
    v_check_out := COALESCE(p_check_out, v_lead.requested_check_out);
    IF v_check_in IS NULL OR v_check_out IS NULL THEN
        RAISE EXCEPTION 'INVALID_DATES: Giriş ve çıkış tarihleri zorunludur.'
            USING ERRCODE = '22004';
    END IF;

    v_gross := COALESCE(p_gross_amount, v_lead.quote_amount, 0);
    v_pax := COALESCE(p_pax, v_lead.pax, 2);
    v_channel := UPPER(COALESCE(NULLIF(TRIM(v_lead.channel), ''), 'DIRECT'));
    v_notes := COALESCE(p_notes, v_lead.notes, '');
    v_net_room_revenue := GREATEST(0, v_gross - COALESCE(p_ota_commission, 0) - COALESCE(p_discount, 0));

    -- [6] Execute Atomic Booking Engine with Collision Retry
    WHILE v_attempts < 3 LOOP
        v_attempts := v_attempts + 1;
        v_code := COALESCE(
            NULLIF(TRIM(p_booking_code), ''),
            'BK-' || to_char(v_check_in, 'YYMM') || '-' || floor(random() * 9000 + 1000)::text || UPPER(substr(md5(random()::text), 1, 3))
        );

        BEGIN
            v_booking_json := public.create_booking_atomic(
                p_tenant_id,
                v_prop_id,
                v_code,
                v_lead.guest_name,
                v_lead.guest_phone,
                v_channel,
                v_check_in,
                v_check_out,
                v_pax,
                v_gross,
                COALESCE(p_ota_commission, 0),
                COALESCE(p_cleaning_fee, 0),
                COALESCE(p_discount, 0),
                v_net_room_revenue,
                'CONFIRMED',
                v_notes
            );
            EXIT; -- Success, break retry loop
        EXCEPTION
            WHEN unique_violation THEN
                IF SQLERRM LIKE '%booking_code%' AND v_attempts < 3 THEN
                    p_booking_code := NULL; -- Force generate new code on next attempt
                    CONTINUE;
                ELSE
                    RAISE;
                END IF;
        END;
    END LOOP;

    -- [7] Extract Booking UUID & Mark Lead WON
    v_booking_id := (v_booking_json->>'id')::UUID;
    IF v_booking_id IS NULL THEN
        RAISE EXCEPTION 'BOOKING_CREATION_FAILED: Rezervasyon kimliği alınamadı.'
            USING ERRCODE = 'XX000';
    END IF;

    UPDATE public.leads
    SET status = 'WON',
        converted_booking_id = v_booking_id,
        updated_at = NOW()
    WHERE id = p_lead_id;

    -- [8] Return Structured Conversion Result
    RETURN jsonb_build_object(
        'success', true,
        'lead_id', p_lead_id,
        'converted_booking_id', v_booking_id,
        'booking', v_booking_json
    );
END;
$$;

REVOKE ALL ON FUNCTION public.convert_lead_to_booking_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_lead_to_booking_atomic FROM anon;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_booking_atomic TO authenticated, service_role;
