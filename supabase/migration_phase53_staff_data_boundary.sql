-- =============================================================================
-- LEXBNB PHASE 53 — PERSONEL (staff) VERI SINIRI VE SATIS (sales) ROLU (L-107)
-- =============================================================================
-- Sorun (L-107): `staff` uye oldugu isletmenin rezervasyon, gider, temizlik
-- hakedisi, misafir ve talep defterlerinin TAMAMINI okuyabiliyordu; temizlik
-- gorevinin tutarini ve "odendi" durumunu dogrudan degistirebiliyordu
-- (schema.sql "Staff update cleaning": sutun kisiti yok). Arayuzde gizlemek
-- koruma degildir (CLAUDE.md §7).
--
-- Kullanici karari (30.09.2026):
--   * `staff` = SAHA personeli (temizlikci / usta). Yalniz kendisine atanan
--     isi gorur. Rezervasyon, finans, misafir, talep, pazarlama GOREMEZ ve
--     YAZAMAZ. Is guncellemesi dar RPC'lerle gelir (phase55).
--   * Yeni `sales` (Satis) rolu: rezervasyon, talep, misafir ve odeme kaydini
--     okur ve yazar; mulkleri ve takvimi gorur. Giderleri, temizlik
--     maliyetini/borcunu, ay kapanisini, hedefleri, finans ozetini ve
--     pazarlama defterlerini GOREMEZ; rezervasyon SILEMEZ. Rezervasyon
--     satirindaki tutar/komisyon ayni satirda oldugu icin gorunur (bilerek).
--   * `viewer` oldugu gibi: her seyi okur (kara/beyaz liste haric, phase59),
--     hicbir seyi yazamaz.
--
-- Rol kumeleri TEK yerde tanimlanir (asagidaki dort yardimci). Politika ve
-- RPC'ler rol dizisi yazmaz, yardimciyi cagirir; bir rol eklenirse tek yer
-- degisir.
--
--   can_manage_tenant  owner, admin, manager                (yonetim yazmasi)
--   can_read_ledger    owner, admin, manager, viewer        (finans/operasyon/pazarlama okuma)
--   can_read_sales     owner, admin, manager, sales, viewer (rezervasyon/talep/misafir/mulk okuma)
--   can_write_sales    owner, admin, manager, sales         (rezervasyon/talep/misafir yazma)
--
-- Negatif liste yok: `NULL NOT IN (...)` tuzagi (CLAUDE.md §7) yardimcinin
-- icinde COALESCE ile kapatilir; uye olmayan her zaman FALSE alir.
--
-- Bu gocle gelen ek duzeltme: `accept_booking_quote_atomic` govdesinde HIC
-- yetki kontrolu, `save_manual_pricing_override_atomic` govdesinde kiraci
-- kontrolu yoktu; yalniz phase44 tablo tetikleyicisi koruyordu (iki katli
-- kuralin tek kati). Ikisine de govde ici yetki, kayit aramadan ONCE.
--
-- Govdeler test projesindeki guncel tanimlardan (phase5/7/9/10/16/17/23/27/
-- 41/44/45 son hali) birebir alindi; yalniz rol satirlari degisti.
-- Bagimlilik: phase41, phase44 (phase11 tablolari), phase45.
-- Uygulama: docs/PHASE53_DEPLOY_PACKAGE.md
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. On kosul
-- -----------------------------------------------------------------------------
DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 45) THEN
        RAISE EXCEPTION 'PHASE53_REQUIRES_PHASE45';
    END IF;
    IF to_regclass('public.booking_quotes') IS NULL THEN
        RAISE EXCEPTION 'PHASE53_REQUIRES_PHASE11_TABLES';
    END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. `sales` rolu
-- -----------------------------------------------------------------------------
DO $roles$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conrelid::regclass AS tbl, conname
        FROM pg_constraint
        WHERE contype = 'c'
          AND conrelid IN ('public.tenant_members'::regclass, 'public.tenant_invitations'::regclass)
          AND pg_get_constraintdef(oid) LIKE '%''staff''%'
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    END LOOP;
END
$roles$;

ALTER TABLE public.tenant_members
    ADD CONSTRAINT tenant_members_role_check
    CHECK (role IN ('owner', 'admin', 'manager', 'sales', 'staff', 'viewer'));

ALTER TABLE public.tenant_invitations
    ADD CONSTRAINT tenant_invitations_role_check
    CHECK (role IN ('admin', 'manager', 'sales', 'staff', 'viewer'));

-- -----------------------------------------------------------------------------
-- 2. Rol kumesi yardimcilari
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_has_tenant_role(p_tenant_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE((
        SELECT tm.role::TEXT = ANY (p_roles)
        FROM public.tenant_members tm
        WHERE tm.tenant_id = p_tenant_id
          AND tm.user_id = auth.uid()
        LIMIT 1
    ), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_tenant(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT public.fn_has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager']);
$$;

CREATE OR REPLACE FUNCTION public.can_read_ledger(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT public.fn_has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager', 'viewer']);
$$;

CREATE OR REPLACE FUNCTION public.can_read_sales(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT public.fn_has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager', 'sales', 'viewer']);
$$;

CREATE OR REPLACE FUNCTION public.can_write_sales(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT public.fn_has_tenant_role(p_tenant_id, ARRAY['owner', 'admin', 'manager', 'sales']);
$$;

REVOKE ALL ON FUNCTION public.fn_has_tenant_role(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_has_tenant_role(UUID, TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_has_tenant_role(UUID, TEXT[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_tenant(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_tenant(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_read_ledger(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_ledger(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_read_ledger(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_read_sales(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_sales(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_read_sales(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_write_sales(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_sales(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_write_sales(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Finans / operasyon / pazarlama defterleri: okuma can_read_ledger
--    (staff ve sales okuyamaz), yazma can_manage_tenant.
-- -----------------------------------------------------------------------------

-- expenses
DROP POLICY IF EXISTS "Members view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Staff update expenses" ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

-- financial_transactions
DROP POLICY IF EXISTS "Members view financial transactions" ON public.financial_transactions;
CREATE POLICY financial_transactions_select ON public.financial_transactions FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));

-- finance_import_batches / finance_import_batch_rows
DROP POLICY IF EXISTS "Members view imports" ON public.finance_import_batches;
DROP POLICY IF EXISTS "Staff insert imports" ON public.finance_import_batches;
CREATE POLICY finance_import_batches_select ON public.finance_import_batches FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
CREATE POLICY finance_import_batches_insert ON public.finance_import_batches FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
DROP POLICY IF EXISTS "Members view import rows" ON public.finance_import_batch_rows;
DROP POLICY IF EXISTS "Staff insert import rows" ON public.finance_import_batch_rows;
CREATE POLICY finance_import_batch_rows_select ON public.finance_import_batch_rows FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
CREATE POLICY finance_import_batch_rows_insert ON public.finance_import_batch_rows FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));

-- monthly_financial_closes (yazma RPC + "Managers update closes" aynen)
DROP POLICY IF EXISTS "Members view closes" ON public.monthly_financial_closes;
CREATE POLICY monthly_financial_closes_select ON public.monthly_financial_closes FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));

-- monthly_targets: "Staff manage targets" (phase8) staff'a hedef yazdiriyordu
DROP POLICY IF EXISTS "Members view targets" ON public.monthly_targets;
DROP POLICY IF EXISTS "Staff manage targets" ON public.monthly_targets;
CREATE POLICY monthly_targets_select ON public.monthly_targets FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
CREATE POLICY monthly_targets_insert ON public.monthly_targets FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY monthly_targets_update ON public.monthly_targets FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY monthly_targets_delete ON public.monthly_targets FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

-- executive_alerts
DROP POLICY IF EXISTS executive_alerts_select ON public.executive_alerts;
CREATE POLICY executive_alerts_select ON public.executive_alerts FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));

-- cleaning_tasks: tutar (hakedis) ve odeme durumu burada. staff dogrudan
-- ne okur ne yazar; kendi isini phase55'in dar RPC'leriyle gorur/gunceller.
DROP POLICY IF EXISTS "Members view cleaning" ON public.cleaning_tasks;
DROP POLICY IF EXISTS "Staff insert cleaning" ON public.cleaning_tasks;
DROP POLICY IF EXISTS "Staff update cleaning" ON public.cleaning_tasks;
CREATE POLICY cleaning_tasks_select ON public.cleaning_tasks FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
CREATE POLICY cleaning_tasks_insert ON public.cleaning_tasks FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY cleaning_tasks_update ON public.cleaning_tasks FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

-- recurring_task_rules
DROP POLICY IF EXISTS "Members view recurring" ON public.recurring_task_rules;
CREATE POLICY recurring_task_rules_select ON public.recurring_task_rules FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));

-- operations_audit_logs (istemci yazmiyor; staff sahte iz yazamasin)
DROP POLICY IF EXISTS "Members view operations audit" ON public.operations_audit_logs;
DROP POLICY IF EXISTS "System insert operations audit" ON public.operations_audit_logs;
CREATE POLICY operations_audit_logs_select ON public.operations_audit_logs FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
CREATE POLICY operations_audit_logs_insert ON public.operations_audit_logs FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));

-- pazarlama defterleri: okuma can_read_ledger
DROP POLICY IF EXISTS marketing_campaigns_select ON public.marketing_campaigns;
CREATE POLICY marketing_campaigns_select ON public.marketing_campaigns FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS influencer_collabs_select ON public.influencer_collabs;
CREATE POLICY influencer_collabs_select ON public.influencer_collabs FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view marketing findings" ON public.marketing_findings;
CREATE POLICY marketing_findings_select ON public.marketing_findings FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view listing change experiments" ON public.listing_change_experiments;
CREATE POLICY listing_change_experiments_select ON public.listing_change_experiments FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view listing experiment evidence" ON public.listing_experiment_snapshots;
CREATE POLICY listing_experiment_snapshots_select ON public.listing_experiment_snapshots FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view property marketing benchmarks" ON public.property_marketing_benchmarks;
CREATE POLICY property_marketing_benchmarks_select ON public.property_marketing_benchmarks FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view marketing health inputs" ON public.property_marketing_health_inputs;
CREATE POLICY property_marketing_health_inputs_select ON public.property_marketing_health_inputs FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view listing marketing health" ON public.property_marketing_health_snapshots;
CREATE POLICY property_marketing_health_snapshots_select ON public.property_marketing_health_snapshots FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view photo analysis runs" ON public.photo_analysis_runs;
CREATE POLICY photo_analysis_runs_select ON public.photo_analysis_runs FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view photo analysis items" ON public.photo_analysis_items;
CREATE POLICY photo_analysis_items_select ON public.photo_analysis_items FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view property media" ON public.property_media;
CREATE POLICY property_media_select ON public.property_media FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view media versions" ON public.property_media_versions;
CREATE POLICY property_media_versions_select ON public.property_media_versions FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
DROP POLICY IF EXISTS "Members view channel media placements" ON public.channel_media_placements;
CREATE POLICY channel_media_placements_select ON public.channel_media_placements FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));

DROP POLICY IF EXISTS "Members view marketing imports" ON public.marketing_metric_import_batches;
DROP POLICY IF EXISTS "Staff create marketing imports" ON public.marketing_metric_import_batches;
DROP POLICY IF EXISTS "Staff update own draft marketing imports" ON public.marketing_metric_import_batches;
CREATE POLICY marketing_metric_import_batches_select ON public.marketing_metric_import_batches FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
CREATE POLICY marketing_metric_import_batches_insert ON public.marketing_metric_import_batches FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id) AND created_by = auth.uid());
CREATE POLICY marketing_metric_import_batches_update ON public.marketing_metric_import_batches FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id) AND status = 'DRAFT' AND created_by = auth.uid())
    WITH CHECK (public.can_manage_tenant(tenant_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "Members view channel snapshots" ON public.channel_performance_snapshots;
DROP POLICY IF EXISTS "Staff append channel snapshots" ON public.channel_performance_snapshots;
CREATE POLICY channel_performance_snapshots_select ON public.channel_performance_snapshots FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
CREATE POLICY channel_performance_snapshots_insert ON public.channel_performance_snapshots FOR INSERT TO authenticated
    WITH CHECK (
        public.can_manage_tenant(tenant_id)
        AND created_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.marketing_metric_import_batches batch
            WHERE batch.tenant_id = channel_performance_snapshots.tenant_id
              AND batch.id = channel_performance_snapshots.import_batch_id
              AND batch.status = 'DRAFT'
        )
    );

-- -----------------------------------------------------------------------------
-- 4. Rezervasyon / talep / misafir / mulk: okuma can_read_sales,
--    yazma can_write_sales (silme yonetimde kalir). staff hicbirini gormez.
-- -----------------------------------------------------------------------------

-- bookings
DROP POLICY IF EXISTS "Members view bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff update bookings" ON public.bookings;
CREATE POLICY bookings_select ON public.bookings FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY bookings_insert ON public.bookings FOR INSERT TO authenticated
    WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY bookings_update ON public.bookings FOR UPDATE TO authenticated
    USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id));

-- booking_payment_commissions (rezervasyon kaydiyla birlikte yazilir)
DROP POLICY IF EXISTS "Members view payment commissions" ON public.booking_payment_commissions;
DROP POLICY IF EXISTS "Booking roles insert payment commissions" ON public.booking_payment_commissions;
DROP POLICY IF EXISTS "Booking roles update payment commissions" ON public.booking_payment_commissions;
CREATE POLICY booking_payment_commissions_select ON public.booking_payment_commissions FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY booking_payment_commissions_insert ON public.booking_payment_commissions FOR INSERT TO authenticated
    WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY booking_payment_commissions_update ON public.booking_payment_commissions FOR UPDATE TO authenticated
    USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id));

-- leads
DROP POLICY IF EXISTS "Members view leads" ON public.leads;
DROP POLICY IF EXISTS "Staff insert leads" ON public.leads;
DROP POLICY IF EXISTS "Staff update leads" ON public.leads;
CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY leads_insert ON public.leads FOR INSERT TO authenticated
    WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated
    USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id));

-- guests
DROP POLICY IF EXISTS guests_tenant_select ON public.guests;
DROP POLICY IF EXISTS guests_tenant_insert ON public.guests;
DROP POLICY IF EXISTS guests_tenant_update ON public.guests;
CREATE POLICY guests_tenant_select ON public.guests FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY guests_tenant_insert ON public.guests FOR INSERT TO authenticated
    WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY guests_tenant_update ON public.guests FOR UPDATE TO authenticated
    USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id));

DROP POLICY IF EXISTS guest_consent_events_tenant_select ON public.guest_consent_events;
CREATE POLICY guest_consent_events_tenant_select ON public.guest_consent_events FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));

-- extension_offers / scheduled_messages / mesaj defterleri
DROP POLICY IF EXISTS extension_offers_select ON public.extension_offers;
DROP POLICY IF EXISTS extension_offers_insert ON public.extension_offers;
DROP POLICY IF EXISTS extension_offers_update ON public.extension_offers;
CREATE POLICY extension_offers_select ON public.extension_offers FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY extension_offers_insert ON public.extension_offers FOR INSERT TO authenticated
    WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY extension_offers_update ON public.extension_offers FOR UPDATE TO authenticated
    USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id));

DROP POLICY IF EXISTS scheduled_messages_select ON public.scheduled_messages;
DROP POLICY IF EXISTS scheduled_messages_insert ON public.scheduled_messages;
DROP POLICY IF EXISTS scheduled_messages_update ON public.scheduled_messages;
CREATE POLICY scheduled_messages_select ON public.scheduled_messages FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY scheduled_messages_insert ON public.scheduled_messages FOR INSERT TO authenticated
    WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY scheduled_messages_update ON public.scheduled_messages FOR UPDATE TO authenticated
    USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id));

DROP POLICY IF EXISTS message_delivery_logs_select ON public.message_delivery_logs;
CREATE POLICY message_delivery_logs_select ON public.message_delivery_logs FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
DROP POLICY IF EXISTS message_templates_select ON public.message_templates;
CREATE POLICY message_templates_select ON public.message_templates FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
DROP POLICY IF EXISTS message_automation_rules_select ON public.message_automation_rules;
CREATE POLICY message_automation_rules_select ON public.message_automation_rules FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));

-- properties ve mulk yan tablolari (staff mulk bilgisini phase55 RPC'siyle,
-- yalniz atandigi is icin gorur: base_price / clean_cost burada durur)
DROP POLICY IF EXISTS "Members view properties" ON public.properties;
DROP POLICY IF EXISTS "Staff update properties" ON public.properties;
CREATE POLICY properties_select ON public.properties FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY properties_update ON public.properties FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS property_guest_settings_select ON public.property_guest_settings;
CREATE POLICY property_guest_settings_select ON public.property_guest_settings FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
DROP POLICY IF EXISTS "Members view channel listings" ON public.property_channel_listings;
CREATE POLICY property_channel_listings_select ON public.property_channel_listings FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
DROP POLICY IF EXISTS tenant_booking_channels_select ON public.tenant_booking_channels;
CREATE POLICY tenant_booking_channels_select ON public.tenant_booking_channels FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
DROP POLICY IF EXISTS property_pricing_ladder_select ON public.property_pricing_ladder;
CREATE POLICY property_pricing_ladder_select ON public.property_pricing_ladder FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
DROP POLICY IF EXISTS property_analysis_context_select ON public.property_analysis_context;
CREATE POLICY property_analysis_context_select ON public.property_analysis_context FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));

DROP POLICY IF EXISTS property_operator_notes_select ON public.property_operator_notes;
DROP POLICY IF EXISTS property_operator_notes_insert ON public.property_operator_notes;
DROP POLICY IF EXISTS property_operator_notes_update ON public.property_operator_notes;
DROP POLICY IF EXISTS property_operator_notes_delete ON public.property_operator_notes;
CREATE POLICY property_operator_notes_select ON public.property_operator_notes FOR SELECT TO authenticated
    USING (public.can_read_sales(tenant_id));
CREATE POLICY property_operator_notes_insert ON public.property_operator_notes FOR INSERT TO authenticated
    WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY property_operator_notes_update ON public.property_operator_notes FOR UPDATE TO authenticated
    USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id));
CREATE POLICY property_operator_notes_delete ON public.property_operator_notes FOR DELETE TO authenticated
    USING (public.can_write_sales(tenant_id));

-- phase11 fiyat tablolari: rol ayirmayan "FOR ALL uyelik" politikalari
-- (CLAUDE.md §7: yazilmaz). Okuma satis, yazma yonetim; teklif satis.
DO $pricing$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'pricing_profiles', 'pricing_rules', 'pricing_events', 'pricing_overrides',
        'daily_rates', 'rate_change_logs', 'booking_quotes'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_tenant_all', v_table);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_read_sales(tenant_id))',
                       v_table || '_select', v_table);
        IF v_table = 'booking_quotes' THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_sales(tenant_id))',
                           v_table || '_insert', v_table);
            EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_write_sales(tenant_id)) WITH CHECK (public.can_write_sales(tenant_id))',
                           v_table || '_update', v_table);
        ELSE
            EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage_tenant(tenant_id))',
                           v_table || '_insert', v_table);
            EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id))',
                           v_table || '_update', v_table);
        END IF;
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_manage_tenant(tenant_id))',
                       v_table || '_delete', v_table);
    END LOOP;
END
$pricing$;

-- -----------------------------------------------------------------------------
-- 5. Operasyon: yonetim okur ve yazar; atanan kisi YALNIZ kendi satirini
--    okur. Saha guncellemesi dogrudan tablo yazmasi degil, phase55 RPC'si.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members view tasks" ON public.operational_tasks;
DROP POLICY IF EXISTS "Staff manage tasks" ON public.operational_tasks;
CREATE POLICY operational_tasks_select ON public.operational_tasks FOR SELECT TO authenticated
    USING (
        public.can_read_ledger(tenant_id)
        OR (assigned_to = auth.uid() AND public.is_tenant_member(tenant_id))
    );
CREATE POLICY operational_tasks_insert ON public.operational_tasks FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY operational_tasks_update ON public.operational_tasks FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY operational_tasks_delete ON public.operational_tasks FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS "Members view maintenance" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "Staff manage maintenance" ON public.maintenance_tickets;
CREATE POLICY maintenance_tickets_select ON public.maintenance_tickets FOR SELECT TO authenticated
    USING (
        public.can_read_ledger(tenant_id)
        OR (assigned_to = auth.uid() AND public.is_tenant_member(tenant_id))
    );
CREATE POLICY maintenance_tickets_insert ON public.maintenance_tickets FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY maintenance_tickets_update ON public.maintenance_tickets FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY maintenance_tickets_delete ON public.maintenance_tickets FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

DROP POLICY IF EXISTS "Members view evidence" ON public.operation_evidence;
DROP POLICY IF EXISTS "Staff insert evidence" ON public.operation_evidence;
CREATE POLICY operation_evidence_select ON public.operation_evidence FOR SELECT TO authenticated
    USING (
        public.can_read_ledger(tenant_id)
        OR (uploaded_by = auth.uid() AND public.is_tenant_member(tenant_id))
    );
CREATE POLICY operation_evidence_insert ON public.operation_evidence FOR INSERT TO authenticated
    WITH CHECK (
        public.can_manage_tenant(tenant_id)
        OR (
            uploaded_by = auth.uid()
            AND public.is_tenant_member(tenant_id)
            AND (
                EXISTS (SELECT 1 FROM public.operational_tasks ot
                        WHERE ot.id = operation_evidence.operational_task_id
                          AND ot.tenant_id = operation_evidence.tenant_id
                          AND ot.assigned_to = auth.uid())
                OR EXISTS (SELECT 1 FROM public.maintenance_tickets mt
                           WHERE mt.id = operation_evidence.maintenance_ticket_id
                             AND mt.tenant_id = operation_evidence.tenant_id
                             AND mt.assigned_to = auth.uid())
            )
        )
    );

-- -----------------------------------------------------------------------------
-- 6. Bildirim ve ekip
-- -----------------------------------------------------------------------------
-- Isletme geneli (user_id NULL) bildirimler finans olayi tasiyabilir: yalniz
-- defter okuyuculari. Kisisel bildirim sahibine.
DROP POLICY IF EXISTS user_notifications_select ON public.user_notifications;
CREATE POLICY user_notifications_select ON public.user_notifications FOR SELECT TO authenticated
    USING (
        public.is_tenant_member(tenant_id)
        AND (user_id = auth.uid() OR (user_id IS NULL AND public.can_read_ledger(tenant_id)))
    );

-- Admin, sales rolunu de verebilir (owner/admin vermek yalniz sahibin).
DROP POLICY IF EXISTS "Owners and admins add members" ON public.tenant_members;
CREATE POLICY "Owners and admins add members" ON public.tenant_members FOR INSERT
    WITH CHECK (
        public.is_tenant_member(tenant_id)
        AND (
            COALESCE(public.get_tenant_role(tenant_id), '') = 'owner'
            OR (COALESCE(public.get_tenant_role(tenant_id), '') = 'admin'
                AND role IN ('manager', 'sales', 'staff', 'viewer'))
        )
    );

-- -----------------------------------------------------------------------------
-- 7. RPC'ler — govdeler guncel tanimla birebir, yalniz rol satirlari degisti
-- -----------------------------------------------------------------------------
-- create_booking_atomic
CREATE OR REPLACE FUNCTION public.create_booking_atomic(p_tenant_id uuid, p_property_id uuid, p_booking_code text, p_guest_name text, p_guest_phone text, p_channel text, p_check_in date, p_check_out date, p_pax integer, p_gross_amount numeric, p_ota_commission numeric, p_cleaning_fee numeric, p_discount numeric, p_net_room_revenue numeric, p_status text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- phase53 (L-107): rezervasyon yazan roller owner, admin, manager, sales; staff saha personelidir
    SELECT role INTO v_user_role
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = v_user_id;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_TENANT: Belirtilen işletmeye erişim yetkiniz bulunmuyor.'
            USING ERRCODE = '42501';
    END IF;

    IF v_user_role NOT IN ('owner', 'admin', 'manager', 'sales') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu rol ile rezervasyon oluşturulamaz (Viewer yetkisi yetersizdir).'
            USING ERRCODE = '42501';
    END IF;

    -- [3] Property Existence & Tenant Ownership Verification
    -- Prevents foreign property injection across tenants
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

    -- [8] Overbooking Verification (Explicit Pre-check before INSERT)
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
$function$;

REVOKE ALL ON FUNCTION public.create_booking_atomic(uuid, uuid, text, text, text, text, date, date, integer, numeric, numeric, numeric, numeric, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking_atomic(uuid, uuid, text, text, text, text, date, date, integer, numeric, numeric, numeric, numeric, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_booking_atomic(uuid, uuid, text, text, text, text, date, date, integer, numeric, numeric, numeric, numeric, numeric, text, text) TO authenticated;

-- update_booking_atomic
CREATE OR REPLACE FUNCTION public.update_booking_atomic(p_booking_id uuid, p_tenant_id uuid, p_property_id uuid, p_guest_name text, p_guest_phone text, p_channel text, p_check_in date, p_check_out date, p_pax integer, p_gross_amount numeric, p_ota_commission numeric, p_cleaning_fee numeric, p_discount numeric, p_net_room_revenue numeric, p_status text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

    IF v_user_role NOT IN ('owner', 'admin', 'manager', 'sales') THEN
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
$function$;

REVOKE ALL ON FUNCTION public.update_booking_atomic(uuid, uuid, uuid, text, text, text, date, date, integer, numeric, numeric, numeric, numeric, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_booking_atomic(uuid, uuid, uuid, text, text, text, date, date, integer, numeric, numeric, numeric, numeric, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_booking_atomic(uuid, uuid, uuid, text, text, text, date, date, integer, numeric, numeric, numeric, numeric, numeric, text, text) TO authenticated;

-- convert_lead_to_booking_atomic
CREATE OR REPLACE FUNCTION public.convert_lead_to_booking_atomic(p_lead_id uuid, p_tenant_id uuid, p_property_id uuid DEFAULT NULL::uuid, p_booking_code text DEFAULT NULL::text, p_check_in date DEFAULT NULL::date, p_check_out date DEFAULT NULL::date, p_pax integer DEFAULT NULL::integer, p_gross_amount numeric DEFAULT NULL::numeric, p_ota_commission numeric DEFAULT 0, p_cleaning_fee numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- [1] Authentication Verification
    IF v_user_id IS NULL AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '28000';
    END IF;

    -- [2] Tenant Membership & Role Authorization Verification
    IF auth.role() != 'service_role' THEN
        SELECT role INTO v_user_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id;

        IF v_user_role IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED_TENANT: Belirtilen işletmeye erişim yetkiniz bulunmuyor.'
                USING ERRCODE = '42501';
        END IF;

        IF v_user_role NOT IN ('owner', 'admin', 'manager', 'sales') THEN
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
$function$;

REVOKE ALL ON FUNCTION public.convert_lead_to_booking_atomic(uuid, uuid, uuid, text, date, date, integer, numeric, numeric, numeric, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_lead_to_booking_atomic(uuid, uuid, uuid, text, date, date, integer, numeric, numeric, numeric, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_booking_atomic(uuid, uuid, uuid, text, date, date, integer, numeric, numeric, numeric, numeric, text) TO authenticated;

-- upsert_booking_guest_atomic
CREATE OR REPLACE FUNCTION public.upsert_booking_guest_atomic(p_tenant_id uuid, p_booking_id uuid, p_first_name text, p_last_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_preferred_language text DEFAULT 'tr'::text, p_country_code text DEFAULT 'TR'::text, p_allow_email boolean DEFAULT true, p_allow_sms boolean DEFAULT true, p_allow_whatsapp boolean DEFAULT true, p_marketing_opt_in boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_booking public.bookings%ROWTYPE;
  v_guest public.guests%ROWTYPE;
  v_phone TEXT := NULLIF(trim(COALESCE(p_phone, '')), '');
  v_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  v_first_name TEXT := NULLIF(trim(COALESCE(p_first_name, '')), '');
  v_last_name TEXT := NULLIF(trim(COALESCE(p_last_name, '')), '');
  v_phone_guest UUID;
  v_email_guest UUID;
BEGIN
  -- Yetki, herhangi bir hedef kaydi aramadan ONCE kontrol edilir.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
  END IF;

  SELECT tm.role INTO v_role
  FROM public.tenant_members tm
  WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_user_id;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'FORBIDDEN_ROLE: Misafir profili baglama yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  IF v_first_name IS NULL THEN
    RAISE EXCEPTION 'INVALID_GUEST_NAME: Misafir adi zorunludur.' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION 'GUEST_CONTACT_REQUIRED: Profil baglamak icin telefon veya e-posta zorunludur.' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'INVALID_GUEST_PHONE: Telefon E.164 biciminde olmali.' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'INVALID_GUEST_EMAIL: E-posta bicimi gecersiz.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id AND b.tenant_id = p_tenant_id
  FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: Rezervasyon bulunamadi.' USING ERRCODE = 'P0002';
  END IF;

  -- Iki kimlik de ayri kilitlenir ve siralama her zaman telefon -> e-posta;
  -- ayni e-postayla farkli telefonlardan gelen eszamanli istek de cift profil
  -- olusturamaz, ters kilit sirasi nedeniyle deadlock da uretilmez.
  IF v_phone IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext('phone:' || v_phone));
  END IF;
  IF v_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext('email:' || v_email));
  END IF;

  IF v_booking.primary_guest_id IS NOT NULL THEN
    SELECT * INTO v_guest
    FROM public.guests g
    WHERE g.id = v_booking.primary_guest_id AND g.tenant_id = p_tenant_id
    FOR UPDATE;
  ELSE
    IF v_phone IS NOT NULL THEN
      SELECT g.id INTO v_phone_guest
      FROM public.guests g
      WHERE g.tenant_id = p_tenant_id AND g.phone = v_phone
      ORDER BY g.created_at ASC LIMIT 1;
    END IF;
    IF v_email IS NOT NULL THEN
      SELECT g.id INTO v_email_guest
      FROM public.guests g
      WHERE g.tenant_id = p_tenant_id AND lower(g.email) = v_email
      ORDER BY g.created_at ASC LIMIT 1;
    END IF;
    IF v_phone_guest IS NOT NULL AND v_email_guest IS NOT NULL AND v_phone_guest <> v_email_guest THEN
      RAISE EXCEPTION 'GUEST_IDENTITY_CONFLICT: Telefon ve e-posta farkli profillere ait.' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_guest
    FROM public.guests g
    WHERE g.id = COALESCE(v_phone_guest, v_email_guest)
      AND g.tenant_id = p_tenant_id
    FOR UPDATE;
  END IF;

  IF v_guest.id IS NULL THEN
    INSERT INTO public.guests (
      tenant_id, first_name, last_name, phone, email, preferred_language,
      country_code, allow_email, allow_sms, allow_whatsapp, marketing_opt_in
    ) VALUES (
      p_tenant_id, v_first_name, v_last_name, v_phone, v_email,
      COALESCE(NULLIF(trim(p_preferred_language), ''), 'tr'),
      COALESCE(NULLIF(upper(trim(p_country_code)), ''), 'TR'),
      p_allow_email, p_allow_sms, p_allow_whatsapp, p_marketing_opt_in
    ) RETURNING * INTO v_guest;
  ELSE
    UPDATE public.guests SET
      first_name = v_first_name,
      last_name = v_last_name,
      phone = COALESCE(v_phone, phone),
      email = COALESCE(v_email, email),
      preferred_language = COALESCE(NULLIF(trim(p_preferred_language), ''), preferred_language),
      country_code = COALESCE(NULLIF(upper(trim(p_country_code)), ''), country_code),
      allow_email = p_allow_email,
      allow_sms = p_allow_sms,
      allow_whatsapp = p_allow_whatsapp,
      marketing_opt_in = p_marketing_opt_in,
      updated_at = NOW()
    WHERE id = v_guest.id AND tenant_id = p_tenant_id
    RETURNING * INTO v_guest;
  END IF;

  UPDATE public.bookings SET
    primary_guest_id = v_guest.id,
    guest_name = trim(concat_ws(' ', v_guest.first_name, v_guest.last_name)),
    guest_phone = COALESCE(v_guest.phone, guest_phone),
    updated_at = NOW()
  WHERE id = p_booking_id AND tenant_id = p_tenant_id;

  RETURN to_jsonb(v_guest);
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_booking_guest_atomic(uuid, uuid, text, text, text, text, text, text, boolean, boolean, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_booking_guest_atomic(uuid, uuid, text, text, text, text, text, text, boolean, boolean, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_booking_guest_atomic(uuid, uuid, text, text, text, text, text, text, boolean, boolean, boolean, boolean) TO authenticated;

-- accept_extension_offer_atomic
CREATE OR REPLACE FUNCTION public.accept_extension_offer_atomic(p_tenant_id uuid, p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_offer public.extension_offers%ROWTYPE;
    v_booking public.bookings%ROWTYPE;
    v_new_checkout DATE;
    v_conflict_count INT;
BEGIN
    -- Yetki, satir kilidinden ONCE (phase25/29 kalibi). Izinli roller
    -- bookings UPDATE politikasiyla ayni: teklif kabulu rezervasyon yazar.
    IF auth.role() IS DISTINCT FROM 'service_role' AND (
         auth.uid() IS NULL
         OR COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner', 'admin', 'manager', 'sales')
       ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED_EXTENSION_ACCEPT' USING ERRCODE = '42501';
    END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.accept_extension_offer_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_extension_offer_atomic(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_extension_offer_atomic(uuid, uuid) TO authenticated;

-- resolve_maintenance_ticket_atomic
CREATE OR REPLACE FUNCTION public.resolve_maintenance_ticket_atomic(p_tenant_id uuid, p_ticket_id uuid, p_actual_cost numeric, p_category text DEFAULT 'Tadilat'::text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

        -- phase53 (L-107): kapanis gider yazar; yalniz yonetim rolleri
        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'manager') THEN
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
$function$;

REVOKE ALL ON FUNCTION public.resolve_maintenance_ticket_atomic(uuid, uuid, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_maintenance_ticket_atomic(uuid, uuid, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_maintenance_ticket_atomic(uuid, uuid, numeric, text, text) TO authenticated;

-- record_manual_channel_snapshot
CREATE OR REPLACE FUNCTION public.record_manual_channel_snapshot(p_tenant_id uuid, p_channel_listing_id uuid, p_period_start date, p_period_end_exclusive date, p_idempotency_key text, p_impressions bigint DEFAULT NULL::bigint, p_listing_views bigint DEFAULT NULL::bigint, p_booking_attempts bigint DEFAULT NULL::bigint, p_platform_reported_bookings bigint DEFAULT NULL::bigint, p_wishlist_saves bigint DEFAULT NULL::bigint, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_batch_id UUID;
    v_snapshot public.channel_performance_snapshots%ROWTYPE;
    v_status TEXT;
    v_present_count INTEGER;
BEGIN
    IF auth.uid() IS NULL
       OR COALESCE(public.get_tenant_role(p_tenant_id), '') NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MARKETING_SNAPSHOT' USING ERRCODE = '42501';
    END IF;

    IF p_period_start IS NULL OR p_period_end_exclusive IS NULL
       OR p_period_end_exclusive <= p_period_start THEN
        RAISE EXCEPTION 'INVALID_SNAPSHOT_PERIOD' USING ERRCODE = '22023';
    END IF;
    IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 16
       OR length(p_idempotency_key) > 200 THEN
        RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
    END IF;
    IF p_impressions IS NULL AND p_listing_views IS NULL AND p_booking_attempts IS NULL
       AND p_platform_reported_bookings IS NULL AND p_wishlist_saves IS NULL THEN
        RAISE EXCEPTION 'AT_LEAST_ONE_FUNNEL_COUNTER_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(p_impressions, 0) < 0 OR COALESCE(p_listing_views, 0) < 0
       OR COALESCE(p_booking_attempts, 0) < 0 OR COALESCE(p_platform_reported_bookings, 0) < 0
       OR COALESCE(p_wishlist_saves, 0) < 0 THEN
        RAISE EXCEPTION 'NEGATIVE_FUNNEL_COUNTER' USING ERRCODE = '22023';
    END IF;
    IF (p_impressions IS NOT NULL AND p_listing_views IS NOT NULL AND p_listing_views > p_impressions)
       OR (p_listing_views IS NOT NULL AND p_booking_attempts IS NOT NULL AND p_booking_attempts > p_listing_views)
       OR (p_booking_attempts IS NOT NULL AND p_platform_reported_bookings IS NOT NULL
           AND p_platform_reported_bookings > p_booking_attempts)
       OR (p_booking_attempts IS NULL AND p_listing_views IS NOT NULL
           AND p_platform_reported_bookings IS NOT NULL AND p_platform_reported_bookings > p_listing_views)
       OR (p_listing_views IS NOT NULL AND p_wishlist_saves IS NOT NULL AND p_wishlist_saves > p_listing_views) THEN
        RAISE EXCEPTION 'INVALID_FUNNEL_ORDER' USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.property_channel_listings
    WHERE tenant_id = p_tenant_id AND id = p_channel_listing_id AND status <> 'ARCHIVED';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CHANNEL_LISTING_NOT_FOUND_IN_TENANT' USING ERRCODE = 'P0002';
    END IF;

    v_present_count := num_nonnulls(p_impressions, p_listing_views, p_booking_attempts,
        p_platform_reported_bookings, p_wishlist_saves);
    v_status := CASE WHEN v_present_count = 5 THEN 'VALID' ELSE 'PARTIAL' END;

    INSERT INTO public.marketing_metric_import_batches (
        tenant_id, source_type, status, source_schema_version, idempotency_key,
        validation_summary, created_by
    ) VALUES (
        p_tenant_id, 'MANUAL', 'DRAFT', 'marketing-funnel-v1', trim(p_idempotency_key),
        jsonb_build_object('coveragePercent', v_present_count * 20, 'presentFields', v_present_count), auth.uid()
    )
    ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
        SET idempotency_key = EXCLUDED.idempotency_key
    RETURNING id INTO v_batch_id;

    SELECT * INTO v_snapshot
    FROM public.channel_performance_snapshots
    WHERE tenant_id = p_tenant_id AND import_batch_id = v_batch_id
    LIMIT 1;

    IF FOUND THEN
        IF v_snapshot.channel_listing_id IS DISTINCT FROM p_channel_listing_id
           OR v_snapshot.period_start IS DISTINCT FROM p_period_start
           OR v_snapshot.period_end_exclusive IS DISTINCT FROM p_period_end_exclusive
           OR v_snapshot.impressions IS DISTINCT FROM p_impressions
           OR v_snapshot.listing_views IS DISTINCT FROM p_listing_views
           OR v_snapshot.booking_attempts IS DISTINCT FROM p_booking_attempts
           OR v_snapshot.platform_reported_bookings IS DISTINCT FROM p_platform_reported_bookings
           OR v_snapshot.wishlist_saves IS DISTINCT FROM p_wishlist_saves
           OR v_snapshot.notes IS DISTINCT FROM NULLIF(trim(p_notes), '') THEN
            RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_MISMATCH' USING ERRCODE = '22023';
        END IF;
        RETURN jsonb_build_object('snapshotId', v_snapshot.id, 'importBatchId', v_batch_id,
            'reused', TRUE, 'validationStatus', v_snapshot.validation_status);
    END IF;

    INSERT INTO public.channel_performance_snapshots (
        tenant_id, channel_listing_id, import_batch_id, period_start, period_end_exclusive,
        metric_definition_version, impressions, listing_views, booking_attempts,
        platform_reported_bookings, wishlist_saves, validation_status, validation_issues,
        notes, created_by
    ) VALUES (
        p_tenant_id, p_channel_listing_id, v_batch_id, p_period_start, p_period_end_exclusive,
        'marketing-funnel-v1', p_impressions, p_listing_views, p_booking_attempts,
        p_platform_reported_bookings, p_wishlist_saves, v_status,
        CASE WHEN v_status = 'PARTIAL' THEN jsonb_build_array('PARTIAL_FUNNEL') ELSE '[]'::jsonb END,
        NULLIF(trim(p_notes), ''), auth.uid()
    ) RETURNING * INTO v_snapshot;

    UPDATE public.marketing_metric_import_batches
    SET status = 'COMMITTED', updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND id = v_batch_id;

    RETURN jsonb_build_object('snapshotId', v_snapshot.id, 'importBatchId', v_batch_id,
        'reused', FALSE, 'validationStatus', v_snapshot.validation_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_manual_channel_snapshot(uuid, uuid, date, date, text, bigint, bigint, bigint, bigint, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_manual_channel_snapshot(uuid, uuid, date, date, text, bigint, bigint, bigint, bigint, bigint, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_manual_channel_snapshot(uuid, uuid, date, date, text, bigint, bigint, bigint, bigint, bigint, text) TO authenticated;

-- compute_month_close_snapshot
CREATE OR REPLACE FUNCTION public.compute_month_close_snapshot(p_tenant_id uuid, p_year integer, p_month integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_start DATE := make_date(p_year, p_month, 1);
  v_end DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::date;
  v_sold BIGINT := 0; v_bookings BIGINT := 0; v_available BIGINT := 0; v_downtime BIGINT := 0;
  v_room NUMERIC := 0; v_cleaning_revenue NUMERIC := 0; v_revenue NUMERIC := 0;
  v_ota NUMERIC := 0; v_payment NUMERIC := 0; v_opex NUMERIC := 0; v_capex NUMERIC := 0;
  v_cleaning_cost NUMERIC := 0; v_cleaning_debt NUMERIC := 0; v_total_opex NUMERIC := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND (auth.uid() IS NULL OR NOT public.can_read_ledger(p_tenant_id)) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_TENANT' USING ERRCODE = '42501';
  END IF;
  WITH nights AS (
    SELECT b.id, (b.check_out - b.check_in)::numeric total_nights,
           b.gross_amount, b.cleaning_fee, b.discount, b.ota_commission,
           COALESCE(pc.amount, 0) AS payment_commission
    FROM public.bookings b
    LEFT JOIN public.booking_payment_commissions pc ON pc.booking_id = b.id
    CROSS JOIN LATERAL generate_series(b.check_in, b.check_out - 1, interval '1 day') g(night)
    WHERE b.tenant_id = p_tenant_id AND b.status <> 'CANCELLED'
      AND g.night::date BETWEEN v_start AND v_end
  )
  SELECT COUNT(*), COUNT(DISTINCT id),
         COALESCE(SUM((gross_amount - cleaning_fee - discount) / total_nights),0),
         COALESCE(SUM(cleaning_fee / total_nights),0),
         COALESCE(SUM((gross_amount - discount) / total_nights),0),
         COALESCE(SUM(ota_commission / total_nights),0),
         COALESCE(SUM(payment_commission / total_nights),0)
    INTO v_sold, v_bookings, v_room, v_cleaning_revenue, v_revenue, v_ota, v_payment FROM nights;
  SELECT COALESCE(SUM(e.amount) FILTER (WHERE COALESCE(e.expense_type,'OPEX') <> 'CAPEX'),0),
         COALESCE(SUM(e.amount) FILTER (WHERE e.expense_type = 'CAPEX'),0)
    INTO v_opex, v_capex FROM public.expenses e
    WHERE e.tenant_id = p_tenant_id AND e.expense_date BETWEEN v_start AND v_end;
  SELECT COALESCE(SUM(ct.amount),0),
         COALESCE(SUM(ct.amount) FILTER (WHERE NOT ct.is_paid),0)
    INTO v_cleaning_cost, v_cleaning_debt
    FROM public.cleaning_tasks ct
   WHERE ct.tenant_id = p_tenant_id AND ct.status = 'DONE'
     AND ct.task_date BETWEEN v_start AND v_end
     AND NOT EXISTS (
       SELECT 1 FROM public.expenses e
        WHERE e.tenant_id = ct.tenant_id
          AND e.legacy_id IN ('EXP-CLEAN-' || ct.id::text, 'EXP-CLEAN-' || ct.legacy_id)
     );
  SELECT COALESCE(SUM(GREATEST(0,
    LEAST(v_end, COALESCE(p.deactivated_on, v_end)) - GREATEST(v_start, p.activated_on) + 1
  )),0) INTO v_available FROM public.properties p
  WHERE p.tenant_id = p_tenant_id AND p.activated_on <= v_end
    AND COALESCE(p.deactivated_on, v_end) >= v_start;
  SELECT COUNT(*) INTO v_downtime FROM (
    SELECT DISTINCT m.property_id, d.day::date
    FROM public.maintenance_tickets m
    CROSS JOIN LATERAL generate_series(
      GREATEST(v_start, m.downtime_start), LEAST(v_end, m.downtime_end), interval '1 day'
    ) d(day)
    WHERE m.tenant_id = p_tenant_id AND m.blocks_availability = TRUE
      AND m.downtime_start <= v_end AND m.downtime_end >= v_start
  ) blocked;
  v_available := GREATEST(0, v_available - v_downtime);
  v_total_opex := v_opex + v_ota + v_payment + v_cleaning_cost;
  RETURN jsonb_build_object(
    'schemaVersion',4,'computedBy','server','computedAt',now(),'period',to_char(v_start,'YYYY-MM'),
    'bookingCount',v_bookings,'soldNights',v_sold,'availableNights',v_available,
    'revenue',round(v_revenue,2),'roomRevenue',round(v_room,2),
    'cleaningRevenue',round(v_cleaning_revenue,2),'otaCommission',round(v_ota,2),
    'paymentCommission',round(v_payment,2),
    'cleaningCost',round(v_cleaning_cost,2),'cleaningDebt',round(v_cleaning_debt,2),
    'manualOpex',round(v_opex,2),'capex',round(v_capex,2),
    'totalOpex',round(v_total_opex,2),
    'netProfit',round(v_revenue - v_total_opex - v_capex,2),
    'occupancy',CASE WHEN v_available > 0 THEN round(v_sold::numeric/v_available*100,2) ELSE NULL END,
    'adr',CASE WHEN v_sold > 0 THEN round(v_room/v_sold,2) ELSE NULL END,
    'revpar',CASE WHEN v_available > 0 THEN round(v_room/v_available,2) ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_month_close_snapshot(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_month_close_snapshot(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_month_close_snapshot(uuid, integer, integer) TO authenticated;

-- get_executive_dashboard_snapshot
CREATE OR REPLACE FUNCTION public.get_executive_dashboard_snapshot(p_tenant_id uuid, p_target_month text, p_property_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_start DATE;
  v_end DATE;
  v_revenue NUMERIC := 0;
  v_room_revenue NUMERIC := 0;
  v_cleaning_revenue NUMERIC := 0;
  v_manual_opex NUMERIC := 0;
  v_capex NUMERIC := 0;
  v_ota NUMERIC := 0;
  v_payment NUMERIC := 0;
  v_cleaning_cost NUMERIC := 0;
  v_cleaning_debt NUMERIC := 0;
  v_operating NUMERIC := 0;
  v_sold_nights BIGINT := 0;
  v_available_nights BIGINT := 0;
  v_downtime BIGINT := 0;
  v_open_tasks BIGINT := 0;
  v_critical_tasks BIGINT := 0;
  v_open_alerts BIGINT := 0;
BEGIN
  -- phase53 (L-107): finans ozeti defter okuyucularina (sales ve staff haric)
  IF auth.uid() IS NULL OR NOT public.can_read_ledger(p_tenant_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_TENANT' USING ERRCODE = '42501';
  END IF;
  IF p_target_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'INVALID_TARGET_MONTH' USING ERRCODE = '22007';
  END IF;
  v_start := (p_target_month || '-01')::date;
  v_end := (v_start + INTERVAL '1 month - 1 day')::date;
  IF p_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties WHERE id = p_property_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'INVALID_PROPERTY' USING ERRCODE = '42501';
  END IF;

  WITH nights AS (
    SELECT b.id, b.gross_amount, b.cleaning_fee, b.discount, b.ota_commission,
           COALESCE(pc.amount, 0) AS payment_commission,
           (b.check_out - b.check_in)::numeric AS total_nights
    FROM public.bookings b
    LEFT JOIN public.booking_payment_commissions pc ON pc.booking_id = b.id
    CROSS JOIN LATERAL generate_series(b.check_in, b.check_out - 1, interval '1 day') g(night)
    WHERE b.tenant_id = p_tenant_id AND b.status <> 'CANCELLED'
      AND (p_property_id IS NULL OR b.property_id = p_property_id)
      AND g.night::date BETWEEN v_start AND v_end
  )
  SELECT COUNT(*),
         COALESCE(SUM((gross_amount - discount) / total_nights),0),
         COALESCE(SUM((gross_amount - cleaning_fee - discount) / total_nights),0),
         COALESCE(SUM(cleaning_fee / total_nights),0),
         COALESCE(SUM(ota_commission / total_nights),0),
         COALESCE(SUM(payment_commission / total_nights),0)
    INTO v_sold_nights, v_revenue, v_room_revenue, v_cleaning_revenue, v_ota, v_payment FROM nights;

  SELECT
    COALESCE(SUM(e.amount) FILTER (WHERE COALESCE(e.expense_type, 'OPEX') = 'OPEX'),0),
    COALESCE(SUM(e.amount) FILTER (WHERE e.expense_type = 'CAPEX'),0)
    INTO v_manual_opex, v_capex
  FROM public.expenses e WHERE e.tenant_id = p_tenant_id
    AND e.expense_date BETWEEN v_start AND v_end
    AND (p_property_id IS NULL OR e.property_id = p_property_id);

  SELECT COALESCE(SUM(ct.amount),0),
         COALESCE(SUM(ct.amount) FILTER (WHERE NOT ct.is_paid),0)
    INTO v_cleaning_cost, v_cleaning_debt
    FROM public.cleaning_tasks ct
   WHERE ct.tenant_id = p_tenant_id AND ct.status = 'DONE'
     AND ct.task_date BETWEEN v_start AND v_end
     AND (p_property_id IS NULL OR ct.property_id = p_property_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.expenses e
        WHERE e.tenant_id = ct.tenant_id
          AND e.legacy_id IN ('EXP-CLEAN-' || ct.id::text, 'EXP-CLEAN-' || ct.legacy_id)
     );

  SELECT COALESCE(SUM(GREATEST(0,
    LEAST(v_end, COALESCE(p.deactivated_on, v_end)) - GREATEST(v_start, p.activated_on) + 1
  )),0) INTO v_available_nights
  FROM public.properties p WHERE p.tenant_id = p_tenant_id
    AND (p_property_id IS NULL OR p.id = p_property_id)
    AND p.activated_on <= v_end AND COALESCE(p.deactivated_on, v_end) >= v_start;

  SELECT COUNT(*) INTO v_downtime FROM (
    SELECT DISTINCT m.property_id, d.day::date
    FROM public.maintenance_tickets m
    CROSS JOIN LATERAL generate_series(
      GREATEST(v_start, m.downtime_start), LEAST(v_end, m.downtime_end), interval '1 day'
    ) d(day)
    WHERE m.tenant_id = p_tenant_id AND m.blocks_availability = TRUE
      AND (p_property_id IS NULL OR m.property_id = p_property_id)
      AND m.downtime_start <= v_end AND m.downtime_end >= v_start
  ) blocked;
  v_available_nights := GREATEST(0, v_available_nights - v_downtime);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE priority = 'CRITICAL')
    INTO v_open_tasks, v_critical_tasks FROM public.operational_tasks
    WHERE tenant_id = p_tenant_id AND status IN ('TODO','IN_PROGRESS')
      AND (p_property_id IS NULL OR property_id = p_property_id);
  SELECT COUNT(*) INTO v_open_alerts FROM public.executive_alerts
    WHERE tenant_id = p_tenant_id AND status = 'OPEN'
      AND (p_property_id IS NULL OR property_id = p_property_id);

  v_operating := v_manual_opex + v_ota + v_payment + v_cleaning_cost;

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id, 'target_month', p_target_month, 'property_id', p_property_id,
    'total_revenue', round(v_revenue,2),
    'room_revenue', round(v_room_revenue,2),
    'cleaning_revenue', round(v_cleaning_revenue,2),
    'manual_opex', round(v_manual_opex,2),
    'ota_commission', round(v_ota,2),
    'payment_commission', round(v_payment,2),
    'cleaning_cost', round(v_cleaning_cost,2),
    'cleaning_debt', round(v_cleaning_debt,2),
    'operating_expenses', round(v_operating,2),
    'capex', round(v_capex,2),
    'total_expenses', round(v_operating + v_capex,2),
    'operating_profit', round(v_revenue - v_operating,2),
    'net_profit', round(v_revenue - v_operating - v_capex,2),
    'booked_nights', v_sold_nights, 'available_nights', v_available_nights,
    'occupancy', CASE WHEN v_available_nights > 0 THEN round(v_sold_nights::numeric / v_available_nights * 100,2) ELSE NULL END,
    'open_tasks_count', v_open_tasks, 'critical_tasks_count', v_critical_tasks,
    'open_alerts_count', v_open_alerts
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_executive_dashboard_snapshot(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_executive_dashboard_snapshot(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_executive_dashboard_snapshot(uuid, text, uuid) TO authenticated;

-- create_tenant_invitation
CREATE OR REPLACE FUNCTION public.create_tenant_invitation(p_tenant_id uuid, p_email text, p_role text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_caller_role TEXT;
    v_email       TEXT;
    v_id          UUID;
    v_expires     TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Oturum açılmamış! Lütfen önce giriş yapın.';
    END IF;

    v_caller_role := public.get_tenant_role(p_tenant_id);
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Bu işletmeye üye davet etme yetkiniz yok.';
    END IF;

    IF p_role NOT IN ('admin', 'manager', 'sales', 'staff', 'viewer') THEN
        RAISE EXCEPTION 'Geçersiz rol: %', p_role;
    END IF;

    -- Admin kendinden ustun/esit rol veremez (yetki yukseltme engeli).
    IF v_caller_role = 'admin' AND p_role = 'admin' THEN
        RAISE EXCEPTION 'Yönetici rolünde davet yalnızca işletme sahibi tarafından gönderilebilir.';
    END IF;

    v_email := lower(trim(p_email));
    IF v_email = '' OR position('@' IN v_email) = 0 THEN
        RAISE EXCEPTION 'Geçerli bir e-posta adresi girin.';
    END IF;

    -- Zaten uye mi?
    IF EXISTS (
        SELECT 1 FROM public.tenant_members tm
        JOIN auth.users u ON u.id = tm.user_id
        WHERE tm.tenant_id = p_tenant_id AND lower(u.email) = v_email
    ) THEN
        RAISE EXCEPTION 'Bu e-posta adresi zaten ekibinizde.';
    END IF;

    -- Bekleyen davet varsa rolu/suresi tazelenir, mukerrer satir olusmaz.
    UPDATE public.tenant_invitations
       SET role = p_role,
           invited_by = auth.uid(),
           created_at = NOW(),
           expires_at = NOW() + INTERVAL '14 days'
     WHERE tenant_id = p_tenant_id
       AND lower(email) = v_email
       AND status = 'PENDING'
    RETURNING id, expires_at INTO v_id, v_expires;

    IF v_id IS NULL THEN
        INSERT INTO public.tenant_invitations (tenant_id, email, role, invited_by)
        VALUES (p_tenant_id, v_email, p_role, auth.uid())
        RETURNING id, expires_at INTO v_id, v_expires;
    END IF;

    RETURN json_build_object(
        'invitation_id', v_id,
        'email', v_email,
        'role', p_role,
        'expires_at', v_expires
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_tenant_invitation(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_invitation(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_invitation(uuid, text, text) TO authenticated;

-- get_tenant_members
CREATE OR REPLACE FUNCTION public.get_tenant_members(p_tenant_id uuid)
 RETURNS TABLE(user_id uuid, email text, full_name text, role text, is_self boolean, joined_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NOT public.is_tenant_member(p_tenant_id) THEN
        RAISE EXCEPTION 'Bu işletmenin ekibini görüntüleme yetkiniz yok.';
    END IF;

    RETURN QUERY
    SELECT tm.user_id,
           u.email::TEXT,
           COALESCE(p.full_name, split_part(u.email, '@', 1))::TEXT,
           tm.role::TEXT,
           (tm.user_id = auth.uid()),
           tm.created_at
    FROM public.tenant_members tm
    JOIN auth.users u ON u.id = tm.user_id
    LEFT JOIN public.profiles p ON p.id = tm.user_id
    WHERE tm.tenant_id = p_tenant_id
    ORDER BY
        CASE tm.role
            WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3
            WHEN 'sales' THEN 4 WHEN 'staff' THEN 5 ELSE 6
        END,
        tm.created_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_tenant_members(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_members(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_members(uuid) TO authenticated;

-- accept_booking_quote_atomic
CREATE OR REPLACE FUNCTION public.accept_booking_quote_atomic(p_tenant_id uuid, p_quote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_quote public.booking_quotes%ROWTYPE;
    v_conflict_count INT;
    v_booking_id UUID;
    v_booking_code VARCHAR;
    v_prop public.properties%ROWTYPE;
BEGIN
    -- phase53: govdede hic yetki kontrolu yoktu (yalniz phase44 tablo
    -- tetikleyicisi koruyordu). Yetki, kayit aramadan ONCE (CLAUDE.md §7).
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    IF NOT public.can_write_sales(p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Teklif kabul etme yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.accept_booking_quote_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_booking_quote_atomic(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_booking_quote_atomic(uuid, uuid) TO authenticated;

-- save_manual_pricing_override_atomic
CREATE OR REPLACE FUNCTION public.save_manual_pricing_override_atomic(p_tenant_id uuid, p_property_id uuid, p_start_date date, p_end_date date, p_rate_override numeric, p_reason text, p_bypass_guardrail boolean DEFAULT false, p_min_stay_override integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role VARCHAR;
    v_profile public.pricing_profiles%ROWTYPE;
    v_new_override_id UUID;
    v_source VARCHAR;
    v_curr_date DATE;
    v_old_rate NUMERIC;
BEGIN
    -- phase53: bypass istenmediginde govdede kiraci/rol kontrolu yoktu
    -- (yalniz phase44 tablo tetikleyicisi koruyordu). Yetki ONCE.
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    IF NOT public.can_manage_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Fiyat degistirme yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.save_manual_pricing_override_atomic(uuid, uuid, date, date, numeric, text, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_manual_pricing_override_atomic(uuid, uuid, date, date, numeric, text, boolean, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_manual_pricing_override_atomic(uuid, uuid, date, date, numeric, text, boolean, integer) TO authenticated;

-- guard_pricing_write_authorization
CREATE OR REPLACE FUNCTION public.guard_pricing_write_authorization()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  v_role TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED_PRICING_WRITE' USING ERRCODE = '28000';
  END IF;
  v_role := public.get_tenant_role(v_tenant_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'UNAUTHORIZED_PRICING_WRITE' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_pricing_write_authorization() FROM PUBLIC, anon;

-- -----------------------------------------------------------------------------
-- 8. Dogrulama — basarisizsa islem geri alinir
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_bad TEXT;
    v_def TEXT;
    v_fn  TEXT;
BEGIN
    -- 8.1 Rol kisitlari sales'i kabul ediyor
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_members_role_check'
                   AND conrelid = 'public.tenant_members'::regclass
                   AND pg_get_constraintdef(oid) LIKE '%''sales''%') THEN
        RAISE EXCEPTION 'PHASE53_MEMBER_ROLE_CHECK_MISSING_SALES';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_invitations_role_check'
                   AND conrelid = 'public.tenant_invitations'::regclass
                   AND pg_get_constraintdef(oid) LIKE '%''sales''%') THEN
        RAISE EXCEPTION 'PHASE53_INVITATION_ROLE_CHECK_MISSING_SALES';
    END IF;

    -- 8.2 Hassas tablolarda uyelikle (rol ayirmadan) okuma kalmadi
    SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_bad
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('SELECT', 'ALL')
      AND tablename IN (
        'bookings', 'booking_payment_commissions', 'expenses', 'financial_transactions',
        'finance_import_batches', 'finance_import_batch_rows', 'monthly_financial_closes',
        'monthly_targets', 'executive_alerts', 'cleaning_tasks', 'leads', 'guests',
        'guest_consent_events', 'extension_offers', 'scheduled_messages', 'message_delivery_logs',
        'properties', 'property_guest_settings', 'property_pricing_ladder', 'tenant_booking_channels',
        'marketing_campaigns', 'influencer_collabs', 'marketing_findings',
        'marketing_metric_import_batches', 'channel_performance_snapshots',
        'operational_tasks', 'maintenance_tickets', 'operation_evidence', 'user_notifications',
        'pricing_profiles', 'pricing_rules', 'pricing_events', 'pricing_overrides',
        'daily_rates', 'rate_change_logs', 'booking_quotes'
      )
      AND NOT (
            qual LIKE '%can_read_ledger%' OR qual LIKE '%can_read_sales%'
         OR qual LIKE '%can_manage_tenant%' OR qual LIKE '%can_write_sales%'
         OR (qual ~ 'get_tenant_role' AND qual !~ '''staff''' AND qual !~ 'IS NOT NULL')
      );
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE53_MEMBER_WIDE_READ_REMAINS: %', v_bad;
    END IF;

    -- 8.3 Hicbir politika staff'a yazma/okuma vermiyor (phase31 satis
    --     hazirligi durumu bilerek haric: finansal degil, staff yazar)
    SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_bad
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename <> 'housekeeping_status_overrides'
      AND (COALESCE(qual, '') LIKE '%''staff''%' OR COALESCE(with_check, '') LIKE '%''staff''%')
      AND tablename <> 'tenant_members';
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE53_STAFF_POLICY_REMAINS: %', v_bad;
    END IF;

    -- 8.4 Rezervasyon RPC'leri staff'i degil sales'i kabul ediyor
    FOREACH v_fn IN ARRAY ARRAY[
        'create_booking_atomic', 'update_booking_atomic', 'convert_lead_to_booking_atomic',
        'upsert_booking_guest_atomic', 'accept_extension_offer_atomic'
    ] LOOP
        SELECT pg_get_functiondef(p.oid) INTO v_def
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_fn;
        IF v_def LIKE '%''staff''%' OR v_def NOT LIKE '%''sales''%' THEN
            RAISE EXCEPTION 'PHASE53_BOOKING_RPC_ROLE: %', v_fn;
        END IF;
    END LOOP;
    FOREACH v_fn IN ARRAY ARRAY['resolve_maintenance_ticket_atomic', 'record_manual_channel_snapshot'] LOOP
        SELECT pg_get_functiondef(p.oid) INTO v_def
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_fn;
        IF v_def LIKE '%''staff''%' THEN
            RAISE EXCEPTION 'PHASE53_MANAGER_RPC_STILL_STAFF: %', v_fn;
        END IF;
    END LOOP;

    -- 8.5 Finans ozetleri defter okuyucularina
    FOREACH v_fn IN ARRAY ARRAY['compute_month_close_snapshot', 'get_executive_dashboard_snapshot'] LOOP
        SELECT pg_get_functiondef(p.oid) INTO v_def
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_fn;
        IF v_def NOT LIKE '%can_read_ledger(p_tenant_id)%' OR v_def LIKE '%is_tenant_member(p_tenant_id)%' THEN
            RAISE EXCEPTION 'PHASE53_SNAPSHOT_GATE: %', v_fn;
        END IF;
    END LOOP;

    -- 8.6 phase11 RPC'lerinde yetki kayit aramadan ONCE
    v_def := pg_get_functiondef('public.accept_booking_quote_atomic(uuid,uuid)'::regprocedure);
    IF strpos(v_def, 'can_write_sales') = 0
       OR strpos(v_def, 'can_write_sales') > strpos(v_def, 'FROM public.booking_quotes') THEN
        RAISE EXCEPTION 'PHASE53_QUOTE_AUTHZ_ORDER';
    END IF;
    v_def := pg_get_functiondef('public.save_manual_pricing_override_atomic(uuid,uuid,date,date,numeric,text,boolean,integer)'::regprocedure);
    IF strpos(v_def, 'can_manage_tenant') = 0
       OR strpos(v_def, 'can_manage_tenant') > strpos(v_def, 'FROM public.tenant_members') THEN
        RAISE EXCEPTION 'PHASE53_PRICING_OVERRIDE_AUTHZ_ORDER';
    END IF;

    -- 8.7 anon hicbir yeni/yeniden tanimli fonksiyonu calistiramaz
    SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'fn_has_tenant_role', 'can_manage_tenant', 'can_read_ledger', 'can_read_sales', 'can_write_sales',
        'create_booking_atomic', 'update_booking_atomic', 'convert_lead_to_booking_atomic',
        'upsert_booking_guest_atomic', 'accept_extension_offer_atomic', 'resolve_maintenance_ticket_atomic',
        'record_manual_channel_snapshot', 'compute_month_close_snapshot', 'get_executive_dashboard_snapshot',
        'create_tenant_invitation', 'get_tenant_members', 'accept_booking_quote_atomic',
        'save_manual_pricing_override_atomic', 'guard_pricing_write_authorization')
      AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE53_ANON_EXECUTE_OPEN: %', v_bad;
    END IF;

    RAISE NOTICE 'PHASE 53 OK — staff saha rolune indirildi, sales rolu eklendi.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (53, 'phase53_staff_data_boundary')
ON CONFLICT (version) DO NOTHING;

COMMIT;
