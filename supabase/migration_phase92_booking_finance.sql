-- Optional reservation finance. No historical row is backfilled.
-- Client only selects the new RPC when optional finance is used.
BEGIN;
ALTER TABLE public.bookings ADD COLUMN financial_details JSONB;

CREATE OR REPLACE FUNCTION public.finance_amount(p_value JSONB)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE n NUMERIC;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb OR p_value #>> '{}' = '' THEN
    RAISE EXCEPTION 'FINANCE_AMOUNT_REQUIRED';
  END IF;
  n := (p_value #>> '{}')::numeric;
  IF n < 0 OR n > 99999999.99 OR n::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_FINANCE_AMOUNT'; END IF;
  RETURN round(n,2);
END $$;
REVOKE ALL ON FUNCTION public.finance_amount(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finance_amount(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.finance_amount(JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.compute_booking_finance(p JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  t JSONB := p->'tax'; pr JSONB; q JSONB; e JSONB; k TEXT; mode TEXT;
  gross NUMERIC := public.finance_amount(p->'amount') - public.finance_amount(COALESCE(p->'discount','0'));
  cleaning NUMERIC := public.finance_amount(COALESCE(p->'cleanFee','0'));
  room NUMERIC := gross - cleaning; v NUMERIC := 0; a NUMERIC := 0; ct NUMERIC := 0;
  rv NUMERIC; ra NUMERIC; cv NUMERIC; ca NUMERIC; vr NUMERIC; ar NUMERIC;
  total NUMERIC; collected NUMERIC; liability NUMERIC; pc NUMERIC := 0; bl NUMERIC := 0; cash NUMERIC := 0;
  ota NUMERIC := public.finance_amount(COALESCE(p->'commission','0'));
  pos NUMERIC := public.finance_amount(COALESCE(p->'paymentCommission','0'));
  cost NUMERIC; extras NUMERIC := 0; ids TEXT[] := '{}'; d DATE;
BEGIN
  IF room < 0 THEN RAISE EXCEPTION 'INVALID_ROOM_BASE'; END IF;
  IF COALESCE((t->>'enabled')::boolean,false) THEN
    mode := t->>'mode';
    IF mode = 'manual' THEN
      v := public.finance_amount(t#>'{vat,amount}'); a := public.finance_amount(t#>'{accommodation,amount}');
      cv := public.finance_amount(t#>'{vat,cleaningAmount}'); ca := public.finance_amount(t#>'{accommodation,cleaningAmount}');
      IF cv > v OR ca > a THEN RAISE EXCEPTION 'INVALID_CLEANING_TAX'; END IF;
      ct := cv + ca; cleaning := cleaning - ct; room := room - v - a + ct;
    ELSIF mode IN ('inclusive','exclusive') THEN
      pr := t->'profile';
      IF COALESCE(pr->>'dateBasis','') NOT IN ('checkIn','checkOut','invoiceDate') THEN RAISE EXCEPTION 'TAX_DATE_BASIS_REQUIRED'; END IF;
      d := (p->>(pr->>'dateBasis'))::date;
      IF d IS NULL OR pr->>'validFrom' IS NULL OR pr->>'validTo' IS NULL OR d < (pr->>'validFrom')::date OR d > (pr->>'validTo')::date THEN RAISE EXCEPTION 'TAX_PROFILE_DATE_MISMATCH'; END IF;
      FOREACH k IN ARRAY ARRAY['vat','accommodation'] LOOP
        q := pr->k;
        IF jsonb_typeof(q->'room') IS DISTINCT FROM 'boolean' OR jsonb_typeof(q->'cleaning') IS DISTINCT FROM 'boolean' OR jsonb_typeof(q->'includesOther') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'TAX_BASE_REQUIRED'; END IF;
      END LOOP;
      vr := public.finance_amount(pr#>'{vat,rate}') / 100; ar := public.finance_amount(pr#>'{accommodation,rate}') / 100;
      IF vr > 1 OR ar > 1 OR ((pr#>>'{vat,includesOther}')::boolean AND (pr#>>'{accommodation,includesOther}')::boolean) THEN RAISE EXCEPTION 'INVALID_TAX_PROFILE'; END IF;
      rv := CASE WHEN (pr#>>'{vat,room}')::boolean THEN vr ELSE 0 END;
      cv := CASE WHEN (pr#>>'{vat,cleaning}')::boolean THEN vr ELSE 0 END;
      ra := CASE WHEN (pr#>>'{accommodation,room}')::boolean THEN ar ELSE 0 END;
      ca := CASE WHEN (pr#>>'{accommodation,cleaning}')::boolean THEN ar ELSE 0 END;
      IF (pr#>>'{vat,includesOther}')::boolean THEN rv := rv + ra*vr; cv := cv + ca*vr; END IF;
      IF (pr#>>'{accommodation,includesOther}')::boolean THEN ra := ra + rv*ar; ca := ca + cv*ar; END IF;
      IF mode = 'inclusive' THEN room := room/(1+rv+ra); cleaning := cleaning/(1+cv+ca); END IF;
      ct := round(cleaning*cv,2)+round(cleaning*ca,2);
      v := round(room*rv,2)+round(cleaning*cv,2); a := round(room*ra,2)+round(cleaning*ca,2);
      IF mode = 'exclusive' THEN gross := gross+v+a; END IF;
      cleaning := public.finance_amount(COALESCE(p->'cleanFee','0')) - CASE WHEN mode = 'inclusive' THEN ct ELSE 0 END;
      room := gross-v-a-cleaning;
    ELSE RAISE EXCEPTION 'TAX_MODE_REQUIRED'; END IF;
    FOREACH k IN ARRAY ARRAY['vat','accommodation'] LOOP
      total := CASE WHEN k='vat' THEN v ELSE a END;
      IF total = 0 THEN CONTINUE; END IF;
      q := t->k;
      collected := CASE q->>'platformCollected' WHEN 'all' THEN total WHEN 'none' THEN 0 ELSE public.finance_amount(q->'platformCollected') END;
      liability := CASE q->>'businessLiability' WHEN 'all' THEN total WHEN 'none' THEN 0 ELSE public.finance_amount(q->'businessLiability') END;
      IF collected > total OR liability > total THEN RAISE EXCEPTION 'TAX_SHARE_EXCEEDS_TOTAL'; END IF;
      pc := pc+collected; bl := bl+liability; cash := cash+greatest(0,liability-collected);
    END LOOP;
  END IF;
  IF room < 0 OR cleaning < 0 THEN RAISE EXCEPTION 'TAX_EXCEEDS_REVENUE'; END IF;
  IF p->>'cleanCost' IS NOT NULL AND p->>'cleanCost' <> '' THEN cost := public.finance_amount(p->'cleanCost'); END IF;
  IF jsonb_typeof(COALESCE(p->'extras','[]')) <> 'array' OR jsonb_array_length(COALESCE(p->'extras','[]')) > 50 THEN RAISE EXCEPTION 'INVALID_EXTRA_EXPENSES'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(COALESCE(p->'extras','[]')) LOOP
    IF COALESCE(e->>'id','') !~ '^[a-zA-Z0-9-]{1,36}$' OR e->>'id'=ANY(ids) OR length(trim(COALESCE(e->>'name',''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_EXTRA_EXPENSE'; END IF;
    ids := array_append(ids,e->>'id'); extras := extras+public.finance_amount(e->'amount');
  END LOOP;
  RETURN jsonb_build_object('gross',gross,'vat',v,'accommodation',a,'taxTotal',v+a,'cleaningTax',ct,
    'cleaningRevenue',cleaning,'netRoomRevenue',room,'adr',CASE WHEN (p->>'nights')::numeric > 0 THEN round(room/(p->>'nights')::numeric,2) ELSE NULL END,
    'platformTax',pc,'businessLiability',bl,'businessTaxCash',cash,'commission',ota,'paymentCommission',pos,
    'cleanCost',cost,'otherExpenses',extras,'afterCommission',gross-ota-pos,'afterTax',gross-ota-pos-pc-cash,
    'afterCleaning',gross-ota-pos-pc-cash-COALESCE(cost,0),'remaining',gross-ota-pos-pc-cash-COALESCE(cost,0)-extras);
END $$;
REVOKE ALL ON FUNCTION public.compute_booking_finance(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_booking_finance(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_booking_finance(JSONB) TO authenticated, service_role;

-- Validate final transaction state, including writes through older clients/imports.
CREATE OR REPLACE FUNCTION public.guard_booking_financial_details()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.bookings; r JSONB; p JSONB;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id=NEW.id;
  IF NOT FOUND OR b.financial_details IS NULL THEN RETURN NULL; END IF;
  p := b.financial_details->'input'; r := public.compute_booking_finance(p);
  IF b.financial_details->'result' IS DISTINCT FROM r
    OR b.gross_amount-b.discount <> (r->>'gross')::numeric
    OR b.cleaning_fee <> (r->>'cleaningRevenue')::numeric+(r->>'cleaningTax')::numeric
    OR b.ota_commission <> (r->>'commission')::numeric
    OR b.discount <> (p->>'discount')::numeric
    OR b.check_in::text IS DISTINCT FROM p->>'checkIn' OR b.check_out::text IS DISTINCT FROM p->>'checkOut'
    OR b.check_out-b.check_in <> (p->>'nights')::int THEN RAISE EXCEPTION 'FINANCE_SNAPSHOT_MISMATCH: Rezervasyon finans formundan güncellenmeli.'; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.guard_booking_financial_details() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_booking_financial_details() FROM anon;
CREATE CONSTRAINT TRIGGER trg_booking_finance_consistency AFTER INSERT OR UPDATE ON public.bookings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_booking_financial_details();

CREATE OR REPLACE FUNCTION public.guard_booking_finance_period()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.financial_details IS DISTINCT FROM OLD.financial_details
    AND NOT public.fn_tenant_reset_in_progress()
    AND public.fn_range_touches_closed_period(OLD.tenant_id,OLD.check_in,OLD.check_out-1) THEN
    RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_booking_finance_period() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_booking_finance_period() FROM anon;
CREATE TRIGGER trg_booking_finance_period BEFORE UPDATE OF financial_details ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_finance_period();

CREATE OR REPLACE FUNCTION public.save_booking_finance(p_booking JSONB, p_input JSONB, p_booking_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tid UUID := (p_booking->>'tenant_id')::uuid; r JSONB; saved JSONB; bid UUID; ex public.expenses; item JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write_sales(tid) THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_booking_id IS NOT NULL THEN
    PERFORM 1 FROM public.bookings WHERE id=p_booking_id AND tenant_id=tid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
    -- Posted expense rows are the financial ledger's source of truth.
    FOR ex IN SELECT * FROM public.expenses WHERE tenant_id=tid AND booking_id=p_booking_id AND legacy_id LIKE 'BF:%' LOOP
      SELECT value INTO item FROM jsonb_array_elements(p_input->'extras') WHERE 'BF:'||p_booking_id::text||':'||(value->>'id')=ex.legacy_id;
      IF item IS NULL OR (item->>'amount')::numeric <> ex.amount THEN RAISE EXCEPTION 'POSTED_EXPENSE_CHANGED: Aktarılan gideri gider defterinden düzenleyin.'; END IF;
    END LOOP;
  END IF;
  r := public.compute_booking_finance(p_input);
  IF p_booking_id IS NULL THEN
    saved := public.create_booking_atomic(tid,(p_booking->>'property_id')::uuid,p_booking->>'booking_code',p_booking->>'guest_name',p_booking->>'guest_phone',p_booking->>'channel',
      (p_input->>'checkIn')::date,(p_input->>'checkOut')::date,(p_booking->>'pax')::int,
      (r->>'gross')::numeric+(p_input->>'discount')::numeric,(r->>'commission')::numeric,(r->>'cleaningRevenue')::numeric+(r->>'cleaningTax')::numeric,
      (p_input->>'discount')::numeric,(r->>'netRoomRevenue')::numeric,p_booking->>'status',p_booking->>'notes');
  ELSE
    saved := public.update_booking_atomic(p_booking_id,tid,(p_booking->>'property_id')::uuid,p_booking->>'guest_name',p_booking->>'guest_phone',p_booking->>'channel',
      (p_input->>'checkIn')::date,(p_input->>'checkOut')::date,(p_booking->>'pax')::int,
      (r->>'gross')::numeric+(p_input->>'discount')::numeric,(r->>'commission')::numeric,(r->>'cleaningRevenue')::numeric+(r->>'cleaningTax')::numeric,
      (p_input->>'discount')::numeric,(r->>'netRoomRevenue')::numeric,p_booking->>'status',p_booking->>'notes');
  END IF;
  bid := (saved->>'id')::uuid;
  UPDATE public.bookings SET financial_details=jsonb_build_object('version',1,'input',p_input,'result',r) WHERE id=bid AND tenant_id=tid;
  IF (r->>'paymentCommission')::numeric > 0 THEN
    INSERT INTO public.booking_payment_commissions(booking_id,tenant_id,amount) VALUES(bid,tid,(r->>'paymentCommission')::numeric)
      ON CONFLICT(booking_id) DO UPDATE SET amount=excluded.amount;
  ELSE DELETE FROM public.booking_payment_commissions WHERE booking_id=bid AND tenant_id=tid; END IF;
  SELECT to_jsonb(b) INTO saved FROM public.bookings b WHERE id=bid;
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.save_booking_finance(JSONB,JSONB,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_booking_finance(JSONB,JSONB,UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_booking_finance(JSONB,JSONB,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_booking_extra_expenses(p_booking_id UUID,p_tenant_id UUID,p_date DATE)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE b public.bookings; e JSONB; inserted INT; total INT := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_tenant(p_tenant_id) THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND OR b.financial_details IS NULL THEN RAISE EXCEPTION 'BOOKING_FINANCE_NOT_FOUND'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'EXPENSE_DATE_REQUIRED'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(b.financial_details#>'{input,extras}') LOOP
    IF (e->>'amount')::numeric = 0 THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.expenses WHERE tenant_id=p_tenant_id AND legacy_id='BF:'||p_booking_id::text||':'||(e->>'id')) THEN CONTINUE; END IF;
    INSERT INTO public.expenses(tenant_id,property_id,booking_id,expense_date,category,amount,description,expense_type,legacy_id,created_by)
      VALUES(p_tenant_id,b.property_id,b.id,p_date,'Diğer',(e->>'amount')::numeric,e->>'name','OPEX','BF:'||b.id::text||':'||(e->>'id'),auth.uid())
      ON CONFLICT(tenant_id,legacy_id) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT; total := total+inserted;
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.post_booking_extra_expenses(UUID,UUID,DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_booking_extra_expenses(UUID,UUID,DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_booking_extra_expenses(UUID,UUID,DATE) TO authenticated;

-- Preserve the latest role/capacity logic; change only the two revenue projections.
DO $reports$
DECLARE signature TEXT; body TEXT;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.compute_month_close_snapshot(uuid,integer,integer)','public.get_executive_dashboard_snapshot(uuid,text,uuid)'] LOOP
    body := pg_get_functiondef(signature::regprocedure);
    IF strpos(body,'b.gross_amount, b.cleaning_fee')=0 THEN RAISE EXCEPTION 'PHASE92_REPORT_PROJECTION_CHANGED: %',signature; END IF;
    body := replace(body,'b.gross_amount, b.cleaning_fee',
      '(b.gross_amount - COALESCE((b.financial_details #>> ''{result,taxTotal}'')::numeric,0)) AS gross_amount, (b.cleaning_fee - COALESCE((b.financial_details #>> ''{result,cleaningTax}'')::numeric,0)) AS cleaning_fee');
    EXECUTE body;
  END LOOP;
END $reports$;

INSERT INTO public.schema_migrations(version,name) VALUES(92,'phase92_booking_finance');
DO $verify$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='financial_details')
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_booking_finance_consistency')
    OR has_function_privilege('anon','public.save_booking_finance(jsonb,jsonb,uuid)','EXECUTE')
    OR strpos(pg_get_functiondef('public.compute_month_close_snapshot(uuid,integer,integer)'::regprocedure),'result,taxTotal')=0 THEN
    RAISE EXCEPTION 'PHASE92_VERIFICATION_FAILED';
  END IF;
END $verify$;
COMMIT;
