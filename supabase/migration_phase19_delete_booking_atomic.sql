-- =============================================================================
-- PHASE 19: ATOMİK REZERVASYON SİLME
-- =============================================================================
-- SORUN (uretimde dogrulandi, 2026-09-13):
--   deleteBooking() istemcide UC AYRI sorgu calistiriyordu:
--     1. odenmis temizlik gorevlerini ayir  (booking_id = NULL)
--     2. odenmemis temizlik gorevlerini SIL
--     3. rezervasyonu sil
--
--   Adim 3, kapanmis donem korumasi (guard_booking_closed_period) tarafindan
--   reddedilirse adim 2 GERI ALINMAZ. Canli testte dogrulandi:
--     temizlik silme : BASARILI
--     rezervasyon    : ENGELLENDI (42501)
--     -> rezervasyon 1 adet, temizlik gorevi 0 adet
--
--   Yani kullanici "silinemedi" hatasi goruyor ama temizlikciye olan BORC
--   kaydini sessizce kaybediyor. Ayni sey ag kopmasinda da olur.
--
-- AYRICA:
--   cleaning_tasks.booking_id zaten ON DELETE SET NULL. Yani istemcinin
--   "odenmisleri ayir" adimi gereksizdi; FK bunu kendisi yapiyor.
--
-- COZUM:
--   Tek transaction. Rezervasyon silinemezse hicbir sey silinmez.
--   create_booking_atomic / update_booking_atomic ile ayni desen.
--
-- CALISTIRMA: Supabase Dashboard -> SQL Editor -> tamamini yapistir -> Run
-- Idempotenttir.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_booking_atomic(
    p_booking_id UUID,
    p_tenant_id  UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id       UUID;
    v_user_role     TEXT;
    v_booking       RECORD;
    v_removed_tasks INT := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_user_role
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_TENANT: Belirtilen işletmeye erişim yetkiniz bulunmuyor.'
            USING ERRCODE = '42501';
    END IF;

    IF v_user_role = 'viewer' THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: İzleyici rolü kayıt silemez.'
            USING ERRCODE = '42501';
    END IF;

    -- Rezervasyon gercekten bu isletmeye mi ait?
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id AND tenant_id = p_tenant_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadı veya bu işletmeye ait değil.'
            USING ERRCODE = 'P0002';
    END IF;

    -- Odenmemis temizlik gorevlerini sil. Odenmis olanlara DOKUNULMAZ; onlarin
    -- booking_id'si FK sayesinde (ON DELETE SET NULL) kendiliginden bosalir ve
    -- odeme gecmisi korunur.
    WITH silinen AS (
        DELETE FROM public.cleaning_tasks
        WHERE booking_id = p_booking_id
          AND tenant_id = p_tenant_id
          AND is_paid = FALSE
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_removed_tasks FROM silinen;

    -- Rezervasyonu sil. Kapanmis donem korumasi burada devreye girerse
    -- EXCEPTION firlar ve yukaridaki temizlik silme de GERI ALINIR.
    DELETE FROM public.bookings
    WHERE id = p_booking_id AND tenant_id = p_tenant_id;

    RETURN json_build_object(
        'deleted', TRUE,
        'booking_id', p_booking_id,
        'removed_cleaning_tasks', v_removed_tasks
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_booking_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_booking_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_booking_atomic(UUID, UUID) TO authenticated;

-- =============================================================================
-- DOĞRULAMA
-- =============================================================================
DO $$
BEGIN
    IF to_regprocedure('public.delete_booking_atomic(UUID, UUID)') IS NULL THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: fonksiyon olusmadi';
    END IF;

    IF has_function_privilege('anon', 'public.delete_booking_atomic(UUID, UUID)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: anon cagirabiliyor!';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.delete_booking_atomic(UUID, UUID)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: authenticated cagiramiyor!';
    END IF;

    RAISE NOTICE 'DOGRULAMA: OK - delete_booking_atomic yerinde, anon kapali, authenticated acik.';
END $$;
