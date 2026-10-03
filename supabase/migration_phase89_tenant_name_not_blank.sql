-- Lexbnb phase89 — isletme adi ve kisi adi bos metin olamaz (Codex H3-04, 03.10.2026).
--
-- Istemci bos isletme adini "Ozel Tatil Evleri", bos yonetici adini
-- "Isletme Yoneticisi" ile dolduruyordu (uydurma veri, CLAUDE.md §3.6) ve
-- create_tenant_and_owner RPC'si dogrudan cagrida bos adi kabul ediyordu.
-- Fonksiyon govdesine dokunulmaz; kural tablonun kendisinde durur, boylece
-- adi yazan her yol (kayit, ayarlar, ileride eklenecek RPC) ayni kapidan gecer.
--
-- NOT VALID: mevcut satirlar denetlenmez, yalniz yeni ve degisen satirlar.
-- profiles.full_name NULL olabilir (davetle gelen hesap); bos metin olamaz.

BEGIN;

ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_name_not_blank
    CHECK (btrim(name) <> '') NOT VALID;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_full_name_not_blank
    CHECK (full_name IS NULL OR btrim(full_name) <> '') NOT VALID;

DO $verify$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.tenants'::regclass
           AND conname = 'tenants_name_not_blank'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.profiles'::regclass
           AND conname = 'profiles_full_name_not_blank'
    ) THEN
        RAISE EXCEPTION 'PHASE89_NAME_NOT_BLANK_CONTRACT';
    END IF;
    RAISE NOTICE 'PHASE 89 OK — isletme ve kisi adi bos metin olamaz.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (89, 'phase89_tenant_name_not_blank')
ON CONFLICT (version) DO NOTHING;

COMMIT;
