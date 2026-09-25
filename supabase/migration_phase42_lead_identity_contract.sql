BEGIN;

ALTER TABLE public.leads
  ALTER COLUMN guest_name DROP NOT NULL;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS chk_lead_guest_identity;
ALTER TABLE public.leads
  ADD CONSTRAINT chk_lead_guest_identity CHECK (
    length(trim(COALESCE(guest_name, ''))) > 0
    OR length(trim(COALESCE(guest_phone, ''))) > 0
  );

REVOKE ALL ON TABLE public.leads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leads TO authenticated;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads'
      AND column_name = 'guest_name' AND is_nullable <> 'YES'
  ) THEN
    RAISE EXCEPTION 'PHASE42_GUEST_NAME_NOT_NULLABLE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass AND conname = 'chk_lead_guest_identity'
      AND pg_get_constraintdef(oid) ILIKE '%guest_name%'
      AND pg_get_constraintdef(oid) ILIKE '%guest_phone%'
  ) THEN
    RAISE EXCEPTION 'PHASE42_LEAD_IDENTITY_CHECK_MISSING';
  END IF;
  IF has_table_privilege('anon', 'public.leads', 'SELECT')
     OR has_table_privilege('anon', 'public.leads', 'INSERT')
     OR has_table_privilege('anon', 'public.leads', 'UPDATE')
     OR has_table_privilege('anon', 'public.leads', 'DELETE') THEN
    RAISE EXCEPTION 'PHASE42_LEADS_ANON_PRIVILEGE';
  END IF;
  RAISE NOTICE 'PHASE 42 OK — talep kimligi ad veya telefon sozlesmesiyle uyumlu.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (42, 'phase42_lead_identity_contract')
ON CONFLICT (version) DO NOTHING;

COMMIT;
