-- Lexbnb phase91 — talep birden fazla mulkle ilgilenebilir (kullanici M16, 14.10.2026).
--
-- leads.property_id tek mulk tutar ve oyle kalir (donusum, teklif, rapor ona
-- bakar: "asil" ilgilenilen mulk). Misafirin ayrica baktigi mulkler bu
-- bag tablosunda durur. leads'e sutun eklenmedi, bilerek: yeni sutuna bagli
-- talep kaydi, goc uygulanana kadar talep kaydetmeyi tamamen kirardi
-- (CLAUDE.md 3.4, bookings'te yasandi). Goc uygulanana kadar yalniz ek
-- mulkler kaydedilmez; talep kaydi calisir ve istemci bunu soyler.
--
-- Rol sozlesmesi talebin kendisiyle aynidir (3.3.1): okuma can_read_sales,
-- yazma can_write_sales. Talep ve mulk ayni isletmenin olmak zorundadir.
-- Talep ya da mulk silinince bag satiri cascade ile gider; kiraci sifirlama
-- leads uzerinden bosalir (ayri silme listesi gerekmez).

BEGIN;

CREATE TABLE public.lead_interest_properties (
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    created_by  UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (lead_id, property_id)
);

CREATE INDEX lead_interest_properties_tenant_idx ON public.lead_interest_properties(tenant_id, lead_id);
CREATE INDEX lead_interest_properties_property_idx ON public.lead_interest_properties(property_id);

-- Talep ve mulk bu kiraciya ait olmali (capraz kiraci yazma kapisi; RLS
-- yalniz satirin kendi tenant_id'sine bakar, bagli kayitlara bakmaz).
CREATE OR REPLACE FUNCTION public.guard_lead_interest_property_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = NEW.lead_id AND l.tenant_id = NEW.tenant_id) THEN
        RAISE EXCEPTION 'CROSS_TENANT_LEAD: Talep bu isletmeye ait degil.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id = NEW.property_id AND p.tenant_id = NEW.tenant_id) THEN
        RAISE EXCEPTION 'CROSS_TENANT_PROPERTY: Mulk bu isletmeye ait degil.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_lead_interest_property_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_lead_interest_property_tenant() FROM anon;

CREATE TRIGGER lead_interest_property_tenant_guard
    BEFORE INSERT OR UPDATE ON public.lead_interest_properties
    FOR EACH ROW EXECUTE FUNCTION public.guard_lead_interest_property_tenant();

DROP TRIGGER IF EXISTS trg_tenant_id_immutable ON public.lead_interest_properties;
CREATE TRIGGER trg_tenant_id_immutable
    BEFORE UPDATE OF tenant_id ON public.lead_interest_properties
    FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();

ALTER TABLE public.lead_interest_properties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lead_interest_properties FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.lead_interest_properties TO authenticated;

CREATE POLICY lead_interest_properties_select ON public.lead_interest_properties FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY lead_interest_properties_insert ON public.lead_interest_properties FOR INSERT TO authenticated
    WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY lead_interest_properties_delete ON public.lead_interest_properties FOR DELETE TO authenticated
    USING (public.can_write_sales(tenant_id));

DO $verify$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.lead_interest_properties'::regclass AND relrowsecurity) THEN
        RAISE EXCEPTION 'PHASE91_RLS_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.lead_interest_properties'::regclass
                    AND tgname = 'trg_tenant_id_immutable' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE91_TENANT_ID_TRIGGER_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.lead_interest_properties'::regclass
                    AND tgname = 'lead_interest_property_tenant_guard' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE91_TENANT_GUARD_MISSING';
    END IF;
    IF has_table_privilege('anon', 'public.lead_interest_properties', 'SELECT')
       OR has_table_privilege('anon', 'public.lead_interest_properties', 'INSERT') THEN
        RAISE EXCEPTION 'PHASE91_ANON_PRIVILEGE';
    END IF;
    IF has_table_privilege('authenticated', 'public.lead_interest_properties', 'UPDATE') THEN
        RAISE EXCEPTION 'PHASE91_UPDATE_SHOULD_NOT_BE_GRANTED';
    END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lead_interest_properties') <> 3 THEN
        RAISE EXCEPTION 'PHASE91_POLICY_COUNT';
    END IF;
    RAISE NOTICE 'PHASE 91 OK — talep birden fazla mulkle ilgilenebilir.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (91, 'phase91_lead_interest_properties')
ON CONFLICT (version) DO NOTHING;

COMMIT;
