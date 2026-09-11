-- =============================================================================
-- LEXBNB ENTERPRISE MULTI-TENANT DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- Production-Grade Security, Hardened RLS & Zero-Escalation Architecture
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. PROFILES (Kullanıcı Profil Bilgileri - auth.users ile 1:1)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(150),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TENANTS (İşletmeler / Şirketler)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(100) UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'pro',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TENANT_MEMBERS (Kullanıcı - İşletme İlişkisi & Rol Yönetimi)
CREATE TABLE IF NOT EXISTS public.tenant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, user_id)
);

-- 4. PROPERTIES (İşletmeye Ait Mülkler / Villalar)
CREATE TABLE IF NOT EXISTS public.properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    slug VARCHAR(50) NOT NULL, -- Örn: 'SEYIR', 'VILLA_1'
    name VARCHAR(150) NOT NULL,
    capacity VARCHAR(50) DEFAULT '6-8 Kişilik',
    base_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    clean_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    amenities TEXT DEFAULT '',
    url TEXT DEFAULT '',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

-- 5. BOOKINGS (Rezervasyonlar)
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    booking_code VARCHAR(50) NOT NULL,
    guest_name VARCHAR(150) NOT NULL,
    guest_phone VARCHAR(50),
    channel VARCHAR(50) NOT NULL DEFAULT 'Direct',
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    pax INT NOT NULL DEFAULT 2,
    gross_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    ota_commission NUMERIC(10,2) NOT NULL DEFAULT 0,
    cleaning_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_room_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED')),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, booking_code),
    CONSTRAINT chk_booking_dates CHECK (check_out > check_in),
    CONSTRAINT exclude_overlapping_bookings EXCLUDE USING gist (
        property_id WITH =,
        daterange(check_in, check_out, '[)') WITH &&
    ) WHERE (status != 'CANCELLED')
);

-- 6. EXPENSES (Gider Defteri)
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category VARCHAR(100) NOT NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    description TEXT,
    expense_type VARCHAR(20) DEFAULT 'OPEX',
    legacy_id VARCHAR(100), -- Migration idempotency için kaynak ID
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_expense_legacy UNIQUE (tenant_id, legacy_id),
    CONSTRAINT chk_expense_positive_amount CHECK (amount > 0),
    CONSTRAINT chk_expense_type CHECK (expense_type IN ('OPEX', 'CAPEX')),
    CONSTRAINT chk_expense_category_not_empty CHECK (length(trim(category)) > 0)
);

-- 7. CLEANING_TASKS (Temizlik & Hakediş Defteri)
CREATE TABLE IF NOT EXISTS public.cleaning_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    task_date DATE NOT NULL,
    cleaner_name VARCHAR(150) NOT NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    description TEXT,
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    legacy_id VARCHAR(100),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_tenant_cleaning_legacy UNIQUE (tenant_id, legacy_id)
);

-- 8. LEADS (Satış & CRM Hunisi)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
    converted_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    guest_name VARCHAR(150),
    guest_phone VARCHAR(50),
    guest_email VARCHAR(255),
    channel VARCHAR(50) NOT NULL DEFAULT 'WhatsApp',
    lead_date DATE NOT NULL DEFAULT CURRENT_DATE,
    requested_check_in DATE,
    requested_check_out DATE,
    pax INT,
    quote_amount NUMERIC(10,2) DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'QUOTE_SENT', 'FOLLOW_UP', 'WON', 'LOST')),
    lost_reason VARCHAR(100),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_lead_guest_identity CHECK (
        length(trim(COALESCE(guest_name, ''))) > 0 OR length(trim(COALESCE(guest_phone, ''))) > 0
    ),
    CONSTRAINT chk_lead_dates CHECK (
        requested_check_in IS NULL OR requested_check_out IS NULL OR requested_check_out > requested_check_in
    ),
    CONSTRAINT chk_lead_pax CHECK (
        pax IS NULL OR pax > 0
    ),
    CONSTRAINT chk_lead_quote CHECK (
        quote_amount IS NULL OR quote_amount >= 0
    )
);

-- 9. AUDIT_LOGS (Kritik İşlem Denetim İzi - Client INSERT Yapamaz)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. TENANT_MIGRATIONS (Veritabanı Seviyesinde Idempotent Migration Takibi)
CREATE TABLE IF NOT EXISTS public.tenant_migrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    source VARCHAR(50) NOT NULL DEFAULT 'localstorage',
    entity_type VARCHAR(50) NOT NULL, -- 'property', 'booking', 'expense', 'cleaning'
    source_record_id VARCHAR(100) NOT NULL,
    migrated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, entity_type, source_record_id)
);

-- =============================================================================
-- GÜVENLİK YARDIMCI FONKSİYONLARI (HARDENED SECURITY DEFINER FUNCTIONS)
-- =============================================================================

-- Üyelik kontrol fonksiyonu
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
    );
$$;

-- Rol kontrol fonksiyonu
CREATE OR REPLACE FUNCTION public.get_tenant_role(p_tenant_id UUID)
RETURNS VARCHAR
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT role FROM public.tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
    LIMIT 1;
$$;

-- Default PUBLIC yetkilerini kaldır, yalnızca authenticated role ver
REVOKE ALL ON FUNCTION public.is_tenant_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_tenant_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_role(UUID) TO authenticated;

-- =============================================================================
-- ATOMİK İŞLEM: TENANT + OWNER + PROFILE OLUŞTURMA (TEK GÜVENLİ DB İŞLEMİ)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_tenant_and_owner(
    p_company_name TEXT,
    p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_email TEXT;
    v_tenant_id UUID;
    v_slug TEXT;
BEGIN
    -- 1. Authenticated session zorunlu
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açılmamış! Lütfen önce giriş yapın.';
    END IF;

    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

    -- 2. Profile bağla / güncelle
    INSERT INTO public.profiles (id, full_name)
    VALUES (v_user_id, COALESCE(p_full_name, split_part(v_user_email, '@', 1)))
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        updated_at = NOW();

    -- 3. Tenant oluştur
    v_slug := lower(regexp_replace(p_company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(v_user_id::text, 1, 6);

    INSERT INTO public.tenants (name, slug, created_by)
    VALUES (p_company_name, v_slug, v_user_id)
    RETURNING id INTO v_tenant_id;

    -- 4. tenant_members (owner) oluştur
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (v_tenant_id, v_user_id, 'owner')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    -- 5. Denetim kaydı ekle
    INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (v_tenant_id, v_user_id, 'CREATE_TENANT', 'tenant', v_tenant_id, jsonb_build_object(
        'name', p_company_name,
        'slug', v_slug,
        'role', 'owner'
    ));

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'tenant_name', p_company_name,
        'tenant_slug', v_slug,
        'role', 'owner'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_and_owner(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tenant_and_owner(TEXT, TEXT) TO authenticated;

-- =============================================================================
-- GÜVENLİ AUDIT LOG FONKSİYONU (Yalnızca Güvenilir Server/Trigger Yazabilir)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_tenant_id UUID,
    p_action VARCHAR,
    p_entity_type VARCHAR,
    p_entity_id UUID DEFAULT NULL,
    p_old_data JSONB DEFAULT NULL,
    p_new_data JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (p_tenant_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_old_data, p_new_data);
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit_event TO authenticated;

-- =============================================================================
-- GUARDRAIL: SON OWNER KORUMASI (Bir İşletme Asla Sahipsiz Kalamaz)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_last_tenant_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_owner_count INT;
BEGIN
    IF (TG_OP = 'DELETE' AND OLD.role = 'owner') OR 
       (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner') THEN
        
        SELECT COUNT(*) INTO v_owner_count
        FROM public.tenant_members
        WHERE tenant_id = OLD.tenant_id AND role = 'owner' AND id <> OLD.id;
        
        IF v_owner_count = 0 THEN
            RAISE EXCEPTION 'İşletmenin son sahibi (owner) silinemez veya rolü düşürülemez!';
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_last_tenant_owner ON public.tenant_members;
CREATE TRIGGER trg_guard_last_tenant_owner
BEFORE UPDATE OR DELETE ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_last_tenant_owner();

-- Cross-Tenant Foreign Reference Protection Trigger for Expenses
CREATE OR REPLACE FUNCTION public.check_expense_tenant_isolation()
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

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_expense_tenant_isolation ON public.expenses;
CREATE TRIGGER trg_verify_expense_tenant_isolation
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.check_expense_tenant_isolation();

-- Cross-Tenant Foreign Reference Protection Trigger for Leads
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

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLİTİKALARI (TAM İZOLASYON)
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_migrations ENABLE ROW LEVEL SECURITY;

-- 1. Profiles: Kendi profilini okur/günceller
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 2. Tenants: Sadece üyesi olduğu işletmeyi görür/günceller. Doğrudan client DELETE engellenmiştir.
CREATE POLICY "Members view their tenants" ON public.tenants FOR SELECT USING (is_tenant_member(id));
CREATE POLICY "Auth users can create tenant" ON public.tenants FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owners and admins update tenant" ON public.tenants FOR UPDATE USING (get_tenant_role(id) IN ('owner', 'admin')) WITH CHECK (get_tenant_role(id) IN ('owner', 'admin'));
-- NOT: "Owners delete tenant" kaldırıldı. MVP'de client direct DELETE engellendi.

-- 3. Tenant Members: PRIVILEGE ESCALATION TAMAMEN ENGELLENDİ
-- SELECT: Üyeler işletme kadrosunu görebilir
CREATE POLICY "Members view team" ON public.tenant_members FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT: Yalnızca mevcut işletmenin owner veya admin'i yeni üye ekleyebilir.
-- (auth.uid() = user_id kaldırıldı! Attacker kendisini başka tenant'a ekleyemez!)
CREATE POLICY "Owners and admins add members" ON public.tenant_members FOR INSERT WITH CHECK (
    is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin')
);

-- UPDATE: Yalnızca OWNER üye rollerini güncelleyebilir.
CREATE POLICY "Owners manage member roles" ON public.tenant_members FOR UPDATE USING (
    is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) = 'owner'
) WITH CHECK (
    is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) = 'owner'
);

-- DELETE: Yalnızca OWNER üye çıkarabilir (ve son owner trigger ile korunur).
CREATE POLICY "Owners remove members" ON public.tenant_members FOR DELETE USING (
    is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) = 'owner' AND user_id <> auth.uid()
);

-- 4. Veri Tabloları (Properties, Bookings, Expenses, Cleaning Tasks, Leads)
-- SELECT: Tüm üyeler okuyabilir (viewer dahil)
CREATE POLICY "Members view properties" ON public.properties FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Members view bookings" ON public.bookings FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Members view expenses" ON public.expenses FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Members view cleaning" ON public.cleaning_tasks FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Members view leads" ON public.leads FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT/UPDATE: Viewer hariç rolü yetenler yazabilir (staff/manager/admin/owner)
CREATE POLICY "Staff insert properties" ON public.properties FOR INSERT WITH CHECK (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'));
CREATE POLICY "Staff update properties" ON public.properties FOR UPDATE USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')) WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "Staff insert bookings" ON public.bookings FOR INSERT WITH CHECK (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff'));
CREATE POLICY "Staff update bookings" ON public.bookings FOR UPDATE USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')) WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "Staff insert expenses" ON public.expenses FOR INSERT WITH CHECK (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'));
CREATE POLICY "Staff update expenses" ON public.expenses FOR UPDATE USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')) WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "Staff insert cleaning" ON public.cleaning_tasks FOR INSERT WITH CHECK (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff'));
CREATE POLICY "Staff update cleaning" ON public.cleaning_tasks FOR UPDATE USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')) WITH CHECK (is_tenant_member(tenant_id));

CREATE POLICY "Staff insert leads" ON public.leads FOR INSERT WITH CHECK (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff'));
CREATE POLICY "Staff update leads" ON public.leads FOR UPDATE USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')) WITH CHECK (is_tenant_member(tenant_id));

-- DELETE: Sadece Manager, Admin veya Owner silebilir
CREATE POLICY "Managers delete properties" ON public.properties FOR DELETE USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'));
CREATE POLICY "Managers delete bookings" ON public.bookings FOR DELETE USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'));
CREATE POLICY "Managers delete expenses" ON public.expenses FOR DELETE USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'));
CREATE POLICY "Managers delete cleaning" ON public.cleaning_tasks FOR DELETE USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'));
CREATE POLICY "Managers delete leads" ON public.leads FOR DELETE USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'));

-- 5. Audit Logs: CLIENT SPOOFING ENGELLENDİ
-- Yalnızca yetkili üyeler (owner, admin, manager) okuyabilir.
-- İstemciden INSERT, UPDATE, DELETE tamamen YASAKLANDI (Policy yok = Default Deny).
CREATE POLICY "Authorized view audit" ON public.audit_logs FOR SELECT USING (
    is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager')
);

-- 6. Tenant Migrations: Yalnızca işletme yetkilileri görebilir ve migration kaydı atabilir
CREATE POLICY "Members view migrations" ON public.tenant_migrations FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Owners insert migrations" ON public.tenant_migrations FOR INSERT WITH CHECK (
    is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin')
);

-- =============================================================================
-- PERFORMANS İNDEKSLEMESİ (INDEXES)
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON public.tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_properties_tenant ON public.properties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_dates ON public.bookings(tenant_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON public.expenses(tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tenant_date ON public.cleaning_tasks(tenant_id, task_date);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON public.leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_migrations_tenant_source ON public.tenant_migrations(tenant_id, entity_type, source_record_id);

-- =============================================================================
-- ATOMİK İŞLEM: OVERBOOKING ÖNLEYİCİ TRANSACTION-SAFE BOOKING CRUD RPCS
-- =============================================================================
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

    -- [8] Overbooking Verification
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

-- 7. ATOMİK İŞLEM: LEAD -> BOOKING CONVERSION RPC (PHASE 7)
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

-- =============================================================================
-- LEXBNB PHASE 8 — FINANCIAL INTELLIGENCE & MONTHLY PERFORMANCE MIGRATION
-- Database-Level Tables: monthly_targets, monthly_financial_closes, finance_import_batches
-- Constraints, RLS Policies, Closed Period Protection Triggers, and Atomic Close RPC
-- =============================================================================

-- 11. MONTHLY_TARGETS (Aylık Hedefler)
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_targets_portfolio 
ON public.monthly_targets(tenant_id, year, month) 
WHERE property_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_targets_property 
ON public.monthly_targets(tenant_id, property_id, year, month) 
WHERE property_id IS NOT NULL;

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

-- 12. MONTHLY_FINANCIAL_CLOSES (Ay Sonu Kapanışları)
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

-- 13. FINANCE_IMPORT_BATCHES (Excel / CSV İçe Aktarım Logu)
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

-- 14. CLOSED PERIOD PROTECTION TRIGGERS
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

-- 15. ATOMIC RPC: close_monthly_period_atomic
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
-- =============================================================================
-- LEXBNB PHASE 12 � EXECUTIVE CONTROL CENTER & NOTIFICATIONS MIGRATION
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

