-- =============================================================================
-- LEXBNB PHASE 78 — A4 FIYAT ARASTIRMASI VE GIDER SABLONU (P61)
--
-- Additive dagitim:
--   * message_templates mevcut kolonunda yalniz CHECK genisler.
--   * properties / expenses tablolarina sutun eklenmez.
--   * ev kurali, rakip arastirmasi ve gider kopya bagi yan tablolardadir.
--
-- Sifirlama karari: dort yeni tablo da kullanici tarafindan uretilen isletme
-- verisidir. reset_tenant_data "tum verileri sifirla" oldugu ve properties /
-- expenses'i de sildigi icin ayar, arastirma ve kopya baglari cocuklardan once
-- acikca silinir. Hesap kapatmada tenant FK'leri CASCADE'dir.
--
-- Yedek karari: yeni VIEW ve baska tabloya yazan tetikleyici yoktur. Backup
-- tablolari OpenAPI'den kesfeder; RestoreEngine VIEWS/SIDE_EFFECTS listelerine
-- eklenecek bir nesne bu nedenle yoktur.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 76) THEN
        RAISE EXCEPTION 'PHASE78_REQUIRES_PHASE76';
    END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. Satis asamasi mesaj sablonlari (islemsel / pazarlama ayrimi korunur)
-- -----------------------------------------------------------------------------
ALTER TABLE public.message_templates
    DROP CONSTRAINT IF EXISTS message_templates_lifecycle_stage_check;
ALTER TABLE public.message_templates
    ADD CONSTRAINT message_templates_lifecycle_stage_check CHECK (lifecycle_stage IN (
        'BOOKING_CONFIRMED', 'PAYMENT_REMINDER', 'PRE_ARRIVAL', 'CHECKIN_DAY',
        'CHECKIN_INSTRUCTIONS', 'MID_STAY', 'CHECKOUT_REMINDER', 'CHECKOUT_DAY',
        'EXTENSION_OFFER', 'POST_STAY', 'REVIEW_REQUEST', 'REBOOKING_OFFER',
        'LEAD_QUOTE_FOLLOW_UP', 'LEAD_REENGAGEMENT', 'MANUAL'
    ));

-- -----------------------------------------------------------------------------
-- 2. Ev bazli sade fiyat kurali gecersiz kilmalari
-- -----------------------------------------------------------------------------
CREATE TABLE public.property_pricing_rule_settings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    rule_key    TEXT NOT NULL CHECK (rule_key IN ('weekend', 'specialDay', 'demand', 'lastMinute', 'gapNight')),
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    pct         NUMERIC(7,2) NOT NULL CHECK (pct BETWEEN -100 AND 1000),
    parameters  JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parameters) = 'object'),
    created_by  UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (property_id, rule_key)
);
CREATE INDEX property_pricing_rule_settings_tenant_idx
    ON public.property_pricing_rule_settings(tenant_id, property_id);

-- -----------------------------------------------------------------------------
-- 3. Tarihli, linkli rakip fiyat arastirmasi
-- -----------------------------------------------------------------------------
CREATE TABLE public.competitor_price_research (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id   UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    researched_on DATE NOT NULL DEFAULT CURRENT_DATE CHECK (researched_on <= CURRENT_DATE),
    source_kind   TEXT NOT NULL CHECK (source_kind IN ('CHATGPT', 'OTA', 'WEBSITE', 'MANUAL', 'OTHER')),
    source_url    TEXT NOT NULL CHECK (source_url ~* '^https?://[^[:space:]]+$' AND length(source_url) <= 2000),
    prices        JSONB NOT NULL CHECK (jsonb_typeof(prices) = 'array' AND jsonb_array_length(prices) > 0),
    raw_note      TEXT CHECK (raw_note IS NULL OR length(raw_note) <= 10000),
    created_by    UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX competitor_price_research_lookup_idx
    ON public.competitor_price_research(tenant_id, property_id, researched_on DESC);

-- -----------------------------------------------------------------------------
-- 4. Gider sablonu ve onceki gider / sablon kaynakli kopya bagi
-- -----------------------------------------------------------------------------
CREATE TABLE public.expense_templates (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id  UUID REFERENCES public.properties(id) ON DELETE CASCADE,
    name         TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
    category     TEXT NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 100),
    amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    expense_type TEXT NOT NULL DEFAULT 'OPEX' CHECK (expense_type IN ('OPEX', 'CAPEX')),
    description  TEXT CHECK (description IS NULL OR length(description) <= 2000),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_by   UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expense_templates_tenant_idx
    ON public.expense_templates(tenant_id, is_active, property_id);

CREATE TABLE public.expense_template_occurrences (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    template_id          UUID REFERENCES public.expense_templates(id) ON DELETE CASCADE,
    source_expense_id    UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
    generated_expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
    period_month         DATE NOT NULL CHECK (period_month = date_trunc('month', period_month)::date),
    recorded_by          UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (template_id IS NOT NULL OR source_expense_id IS NOT NULL),
    UNIQUE (tenant_id, generated_expense_id)
);
CREATE UNIQUE INDEX expense_template_occurrences_template_period_uq
    ON public.expense_template_occurrences(tenant_id, template_id, period_month)
    WHERE template_id IS NOT NULL;
CREATE UNIQUE INDEX expense_template_occurrences_source_period_uq
    ON public.expense_template_occurrences(tenant_id, source_expense_id, period_month)
    WHERE source_expense_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. Kiraci baglari — tablo dallari ic ice IF; PL/pgSQL AND kisa devre degil
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_phase78_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_TABLE_NAME = 'property_pricing_rule_settings' THEN
        IF NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id = NEW.property_id AND p.tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_PRICING_PROPERTY' USING ERRCODE = '42501';
        END IF;
    ELSIF TG_TABLE_NAME = 'competitor_price_research' THEN
        IF NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id = NEW.property_id AND p.tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_RESEARCH_PROPERTY' USING ERRCODE = '42501';
        END IF;
    ELSIF TG_TABLE_NAME = 'expense_templates' THEN
        IF NEW.property_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id = NEW.property_id AND p.tenant_id = NEW.tenant_id) THEN
                RAISE EXCEPTION 'CROSS_TENANT_EXPENSE_TEMPLATE_PROPERTY' USING ERRCODE = '42501';
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'expense_template_occurrences' THEN
        IF NEW.template_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.expense_templates t WHERE t.id = NEW.template_id AND t.tenant_id = NEW.tenant_id) THEN
                RAISE EXCEPTION 'CROSS_TENANT_EXPENSE_TEMPLATE' USING ERRCODE = '42501';
            END IF;
        END IF;
        IF NEW.source_expense_id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = NEW.source_expense_id AND e.tenant_id = NEW.tenant_id) THEN
                RAISE EXCEPTION 'CROSS_TENANT_SOURCE_EXPENSE' USING ERRCODE = '42501';
            END IF;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = NEW.generated_expense_id AND e.tenant_id = NEW.tenant_id) THEN
            RAISE EXCEPTION 'CROSS_TENANT_GENERATED_EXPENSE' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_phase78_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_phase78_links() FROM anon;

DO $table_setup$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'property_pricing_rule_settings', 'competitor_price_research',
        'expense_templates', 'expense_template_occurrences'
    ] LOOP
        EXECUTE format('CREATE TRIGGER trg_tenant_id_immutable BEFORE UPDATE OF tenant_id ON public.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable()', v_table);
        EXECUTE format('CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', v_table);
        EXECUTE format('CREATE TRIGGER trg_guard_phase78_links BEFORE INSERT OR UPDATE ON public.%I '
                       'FOR EACH ROW EXECUTE FUNCTION public.guard_phase78_links()', v_table);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', v_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_table);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_table);
    END LOOP;
END
$table_setup$;

-- -----------------------------------------------------------------------------
-- 6. RLS: fiyat/arastirma satis okuyucularina; finans tablolari defter okuruna
-- -----------------------------------------------------------------------------
CREATE POLICY property_pricing_rule_settings_select ON public.property_pricing_rule_settings
    FOR SELECT TO authenticated USING (public.can_read_sales(tenant_id));
CREATE POLICY property_pricing_rule_settings_insert ON public.property_pricing_rule_settings
    FOR INSERT TO authenticated WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY property_pricing_rule_settings_update ON public.property_pricing_rule_settings
    FOR UPDATE TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY property_pricing_rule_settings_delete ON public.property_pricing_rule_settings
    FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id));

CREATE POLICY competitor_price_research_select ON public.competitor_price_research
    FOR SELECT TO authenticated USING (public.can_read_sales(tenant_id));
CREATE POLICY competitor_price_research_insert ON public.competitor_price_research
    FOR INSERT TO authenticated WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY competitor_price_research_update ON public.competitor_price_research
    FOR UPDATE TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY competitor_price_research_delete ON public.competitor_price_research
    FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id));

CREATE POLICY expense_templates_select ON public.expense_templates
    FOR SELECT TO authenticated USING (public.can_read_ledger(tenant_id));
CREATE POLICY expense_templates_insert ON public.expense_templates
    FOR INSERT TO authenticated WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY expense_templates_update ON public.expense_templates
    FOR UPDATE TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY expense_templates_delete ON public.expense_templates
    FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id));

CREATE POLICY expense_template_occurrences_select ON public.expense_template_occurrences
    FOR SELECT TO authenticated USING (public.can_read_ledger(tenant_id));
CREATE POLICY expense_template_occurrences_insert ON public.expense_template_occurrences
    FOR INSERT TO authenticated WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY expense_template_occurrences_update ON public.expense_template_occurrences
    FOR UPDATE TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY expense_template_occurrences_delete ON public.expense_template_occurrences
    FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id));

-- -----------------------------------------------------------------------------
-- 7. Tam isletme sifirlama: yeni veri ve ayarlarin tumu silinir
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
        -- phase78: baglar once, sonra kaynak giderler ve mulkler
        'expense_template_occurrences', 'competitor_price_research',
        'expense_templates', 'property_pricing_rule_settings',
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
-- 8. Dogrulama
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_table TEXT;
    v_bad TEXT;
    v_def TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'property_pricing_rule_settings', 'competitor_price_research',
        'expense_templates', 'expense_template_occurrences'
    ] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_table)::regclass)
           OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || v_table)::regclass
                          AND tgname = 'trg_tenant_id_immutable' AND NOT tgisinternal)
           OR has_table_privilege('anon', 'public.' || v_table, 'SELECT') THEN
            RAISE EXCEPTION 'PHASE78_TABLE_CONTRACT: %', v_table;
        END IF;
        SELECT string_agg(policyname, ', ') INTO v_bad FROM pg_policies
        WHERE schemaname = 'public' AND tablename = v_table
          AND COALESCE(qual, '') || COALESCE(with_check, '') NOT LIKE '%can_%';
        IF v_bad IS NOT NULL OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table) <> 4 THEN
            RAISE EXCEPTION 'PHASE78_POLICY_CONTRACT: % / %', v_table, v_bad;
        END IF;
    END LOOP;

    SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
    WHERE conrelid = 'public.message_templates'::regclass AND conname = 'message_templates_lifecycle_stage_check';
    IF strpos(COALESCE(v_def, ''), 'LEAD_QUOTE_FOLLOW_UP') = 0 OR strpos(COALESCE(v_def, ''), 'LEAD_REENGAGEMENT') = 0 THEN
        RAISE EXCEPTION 'PHASE78_MESSAGE_LIFECYCLE_CHECK';
    END IF;

    v_def := pg_get_functiondef('public.guard_phase78_links()'::regprocedure);
    IF v_def ~* 'TG_TABLE_NAME\s*=\s*''[^'']+''\s+AND' THEN
        RAISE EXCEPTION 'PHASE78_TRIGGER_SHORT_CIRCUIT_ANTIPATTERN';
    END IF;
    v_def := pg_get_functiondef('public.reset_tenant_data(uuid,text)'::regprocedure);
    IF strpos(v_def, '''property_pricing_rule_settings''') = 0
       OR strpos(v_def, '''competitor_price_research''') = 0
       OR strpos(v_def, '''expense_templates''') = 0
       OR strpos(v_def, '''expense_template_occurrences''') = 0 THEN
        RAISE EXCEPTION 'PHASE78_RESET_LIST';
    END IF;

    RAISE NOTICE 'PHASE 78 OK — fiyat kurali, rakip arastirmasi ve gider sablonu hazir.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (78, 'phase78_pricing_research_expense_templates')
ON CONFLICT (version) DO NOTHING;

COMMIT;
