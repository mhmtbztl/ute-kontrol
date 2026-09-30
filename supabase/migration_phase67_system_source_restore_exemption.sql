-- =============================================================================
-- LEXBNB PHASE 67 — "Bilinmiyor" KILIDINE PLATFORM BAKIMI ISTISNASI (phase59 ileri duzeltme)
-- =============================================================================
-- phase59, her isletmedeki sistem kaynagi "Bilinmiyor"u (UNKNOWN) silinmez ve
-- degistirilmez yapti. Bu KULLANICI kuralidir. Yedekten geri yukleme
-- (npm run restore, CLAUDE.md 4.1 / L-42) isletmeyi yeniden olustururken
-- tetikleyici yeni bir "Bilinmiyor" uretir; motor bu kopyayi silip yedektekini
-- (ayni kimlikle) yukler. Kilit bu silmeyi reddediyordu: geri yukleme yarida
-- kaliyor, ikinci kosuda cakisma veriyordu. backup_restore_live_tests yakaladi.
--
-- Istisna yalniz service_role icin (geri yukleme ve bakim araclari; tarayici
-- bu anahtara hic sahip olmaz). Kullanici icin kilit aynen durur.
-- phase59 test projesine uygulandigi icin degismez; duzeltme bu gocle,
-- manifestte phase65'in arkasinda.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 59) THEN
        RAISE EXCEPTION 'PHASE67_REQUIRES_PHASE59';
    END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.guard_lead_source_system_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Platform bakimi (yedekten geri yukleme): kural kullanici icindir.
    IF COALESCE(auth.role(), '') = 'service_role' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_system AND NOT public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
            RAISE EXCEPTION 'SYSTEM_SOURCE_LOCKED: "Bilinmiyor" kaynagi silinemez.' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.is_system AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.is_system IS DISTINCT FROM OLD.is_system
                          OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.label IS DISTINCT FROM OLD.label) THEN
        RAISE EXCEPTION 'SYSTEM_SOURCE_LOCKED: "Bilinmiyor" kaynagi degistirilemez (yalniz sirasi).' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_lead_source_system_row() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_lead_source_system_row() FROM anon;

DO $verify$
DECLARE
    v_def TEXT := pg_get_functiondef('public.guard_lead_source_system_row()'::regprocedure);
BEGIN
    IF strpos(v_def, 'service_role') = 0 OR strpos(v_def, 'SYSTEM_SOURCE_LOCKED') = 0 THEN
        RAISE EXCEPTION 'PHASE67_GUARD_BODY';
    END IF;
    RAISE NOTICE 'PHASE 67 OK — "Bilinmiyor" kilidi kullanici icin duruyor, geri yukleme calisiyor.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (67, 'phase67_system_source_restore_exemption')
ON CONFLICT (version) DO NOTHING;

COMMIT;
