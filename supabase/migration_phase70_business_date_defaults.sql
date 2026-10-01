-- Lexbnb phase70 — L-119: is tarihi varsayilanlari Europe/Istanbul.
-- PostgreSQL CURRENT_DATE oturum saat dilimine baglidir. Supabase oturumu UTC
-- oldugu icin 00:00–03:00 Turkiye saatinde bir onceki gunu yazabiliyordu.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 68) THEN
        RAISE EXCEPTION 'PHASE70_REQUIRES_PHASE68';
    END IF;
END
$pre$;

ALTER TABLE public.properties
    ALTER COLUMN activated_on SET DEFAULT ((now() AT TIME ZONE 'Europe/Istanbul')::date);

ALTER TABLE public.expenses
    ALTER COLUMN expense_date SET DEFAULT ((now() AT TIME ZONE 'Europe/Istanbul')::date);

ALTER TABLE public.leads
    ALTER COLUMN lead_date SET DEFAULT ((now() AT TIME ZONE 'Europe/Istanbul')::date);

DO $verify$
DECLARE
    v_property_default TEXT;
    v_expense_default  TEXT;
    v_lead_default     TEXT;
BEGIN
    SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_property_default
      FROM pg_attrdef d
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     WHERE d.adrelid = 'public.properties'::regclass AND a.attname = 'activated_on';

    SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_expense_default
      FROM pg_attrdef d
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     WHERE d.adrelid = 'public.expenses'::regclass AND a.attname = 'expense_date';

    SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_lead_default
      FROM pg_attrdef d
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
     WHERE d.adrelid = 'public.leads'::regclass AND a.attname = 'lead_date';

    IF COALESCE(v_property_default, '') NOT LIKE '%Europe/Istanbul%'
       OR COALESCE(v_expense_default, '') NOT LIKE '%Europe/Istanbul%'
       OR COALESCE(v_lead_default, '') NOT LIKE '%Europe/Istanbul%' THEN
        RAISE EXCEPTION 'PHASE70_ISTANBUL_DEFAULT_MISSING: properties=%, expenses=%, leads=%',
            v_property_default, v_expense_default, v_lead_default;
    END IF;
    RAISE NOTICE 'PHASE 70 OK — is tarihi varsayilanlari Europe/Istanbul.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (70, 'phase70_business_date_defaults')
ON CONFLICT (version) DO NOTHING;

COMMIT;
