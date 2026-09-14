-- =============================================================================
-- LEXBNB PHASE 26 — MULK ARSIVLEME KORUMASINA SIFIRLAMA/SILME ISTISNALARI
--
-- SORUN (uretimde olculdu, 2026-09-14):
--   phase24 mulk silmeyi engelleyen bir koruma ekledi:
--
--       guard_property_hard_delete() -> RAISE 'PROPERTY_ARCHIVE_REQUIRED'
--
--   Koruma yalnizca iki cikis tanidi: auth.role() = 'service_role' ve
--   lexbnb.allow_property_purge bayragi. Oysa bu projede mulk silmesi gereken
--   IKI mesru akis daha var ve ikisi de baska bayrak kullaniyor:
--
--     reset_tenant_data()  -> lexbnb.tenant_reset  (fn_tenant_reset_in_progress)
--     delete_my_account()  -> tenant satiri silinir (fn_tenant_is_being_deleted)
--
--   Sonuc, uretimde olculdu:
--     - "Verileri Sifirla" PROPERTY_ARCHIVE_REQUIRED ile YARIDA kaliyor.
--       tenant_reset_tests 7-8-9: mulk, rezervasyon, gider, temizlik ve
--       kapanis kayitlari silinmeden duruyor. CLAUDE.md 3.7'nin "sifirlama
--       yarida kalir ve kismi veriyle daha kotu bir duruma yol acar" dedigi
--       durumun ta kendisi.
--     - Hesap kapatma da ayni sekilde kilitleniyor (account_deletion_tests 6-7).
--
--   CLAUDE.md bolum 7 bu tuzagi zaten yaziyordu:
--     "Koruma tetikleyicileri cascade'i engellememeli. ... yeni koruma
--      eklerken ayni istisnayi tanimlayin."
--   phase24 korumayi ekledi, istisnalari eklemedi.
--
-- COZUM:
--   Koruma, projenin mevcut iki istisna yardimcisini da tanir. Kullanicinin
--   elle mulk silmesi HALA engellidir; degisen tek sey, sifirlama ve hesap
--   kapatma akislarinin artik kilitlenmemesi.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_property_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Mesru silme yollari:
  --   1. service_role (worker/bakim)
  --   2. acik purge bayragi (phase24)
  --   3. isletme verisi sifirlaniyor (phase21)
  --   4. isletme hesabi tamamen kapatiliyor (phase15/phase18 cascade)
  IF COALESCE(auth.role(), '') = 'service_role'
     OR COALESCE(current_setting('lexbnb.allow_property_purge', true), '') = 'on'
     OR public.fn_tenant_reset_in_progress()
     OR public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'PROPERTY_ARCHIVE_REQUIRED' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_property_hard_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_property_hard_delete() FROM anon;

-- =============================================================================
-- DOGRULAMA — basarisizsa goc durur (CLAUDE.md bolum 4.2)
-- =============================================================================
DO $verify$
DECLARE
    v_def TEXT;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'guard_property_hard_delete'
    ORDER BY p.oid DESC LIMIT 1;

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'PHASE26_GUARD_MISSING';
    END IF;

    -- Duz metin aramasi; regex kacisi bu kontrolu sessizce yanlis yapabilirdi.
    IF strpos(v_def, 'fn_tenant_reset_in_progress') = 0 THEN
        RAISE EXCEPTION 'PHASE26_RESET_EXEMPTION_MISSING';
    END IF;
    IF strpos(v_def, 'fn_tenant_is_being_deleted') = 0 THEN
        RAISE EXCEPTION 'PHASE26_DELETE_EXEMPTION_MISSING';
    END IF;
    IF strpos(v_def, 'PROPERTY_ARCHIVE_REQUIRED') = 0 THEN
        RAISE EXCEPTION 'PHASE26_ARCHIVE_RULE_LOST';
    END IF;

    -- Tetikleyici hala bagli olmali; koruma kaldirilmadi, genisletildi.
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_guard_property_hard_delete'
          AND tgrelid = 'public.properties'::regclass
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'PHASE26_TRIGGER_DETACHED';
    END IF;

    RAISE NOTICE 'PHASE 26 OK — mulk korumasi duruyor, sifirlama ve hesap kapatma serbest.';
END
$verify$;
