-- Lexbnb phase115 — rakip arastirmasina rakip adi (kullanici, 08.11.2026).
--
-- phase78 `competitor_price_research` satirlari yalniz mulk + tarih tasiyordu;
-- ayni rakibin fiyatini zaman icinde izlemek ve "en fazla 5 rakibin
-- ortalamasi"ni hesaplamak icin rakibi tanimak gerekiyor.
--
-- Kararlar:
--   * Yeni tablo yok; tek sutun: `competitor_name TEXT NULL`. Eski satirlar
--     NULL kalir ("adsiz"), geriye donuk ad UYDURULMAZ (CLAUDE.md 3.6).
--   * Bos ya da yalniz bosluk ad kabul edilmez (NULL girilir); en fazla 120
--     karakter. Ayni rakibin buyuk/kucuk harf farki istemcide birlestirilir.
--   * Dagitim sirasi tuzagi (3.4): istemci sutunu yalniz goc uygulandiysa
--     gonderir; goc oncesi kayit akisi bozulmaz.
--   * Yetki, RLS, tenant_id degismezligi ve sifirlama listesi phase78/phase41
--     ile zaten kurulu; bu goc onlara dokunmaz. anon tablo yetkisi phase41'den
--     beri kapali; dogrulama blogu bunu yeniden olcer.
--   * Rakip ortalamasi oneri motoruna girmez (kullanici karari); yalniz gosterim.

BEGIN;

DO $pre$
BEGIN
    IF to_regclass('public.competitor_price_research') IS NULL THEN
        RAISE EXCEPTION 'PHASE115_REQUIRES_PHASE78';
    END IF;
END
$pre$;

ALTER TABLE public.competitor_price_research
    ADD COLUMN IF NOT EXISTS competitor_name TEXT NULL;

ALTER TABLE public.competitor_price_research
    DROP CONSTRAINT IF EXISTS competitor_price_research_competitor_name_check;
ALTER TABLE public.competitor_price_research
    ADD CONSTRAINT competitor_price_research_competitor_name_check
    CHECK (competitor_name IS NULL OR (char_length(btrim(competitor_name)) BETWEEN 1 AND 120 AND competitor_name = btrim(competitor_name)));

CREATE INDEX IF NOT EXISTS competitor_price_research_rival_idx
    ON public.competitor_price_research(tenant_id, property_id, lower(competitor_name), researched_on DESC)
    WHERE competitor_name IS NOT NULL;

-- anon phase41'den beri tablo yetkisizdir; yeni sutun bunu degistirmez.
REVOKE ALL ON public.competitor_price_research FROM anon;

DO $verify$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'competitor_price_research'
                      AND column_name = 'competitor_name' AND is_nullable = 'YES') THEN
        RAISE EXCEPTION 'PHASE115_COMPETITOR_NAME_COLUMN_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname = 'competitor_price_research_competitor_name_check'
                      AND conrelid = 'public.competitor_price_research'::regclass) THEN
        RAISE EXCEPTION 'PHASE115_COMPETITOR_NAME_CHECK_MISSING';
    END IF;
    IF has_table_privilege('anon', 'public.competitor_price_research', 'SELECT') THEN
        RAISE EXCEPTION 'PHASE115_ANON_CAN_SELECT';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgrelid = 'public.competitor_price_research'::regclass
                      AND tgname = 'trg_tenant_id_immutable' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE115_TENANT_ID_TRIGGER_MISSING';
    END IF;
    RAISE NOTICE 'PHASE 115 OK — rakip arastirmasinda rakip adi.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (115, 'phase115_competitor_name')
ON CONFLICT (version) DO NOTHING;

COMMIT;
