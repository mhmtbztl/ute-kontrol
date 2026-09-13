-- =============================================================================
-- LEXBNB PHASE 17 — SEASONAL MEDIA TAGS
-- Tags support advisory cover review; no automatic placement mutation exists.
-- =============================================================================

ALTER TABLE public.property_media
    ADD COLUMN IF NOT EXISTS season_tags TEXT[] NOT NULL DEFAULT ARRAY['ALL_SEASON']::TEXT[];

ALTER TABLE public.property_media
    DROP CONSTRAINT IF EXISTS chk_property_media_season_tags;
ALTER TABLE public.property_media
    ADD CONSTRAINT chk_property_media_season_tags CHECK (
        cardinality(season_tags) > 0
        AND season_tags <@ ARRAY['ALL_SEASON', 'WINTER', 'SPRING', 'SUMMER', 'AUTUMN']::TEXT[]
    );

CREATE INDEX IF NOT EXISTS idx_property_media_season_tags
    ON public.property_media USING GIN (season_tags);

-- Intentionally no trigger changes channel_media_placements or is_cover.
