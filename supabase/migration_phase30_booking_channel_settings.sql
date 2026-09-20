-- =============================================================================
-- LEXBNB PHASE 30 — REZERVASYON KANALLARI VE OTA KOMISYON AYARLARI
--
-- Rezervasyon formundaki sabit kanal/komisyon listesini tenant kapsamli,
-- kalici bir kataloga tasir. Kanal "silme" gecmis rezervasyonlari bozmamak
-- icin pasiflestirme olarak modellenir.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_booking_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  channel_type VARCHAR(10) NOT NULL CHECK (channel_type IN ('OTA', 'DIRECT')),
  default_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (default_commission_rate >= 0 AND default_commission_rate <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_booking_channel_code CHECK (code ~ '^[A-Z][A-Z0-9_]{1,49}$'),
  CONSTRAINT chk_direct_channel_zero_commission CHECK (
    channel_type = 'OTA' OR default_commission_rate = 0
  ),
  UNIQUE (tenant_id, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_booking_channel_name
  ON public.tenant_booking_channels (tenant_id, lower(display_name));
CREATE INDEX IF NOT EXISTS idx_tenant_booking_channels_active
  ON public.tenant_booking_channels (tenant_id, is_active, display_name);

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.tenant_booking_channels;
CREATE TRIGGER trg_set_updated_at
  BEFORE UPDATE ON public.tenant_booking_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tenant_booking_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_booking_channels_select" ON public.tenant_booking_channels;
CREATE POLICY "tenant_booking_channels_select" ON public.tenant_booking_channels
  FOR SELECT TO authenticated
  USING (public.get_tenant_role(tenant_id) IS NOT NULL);

REVOKE ALL ON TABLE public.tenant_booking_channels FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_booking_channels FROM anon;
REVOKE ALL ON TABLE public.tenant_booking_channels FROM authenticated;
GRANT SELECT ON TABLE public.tenant_booking_channels TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_tenant_booking_channels(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.tenant_booking_channels (
    tenant_id, code, display_name, channel_type, default_commission_rate, is_system
  ) VALUES
    (p_tenant_id, 'WHATSAPP', 'WhatsApp', 'DIRECT', 0, TRUE),
    (p_tenant_id, 'AIRBNB', 'Airbnb', 'OTA', 15, TRUE),
    (p_tenant_id, 'BOOKING', 'Booking.com', 'OTA', 18, TRUE),
    (p_tenant_id, 'INSTAGRAM', 'Instagram', 'DIRECT', 0, TRUE),
    (p_tenant_id, 'WEBSITE', 'Website', 'DIRECT', 0, TRUE),
    (p_tenant_id, 'REPEAT', 'Tekrar Misafir', 'DIRECT', 0, TRUE),
    (p_tenant_id, 'PHONE', 'Telefon', 'DIRECT', 0, TRUE)
  ON CONFLICT (tenant_id, code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_tenant_booking_channels(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_tenant_booking_channels(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.seed_tenant_booking_channels(UUID) FROM authenticated;

DO $seed_existing$
DECLARE
  v_tenant RECORD;
BEGIN
  FOR v_tenant IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_tenant_booking_channels(v_tenant.id);
  END LOOP;
END
$seed_existing$;

CREATE OR REPLACE FUNCTION public.seed_booking_channels_for_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.seed_tenant_booking_channels(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_booking_channels_for_new_tenant ON public.tenants;
CREATE TRIGGER trg_seed_booking_channels_for_new_tenant
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_booking_channels_for_new_tenant();

REVOKE ALL ON FUNCTION public.seed_booking_channels_for_new_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_booking_channels_for_new_tenant() FROM anon;
REVOKE ALL ON FUNCTION public.seed_booking_channels_for_new_tenant() FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_tenant_booking_channel(
  p_tenant_id UUID,
  p_channel_id UUID,
  p_display_name TEXT,
  p_channel_type TEXT,
  p_default_commission_rate NUMERIC,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_name TEXT := NULLIF(trim(COALESCE(p_display_name, '')), '');
  v_type TEXT := upper(trim(COALESCE(p_channel_type, '')));
  v_rate NUMERIC := COALESCE(p_default_commission_rate, 0);
  v_channel public.tenant_booking_channels%ROWTYPE;
  v_code TEXT;
BEGIN
  -- Yetki kontrolu hedef kanal aramasindan once yapilir.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
  END IF;
  SELECT tm.role INTO v_role
  FROM public.tenant_members tm
  WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_user_id;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'FORBIDDEN_ROLE: Kanal ayarlarini degistirme yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'INVALID_CHANNEL_NAME' USING ERRCODE = '22023';
  END IF;
  IF v_type NOT IN ('OTA', 'DIRECT') THEN
    RAISE EXCEPTION 'INVALID_CHANNEL_TYPE' USING ERRCODE = '22023';
  END IF;
  IF v_rate < 0 OR v_rate > 100 THEN
    RAISE EXCEPTION 'INVALID_COMMISSION_RATE' USING ERRCODE = '22023';
  END IF;
  IF v_type = 'DIRECT' AND v_rate <> 0 THEN
    RAISE EXCEPTION 'DIRECT_CHANNEL_COMMISSION_MUST_BE_ZERO' USING ERRCODE = '22023';
  END IF;

  IF p_channel_id IS NULL THEN
    v_code := 'CUSTOM_' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 12));
    INSERT INTO public.tenant_booking_channels (
      tenant_id, code, display_name, channel_type, default_commission_rate,
      is_active, is_system, created_by
    ) VALUES (
      p_tenant_id, v_code, v_name, v_type, v_rate,
      COALESCE(p_is_active, TRUE), FALSE, v_user_id
    ) RETURNING * INTO v_channel;
  ELSE
    SELECT * INTO v_channel
    FROM public.tenant_booking_channels
    WHERE tenant_id = p_tenant_id AND id = p_channel_id
    FOR UPDATE;
    IF v_channel.id IS NULL THEN
      RAISE EXCEPTION 'CHANNEL_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.tenant_booking_channels SET
      display_name = v_name,
      channel_type = CASE WHEN is_system THEN channel_type ELSE v_type END,
      default_commission_rate = CASE
        WHEN is_system AND channel_type = 'DIRECT' THEN 0
        ELSE v_rate
      END,
      is_active = COALESCE(p_is_active, TRUE)
    WHERE tenant_id = p_tenant_id AND id = p_channel_id
    RETURNING * INTO v_channel;
  END IF;

  RETURN to_jsonb(v_channel);
END;
$$;

REVOKE ALL ON FUNCTION public.save_tenant_booking_channel(UUID, UUID, TEXT, TEXT, NUMERIC, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_tenant_booking_channel(UUID, UUID, TEXT, TEXT, NUMERIC, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_booking_channel(UUID, UUID, TEXT, TEXT, NUMERIC, BOOLEAN) TO authenticated;

-- =============================================================================
-- DOGRULAMA — basarisizsa goc durur
-- =============================================================================
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  IF to_regclass('public.tenant_booking_channels') IS NULL THEN
    RAISE EXCEPTION 'PHASE30_CHANNEL_TABLE_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenant_booking_channels'
      AND policyname = 'tenant_booking_channels_select'
  ) THEN RAISE EXCEPTION 'PHASE30_CHANNEL_RLS_MISSING'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'tenant_booking_channels'
      AND grantee = 'anon'
  ) THEN RAISE EXCEPTION 'PHASE30_ANON_TABLE_GRANT_PRESENT'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'tenant_booking_channels'
      AND grantee = 'authenticated' AND privilege_type <> 'SELECT'
  ) THEN RAISE EXCEPTION 'PHASE30_DIRECT_CLIENT_WRITE_GRANT_PRESENT'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_seed_booking_channels_for_new_tenant'
      AND tgrelid = 'public.tenants'::regclass AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'PHASE30_NEW_TENANT_SEED_TRIGGER_MISSING'; END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'save_tenant_booking_channel'
  ORDER BY p.oid DESC LIMIT 1;
  IF v_def IS NULL OR strpos(v_def, 'v_role IS NULL OR v_role NOT IN') = 0 THEN
    RAISE EXCEPTION 'PHASE30_NULL_ROLE_GUARD_MISSING';
  END IF;
  IF strpos(v_def, 'FOR UPDATE') = 0 THEN
    RAISE EXCEPTION 'PHASE30_CHANNEL_LOCK_MISSING';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND routine_name = 'save_tenant_booking_channel'
      AND grantee IN ('PUBLIC', 'anon')
  ) THEN RAISE EXCEPTION 'PHASE30_ANON_RPC_EXECUTE_PRESENT'; END IF;

  RAISE NOTICE 'PHASE 30 OK — rezervasyon kanallari ve OTA komisyon ayarlari hazir.';
END
$verify$;
