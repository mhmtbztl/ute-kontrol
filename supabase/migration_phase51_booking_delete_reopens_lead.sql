-- =============================================================================
-- LEXBNB PHASE 51 — SILINEN REZERVASYONUN TALEBI ACIK SATISA DONER (L-94)
-- =============================================================================
-- Talepten donusturulen bir rezervasyon silindiginde talep WON kaliyordu:
-- leads.converted_booking_id ON DELETE SET NULL ile bosaliyor ama durum
-- degismiyordu. Olmayan bir satis donusum oraninda kazanilmis sayiliyor,
-- talep de "kazanilmis satis" diye silinemiyordu (26.09.2026, gercek hesapta).
--
-- Silinen rezervasyon gerceklesmemis bir satistir: bagli WON talep AYNI
-- islemde QUOTE_SENT'e (acik satis) doner. Kullanici isterse LOST yapar.
--
-- Geriye donuk veri duzeltmesi YOKTUR, bilerek: rezervasyon bagi olmayan WON
-- talep, formdan elle "kazanildi" isaretlenmis gercek bir satis da olabilir.
--
-- Govde phase47 ile birebir aynidir, yalniz talep adimi eklendi. Yetki kapisi
-- kayit aramadan once (phase41). phase47'ye baglidir.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_booking_atomic(p_booking_id UUID, p_tenant_id UUID)
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
    v_reopened      INT := 0;
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

    IF v_user_role NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Rezervasyon silme yetkiniz bulunmuyor.'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id AND tenant_id = p_tenant_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadı veya bu işletmeye ait değil.'
            USING ERRCODE = 'P0002';
    END IF;

    -- Yalniz YAPILMAMIS ve odenmemis temizlik gorevleri rezervasyonla gider.
    -- Yapilmis (gider dogmus) ya da odenmis gorev korunur; booking_id'si FK
    -- sayesinde (ON DELETE SET NULL) kendiliginden bosalir.
    WITH silinen AS (
        DELETE FROM public.cleaning_tasks
        WHERE booking_id = p_booking_id
          AND tenant_id = p_tenant_id
          AND is_paid = FALSE
          AND status <> 'DONE'
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_removed_tasks FROM silinen;

    -- Bu rezervasyondan dogan kazanilmis talep acik satisa doner (L-94).
    -- Bag, rezervasyon silinmeden ONCE okunur; sonra FK onu bosaltir.
    WITH acilan AS (
        UPDATE public.leads
           SET status = 'QUOTE_SENT',
               converted_booking_id = NULL
         WHERE converted_booking_id = p_booking_id
           AND tenant_id = p_tenant_id
           AND status = 'WON'
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_reopened FROM acilan;

    -- Kapanmis donem korumasi burada devreye girerse EXCEPTION firlar ve
    -- yukaridaki temizlik silme ve talep guncellemesi de GERI ALINIR.
    DELETE FROM public.bookings
    WHERE id = p_booking_id AND tenant_id = p_tenant_id;

    RETURN json_build_object(
        'deleted', TRUE,
        'booking_id', p_booking_id,
        'removed_cleaning_tasks', v_removed_tasks,
        'reopened_leads', v_reopened
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_booking_atomic(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_booking_atomic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_booking_atomic(UUID, UUID) TO authenticated;

DO $verify$
DECLARE
    v_def TEXT;
BEGIN
    v_def := pg_get_functiondef('public.delete_booking_atomic(uuid,uuid)'::regprocedure);
    IF strpos(v_def, 'QUOTE_SENT') = 0 OR strpos(v_def, 'QUOTE_SENT') > strpos(v_def, 'DELETE FROM public.bookings') THEN
        RAISE EXCEPTION 'PHASE51_LEAD_NOT_REOPENED_BEFORE_DELETE';
    END IF;
    IF strpos(v_def, 'status <> ''DONE''') = 0 THEN
        RAISE EXCEPTION 'PHASE51_PHASE47_DONE_TASK_PROTECTION_LOST';
    END IF;
    IF strpos(v_def, 'FORBIDDEN_ROLE') = 0 OR strpos(v_def, 'FORBIDDEN_ROLE') > strpos(v_def, 'FROM public.bookings') THEN
        RAISE EXCEPTION 'PHASE51_AUTHZ_ORDER_LOST';
    END IF;
    IF has_function_privilege('anon', 'public.delete_booking_atomic(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE51_ANON_EXECUTE_OPEN';
    END IF;
    RAISE NOTICE 'PHASE 51 OK — silinen rezervasyonun talebi acik satisa donuyor.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (51, 'phase51_booking_delete_reopens_lead')
ON CONFLICT (version) DO NOTHING;

COMMIT;
