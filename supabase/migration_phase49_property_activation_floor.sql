-- =============================================================================
-- LEXBNB PHASE 49 — MULKUN FAALIYETE BASLAMA TARIHI ILK REZERVASYONDAN SONRA OLAMAZ
-- =============================================================================
-- Doluluk ve RevPAR'in paydasi (satilabilir gece) mulk basina
-- properties.activated_on'dan itibaren sayilir (phase24; sunucu snapshot'i
-- ve istemci ayni kurali kullanir). Ama activated_on'un varsayilani
-- CURRENT_DATE'tir ve mulk formu bu alani hic yazmiyordu: mulkunu bugun
-- ekleyip gecmis rezervasyonlarini ice aktaran isletmede gecmis aylarin
-- kapasitesi SIFIR oluyordu.
--
-- 26.09.2026'da gercek bir hesapta olculdu: bes mulk 14 Eylul'de eklenmis,
-- Ekim 2025'ten beri 53 rezervasyonu var. Agustos: 79 satilan gece / 0
-- kapasite -> doluluk ve RevPAR "—"; Eylul: 2 / 85 (gercekte 150).
--
-- Kural: iptal edilmemis bir konaklama, mulkun o gun faaliyette oldugunun
-- kanitidir. Bu yuzden
--   1. mevcut veride activated_on en erken girise cekilir;
--   2. daha eski tarihli bir rezervasyon girilince tarih kendiliginden
--      geri cekilir (rolden bagimsiz: staff da rezervasyon girer);
--   3. activated_on ilk rezervasyondan SONRAYA alinamaz.
-- Kapanmis bir aya dokunan degisiklik yapilmaz (1 ve 2 atlar, 3 reddeder):
-- muhurlu donemin kapasitesi degismez (CLAUDE.md 3.4.1).
--
-- Yeni sutun ya da tablo yok; activated_on phase24'ten beri var.
-- phase20 (fn_range_touches_closed_period) ve phase21
-- (fn_tenant_reset_in_progress) gereklidir.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Mevcut veri: activated_on iptal olmayan en erken girise cekilir
-- -----------------------------------------------------------------------------
UPDATE public.properties p
   SET activated_on = ilk.ilk_giris
  FROM (
        SELECT b.tenant_id, b.property_id, MIN(b.check_in) AS ilk_giris
          FROM public.bookings b
         WHERE b.status <> 'CANCELLED'
           AND b.property_id IS NOT NULL
         GROUP BY b.tenant_id, b.property_id
       ) ilk
 WHERE ilk.property_id = p.id
   AND ilk.tenant_id = p.tenant_id
   AND (p.activated_on IS NULL OR ilk.ilk_giris < p.activated_on)
   AND (p.activated_on IS NULL
        OR NOT public.fn_range_touches_closed_period(p.tenant_id, ilk.ilk_giris, p.activated_on - 1));

-- Rezervasyonu olmayan ve tarihi bos kalan mulk: kayit gunu (phase24 ile ayni).
-- Bos activated_on sunucu kapasitesinde mulku tamamen disarida birakir.
UPDATE public.properties
   SET activated_on = created_at::date
 WHERE activated_on IS NULL;

-- -----------------------------------------------------------------------------
-- 2. Daha eski tarihli rezervasyon faaliyet baslangicini geri ceker
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_booking_pulls_property_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_act DATE;
BEGIN
    IF NEW.property_id IS NULL OR NEW.check_in IS NULL OR NEW.status = 'CANCELLED' THEN
        RETURN NEW;
    END IF;

    SELECT p.activated_on INTO v_act
      FROM public.properties p
     WHERE p.id = NEW.property_id AND p.tenant_id = NEW.tenant_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    IF v_act IS NOT NULL AND NEW.check_in >= v_act THEN
        RETURN NEW;
    END IF;
    -- Muhurlu donemin kapasitesi degismez; tarih bu durumda cekilmez.
    IF v_act IS NOT NULL
       AND public.fn_range_touches_closed_period(NEW.tenant_id, NEW.check_in, v_act - 1) THEN
        RETURN NEW;
    END IF;

    UPDATE public.properties
       SET activated_on = NEW.check_in
     WHERE id = NEW.property_id AND tenant_id = NEW.tenant_id;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_booking_pulls_property_activation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_booking_pulls_property_activation() FROM anon;
REVOKE ALL ON FUNCTION public.fn_booking_pulls_property_activation() FROM authenticated;

DROP TRIGGER IF EXISTS trg_booking_pulls_property_activation ON public.bookings;
CREATE TRIGGER trg_booking_pulls_property_activation
    AFTER INSERT OR UPDATE OF check_in, status, property_id ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.fn_booking_pulls_property_activation();

-- -----------------------------------------------------------------------------
-- 3. Koruma: ilk rezervasyondan sonraya ve kapanmis aya dokunan degisiklik yok
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_property_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ilk DATE;
BEGIN
    IF NEW.activated_on IS NOT DISTINCT FROM OLD.activated_on THEN
        RETURN NEW;
    END IF;
    -- Veri sifirlama bu tabloyu guncellemez; yine de phase21 sozlesmesi geregi
    -- her koruma sifirlama sirasinda askiya alinir.
    IF public.fn_tenant_reset_in_progress() THEN
        RETURN NEW;
    END IF;

    IF NEW.activated_on IS NULL THEN
        RAISE EXCEPTION 'ACTIVATION_REQUIRED: Faaliyete başlama tarihi boş bırakılamaz.'
            USING ERRCODE = '23502';
    END IF;

    SELECT MIN(b.check_in) INTO v_ilk
      FROM public.bookings b
     WHERE b.property_id = NEW.id
       AND b.tenant_id = NEW.tenant_id
       AND b.status <> 'CANCELLED';

    IF v_ilk IS NOT NULL AND NEW.activated_on > v_ilk THEN
        RAISE EXCEPTION 'ACTIVATION_AFTER_FIRST_BOOKING: Faaliyete başlama tarihi, mülkün ilk rezervasyonundan (%) sonra olamaz.',
            to_char(v_ilk, 'DD.MM.YYYY')
            USING ERRCODE = '23514';
    END IF;

    IF OLD.activated_on IS NOT NULL
       AND public.fn_range_touches_closed_period(
             NEW.tenant_id,
             LEAST(OLD.activated_on, NEW.activated_on),
             GREATEST(OLD.activated_on, NEW.activated_on) - 1) THEN
        RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Faaliyete başlama tarihindeki değişiklik kapatılmış bir döneme dokunuyor; o dönemin doluluk kapasitesi değiştirilemez.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_property_activation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_property_activation() FROM anon;
REVOKE ALL ON FUNCTION public.guard_property_activation() FROM authenticated;

DROP TRIGGER IF EXISTS trg_guard_property_activation ON public.properties;
CREATE TRIGGER trg_guard_property_activation
    BEFORE UPDATE OF activated_on ON public.properties
    FOR EACH ROW EXECUTE FUNCTION public.guard_property_activation();

-- -----------------------------------------------------------------------------
-- 4. Dogrulama
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_ihlal   BIGINT;
    v_atlanan BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_booking_pulls_property_activation'
                     AND tgrelid = 'public.bookings'::regclass AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE49_BOOKING_TRIGGER_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_property_activation'
                     AND tgrelid = 'public.properties'::regclass AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE49_GUARD_TRIGGER_MISSING';
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_booking_pulls_property_activation()'::regprocedure) THEN
        RAISE EXCEPTION 'PHASE49_PULL_NOT_SECURITY_DEFINER';
    END IF;
    IF has_function_privilege('anon', 'public.fn_booking_pulls_property_activation()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.guard_property_activation()', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE49_ANON_EXECUTE_OPEN';
    END IF;
    IF EXISTS (SELECT 1 FROM public.properties WHERE activated_on IS NULL) THEN
        RAISE EXCEPTION 'PHASE49_NULL_ACTIVATION_LEFT';
    END IF;

    -- Veri degismezi: iptal olmayan hicbir konaklama faaliyet baslangicindan
    -- once degil — kapanmis doneme dokundugu icin bilerek atlananlar haric.
    SELECT COUNT(*) FILTER (WHERE NOT kapali), COUNT(*) FILTER (WHERE kapali)
      INTO v_ihlal, v_atlanan
      FROM (
            SELECT public.fn_range_touches_closed_period(p.tenant_id, MIN(b.check_in), p.activated_on - 1) AS kapali
              FROM public.properties p
              JOIN public.bookings b ON b.property_id = p.id AND b.tenant_id = p.tenant_id
             WHERE b.status <> 'CANCELLED'
             GROUP BY p.id, p.tenant_id, p.activated_on
            HAVING MIN(b.check_in) < p.activated_on
           ) x;
    IF v_ihlal > 0 THEN
        RAISE EXCEPTION 'PHASE49_BOOKING_BEFORE_ACTIVATION: % mulk', v_ihlal;
    END IF;

    RAISE NOTICE 'PHASE 49 OK — faaliyet baslangici ilk rezervasyona cekildi (kapanmis donem nedeniyle atlanan mulk: %).', v_atlanan;
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (49, 'phase49_property_activation_floor')
ON CONFLICT (version) DO NOTHING;

COMMIT;
