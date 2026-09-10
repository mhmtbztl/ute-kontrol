-- =============================================================================
-- LEXBNB ENTERPRISE MULTI-TENANT DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
    CONSTRAINT chk_booking_dates CHECK (check_out > check_in)
);

-- 6. EXPENSES (Gider Defteri)
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category VARCHAR(100) NOT NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    description TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
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
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. LEADS (Satış & CRM Hunisi)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
    guest_name VARCHAR(150) NOT NULL,
    guest_phone VARCHAR(50),
    channel VARCHAR(50) NOT NULL DEFAULT 'WhatsApp',
    lead_date DATE NOT NULL DEFAULT CURRENT_DATE,
    requested_check_in DATE,
    requested_check_out DATE,
    pax INT,
    quote_amount NUMERIC(10,2) DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'QUOTE_SENT', 'WON', 'LOST')),
    lost_reason VARCHAR(100),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. AUDIT_LOGS (Kritik İşlem Denetim İzi)
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

-- =============================================================================
-- GÜVENLİK YARDIMCI FONKSİYONLARI (SECURITY DEFINER HELPER FUNCTIONS)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_role(p_tenant_id UUID)
RETURNS VARCHAR LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT role FROM public.tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
    LIMIT 1;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLİTİKALARI
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

-- Profiles: Kendi profilini okur/günceller, yeni kayıt ekleyebilir
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Tenants: Sadece üyesi olduğu işletmeyi görür/yönetir
CREATE POLICY "Members view their tenants" ON public.tenants FOR SELECT USING (is_tenant_member(id));
CREATE POLICY "Auth users can create tenant" ON public.tenants FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owners and admins update tenant" ON public.tenants FOR UPDATE USING (get_tenant_role(id) IN ('owner', 'admin')) WITH CHECK (get_tenant_role(id) IN ('owner', 'admin'));
CREATE POLICY "Owners delete tenant" ON public.tenants FOR DELETE USING (get_tenant_role(id) = 'owner');

-- Tenant Members: Üyeler kendi işletmesindeki üyeleri görebilir, admin/owner yönetebilir
CREATE POLICY "Members view team" ON public.tenant_members FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Join or owners add members" ON public.tenant_members FOR INSERT WITH CHECK (auth.uid() = user_id OR get_tenant_role(tenant_id) IN ('owner', 'admin'));
CREATE POLICY "Owners manage member roles" ON public.tenant_members FOR UPDATE USING (get_tenant_role(tenant_id) IN ('owner', 'admin')) WITH CHECK (get_tenant_role(tenant_id) IN ('owner', 'admin'));
CREATE POLICY "Owners remove members" ON public.tenant_members FOR DELETE USING (get_tenant_role(tenant_id) = 'owner' AND user_id <> auth.uid());

-- Veri Tabloları (Properties, Bookings, Expenses, Cleaning Tasks, Leads)
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

-- Audit Logs: Sadece sistem/üyeler okur, dışarıdan güncellenemez/silinemez
CREATE POLICY "Members view audit" ON public.audit_logs FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY "Members insert audit" ON public.audit_logs FOR INSERT WITH CHECK (is_tenant_member(tenant_id));

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
