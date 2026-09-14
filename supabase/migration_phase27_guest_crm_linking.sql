-- =============================================================================
-- LEXBNB PHASE 27 — KANONIK MISAFIR PROFILI VE REZERVASYON BAGLANTISI
--
-- Misafir rehberi bookings.guest_name metnini profil sanmamalidir. Bu goc:
--   1. rezervasyon ile misafiri ayni transaction icinde bulur/olusturur/baglar,
--   2. yabanci tenant misafirinin rezervasyona baglanmasini tetikleyiciyle keser,
--   3. guests yazma yetkisini viewer rolunden geri alir.
--
-- Telefon bu RPC'ye E.164, e-posta normalize edilmis olarak gelmelidir.
-- Isim tek basina otomatik eslestirme anahtari DEGILDIR; ayni isimli iki insan
-- sessizce birlestirilmez. Iletisim yoksa rezervasyon baglantisiz kalir.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_booking_guest_tenant_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.primary_guest_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.id = NEW.primary_guest_id
      AND g.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'GUEST_TENANT_MISMATCH: Misafir profili bu isletmeye ait degil.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_guest_tenant_link ON public.bookings;
CREATE TRIGGER trg_guard_booking_guest_tenant_link
  BEFORE INSERT OR UPDATE OF tenant_id, primary_guest_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_guest_tenant_link();

REVOKE ALL ON FUNCTION public.guard_booking_guest_tenant_link() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_booking_guest_tenant_link() FROM anon;

DROP POLICY IF EXISTS "guests_tenant_all" ON public.guests;
DROP POLICY IF EXISTS "guests_tenant_select" ON public.guests;
DROP POLICY IF EXISTS "guests_tenant_insert" ON public.guests;
DROP POLICY IF EXISTS "guests_tenant_update" ON public.guests;
DROP POLICY IF EXISTS "guests_tenant_delete" ON public.guests;

CREATE POLICY "guests_tenant_select" ON public.guests
  FOR SELECT TO authenticated
  USING (public.get_tenant_role(tenant_id) IS NOT NULL);

CREATE POLICY "guests_tenant_insert" ON public.guests
  FOR INSERT TO authenticated
  WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager', 'staff'));

CREATE POLICY "guests_tenant_update" ON public.guests
  FOR UPDATE TO authenticated
  USING (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager', 'staff'))
  WITH CHECK (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager', 'staff'));

CREATE POLICY "guests_tenant_delete" ON public.guests
  FOR DELETE TO authenticated
  USING (COALESCE(public.get_tenant_role(tenant_id), '') IN ('owner', 'admin', 'manager'));

CREATE OR REPLACE FUNCTION public.upsert_booking_guest_atomic(
  p_tenant_id UUID,
  p_booking_id UUID,
  p_first_name TEXT,
  p_last_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_preferred_language TEXT DEFAULT 'tr',
  p_country_code TEXT DEFAULT 'TR',
  p_allow_email BOOLEAN DEFAULT TRUE,
  p_allow_sms BOOLEAN DEFAULT TRUE,
  p_allow_whatsapp BOOLEAN DEFAULT TRUE,
  p_marketing_opt_in BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager', 'staff') THEN
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
$$;

REVOKE ALL ON FUNCTION public.upsert_booking_guest_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_booking_guest_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_booking_guest_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- =============================================================================
-- DOGRULAMA — basarisizsa goc durur
-- =============================================================================
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'upsert_booking_guest_atomic'
  ORDER BY p.oid DESC LIMIT 1;

  IF v_def IS NULL THEN RAISE EXCEPTION 'PHASE27_GUEST_RPC_MISSING'; END IF;
  IF strpos(v_def, 'v_role IS NULL OR v_role NOT IN') = 0 THEN
    RAISE EXCEPTION 'PHASE27_NULL_ROLE_GUARD_MISSING';
  END IF;
  IF strpos(v_def, 'FOR UPDATE') = 0 OR strpos(v_def, 'pg_advisory_xact_lock') = 0 THEN
    RAISE EXCEPTION 'PHASE27_ATOMIC_LOCK_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_guard_booking_guest_tenant_link'
      AND tgrelid = 'public.bookings'::regclass AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'PHASE27_TENANT_LINK_TRIGGER_MISSING'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name = 'upsert_booking_guest_atomic'
      AND grantee IN ('PUBLIC', 'anon')
  ) THEN RAISE EXCEPTION 'PHASE27_ANON_EXECUTE_STILL_GRANTED'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'guests'
      AND policyname = 'guests_tenant_select'
  ) THEN RAISE EXCEPTION 'PHASE27_GUEST_RLS_MISSING'; END IF;

  RAISE NOTICE 'PHASE 27 OK — kanonik misafir baglantisi ve rol korumalari hazir.';
END
$verify$;
