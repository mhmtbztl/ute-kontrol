-- PHASE82 URETIM ON KONTROLU — salt okunur.
-- Phase82 uygulanmadan ONCE calistirin. Sonuc sifir satir olmali.
-- Satir donerse ayni kampanyanin o gunu kapsayan birden cok eski donemi vardir;
-- donemleri Reklamlar ekraninda duzeltmeden phase82'yi uygulamayin.

WITH expanded AS (
    SELECT p.tenant_id,
           p.campaign_id,
           p.id AS period_id,
           d::date AS day
      FROM public.ad_metric_periods p
     CROSS JOIN LATERAL generate_series(p.period_start, p.period_end, interval '1 day') d
)
SELECT tenant_id,
       campaign_id,
       day,
       array_agg(period_id ORDER BY period_id) AS conflicting_period_ids,
       COUNT(*) AS overlap_count
  FROM expanded
 GROUP BY tenant_id, campaign_id, day
HAVING COUNT(*) > 1
 ORDER BY tenant_id, campaign_id, day;
