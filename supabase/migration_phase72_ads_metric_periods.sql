-- Lexbnb phase72 — kampanya donem metrikleri ve Finans Reklam gideri bagi.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 70) THEN
        RAISE EXCEPTION 'PHASE72_REQUIRES_PHASE70';
    END IF;
END
$pre$;

CREATE TABLE public.ad_metric_periods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    campaign_id     UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
    platform        TEXT NOT NULL CHECK (platform IN ('META', 'GOOGLE')),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    result_type     TEXT NOT NULL CHECK (result_type IN ('MESSAGE', 'CALL', 'OTHER')),
    result_metric   TEXT,
    spend           NUMERIC(14,2) CHECK (spend IS NULL OR spend >= 0),
    impressions     BIGINT CHECK (impressions IS NULL OR impressions >= 0),
    reach           BIGINT CHECK (reach IS NULL OR reach >= 0),
    clicks          BIGINT CHECK (clicks IS NULL OR clicks >= 0),
    messages        BIGINT CHECK (messages IS NULL OR messages >= 0),
    calls           BIGINT CHECK (calls IS NULL OR calls >= 0),
    source          TEXT NOT NULL CHECK (source IN ('SCREENSHOT_CHATGPT', 'MANUAL', 'CSV')),
    created_by      UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ad_metric_period_length CHECK (period_end - period_start BETWEEN 0 AND 30)
);

CREATE INDEX ad_metric_periods_tenant_date_idx ON public.ad_metric_periods(tenant_id, period_start, period_end);
CREATE INDEX ad_metric_periods_campaign_idx ON public.ad_metric_periods(campaign_id, period_start);

CREATE OR REPLACE FUNCTION public.guard_ad_metric_period_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.ad_metric_periods p
         WHERE p.tenant_id = NEW.tenant_id
           AND p.campaign_id = NEW.campaign_id
           AND p.id <> NEW.id
           AND daterange(p.period_start, p.period_end, '[]') && daterange(NEW.period_start, NEW.period_end, '[]')
    ) THEN
        RAISE EXCEPTION 'ADS_PERIOD_OVERLAP: Ayni kampanyanin donemleri cakismamali.' USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER ad_metric_period_overlap_guard
BEFORE INSERT OR UPDATE OF tenant_id, campaign_id, period_start, period_end ON public.ad_metric_periods
FOR EACH ROW EXECUTE FUNCTION public.guard_ad_metric_period_overlap();

ALTER TABLE public.ad_metric_periods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ad_metric_periods FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.ad_metric_periods TO authenticated;
CREATE POLICY ad_metric_periods_select ON public.ad_metric_periods FOR SELECT TO authenticated
USING (public.can_manage_tenant(tenant_id));

CREATE OR REPLACE FUNCTION public.save_ad_metric_period(
    p_id UUID,
    p_tenant_id UUID,
    p_campaign_id UUID,
    p_platform TEXT,
    p_period_start DATE,
    p_period_end DATE,
    p_result_type TEXT,
    p_result_metric TEXT,
    p_spend NUMERIC,
    p_impressions BIGINT,
    p_reach BIGINT,
    p_clicks BIGINT,
    p_messages BIGINT,
    p_calls BIGINT,
    p_source TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id UUID := COALESCE(p_id, gen_random_uuid());
    v_campaign_platform TEXT;
    v_cursor DATE;
    v_segment_end DATE;
    v_total_days INTEGER;
    v_segment_days INTEGER;
    v_segment_spend NUMERIC(14,2);
    v_assigned NUMERIC(14,2) := 0;
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_manage_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Reklam metriklerini yonetme yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    SELECT platform INTO v_campaign_platform FROM public.marketing_campaigns
     WHERE id = p_campaign_id AND tenant_id = p_tenant_id;
    IF v_campaign_platform IS NULL THEN
        RAISE EXCEPTION 'ADS_CAMPAIGN_NOT_FOUND';
    END IF;
    IF v_campaign_platform NOT IN ('META', 'GOOGLE') OR v_campaign_platform <> p_platform THEN
        RAISE EXCEPTION 'ADS_PLATFORM_MISMATCH';
    END IF;

    -- Onceki aylik paylari silmek kapanmis donemde expense guard ile reddedilir;
    -- metrik ve gider ayni transaction icinde oldugu icin sessiz ayrisma olmaz.
    DELETE FROM public.expenses
     WHERE tenant_id = p_tenant_id AND legacy_id LIKE 'ADS_PERIOD:' || v_id::text || ':%';

    INSERT INTO public.ad_metric_periods(id, tenant_id, campaign_id, platform, period_start, period_end,
        result_type, result_metric, spend, impressions, reach, clicks, messages, calls, source, created_by)
    VALUES (v_id, p_tenant_id, p_campaign_id, p_platform, p_period_start, p_period_end,
        p_result_type, NULLIF(btrim(COALESCE(p_result_metric, '')), ''), p_spend,
        p_impressions, p_reach, p_clicks, p_messages, p_calls, p_source, auth.uid())
    ON CONFLICT (id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id, platform = EXCLUDED.platform,
        period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end,
        result_type = EXCLUDED.result_type, result_metric = EXCLUDED.result_metric,
        spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, reach = EXCLUDED.reach,
        clicks = EXCLUDED.clicks, messages = EXCLUDED.messages, calls = EXCLUDED.calls,
        source = EXCLUDED.source, updated_at = now()
    WHERE ad_metric_periods.tenant_id = p_tenant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'ADS_PERIOD_NOT_FOUND_OR_FOREIGN'; END IF;

    IF p_spend IS NOT NULL AND p_spend > 0 THEN
        v_total_days := p_period_end - p_period_start + 1;
        v_cursor := p_period_start;
        WHILE v_cursor <= p_period_end LOOP
            v_segment_end := LEAST(
                p_period_end,
                (date_trunc('month', v_cursor::timestamp) + INTERVAL '1 month - 1 day')::date
            );
            v_segment_days := v_segment_end - v_cursor + 1;
            v_segment_spend := CASE WHEN v_segment_end = p_period_end
                THEN p_spend - v_assigned
                ELSE round(p_spend * v_segment_days / v_total_days, 2) END;
            v_assigned := v_assigned + v_segment_spend;
            INSERT INTO public.expenses(tenant_id, property_id, booking_id, expense_date, category,
                amount, description, expense_type, legacy_id, created_by)
            VALUES (p_tenant_id, NULL, NULL, v_cursor, 'Reklam', v_segment_spend,
                'Reklam harcamasi — gunlere esit bolundu (' || p_period_start || '–' || p_period_end || ')',
                'OPEX', 'ADS_PERIOD:' || v_id::text || ':' || to_char(v_cursor, 'YYYY-MM'), auth.uid());
            v_cursor := v_segment_end + 1;
        END LOOP;
    END IF;
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_ad_metric_period(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_tenant UUID;
BEGIN
    SELECT tenant_id INTO v_tenant FROM public.ad_metric_periods WHERE id = p_id;
    IF v_tenant IS NULL OR auth.uid() IS NULL OR NOT public.can_manage_tenant(v_tenant) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Reklam metrigini silme yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.expenses WHERE tenant_id = v_tenant AND legacy_id LIKE 'ADS_PERIOD:' || p_id::text || ':%';
    DELETE FROM public.ad_metric_periods WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_ad_metric_period(UUID,UUID,UUID,TEXT,DATE,DATE,TEXT,TEXT,NUMERIC,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ad_metric_period(UUID,UUID,UUID,TEXT,DATE,DATE,TEXT,TEXT,NUMERIC,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT,TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_ad_metric_period(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_ad_metric_period(UUID) TO authenticated;

DO $verify$
BEGIN
    IF has_table_privilege('authenticated', 'public.ad_metric_periods', 'INSERT')
       OR has_table_privilege('authenticated', 'public.ad_metric_periods', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.ad_metric_periods', 'DELETE') THEN
        RAISE EXCEPTION 'PHASE72_DIRECT_WRITE_OPEN';
    END IF;
    IF has_function_privilege('anon', 'public.save_ad_metric_period(uuid,uuid,uuid,text,date,date,text,text,numeric,bigint,bigint,bigint,bigint,bigint,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE72_ANON_RPC_OPEN';
    END IF;
    RAISE NOTICE 'PHASE 72 OK — reklam donemi ve Finans gideri atomik.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (72, 'phase72_ads_metric_periods')
ON CONFLICT (version) DO NOTHING;

COMMIT;
