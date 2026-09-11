-- =============================================================================
-- LEXBNB PHASE 5 — HARDENED OVERBOOKING CONCURRENCY & EXCLUSION CONSTRAINT MIGRATION
-- Database-Level ACID Overbooking Prevention, Strict RBAC & Zero-Trust RPCs
-- =============================================================================

-- 1. Enable btree_gist extension (required for combining UUID equality with daterange)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Drop existing constraint if already present to ensure idempotency
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS exclude_overlapping_bookings;

-- 3. Add PostgreSQL GiST Exclusion Constraint
-- Mathematical Proof of Invariants:
--   - property_id WITH =:
--       properties.id is a globally unique primary key (UUID v4).
--       Since each property strictly belongs to one tenant, property_id isolation
--       guarantees both intra-tenant property uniqueness and complete inter-tenant safety.
--   - daterange(check_in, check_out, '[)') WITH &&:
--       '[' includes check_in date.
--       ')' excludes check_out date (morning of departure).
--       Intersection of [A_in, A_out) and [B_in, B_out) is empty when A_out = B_in (same-day turnover allowed).
--   - WHERE (status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT')):
--       Only active inventory-holding statuses are tracked by the index.
--       'CANCELLED' bookings are omitted and never block calendar availability.
ALTER TABLE public.bookings
ADD CONSTRAINT exclude_overlapping_bookings
EXCLUDE USING gist (
    property_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
)
WHERE (status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'));

-- 4. Atomic Transaction-Safe RPC for Booking Creation (Hardened Zero-Trust)
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
    p_tenant_id UUID,
    p_property_id UUID,
    p_booking_code TEXT,
    p_guest_name TEXT,
    p_guest_phone TEXT,
    p_channel TEXT,
    p_check_in DATE,
    p_check_out DATE,
    p_pax INT,
    p_gross_amount NUMERIC,
    p_ota_commission NUMERIC,
    p_cleaning_fee NUMERIC,
    p_discount NUMERIC,
    p_net_room_revenue NUMERIC,
    p_status TEXT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_conflict_count INT;
    v_new_booking public.bookings%ROWTYPE;
BEGIN
    -- [1] Authentication Verification
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '28000';
    END IF;

    -- [2] Tenant Membership & Role Authorization Verification
    -- Aligned with LexBnB RLS Policy: Only owner, admin, manager, staff can create bookings
    SELECT role INTO v_user_role
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = v_user_id;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_TENANT: Belirtilen işletmeye erişim yetkiniz bulunmuyor.'
            USING ERRCODE = '42501';
    END IF;

    IF v_user_role NOT IN ('owner', 'admin', 'manager', 'staff') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu rol ile rezervasyon oluşturulamaz (Viewer yetkisi yetersizdir).'
            USING ERRCODE = '42501';
    END IF;

    -- [3] Property Existence & Tenant Ownership Verification
    -- Prevents foreign property injection across tenants
    IF NOT EXISTS (
        SELECT 1
        FROM public.properties
        WHERE id = p_property_id
          AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'INVALID_PROPERTY: Seçilen mülk aktif işletmenize ait değildir veya bulunamadı.'
            USING ERRCODE = '42501';
    END IF;

    -- [4] Date Integrity Validation
    IF p_check_in IS NULL OR p_check_out IS NULL THEN
        RAISE EXCEPTION 'INVALID_DATES: Giriş ve çıkış tarihleri zorunludur.'
            USING ERRCODE = '22004';
    END IF;

    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'INVALID_DATES: Çıkış tarihi (%) giriş tarihinden (%) sonra olmalıdır.',
            p_check_out,
            p_check_in
            USING ERRCODE = '22023';
    END IF;

    -- [5] Status Validation
    IF p_status NOT IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Tanımsız rezervasyon durumu: %', p_status
            USING ERRCODE = '22023';
    END IF;

    -- [6] Amount & Pax Integrity Validation
    IF p_gross_amount < 0 OR p_ota_commission < 0 OR p_cleaning_fee < 0 OR p_discount < 0 OR p_net_room_revenue < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Finansal tutarlar negatif olamaz.'
            USING ERRCODE = '22003';
    END IF;

    IF p_pax < 1 OR p_pax > 100 THEN
        RAISE EXCEPTION 'INVALID_PAX: Misafir sayısı 1 ile 100 arasında olmalıdır.'
            USING ERRCODE = '22003';
    END IF;

    -- [7] Advisory Transaction Lock (Two-Namespace Domain Key: tenant_id + property_id)
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_property_id::text));

    -- [8] Overbooking Verification (Explicit Pre-check before INSERT)
    IF p_status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT') THEN
        SELECT COUNT(*) INTO v_conflict_count
        FROM public.bookings
        WHERE property_id = p_property_id
          AND status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT')
          AND check_in < p_check_out
          AND check_out > p_check_in;

        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION 'OVERBOOKING_CONFLICT: Bu mülk seçilen tarihlerde başka bir rezervasyonla çakışıyor.'
                USING ERRCODE = '23P01';
        END IF;
    END IF;

    -- [9] Atomic Insert
    INSERT INTO public.bookings (
        tenant_id, property_id, booking_code, guest_name, guest_phone,
        channel, check_in, check_out, pax, gross_amount, ota_commission,
        cleaning_fee, discount, net_room_revenue, status, notes, created_by
    ) VALUES (
        p_tenant_id, p_property_id, p_booking_code, p_guest_name, p_guest_phone,
        p_channel, p_check_in, p_check_out, p_pax, p_gross_amount, p_ota_commission,
        p_cleaning_fee, p_discount, p_net_room_revenue, p_status, p_notes, v_user_id
    )
    RETURNING * INTO v_new_booking;

    RETURN to_jsonb(v_new_booking);
END;
$$;

-- 5. Atomic Transaction-Safe RPC for Booking Update (Hardened Zero-Trust)
CREATE OR REPLACE FUNCTION public.update_booking_atomic(
    p_booking_id UUID,
    p_tenant_id UUID,
    p_property_id UUID,
    p_guest_name TEXT,
    p_guest_phone TEXT,
    p_channel TEXT,
    p_check_in DATE,
    p_check_out DATE,
    p_pax INT,
    p_gross_amount NUMERIC,
    p_ota_commission NUMERIC,
    p_cleaning_fee NUMERIC,
    p_discount NUMERIC,
    p_net_room_revenue NUMERIC,
    p_status TEXT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_conflict_count INT;
    v_existing_booking public.bookings%ROWTYPE;
    v_updated_booking public.bookings%ROWTYPE;
BEGIN
    -- [1] Authentication Verification
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '28000';
    END IF;

    -- [2] Tenant Membership & Role Authorization Verification
    SELECT role INTO v_user_role
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = v_user_id;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_TENANT: Belirtilen işletmeye erişim yetkiniz bulunmuyor.'
            USING ERRCODE = '42501';
    END IF;

    IF v_user_role NOT IN ('owner', 'admin', 'manager', 'staff') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu rol ile rezervasyon güncellenemez (Viewer yetkisi yetersizdir).'
            USING ERRCODE = '42501';
    END IF;

    -- [3] Existing Booking Ownership Verification
    SELECT * INTO v_existing_booking
    FROM public.bookings
    WHERE id = p_booking_id
      AND tenant_id = p_tenant_id;

    IF v_existing_booking.id IS NULL THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND: Güncellenecek rezervasyon bulunamadı veya bu işletmeye ait değil.'
            USING ERRCODE = 'P0002';
    END IF;

    -- [4] Target Property Existence & Tenant Ownership Verification
    IF NOT EXISTS (
        SELECT 1
        FROM public.properties
        WHERE id = p_property_id
          AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'INVALID_PROPERTY: Hedef mülk aktif işletmenize ait değildir veya bulunamadı.'
            USING ERRCODE = '42501';
    END IF;

    -- [5] Date Integrity Validation
    IF p_check_in IS NULL OR p_check_out IS NULL THEN
        RAISE EXCEPTION 'INVALID_DATES: Giriş ve çıkış tarihleri zorunludur.'
            USING ERRCODE = '22004';
    END IF;

    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'INVALID_DATES: Çıkış tarihi (%) giriş tarihinden (%) sonra olmalıdır.',
            p_check_out,
            p_check_in
            USING ERRCODE = '22023';
    END IF;

    -- [6] Status Validation
    IF p_status NOT IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Tanımsız rezervasyon durumu: %', p_status
            USING ERRCODE = '22023';
    END IF;

    -- [7] Amount & Pax Integrity Validation
    IF p_gross_amount < 0 OR p_ota_commission < 0 OR p_cleaning_fee < 0 OR p_discount < 0 OR p_net_room_revenue < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Finansal tutarlar negatif olamaz.'
            USING ERRCODE = '22003';
    END IF;

    IF p_pax < 1 OR p_pax > 100 THEN
        RAISE EXCEPTION 'INVALID_PAX: Misafir sayısı 1 ile 100 arasında olmalıdır.'
            USING ERRCODE = '22003';
    END IF;

    -- [8] Advisory Transaction Lock (tenant_id + property_id)
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_property_id::text));

    -- [9] Overbooking Verification (Excluding self)
    IF p_status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT') THEN
        SELECT COUNT(*) INTO v_conflict_count
        FROM public.bookings
        WHERE property_id = p_property_id
          AND id != p_booking_id
          AND status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT')
          AND check_in < p_check_out
          AND check_out > p_check_in;

        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION 'OVERBOOKING_CONFLICT: Bu mülk seçilen tarihlerde başka bir rezervasyonla çakışıyor.'
                USING ERRCODE = '23P01';
        END IF;
    END IF;

    -- [10] Atomic Update
    UPDATE public.bookings SET
        property_id = p_property_id,
        guest_name = p_guest_name,
        guest_phone = p_guest_phone,
        channel = p_channel,
        check_in = p_check_in,
        check_out = p_check_out,
        pax = p_pax,
        gross_amount = p_gross_amount,
        ota_commission = p_ota_commission,
        cleaning_fee = p_cleaning_fee,
        discount = p_discount,
        net_room_revenue = p_net_room_revenue,
        status = p_status,
        notes = p_notes,
        updated_at = NOW()
    WHERE id = p_booking_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_updated_booking;

    RETURN to_jsonb(v_updated_booking);
END;
$$;

-- 6. Strict Hardened Grants: NO ANON PERMISSION
REVOKE ALL ON FUNCTION public.create_booking_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking_atomic FROM anon;
GRANT EXECUTE ON FUNCTION public.create_booking_atomic TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_booking_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_booking_atomic FROM anon;
GRANT EXECUTE ON FUNCTION public.update_booking_atomic TO authenticated, service_role;
