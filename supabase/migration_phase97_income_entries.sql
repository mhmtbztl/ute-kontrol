-- Lexbnb phase97 — elle girilen gelir ve sermaye defteri (kullanici, 19.10.2026).
--
-- Finans ekraninda gider eklenebiliyordu, gelir eklenemiyordu: rezervasyon
-- disindaki para girisi (transfer ucreti, hasar bedeli, erken giris) hicbir
-- yere yazilamiyordu. Iki tur:
--
--   OTHER_INCOME  diger gelir. Toplam Gelir'e ve kara girer; "ciro"ya
--                 (net oda geliri) GIRMEZ — ADR/RevPAR ve hedef bozulmaz
--                 (kullanici karari: ciroya degil, toplam gelire).
--   CAPITAL       sermaye / ortak girisi, nakit dengeleme. Gelir DEGILDIR,
--                 ozkaynaktir: kara girmez, ayri "sermaye girisi" olarak
--                 raporlanir. Kara katmak kari sisirirdi.
--
-- Kayit gider gibi bir mulke ya da portfoy geneline (property_id NULL) yazilir.
-- Gider tablosuna yeni tur eklenmedi, bilerek: expenses'e bagli her toplam
-- (kategori dagilimi, gider orani, OPEX) gelirin isaretini ters okurdu.
-- bookings/expenses'e sutun eklenmedi (CLAUDE.md 3.4 dagitim sirasi tuzagi):
-- goc uygulanana kadar yalniz gelir defteri calismaz, istemci bunu soyler.
--
-- Defter sozlesmesi (K-04 eki): Toplam Gelir = Net Oda Geliri + Temizlik
-- Geliri + Diger Gelir. Istemcide core/ledger_contract.js, sunucuda asagidaki
-- iki anlik goruntu — ayni formul. Ay kapanisinda 'revenue' rezervasyon
-- gelirinin anlami ile kalir (istemci karsilastirmasi onu olcer); diger gelir
-- 'otherIncome', toplam 'totalIncome' olarak ayrica tasinir.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tablo
-- -----------------------------------------------------------------------------
CREATE TABLE public.income_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
    income_type TEXT NOT NULL CHECK (income_type IN ('OTHER_INCOME', 'CAPITAL')),
    income_date DATE NOT NULL,
    amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL CHECK (btrim(description) <> ''),
    created_by  UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX income_entries_tenant_date_idx ON public.income_entries(tenant_id, income_date DESC);
CREATE INDEX income_entries_property_idx ON public.income_entries(property_id);

-- -----------------------------------------------------------------------------
-- 2. Tetikleyiciler: kiraci degismezligi, mulk ayni kiracida, damgalar
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_income_entry_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.property_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.properties p WHERE p.id = NEW.property_id AND p.tenant_id = NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'CROSS_TENANT_PROPERTY: Mulk bu isletmeye ait degil.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_income_entry_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_income_entry_tenant() FROM anon;

CREATE TRIGGER income_entry_tenant_guard
    BEFORE INSERT OR UPDATE ON public.income_entries
    FOR EACH ROW EXECUTE FUNCTION public.guard_income_entry_tenant();

DROP TRIGGER IF EXISTS trg_tenant_id_immutable ON public.income_entries;
CREATE TRIGGER trg_tenant_id_immutable
    BEFORE UPDATE OF tenant_id ON public.income_entries
    FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();

CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON public.income_entries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_guard_created_by
    BEFORE INSERT OR UPDATE OF created_by ON public.income_entries
    FOR EACH ROW EXECUTE FUNCTION public.guard_created_by();

-- -----------------------------------------------------------------------------
-- 3. Kapanmis donem: gider korumasiyla ayni kural (eski VE yeni tarih).
--    Sifirlama ve isletme silme istisnasi (CLAUDE.md 3.7, 7).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_income_closed_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF public.fn_tenant_reset_in_progress() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'created_by') = (to_jsonb(OLD) - 'created_by') THEN
        RETURN NEW;
    END IF;

    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF public.fn_range_touches_closed_period(OLD.tenant_id, OLD.income_date, OLD.income_date) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu gelir kapatilmis bir doneme (%) ait. Degistirilemez veya silinemez.',
                to_char(OLD.income_date, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF public.fn_range_touches_closed_period(NEW.tenant_id, NEW.income_date, NEW.income_date) THEN
            RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu donem (%) kapatilmistir. Gelir ekleme veya buraya tasima yapilamaz.',
                to_char(NEW.income_date, 'YYYY-MM')
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_income_closed_period() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_income_closed_period() FROM anon;

CREATE TRIGGER trg_guard_income_closed_period
    BEFORE INSERT OR UPDATE OR DELETE ON public.income_entries
    FOR EACH ROW EXECUTE FUNCTION public.guard_income_closed_period();

-- -----------------------------------------------------------------------------
-- 4. Yetki: gider defteriyle ayni sozlesme (3.3.1) — okuma can_read_ledger,
--    yazma can_manage_tenant. anon hicbir sey yapamaz.
-- -----------------------------------------------------------------------------
ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.income_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.income_entries TO authenticated;

CREATE POLICY income_entries_select ON public.income_entries FOR SELECT TO authenticated
    USING (public.can_read_ledger(tenant_id));
CREATE POLICY income_entries_insert ON public.income_entries FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY income_entries_update ON public.income_entries FOR UPDATE TO authenticated
    USING (public.can_manage_tenant(tenant_id)) WITH CHECK (public.can_manage_tenant(tenant_id));
CREATE POLICY income_entries_delete ON public.income_entries FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

-- -----------------------------------------------------------------------------
-- 5. Ay kapanisi anlik goruntusu (phase53 govdesi + diger gelir)
-- -----------------------------------------------------------------------------
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
  v_other_income NUMERIC := 0; v_capital_in NUMERIC := 0;
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
  -- phase97: elle girilen diger gelir Toplam Gelir'e girer; sermaye girmez.
  SELECT COALESCE(SUM(i.amount) FILTER (WHERE i.income_type = 'OTHER_INCOME'),0),
         COALESCE(SUM(i.amount) FILTER (WHERE i.income_type = 'CAPITAL'),0)
    INTO v_other_income, v_capital_in FROM public.income_entries i
   WHERE i.tenant_id = p_tenant_id AND i.income_date BETWEEN v_start AND v_end;
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
    'schemaVersion',5,'computedBy','server','computedAt',now(),'period',to_char(v_start,'YYYY-MM'),
    'bookingCount',v_bookings,'soldNights',v_sold,'availableNights',v_available,
    'revenue',round(v_revenue,2),'roomRevenue',round(v_room,2),
    'cleaningRevenue',round(v_cleaning_revenue,2),'otaCommission',round(v_ota,2),
    'otherIncome',round(v_other_income,2),'capitalIn',round(v_capital_in,2),
    'totalIncome',round(v_revenue + v_other_income,2),
    'paymentCommission',round(v_payment,2),
    'cleaningCost',round(v_cleaning_cost,2),'cleaningDebt',round(v_cleaning_debt,2),
    'manualOpex',round(v_opex,2),'capex',round(v_capex,2),
    'totalOpex',round(v_total_opex,2),
    'netProfit',round(v_revenue + v_other_income - v_total_opex - v_capex,2),
    'occupancy',CASE WHEN v_available > 0 THEN round(v_sold::numeric/v_available*100,2) ELSE NULL END,
    'adr',CASE WHEN v_sold > 0 THEN round(v_room/v_sold,2) ELSE NULL END,
    'revpar',CASE WHEN v_available > 0 THEN round(v_room/v_available,2) ELSE NULL END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.compute_month_close_snapshot(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_month_close_snapshot(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_month_close_snapshot(uuid, integer, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Yonetici anlik goruntusu (phase53 govdesi + diger gelir)
-- -----------------------------------------------------------------------------
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
  v_other_income NUMERIC := 0;
  v_capital_in NUMERIC := 0;
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

  -- phase97: diger gelir toplam gelire (kar tabani) girer, ciroya (room_revenue) girmez.
  SELECT COALESCE(SUM(i.amount) FILTER (WHERE i.income_type = 'OTHER_INCOME'),0),
         COALESCE(SUM(i.amount) FILTER (WHERE i.income_type = 'CAPITAL'),0)
    INTO v_other_income, v_capital_in FROM public.income_entries i
   WHERE i.tenant_id = p_tenant_id AND i.income_date BETWEEN v_start AND v_end
     AND (p_property_id IS NULL OR i.property_id = p_property_id);
  v_revenue := v_revenue + v_other_income;

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
    'other_income', round(v_other_income,2),
    'capital_in', round(v_capital_in,2),
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

-- -----------------------------------------------------------------------------
-- 7. Isletme sifirlama (phase78 govdesi + income_entries)
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
-- 8. Dogrulama
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_def TEXT;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.income_entries'::regclass) THEN
        RAISE EXCEPTION 'PHASE97_RLS_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.income_entries'::regclass
                    AND tgname = 'trg_tenant_id_immutable' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE97_TENANT_ID_TRIGGER_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.income_entries'::regclass
                    AND tgname = 'trg_guard_income_closed_period' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE97_CLOSED_PERIOD_GUARD_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.income_entries'::regclass
                    AND tgname = 'income_entry_tenant_guard' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE97_TENANT_GUARD_MISSING';
    END IF;
    IF has_table_privilege('anon', 'public.income_entries', 'SELECT')
       OR has_table_privilege('anon', 'public.income_entries', 'INSERT') THEN
        RAISE EXCEPTION 'PHASE97_ANON_PRIVILEGE';
    END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'income_entries') <> 4
       OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'income_entries'
                   AND COALESCE(qual, '') || COALESCE(with_check, '') NOT LIKE '%can_%') THEN
        RAISE EXCEPTION 'PHASE97_POLICY_CONTRACT';
    END IF;

    v_def := pg_get_functiondef('public.compute_month_close_snapshot(uuid, integer, integer)'::regprocedure);
    IF position('income_entries' IN v_def) = 0 OR position('v_revenue + v_other_income - v_total_opex' IN v_def) = 0 THEN
        RAISE EXCEPTION 'PHASE97_CLOSE_SNAPSHOT_FORMULA';
    END IF;
    v_def := pg_get_functiondef('public.get_executive_dashboard_snapshot(uuid, text, uuid)'::regprocedure);
    IF position('income_entries' IN v_def) = 0 OR position('v_revenue := v_revenue + v_other_income' IN v_def) = 0 THEN
        RAISE EXCEPTION 'PHASE97_DASHBOARD_SNAPSHOT_FORMULA';
    END IF;
    v_def := pg_get_functiondef('public.reset_tenant_data(uuid, text)'::regprocedure);
    IF position('''income_entries''' IN v_def) = 0 THEN
        RAISE EXCEPTION 'PHASE97_RESET_LIST';
    END IF;
    IF has_function_privilege('anon', 'public.get_executive_dashboard_snapshot(uuid, text, uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.compute_month_close_snapshot(uuid, integer, integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.reset_tenant_data(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE97_ANON_FUNCTION_PRIVILEGE';
    END IF;

    RAISE NOTICE 'PHASE 97 OK — gelir ve sermaye defteri.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (97, 'phase97_income_entries')
ON CONFLICT (version) DO NOTHING;

COMMIT;
