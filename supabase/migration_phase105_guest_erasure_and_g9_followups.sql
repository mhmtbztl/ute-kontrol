-- =============================================================================
-- LEXBNB PHASE 105 — KVKK MISAFIR SILME + GOREV 9 CANLI INCELEME TAKIPLERI
-- =============================================================================
-- 1. KVKK silme hakki (L-271, kullanici karari 26.10.2026: "her seyi
--    temizlemeli"). erase_guest_personal_data misafirin kisisel verisini
--    tek islemde temizler:
--      * guests satiri SILINIR (izin olaylari, ozel sinif CASCADE ile gider);
--      * rezervasyon ve talepler muhasebe/vergi kaydi oldugu icin SILINMEZ,
--        ANONIMLESIR: ad "Silinmiş misafir", telefon/e-posta/not bos;
--      * zamanlanmis ve gonderilmis mesajlar (alici, metin) SILINIR;
--      * o rezervasyon ve taleplere ait bildirimler SILINIR;
--      * bagli temizlik, gider, ariza, gorev ve finans hareketi metinlerinde
--        misafir adi maskelenir; odeme notu bosalir.
--    Tutar, tarih, gece ve mulk degismez: raporlar ve kapanislar ayni kalir.
--    Kapali donem korumalari yalniz bu islem icinde, yalniz kisisel alanlar
--    icin, sifirlamanin bayragiyla askiya alinir (CLAUDE.md 3.7 kalibi) ve
--    islem bitmeden kapatilir. Kim, ne zaman, kac kayit sildi
--    guest_erasure_log'a KISISEL VERI OLMADAN yazilir (hesap verebilirlik).
-- 2. leads.quote_amount ve maintenance_tickets maliyet varsayilani 0 degil
--    bostur (L-292): bilinmeyen deger 0 yazilmaz (3.6). Teklifi 0 olan eski
--    talepler bos yapilir (0 TL teklif hicbir zaman gercek degildi).
-- 3. bookings.guest_count/adults pax ile birlikte yazilir (L-273). Geriye
--    donuk doldurma YOK: kapali donem korumasi ve ice aktarim geri alma
--    "duzenlendi" olcutu yuzunden eski satirlara dokunulmaz; uygulama artik
--    yalniz pax okur.
-- 4. Hizli talep notu "4 kisi" yerine "4 kişi" (L-286). Govde yeniden
--    yazilmaz; veritabanindaki tanimda yalniz bu metin degisir.
-- 5. Fiyat kurali yuzdesi -%100 olamaz (L-309). NOT VALID: varsa eski satir
--    kalir, yeni yazma reddedilir.
-- 6. Huni snapshot'i yonetimce silinebilir (L-281). Bir degisiklik
--    olcumunde kullanilan snapshot RESTRICT ile korunmaya devam eder.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 59)
       OR NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 93) THEN
        RAISE EXCEPTION 'PHASE105_REQUIRES_PHASE59_AND_PHASE93';
    END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1a. Silme gunlugu (kisisel veri tasimaz)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guest_erasure_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    erased_by        UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    erased_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    booking_count    INT NOT NULL DEFAULT 0,
    lead_count       INT NOT NULL DEFAULT 0,
    message_count    INT NOT NULL DEFAULT 0,
    notification_count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS guest_erasure_log_tenant_idx ON public.guest_erasure_log(tenant_id, erased_at DESC);

DROP TRIGGER IF EXISTS trg_tenant_id_immutable ON public.guest_erasure_log;
CREATE TRIGGER trg_tenant_id_immutable
    BEFORE UPDATE OF tenant_id ON public.guest_erasure_log
    FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();

ALTER TABLE public.guest_erasure_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.guest_erasure_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.guest_erasure_log TO authenticated;
DROP POLICY IF EXISTS guest_erasure_log_select ON public.guest_erasure_log;
CREATE POLICY guest_erasure_log_select ON public.guest_erasure_log FOR SELECT TO authenticated
    USING (public.can_manage_tenant(tenant_id));

-- -----------------------------------------------------------------------------
-- 1b. erase_guest_personal_data
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

    DELETE FROM public.scheduled_messages m
     WHERE m.tenant_id = p_tenant_id AND (m.guest_id = p_guest_id OR m.booking_id = ANY(v_bookings));
    GET DIAGNOSTICS c_msg = ROW_COUNT;

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
        UPDATE public.financial_transactions SET notes = replace(notes, v_name, v_anon)
         WHERE tenant_id = p_tenant_id AND booking_id = ANY(v_bookings) AND position(v_name IN COALESCE(notes, '')) > 0;
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

-- -----------------------------------------------------------------------------
-- 2. Bilinmeyen deger 0 degil
-- -----------------------------------------------------------------------------
ALTER TABLE public.leads ALTER COLUMN quote_amount DROP DEFAULT;
UPDATE public.leads SET quote_amount = NULL WHERE quote_amount = 0;
ALTER TABLE public.maintenance_tickets ALTER COLUMN estimated_cost DROP DEFAULT;
ALTER TABLE public.maintenance_tickets ALTER COLUMN actual_cost DROP DEFAULT;

-- -----------------------------------------------------------------------------
-- 3. guest_count/adults pax ile birlikte (yalniz yeni yazma)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_booking_guest_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.pax IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.pax IS DISTINCT FROM OLD.pax) THEN
        NEW.guest_count := NEW.pax;
        NEW.adults := GREATEST(NEW.pax - COALESCE(NEW.children, 0), 1);
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_sync_booking_guest_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_sync_booking_guest_count() FROM anon;

DROP TRIGGER IF EXISTS trg_sync_booking_guest_count ON public.bookings;
CREATE TRIGGER trg_sync_booking_guest_count
    BEFORE INSERT OR UPDATE OF pax ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_booking_guest_count();

-- -----------------------------------------------------------------------------
-- 4. "kisi" -> "kişi" (quick_capture_lead notu)
-- -----------------------------------------------------------------------------
DO $kisi$
DECLARE
    v_sig REGPROCEDURE := 'public.quick_capture_lead(uuid,text,uuid,text,date,date,integer,uuid,text,text)'::regprocedure;
    v_def TEXT := pg_get_functiondef(v_sig);
BEGIN
    IF position($q$' kisi'$q$ IN v_def) > 0 THEN
        EXECUTE replace(v_def, $q$' kisi'$q$, $q$' kişi'$q$);
    END IF;
END
$kisi$;

-- -----------------------------------------------------------------------------
-- 5. Fiyat kurali -%100 olamaz
-- -----------------------------------------------------------------------------
ALTER TABLE public.property_pricing_rule_settings DROP CONSTRAINT IF EXISTS property_pricing_rule_settings_pct_check;
ALTER TABLE public.property_pricing_rule_settings
    ADD CONSTRAINT property_pricing_rule_settings_pct_check CHECK (pct > -100 AND pct <= 1000) NOT VALID;

-- -----------------------------------------------------------------------------
-- 6. Huni snapshot'i silme (yonetim)
-- -----------------------------------------------------------------------------
GRANT DELETE ON TABLE public.channel_performance_snapshots TO authenticated;
DROP POLICY IF EXISTS channel_performance_snapshots_delete ON public.channel_performance_snapshots;
CREATE POLICY channel_performance_snapshots_delete ON public.channel_performance_snapshots FOR DELETE TO authenticated
    USING (public.can_manage_tenant(tenant_id));

-- -----------------------------------------------------------------------------
-- Dogrulama
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_def TEXT := pg_get_functiondef('public.erase_guest_personal_data(uuid,uuid,text)'::regprocedure);
    v_qcl TEXT := pg_get_functiondef('public.quick_capture_lead(uuid,text,uuid,text,date,date,integer,uuid,text,text)'::regprocedure);
BEGIN
    IF position('auth.uid()' IN v_def) = 0 OR position('can_manage_tenant' IN v_def) = 0
       OR position('auth.uid()' IN v_def) > position('FROM public.guests' IN v_def) THEN
        RAISE EXCEPTION 'PHASE105_AUTHZ_ORDER';
    END IF;
    IF position($q$'lexbnb.tenant_reset', 'off'$q$ IN v_def) = 0 THEN
        RAISE EXCEPTION 'PHASE105_RESET_FLAG_NOT_CLOSED';
    END IF;
    IF has_function_privilege('anon', 'public.erase_guest_personal_data(uuid,uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE105_ANON_FUNCTION_PRIVILEGE';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.erase_guest_personal_data(uuid,uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE105_AUTHENTICATED_PRIVILEGE_MISSING';
    END IF;
    IF has_table_privilege('anon', 'public.guest_erasure_log', 'SELECT') THEN
        RAISE EXCEPTION 'PHASE105_ANON_TABLE_PRIVILEGE';
    END IF;
    IF (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'quote_amount') IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE105_QUOTE_DEFAULT_REMAINS';
    END IF;
    IF position($q$' kisi'$q$ IN v_qcl) > 0 OR position($q$' kişi'$q$ IN v_qcl) = 0 THEN
        RAISE EXCEPTION 'PHASE105_KISI_TEXT';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'channel_performance_snapshots_delete') THEN
        RAISE EXCEPTION 'PHASE105_SNAPSHOT_DELETE_POLICY';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_booking_guest_count' AND tgrelid = 'public.bookings'::regclass) THEN
        RAISE EXCEPTION 'PHASE105_GUEST_COUNT_TRIGGER';
    END IF;
    RAISE NOTICE 'PHASE 105 OK — KVKK misafir silme ve G9 takipleri.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (105, 'phase105_guest_erasure_and_g9_followups')
ON CONFLICT (version) DO NOTHING;

COMMIT;
