-- =============================================================================
-- LEXBNB PHASE 28 — MISAFIR TERCIHLERI, IC NOTLAR VE IZIN GECMISI
--
-- Misafir profiline operasyonel baglam ekler ve kampanya izni degisikliklerini
-- sonradan degistirilemeyen bir olay defterinde tutar. Olaylar guests satiri
-- silindiginde cascade olur; bu nedenle tenant reset ve hesap kapatma akislari
-- yeni bir silme korumasina takilmaz.
-- =============================================================================

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS preferences TEXT,
  ADD COLUMN IF NOT EXISTS internal_notes TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.guests DROP CONSTRAINT IF EXISTS chk_guest_preferences_length;
ALTER TABLE public.guests ADD CONSTRAINT chk_guest_preferences_length
  CHECK (char_length(COALESCE(preferences, '')) <= 2000);

ALTER TABLE public.guests DROP CONSTRAINT IF EXISTS chk_guest_internal_notes_length;
ALTER TABLE public.guests ADD CONSTRAINT chk_guest_internal_notes_length
  CHECK (char_length(COALESCE(internal_notes, '')) <= 5000);

ALTER TABLE public.guests DROP CONSTRAINT IF EXISTS chk_guest_tags_count;
ALTER TABLE public.guests ADD CONSTRAINT chk_guest_tags_count
  CHECK (cardinality(tags) <= 20);

CREATE TABLE IF NOT EXISTS public.guest_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  marketing_opt_in BOOLEAN NOT NULL,
  source TEXT NOT NULL DEFAULT 'APPLICATION',
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_guest_consent_source CHECK (source IN ('APPLICATION', 'BOOKING_FORM', 'PROFILE_FORM', 'IMPORT', 'API'))
);

CREATE INDEX IF NOT EXISTS idx_guest_consent_events_guest
  ON public.guest_consent_events(tenant_id, guest_id, recorded_at DESC);

ALTER TABLE public.guest_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_consent_events_tenant_select" ON public.guest_consent_events;
CREATE POLICY "guest_consent_events_tenant_select" ON public.guest_consent_events
  FOR SELECT TO authenticated
  USING (public.get_tenant_role(tenant_id) IS NOT NULL);

REVOKE ALL ON TABLE public.guest_consent_events FROM PUBLIC;
REVOKE ALL ON TABLE public.guest_consent_events FROM anon;
REVOKE ALL ON TABLE public.guest_consent_events FROM authenticated;
GRANT SELECT ON TABLE public.guest_consent_events TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_guest_marketing_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source TEXT := upper(COALESCE(NULLIF(current_setting('lexbnb.guest_consent_source', true), ''), 'APPLICATION'));
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.marketing_opt_in = TRUE)
     OR (TG_OP = 'UPDATE' AND NEW.marketing_opt_in IS DISTINCT FROM OLD.marketing_opt_in) THEN
    IF v_source NOT IN ('APPLICATION', 'BOOKING_FORM', 'PROFILE_FORM', 'IMPORT', 'API') THEN
      v_source := 'APPLICATION';
    END IF;
    INSERT INTO public.guest_consent_events (
      tenant_id, guest_id, marketing_opt_in, source, recorded_by
    ) VALUES (
      NEW.tenant_id, NEW.id, NEW.marketing_opt_in, v_source, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_guest_marketing_consent ON public.guests;
CREATE TRIGGER trg_audit_guest_marketing_consent
  AFTER INSERT OR UPDATE OF marketing_opt_in ON public.guests
  FOR EACH ROW EXECUTE FUNCTION public.audit_guest_marketing_consent();

REVOKE ALL ON FUNCTION public.audit_guest_marketing_consent() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_guest_marketing_consent() FROM anon;
REVOKE ALL ON FUNCTION public.audit_guest_marketing_consent() FROM authenticated;

-- =============================================================================
-- DOGRULAMA — basarisizsa goc durur
-- =============================================================================
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'preferences'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'internal_notes'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'guests' AND column_name = 'tags'
  ) THEN RAISE EXCEPTION 'PHASE28_GUEST_CONTEXT_COLUMNS_MISSING'; END IF;

  IF to_regclass('public.guest_consent_events') IS NULL THEN
    RAISE EXCEPTION 'PHASE28_CONSENT_TABLE_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_audit_guest_marketing_consent'
      AND tgrelid = 'public.guests'::regclass AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'PHASE28_CONSENT_TRIGGER_MISSING'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'guest_consent_events'
      AND policyname = 'guest_consent_events_tenant_select'
  ) THEN RAISE EXCEPTION 'PHASE28_CONSENT_RLS_MISSING'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'guest_consent_events'
      AND grantee = 'anon'
  ) THEN RAISE EXCEPTION 'PHASE28_ANON_CONSENT_GRANT_PRESENT'; END IF;

  RAISE NOTICE 'PHASE 28 OK — misafir baglami ve izin gecmisi hazir.';
END
$verify$;
