-- Lexbnb phase82 — reklam donemi cakisma kilidi ve atomik toplu ice aktarma.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 80) THEN
        RAISE EXCEPTION 'PHASE82_REQUIRES_PHASE80';
    END IF;
END
$pre$;

-- Bir kampanyanin her takvim gunu yalniz bir doneme ait olabilir. Bu fiziksel
-- tekillik, iki eszamanli INSERT ayni anda eski EXISTS tetikleyicisini gecse
-- bile ikinci islemi guvenli bicimde reddeder.
CREATE TABLE public.ad_metric_period_days (
    id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    period_id UUID NOT NULL REFERENCES public.ad_metric_periods(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (campaign_id, day),
    UNIQUE (period_id, day)
);

ALTER TABLE public.ad_metric_period_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ad_metric_period_days FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tenant_id_immutable
BEFORE UPDATE OF tenant_id ON public.ad_metric_period_days
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();

INSERT INTO public.ad_metric_period_days(tenant_id, campaign_id, day, period_id)
SELECT p.tenant_id, p.campaign_id, d::date, p.id
  FROM public.ad_metric_periods p
 CROSS JOIN LATERAL generate_series(p.period_start, p.period_end, interval '1 day') d;

CREATE OR REPLACE FUNCTION public.sync_ad_metric_period_days()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        DELETE FROM public.ad_metric_period_days WHERE period_id = OLD.id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        INSERT INTO public.ad_metric_period_days(tenant_id, campaign_id, day, period_id)
        SELECT NEW.tenant_id, NEW.campaign_id, d::date, NEW.id
          FROM generate_series(NEW.period_start, NEW.period_end, interval '1 day') d;
        RETURN NEW;
    END IF;
    RETURN OLD;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ADS_PERIOD_OVERLAP: Ayni kampanyanin donemleri cakismamali.'
        USING ERRCODE = '23P01';
END;
$$;

CREATE TRIGGER trg_ad_metric_period_days_delete
BEFORE DELETE ON public.ad_metric_periods
FOR EACH ROW EXECUTE FUNCTION public.sync_ad_metric_period_days();

CREATE TRIGGER trg_ad_metric_period_days_update
BEFORE UPDATE OF tenant_id, campaign_id, period_start, period_end ON public.ad_metric_periods
FOR EACH ROW EXECUTE FUNCTION public.sync_ad_metric_period_days();

CREATE TRIGGER trg_ad_metric_period_days_insert
AFTER INSERT ON public.ad_metric_periods
FOR EACH ROW EXECUTE FUNCTION public.sync_ad_metric_period_days();

CREATE TRIGGER trg_ad_metric_period_days_update_insert
AFTER UPDATE OF tenant_id, campaign_id, period_start, period_end ON public.ad_metric_periods
FOR EACH ROW EXECUTE FUNCTION public.sync_ad_metric_period_days();

CREATE OR REPLACE FUNCTION public.save_ad_metric_period_batch(
    p_tenant_id UUID,
    p_rows JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_row JSONB;
    v_ids JSONB := '[]'::jsonb;
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL OR NOT public.can_manage_tenant(p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Reklam metriklerini yonetme yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 1
       OR jsonb_array_length(p_rows) > 500 THEN
        RAISE EXCEPTION 'ADS_BATCH_INVALID: 1-500 satir gerekli.' USING ERRCODE = '22023';
    END IF;

    FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
        v_id := public.save_ad_metric_period(
            NULLIF(v_row->>'id', '')::uuid,
            p_tenant_id,
            NULLIF(v_row->>'campaign_id', '')::uuid,
            v_row->>'platform',
            NULLIF(v_row->>'period_start', '')::date,
            NULLIF(v_row->>'period_end', '')::date,
            v_row->>'result_type',
            v_row->>'result_metric',
            NULLIF(v_row->>'spend', '')::numeric,
            NULLIF(v_row->>'impressions', '')::bigint,
            NULLIF(v_row->>'reach', '')::bigint,
            NULLIF(v_row->>'clicks', '')::bigint,
            NULLIF(v_row->>'messages', '')::bigint,
            NULLIF(v_row->>'calls', '')::bigint,
            COALESCE(NULLIF(v_row->>'source', ''), 'CSV')
        );
        v_ids := v_ids || jsonb_build_array(v_id);
    END LOOP;
    RETURN jsonb_build_object('success', true, 'ids', v_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.save_ad_metric_period_batch(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ad_metric_period_batch(UUID, JSONB) TO authenticated;

DO $verify$
DECLARE v_batch TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.ad_metric_period_days'::regclass
           AND contype = 'p'
    ) THEN
        RAISE EXCEPTION 'PHASE82_DAY_UNIQUENESS_MISSING';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.ad_metric_period_days'::regclass
           AND tgname = 'trg_tenant_id_immutable' AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'PHASE82_TENANT_TRIGGER_MISSING';
    END IF;
    SELECT pg_get_functiondef('public.save_ad_metric_period_batch(uuid,jsonb)'::regprocedure) INTO v_batch;
    IF strpos(COALESCE(v_batch, ''), 'jsonb_array_elements') = 0
       OR has_function_privilege('anon', 'public.save_ad_metric_period_batch(uuid,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE82_BATCH_RPC_INVALID';
    END IF;
    RAISE NOTICE 'PHASE 82 OK — reklam ice aktarimi atomik, donem cakismasi tekillikle korunuyor.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (82, 'phase82_ads_atomic_import')
ON CONFLICT (version) DO NOTHING;

COMMIT;
