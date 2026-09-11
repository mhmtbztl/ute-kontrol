-- =============================================================================
-- PHASE 14: SON-SAHİP KORUMASININ SİLME İŞLEMLERİNİ KİLİTLEMESİNİ GİDER
-- =============================================================================
-- SORUN:
--   trg_guard_last_tenant_owner, bir işletmenin son owner'ının silinmesini
--   engelliyor. Amaç doğru: kimse işletmeyi sahipsiz bırakamamalı.
--
--   Ancak korumanın, ÜST KAYDIN ZATEN SİLİNİYOR OLDUĞU durum için istisnası yok.
--   PostgreSQL ON DELETE CASCADE'i önce üst satırı siler, sonra alt satırları;
--   yani tenant_members'a gelen cascade silme de bu korumaya takılıyor:
--
--     DELETE FROM tenants        -> cascade -> tenant_members -> "son sahip silinemez"
--     DELETE FROM auth.users     -> cascade -> tenant_members -> "son sahip silinemez"
--
--   Pratik sonuç:
--     * Bir işletme HİÇBİR ZAMAN silinemiyor.
--     * Bir işletme kurmuş HİÇBİR kullanıcı silinemiyor
--       ("Database error deleting user").
--
--   Ticari SaaS için bu iki sert engel demek: müşteri hesabını kapatamıyorsunuz
--   ve KVKK/GDPR "unutulma hakkı" talebini karşılayamıyorsunuz.
--
-- ÇÖZÜM:
--   Koruma yalnızca GERÇEK bir rol değişikliğinde / üye çıkarmada devreye girsin.
--   Üst kayıt (tenant veya auth.users) zaten gitmişse sessizce izin ver.
--
--   Doğrudan "son owner'ı çıkar" denemesi HÂLÂ engellenir — koruma kaybolmaz.
--
-- ÇALIŞTIRMA: Supabase Dashboard -> SQL Editor -> yapıştır -> Run
-- Idempotenttir.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_guard_last_tenant_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_owner_count INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Ust kayit zaten silindiyse bu bir cascade'dir, kullanicinin
        -- "son sahibi cikarma" girisimi degil. Korumayi uygulama.
        IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN
            RETURN OLD;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
            RETURN OLD;
        END IF;
    END IF;

    IF (TG_OP = 'DELETE' AND OLD.role = 'owner') OR
       (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner') THEN

        SELECT COUNT(*) INTO v_owner_count
        FROM public.tenant_members
        WHERE tenant_id = OLD.tenant_id AND role = 'owner' AND id <> OLD.id;

        IF v_owner_count = 0 THEN
            RAISE EXCEPTION 'İşletmenin son sahibi (owner) silinemez veya rolü düşürülemez!';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- =============================================================================
-- DOĞRULAMA 1: Phase 13 gerçekten uygulandı mı?
-- Bu sorgu BOŞ dönmelidir. Satır dönüyorsa migration_phase13'ü çalıştırın.
-- =============================================================================
SELECT
    t.relname AS tablo,
    a.attname AS kolon,
    c.conname AS kisit,
    'ON DELETE yok -> kullanici silmeyi bloke eder' AS sorun
FROM pg_constraint c
JOIN pg_class      t ON t.oid = c.conrelid
JOIN pg_namespace  n ON n.oid = t.relnamespace
JOIN pg_attribute  a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f'
  AND c.confrelid = 'auth.users'::regclass
  AND c.confdeltype IN ('a', 'r')
  AND n.nspname = 'public'
  AND NOT a.attnotnull;

-- =============================================================================
-- DOĞRULAMA 2: Koruma hâlâ çalışıyor mu?
-- Aşağıdaki blok, gerçek bir "son sahibi çıkar" denemesinin HÂLÂ
-- engellendiğini doğrular ve hiçbir kalıcı değişiklik bırakmaz.
-- =============================================================================
DO $$
DECLARE
    v_tenant UUID;
    v_user   UUID;
    v_member UUID;
    v_blocked BOOLEAN := FALSE;
BEGIN
    SELECT tm.tenant_id, tm.user_id, tm.id
      INTO v_tenant, v_user, v_member
    FROM public.tenant_members tm
    WHERE tm.role = 'owner'
      AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tm.tenant_id)
      AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = tm.user_id)
      AND (SELECT COUNT(*) FROM public.tenant_members x
           WHERE x.tenant_id = tm.tenant_id AND x.role = 'owner') = 1
    LIMIT 1;

    IF v_member IS NULL THEN
        RAISE NOTICE 'DOGRULAMA 2: test edilecek tek-sahipli isletme yok, atlandi.';
        RETURN;
    END IF;

    BEGIN
        DELETE FROM public.tenant_members WHERE id = v_member;
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;

    IF v_blocked THEN
        RAISE NOTICE 'DOGRULAMA 2: OK - son sahibi dogrudan cikarma HALA engelleniyor.';
    ELSE
        RAISE EXCEPTION 'DOGRULAMA 2: BASARISIZ - koruma artik calismiyor, degisiklik geri alindi!';
    END IF;
END $$;
