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
    if (!Number.isFinite(pct) || pct <= -100 || pct > 1000) throw new Error('PRICING_RULE_PCT_INVALID');
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

  // Mulk istisnasini kaldirir; mulk yeniden portfoy kuralina / varsayilana duser.
  async function deleteRule(client, input = {}) {
    if (!client || !input.tenantId || !input.propertyId || !RULE_KEYS.includes(input.ruleKey)) throw new Error('PRICING_RULE_SCOPE_REQUIRED');
    const { error } = await client.from('property_pricing_rule_settings').delete()
      .eq('tenant_id', input.tenantId).eq('property_id', input.propertyId).eq('rule_key', input.ruleKey);
    if (error) throw error;
    return true;
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
    const payload = {
      tenant_id: input.tenantId,
      property_id: input.propertyId,
      researched_on: input.researchedOn,
      source_kind: input.sourceKind,
      source_url: url.href,
      prices,
      raw_note: String(input.rawNote || '').trim() || null
    };
    // Rakip adi phase115 sutunudur; cagiran yalniz sutun varken gonderir
    // (dagitim sirasi tuzagi, CLAUDE.md 3.4). Bos ad "adsiz" kalir (null).
    if (Object.prototype.hasOwnProperty.call(input, 'competitorName')) {
      const name = normalizeCompetitorName(input.competitorName);
      if (name && name.length > COMPETITOR_NAME_MAX) throw new Error('COMPETITOR_NAME_TOO_LONG');
      payload.competitor_name = name;
    }
    // Yanlis girilen arastirma duzeltilebilir (L-259, kullanici F.5.4).
    const query = input.id
      ? client.from('competitor_price_research').update(payload).eq('id', input.id).eq('tenant_id', input.tenantId)
      : client.from('competitor_price_research').insert(payload);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data;
  }

  async function deleteResearch(client, input = {}) {
    if (!client || !input.tenantId || !input.id) throw new Error('COMPETITOR_RESEARCH_SCOPE_REQUIRED');
    const { data, error } = await client.from('competitor_price_research').delete()
      .eq('id', input.id).eq('tenant_id', input.tenantId).select('id');
    if (error) throw error;
    if (!data || !data.length) throw new Error('COMPETITOR_RESEARCH_NOT_FOUND');
    return true;
  }

  const PRICE_TYPE_LABELS = Object.freeze({ WEEKDAY: 'Hafta içi', WEEKEND: 'Hafta sonu', SPECIAL: 'Özel gün' });
  const SOURCE_KIND_LABELS = Object.freeze({ OTA: 'OTA', WEBSITE: 'Web sitesi', CHATGPT: 'ChatGPT', MANUAL: 'Elle', OTHER: 'Diğer' });
  const ERROR_TEXT = Object.freeze({
    COMPETITOR_URL_INVALID: 'Geçerli bir kaynak bağlantısı girin (https://…).',
    COMPETITOR_RESEARCH_SCOPE_REQUIRED: 'Araştırma tarihi, kaynak türü ve mülk zorunlu.',
    COMPETITOR_RESEARCH_INPUT_REQUIRED: 'Bağlantı http/https olmalı ve en az bir fiyat girilmeli.',
    COMPETITOR_PRICE_INVALID: 'Fiyatlar sıfırdan büyük olmalı.',
    COMPETITOR_RESEARCH_NOT_FOUND: 'Araştırma kaydı bulunamadı; liste yenilendi.',
    COMPETITOR_NAME_TOO_LONG: 'Rakip adı en fazla 120 karakter olabilir.',
    PRICING_RULE_SCOPE_REQUIRED: 'Kural ve mülk seçilmeli.',
    PRICING_RULE_PCT_INVALID: 'Yüzde −99 ile 1000 arasında olmalı.'
  });
  function errorText(error) {
    const code = String(error?.message || error?.code || error || '');
    return ERROR_TEXT[code] || code || 'Bilinmeyen hata';
  }

  // Bir gunun turune gore mulkun EN YENI arastirmasindaki fiyat (L-260).
  // Oneriyi degistirmez; yalniz bilgi olarak gosterilir.
  function latestResearchPrice(rows, propertyId, type) {
    const own = (rows || []).filter(row => row && row.property_id === propertyId)
      .sort((a, b) => String(b.researched_on || '').localeCompare(String(a.researched_on || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    for (const row of own) {
      const point = (Array.isArray(row.prices) ? row.prices : []).find(item => item && item.type === type && Number(item.amount) > 0);
      if (point) return { amount: Number(point.amount), researchedOn: String(row.researched_on).slice(0, 10), sourceKind: row.source_kind, competitorName: normalizeCompetitorName(row.competitor_name) };
    }
    return null;
  }

  // ---------------------------------------------------- rakip adi (phase115) --
  const COMPETITOR_NAME_MAX = 120;
  const AVERAGE_MAX_RIVALS = 5;
  const AVERAGE_MAX_AGE_DAYS = 90;

  function normalizeCompetitorName(value) {
    const name = String(value ?? '').replace(/\s+/g, ' ').trim();
    return name || null;
  }

  // Ayni rakip buyuk/kucuk harf ve bosluk farkiyla iki kez sayilmaz.
  function competitorKey(value) {
    const name = normalizeCompetitorName(value);
    return name ? name.toLocaleLowerCase('tr-TR') : null;
  }

  const byDateAsc = (a, b) => String(a.researched_on || '').localeCompare(String(b.researched_on || '')) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
  const priceOf = (row, type) => {
    const point = (Array.isArray(row?.prices) ? row.prices : []).find(item => item && item.type === type && Number(item.amount) > 0);
    return point ? Number(point.amount) : null;
  };

  /**
   * Rakip basina fiyat gecmisi. Adi olmayan kayitlar izlenemez; yalniz sayilir.
   * groups: [{ key, name, count, first, last, latest: {WEEKDAY,...}, change: {WEEKDAY: {...}|null}, records }]
   */
  function competitorHistory(rows, propertyId) {
    const own = (rows || []).filter(row => row && row.property_id === propertyId).slice().sort(byDateAsc);
    const map = new Map();
    let unnamed = 0;
    own.forEach(row => {
      const key = competitorKey(row.competitor_name);
      if (!key) { unnamed++; return; }
      if (!map.has(key)) map.set(key, { key, name: null, records: [] });
      const group = map.get(key);
      group.name = normalizeCompetitorName(row.competitor_name);
      group.records.push(row);
    });
    const groups = [...map.values()].map(group => {
      const latest = {}, change = {};
      Object.keys(PRICE_TYPE_LABELS).forEach(type => {
        const series = group.records.map(row => ({ date: String(row.researched_on).slice(0, 10), amount: priceOf(row, type) })).filter(item => item.amount != null);
        const last = series[series.length - 1] || null;
        const previous = series[series.length - 2] || null;
        latest[type] = last ? last.amount : null;
        change[type] = last && previous
          ? { from: previous.amount, to: last.amount, diff: last.amount - previous.amount, pct: Math.round((last.amount - previous.amount) / previous.amount * 1000) / 10, fromDate: previous.date, toDate: last.date }
          : null;
      });
      return {
        key: group.key, name: group.name, count: group.records.length,
        first: String(group.records[0].researched_on).slice(0, 10),
        last: String(group.records[group.records.length - 1].researched_on).slice(0, 10),
        latest, change, records: group.records.slice().reverse()
      };
    }).sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name, 'tr'));
    return { groups, unnamed };
  }

  /**
   * Rakip ortalamasi (kullanici 08.11.2026): son 90 gunde arastirilmis, adi
   * girilmis en fazla 5 farkli rakibin EN SON fiyatinin ortalamasi; gun turune
   * gore (hafta ici / hafta sonu / ozel gun). Yalniz gosterimdir, oneriyi
   * degistirmez. Rakip yoksa null.
   */
  function competitorAverage(rows, propertyId, type, today, opts = {}) {
    const maxRivals = Number(opts.maxRivals) > 0 ? Number(opts.maxRivals) : AVERAGE_MAX_RIVALS;
    const maxAge = Number(opts.maxAgeDays) > 0 ? Number(opts.maxAgeDays) : AVERAGE_MAX_AGE_DAYS;
    const todayKey = String(today || '').slice(0, 10);
    const todayMs = Date.parse(todayKey + 'T00:00:00Z');
    if (!Number.isFinite(todayMs)) return null;
    const cutoff = new Date(todayMs - maxAge * 86400000).toISOString().slice(0, 10);
    const latestByRival = new Map();
    (rows || []).filter(row => row && row.property_id === propertyId).slice().sort(byDateAsc).forEach(row => {
      const key = competitorKey(row.competitor_name);
      const date = String(row.researched_on || '').slice(0, 10);
      const amount = priceOf(row, type);
      if (!key || amount == null || date < cutoff || date > todayKey) return;
      latestByRival.set(key, { name: normalizeCompetitorName(row.competitor_name), date, amount });
    });
    const picked = [...latestByRival.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'tr')).slice(0, maxRivals);
    if (!picked.length) return null;
    const amount = Math.round(picked.reduce((sum, item) => sum + item.amount, 0) / picked.length * 100) / 100;
    return { amount, count: picked.length, names: picked.map(item => item.name), oldest: picked[picked.length - 1].date, newest: picked[0].date, items: picked, maxRivals, maxAgeDays: maxAge };
  }

  return { RULE_KEYS, PRICE_TYPE_LABELS, SOURCE_KIND_LABELS, COMPETITOR_NAME_MAX, AVERAGE_MAX_RIVALS, AVERAGE_MAX_AGE_DAYS, mergeRules, saveRule, deleteRule, buildPricePoints, saveResearch, deleteResearch, errorText, latestResearchPrice, normalizeCompetitorName, competitorKey, competitorHistory, competitorAverage };
});
