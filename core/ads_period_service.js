(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdsPeriodService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Backend maliyeti (kullanıcı, 05.11.2026): yalnız ekranın kullandığı sütunlar ve
  // yalnız istenen tarih aralığına değen dönemler çekilir. `range` yoksa tüm geçmiş.
  const PERIOD_COLUMNS = 'id, campaign_id, platform, period_start, period_end, result_type, result_metric, '
    + 'spend, impressions, reach, clicks, messages, calls, results, extra_metrics, daily_metrics, source';

  async function loadPeriods(client, tenantId, range = {}) {
    if (!client || !tenantId) return [];
    let query = client.from('ad_metric_periods').select(PERIOD_COLUMNS).eq('tenant_id', tenantId);
    if (range.campaignIds) query = query.in('campaign_id', range.campaignIds);
    if (range.from) query = query.gte('period_end', range.from);
    if (range.to) query = query.lte('period_start', range.to);
    const { data, error } = await query.order('period_start', { ascending: false });
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

  async function savePeriodsAtomic(client, tenantId, rows = []) {
    if (!client || !tenantId || !Array.isArray(rows) || !rows.length) throw new Error('İçe aktarılacak reklam dönemleri zorunludur.');
    const payload = rows.map(input => ({
      id: nullable(input.id), campaign_id: input.campaignId, platform: input.platform,
      period_start: input.periodStart, period_end: input.periodEnd, result_type: input.resultType,
      result_metric: nullable(input.resultMetric), spend: numeric(input.spend),
      impressions: numeric(input.impressions), reach: numeric(input.reach), clicks: numeric(input.clicks),
      messages: numeric(input.messages), calls: numeric(input.calls), source: input.source || 'CSV'
    }));
    const { data, error } = await client.rpc('save_ad_metric_period_batch', {
      p_tenant_id: tenantId, p_rows: payload
    });
    if (error) throw error;
    return data;
  }

  // phase111: eşleşmeyen kampanyaları açar, dosyanın tamamen kapsadığı eski
  // dönemleri değiştirir; hepsi tek işlemde. Satır ya mevcut `campaignId` ya da
  // `newCampaigns` içindeki geçici `campaignKey` taşır. phase113: kampanya × ay
  // satırı günlük kırılımı `daily` dizisinde taşır (AdsImportParser.compactDaily).
  async function importBatch(client, tenantId, newCampaigns = [], rows = []) {
    if (!client || !tenantId || !Array.isArray(rows) || !rows.length) throw new Error('İçe aktarılacak reklam dönemleri zorunludur.');
    const campaigns = (newCampaigns || []).map(item => ({
      key: item.key, name: item.name, platform: item.platform, budget: numeric(item.budget)
    }));
    const payload = rows.map(input => {
      const extra = input.extraMetrics && typeof input.extraMetrics === 'object' && Object.keys(input.extraMetrics).length ? input.extraMetrics : null;
      return {
        campaign_id: nullable(input.campaignId), campaign_key: nullable(input.campaignKey), platform: input.platform,
        period_start: input.periodStart, period_end: input.periodEnd, result_type: input.resultType,
        result_metric: nullable(input.resultMetric), spend: numeric(input.spend),
        impressions: numeric(input.impressions), reach: numeric(input.reach), clicks: numeric(input.clicks),
        messages: numeric(input.messages), calls: numeric(input.calls), results: numeric(input.results),
        extra_metrics: extra, daily: Array.isArray(input.daily) && input.daily.length ? input.daily : null,
        source: input.source || 'CSV'
      };
    });
    const { data, error } = await client.rpc('import_ad_metric_batch', {
      p_tenant_id: tenantId, p_new_campaigns: campaigns, p_rows: payload
    });
    if (error) {
      // Göç uygulanmadan yayına çıkan kod: kullanıcıya nedeni söylenir (§4.2 dağıtım sırası).
      if (error.code === 'PGRST202' || /Could not find the function/i.test(String(error.message || ''))) {
        const missing = new Error('PHASE111_NOT_APPLIED: Reklam içe aktarma güncellemesi (phase111) veritabanına henüz uygulanmadı.');
        missing.code = 'PHASE111_NOT_APPLIED';
        throw missing;
      }
      throw error;
    }
    return data;
  }

  return { PERIOD_COLUMNS, loadPeriods, savePeriod, savePeriodsAtomic, importBatch, deletePeriod };
});
