-- =============================================================================
-- PHASE 18: HESAP KAPATMA (KVKK / GDPR "UNUTULMA HAKKI")
-- =============================================================================
-- NEDEN:
--   Phase 13/14/15 ile silme teknik olarak MUMKUN hale geldi, ama kullanicinin
--   kendi hesabini kapatabilecegi bir yol yok. Tarayici auth.admin.deleteUser
--   cagiramaz (service_role gerekir), dolayisiyla bu ancak SECURITY DEFINER bir
--   fonksiyonla yapilabilir.
--
--   Ticari bir SaaS icin bu zorunlu: musteri hesabini kapatamiyorsa KVKK/GDPR
--   silme talebini karsilayamazsiniz.
--
-- BU GOC NE EKLER:
--   1. get_account_deletion_impact() - silmeden ONCE ne kaybedilecegini gosterir
--   2. delete_my_account(p_confirmation) - hesabi ve gerekirse isletmeleri siler
--
-- DAVRANIS:
--   * Kullanicinin TEK sahibi oldugu isletmeler SILINIR (tum verisiyle birlikte).
--   * Baska sahibi de olan isletmelerde yalnizca UYELIK kaldirilir; isletme ve
--     verisi digerlerinde kalir.
--   * Devretmek isteyen bir kullanici, once Ekip ekranindan bir uyeyi 'owner'
--     yapabilir; o zaman isletme silinmez.
--
-- GUVENLIK:
--   * Yalnizca CAGIRANIN KENDI hesabini siler. Baskasinin id'si alinmaz.
--   * Yanlislikla calismayi onlemek icin metinsel onay zorunludur.
--
-- CALISTIRMA: Supabase Dashboard -> SQL Editor -> tamamini yapistir -> Run
-- Idempotenttir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SILME ETKISI ONIZLEMESI
--    Arayuz, kullaniciya TAM OLARAK neyin gidecegini gostermek icin cagirir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_account_deletion_impact()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_result JSON;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Oturum açılmamış! Lütfen önce giriş yapın.';
    END IF;

    SELECT json_build_object(
        'email', (SELECT u.email FROM auth.users u WHERE u.id = v_uid),
        -- Tek sahibi oldugu isletmeler: SILINECEK
        'tenants_to_delete', COALESCE((
            SELECT json_agg(json_build_object(
                'id', t.id,
                'name', t.name,
                'properties', (SELECT COUNT(*) FROM public.properties p WHERE p.tenant_id = t.id),
                'bookings',   (SELECT COUNT(*) FROM public.bookings b WHERE b.tenant_id = t.id),
                'members',    (SELECT COUNT(*) FROM public.tenant_members m WHERE m.tenant_id = t.id)
            ))
            FROM public.tenants t
            JOIN public.tenant_members tm ON tm.tenant_id = t.id AND tm.user_id = v_uid
            WHERE tm.role = 'owner'
              AND (SELECT COUNT(*) FROM public.tenant_members o
                   WHERE o.tenant_id = t.id AND o.role = 'owner') = 1
        ), '[]'::JSON),
        -- Baska sahibi de olan isletmeler: yalnizca uyelik kalkacak
        'tenants_to_leave', COALESCE((
            SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'role', tm.role))
            FROM public.tenants t
            JOIN public.tenant_members tm ON tm.tenant_id = t.id AND tm.user_id = v_uid
            WHERE tm.role <> 'owner'
               OR (SELECT COUNT(*) FROM public.tenant_members o
                   WHERE o.tenant_id = t.id AND o.role = 'owner') > 1
        ), '[]'::JSON)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. HESABI SIL
--    p_confirmation, arayuzun kullaniciya yazdirdigi onay metnidir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account(p_confirmation TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid            UUID;
    v_email          TEXT;
    v_deleted_tenants INT := 0;
    v_left_tenants    INT := 0;
    r                RECORD;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Oturum açılmamış! Lütfen önce giriş yapın.';
    END IF;

    -- Yanlislikla silmeye karsi metinsel onay
    IF upper(trim(coalesce(p_confirmation, ''))) <> 'HESABIMI SIL' THEN
        RAISE EXCEPTION 'Onay metni hatalı. Devam etmek için "HESABIMI SIL" yazmalısınız.';
    END IF;

    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;

    -- 1) Tek sahibi oldugu isletmeleri sil (verisi cascade ile gider)
    FOR r IN
        SELECT t.id
        FROM public.tenants t
        JOIN public.tenant_members tm ON tm.tenant_id = t.id AND tm.user_id = v_uid
        WHERE tm.role = 'owner'
          AND (SELECT COUNT(*) FROM public.tenant_members o
               WHERE o.tenant_id = t.id AND o.role = 'owner') = 1
    LOOP
        DELETE FROM public.tenants WHERE id = r.id;
        v_deleted_tenants := v_deleted_tenants + 1;
    END LOOP;

    -- 2) Kalan isletmelerden yalnizca uyeligi kaldir
    SELECT COUNT(*) INTO v_left_tenants
    FROM public.tenant_members WHERE user_id = v_uid;

    DELETE FROM public.tenant_members WHERE user_id = v_uid;

    -- 3) Bu adrese gonderilmis bekleyen davetleri iptal et
    UPDATE public.tenant_invitations
       SET status = 'REVOKED'
     WHERE status = 'PENDING' AND lower(email) = lower(v_email);

    -- 4) Profil ve auth kaydini sil
    DELETE FROM public.profiles WHERE id = v_uid;
    DELETE FROM auth.users WHERE id = v_uid;

    RETURN json_build_object(
        'deleted', TRUE,
        'deleted_tenants', v_deleted_tenants,
        'left_tenants', v_left_tenants
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. YETKILER
--
-- ONEMLI: Supabase, public semasindaki YENI fonksiyonlara varsayilan olarak
-- `anon` rolune EXECUTE verir (ALTER DEFAULT PRIVILEGES). `REVOKE ... FROM PUBLIC`
-- bunu KALDIRMAZ, cunku anon'a verilen ayri ve acik bir yetkidir. anon'u ayrica
-- revoke etmek gerekir.
--
-- Bu eksik yalnizca bu gocte degil: create_tenant_and_owner ve tum Phase 16
-- fonksiyonlari da yalnizca PUBLIC'ten revoke ediyordu. Hepsi burada kapatilir.
-- (Fonksiyon govdeleri zaten auth.uid() kontrolu yapiyor; bu ikinci savunma
--  hattidir, tek hat degil.)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_sig TEXT;
    v_sigs TEXT[] := ARRAY[
        'public.get_account_deletion_impact()',
        'public.delete_my_account(TEXT)',
        'public.create_tenant_invitation(UUID, TEXT, TEXT)',
        'public.accept_pending_invitations()',
        'public.revoke_tenant_invitation(UUID)',
        'public.get_tenant_members(UUID)',
        'public.get_tenant_invitations(UUID)',
        'public.create_tenant_and_owner(TEXT, TEXT)',
        'public.is_tenant_member(UUID)',
        'public.get_tenant_role(UUID)'
    ];
BEGIN
    FOREACH v_sig IN ARRAY v_sigs LOOP
        -- Fonksiyon yoksa (ilgili goc calistirilmamissa) atla.
        IF to_regprocedure(v_sig) IS NULL THEN
            RAISE NOTICE 'ATLANDI (yok): %', v_sig;
            CONTINUE;
        END IF;
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    END LOOP;
END $$;

-- =============================================================================
-- DOGRULAMA
-- =============================================================================
DO $$
DECLARE
    v_sig TEXT;
    v_leaky TEXT[] := '{}';
    v_sigs TEXT[] := ARRAY[
        'public.get_account_deletion_impact()',
        'public.delete_my_account(TEXT)',
        'public.create_tenant_invitation(UUID, TEXT, TEXT)',
        'public.accept_pending_invitations()',
        'public.revoke_tenant_invitation(UUID)',
        'public.get_tenant_members(UUID)',
        'public.get_tenant_invitations(UUID)',
        'public.create_tenant_and_owner(TEXT, TEXT)'
    ];
BEGIN
    IF to_regprocedure('public.get_account_deletion_impact()') IS NULL
       OR to_regprocedure('public.delete_my_account(TEXT)') IS NULL THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: hesap kapatma fonksiyonlari olusmadi';
    END IF;

    FOREACH v_sig IN ARRAY v_sigs LOOP
        IF to_regprocedure(v_sig) IS NOT NULL
           AND has_function_privilege('anon', v_sig, 'EXECUTE') THEN
            v_leaky := array_append(v_leaky, v_sig);
        END IF;
    END LOOP;

    IF array_length(v_leaky, 1) > 0 THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: anon su fonksiyonlari cagirabiliyor: %',
            array_to_string(v_leaky, ', ');
    END IF;

    -- authenticated hala cagirabilmeli, yoksa uygulama calismaz
    IF NOT has_function_privilege('authenticated', 'public.delete_my_account(TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: authenticated delete_my_account cagiramiyor!';
    END IF;

    RAISE NOTICE 'DOGRULAMA: OK - fonksiyonlar yerinde, anon erisimi kapali, authenticated erisimi acik.';
END $$;
