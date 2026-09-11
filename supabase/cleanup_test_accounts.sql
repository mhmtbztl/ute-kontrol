-- =============================================================================
-- TEST HESAPLARI TEMİZLİĞİ
-- =============================================================================
-- migration_phase13_user_deletion.sql ÇALIŞTIRILDIKTAN SONRA kullanılır.
-- Öncesinde çalıştırırsanız foreign key'ler silmeyi bloke eder.
--
-- Regresyon test koşucusu (run_all_tests.js) her koşuda Supabase'de gerçek
-- kullanıcı açıyor ve temizliği tam çalışmıyor. Bu dosya artıkları siler.
--
-- ÇALIŞTIRMA: Supabase Dashboard -> SQL Editor
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ADIM 1: ÖNCE SAYIMI GÖR (hiçbir şey silmez — önce bunu çalıştırın)
-- -----------------------------------------------------------------------------
SELECT
    COUNT(*) FILTER (WHERE email ~* '@(lexbnb-e2e\.test|lexbnb\.test|lexbnbtest\.com|lexbnb-test\.com)$') AS silinecek_test_hesabi,
    COUNT(*) FILTER (WHERE email !~* '@(lexbnb-e2e\.test|lexbnb\.test|lexbnbtest\.com|lexbnb-test\.com)$') AS korunacak_gercek_hesap,
    COUNT(*) AS toplam
FROM auth.users;

-- -----------------------------------------------------------------------------
-- ADIM 2: KORUNACAK HESAPLARI GÖZLE DOĞRULAYIN
-- Bu listede silinmesini istemediğiniz TÜM adresler görünmeli.
-- -----------------------------------------------------------------------------
SELECT email, created_at, email_confirmed_at
FROM auth.users
WHERE email !~* '@(lexbnb-e2e\.test|lexbnb\.test|lexbnbtest\.com|lexbnb-test\.com)$'
ORDER BY created_at;

-- -----------------------------------------------------------------------------
-- ADIM 3: SİLME
-- Yukarıdaki listeyi doğruladıktan SONRA bu bloğu çalıştırın.
-- Yalnızca test alan adlarını hedefler; gerçek müşteri adresleri eşleşmez.
-- tenants/properties/bookings, tenant_members üzerinden CASCADE ile temizlenir.
-- -----------------------------------------------------------------------------
-- Once sahipsiz kalacak tenant'lari sil (created_by artik SET NULL oldugu icin
-- kullanicilar silinince tenant'lar ortada kalirdi).
DELETE FROM public.tenants t
WHERE EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = t.created_by
      AND u.email ~* '@(lexbnb-e2e\.test|lexbnb\.test|lexbnbtest\.com|lexbnb-test\.com)$'
);

DELETE FROM auth.users
WHERE email ~* '@(lexbnb-e2e\.test|lexbnb\.test|lexbnbtest\.com|lexbnb-test\.com)$';

-- -----------------------------------------------------------------------------
-- ADIM 4: DOĞRULAMA
-- -----------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM auth.users)        AS kalan_hesap,
    (SELECT COUNT(*) FROM public.tenants)    AS kalan_tenant,
    (SELECT COUNT(*) FROM public.properties) AS kalan_mulk,
    (SELECT COUNT(*) FROM public.bookings)   AS kalan_rezervasyon;
