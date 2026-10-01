-- Lexbnb phase80 — phase78 rakip arastirmasi is tarihi duzeltmesi.
--
-- CURRENT_DATE Supabase oturumunda UTC'dir. Istanbul'da 00:00–02:59 arasinda
-- bugunun arastirmasi UTC'ye gore "gelecek" gorunup reddediliyordu. Phase78
-- test projesine uygulandigi icin degistirilmez; CHECK yeni phase ile duzelir.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 78) THEN
        RAISE EXCEPTION 'PHASE80_REQUIRES_PHASE78';
    END IF;
END
$pre$;

ALTER TABLE public.competitor_price_research
    DROP CONSTRAINT competitor_price_research_researched_on_check;
ALTER TABLE public.competitor_price_research
    ADD CONSTRAINT competitor_price_research_researched_on_check
    CHECK (researched_on <= (now() AT TIME ZONE 'Europe/Istanbul')::date);

DO $verify$
DECLARE v_def TEXT;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_def
      FROM pg_constraint
     WHERE conrelid = 'public.competitor_price_research'::regclass
       AND conname = 'competitor_price_research_researched_on_check';
    IF strpos(COALESCE(v_def, ''), 'Europe/Istanbul') = 0 THEN
        RAISE EXCEPTION 'PHASE80_BUSINESS_DATE_CHECK_MISSING';
    END IF;
    RAISE NOTICE 'PHASE 80 OK — rakip arastirmasi Istanbul is tarihini kullanir.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (80, 'phase80_research_business_date')
ON CONFLICT (version) DO NOTHING;

COMMIT;
