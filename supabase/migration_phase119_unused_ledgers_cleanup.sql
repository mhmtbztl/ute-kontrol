-- Lexbnb phase119 — kullanilmayan defter tablolarinin kaldirilmasi (kullanici, 13.11.2026).
--
-- Temizlik turu (claude/temizlik): asagidaki 20 tabloya hicbir ekran, worker
-- ya da istemcinin cagirdigi RPC yazmiyor/okumuyor. 13.11.2026'da uretimde
-- satir sayisi salt okunur olculdu: hepsi 0.
--
--   phase11 eski fiyat motoru : pricing_profiles, pricing_rules, pricing_events,
--                               pricing_overrides, daily_rates, rate_change_logs,
--                               booking_quotes  (yerini phase78/101 aldi)
--   phase10 mesaj otomasyonu  : message_automation_rules, message_delivery_logs,
--                               scheduled_messages, extension_offers
--                               (message_templates KALIR: WhatsApp sablonlari)
--   phase6  financial_transactions (ekranda hic gosterilmedi)
--   phase9  recurring_task_rules, operation_evidence
--   phase12 tenant_onboarding
--   phase17 property_media_versions
--   phase31 influencer_collabs, property_operator_notes (yazan ekran yoktu)
--   phase78 expense_templates, expense_template_occurrences (istemci bagi yoktu)
--
-- Kararlar:
--   * VERI KORUMASI: tablolardan birinde tek satir bile varsa goc HICBIR SEY
--     silmeden durur (PHASE119_TABLE_NOT_EMPTY). Olcum ile uygulama arasinda
--     girilen veri kaybolmaz.
--   * DROP TABLE RESTRICT (CASCADE degil): beklenmeyen bir gorunum/FK varsa
--     goc durur; sessizce baska nesne silinmez.
--   * Yalniz bu tablolara ait 6 RPC ve 8 tetikleyici fonksiyonu kaldirilir.
--   * erase_guest_personal_data (KVKK) bu tablolara statik yaziyordu: govde
--     phase105'ten birebir alinir, iki adim cikar; donus sozlesmesi ayni
--     ('messages' 0). reset_tenant_data (phase101) ve guard_phase78_links
--     (phase78) listeleri ayni sekilde daraltilir.
--   * executive_alerts ve listing_experiment_snapshots bos ama canli RPC'ler
--     onlara dokunuyor; bu goc onlara dokunmaz.

BEGIN;

DO $pre$
DECLARE
    v_tablo TEXT;
    v_var   BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 105) THEN
        RAISE EXCEPTION 'PHASE119_REQUIRES_PHASE105';
    END IF;
    FOREACH v_tablo IN ARRAY ARRAY[
        'message_delivery_logs', 'scheduled_messages', 'message_automation_rules',
        'extension_offers', 'booking_quotes', 'rate_change_logs', 'pricing_events',
        'pricing_overrides', 'pricing_rules', 'pricing_profiles', 'daily_rates',
        'expense_template_occurrences', 'expense_templates', 'operation_evidence',
        'recurring_task_rules', 'tenant_onboarding', 'property_media_versions',
        'influencer_collabs', 'property_operator_notes', 'financial_transactions'
    ] LOOP
        IF to_regclass('public.' || v_tablo) IS NOT NULL THEN
            EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', v_tablo) INTO v_var;
            IF v_var THEN
                RAISE EXCEPTION 'PHASE119_TABLE_NOT_EMPTY: % tablosunda veri var; goc durduruldu.', v_tablo;
            END IF;
        END IF;
    END LOOP;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. Canli fonksiyonlar once daraltilir (tablolar dusmeden)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erase_guest_personal_data(p_tenant_id UUID, p_guest_id UUID, p_confirm TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_anon CONSTANT TEXT := 'Silinmiş misafir';
    v_guest    public.guests%ROWTYPE;
    v_phone    TEXT;
    v_email    TEXT;
    v_bookings UUID[];
    v_leads    UUID[];
    v_ids      TEXT[];
    v_names    TEXT[];
    v_name     TEXT;
    c_book INT := 0; c_lead INT := 0; c_msg INT := 0; c_notif INT := 0;
BEGIN
    -- Yetki kayit aramadan once (CLAUDE.md 7); NULL rol izin degildir.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    IF NOT COALESCE(public.can_manage_tenant(p_tenant_id), false) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Misafir verisini silme yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    IF p_confirm IS DISTINCT FROM 'MISAFIRI SIL' THEN
        RAISE EXCEPTION 'CONFIRMATION_REQUIRED: Onay metni MISAFIRI SIL olmali.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_guest FROM public.guests WHERE id = p_guest_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'GUEST_NOT_FOUND: Misafir bulunamadi.' USING ERRCODE = 'P0002';
    END IF;

    v_phone := NULLIF(public.fn_normalize_phone(v_guest.phone), '');
    v_email := NULLIF(lower(btrim(COALESCE(v_guest.email, ''))), '');

    SELECT COALESCE(array_agg(b.id), '{}'::UUID[]),
           COALESCE(array_agg(DISTINCT btrim(b.guest_name)) FILTER (WHERE length(btrim(COALESCE(b.guest_name, ''))) >= 3), '{}'::TEXT[])
      INTO v_bookings, v_names
      FROM public.bookings b
     WHERE b.tenant_id = p_tenant_id
       AND (b.primary_guest_id = p_guest_id
            OR (v_phone IS NOT NULL AND public.fn_normalize_phone(b.guest_phone) = v_phone));

    SELECT COALESCE(array_agg(l.id), '{}'::UUID[])
      INTO v_leads
      FROM public.leads l
     WHERE l.tenant_id = p_tenant_id
       AND ((v_phone IS NOT NULL AND public.fn_normalize_phone(l.guest_phone) = v_phone)
            OR (v_email IS NOT NULL AND lower(btrim(COALESCE(l.guest_email, ''))) = v_email)
            OR l.converted_booking_id = ANY(v_bookings));

    SELECT v_names || COALESCE(array_agg(DISTINCT btrim(l.guest_name)) FILTER (WHERE length(btrim(COALESCE(l.guest_name, ''))) >= 3), '{}'::TEXT[])
      INTO v_names FROM public.leads l WHERE l.id = ANY(v_leads);
    v_name := btrim(concat_ws(' ', v_guest.first_name, v_guest.last_name));
    IF length(v_name) >= 3 THEN v_names := v_names || v_name; END IF;
    v_names := ARRAY(SELECT DISTINCT x FROM unnest(v_names) x WHERE x IS NOT NULL AND x <> v_anon ORDER BY 1 DESC);

    SELECT ARRAY(SELECT x::TEXT FROM unnest(v_bookings) x UNION ALL SELECT y::TEXT FROM unnest(v_leads) y) INTO v_ids;

    -- Korumalar yalniz bu islem icin askiya alinir; asagidaki guncellemeler
    -- yalniz kisisel alanlara dokunur (tutar, tarih, durum, mulk degismez).
    PERFORM set_config('lexbnb.tenant_reset', 'on', true);

    DELETE FROM public.user_notifications n
     WHERE n.tenant_id = p_tenant_id
       AND EXISTS (SELECT 1 FROM unnest(v_ids) x
                    WHERE position(x IN COALESCE(n.event_key, '')) > 0 OR position(x IN COALESCE(n.deep_link, '')) > 0);
    GET DIAGNOSTICS c_notif = ROW_COUNT;

    -- phase119: planli mesaj defteri kaldirildi; mesaj sayisi 0 kalir (sozlesme ayni).
    c_msg := 0;

    UPDATE public.booking_payments SET note = NULL
     WHERE tenant_id = p_tenant_id AND booking_id = ANY(v_bookings) AND note IS NOT NULL;

    FOREACH v_name IN ARRAY v_names LOOP
        UPDATE public.cleaning_tasks SET description = replace(description, v_name, v_anon)
         WHERE tenant_id = p_tenant_id AND booking_id = ANY(v_bookings) AND position(v_name IN COALESCE(description, '')) > 0;
        UPDATE public.expenses SET description = replace(description, v_name, v_anon)
         WHERE tenant_id = p_tenant_id AND booking_id = ANY(v_bookings) AND position(v_name IN COALESCE(description, '')) > 0;
        UPDATE public.maintenance_tickets SET title = replace(title, v_name, v_anon), description = replace(description, v_name, v_anon)
         WHERE tenant_id = p_tenant_id AND booking_id = ANY(v_bookings)
           AND (position(v_name IN COALESCE(title, '')) > 0 OR position(v_name IN COALESCE(description, '')) > 0);
        UPDATE public.operational_tasks SET title = replace(title, v_name, v_anon), description = replace(description, v_name, v_anon),
               evidence_note = replace(evidence_note, v_name, v_anon)
         WHERE tenant_id = p_tenant_id AND booking_id = ANY(v_bookings)
           AND (position(v_name IN COALESCE(title, '')) > 0 OR position(v_name IN COALESCE(description, '')) > 0
                OR position(v_name IN COALESCE(evidence_note, '')) > 0);
    END LOOP;

    UPDATE public.bookings
       SET guest_name = v_anon, guest_phone = NULL, notes = NULL, primary_guest_id = NULL
     WHERE tenant_id = p_tenant_id AND id = ANY(v_bookings);
    GET DIAGNOSTICS c_book = ROW_COUNT;

    UPDATE public.leads
       SET guest_name = v_anon, guest_phone = NULL, guest_email = NULL, notes = NULL
     WHERE tenant_id = p_tenant_id AND id = ANY(v_leads);
    GET DIAGNOSTICS c_lead = ROW_COUNT;

    DELETE FROM public.guests WHERE id = p_guest_id AND tenant_id = p_tenant_id;

    PERFORM set_config('lexbnb.tenant_reset', 'off', true);

    INSERT INTO public.guest_erasure_log (tenant_id, erased_by, booking_count, lead_count, message_count, notification_count)
    VALUES (p_tenant_id, auth.uid(), c_book, c_lead, c_msg, c_notif);

    RETURN jsonb_build_object('success', true, 'bookings', c_book, 'leads', c_lead,
                              'messages', c_msg, 'notifications', c_notif);
END;
$$;

REVOKE ALL ON FUNCTION public.erase_guest_personal_data(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erase_guest_personal_data(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.erase_guest_personal_data(UUID, UUID, TEXT) TO authenticated;

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
    -- phase119: kullanilmayan 20 defter tablosu kaldirildi; liste yalniz
    -- var olan tablolari tasir (to_regclass kontrolu yine durur).
    v_tablolar TEXT[] := ARRAY[
        'operations_audit_logs', 'operational_tasks',
        'property_checklist_templates',
        'message_templates', 'property_guest_settings',
        'cleaning_tasks', 'maintenance_tickets',
        'competitor_price_research', 'property_pricing_rule_settings',
        -- phase101: onaylanan gunluk fiyatlar
        'property_daily_prices',
        -- phase97: elle girilen gelir ve sermaye defteri
        'income_entries',
        'expenses', 'bookings', 'guests', 'leads',
        -- phase59 defterleri (talep/misafir yan tablolari cascade ile gider)
        'lead_interest_daily',
        'monthly_financial_closes', 'monthly_targets', 'finance_import_batches',
        'executive_alerts', 'user_notifications', 'audit_logs',
        'tenant_invitations',
        -- phase31 defterleri
        'marketing_campaigns',
        'housekeeping_status_overrides', 'property_pricing_ladder',
        'property_owners',
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
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_phase78_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_phase78_links() FROM anon;

-- -----------------------------------------------------------------------------
-- 2. Yalniz bu tablolara ait RPC'ler (tum imzalar). Tablolardan once: bazilari
--    tablonun satir tipini dondurur ve tabloyu RESTRICT altinda kilitler.
-- -----------------------------------------------------------------------------
DO $drop_rpc$
DECLARE
    v_fn REGPROCEDURE;
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname = ANY (ARRAY[
               'accept_booking_quote_atomic', 'accept_extension_offer_atomic',
               'claim_scheduled_messages_atomic',
               'record_message_delivery_result_atomic', 'generate_expense_from_template',
               'save_manual_pricing_override_atomic'
           ])
    LOOP
        EXECUTE format('DROP FUNCTION %s RESTRICT', v_fn);
    END LOOP;
END
$drop_rpc$;

-- -----------------------------------------------------------------------------
-- 3. Tablolar (cocuklar once, RESTRICT)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.message_delivery_logs RESTRICT;
DROP TABLE IF EXISTS public.scheduled_messages RESTRICT;
DROP TABLE IF EXISTS public.message_automation_rules RESTRICT;
DROP TABLE IF EXISTS public.extension_offers RESTRICT;
DROP TABLE IF EXISTS public.booking_quotes RESTRICT;
DROP TABLE IF EXISTS public.rate_change_logs RESTRICT;
DROP TABLE IF EXISTS public.pricing_events RESTRICT;
DROP TABLE IF EXISTS public.pricing_overrides RESTRICT;
DROP TABLE IF EXISTS public.pricing_rules RESTRICT;
DROP TABLE IF EXISTS public.pricing_profiles RESTRICT;
DROP TABLE IF EXISTS public.daily_rates RESTRICT;
DROP TABLE IF EXISTS public.expense_template_occurrences RESTRICT;
DROP TABLE IF EXISTS public.expense_templates RESTRICT;
DROP TABLE IF EXISTS public.operation_evidence RESTRICT;
DROP TABLE IF EXISTS public.recurring_task_rules RESTRICT;
DROP TABLE IF EXISTS public.tenant_onboarding RESTRICT;
DROP TABLE IF EXISTS public.property_media_versions RESTRICT;
DROP TABLE IF EXISTS public.influencer_collabs RESTRICT;
DROP TABLE IF EXISTS public.property_operator_notes RESTRICT;
DROP TABLE IF EXISTS public.financial_transactions RESTRICT;

-- -----------------------------------------------------------------------------
-- 4. Yalniz bu tablolarin tetikleyici fonksiyonlari (tetikleyiciler tabloyla dustu)
-- -----------------------------------------------------------------------------
DO $drop_trigger_fn$
DECLARE
    v_fn REGPROCEDURE;
BEGIN
    FOR v_fn IN
        SELECT p.oid::regprocedure FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname = ANY (ARRAY[
               'check_evidence_tenant_isolation', 'check_recurring_tenant_isolation',
               'check_rule_tenant_isolation',
               'guard_scheduled_message_sent_immutability',
               'check_pricing_profile_tenant_isolation',
               'check_pricing_rule_tenant_isolation',
               'guard_quote_accepted_immutability', 'guard_pricing_write_authorization'
           ])
    LOOP
        EXECUTE format('DROP FUNCTION %s RESTRICT', v_fn);
    END LOOP;
END
$drop_trigger_fn$;

-- -----------------------------------------------------------------------------
-- 5. Dogrulama
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_tablo TEXT;
    v_fn    TEXT;
BEGIN
    FOREACH v_tablo IN ARRAY ARRAY[
        'message_delivery_logs', 'scheduled_messages', 'message_automation_rules',
        'extension_offers', 'booking_quotes', 'rate_change_logs', 'pricing_events',
        'pricing_overrides', 'pricing_rules', 'pricing_profiles', 'daily_rates',
        'expense_template_occurrences', 'expense_templates', 'operation_evidence',
        'recurring_task_rules', 'tenant_onboarding', 'property_media_versions',
        'influencer_collabs', 'property_operator_notes', 'financial_transactions'
    ] LOOP
        IF to_regclass('public.' || v_tablo) IS NOT NULL THEN
            RAISE EXCEPTION 'PHASE119_TABLE_STILL_EXISTS: %', v_tablo;
        END IF;
        -- Hicbir public fonksiyon govdesi silinen tabloya dokunmamali; yoksa
        -- cagrildiginda "relation does not exist" ile duser.
        SELECT p.proname INTO v_fn FROM pg_proc p
         WHERE p.pronamespace = 'public'::regnamespace
           AND p.prosrc ~ ('\m' || v_tablo || '\M')
         LIMIT 1;
        IF v_fn IS NOT NULL THEN
            RAISE EXCEPTION 'PHASE119_FUNCTION_STILL_REFERENCES: % -> %', v_fn, v_tablo;
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
                AND p.proname = ANY (ARRAY[
                    'accept_booking_quote_atomic', 'accept_extension_offer_atomic',
                    'claim_scheduled_messages_atomic',
                    'record_message_delivery_result_atomic',
                    'generate_expense_from_template',
                    'save_manual_pricing_override_atomic',
                    'check_evidence_tenant_isolation',
                    'check_recurring_tenant_isolation', 'check_rule_tenant_isolation',
                    'guard_scheduled_message_sent_immutability',
                    'check_pricing_profile_tenant_isolation',
                    'check_pricing_rule_tenant_isolation',
                    'guard_quote_accepted_immutability',
                    'guard_pricing_write_authorization'
                ])) THEN
        RAISE EXCEPTION 'PHASE119_FUNCTION_STILL_EXISTS';
    END IF;
    IF has_function_privilege('anon', 'public.erase_guest_personal_data(uuid, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.reset_tenant_data(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE119_ANON_CAN_EXECUTE';
    END IF;
    RAISE NOTICE 'PHASE 119 OK — 20 kullanilmayan tablo ve 14 fonksiyon kaldirildi.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (119, 'phase119_unused_ledgers_cleanup')
ON CONFLICT (version) DO NOTHING;

COMMIT;
