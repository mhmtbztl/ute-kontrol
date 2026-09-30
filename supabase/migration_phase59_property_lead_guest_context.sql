-- =============================================================================
-- LEXBNB PHASE 59 — MULK, TALEP VE MISAFIR BAGLAMI (A2-G4)
-- =============================================================================
-- Kullanici kararlari (ENVANTER Mulkler, Misafirler ve Satis; 27-30.09.2026):
--
--   Mulk
--   * Konum koy/mahalle duzeyine iner; koordinat ve arastirma yaricapi (km)
--     tutulur. phase40'in yan tablosu property_analysis_context'e eklenir;
--     properties'e SUTUN EKLENMEZ (§3.4). save_property_location RPC'si.
--   * Mulk sahibi: yalniz ad ve iletisim. Gelir paylasimi YOK.
--     property_owners + property_owner_links (bir kisi birden cok mulke).
--
--   Talep
--   * "Nereden geldi" (edinme kaynagi) ZORUNLU; leads.channel iletisim
--     kanalidir, kaynak degildir. lead_source_catalog (isletme kendi kaynagini
--     ekler) + lead_acquisition. "Bilinmiyor" (UNKNOWN) her isletmede sistem
--     kaydidir, SILINEMEZ ve kapatilamaz. Eski talepler channel'dan TAHMIN
--     EDILMEZ: kaynak satiri yoksa bilinmiyordur.
--   * Takip tarihi ve ekip atamasi: lead_workflow.
--   * Telefon anahtar: fn_normalize_phone + ifade indeksi. quick_capture_lead
--     atomik: ayni telefonun ACIK talebi varsa yeni talep acilmaz, mevcut
--     talebe eklenir; tekrar gelen misafir/eski talep tanınir.
--   * Yalniz fiyat soranlar icin gunluk ilgi sayaci: lead_interest_daily
--     (kisisel veri yok) + bump_lead_interest.
--   * leads'e SUTUN EKLENMEDI (SEMA_BOSLUK dagitim tuzagi olcumu): yeni
--     istemci yeni sutun gonderirse goc uygulanmamis uretimde talep kaydinin
--     tamami duserdi. Yeni alanlar yan tablolarda.
--
--   Misafir
--   * Dogum gunu: guests.birth_date (bos olabilir).
--   * Kara / beyaz liste: guest_private_classifications — KVKK: olgusal
--     gerekce zorunlu; YALNIZ owner/admin/manager okur ve yazar (viewer ve
--     sales dahil kimse gormez). Baska isletmeyle asla paylasilmaz (RLS).
--
-- Sifirlama (CLAUDE.md 3.7): ilgi sayaci ve mulk sahipleri defterdir,
-- reset_tenant_data listesine eklenir (govde phase43 ile ayni, yalniz iki
-- tablo eklendi). Talep ve misafir yan tablolari cascade ile gider. Kaynak
-- katalogu ayardir, korunur.
--
-- Bagimlilik: phase53 (rol yardimcilari), phase40, phase42, phase43.
-- Uygulama: docs/PHASE59_DEPLOY_PACKAGE.md
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 53) THEN
        RAISE EXCEPTION 'PHASE59_REQUIRES_PHASE53';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 43) THEN
        RAISE EXCEPTION 'PHASE59_REQUIRES_PHASE43';
    END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. Konum genisletmesi (phase40 yan tablosu)
-- -----------------------------------------------------------------------------
ALTER TABLE public.property_analysis_context
    ADD COLUMN locality TEXT CHECK (locality IS NULL OR length(btrim(locality)) BETWEEN 1 AND 120),
    ADD COLUMN latitude NUMERIC(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD COLUMN longitude NUMERIC(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    ADD COLUMN research_radius_km NUMERIC(5,1) CHECK (research_radius_km IS NULL OR research_radius_km BETWEEN 0.5 AND 200),
    ADD CONSTRAINT property_analysis_context_coordinates_pair
        CHECK ((latitude IS NULL) = (longitude IS NULL));

CREATE OR REPLACE FUNCTION public.save_property_location(
    p_tenant_id UUID,
    p_property_id UUID,
    p_locality TEXT,
    p_latitude NUMERIC,
    p_longitude NUMERIC,
    p_research_radius_km NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    IF NOT public.can_manage_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Mulk konumunu yalniz yonetim degistirir.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.properties WHERE id = p_property_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'CROSS_TENANT_PROPERTY: Mulk bu isletmeye ait degil.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.property_analysis_context (property_id, tenant_id, locality, latitude, longitude, research_radius_km)
    VALUES (p_property_id, p_tenant_id, NULLIF(btrim(COALESCE(p_locality, '')), ''), p_latitude, p_longitude, p_research_radius_km)
    ON CONFLICT (property_id) DO UPDATE
       SET locality = EXCLUDED.locality, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
           research_radius_km = EXCLUDED.research_radius_km, updated_by = auth.uid(), updated_at = now()
     WHERE public.property_analysis_context.tenant_id = p_tenant_id;
    RETURN jsonb_build_object('success', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Mulk sahibi
-- -----------------------------------------------------------------------------
CREATE TABLE public.property_owners (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 150),
    phone       TEXT CHECK (phone IS NULL OR length(btrim(phone)) BETWEEN 3 AND 40),
    email       TEXT CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    notes       TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
    created_by  UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX property_owners_tenant_idx ON public.property_owners(tenant_id);

CREATE TABLE public.property_owner_links (
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    owner_id    UUID NOT NULL REFERENCES public.property_owners(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_by  UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (property_id, owner_id)
);
CREATE INDEX property_owner_links_owner_idx ON public.property_owner_links(owner_id);

-- -----------------------------------------------------------------------------
-- 3. Telefon anahtari
-- -----------------------------------------------------------------------------
-- +90 5xx..., 0090..., 05xx..., 5xx... hepsi +905xx... olur. Taninmayan bicim
-- rakamlariyla kalir (uydurma ulke kodu eklenmez). 7 rakamdan kisa -> NULL.
CREATE OR REPLACE FUNCTION public.fn_normalize_phone(p TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_plus   BOOLEAN := btrim(COALESCE(p, '')) LIKE '+%';
    v_digits TEXT := regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g');
BEGIN
    IF v_plus THEN
        RETURN CASE WHEN length(v_digits) >= 7 THEN '+' || v_digits ELSE NULL END;
    END IF;
    IF v_digits LIKE '00%' THEN
        v_digits := substr(v_digits, 3);
        RETURN CASE WHEN length(v_digits) >= 7 THEN '+' || v_digits ELSE NULL END;
    END IF;
    IF length(v_digits) = 11 AND v_digits LIKE '05%' THEN RETURN '+90' || substr(v_digits, 2); END IF;
    IF length(v_digits) = 10 AND v_digits LIKE '5%' THEN RETURN '+90' || v_digits; END IF;
    IF length(v_digits) = 12 AND v_digits LIKE '905%' THEN RETURN '+' || v_digits; END IF;
    RETURN CASE WHEN length(v_digits) >= 7 THEN v_digits ELSE NULL END;
END;
$$;

CREATE INDEX leads_tenant_phone_norm_idx ON public.leads (tenant_id, public.fn_normalize_phone(guest_phone));
CREATE INDEX guests_tenant_phone_norm_idx ON public.guests (tenant_id, public.fn_normalize_phone(phone));

-- -----------------------------------------------------------------------------
-- 4. Edinme kaynagi, takip, ilgi sayaci
-- -----------------------------------------------------------------------------
CREATE TABLE public.lead_source_catalog (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    code        TEXT NOT NULL CHECK (code ~ '^[A-Z0-9_]{1,40}$'),
    label       TEXT NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INT NOT NULL DEFAULT 100,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT lead_source_catalog_unknown_is_system CHECK ((code = 'UNKNOWN') = is_system)
);
CREATE UNIQUE INDEX lead_source_catalog_tenant_code_uq ON public.lead_source_catalog(tenant_id, code);

CREATE TABLE public.lead_acquisition (
    lead_id     UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    source_id   UUID NOT NULL REFERENCES public.lead_source_catalog(id),
    recorded_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_acquisition_source_idx ON public.lead_acquisition(tenant_id, source_id);

CREATE TABLE public.lead_workflow (
    lead_id           UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    next_follow_up_at TIMESTAMPTZ,
    assigned_to       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by        UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_workflow_follow_up_idx ON public.lead_workflow(tenant_id, next_follow_up_at);
CREATE INDEX lead_workflow_assignee_idx ON public.lead_workflow(tenant_id, assigned_to);

CREATE TABLE public.lead_interest_daily (
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    day         DATE NOT NULL,
    source_id   UUID NOT NULL REFERENCES public.lead_source_catalog(id),
    channel     TEXT NOT NULL CHECK (length(btrim(channel)) BETWEEN 1 AND 40),
    count       INT NOT NULL DEFAULT 0 CHECK (count >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, day, source_id, channel)
);

-- Her isletmede "Bilinmiyor": mevcutlara simdi, yenilere olusurken.
INSERT INTO public.lead_source_catalog (tenant_id, code, label, is_system, sort_order)
SELECT t.id, 'UNKNOWN', 'Bilinmiyor', TRUE, 999 FROM public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_lead_source_catalog_for_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.lead_source_catalog (tenant_id, code, label, is_system, sort_order)
    VALUES (NEW.id, 'UNKNOWN', 'Bilinmiyor', TRUE, 999)
    ON CONFLICT (tenant_id, code) DO NOTHING;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_lead_source_catalog_for_new_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_lead_source_catalog_for_new_tenant() FROM anon;
CREATE TRIGGER trg_seed_lead_source_catalog AFTER INSERT ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.seed_lead_source_catalog_for_new_tenant();

-- "Bilinmiyor" silinemez, kapatilamaz, kodu degismez (isletme silinirken haric)
CREATE OR REPLACE FUNCTION public.guard_lead_source_system_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_system AND NOT public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
            RAISE EXCEPTION 'SYSTEM_SOURCE_LOCKED: "Bilinmiyor" kaynagi silinemez.' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.is_system AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.is_system IS DISTINCT FROM OLD.is_system
                          OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.label IS DISTINCT FROM OLD.label) THEN
        RAISE EXCEPTION 'SYSTEM_SOURCE_LOCKED: "Bilinmiyor" kaynagi degistirilemez (yalniz sirasi).' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_lead_source_system_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_lead_source_system_row() FROM anon;
CREATE TRIGGER trg_guard_lead_source_system_row BEFORE UPDATE OR DELETE ON public.lead_source_catalog
    FOR EACH ROW EXECUTE FUNCTION public.guard_lead_source_system_row();

-- -----------------------------------------------------------------------------
-- 5. Misafir: dogum gunu ve yonetime ozel siniflandirma
-- -----------------------------------------------------------------------------
ALTER TABLE public.guests
    ADD COLUMN birth_date DATE CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01');

CREATE TABLE public.guest_private_classifications (
    guest_id    UUID PRIMARY KEY REFERENCES public.guests(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    list_type   TEXT NOT NULL CHECK (list_type IN ('WHITE', 'BLACK')),
    reason      TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
    incident_on DATE,
    recorded_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.guest_private_classifications IS
    'Kara/beyaz liste (KVKK kisisel veri). Gerekce olgusal yazilir. Yalniz owner/admin/manager; baska isletmeyle paylasilmaz.';

-- -----------------------------------------------------------------------------
-- 6. Kiraci esitligi (tek tetikleyici, tabloya gore)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_phase59_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_TABLE_NAME = 'property_owner_links' THEN
        IF NOT EXISTS (SELECT 1 FROM public.properties WHERE id = NEW.property_id AND tenant_id = NEW.tenant_id)
           OR NOT EXISTS (SELECT 1 FROM public.property_owners WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_OWNER_LINK: Mulk ya da sahip bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
    ELSIF TG_TABLE_NAME IN ('lead_acquisition', 'lead_workflow') THEN
        IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = NEW.lead_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_LEAD: Talep bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
        IF TG_TABLE_NAME = 'lead_acquisition' AND NOT EXISTS (
            SELECT 1 FROM public.lead_source_catalog WHERE id = NEW.source_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_SOURCE: Kaynak bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
        IF TG_TABLE_NAME = 'lead_workflow' AND NEW.assigned_to IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.tenant_members WHERE tenant_id = NEW.tenant_id AND user_id = NEW.assigned_to) THEN
            RAISE EXCEPTION 'CROSS_TENANT_ASSIGNEE: Atanan kisi bu isletmenin uyesi degil.' USING ERRCODE = '42501';
        END IF;
    ELSIF TG_TABLE_NAME = 'lead_interest_daily' THEN
        IF NOT EXISTS (SELECT 1 FROM public.lead_source_catalog WHERE id = NEW.source_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_SOURCE: Kaynak bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
    ELSIF TG_TABLE_NAME = 'guest_private_classifications' THEN
        IF NOT EXISTS (SELECT 1 FROM public.guests WHERE id = NEW.guest_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_GUEST: Misafir bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_phase59_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_phase59_links() FROM anon;

DO $tables$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['property_owners', 'property_owner_links', 'lead_source_catalog', 'lead_acquisition',
                                   'lead_workflow', 'lead_interest_daily', 'guest_private_classifications'] LOOP
        EXECUTE format('CREATE TRIGGER trg_tenant_id_immutable BEFORE UPDATE OF tenant_id ON public.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable()', v_table);
        EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', v_table);
        IF v_table IN ('property_owner_links', 'lead_acquisition', 'lead_workflow', 'lead_interest_daily', 'guest_private_classifications') THEN
            EXECUTE format('CREATE TRIGGER trg_guard_phase59_links BEFORE INSERT OR UPDATE ON public.%I '
                           'FOR EACH ROW EXECUTE FUNCTION public.guard_phase59_links()', v_table);
        END IF;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_table);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_table);
    END LOOP;
END
$tables$;
-- phase41 kaynak kurali acik ifade arar:
REVOKE ALL ON public.property_owners FROM anon;
REVOKE ALL ON public.property_owner_links FROM anon;
REVOKE ALL ON public.lead_source_catalog FROM anon;
REVOKE ALL ON public.lead_acquisition FROM anon;
REVOKE ALL ON public.lead_workflow FROM anon;
REVOKE ALL ON public.lead_interest_daily FROM anon;
REVOKE ALL ON public.guest_private_classifications FROM anon;

-- -----------------------------------------------------------------------------
-- 7. RLS
-- -----------------------------------------------------------------------------
-- Mulk sahibi: yonetim yazar; defter okuyuculari (viewer dahil) okur; sales ve staff yok
CREATE POLICY property_owners_select ON public.property_owners FOR SELECT TO authenticated USING (public.can_read_ledger(tenant_id));
CREATE POLICY property_owners_insert ON public.property_owners FOR INSERT TO authenticated WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY property_owners_update ON public.property_owners FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY property_owners_delete ON public.property_owners FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id));
CREATE POLICY property_owner_links_select ON public.property_owner_links FOR SELECT TO authenticated USING (public.can_read_ledger(tenant_id));
CREATE POLICY property_owner_links_insert ON public.property_owner_links FOR INSERT TO authenticated WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY property_owner_links_update ON public.property_owner_links FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY property_owner_links_delete ON public.property_owner_links FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id));

-- Kaynak katalogu: satis okur; yonetim duzenler
CREATE POLICY lead_source_catalog_select ON public.lead_source_catalog FOR SELECT TO authenticated USING (public.can_read_sales(tenant_id));
CREATE POLICY lead_source_catalog_insert ON public.lead_source_catalog FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id) AND NOT is_system);
CREATE POLICY lead_source_catalog_update ON public.lead_source_catalog FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY lead_source_catalog_delete ON public.lead_source_catalog FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id));

-- Talep yan tablolari: satis okur ve yazar, silme yonetim
CREATE POLICY lead_acquisition_select ON public.lead_acquisition FOR SELECT TO authenticated USING (public.can_read_sales(tenant_id));
CREATE POLICY lead_acquisition_insert ON public.lead_acquisition FOR INSERT TO authenticated WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY lead_acquisition_update ON public.lead_acquisition FOR UPDATE TO authenticated
    USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY lead_acquisition_delete ON public.lead_acquisition FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id));
CREATE POLICY lead_workflow_select ON public.lead_workflow FOR SELECT TO authenticated USING (public.can_read_sales(tenant_id));
CREATE POLICY lead_workflow_insert ON public.lead_workflow FOR INSERT TO authenticated WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY lead_workflow_update ON public.lead_workflow FOR UPDATE TO authenticated
    USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY lead_workflow_delete ON public.lead_workflow FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id));

-- Ilgi sayaci: satis okur; artis RPC ile, duzeltme/silme yonetim
CREATE POLICY lead_interest_daily_select ON public.lead_interest_daily FOR SELECT TO authenticated USING (public.can_read_sales(tenant_id));
CREATE POLICY lead_interest_daily_insert ON public.lead_interest_daily FOR INSERT TO authenticated WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY lead_interest_daily_update ON public.lead_interest_daily FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY lead_interest_daily_delete ON public.lead_interest_daily FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id));

-- Kara / beyaz liste: YALNIZ yonetim, dort islemde de
CREATE POLICY guest_private_classifications_select ON public.guest_private_classifications FOR SELECT TO authenticated
    USING (public.can_manage_tenant(tenant_id));
CREATE POLICY guest_private_classifications_insert ON public.guest_private_classifications FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY guest_private_classifications_update ON public.guest_private_classifications FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY guest_private_classifications_delete ON public.guest_private_classifications FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

-- -----------------------------------------------------------------------------
-- 8. RPC: hizli kayit ve ilgi sayaci
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quick_capture_lead(
    p_tenant_id   UUID,
    p_phone       TEXT,
    p_source_id   UUID,
    p_channel     TEXT,
    p_check_in    DATE DEFAULT NULL,
    p_check_out   DATE DEFAULT NULL,
    p_pax         INT DEFAULT NULL,
    p_property_id UUID DEFAULT NULL,
    p_guest_name  TEXT DEFAULT NULL,
    p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_phone     TEXT := public.fn_normalize_phone(p_phone);
    v_lead      public.leads%ROWTYPE;
    v_created   BOOLEAN := FALSE;
    v_guest_id  UUID;
    v_previous  INT;
    v_class     TEXT;
    v_stamp     TEXT := to_char(now() AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
    v_line      TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    IF NOT public.can_write_sales(p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Talep kaydetme yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    IF v_phone IS NULL THEN
        RAISE EXCEPTION 'PHONE_REQUIRED: Hizli kayit telefon numarasiyla yapilir.' USING ERRCODE = '22023';
    END IF;
    IF p_source_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.lead_source_catalog WHERE id = p_source_id AND tenant_id = p_tenant_id AND is_active) THEN
        RAISE EXCEPTION 'SOURCE_REQUIRED: "Nereden geldi" secilmeli (bilinmiyorsa "Bilinmiyor").' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(COALESCE(p_channel, ''))) = 0 THEN
        RAISE EXCEPTION 'CHANNEL_REQUIRED: Iletisim kanali secilmeli.' USING ERRCODE = '22023';
    END IF;
    IF p_property_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.properties WHERE id = p_property_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'CROSS_TENANT_PROPERTY: Mulk bu isletmeye ait degil.' USING ERRCODE = '42501';
    END IF;

    -- Ayni telefonla es zamanli iki kayit iki talep acmasin.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT || '|' || v_phone, 0));

    SELECT * INTO v_lead FROM public.leads
    WHERE tenant_id = p_tenant_id AND public.fn_normalize_phone(guest_phone) = v_phone
      AND status IN ('NEW', 'CONTACTED', 'QUOTE_SENT', 'FOLLOW_UP')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    v_line := '[' || v_stamp || '] ' || btrim(p_channel)
              || CASE WHEN p_check_in IS NOT NULL THEN ' · ' || to_char(p_check_in, 'DD.MM') || '–' || COALESCE(to_char(p_check_out, 'DD.MM'), '?') ELSE '' END
              || CASE WHEN p_pax IS NOT NULL THEN ' · ' || p_pax || ' kisi' ELSE '' END
              || CASE WHEN NULLIF(btrim(COALESCE(p_note, '')), '') IS NOT NULL THEN ' · ' || btrim(p_note) ELSE '' END;

    IF v_lead.id IS NOT NULL THEN
        UPDATE public.leads
           SET requested_check_in  = COALESCE(p_check_in, requested_check_in),
               requested_check_out = COALESCE(p_check_out, requested_check_out),
               pax                 = COALESCE(p_pax, pax),
               property_id         = COALESCE(p_property_id, property_id),
               guest_name          = COALESCE(NULLIF(btrim(COALESCE(guest_name, '')), ''), NULLIF(btrim(COALESCE(p_guest_name, '')), '')),
               notes               = CASE WHEN COALESCE(notes, '') = '' THEN v_line ELSE notes || E'\n' || v_line END
         WHERE id = v_lead.id
        RETURNING * INTO v_lead;
    ELSE
        INSERT INTO public.leads (tenant_id, property_id, guest_name, guest_phone, channel, lead_date,
                                  requested_check_in, requested_check_out, pax, status, notes, created_by)
        VALUES (p_tenant_id, p_property_id, NULLIF(btrim(COALESCE(p_guest_name, '')), ''), btrim(p_phone), btrim(p_channel),
                (now() AT TIME ZONE 'Europe/Istanbul')::date, p_check_in, p_check_out, p_pax, 'NEW', v_line, auth.uid())
        RETURNING * INTO v_lead;
        INSERT INTO public.lead_acquisition (lead_id, tenant_id, source_id) VALUES (v_lead.id, p_tenant_id, p_source_id);
        INSERT INTO public.lead_workflow (lead_id, tenant_id, assigned_to) VALUES (v_lead.id, p_tenant_id, auth.uid());
        v_created := TRUE;
    END IF;

    -- Tekrar gelen: ayni telefonlu misafir kaydi ya da kapanmis eski talep
    SELECT g.id INTO v_guest_id FROM public.guests g
    WHERE g.tenant_id = p_tenant_id AND public.fn_normalize_phone(g.phone) = v_phone
    ORDER BY g.created_at LIMIT 1;
    SELECT count(*) INTO v_previous FROM public.leads l
    WHERE l.tenant_id = p_tenant_id AND l.id <> v_lead.id AND public.fn_normalize_phone(l.guest_phone) = v_phone;

    -- Kara/beyaz liste YALNIZ yonetim rolune dondurulur (kullanici karari)
    IF v_guest_id IS NOT NULL AND public.can_manage_tenant(p_tenant_id) THEN
        SELECT list_type INTO v_class FROM public.guest_private_classifications WHERE guest_id = v_guest_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'lead_id', v_lead.id,
        'created', v_created,
        'phone', v_phone,
        'returning', (v_guest_id IS NOT NULL OR v_previous > 0),
        'guest_id', v_guest_id,
        'previous_leads', v_previous,
        'classification', v_class);
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_lead_interest(
    p_tenant_id UUID,
    p_day       DATE,
    p_source_id UUID,
    p_channel   TEXT,
    p_delta     INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    IF NOT public.can_write_sales(p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Ilgi sayaci yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    IF p_delta IS NULL OR p_delta NOT IN (1, -1) THEN
        RAISE EXCEPTION 'INVALID_DELTA: Sayac birer birer artar ya da geri alinir.' USING ERRCODE = '22023';
    END IF;
    IF p_day IS NULL OR p_day > (now() AT TIME ZONE 'Europe/Istanbul')::date THEN
        RAISE EXCEPTION 'INVALID_DAY: Gelecek gune ilgi yazilmaz.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lead_source_catalog WHERE id = p_source_id AND tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'SOURCE_REQUIRED: Kaynak bu isletmeye ait degil.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.lead_interest_daily (tenant_id, day, source_id, channel, count)
    VALUES (p_tenant_id, p_day, p_source_id, btrim(p_channel), GREATEST(p_delta, 0))
    ON CONFLICT (tenant_id, day, source_id, channel) DO UPDATE
       SET count = public.lead_interest_daily.count + p_delta
    RETURNING count INTO v_count;
    RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;

DO $grants$
DECLARE
    v_sig TEXT;
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'save_property_location(uuid, uuid, text, numeric, numeric, numeric)',
        'quick_capture_lead(uuid, text, uuid, text, date, date, integer, uuid, text, text)',
        'bump_lead_interest(uuid, date, uuid, text, integer)',
        'fn_normalize_phone(text)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', v_sig);
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', v_sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', v_sig);
    END LOOP;
END
$grants$;
REVOKE ALL ON FUNCTION public.save_property_location(UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.quick_capture_lead(UUID, TEXT, UUID, TEXT, DATE, DATE, INT, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.bump_lead_interest(UUID, DATE, UUID, TEXT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.fn_normalize_phone(TEXT) FROM anon;

-- -----------------------------------------------------------------------------
-- 9. Sifirlama: ilgi sayaci ve mulk sahipleri defterdir (govde phase43 ile
--    ayni; yalniz iki tablo eklendi)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_tenant_data(p_tenant_id uuid, p_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id  UUID := auth.uid();
    v_jwt_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
    v_role     TEXT;
    v_sayim    JSONB;
    v_tablo    TEXT;
    v_silinen  BIGINT;
    v_toplam   BIGINT := 0;
    -- Silme sirasi: cocuklar once. Kalanlari FK cascade halleder.
    -- financial_transactions bookings ve properties'e RESTRICT ile bagli:
    -- ondan once gelmek zorunda.
    v_tablolar TEXT[] := ARRAY[
        'financial_transactions',
        'operation_evidence', 'operations_audit_logs', 'operational_tasks',
        'recurring_task_rules', 'property_checklist_templates',
        'message_delivery_logs', 'scheduled_messages', 'message_automation_rules',
        'message_templates', 'property_guest_settings',
        'extension_offers', 'booking_quotes',
        'rate_change_logs', 'pricing_events', 'pricing_overrides',
        'pricing_rules', 'pricing_profiles', 'daily_rates',
        'cleaning_tasks', 'maintenance_tickets',
        'expenses', 'bookings', 'guests', 'leads',
        -- phase59 defterleri (talep/misafir yan tablolari cascade ile gider)
        'lead_interest_daily',
        'monthly_financial_closes', 'monthly_targets', 'finance_import_batches',
        'executive_alerts', 'user_notifications', 'audit_logs',
        'tenant_invitations', 'tenant_onboarding',
        -- phase31 defterleri
        'marketing_campaigns', 'influencer_collabs',
        'housekeeping_status_overrides', 'property_pricing_ladder',
        'property_operator_notes', 'property_owners',
        'properties'
    ];
BEGIN
    IF v_user_id IS NULL AND v_jwt_role <> 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;

    IF v_jwt_role <> 'service_role' THEN
        SELECT role INTO v_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

        IF v_role IS NULL OR v_role <> 'owner' THEN
            RAISE EXCEPTION 'UNAUTHORIZED: İşletme verisini yalnızca işletme sahibi sıfırlayabilir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF COALESCE(btrim(p_confirm), '') <> 'VERILERI SIFIRLA' THEN
        RAISE EXCEPTION 'CONFIRMATION_REQUIRED: Onaylamak için tam olarak "VERILERI SIFIRLA" yazmalısınız.'
            USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('lexbnb.tenant_reset', 'on', TRUE);

    v_sayim := '{}'::jsonb;
    FOREACH v_tablo IN ARRAY v_tablolar LOOP
        IF to_regclass('public.' || v_tablo) IS NOT NULL THEN
            EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_tablo)
                USING p_tenant_id;
            GET DIAGNOSTICS v_silinen = ROW_COUNT;
            IF v_silinen > 0 THEN
                v_sayim := v_sayim || jsonb_build_object(v_tablo, v_silinen);
                v_toplam := v_toplam + v_silinen;
            END IF;
        END IF;
    END LOOP;

    PERFORM set_config('lexbnb.tenant_reset', 'off', TRUE);

    -- Sifirlamanin kendi izi: audit_logs yukarida bosaldi, bu kayit ondan
    -- SONRA yazilir ve kalir. Yazilamazsa sifirlama da geri alinir — izsiz
    -- sifirlama olmaz.
    INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (p_tenant_id, v_user_id, 'TENANT_DATA_RESET', 'tenant', p_tenant_id,
            jsonb_build_object('deleted', v_sayim, 'total', v_toplam, 'at', NOW()));

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant_id', p_tenant_id,
        'total_deleted', v_toplam,
        'deleted', v_sayim
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_tenant_data(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_tenant_data(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_tenant_data(UUID, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 10. Dogrulama
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_bad TEXT;
    v_def TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO v_bad
    FROM unnest(ARRAY['property_owners', 'property_owner_links', 'lead_source_catalog', 'lead_acquisition',
                      'lead_workflow', 'lead_interest_daily', 'guest_private_classifications']) t
    WHERE NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass)
       OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = 'trg_tenant_id_immutable')
       OR has_table_privilege('anon', 'public.' || t, 'SELECT');
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE59_TABLE_CONTRACT: %', v_bad;
    END IF;

    -- leads ve properties'e sutun eklenmedi
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('leads', 'properties')
               AND column_name IN ('acquisition_source', 'source_id', 'next_follow_up_at', 'assigned_to', 'locality', 'latitude',
                                   'longitude', 'research_radius_km', 'owner_id', 'phone_normalized')) THEN
        RAISE EXCEPTION 'PHASE59_COLUMN_ON_LEADS_OR_PROPERTIES';
    END IF;

    -- Kara/beyaz liste yalniz yonetim: politikalarin hepsi can_manage_tenant
    SELECT string_agg(policyname, ', ') INTO v_bad FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'guest_private_classifications'
      AND COALESCE(qual, with_check) NOT LIKE '%can_manage_tenant%';
    IF v_bad IS NOT NULL OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'guest_private_classifications') <> 4 THEN
        RAISE EXCEPTION 'PHASE59_CLASSIFICATION_NOT_MANAGER_ONLY: %', v_bad;
    END IF;

    -- Her isletmede "Bilinmiyor"
    IF EXISTS (SELECT 1 FROM public.tenants t WHERE NOT EXISTS (
                 SELECT 1 FROM public.lead_source_catalog c WHERE c.tenant_id = t.id AND c.code = 'UNKNOWN' AND c.is_system)) THEN
        RAISE EXCEPTION 'PHASE59_UNKNOWN_SOURCE_MISSING';
    END IF;

    -- Telefon anahtari
    IF public.fn_normalize_phone('0532 123 45 67') IS DISTINCT FROM '+905321234567'
       OR public.fn_normalize_phone('+90 (532) 123-45-67') IS DISTINCT FROM '+905321234567'
       OR public.fn_normalize_phone('5321234567') IS DISTINCT FROM '+905321234567'
       OR public.fn_normalize_phone('00905321234567') IS DISTINCT FROM '+905321234567'
       OR public.fn_normalize_phone('+44 20 7946 0958') IS DISTINCT FROM '+442079460958'
       OR public.fn_normalize_phone('123') IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE59_PHONE_NORMALIZATION';
    END IF;

    -- Sifirlama yeni defterleri siliyor, govdenin geri kalani phase43
    v_def := pg_get_functiondef('public.reset_tenant_data(uuid,text)'::regprocedure);
    IF strpos(v_def, '''lead_interest_daily''') = 0 OR strpos(v_def, '''property_owners''') = 0
       OR strpos(v_def, 'fn_tenant_reset_in_progress') = 0 AND strpos(v_def, 'lexbnb.tenant_reset') = 0 THEN
        RAISE EXCEPTION 'PHASE59_RESET_LIST';
    END IF;
    IF strpos(v_def, '''lead_source_catalog''') > 0 THEN
        RAISE EXCEPTION 'PHASE59_RESET_DELETES_SETTINGS';
    END IF;

    SELECT string_agg(p.proname, ', ') INTO v_bad FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('save_property_location', 'quick_capture_lead', 'bump_lead_interest', 'fn_normalize_phone',
                        'seed_lead_source_catalog_for_new_tenant', 'guard_lead_source_system_row', 'guard_phase59_links',
                        'reset_tenant_data')
      AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE59_ANON_EXECUTE_OPEN: %', v_bad;
    END IF;

    RAISE NOTICE 'PHASE 59 OK — konum, mulk sahibi, talep kaynagi/takibi/hizli kayit, ilgi sayaci, dogum gunu, kara/beyaz liste.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (59, 'phase59_property_lead_guest_context')
ON CONFLICT (version) DO NOTHING;

COMMIT;
