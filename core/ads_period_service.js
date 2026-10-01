(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdsPeriodService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  async function loadPeriods(client, tenantId) {
    if (!client || !tenantId) return [];
    const { data, error } = await client.from('ad_metric_periods').select('*')
      .eq('tenant_id', tenantId).order('period_start', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  const nullable = value => value === '' || value === undefined || value === null ? null : value;
  const numeric = value => {
    const normalized = nullable(value);
    return normalized === null ? null : Number(normalized);
  };

  async function savePeriod(client, input = {}) {
    if (!client || !input.tenantId || !input.campaignId) throw new Error('Reklam dönemi için işletme ve kampanya zorunludur.');
    const { data, error } = await client.rpc('save_ad_metric_period', {
      p_id: nullable(input.id), p_tenant_id: input.tenantId, p_campaign_id: input.campaignId,
      p_platform: input.platform, p_period_start: input.periodStart, p_period_end: input.periodEnd,
      p_result_type: input.resultType, p_result_metric: nullable(input.resultMetric),
      p_spend: numeric(input.spend), p_impressions: numeric(input.impressions), p_reach: numeric(input.reach),
      p_clicks: numeric(input.clicks), p_messages: numeric(input.messages), p_calls: numeric(input.calls),
      p_source: input.source || 'MANUAL'
    });
    if (error) throw error;
    return data;
  }

  async function deletePeriod(client, periodId) {
    if (!client || !periodId) throw new Error('Silinecek reklam dönemi zorunludur.');
    const { data, error } = await client.rpc('delete_ad_metric_period', { p_id: periodId });
    if (error) throw error;
    return data;
  }

  return { loadPeriods, savePeriod, deletePeriod };
});
