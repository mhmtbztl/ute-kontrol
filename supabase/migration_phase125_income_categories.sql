-- Lexbnb phase125 — gelir kategorileri (kullanici, 22.11.2026: "gider kategorileri var,
-- gelir kategorileri de eklenmeli").
--
-- Kararlar:
--   * Kategori listesi ayardir: tenant_settings 'income_categories' (gider kategorileri gibi,
--     expense_categories). Ayar defter degildir; sifirlamada silinmez (3.7). Goc gerekmez.
--   * Gelir satiri kategoriyi METIN olarak tasir (gider satiri gibi): kategori ayarlardan
--     silinse de eski kayit adini korur. Bu goc yalniz income_entries.category sutununu ekler.
--   * NULL olabilir: eski kayitlar ve sermaye girisi kategorisizdir (bilinmeyen uydurulmaz, 3.6).
--   * Dagitim sirasi: istemci sutun yoksa kategorisiz kaydeder ve bunu soyler (42703/PGRST204);
--     gelir kaydi hicbir zaman bu goc yuzunden kirilmaz.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 97) THEN
        RAISE EXCEPTION 'PHASE125_REQUIRES_PHASE97';
    END IF;
END
$pre$;

ALTER TABLE public.income_entries ADD COLUMN IF NOT EXISTS category TEXT;

DO $constraint$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'income_entries_category_check'
                      AND conrelid = 'public.income_entries'::regclass) THEN
        ALTER TABLE public.income_entries
            ADD CONSTRAINT income_entries_category_check
            CHECK (category IS NULL OR (category = btrim(category) AND char_length(category) BETWEEN 1 AND 60));
    END IF;
END
$constraint$;

DO $verify$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'income_entries'
                      AND column_name = 'category' AND is_nullable = 'YES') THEN
        RAISE EXCEPTION 'PHASE125_CATEGORY_COLUMN_MISSING';
    END IF;
    IF has_table_privilege('anon', 'public.income_entries', 'SELECT') THEN
        RAISE EXCEPTION 'PHASE125_ANON_CAN_SELECT';
    END IF;
    RAISE NOTICE 'PHASE 125 OK — gelir kaydinda kategori.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (125, 'phase125_income_categories')
ON CONFLICT (version) DO NOTHING;

COMMIT;
