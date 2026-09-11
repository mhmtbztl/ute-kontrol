-- =============================================================================
-- PHASE 13: HESAP SİLİNEBİLİRLİĞİ (GDPR / KVKK "UNUTULMA HAKKI")
-- =============================================================================
-- SORUN:
--   auth.users'a işaret eden 20 foreign key'de ON DELETE yan tümcesi yok.
--   PostgreSQL varsayılanı NO ACTION olduğu için bu kolonlar kullanıcı silmeyi
--   bloke ediyor. Pratik sonuç: bir tenant oluşturmuş HİÇBİR kullanıcı hesabı
--   silinemiyor ("Database error deleting user").
--
--   Bu hem KVKK/GDPR silme talebini karşılamayı imkânsız kılıyor, hem de test
--   artıklarının üretim veritabanında birikmesine yol açıyor.
--
-- ÇÖZÜM:
--   Denetim (audit) amaçlı kullanıcı kolonlarını ON DELETE SET NULL yap.
--   Kayıt (rezervasyon, gider, fatura) korunur; yalnızca "kimin oluşturduğu"
--   referansı NULL'a düşer. Veri kaybı olmaz.
--
--   NOT NULL olan kolonlara DOKUNULMAZ (örn. tenant_members.user_id zaten
--   ON DELETE CASCADE) — onlar bilinçli olarak sahiplik bağıdır.
--
-- ÇALIŞTIRMA: Supabase Dashboard -> SQL Editor -> yapıştır -> Run
-- Idempotenttir, birden fazla kez çalıştırılabilir.
-- =============================================================================

DO $$
DECLARE
    r RECORD;
    v_changed INT := 0;
    v_skipped INT := 0;
BEGIN
    FOR r IN
        SELECT
            c.conname          AS constraint_name,
            n.nspname          AS schema_name,
            t.relname          AS table_name,
            a.attname          AS column_name,
            a.attnotnull       AS is_not_null
        FROM pg_constraint c
        JOIN pg_class      t ON t.oid = c.conrelid
        JOIN pg_namespace  n ON n.oid = t.relnamespace
        JOIN pg_attribute  a ON a.attrelid = c.conrelid
                            AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
          AND c.confrelid = 'auth.users'::regclass
          AND c.confdeltype IN ('a', 'r')   -- a = NO ACTION, r = RESTRICT
          AND array_length(c.conkey, 1) = 1 -- yalnızca tek kolonlu FK'lar
          AND n.nspname = 'public'
        ORDER BY t.relname, a.attname
    LOOP
        IF r.is_not_null THEN
            -- NOT NULL kolon SET NULL olamaz; bilinçli sahiplik bağıdır, atla.
            RAISE NOTICE 'ATLANDI (NOT NULL): %.% -> %',
                r.table_name, r.column_name, r.constraint_name;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.%I DROP CONSTRAINT %I',
            r.schema_name, r.table_name, r.constraint_name
        );

        EXECUTE format(
            'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
            'REFERENCES auth.users(id) ON DELETE SET NULL',
            r.schema_name, r.table_name, r.constraint_name, r.column_name
        );

        RAISE NOTICE 'DUZELTILDI: %.% -> ON DELETE SET NULL',
            r.table_name, r.column_name;
        v_changed := v_changed + 1;
    END LOOP;

    RAISE NOTICE '---------------------------------------------';
    RAISE NOTICE 'Duzeltilen FK sayisi : %', v_changed;
    RAISE NOTICE 'Atlanan (NOT NULL)   : %', v_skipped;
END $$;

-- =============================================================================
-- DOĞRULAMA: Aşağıdaki sorgu BOŞ dönmelidir.
-- Dönen her satır, hâlâ kullanıcı silmeyi bloke eden bir FK demektir.
-- =============================================================================
SELECT
    t.relname   AS tablo,
    a.attname   AS kolon,
    c.conname   AS kisit,
    CASE c.confdeltype
        WHEN 'a' THEN 'NO ACTION (BLOKE EDER)'
        WHEN 'r' THEN 'RESTRICT (BLOKE EDER)'
    END         AS davranis
FROM pg_constraint c
JOIN pg_class      t ON t.oid = c.conrelid
JOIN pg_namespace  n ON n.oid = t.relnamespace
JOIN pg_attribute  a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
WHERE c.contype = 'f'
  AND c.confrelid = 'auth.users'::regclass
  AND c.confdeltype IN ('a', 'r')
  AND n.nspname = 'public'
  AND NOT a.attnotnull;
