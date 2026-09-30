-- =============================================================================
-- LEXBNB PHASE 55 — OPERASYON INSANLARI VE TEMIZLIK ICRASI (A2-G2)
-- =============================================================================
-- Kullanici kararlari (ENVANTER Operasyon; 30.09.2026):
--   * Mulke bagli olmayan GENEL gorev: operational_tasks.property_id bos
--     olabilir. Mulk varsa kiraci esitligi mevcut tetikleyicide korunur.
--   * Temizlikci ve usta SABIT listeden secilir (operational_people). Eski
--     cleaning_tasks.cleaner_name serbest metni gecmis odeme kaydidir;
--     silinmez, degistirilmez.
--   * Temizlik kontrol listesi iki imzali: Z = temizlikci "yaptim",
--     M = denetleyen (yonetici) "kontrol ettim". Malzeme uc durumlu:
--     Var (OK) / Az var (LOW) / Yok (OUT).
--   * GIDER M ILE OLUSUR (kullanici 30.09.2026, K-04 degisikligi): temizlikci
--     "yaptim" dediginde temizlik gider DEGILDIR; yonetici denetleyip onaylayinca
--     cleaning_tasks.status = 'DONE' olur ve gider o anda dogar. Gider AYI
--     temizlik gunudur (task_date) — sunucu formulu zaten task_date'e bakar,
--     degismedi. Denetimi bekleyen temizlik varken o ay KAPATILAMAZ; aksi halde
--     onay kapali aya yazilamazdi (guard_cleaning_task_closed_period).
--   * Finansal alanlar (amount, is_paid) icra tablosunda YOK; cleaning_tasks'ta
--     kalir ve phase53 ile staff'a kapalidir.
--
-- staff tabloya dogrudan yazmaz (phase53): isini get_my_field_work ile gorur,
-- save_cleaning_progress / sign_cleaning_done / set_my_task_status ile
-- gunceller. Yonetici assign_cleaning_task ve inspect_cleaning kullanir.
--
-- Sifirlama (CLAUDE.md 3.7): icra satiri cleaning_tasks'a, usta atamasi
-- maintenance_tickets'a CASCADE ile bagli; reset_tenant_data onlari zaten
-- silerken bunlar da gider. Kisi listesi ve gorev sablonlari ekip/ayar gibi
-- KORUNUR (tenant_settings emsali). reset_tenant_data degismedi.
--
-- Bagimlilik: phase53 (rol yardimcilari).
-- Uygulama: docs/PHASE55_DEPLOY_PACKAGE.md
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 53) THEN
        RAISE EXCEPTION 'PHASE55_REQUIRES_PHASE53';
    END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. Genel gorev: mulk bos olabilir
-- -----------------------------------------------------------------------------
ALTER TABLE public.operational_tasks ALTER COLUMN property_id DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Kontrol listesi bicimi
--    { "sections": [ { "title": "Mutfak", "items": [ { "text": "...",
--        "important": true, "subChecks": ["ODA 1", "ODA 2"] } ] } ],
--      "supplies": [ { "area": "Mutfak", "item": "Cay" } ] }
--    Eski dizi bicimi ('[]' varsayilani) kabul edilir; nesne bicimi siki denetlenir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_checklist_template_valid(p JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    s JSONB;
    i JSONB;
    x JSONB;
BEGIN
    IF p IS NULL THEN RETURN FALSE; END IF;
    IF jsonb_typeof(p) = 'array' THEN RETURN TRUE; END IF;
    IF jsonb_typeof(p) <> 'object' THEN RETURN FALSE; END IF;
    IF octet_length(p::TEXT) > 262144 THEN RETURN FALSE; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p) k WHERE k NOT IN ('sections', 'supplies')) > 0 THEN RETURN FALSE; END IF;
    IF jsonb_typeof(p -> 'sections') IS DISTINCT FROM 'array' THEN RETURN FALSE; END IF;
    IF p ? 'supplies' AND jsonb_typeof(p -> 'supplies') <> 'array' THEN RETURN FALSE; END IF;
    IF jsonb_array_length(p -> 'sections') > 60 THEN RETURN FALSE; END IF;

    FOR s IN SELECT * FROM jsonb_array_elements(p -> 'sections') LOOP
        IF jsonb_typeof(s) <> 'object'
           OR jsonb_typeof(s -> 'title') IS DISTINCT FROM 'string'
           OR length(btrim(s ->> 'title')) = 0
           OR jsonb_typeof(s -> 'items') IS DISTINCT FROM 'array'
           OR jsonb_array_length(s -> 'items') > 250 THEN
            RETURN FALSE;
        END IF;
        FOR i IN SELECT * FROM jsonb_array_elements(s -> 'items') LOOP
            IF jsonb_typeof(i) <> 'object'
               OR jsonb_typeof(i -> 'text') IS DISTINCT FROM 'string'
               OR length(btrim(i ->> 'text')) = 0
               OR (i ? 'important' AND jsonb_typeof(i -> 'important') <> 'boolean')
               OR (i ? 'subChecks' AND jsonb_typeof(i -> 'subChecks') <> 'array') THEN
                RETURN FALSE;
            END IF;
            IF i ? 'subChecks' THEN
                FOR x IN SELECT * FROM jsonb_array_elements(i -> 'subChecks') LOOP
                    IF jsonb_typeof(x) <> 'string' OR length(btrim(x #>> '{}')) = 0 THEN RETURN FALSE; END IF;
                END LOOP;
            END IF;
        END LOOP;
    END LOOP;

    IF p ? 'supplies' THEN
        IF jsonb_array_length(p -> 'supplies') > 500 THEN RETURN FALSE; END IF;
        FOR x IN SELECT * FROM jsonb_array_elements(p -> 'supplies') LOOP
            IF jsonb_typeof(x) <> 'object'
               OR jsonb_typeof(x -> 'item') IS DISTINCT FROM 'string'
               OR length(btrim(x ->> 'item')) = 0
               OR (x ? 'area' AND jsonb_typeof(x -> 'area') <> 'string') THEN
                RETURN FALSE;
            END IF;
        END LOOP;
    END IF;
    RETURN TRUE;
END;
$$;

-- Icra sonucu: checklist_result { "<anahtar>": { "z": bool, "m": bool } },
-- supplies_result { "<malzeme sirasi>": "OK" | "LOW" | "OUT" }.
CREATE OR REPLACE FUNCTION public.fn_cleaning_result_valid(p_checklist JSONB, p_supplies JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT jsonb_typeof(p_checklist) = 'object'
       AND jsonb_typeof(p_supplies) = 'object'
       AND NOT EXISTS (
            SELECT 1 FROM jsonb_each(p_checklist) e
            WHERE jsonb_typeof(e.value) <> 'object'
               OR (e.value ? 'z' AND jsonb_typeof(e.value -> 'z') NOT IN ('boolean', 'null'))
               OR (e.value ? 'm' AND jsonb_typeof(e.value -> 'm') NOT IN ('boolean', 'null'))
               OR EXISTS (SELECT 1 FROM jsonb_object_keys(e.value) k WHERE k NOT IN ('z', 'm')))
       AND NOT EXISTS (
            SELECT 1 FROM jsonb_each(p_supplies) e
            WHERE e.key !~ '^[0-9]{1,4}$'
               OR jsonb_typeof(e.value) <> 'string'
               OR (e.value #>> '{}') NOT IN ('OK', 'LOW', 'OUT'));
$$;

REVOKE ALL ON FUNCTION public.fn_checklist_template_valid(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_checklist_template_valid(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_checklist_template_valid(JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_cleaning_result_valid(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cleaning_result_valid(JSONB, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_cleaning_result_valid(JSONB, JSONB) TO authenticated, service_role;

ALTER TABLE public.property_checklist_templates
    ADD CONSTRAINT property_checklist_templates_items_valid
    CHECK (public.fn_checklist_template_valid(items));

-- Sablon baska kiracinin mulkune baglanamaz (phase10 fonksiyonu; bu tabloya
-- hic baglanmamisti).
DROP TRIGGER IF EXISTS trg_verify_checklist_template_tenant_isolation ON public.property_checklist_templates;
CREATE TRIGGER trg_verify_checklist_template_tenant_isolation
    BEFORE INSERT OR UPDATE ON public.property_checklist_templates
    FOR EACH ROW EXECUTE FUNCTION public.check_template_tenant_isolation();

-- -----------------------------------------------------------------------------
-- 3. Tablolar
-- -----------------------------------------------------------------------------
CREATE TABLE public.operational_people (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('CLEANER', 'TECHNICIAN')),
    full_name   TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 120),
    phone       TEXT CHECK (phone IS NULL OR length(btrim(phone)) BETWEEN 3 AND 40),
    specialty   TEXT CHECK (specialty IS NULL OR length(specialty) <= 120),
    notes       TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_by  UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX operational_people_tenant_user_uq ON public.operational_people(tenant_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX operational_people_tenant_kind_idx ON public.operational_people(tenant_id, kind, is_active);

CREATE TABLE public.cleaning_task_executions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    cleaning_task_id     UUID NOT NULL UNIQUE REFERENCES public.cleaning_tasks(id) ON DELETE CASCADE,
    person_id            UUID REFERENCES public.operational_people(id),
    template_id          UUID REFERENCES public.property_checklist_templates(id) ON DELETE SET NULL,
    checklist_snapshot   JSONB NOT NULL DEFAULT '{"sections": [], "supplies": []}'::jsonb
                         CHECK (jsonb_typeof(checklist_snapshot) = 'object' AND public.fn_checklist_template_valid(checklist_snapshot)),
    checklist_result     JSONB NOT NULL DEFAULT '{}'::jsonb,
    supplies_result      JSONB NOT NULL DEFAULT '{}'::jsonb,
    note                 TEXT CHECK (note IS NULL OR length(note) <= 2000),
    status               TEXT NOT NULL DEFAULT 'ASSIGNED'
                         CHECK (status IN ('ASSIGNED', 'IN_PROGRESS', 'CLEANED', 'INSPECTED', 'REOPENED')),
    cleaner_signed_at    TIMESTAMPTZ,
    cleaner_signed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    inspector_signed_at  TIMESTAMPTZ,
    inspector_signed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    inspector_note       TEXT CHECK (inspector_note IS NULL OR length(inspector_note) <= 2000),
    created_by           UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cleaning_task_executions_result_valid CHECK (public.fn_cleaning_result_valid(checklist_result, supplies_result)),
    -- Z imzasi CLEANED/INSPECTED'in, M imzasi INSPECTED'in ayrilmaz parcasi
    CONSTRAINT cleaning_task_executions_signatures CHECK (
        (status IN ('CLEANED', 'INSPECTED')) = (cleaner_signed_at IS NOT NULL)
        AND (status = 'INSPECTED') = (inspector_signed_at IS NOT NULL)
    )
);
CREATE INDEX cleaning_task_executions_person_idx ON public.cleaning_task_executions(tenant_id, person_id, status);

CREATE TABLE public.maintenance_assignments (
    maintenance_ticket_id UUID PRIMARY KEY REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
    tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    person_id             UUID NOT NULL REFERENCES public.operational_people(id),
    note                  TEXT CHECK (note IS NULL OR length(note) <= 1000),
    assigned_by           UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_assignments_person_idx ON public.maintenance_assignments(tenant_id, person_id);

CREATE TABLE public.task_templates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title             TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    task_type         TEXT NOT NULL DEFAULT 'GENERAL'
                      CHECK (task_type IN ('CLEANING', 'CHECKIN_PREP', 'CHECKOUT', 'INSPECTION', 'MAINTENANCE', 'INVENTORY', 'GENERAL')),
    priority          TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    description       TEXT CHECK (description IS NULL OR length(description) <= 2000),
    default_checklist JSONB CHECK (default_checklist IS NULL
                                   OR (jsonb_typeof(default_checklist) = 'object' AND public.fn_checklist_template_valid(default_checklist))),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_by        UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX task_templates_tenant_title_uq ON public.task_templates(tenant_id, lower(btrim(title)));

-- -----------------------------------------------------------------------------
-- 4. Kiraci esitligi
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_operations_people_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_TABLE_NAME = 'operational_people' THEN
        IF NEW.user_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.tenant_members WHERE tenant_id = NEW.tenant_id AND user_id = NEW.user_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_PERSON_USER: Baglanan hesap bu isletmenin uyesi degil.' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.person_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.operational_people WHERE id = NEW.person_id AND tenant_id = NEW.tenant_id) THEN
        RAISE EXCEPTION 'CROSS_TENANT_PERSON: Kisi bu isletmeye ait degil.' USING ERRCODE = '42501';
    END IF;

    IF TG_TABLE_NAME = 'cleaning_task_executions' THEN
        IF NOT EXISTS (SELECT 1 FROM public.cleaning_tasks WHERE id = NEW.cleaning_task_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_CLEANING_TASK: Temizlik bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
        IF NEW.template_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.property_checklist_templates WHERE id = NEW.template_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_TEMPLATE: Sablon bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
    ELSIF TG_TABLE_NAME = 'maintenance_assignments' THEN
        IF NOT EXISTS (SELECT 1 FROM public.maintenance_tickets WHERE id = NEW.maintenance_ticket_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_TICKET: Ariza bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_operations_people_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_operations_people_links() FROM anon;

CREATE TRIGGER trg_guard_operations_people_links BEFORE INSERT OR UPDATE ON public.operational_people
    FOR EACH ROW EXECUTE FUNCTION public.guard_operations_people_links();
CREATE TRIGGER trg_guard_operations_people_links BEFORE INSERT OR UPDATE ON public.cleaning_task_executions
    FOR EACH ROW EXECUTE FUNCTION public.guard_operations_people_links();
CREATE TRIGGER trg_guard_operations_people_links BEFORE INSERT OR UPDATE ON public.maintenance_assignments
    FOR EACH ROW EXECUTE FUNCTION public.guard_operations_people_links();

-- phase41 kurallari: tenant_id degismez, updated_at, anon yok, RLS
DO $tables$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['operational_people', 'cleaning_task_executions', 'maintenance_assignments', 'task_templates'] LOOP
        EXECUTE format('CREATE TRIGGER trg_tenant_id_immutable BEFORE UPDATE OF tenant_id ON public.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable()', v_table);
        EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', v_table);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_table);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_table);
    END LOOP;
END
$tables$;
-- phase41 kaynak kurali acik ifade arar:
REVOKE ALL ON public.operational_people FROM anon;
REVOKE ALL ON public.cleaning_task_executions FROM anon;
REVOKE ALL ON public.maintenance_assignments FROM anon;
REVOKE ALL ON public.task_templates FROM anon;

-- -----------------------------------------------------------------------------
-- 5. RLS: yonetim okur ve yazar; kisi YALNIZ kendi satirini okur.
--    Satis rolu operasyon defterlerini okumaz (finans degil ama isi degil).
-- -----------------------------------------------------------------------------
CREATE POLICY operational_people_select ON public.operational_people FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id) OR (user_id = auth.uid() AND public.is_tenant_member(tenant_id)));
CREATE POLICY operational_people_insert ON public.operational_people FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY operational_people_update ON public.operational_people FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY operational_people_delete ON public.operational_people FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

CREATE POLICY cleaning_task_executions_select ON public.cleaning_task_executions FOR SELECT TO authenticated
    USING (
        public.can_read_ledger(tenant_id)
        OR EXISTS (SELECT 1 FROM public.operational_people op
                   WHERE op.id = cleaning_task_executions.person_id
                     AND op.tenant_id = cleaning_task_executions.tenant_id
                     AND op.user_id = auth.uid())
    );
CREATE POLICY cleaning_task_executions_insert ON public.cleaning_task_executions FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY cleaning_task_executions_update ON public.cleaning_task_executions FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY cleaning_task_executions_delete ON public.cleaning_task_executions FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

CREATE POLICY maintenance_assignments_select ON public.maintenance_assignments FOR SELECT TO authenticated
    USING (
        public.can_read_ledger(tenant_id)
        OR EXISTS (SELECT 1 FROM public.operational_people op
                   WHERE op.id = maintenance_assignments.person_id
                     AND op.tenant_id = maintenance_assignments.tenant_id
                     AND op.user_id = auth.uid())
    );
CREATE POLICY maintenance_assignments_insert ON public.maintenance_assignments FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY maintenance_assignments_update ON public.maintenance_assignments FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY maintenance_assignments_delete ON public.maintenance_assignments FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

CREATE POLICY task_templates_select ON public.task_templates FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
CREATE POLICY task_templates_insert ON public.task_templates FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY task_templates_update ON public.task_templates FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY task_templates_delete ON public.task_templates FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

-- -----------------------------------------------------------------------------
-- 6. Ay kapanisi: denetim bekleyen temizlik varken ay kapanmaz
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_close_requires_inspected_cleaning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_start DATE;
    v_count INT;
BEGIN
    IF NEW.status IS DISTINCT FROM 'CLOSED'
       OR (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'CLOSED') THEN
        RETURN NEW;
    END IF;
    v_start := make_date(NEW.year, NEW.month, 1);
    SELECT count(*) INTO v_count
    FROM public.cleaning_task_executions e
    JOIN public.cleaning_tasks ct ON ct.id = e.cleaning_task_id
    WHERE e.tenant_id = NEW.tenant_id
      AND e.status = 'CLEANED'
      AND ct.task_date >= v_start
      AND ct.task_date < (v_start + INTERVAL '1 month')::date;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'CLEANING_AWAITING_INSPECTION: % donemi kapatilamaz; % temizlik yonetici denetimi bekliyor. Gider denetimle olusur.',
            to_char(v_start, 'YYYY-MM'), v_count
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_close_requires_inspected_cleaning() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_close_requires_inspected_cleaning() FROM anon;
CREATE TRIGGER trg_close_requires_inspected_cleaning
    BEFORE INSERT OR UPDATE ON public.monthly_financial_closes
    FOR EACH ROW EXECUTE FUNCTION public.guard_close_requires_inspected_cleaning();

-- -----------------------------------------------------------------------------
-- 7. Dar RPC'ler
-- -----------------------------------------------------------------------------

-- Yonetici: temizligi listeden bir kisiye ata; kontrol listesi o anki
-- sablondan dondurulur (sonradan sablon degisse de gecmis bozulmaz).
-- Sablon verilmezse: genel (mulksuz) aktif CLEANING sablonu + mulke ozel
-- aktif sablon, bolumler sirasiyla birlestirilir.
CREATE OR REPLACE FUNCTION public.assign_cleaning_task(
    p_cleaning_task_id UUID,
    p_person_id UUID,
    p_template_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task      public.cleaning_tasks%ROWTYPE;
    v_exec      public.cleaning_task_executions%ROWTYPE;
    v_snapshot  JSONB := '{"sections": [], "supplies": []}'::jsonb;
    v_tenant    UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    -- Yetki kayit aramadan ONCE: kiraci, gorevin kiracisi uzerinden degil
    -- cagiranin yonettigi kiracilar uzerinden cozulur.
    SELECT ct.tenant_id INTO v_tenant FROM public.cleaning_tasks ct
    WHERE ct.id = p_cleaning_task_id AND public.can_manage_tenant(ct.tenant_id);
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Temizlik atama yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_task FROM public.cleaning_tasks WHERE id = p_cleaning_task_id FOR UPDATE;
    IF v_task.status = 'DONE' THEN
        RAISE EXCEPTION 'CLEANING_ALREADY_DONE: Bu temizlik zaten yapildi olarak kayitli.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.operational_people
                   WHERE id = p_person_id AND tenant_id = v_tenant AND kind = 'CLEANER' AND is_active) THEN
        RAISE EXCEPTION 'PERSON_NOT_ASSIGNABLE: Kisi bu isletmenin aktif temizlikcisi degil.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_exec FROM public.cleaning_task_executions WHERE cleaning_task_id = p_cleaning_task_id FOR UPDATE;
    IF v_exec.id IS NOT NULL AND v_exec.status IN ('CLEANED', 'INSPECTED') THEN
        RAISE EXCEPTION 'EXECUTION_SIGNED: Temizlikci imzaladiktan sonra atama degistirilemez.' USING ERRCODE = '22023';
    END IF;

    IF p_template_id IS NOT NULL THEN
        SELECT items INTO v_snapshot FROM public.property_checklist_templates
        WHERE id = p_template_id AND tenant_id = v_tenant AND is_active
          AND (property_id IS NULL OR property_id = v_task.property_id)
          AND jsonb_typeof(items) = 'object';
        IF v_snapshot IS NULL THEN
            RAISE EXCEPTION 'TEMPLATE_NOT_USABLE: Sablon bu mulk icin kullanilamaz.' USING ERRCODE = '22023';
        END IF;
    ELSE
        -- genel once, eve ozel sonra (her birinden en yeni aktif surum)
        SELECT jsonb_build_object(
                 'sections', COALESCE((SELECT jsonb_agg(s ORDER BY ord, idx) FROM (
                     SELECT s, t.ord, x.idx FROM (
                        SELECT items, CASE WHEN property_id IS NULL THEN 0 ELSE 1 END AS ord FROM (
                            SELECT DISTINCT ON (property_id IS NULL) items, property_id
                            FROM public.property_checklist_templates
                            WHERE tenant_id = v_tenant AND is_active AND task_type = 'CLEANING'
                              AND jsonb_typeof(items) = 'object'
                              AND (property_id IS NULL OR property_id = v_task.property_id)
                            ORDER BY (property_id IS NULL), version DESC, updated_at DESC) q) t,
                        jsonb_array_elements(t.items -> 'sections') WITH ORDINALITY AS x(s, idx)) z), '[]'::jsonb),
                 'supplies', COALESCE((SELECT jsonb_agg(s ORDER BY ord, idx) FROM (
                     SELECT s, t.ord, x.idx FROM (
                        SELECT items, CASE WHEN property_id IS NULL THEN 0 ELSE 1 END AS ord FROM (
                            SELECT DISTINCT ON (property_id IS NULL) items, property_id
                            FROM public.property_checklist_templates
                            WHERE tenant_id = v_tenant AND is_active AND task_type = 'CLEANING'
                              AND jsonb_typeof(items) = 'object'
                              AND (property_id IS NULL OR property_id = v_task.property_id)
                            ORDER BY (property_id IS NULL), version DESC, updated_at DESC) q) t,
                        jsonb_array_elements(COALESCE(t.items -> 'supplies', '[]'::jsonb)) WITH ORDINALITY AS x(s, idx)) z), '[]'::jsonb)
               ) INTO v_snapshot;
    END IF;

    IF v_exec.id IS NULL THEN
        INSERT INTO public.cleaning_task_executions (tenant_id, cleaning_task_id, person_id, template_id, checklist_snapshot)
        VALUES (v_tenant, p_cleaning_task_id, p_person_id, p_template_id, v_snapshot)
        RETURNING * INTO v_exec;
    ELSE
        UPDATE public.cleaning_task_executions
           SET person_id = p_person_id, template_id = p_template_id, checklist_snapshot = v_snapshot,
               checklist_result = '{}'::jsonb, supplies_result = '{}'::jsonb, status = 'ASSIGNED'
         WHERE id = v_exec.id
        RETURNING * INTO v_exec;
    END IF;

    RETURN jsonb_build_object('success', true, 'execution_id', v_exec.id, 'status', v_exec.status,
                              'sections', jsonb_array_length(v_snapshot -> 'sections'));
END;
$$;

-- Cagiranin bugun/araliktaki isi. Tutar, odeme, misafir adi DONMEZ.
CREATE OR REPLACE FUNCTION public.get_my_field_work(p_tenant_id UUID, p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    IF NOT public.is_tenant_member(p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu isletmenin uyesi degilsiniz.' USING ERRCODE = '42501';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
        RAISE EXCEPTION 'INVALID_RANGE: Aralik en fazla 62 gun olabilir.' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
      'cleanings', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'execution_id', e.id,
                 'status', e.status,
                 'task_date', ct.task_date,
                 'property', jsonb_build_object('id', p.id, 'name', p.name),
                 'access', public.fn_property_access_json(ct.tenant_id, ct.property_id),
                 'next_check_in', (SELECT min(b.check_in) FROM public.bookings b
                                   WHERE b.tenant_id = ct.tenant_id AND b.property_id = ct.property_id
                                     AND b.check_in >= ct.task_date AND COALESCE(b.status, '') <> 'CANCELLED'),
                 'checklist', e.checklist_snapshot,
                 'checklist_result', e.checklist_result,
                 'supplies_result', e.supplies_result,
                 'note', e.note,
                 'cleaner_signed_at', e.cleaner_signed_at,
                 'inspector_signed_at', e.inspector_signed_at,
                 'inspector_note', e.inspector_note)
               ORDER BY ct.task_date, p.name)
        FROM public.cleaning_task_executions e
        JOIN public.operational_people op ON op.id = e.person_id AND op.user_id = v_uid
        JOIN public.cleaning_tasks ct ON ct.id = e.cleaning_task_id
        JOIN public.properties p ON p.id = ct.property_id
        WHERE e.tenant_id = p_tenant_id AND ct.task_date BETWEEN p_from AND p_to), '[]'::jsonb),
      'tasks', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', t.id, 'title', t.title, 'description', t.description, 'task_type', t.task_type,
                 'status', t.status, 'priority', t.priority, 'due_at', t.due_at, 'checklist', t.checklist,
                 'property', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'name', p.name) END,
                 'access', CASE WHEN t.property_id IS NULL THEN NULL ELSE public.fn_property_access_json(t.tenant_id, t.property_id) END)
               ORDER BY t.due_at NULLS LAST)
        FROM public.operational_tasks t
        LEFT JOIN public.properties p ON p.id = t.property_id
        WHERE t.tenant_id = p_tenant_id AND t.assigned_to = v_uid
          AND t.status NOT IN ('DONE', 'CANCELLED')), '[]'::jsonb),
      'tickets', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', m.id, 'title', m.title, 'description', m.description, 'category', m.category,
                 'severity', m.severity, 'status', m.status,
                 'property', jsonb_build_object('id', p.id, 'name', p.name),
                 'access', public.fn_property_access_json(m.tenant_id, m.property_id))
               ORDER BY m.created_at)
        FROM public.maintenance_tickets m
        JOIN public.properties p ON p.id = m.property_id
        WHERE m.tenant_id = p_tenant_id
          AND m.status NOT IN ('RESOLVED', 'CANCELLED')
          AND (m.assigned_to = v_uid OR EXISTS (
                SELECT 1 FROM public.maintenance_assignments ma
                JOIN public.operational_people op ON op.id = ma.person_id
                WHERE ma.maintenance_ticket_id = m.id AND op.user_id = v_uid))), '[]'::jsonb)
    );
END;
$$;

-- Mulke giris bilgisi (adres, kapi kodu, wifi, saatler): yalniz get_my_field_work
-- icinden. Dogrudan cagrilamaz.
CREATE OR REPLACE FUNCTION public.fn_property_access_json(p_tenant_id UUID, p_property_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT jsonb_build_object(
        'address', g.address_text, 'map_url', g.map_url, 'door_code', g.door_code,
        'wifi_name', g.wifi_name, 'wifi_password', g.wifi_password,
        'check_in_time', g.check_in_time, 'check_out_time', g.check_out_time,
        'parking', g.parking_instructions, 'arrival', g.arrival_instructions,
        'emergency_contact', g.emergency_contact)
    FROM public.property_guest_settings g
    WHERE g.tenant_id = p_tenant_id AND g.property_id = p_property_id
    LIMIT 1;
$$;

-- Icra satirinin sahibi (atanan kisinin hesabi) ya da yonetim mi?
CREATE OR REPLACE FUNCTION public.fn_execution_actor(p_execution_id UUID)
RETURNS TABLE (tenant_id UUID, is_manager BOOLEAN, is_assignee BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT e.tenant_id,
           public.can_manage_tenant(e.tenant_id),
           EXISTS (SELECT 1 FROM public.operational_people op
                   WHERE op.id = e.person_id AND op.tenant_id = e.tenant_id AND op.user_id = auth.uid())
    FROM public.cleaning_task_executions e
    WHERE e.id = p_execution_id
      AND (public.can_manage_tenant(e.tenant_id)
           OR EXISTS (SELECT 1 FROM public.operational_people op
                      WHERE op.id = e.person_id AND op.tenant_id = e.tenant_id AND op.user_id = auth.uid()));
$$;

-- Temizlikci ilerleme kaydi: yalniz Z isaretleri, malzeme durumu ve not.
-- M isaretleri korunur (temizlikci denetim sonucunu degistiremez).
CREATE OR REPLACE FUNCTION public.save_cleaning_progress(
    p_execution_id UUID,
    p_checklist_result JSONB,
    p_supplies_result JSONB,
    p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor  RECORD;
    v_exec   public.cleaning_task_executions%ROWTYPE;
    v_merged JSONB := '{}'::jsonb;
    v_key    TEXT;
    v_val    JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    SELECT * INTO v_actor FROM public.fn_execution_actor(p_execution_id);
    IF v_actor.tenant_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu temizlik size atanmamis.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.fn_cleaning_result_valid(COALESCE(p_checklist_result, '{}'::jsonb), COALESCE(p_supplies_result, '{}'::jsonb)) THEN
        RAISE EXCEPTION 'INVALID_RESULT: Kontrol listesi ya da malzeme durumu gecersiz.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_exec FROM public.cleaning_task_executions WHERE id = p_execution_id FOR UPDATE;
    IF v_exec.status NOT IN ('ASSIGNED', 'IN_PROGRESS', 'REOPENED') THEN
        RAISE EXCEPTION 'EXECUTION_LOCKED: Imzalanmis temizlik degistirilemez (durum %).', v_exec.status USING ERRCODE = '22023';
    END IF;

    v_merged := v_exec.checklist_result;
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(COALESCE(p_checklist_result, '{}'::jsonb)) LOOP
        v_merged := jsonb_set(v_merged, ARRAY[v_key],
            jsonb_build_object('z', v_val -> 'z', 'm', COALESCE(v_exec.checklist_result -> v_key -> 'm', 'null'::jsonb)));
    END LOOP;

    UPDATE public.cleaning_task_executions
       SET checklist_result = v_merged,
           supplies_result = COALESCE(p_supplies_result, supplies_result),
           note = NULLIF(btrim(COALESCE(p_note, '')), ''),
           status = CASE WHEN status = 'ASSIGNED' THEN 'IN_PROGRESS' ELSE status END
     WHERE id = p_execution_id
    RETURNING * INTO v_exec;
    RETURN jsonb_build_object('success', true, 'status', v_exec.status);
END;
$$;

-- Z imzasi: temizlikci "yaptim". Gider OLUSMAZ (M bekler).
CREATE OR REPLACE FUNCTION public.sign_cleaning_done(p_execution_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor RECORD;
    v_exec  public.cleaning_task_executions%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    SELECT * INTO v_actor FROM public.fn_execution_actor(p_execution_id);
    IF v_actor.tenant_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu temizlik size atanmamis.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_exec FROM public.cleaning_task_executions WHERE id = p_execution_id FOR UPDATE;
    IF v_exec.status NOT IN ('ASSIGNED', 'IN_PROGRESS', 'REOPENED') THEN
        RAISE EXCEPTION 'EXECUTION_LOCKED: Bu temizlik zaten imzali (durum %).', v_exec.status USING ERRCODE = '22023';
    END IF;
    UPDATE public.cleaning_task_executions
       SET status = 'CLEANED', cleaner_signed_at = now(), cleaner_signed_by = auth.uid()
     WHERE id = p_execution_id;
    RETURN jsonb_build_object('success', true, 'status', 'CLEANED');
END;
$$;

-- M denetimi: yalniz yonetim. Onay -> temizlik DONE (gider dogar, ay =
-- task_date). Red -> Z imzasi silinir, temizlikci yeniden calisir; gider yok.
CREATE OR REPLACE FUNCTION public.inspect_cleaning(
    p_execution_id UUID,
    p_approve BOOLEAN,
    p_m_marks JSONB DEFAULT '{}'::jsonb,
    p_inspector_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor  RECORD;
    v_exec   public.cleaning_task_executions%ROWTYPE;
    v_merged JSONB;
    v_key    TEXT;
    v_val    JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    SELECT * INTO v_actor FROM public.fn_execution_actor(p_execution_id);
    IF v_actor.tenant_id IS NULL OR NOT v_actor.is_manager THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Temizlik denetimi yalniz yonetim rolleriyle yapilir.' USING ERRCODE = '42501';
    END IF;
    IF p_approve IS NULL THEN
        RAISE EXCEPTION 'INVALID_DECISION: Onay ya da red secilmeli.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(p_m_marks, '{}'::jsonb)) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_each(COALESCE(p_m_marks, '{}'::jsonb)) e WHERE jsonb_typeof(e.value) <> 'boolean') THEN
        RAISE EXCEPTION 'INVALID_RESULT: Denetim isaretleri { anahtar: true/false } olmali.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_exec FROM public.cleaning_task_executions WHERE id = p_execution_id FOR UPDATE;
    IF v_exec.status <> 'CLEANED' THEN
        RAISE EXCEPTION 'NOT_AWAITING_INSPECTION: Temizlikci henuz imzalamadi (durum %).', v_exec.status USING ERRCODE = '22023';
    END IF;

    v_merged := v_exec.checklist_result;
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(COALESCE(p_m_marks, '{}'::jsonb)) LOOP
        v_merged := jsonb_set(v_merged, ARRAY[v_key],
            jsonb_build_object('z', COALESCE(v_exec.checklist_result -> v_key -> 'z', 'null'::jsonb), 'm', v_val));
    END LOOP;

    IF p_approve THEN
        UPDATE public.cleaning_task_executions
           SET status = 'INSPECTED', checklist_result = v_merged,
               inspector_signed_at = now(), inspector_signed_by = auth.uid(),
               inspector_note = NULLIF(btrim(COALESCE(p_inspector_note, '')), '')
         WHERE id = p_execution_id;
        -- Gider burada dogar. Kapali doneme dusen temizlikte
        -- guard_cleaning_task_closed_period tum islemi geri alir.
        UPDATE public.cleaning_tasks
           SET status = 'DONE', completed_at = v_exec.cleaner_signed_at
         WHERE id = v_exec.cleaning_task_id AND status <> 'DONE';
        RETURN jsonb_build_object('success', true, 'status', 'INSPECTED');
    END IF;

    UPDATE public.cleaning_task_executions
       SET status = 'REOPENED', checklist_result = v_merged,
           cleaner_signed_at = NULL, cleaner_signed_by = NULL,
           inspector_note = NULLIF(btrim(COALESCE(p_inspector_note, '')), '')
     WHERE id = p_execution_id;
    RETURN jsonb_build_object('success', true, 'status', 'REOPENED');
END;
$$;

-- Atanan kisi kendi gorevinin durumunu gunceller (yonetim herkesinkini).
CREATE OR REPLACE FUNCTION public.set_my_task_status(p_task_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.operational_tasks%ROWTYPE;
    v_old  TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    SELECT * INTO v_task FROM public.operational_tasks t
    WHERE t.id = p_task_id
      AND (public.can_manage_tenant(t.tenant_id)
           OR (t.assigned_to = auth.uid() AND public.is_tenant_member(t.tenant_id)))
    FOR UPDATE;
    IF v_task.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu gorev size atanmamis.' USING ERRCODE = '42501';
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE') THEN
        RAISE EXCEPTION 'INVALID_STATUS: %', p_status USING ERRCODE = '22023';
    END IF;
    v_old := v_task.status;
    UPDATE public.operational_tasks
       SET status = p_status,
           completed_at = CASE WHEN p_status = 'DONE' THEN now() ELSE NULL END,
           completed_by = CASE WHEN p_status = 'DONE' THEN auth.uid() ELSE NULL END,
           evidence_note = COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), evidence_note)
     WHERE id = p_task_id;
    INSERT INTO public.operations_audit_logs (tenant_id, task_id, action, old_status, new_status, performed_by, details)
    VALUES (v_task.tenant_id, p_task_id, 'STATUS_CHANGE', v_old, p_status, auth.uid(),
            jsonb_build_object('source', 'set_my_task_status'));
    RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

DO $grants$
DECLARE
    v_sig TEXT;
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'assign_cleaning_task(uuid, uuid, uuid)',
        'get_my_field_work(uuid, date, date)',
        'save_cleaning_progress(uuid, jsonb, jsonb, text)',
        'sign_cleaning_done(uuid)',
        'inspect_cleaning(uuid, boolean, jsonb, text)',
        'set_my_task_status(uuid, text, text)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', v_sig);
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon', v_sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', v_sig);
    END LOOP;
END
$grants$;
REVOKE ALL ON FUNCTION public.assign_cleaning_task(UUID, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_my_field_work(UUID, DATE, DATE) FROM anon;
REVOKE ALL ON FUNCTION public.save_cleaning_progress(UUID, JSONB, JSONB, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.sign_cleaning_done(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.inspect_cleaning(UUID, BOOLEAN, JSONB, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.set_my_task_status(UUID, TEXT, TEXT) FROM anon;
-- Ic yardimcilar yalniz diger fonksiyonlarin icinden (sahibi postgres).
REVOKE ALL ON FUNCTION public.fn_property_access_json(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_property_access_json(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.fn_property_access_json(UUID, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.fn_execution_actor(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_execution_actor(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.fn_execution_actor(UUID) FROM authenticated;

-- -----------------------------------------------------------------------------
-- 8. Dogrulama
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_bad TEXT;
BEGIN
    IF (SELECT attnotnull FROM pg_attribute WHERE attrelid = 'public.operational_tasks'::regclass AND attname = 'property_id') THEN
        RAISE EXCEPTION 'PHASE55_GENERAL_TASK_PROPERTY_STILL_NOT_NULL';
    END IF;

    SELECT string_agg(t, ', ') INTO v_bad
    FROM unnest(ARRAY['operational_people', 'cleaning_task_executions', 'maintenance_assignments', 'task_templates']) t
    WHERE NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass)
       OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = 'trg_tenant_id_immutable')
       OR has_table_privilege('anon', 'public.' || t, 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.' || t, 'INSERT');
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE55_TABLE_CONTRACT: %', v_bad;
    END IF;

    -- Icra tablosunda finansal alan YOK
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
               AND table_name = 'cleaning_task_executions' AND column_name IN ('amount', 'is_paid', 'paid_at')) THEN
        RAISE EXCEPTION 'PHASE55_FINANCIAL_FIELD_IN_EXECUTION';
    END IF;

    -- Bicim denetleyicisi: gecerli ve gecersiz ornek
    IF NOT public.fn_checklist_template_valid('{"sections":[{"title":"Mutfak","items":[{"text":"Ocak","important":true,"subChecks":["ODA 1"]}]}],"supplies":[{"area":"Mutfak","item":"Cay"}]}'::jsonb)
       OR public.fn_checklist_template_valid('{"sections":[{"title":"","items":[]}]}'::jsonb)
       OR public.fn_checklist_template_valid('{"sections":[],"x":1}'::jsonb)
       OR NOT public.fn_cleaning_result_valid('{"s0.i0":{"z":true,"m":null}}'::jsonb, '{"0":"LOW"}'::jsonb)
       OR public.fn_cleaning_result_valid('{}'::jsonb, '{"0":"AZ"}'::jsonb) THEN
        RAISE EXCEPTION 'PHASE55_VALIDATOR';
    END IF;

    -- Denetim onayi gideri yazan tek yol; Z imzasi cleaning_tasks'a dokunmaz
    IF strpos(pg_get_functiondef('public.sign_cleaning_done(uuid)'::regprocedure), 'cleaning_tasks') > 0 THEN
        RAISE EXCEPTION 'PHASE55_Z_SIGN_TOUCHES_LEDGER';
    END IF;
    IF strpos(pg_get_functiondef('public.inspect_cleaning(uuid,boolean,jsonb,text)'::regprocedure), 'SET status = ''DONE''') = 0 THEN
        RAISE EXCEPTION 'PHASE55_M_APPROVAL_DOES_NOT_RECOGNIZE_EXPENSE';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_close_requires_inspected_cleaning'
                   AND tgrelid = 'public.monthly_financial_closes'::regclass) THEN
        RAISE EXCEPTION 'PHASE55_CLOSE_GUARD_MISSING';
    END IF;

    SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('assign_cleaning_task', 'get_my_field_work', 'save_cleaning_progress', 'sign_cleaning_done',
                        'inspect_cleaning', 'set_my_task_status', 'fn_property_access_json', 'fn_execution_actor',
                        'fn_checklist_template_valid', 'fn_cleaning_result_valid', 'guard_operations_people_links',
                        'guard_close_requires_inspected_cleaning')
      AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE55_ANON_EXECUTE_OPEN: %', v_bad;
    END IF;
    IF has_function_privilege('authenticated', 'public.fn_property_access_json(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE55_ACCESS_HELPER_EXPOSED';
    END IF;

    RAISE NOTICE 'PHASE 55 OK — operasyon insanlari, iki imzali temizlik icrasi, gorev sablonlari.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (55, 'phase55_operations_people_execution')
ON CONFLICT (version) DO NOTHING;

COMMIT;
