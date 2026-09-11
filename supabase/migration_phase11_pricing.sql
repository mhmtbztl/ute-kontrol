-- =============================================================================
-- LEXBNB PHASE 11 — PRICING & REVENUE MANAGEMENT ENGINE MIGRATION
-- Production-Grade Multi-Tenant Schema, Hardened RLS, Guardrails,
-- Audit Logs, Explainable Snapshots, and Atomic Quote Acceptance
-- =============================================================================

-- 1. PRICING PROFILES (Mülk Bazlı Taban Fiyat ve Guardrail Kuralları)
CREATE TABLE IF NOT EXISTS public.pricing_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    weekday_base_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    weekend_base_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    minimum_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    maximum_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    weekend_days INT[] DEFAULT ARRAY[5, 6], -- 5 = Cuma, 6 = Cumartesi
    default_min_stay INT NOT NULL DEFAULT 1,
    default_max_stay INT,
    currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, property_id),
    CONSTRAINT chk_profile_rates CHECK (
        minimum_rate <= maximum_rate AND
        weekday_base_rate >= 0 AND
        weekend_base_rate >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_pricing_profiles_prop ON public.pricing_profiles(tenant_id, property_id);

-- 2. PRICING RULES (Dönemsel, Günlük, Lead Time ve Doluluk Kuralları)
CREATE TABLE IF NOT EXISTS public.pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN (
        'SEASON', 'DAY_OF_WEEK', 'LEAD_TIME', 'OCCUPANCY', 'LAST_MINUTE', 'GAP_NIGHT'
    )),
    start_date DATE,
    end_date DATE,
    multiplier NUMERIC(5,3),
    fixed_rate_override NUMERIC(10,2),
    min_stay_override INT,
    priority INT NOT NULL DEFAULT 10,
    conditions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_rule_pricing_mode CHECK (
        (multiplier IS NOT NULL AND fixed_rate_override IS NULL) OR
        (fixed_rate_override IS NOT NULL AND multiplier IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_lookup ON public.pricing_rules(tenant_id, rule_type, is_active, priority);

-- 3. PRICING EVENTS (Özel Etkinlikler, Festivaller, Bayramlar)
CREATE TABLE IF NOT EXISTS public.pricing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    multiplier NUMERIC(5,3),
    fixed_rate_override NUMERIC(10,2),
    min_stay_override INT,
    priority INT NOT NULL DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_event_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_pricing_events_dates ON public.pricing_events(tenant_id, start_date, end_date);

-- 4. PRICING OVERRIDES (Manuel Müdahaleler & İptal Edilme İzleme)
CREATE TABLE IF NOT EXISTS public.pricing_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    rate_override NUMERIC(10,2) NOT NULL,
    min_stay_override INT,
    reason TEXT NOT NULL,
    bypass_guardrail BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    superseded_by UUID REFERENCES public.pricing_overrides(id),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    CONSTRAINT chk_override_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_pricing_overrides_lookup ON public.pricing_overrides(tenant_id, property_id, is_active, start_date, end_date);

-- 5. DAILY RATES (Günlük Fiyat Hesaplama Tablosu)
CREATE TABLE IF NOT EXISTS public.daily_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    rate_date DATE NOT NULL,
    base_rate NUMERIC(10,2) NOT NULL,
    recommended_rate NUMERIC(10,2) NOT NULL,
    final_rate NUMERIC(10,2) NOT NULL,
    minimum_rate NUMERIC(10,2) NOT NULL,
    maximum_rate NUMERIC(10,2) NOT NULL,
    min_stay INT NOT NULL DEFAULT 1,
    is_gap_night BOOLEAN DEFAULT FALSE,
    is_orphan_gap BOOLEAN DEFAULT FALSE,
    source VARCHAR(50) NOT NULL DEFAULT 'ENGINE',
    engine_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    calculation_context_hash VARCHAR(64),
    adjustments_summary JSONB DEFAULT '[]'::jsonb,
    override_reason TEXT,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, property_id, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_rates_calendar ON public.daily_rates(tenant_id, property_id, rate_date);

-- 6. RATE CHANGE LOGS (Tam Denetlenebilir Fiyat Değişiklik İzi)
CREATE TABLE IF NOT EXISTS public.rate_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    rate_date DATE NOT NULL,
    old_rate NUMERIC(10,2),
    new_rate NUMERIC(10,2) NOT NULL,
    source VARCHAR(50) NOT NULL CHECK (source IN (
        'ENGINE_RECOMPUTE', 'MANUAL_OVERRIDE', 'OWNER_GUARDRAIL_OVERRIDE',
        'EVENT_CHANGE', 'RULE_CHANGE', 'BULK_EDIT'
    )),
    reason TEXT,
    performed_by UUID REFERENCES auth.users(id),
    batch_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_logs_lookup ON public.rate_change_logs(tenant_id, property_id, rate_date);

-- 7. BOOKING QUOTES (CRM & Teklif Snapshot'ı)
CREATE TABLE IF NOT EXISTS public.booking_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    quoted_total NUMERIC(10,2) NOT NULL,
    discount_type VARCHAR(20) DEFAULT 'FIXED_AMOUNT' CHECK (discount_type IN ('FIXED_AMOUNT', 'PERCENTAGE')),
    discount_value NUMERIC(10,2) DEFAULT 0.00,
    nightly_breakdown JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACCEPTED', 'EXPIRED', 'CANCELLED')),
    schema_version INT NOT NULL DEFAULT 1,
    quoted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_quote_dates CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS idx_booking_quotes_lookup ON public.booking_quotes(tenant_id, status, expires_at);

-- 8. ENHANCE BOOKINGS WITH QUOTE SNAPSHOT (Backward-Compatible)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS quote_snapshot JSONB;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pricing_source VARCHAR(50) DEFAULT 'CANONICAL';

-- =============================================================================
-- TRIGGERS & CONSTRAINTS
-- =============================================================================

-- Tenant Isolation Trigger for Pricing Profiles
CREATE OR REPLACE FUNCTION public.check_pricing_profile_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prop_tenant UUID;
BEGIN
    SELECT tenant_id INTO v_prop_tenant FROM public.properties WHERE id = NEW.property_id;
    IF v_prop_tenant IS NULL OR v_prop_tenant != NEW.tenant_id THEN
        RAISE EXCEPTION 'ISOLATION_BREACH: Fiyat profili başka bir kiracının mülküne bağlanamaz' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_pricing_profile_tenant_isolation ON public.pricing_profiles;
CREATE TRIGGER trg_verify_pricing_profile_tenant_isolation
    BEFORE INSERT OR UPDATE ON public.pricing_profiles
    FOR EACH ROW EXECUTE FUNCTION public.check_pricing_profile_tenant_isolation();

-- Tenant Isolation Trigger for Pricing Rules
CREATE OR REPLACE FUNCTION public.check_pricing_rule_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prop_tenant UUID;
BEGIN
    IF NEW.property_id IS NOT NULL THEN
        SELECT tenant_id INTO v_prop_tenant FROM public.properties WHERE id = NEW.property_id;
        IF v_prop_tenant IS NULL OR v_prop_tenant != NEW.tenant_id THEN
            RAISE EXCEPTION 'ISOLATION_BREACH: Fiyat kuralı başka bir kiracının mülküne bağlanamaz' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_pricing_rule_tenant_isolation ON public.pricing_rules;
CREATE TRIGGER trg_verify_pricing_rule_tenant_isolation
    BEFORE INSERT OR UPDATE ON public.pricing_rules
    FOR EACH ROW EXECUTE FUNCTION public.check_pricing_rule_tenant_isolation();

-- Guardrail on Accepted Quote Immutability
CREATE OR REPLACE FUNCTION public.guard_quote_accepted_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.status = 'ACCEPTED' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'IMMUTABILITY_BREACH: Kabul edilmiş fiyat teklifi silinemez' USING ERRCODE = '42501';
        END IF;
        IF NEW.status != 'ACCEPTED' OR NEW.quoted_total != OLD.quoted_total THEN
            RAISE EXCEPTION 'IMMUTABILITY_BREACH: Kabul edilmiş fiyat teklifinin içeriği değiştirilemez' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_quote_accepted_immutability ON public.booking_quotes;
CREATE TRIGGER trg_guard_quote_accepted_immutability
    BEFORE UPDATE OR DELETE ON public.booking_quotes
    FOR EACH ROW EXECUTE FUNCTION public.guard_quote_accepted_immutability();

-- =============================================================================
-- RLS POLICIES (Multi-Tenant Isolation)
-- =============================================================================

ALTER TABLE public.pricing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_quotes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "pricing_profiles_tenant_all" ON public.pricing_profiles;
    CREATE POLICY "pricing_profiles_tenant_all" ON public.pricing_profiles
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    DROP POLICY IF EXISTS "pricing_rules_tenant_all" ON public.pricing_rules;
    CREATE POLICY "pricing_rules_tenant_all" ON public.pricing_rules
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    DROP POLICY IF EXISTS "pricing_events_tenant_all" ON public.pricing_events;
    CREATE POLICY "pricing_events_tenant_all" ON public.pricing_events
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    DROP POLICY IF EXISTS "pricing_overrides_tenant_all" ON public.pricing_overrides;
    CREATE POLICY "pricing_overrides_tenant_all" ON public.pricing_overrides
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    DROP POLICY IF EXISTS "daily_rates_tenant_all" ON public.daily_rates;
    CREATE POLICY "daily_rates_tenant_all" ON public.daily_rates
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    DROP POLICY IF EXISTS "rate_change_logs_tenant_all" ON public.rate_change_logs;
    CREATE POLICY "rate_change_logs_tenant_all" ON public.rate_change_logs
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    DROP POLICY IF EXISTS "booking_quotes_tenant_all" ON public.booking_quotes;
    CREATE POLICY "booking_quotes_tenant_all" ON public.booking_quotes
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
END;
$$;

-- =============================================================================
-- ATOMIC STORED PROCEDURES (RPC)
-- =============================================================================

-- 1. Atomic Manual Override with Guardrail Validation & Supersede Logic
CREATE OR REPLACE FUNCTION public.save_manual_pricing_override_atomic(
    p_tenant_id UUID,
    p_property_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_rate_override NUMERIC,
    p_reason TEXT,
    p_bypass_guardrail BOOLEAN DEFAULT FALSE,
    p_min_stay_override INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role VARCHAR;
    v_profile public.pricing_profiles%ROWTYPE;
    v_new_override_id UUID;
    v_source VARCHAR;
    v_curr_date DATE;
    v_old_rate NUMERIC;
BEGIN
    -- Check role if bypass is requested
    IF p_bypass_guardrail THEN
        SELECT role INTO v_user_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

        IF v_user_role IS NULL OR v_user_role != 'owner' THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Taban/tavan fiyat bariyeri yalnız işletme sahibi (owner) tarafından aşılabilir'
                USING ERRCODE = '42501';
        END IF;
        v_source := 'OWNER_GUARDRAIL_OVERRIDE';
    ELSE
        v_source := 'MANUAL_OVERRIDE';
    END IF;

    -- Fetch pricing profile for guardrail verification
    SELECT * INTO v_profile
    FROM public.pricing_profiles
    WHERE property_id = p_property_id AND tenant_id = p_tenant_id;

    IF v_profile.id IS NOT NULL AND NOT p_bypass_guardrail THEN
        IF p_rate_override < v_profile.minimum_rate OR (v_profile.maximum_rate > 0 AND p_rate_override > v_profile.maximum_rate) THEN
            RAISE EXCEPTION 'GUARDRAIL_VIOLATION: Fiyat taban (₺%) ile tavan (₺%) aralığında olmalıdır',
                v_profile.minimum_rate, v_profile.maximum_rate
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Create new override
    INSERT INTO public.pricing_overrides (
        tenant_id, property_id, start_date, end_date, rate_override, min_stay_override,
        reason, bypass_guardrail, is_active, created_by
    ) VALUES (
        p_tenant_id, p_property_id, p_start_date, p_end_date, p_rate_override, p_min_stay_override,
        p_reason, p_bypass_guardrail, TRUE, v_user_id
    ) RETURNING id INTO v_new_override_id;

    -- Mark overlapping active overrides as superseded
    UPDATE public.pricing_overrides
    SET is_active = FALSE,
        superseded_by = v_new_override_id
    WHERE tenant_id = p_tenant_id
      AND property_id = p_property_id
      AND id != v_new_override_id
      AND is_active = TRUE
      AND daterange(start_date, end_date, '[]') && daterange(p_start_date, p_end_date, '[]');

    -- Update daily_rates and log changes
    v_curr_date := p_start_date;
    WHILE v_curr_date <= p_end_date LOOP
        SELECT final_rate INTO v_old_rate
        FROM public.daily_rates
        WHERE property_id = p_property_id AND tenant_id = p_tenant_id AND rate_date = v_curr_date;

        INSERT INTO public.daily_rates (
            tenant_id, property_id, rate_date, base_rate, recommended_rate, final_rate,
            minimum_rate, maximum_rate, source, override_reason, calculated_at
        ) VALUES (
            p_tenant_id, p_property_id, v_curr_date,
            coalesce(v_profile.weekday_base_rate, p_rate_override),
            coalesce(v_old_rate, p_rate_override),
            p_rate_override,
            coalesce(v_profile.minimum_rate, 0),
            coalesce(v_profile.maximum_rate, 999999),
            v_source, p_reason, NOW()
        )
        ON CONFLICT (tenant_id, property_id, rate_date) DO UPDATE
        SET final_rate = p_rate_override,
            source = v_source,
            override_reason = p_reason,
            calculated_at = NOW();

        INSERT INTO public.rate_change_logs (
            tenant_id, property_id, rate_date, old_rate, new_rate, source, reason, performed_by
        ) VALUES (
            p_tenant_id, p_property_id, v_curr_date, v_old_rate, p_rate_override, v_source, p_reason, v_user_id
        );

        v_curr_date := v_curr_date + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'override_id', v_new_override_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'rate_override', p_rate_override,
        'source', v_source
    );
END;
$$;

REVOKE ALL ON FUNCTION public.save_manual_pricing_override_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_manual_pricing_override_atomic FROM anon;
GRANT EXECUTE ON FUNCTION public.save_manual_pricing_override_atomic TO authenticated, service_role;

-- 2. Atomic Booking Quote Acceptance
CREATE OR REPLACE FUNCTION public.accept_booking_quote_atomic(
    p_tenant_id UUID,
    p_quote_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quote public.booking_quotes%ROWTYPE;
    v_conflict_count INT;
    v_booking_id UUID;
    v_booking_code VARCHAR;
    v_prop public.properties%ROWTYPE;
BEGIN
    SELECT * INTO v_quote
    FROM public.booking_quotes
    WHERE id = p_quote_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_quote.id IS NULL THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND: Fiyat teklifi bulunamadı' USING ERRCODE = '42501';
    END IF;

    IF v_quote.status != 'ACTIVE' THEN
        RAISE EXCEPTION 'QUOTE_INACTIVE: Fiyat teklifi artık geçerli değil (Durum: %)', v_quote.status USING ERRCODE = '42501';
    END IF;

    IF v_quote.expires_at < NOW() THEN
        UPDATE public.booking_quotes SET status = 'EXPIRED', updated_at = NOW() WHERE id = v_quote.id;
        RAISE EXCEPTION 'QUOTE_EXPIRED: Fiyat teklifinin süresi dolmuş' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_prop FROM public.properties WHERE id = v_quote.property_id AND tenant_id = p_tenant_id;
    IF v_prop.id IS NULL THEN
        RAISE EXCEPTION 'PROPERTY_NOT_FOUND: Mülk bulunamadı' USING ERRCODE = '42501';
    END IF;

    -- Verify real-time availability for [check_in, check_out)
    SELECT count(*) INTO v_conflict_count
    FROM public.bookings
    WHERE property_id = v_quote.property_id
      AND status != 'CANCELLED'
      AND daterange(check_in, check_out, '[)') && daterange(v_quote.check_in, v_quote.check_out, '[)');

    IF v_conflict_count > 0 THEN
        UPDATE public.booking_quotes SET status = 'CANCELLED', updated_at = NOW() WHERE id = v_quote.id;
        RAISE EXCEPTION 'OVERBOOKING_PREVENTED: Teklif verilen tarihlerde mülk dolu' USING ERRCODE = '42501';
    END IF;

    v_booking_code := 'BK-' || to_char(v_quote.check_in, 'DDMM') || '-' || substr(md5(random()::text), 1, 6);

    -- Create Booking via Phase 5 engine semantics with immutable quote snapshot
    INSERT INTO public.bookings (
        tenant_id, property_id, booking_code, guest_name, guest_phone, channel,
        check_in, check_out, gross_amount, net_room_revenue, status,
        quote_snapshot, pricing_source
    ) VALUES (
        p_tenant_id, v_quote.property_id, v_booking_code, 'Misafir', '', 'Direct',
        v_quote.check_in, v_quote.check_out, v_quote.quoted_total, v_quote.quoted_total, 'CONFIRMED',
        jsonb_build_object(
            'quote_id', v_quote.id,
            'schemaVersion', 1,
            'quoted_total', v_quote.quoted_total,
            'discount_type', v_quote.discount_type,
            'discount_value', v_quote.discount_value,
            'nightly_breakdown', v_quote.nightly_breakdown
        ),
        'QUOTE_ACCEPTED'
    ) RETURNING id INTO v_booking_id;

    -- Update Quote to terminal ACCEPTED
    UPDATE public.booking_quotes
    SET status = 'ACCEPTED',
        updated_at = NOW()
    WHERE id = v_quote.id;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', v_quote.id,
        'booking_id', v_booking_id,
        'booking_code', v_booking_code,
        'quoted_total', v_quote.quoted_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_booking_quote_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_booking_quote_atomic FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_booking_quote_atomic TO authenticated, service_role;
