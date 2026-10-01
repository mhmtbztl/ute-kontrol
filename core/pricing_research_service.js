(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PricingResearchService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RULE_KEYS = Object.freeze(['weekend', 'specialDay', 'demand', 'lastMinute', 'gapNight']);

  function asObject(value) {
    if (!value) return {};
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_) { return {}; }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function mergeRules(portfolioRules, propertyRows, propertyId) {
    const merged = { ...asObject(portfolioRules) };
    (propertyRows || []).filter(row => row.property_id === propertyId).forEach(row => {
      if (!RULE_KEYS.includes(row.rule_key)) return;
      merged[row.rule_key] = {
        ...asObject(merged[row.rule_key]),
        ...asObject(row.parameters),
        enabled: row.enabled === true,
        pct: Number(row.pct),
        isPropertyOverride: true
      };
    });
    return merged;
  }

  async function saveRule(client, input = {}) {
    const pct = Number(input.pct);
    if (!client || !input.tenantId || !input.propertyId || !RULE_KEYS.includes(input.ruleKey)) throw new Error('PRICING_RULE_SCOPE_REQUIRED');
    if (!Number.isFinite(pct) || pct < -100 || pct > 1000) throw new Error('PRICING_RULE_PCT_INVALID');
    const parameters = asObject(input.parameters);
    const { data, error } = await client.from('property_pricing_rule_settings').upsert({
      tenant_id: input.tenantId,
      property_id: input.propertyId,
      rule_key: input.ruleKey,
      enabled: input.enabled !== false,
      pct,
      parameters
    }, { onConflict: 'property_id,rule_key' }).select().single();
    if (error) throw error;
    return data;
  }

  function buildPricePoints(values = {}, currency = 'TRY') {
    return Object.entries(values).flatMap(([type, raw]) => {
      if (raw === '' || raw === null || raw === undefined) return [];
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('COMPETITOR_PRICE_INVALID');
      return [{ type, amount, currency }];
    });
  }

  async function saveResearch(client, input = {}) {
    let url;
    try { url = new URL(String(input.sourceUrl || '')); } catch (_) { throw new Error('COMPETITOR_URL_INVALID'); }
    const prices = buildPricePoints(input.values, input.currency || 'TRY');
    if (!client || !input.tenantId || !input.propertyId || !/^\d{4}-\d{2}-\d{2}$/.test(input.researchedOn || '') || !['CHATGPT', 'OTA', 'WEBSITE', 'MANUAL', 'OTHER'].includes(input.sourceKind)) {
      throw new Error('COMPETITOR_RESEARCH_SCOPE_REQUIRED');
    }
    if (!['http:', 'https:'].includes(url.protocol) || !prices.length) throw new Error('COMPETITOR_RESEARCH_INPUT_REQUIRED');
    const { data, error } = await client.from('competitor_price_research').insert({
      tenant_id: input.tenantId,
      property_id: input.propertyId,
      researched_on: input.researchedOn,
      source_kind: input.sourceKind,
      source_url: url.href,
      prices,
      raw_note: String(input.rawNote || '').trim() || null
    }).select().single();
    if (error) throw error;
    return data;
  }

  return { RULE_KEYS, mergeRules, saveRule, buildPricePoints, saveResearch };
});
