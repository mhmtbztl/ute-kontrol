-- =============================================================================
-- LEXBNB PHASE 65 — guard_phase59_links DUZELTMESI (phase59 ileri duzeltme)
-- =============================================================================
-- phase59'un kiraci esitligi tetikleyicisi bes tabloya bagli tek bir
-- fonksiyon. Kosullar `IF TG_TABLE_NAME = 'lead_workflow' AND NEW.assigned_to
-- IS NOT NULL` bicimindeydi. PL/pgSQL bu AND'i kisa devre ile degerlendirmez:
-- lead_acquisition satirinda NEW.assigned_to alani olmadigi icin
-- `42703 record "new" has no field "assigned_to"` ile duser. Sonuc: hizli
-- kayit (quick_capture_lead) HIC calismiyordu. phase59 canli suiti (D1) test
-- projesinde yakaladi; BEGIN...ROLLBACK kuru kosusu tetikleyici govdesini
-- calistirmadigi icin gormemisti.
--
-- phase59 test projesine uygulandigi icin DEGISMEZ (phase37 emsali); duzeltme
-- bu gocle. Kural: tablo adina gore dallanan tetikleyicide NEW.<alan> erisimi
-- IC ICE IF ile ayrilir (core/phase59_context_tests.js bunu tum goclerde tarar).
-- Manifestte phase59'un hemen arkasinda durur, onunla birlikte uygulanir.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 59) THEN
        RAISE EXCEPTION 'PHASE65_REQUIRES_PHASE59';
    END IF;
END
$pre$;

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

    ELSIF TG_TABLE_NAME = 'lead_acquisition' THEN
        IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = NEW.lead_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_LEAD: Talep bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.lead_source_catalog WHERE id = NEW.source_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_SOURCE: Kaynak bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;

    ELSIF TG_TABLE_NAME = 'lead_workflow' THEN
        IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = NEW.lead_id AND tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_LEAD: Talep bu isletmeye ait degil.' USING ERRCODE = '42501';
        END IF;
        IF NEW.assigned_to IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = NEW.tenant_id AND user_id = NEW.assigned_to) THEN
                RAISE EXCEPTION 'CROSS_TENANT_ASSIGNEE: Atanan kisi bu isletmenin uyesi degil.' USING ERRCODE = '42501';
            END IF;
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

DO $verify$
DECLARE
    v_def TEXT := pg_get_functiondef('public.guard_phase59_links()'::regprocedure);
BEGIN
    -- Anti-desen: tablo adi karsilastirmasinin hemen arkasindan AND gelmesi.
    IF v_def ~* 'TG_TABLE_NAME\s*(=\s*''[a-z_]+''|IN\s*\([^)]*\))\s+AND\M' THEN
        RAISE EXCEPTION 'PHASE65_SHORT_CIRCUIT_PATTERN_REMAINS';
    END IF;
    RAISE NOTICE 'PHASE 65 OK — phase59 kiraci esitligi tetikleyicisi tablo basina ayrildi.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (65, 'phase65_phase59_link_guard_fix')
ON CONFLICT (version) DO NOTHING;

COMMIT;
