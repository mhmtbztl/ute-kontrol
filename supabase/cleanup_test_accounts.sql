-- =============================================================================
-- TEST HESAPLARI TEMİZLİĞİ
-- =============================================================================
-- NASIL KULLANILIR:
--   1. Bu dosyanın TAMAMINI kopyalayın.
--   2. Supabase Dashboard -> SQL Editor -> yapıştırın -> Run.
--   3. Alttaki "Results" / "Messages" sekmesinde raporu okuyun.
--
--   Başka hiçbir şey yapmanız gerekmiyor. Tek seferde çalışır.
--
-- NE YAPAR:
--   Yalnızca otomatik regresyon testlerinin açtığı hesapları siler. Hedef,
--   yalnızca şu test alan adlarıdır:
--       @lexbnb-e2e.test   @lexbnb.test   @lexbnbtest.com   @lexbnb-test.com
--
--   Gerçek bir müşteri adresi (gmail.com, sirketiniz.com, vb.) bu desene
--   ASLA uymaz. Silmeden önce korunacak hesapları tek tek listeler; blok
--   ayrıca desene uymayan bir hesabı silmeye kalkarsa kendini iptal eder.
--
-- ÖN KOŞUL:
--   migration_phase13_user_deletion.sql ve migration_phase14_owner_guard_fix.sql
--   çalıştırılmış olmalı. Aksi halde silme bloke olur ve blok bunu söyler.
-- =============================================================================

DO $$
DECLARE
    -- Test hesaplarini tanimlayan tek desen.
    c_test_pattern CONSTANT TEXT := '@(lexbnb-e2e\.test|lexbnb\.test|lexbnbtest\.com|lexbnb-test\.com)$';

    v_total        INT;
    v_to_delete    INT;
    v_to_keep      INT;
    v_tenants_del  INT;
    v_users_del    INT;
    r              RECORD;
BEGIN
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE email ~* c_test_pattern),
           COUNT(*) FILTER (WHERE email !~* c_test_pattern)
      INTO v_total, v_to_delete, v_to_keep
    FROM auth.users;

    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'BASLANGIC DURUMU';
    RAISE NOTICE '  Toplam hesap        : %', v_total;
    RAISE NOTICE '  Silinecek (test)    : %', v_to_delete;
    RAISE NOTICE '  Korunacak (gercek)  : %', v_to_keep;
    RAISE NOTICE '=====================================================';

    -- Korunacak hesaplari acikca listele ki gozle dogrulayabilesiniz.
    RAISE NOTICE 'KORUNACAK HESAPLAR:';
    FOR r IN
        SELECT email, created_at
        FROM auth.users
        WHERE email !~* c_test_pattern
        ORDER BY created_at
    LOOP
        RAISE NOTICE '  KORUNUYOR -> %  (kayit: %)', r.email, r.created_at::DATE;
    END LOOP;

    IF v_to_delete = 0 THEN
        RAISE NOTICE '=====================================================';
        RAISE NOTICE 'Silinecek test hesabi yok. Veritabani zaten temiz.';
        RAISE NOTICE '=====================================================';
        RETURN;
    END IF;

    -- GUVENLIK KILIDI: desene uymayan tek bir hesap bile hedeflenirse iptal et.
    IF EXISTS (
        SELECT 1 FROM auth.users
        WHERE email ~* c_test_pattern
          AND email !~* '@(lexbnb-e2e\.test|lexbnb\.test|lexbnbtest\.com|lexbnb-test\.com)$'
    ) THEN
        RAISE EXCEPTION 'GUVENLIK: hedef listesi beklenmedik bir adres iceriyor, hicbir sey silinmedi.';
    END IF;

    -- 1) Test kullanicilarinin kurdugu isletmeleri sil.
    --    properties / bookings / expenses / tenant_members bunlara cascade ile bagli.
    WITH silinen AS (
        DELETE FROM public.tenants t
        WHERE EXISTS (
            SELECT 1 FROM auth.users u
            WHERE u.id = t.created_by
              AND u.email ~* c_test_pattern
        )
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_tenants_del FROM silinen;

    -- 2) Test kullanicilarini sil.
    WITH silinen AS (
        DELETE FROM auth.users
        WHERE email ~* c_test_pattern
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_users_del FROM silinen;

    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'TEMIZLIK TAMAMLANDI';
    RAISE NOTICE '  Silinen isletme     : %', v_tenants_del;
    RAISE NOTICE '  Silinen hesap       : %', v_users_del;
    RAISE NOTICE '=====================================================';
END $$;

-- =============================================================================
-- SON DURUM (Results sekmesinde tablo olarak görünür)
-- =============================================================================
SELECT
    (SELECT COUNT(*) FROM auth.users)        AS kalan_hesap,
    (SELECT COUNT(*) FROM public.tenants)    AS kalan_isletme,
    (SELECT COUNT(*) FROM public.properties) AS kalan_mulk,
    (SELECT COUNT(*) FROM public.bookings)   AS kalan_rezervasyon,
    (SELECT COUNT(*) FROM auth.users
      WHERE email ~* '@(lexbnb-e2e\.test|lexbnb\.test|lexbnbtest\.com|lexbnb-test\.com)$')
                                             AS kalan_test_hesabi;  -- 0 OLMALI
