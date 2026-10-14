-- Phase92 is immutable (already applied to the isolated test project).
-- Tax is never disposable income merely because another party is liable.
BEGIN;
DO $patch$
DECLARE body TEXT;
BEGIN
  body := pg_get_functiondef('public.compute_booking_finance(jsonb)'::regprocedure);
  IF strpos(body,'cash := cash+greatest(0,liability-collected)')=0 THEN
    RAISE EXCEPTION 'PHASE94_CALCULATOR_CHANGED';
  END IF;
  EXECUTE replace(body,'cash := cash+greatest(0,liability-collected)','cash := cash+total-collected');
END $patch$;
INSERT INTO public.schema_migrations(version,name) VALUES(94,'phase94_booking_tax_reserve');
DO $verify$
DECLARE r JSONB;
BEGIN
  r := public.compute_booking_finance('{"amount":100,"cleanFee":0,"nights":1,"tax":{"enabled":true,"mode":"manual","vat":{"amount":10,"cleaningAmount":0,"platformCollected":"none","businessLiability":"none"},"accommodation":{"amount":0,"cleaningAmount":0}},"extras":[]}'::jsonb);
  IF (r->>'remaining')::numeric <> 90 OR (r->>'businessLiability')::numeric <> 0
    OR has_function_privilege('anon','public.compute_booking_finance(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'PHASE94_VERIFICATION_FAILED';
  END IF;
END $verify$;
COMMIT;
