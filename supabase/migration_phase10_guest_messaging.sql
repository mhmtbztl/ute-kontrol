-- =============================================================================
-- LEXBNB PHASE 10 — GUEST LIFECYCLE & MESSAGING AUTOMATION MIGRATION
-- Production-Grade Multi-Tenant Schema, Hardened RLS, Idempotent Delivery,
-- State Machine, and Audit Protection
-- =============================================================================

-- 1. GUESTS (Misafir Profilleri)
CREATE TABLE IF NOT EXISTS public.guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(150),
    preferred_language VARCHAR(10) DEFAULT 'tr',
    country_code VARCHAR(10) DEFAULT 'TR',
    allow_email BOOLEAN DEFAULT TRUE,
    allow_sms BOOLEAN DEFAULT TRUE,
    allow_whatsapp BOOLEAN DEFAULT TRUE,
    marketing_opt_in BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_guest_identity CHECK (
        length(trim(coalesce(first_name, ''))) > 0 OR
        length(trim(coalesce(phone, ''))) > 0 OR
        length(trim(coalesce(email, ''))) > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_guests_tenant ON public.guests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guests_phone ON public.guests(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_guests_email ON public.guests(tenant_id, email);

-- 2. ENHANCE BOOKINGS WITH GUEST RELATION (Backward-Compatible)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS primary_guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_count INT DEFAULT 2;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS adults INT DEFAULT 2;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS children INT DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS infants INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bookings_primary_guest ON public.bookings(tenant_id, primary_guest_id);

-- 3. PROPERTY GUEST SETTINGS & SECRETS
CREATE TABLE IF NOT EXISTS public.property_guest_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    check_in_time VARCHAR(10) DEFAULT '15:00',
    check_out_time VARCHAR(10) DEFAULT '11:00',
    address_text TEXT,
    map_url TEXT,
    wifi_name VARCHAR(100),
    wifi_password VARCHAR(100),
    door_code VARCHAR(100),
    parking_instructions TEXT,
    arrival_instructions TEXT,
    house_rules TEXT,
    emergency_contact VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'Europe/Istanbul',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_prop_guest_settings ON public.property_guest_settings(tenant_id, property_id);

-- 4. MESSAGE TEMPLATES (Versioned, Soft-Delete Preserved)
CREATE TABLE IF NOT EXISTS public.message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('WHATSAPP', 'EMAIL', 'SMS', 'AIRBNB', 'BOOKING', 'INTERNAL')),
    lifecycle_stage VARCHAR(50) NOT NULL CHECK (lifecycle_stage IN (
        'BOOKING_CONFIRMED', 'PAYMENT_REMINDER', 'PRE_ARRIVAL', 'CHECKIN_DAY',
        'CHECKIN_INSTRUCTIONS', 'MID_STAY', 'CHECKOUT_REMINDER', 'CHECKOUT_DAY',
        'EXTENSION_OFFER', 'POST_STAY', 'REVIEW_REQUEST', 'REBOOKING_OFFER', 'MANUAL'
    )),
    message_type VARCHAR(50) NOT NULL DEFAULT 'TRANSACTIONAL' CHECK (message_type IN ('TRANSACTIONAL', 'MARKETING')),
    language VARCHAR(10) NOT NULL DEFAULT 'tr',
    subject VARCHAR(255),
    body TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_templates_lookup ON public.message_templates(tenant_id, lifecycle_stage, channel, language, is_active);

-- 5. MESSAGE AUTOMATION RULES
CREATE TABLE IF NOT EXISTS public.message_automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    lifecycle_stage VARCHAR(50) NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'TRANSACTIONAL' CHECK (message_type IN ('TRANSACTIONAL', 'MARKETING')),
    trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN (
        'BOOKING_CREATED', 'CHECKIN_AT', 'CHECKOUT_AT',
        'X_MINUTES_BEFORE_CHECKIN', 'X_HOURS_AFTER_CHECKIN',
        'X_HOURS_BEFORE_CHECKOUT', 'AFTER_CHECKOUT',
        'NEXT_NIGHT_AVAILABLE', 'PAYMENT_DUE'
    )),
    offset_minutes INT NOT NULL DEFAULT 0,
    template_id UUID NOT NULL REFERENCES public.message_templates(id) ON DELETE RESTRICT,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('WHATSAPP', 'EMAIL', 'SMS', 'AIRBNB', 'BOOKING', 'INTERNAL')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    conditions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_rules_lookup ON public.message_automation_rules(tenant_id, is_active, trigger_type);

-- 6. SCHEDULED MESSAGES (Idempotent, State Machine, Audit Protected)
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,
    automation_rule_id UUID REFERENCES public.message_automation_rules(id) ON DELETE SET NULL,
    template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
    template_version INT NOT NULL DEFAULT 1,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('WHATSAPP', 'EMAIL', 'SMS', 'AIRBNB', 'BOOKING', 'INTERNAL')),
    message_type VARCHAR(50) NOT NULL DEFAULT 'TRANSACTIONAL' CHECK (message_type IN ('TRANSACTIONAL', 'MARKETING')),
    recipient VARCHAR(150), -- Nullable at schedule time
    recipient_snapshot VARCHAR(150), -- Populated strictly at send time
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED')),
    claimed_at TIMESTAMPTZ,
    claimed_by VARCHAR(100),
    rendered_subject VARCHAR(255),
    rendered_body TEXT NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    provider_message_id VARCHAR(100),
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    failure_code VARCHAR(100),
    failure_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_msgs_due ON public.scheduled_messages(tenant_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_msgs_booking ON public.scheduled_messages(tenant_id, booking_id);

-- 7. MESSAGE DELIVERY LOGS (Sanitized, No Sensitive Secrets)
CREATE TABLE IF NOT EXISTS public.message_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    scheduled_message_id UUID NOT NULL REFERENCES public.scheduled_messages(id) ON DELETE CASCADE,
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    channel VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('SUCCESS', 'TRANSIENT_ERROR', 'PERMANENT_ERROR', 'SKIPPED')),
    error_code VARCHAR(100),
    error_category VARCHAR(100),
    provider_response_id VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_msg ON public.message_delivery_logs(tenant_id, scheduled_message_id);

-- 8. EXTENSION OFFERS (Server-Side Authoritative Pricing & Expiry)
CREATE TABLE IF NOT EXISTS public.extension_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    target_date DATE NOT NULL,
    base_price NUMERIC(10,2) NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    offered_price NUMERIC(10,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
    status VARCHAR(50) NOT NULL DEFAULT 'OFFERED' CHECK (status IN ('OFFERED', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
    expires_at TIMESTAMPTZ NOT NULL,
    availability_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, booking_id, target_date)
);

CREATE INDEX IF NOT EXISTS idx_extension_offers_booking ON public.extension_offers(tenant_id, booking_id);

-- =============================================================================
-- TRIGGERS & CONSTRAINTS
-- =============================================================================

-- Tenant Isolation Check Trigger for Guests
CREATE OR REPLACE FUNCTION public.check_guest_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        RAISE EXCEPTION 'ISOLATION_BREACH: tenant_id zorunludur' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_guest_tenant_isolation ON public.guests;
CREATE TRIGGER trg_verify_guest_tenant_isolation
    BEFORE INSERT OR UPDATE ON public.guests
    FOR EACH ROW EXECUTE FUNCTION public.check_guest_tenant_isolation();

-- Tenant Isolation Check Trigger for Templates
CREATE OR REPLACE FUNCTION public.check_template_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prop_tenant UUID;
BEGIN
    IF NEW.property_id IS NOT NULL THEN
        SELECT tenant_id INTO v_prop_tenant FROM public.properties WHERE id = NEW.property_id;
        IF v_prop_tenant IS NULL OR v_prop_tenant != NEW.tenant_id THEN
            RAISE EXCEPTION 'ISOLATION_BREACH: Şablon başka bir kiracının mülküne bağlanamaz' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_template_tenant_isolation ON public.message_templates;
CREATE TRIGGER trg_verify_template_tenant_isolation
    BEFORE INSERT OR UPDATE ON public.message_templates
    FOR EACH ROW EXECUTE FUNCTION public.check_template_tenant_isolation();

-- Tenant Isolation Check Trigger for Automation Rules
CREATE OR REPLACE FUNCTION public.check_rule_tenant_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prop_tenant UUID;
    v_tmpl_tenant UUID;
BEGIN
    IF NEW.property_id IS NOT NULL THEN
        SELECT tenant_id INTO v_prop_tenant FROM public.properties WHERE id = NEW.property_id;
        IF v_prop_tenant IS NULL OR v_prop_tenant != NEW.tenant_id THEN
            RAISE EXCEPTION 'ISOLATION_BREACH: Otomasyon kuralı başka bir kiracının mülküne bağlanamaz' USING ERRCODE = '42501';
        END IF;
    END IF;
    IF NEW.template_id IS NOT NULL THEN
        SELECT tenant_id INTO v_tmpl_tenant FROM public.message_templates WHERE id = NEW.template_id;
        IF v_tmpl_tenant IS NULL OR v_tmpl_tenant != NEW.tenant_id THEN
            RAISE EXCEPTION 'ISOLATION_BREACH: Otomasyon kuralı başka bir kiracının şablonuna bağlanamaz' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_rule_tenant_isolation ON public.message_automation_rules;
CREATE TRIGGER trg_verify_rule_tenant_isolation
    BEFORE INSERT OR UPDATE ON public.message_automation_rules
    FOR EACH ROW EXECUTE FUNCTION public.check_rule_tenant_isolation();

-- Scheduled Message Sent Immutability Trigger
CREATE OR REPLACE FUNCTION public.guard_scheduled_message_sent_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'SENT' THEN
            RAISE EXCEPTION 'IMMUTABILITY_BREACH: Gönderilmiş mesaj silinemez (Audit Trail)' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'SENT' THEN
            -- Only allow updated_at timestamp or identical fields
            IF NEW.status != 'SENT' OR NEW.rendered_body != OLD.rendered_body OR NEW.recipient_snapshot != OLD.recipient_snapshot THEN
                RAISE EXCEPTION 'IMMUTABILITY_BREACH: Gönderilmiş mesajın içeriği veya durumu değiştirilemez' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_scheduled_message_sent_immutability ON public.scheduled_messages;
CREATE TRIGGER trg_guard_scheduled_message_sent_immutability
    BEFORE UPDATE OR DELETE ON public.scheduled_messages
    FOR EACH ROW EXECUTE FUNCTION public.guard_scheduled_message_sent_immutability();

-- =============================================================================
-- RLS POLICIES (Multi-Tenant Isolation)
-- =============================================================================

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_guest_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_offers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- guests
    DROP POLICY IF EXISTS "guests_tenant_all" ON public.guests;
    CREATE POLICY "guests_tenant_all" ON public.guests
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    -- property_guest_settings
    DROP POLICY IF EXISTS "prop_guest_settings_tenant_all" ON public.property_guest_settings;
    CREATE POLICY "prop_guest_settings_tenant_all" ON public.property_guest_settings
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    -- message_templates
    DROP POLICY IF EXISTS "message_templates_tenant_all" ON public.message_templates;
    CREATE POLICY "message_templates_tenant_all" ON public.message_templates
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    -- message_automation_rules
    DROP POLICY IF EXISTS "message_rules_tenant_all" ON public.message_automation_rules;
    CREATE POLICY "message_rules_tenant_all" ON public.message_automation_rules
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    -- scheduled_messages
    DROP POLICY IF EXISTS "scheduled_messages_tenant_all" ON public.scheduled_messages;
    CREATE POLICY "scheduled_messages_tenant_all" ON public.scheduled_messages
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    -- message_delivery_logs
    DROP POLICY IF EXISTS "delivery_logs_tenant_all" ON public.message_delivery_logs;
    CREATE POLICY "delivery_logs_tenant_all" ON public.message_delivery_logs
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));

    -- extension_offers
    DROP POLICY IF EXISTS "extension_offers_tenant_all" ON public.extension_offers;
    CREATE POLICY "extension_offers_tenant_all" ON public.extension_offers
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()))
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()));
END;
$$;

-- =============================================================================
-- ATOMIC STORED PROCEDURES (RPC)
-- =============================================================================

-- 1. Atomic Claim of Due Messages with Stuck Processing Recovery
CREATE OR REPLACE FUNCTION public.claim_scheduled_messages_atomic(
    p_tenant_id UUID,
    p_worker_id VARCHAR,
    p_batch_size INT DEFAULT 10,
    p_stale_timeout_minutes INT DEFAULT 5
)
RETURNS SETOF public.scheduled_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Reclaim stale PROCESSING messages
    UPDATE public.scheduled_messages
    SET status = 'SCHEDULED',
        claimed_at = NULL,
        claimed_by = NULL,
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id
      AND status = 'PROCESSING'
      AND claimed_at < (NOW() - (p_stale_timeout_minutes || ' minutes')::interval);

    -- Claim due SCHEDULED messages
    RETURN QUERY
    WITH target_messages AS (
        SELECT id
        FROM public.scheduled_messages
        WHERE tenant_id = p_tenant_id
          AND status = 'SCHEDULED'
          AND scheduled_at <= NOW()
        ORDER BY scheduled_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.scheduled_messages sm
    SET status = 'PROCESSING',
        claimed_at = NOW(),
        claimed_by = p_worker_id,
        updated_at = NOW()
    FROM target_messages tm
    WHERE sm.id = tm.id
    RETURNING sm.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_scheduled_messages_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_scheduled_messages_atomic FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_messages_atomic TO authenticated, service_role;

-- 2. Record Message Delivery Result & Log Atomically
CREATE OR REPLACE FUNCTION public.record_message_delivery_result_atomic(
    p_tenant_id UUID,
    p_message_id UUID,
    p_status VARCHAR,
    p_recipient_snapshot VARCHAR,
    p_provider VARCHAR,
    p_provider_response_id VARCHAR DEFAULT NULL,
    p_error_code VARCHAR DEFAULT NULL,
    p_error_category VARCHAR DEFAULT NULL,
    p_failure_message TEXT DEFAULT NULL,
    p_max_retries INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_msg public.scheduled_messages%ROWTYPE;
    v_new_status VARCHAR;
    v_retry_count INT;
    v_next_scheduled TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_msg
    FROM public.scheduled_messages
    WHERE id = p_message_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_msg.id IS NULL THEN
        RAISE EXCEPTION 'MESSAGE_NOT_FOUND' USING ERRCODE = '42501';
    END IF;

    v_retry_count := v_msg.retry_count;

    IF p_status = 'SUCCESS' THEN
        v_new_status := 'SENT';
        UPDATE public.scheduled_messages
        SET status = 'SENT',
            recipient_snapshot = coalesce(p_recipient_snapshot, v_msg.recipient_snapshot, v_msg.recipient),
            provider_message_id = p_provider_response_id,
            sent_at = NOW(),
            claimed_at = NULL,
            claimed_by = NULL,
            updated_at = NOW()
        WHERE id = v_msg.id;

        INSERT INTO public.message_delivery_logs (
            tenant_id, scheduled_message_id, attempted_at, channel, provider, status, provider_response_id
        ) VALUES (
            p_tenant_id, v_msg.id, NOW(), v_msg.channel, p_provider, 'SUCCESS', p_provider_response_id
        );

    ELSIF p_status = 'SKIPPED' THEN
        v_new_status := 'SKIPPED';
        UPDATE public.scheduled_messages
        SET status = 'SKIPPED',
            failure_code = p_error_code,
            failure_message = p_failure_message,
            claimed_at = NULL,
            claimed_by = NULL,
            updated_at = NOW()
        WHERE id = v_msg.id;

        INSERT INTO public.message_delivery_logs (
            tenant_id, scheduled_message_id, attempted_at, channel, provider, status, error_code, error_category
        ) VALUES (
            p_tenant_id, v_msg.id, NOW(), v_msg.channel, p_provider, 'SKIPPED', p_error_code, p_error_category
        );

    ELSIF p_status = 'TRANSIENT_ERROR' AND v_retry_count < p_max_retries THEN
        v_retry_count := v_retry_count + 1;
        v_next_scheduled := NOW() + ((power(2, v_retry_count) * 5) || ' minutes')::interval;
        v_new_status := 'SCHEDULED';

        UPDATE public.scheduled_messages
        SET status = 'SCHEDULED',
            retry_count = v_retry_count,
            scheduled_at = v_next_scheduled,
            failure_code = p_error_code,
            failure_message = p_failure_message,
            claimed_at = NULL,
            claimed_by = NULL,
            updated_at = NOW()
        WHERE id = v_msg.id;

        INSERT INTO public.message_delivery_logs (
            tenant_id, scheduled_message_id, attempted_at, channel, provider, status, error_code, error_category
        ) VALUES (
            p_tenant_id, v_msg.id, NOW(), v_msg.channel, p_provider, 'TRANSIENT_ERROR', p_error_code, p_error_category
        );

    ELSE
        v_new_status := 'FAILED';
        UPDATE public.scheduled_messages
        SET status = 'FAILED',
            failure_code = p_error_code,
            failure_message = p_failure_message,
            failed_at = NOW(),
            claimed_at = NULL,
            claimed_by = NULL,
            updated_at = NOW()
        WHERE id = v_msg.id;

        INSERT INTO public.message_delivery_logs (
            tenant_id, scheduled_message_id, attempted_at, channel, provider, status, error_code, error_category
        ) VALUES (
            p_tenant_id, v_msg.id, NOW(), v_msg.channel, p_provider, 'PERMANENT_ERROR', p_error_code, p_error_category
        );
    END IF;

    RETURN jsonb_build_object(
        'message_id', v_msg.id,
        'status', v_new_status,
        'retry_count', v_retry_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_message_delivery_result_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_message_delivery_result_atomic FROM anon;
GRANT EXECUTE ON FUNCTION public.record_message_delivery_result_atomic TO authenticated, service_role;

-- 3. Atomic Extension Offer Acceptance (Overbooking Protected via GiST)
CREATE OR REPLACE FUNCTION public.accept_extension_offer_atomic(
    p_tenant_id UUID,
    p_offer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_offer public.extension_offers%ROWTYPE;
    v_booking public.bookings%ROWTYPE;
    v_new_checkout DATE;
    v_conflict_count INT;
BEGIN
    SELECT * INTO v_offer
    FROM public.extension_offers
    WHERE id = p_offer_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_offer.id IS NULL THEN
        RAISE EXCEPTION 'OFFER_NOT_FOUND: Uzatma teklifi bulunamadı' USING ERRCODE = '42501';
    END IF;

    IF v_offer.status != 'OFFERED' THEN
        RAISE EXCEPTION 'OFFER_INACTIVE: Bu teklif artık geçerli değil (Durum: %)', v_offer.status USING ERRCODE = '42501';
    END IF;

    IF v_offer.expires_at < NOW() THEN
        UPDATE public.extension_offers SET status = 'EXPIRED', updated_at = NOW() WHERE id = v_offer.id;
        RAISE EXCEPTION 'OFFER_EXPIRED: Uzatma teklifinin süresi dolmuş' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = v_offer.booking_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_booking.id IS NULL OR v_booking.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'BOOKING_INVALID: Rezervasyon bulunamadı veya iptal edilmiş' USING ERRCODE = '42501';
    END IF;

    IF v_booking.check_out != v_offer.target_date THEN
        UPDATE public.extension_offers SET status = 'REVOKED', updated_at = NOW() WHERE id = v_offer.id;
        RAISE EXCEPTION 'DATES_CHANGED: Rezervasyon çıkış tarihi değiştiği için teklif geçersiz kaldı' USING ERRCODE = '42501';
    END IF;

    v_new_checkout := v_offer.target_date + INTERVAL '1 day';

    SELECT count(*) INTO v_conflict_count
    FROM public.bookings
    WHERE property_id = v_offer.property_id
      AND id != v_booking.id
      AND status != 'CANCELLED'
      AND daterange(check_in, check_out, '[)') && daterange(v_offer.target_date, v_new_checkout, '[)');

    IF v_conflict_count > 0 THEN
        UPDATE public.extension_offers SET status = 'REVOKED', updated_at = NOW() WHERE id = v_offer.id;
        RAISE EXCEPTION 'OVERBOOKING_PREVENTED: Sonraki gece için başka bir rezervasyon bulunmaktadır' USING ERRCODE = '42501';
    END IF;

    UPDATE public.bookings
    SET check_out = v_new_checkout,
        gross_amount = round(gross_amount + v_offer.offered_price, 2),
        net_room_revenue = round(net_room_revenue + v_offer.offered_price, 2),
        updated_at = NOW()
    WHERE id = v_booking.id;

    UPDATE public.extension_offers
    SET status = 'ACCEPTED',
        accepted_at = NOW(),
        updated_at = NOW()
    WHERE id = v_offer.id;

    RETURN jsonb_build_object(
        'success', true,
        'offer_id', v_offer.id,
        'booking_id', v_booking.id,
        'new_checkout', v_new_checkout,
        'added_amount', v_offer.offered_price
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_extension_offer_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_extension_offer_atomic FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_extension_offer_atomic TO authenticated, service_role;
