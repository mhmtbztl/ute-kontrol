-- =============================================================================
-- LEXBNB PHASE 47 — REZERVASYON SILME YAPILMIS TEMIZLIGI SILMEZ (K-04)
-- =============================================================================
-- phase45'ten beri temizlik gideri "yapildi" aninda dogar. delete_booking_atomic
-- ise rezervasyonla birlikte ODENMEMIS her gorevi siliyordu; yapilmis ama
-- henuz odenmemis bir temizlik gerceklesmis bir gider ve personele borctur,
-- rezervasyonun silinmesiyle yok olmamali.
--
-- Artik yalniz YAPILMAMIS (planli / yapilmadi) ve odenmemis gorevler silinir.
-- Yapilmis ya da odenmis gorevin booking_id'si FK ile (ON DELETE SET NULL)
-- kendiliginden bosalir. Yetki kapisi phase41 ile ayni, kayit aramadan once.
--
-- phase45'e baglidir (cleaning_tasks.status).
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

    -- Kapanmis donem korumasi burada devreye girerse EXCEPTION firlar ve
    -- yukaridaki temizlik silme de GERI ALINIR.
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

DO $verify$
DECLARE
    v_def TEXT;
BEGIN
    v_def := pg_get_functiondef('public.delete_booking_atomic(uuid,uuid)'::regprocedure);
    IF strpos(v_def, 'status <> ''DONE''') = 0 THEN
        RAISE EXCEPTION 'PHASE47_DONE_TASK_NOT_PROTECTED';
    END IF;
    IF strpos(v_def, 'FORBIDDEN_ROLE') = 0 OR strpos(v_def, 'FORBIDDEN_ROLE') > strpos(v_def, 'FROM public.bookings') THEN
        RAISE EXCEPTION 'PHASE47_AUTHZ_ORDER_LOST';
    END IF;
    IF has_function_privilege('anon', 'public.delete_booking_atomic(uuid,uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE47_ANON_EXECUTE_OPEN';
    END IF;
    RAISE NOTICE 'PHASE 47 OK — rezervasyon silme yapilmis temizligi koruyor.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (47, 'phase47_booking_delete_keeps_done_cleaning')
ON CONFLICT (version) DO NOTHING;

COMMIT;
