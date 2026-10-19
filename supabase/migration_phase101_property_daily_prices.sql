-- Lexbnb phase101 — gunluk fiyat kaydi (kullanici M76, F.2.9, 19.10.2026).
--
-- Fiyat takvimi her gun icin bir oneri hesapliyordu ama oneri hicbir yere
-- uygulanamiyordu: isletme "bu fiyati kullan" diyemiyor, bir gunun fiyatini
-- elle degistiremiyordu (L-255). Bu tablo isletmenin ONAYLADIGI fiyati tutar:
--
--   APPROVED  onerilen fiyat oldugu gibi onaylandi (suggested_price = price)
--   MANUAL    isletme elle baska bir fiyat yazdi (oneri suggested_price'ta kalir)
--
-- Kayit bir planlama karari ve referanstir; OTA'ya gonderilmez, rezervasyon
-- tutarini kendiliginden degistirmez. Defter (gelir/gider) degildir, bu yuzden
-- kapanmis donem korumasi yoktur.
--
-- properties'e sutun eklenmedi (CLAUDE.md 3.4 dagitim sirasi tuzagi): goc
-- uygulanana kadar yalniz gunluk fiyat kaydi calismaz, istemci bunu soyler.
-- Benzersizlik TAM kisittir (property_id, price_date) — kismi indeks degil;
-- PostgREST upsert onConflict kismi indeksi bulamaz (CLAUDE.md 5.15).

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tablo
-- -----------------------------------------------------------------------------
CREATE TABLE public.property_daily_prices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id     UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    price_date      DATE NOT NULL,
    price           NUMERIC(12,2) NOT NULL CHECK (price > 0),
    source          TEXT NOT NULL CHECK (source IN ('APPROVED', 'MANUAL')),
    suggested_price NUMERIC(12,2) CHECK (suggested_price IS NULL OR suggested_price > 0),
    note            TEXT CHECK (note IS NULL OR char_length(note) <= 500),
    updated_by      UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT property_daily_prices_property_date_key UNIQUE (property_id, price_date)
);

CREATE INDEX property_daily_prices_tenant_date_idx ON public.property_daily_prices(tenant_id, price_date);

-- -----------------------------------------------------------------------------
-- 2. Tetikleyiciler: mulk ayni kiracida, "kim degistirdi" oturumdan,
--    kiraci degismezligi, damga
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_property_daily_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.properties p WHERE p.id = NEW.property_id AND p.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'CROSS_TENANT_PROPERTY: Mulk bu isletmeye ait degil.' USING ERRCODE = '42501';
    END IF;
    -- Oturum varken izi oturum belirler; cagiran baskasinin kimligini yazamaz.
    IF auth.uid() IS NOT NULL THEN
        NEW.updated_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_property_daily_price() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_property_daily_price() FROM anon;

CREATE TRIGGER property_daily_price_guard
    BEFORE INSERT OR UPDATE ON public.property_daily_prices
    FOR EACH ROW EXECUTE FUNCTION public.guard_property_daily_price();

DROP TRIGGER IF EXISTS trg_tenant_id_immutable ON public.property_daily_prices;
CREATE TRIGGER trg_tenant_id_immutable
    BEFORE UPDATE OF tenant_id ON public.property_daily_prices
    FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();

CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON public.property_daily_prices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Yetki (3.3.1): fiyati satis verisini okuyan gorur (satis, izleyici
--    dahil); yalniz yonetim yazar. anon hicbir sey yapamaz.
-- -----------------------------------------------------------------------------
ALTER TABLE public.property_daily_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.property_daily_prices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.property_daily_prices TO authenticated;

CREATE POLICY property_daily_prices_select ON public.property_daily_prices FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY property_daily_prices_insert ON public.property_daily_prices FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY property_daily_prices_update ON public.property_daily_prices FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY property_daily_prices_delete ON public.property_daily_prices FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

-- -----------------------------------------------------------------------------
-- 4. Isletme sifirlama (phase97 govdesi + property_daily_prices)
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
        -- phase101: onaylanan gunluk fiyatlar
        'property_daily_prices',
        -- phase97: elle girilen gelir ve sermaye defteri
        'income_entries',
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
-- 5. Dogrulama
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_def TEXT;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.property_daily_prices'::regclass) THEN
        RAISE EXCEPTION 'PHASE101_RLS_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.property_daily_prices'::regclass
                    AND tgname = 'trg_tenant_id_immutable' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE101_TENANT_ID_TRIGGER_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.property_daily_prices'::regclass
                    AND tgname = 'property_daily_price_guard' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE101_TENANT_GUARD_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.property_daily_prices'::regclass
                    AND conname = 'property_daily_prices_property_date_key' AND contype = 'u') THEN
        RAISE EXCEPTION 'PHASE101_UNIQUE_MISSING';
    END IF;
    IF has_table_privilege('anon', 'public.property_daily_prices', 'SELECT')
       OR has_table_privilege('anon', 'public.property_daily_prices', 'INSERT') THEN
        RAISE EXCEPTION 'PHASE101_ANON_PRIVILEGE';
    END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'property_daily_prices') <> 4
       OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'property_daily_prices'
                   AND COALESCE(qual, '') || COALESCE(with_check, '') NOT LIKE '%can_%') THEN
        RAISE EXCEPTION 'PHASE101_POLICY_CONTRACT';
    END IF;
    v_def := pg_get_functiondef('public.reset_tenant_data(uuid, text)'::regprocedure);
    IF position('''property_daily_prices''' IN v_def) = 0 OR position('''income_entries''' IN v_def) = 0 THEN
        RAISE EXCEPTION 'PHASE101_RESET_LIST';
    END IF;
    IF has_function_privilege('anon', 'public.reset_tenant_data(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE101_ANON_FUNCTION_PRIVILEGE';
    END IF;

    RAISE NOTICE 'PHASE 101 OK — gunluk fiyat kaydi.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (101, 'phase101_property_daily_prices')
ON CONFLICT (version) DO NOTHING;

COMMIT;
