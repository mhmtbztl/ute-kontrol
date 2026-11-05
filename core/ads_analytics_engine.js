// Reklam analiz motoru (Aşama 4, 05.11.2026) — saf; grafikler, KPI şeridi,
// kurallı yorumlar ve ChatGPT istemi aynı sonucu kullanır.
//
// Kurallar:
//   * Günlük kırılımı olan dönem (phase113 `daily_metrics`) seçili aralığa gün gün
//     kırpılır. Olmayan çok günlük dönem Finans'ın gider dağıtımıyla aynı biçimde
//     gün oranıyla kırpılır, ama grafikte günlere YAYILMAZ (uydurma eğri olurdu);
//     ayrı blok olarak döner.
//   * Erişim tekil kişidir: iki dönem/kampanya toplanamaz, kırpılan dönemde bilinmez.
//   * Farklı sonuç göstergeleri (mesaj + profil ziyareti) tek "sonuç" sayısına
//     toplanmaz. Mesaj başına ücret yalnız mesaj kampanyalarının harcamasıyla.
//   * Ölçülemeyen her değer null; ekranda "—".
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./ads_metric_glossary') : root.AdsMetricGlossary);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdsAnalyticsEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Glossary) {
  'use strict';

  const DAY = 86400000;
  const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const num = value => value === null || value === undefined || value === '' ? null : Number(value);
  const toTime = iso => Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z');
  const toIso = time => new Date(time).toISOString().slice(0, 10);
  const addDays = (iso, days) => toIso(toTime(iso) + days * DAY);
  const daysBetween = (start, end) => Math.floor((toTime(end) - toTime(start)) / DAY) + 1;
  const addMeasured = (left, right) => left === null && right === null ? null : round((left || 0) + (right || 0));
  const COUNTERS = ['spend', 'impressions', 'clicks', 'messages', 'calls', 'results'];

  function normalizePeriod(row) {
    const resultType = row.resultType || row.result_type || 'OTHER';
    const messages = num(row.messages), calls = num(row.calls);
    let results = num(row.results);
    if (results === null) results = resultType === 'MESSAGE' ? messages : resultType === 'CALL' ? calls : null;
    const daily = Array.isArray(row.daily) ? row.daily : Array.isArray(row.daily_metrics) ? row.daily_metrics : null;
    return {
      id: row.id || null, campaignId: String(row.campaignId || row.campaign_id || ''), platform: row.platform || null,
      resultType, resultMetric: row.resultMetric || row.result_metric || null,
      periodStart: String(row.periodStart || row.period_start || '').slice(0, 10), periodEnd: String(row.periodEnd || row.period_end || '').slice(0, 10),
      spend: num(row.spend), impressions: num(row.impressions), reach: num(row.reach), clicks: num(row.clicks),
      messages, calls, results,
      daily: daily ? daily.map(day => ({ d: String(day.d), s: num(day.s), i: num(day.i), c: num(day.c), r: num(day.r) })) : null
    };
  }

  // Dönemin [start, end] (dahil) aralığına düşen kısmı. Aralık yoksa dönemin tamamı.
  function clip(period, start, end) {
    if (!period.periodStart || !period.periodEnd) return null;
    if (!start || !end) return { ...period, prorated: false, whole: true };
    const from = period.periodStart > start ? period.periodStart : start;
    const to = period.periodEnd < end ? period.periodEnd : end;
    if (to < from) return null;
    if (from === period.periodStart && to === period.periodEnd) return { ...period, prorated: false, whole: true };
    const base = { ...period, periodStart: from, periodEnd: to, reach: null, whole: false };
    if (period.daily) {
      const days = period.daily.filter(day => day.d >= from && day.d <= to);
      const sum = key => days.reduce((total, day) => addMeasured(total, day[key]), null);
      const results = sum('r');
      return { ...base, prorated: false, daily: days, spend: days.length ? round(days.reduce((t, day) => t + (day.s || 0), 0)) : 0,
        impressions: sum('i'), clicks: sum('c'), results,
        messages: period.resultType === 'MESSAGE' ? results : null, calls: period.resultType === 'CALL' ? results : null };
    }
    const share = daysBetween(from, to) / daysBetween(period.periodStart, period.periodEnd);
    const scaled = {};
    // Harcama Finans'ın gider dağıtımıyla aynı (kuruş); sayaçlar tam sayı kalır.
    COUNTERS.forEach(key => { scaled[key] = period[key] === null ? null : key === 'spend' ? round(period[key] * share) : Math.round(period[key] * share); });
    return { ...base, ...scaled, prorated: true };
  }

  function aggregate(parts, leads) {
    const totals = {};
    COUNTERS.forEach(key => { totals[key] = parts.reduce((sum, part) => addMeasured(sum, part[key]), null); });
    const metrics = new Set(parts.filter(part => part.results !== null).map(part => part.resultMetric || part.resultType));
    const notes = [];
    if (metrics.size > 1) { totals.results = null; notes.push('RESULT_TYPES_MIXED'); }
    totals.reach = parts.length === 1 && parts[0].whole ? parts[0].reach : null;
    if (parts.length > 1 && parts.some(part => part.reach !== null)) notes.push('REACH_NOT_ADDITIVE');
    if (parts.some(part => part.prorated)) notes.push('PRORATED');
    const spendOf = type => {
      const own = parts.filter(part => part.resultType === type);
      return own.length ? own.reduce((sum, part) => addMeasured(sum, part.spend), null) : null;
    };
    totals.messageSpend = spendOf('MESSAGE');
    totals.callSpend = spendOf('CALL');
    totals.leads = leads === undefined ? null : num(leads);
    return { totals, metrics: Glossary.derive(totals), notes };
  }

  function priorRangeOf(range) {
    if (!range || !range.start || !range.endExclusive) return null;
    const duration = Math.round((toTime(range.endExclusive) - toTime(range.start)) / DAY);
    return { start: addDays(range.start, -duration), endExclusive: range.start };
  }

  function dailySeries(parts, start, end) {
    const byDay = new Map(), blocks = [];
    const add = (d, s, i, c, r) => {
      const day = byDay.get(d) || { date: d, spend: null, impressions: null, clicks: null, results: null };
      day.spend = addMeasured(day.spend, s); day.impressions = addMeasured(day.impressions, i);
      day.clicks = addMeasured(day.clicks, c); day.results = addMeasured(day.results, r);
      byDay.set(d, day);
    };
    parts.forEach(part => {
      if (part.daily) part.daily.forEach(day => add(day.d, day.s, day.i, day.c, day.r));
      else if (part.periodStart === part.periodEnd) add(part.periodStart, part.spend, part.impressions, part.clicks, part.results);
      else blocks.push({ campaignId: part.campaignId, start: part.periodStart, end: part.periodEnd, spend: part.spend, impressions: part.impressions, clicks: part.clicks, results: part.results });
    });
    const known = [...byDay.keys()].sort();
    const first = start || known[0], last = end || known[known.length - 1];
    const days = [];
    if (first && last) for (let t = toTime(first); t <= toTime(last); t += DAY) {
      const iso = toIso(t);
      days.push(byDay.get(iso) || { date: iso, spend: null, impressions: null, clicks: null, results: null });
    }
    // DAILY: hepsi günlük · PARTIAL: günlük + blok · PERIODS: yalnız çok günlük blok · NONE: veri yok.
    const coverage = known.length ? (blocks.length ? 'PARTIAL' : 'DAILY') : (blocks.length ? 'PERIODS' : 'NONE');
    return { days, blocks, coverage };
  }

  // input: { periods, campaigns, range: {start, endExclusive} | null, leads: {current, prior} }
  function analyze(input = {}) {
    const periods = (input.periods || []).map(normalizePeriod);
    const range = input.range && input.range.start && input.range.endExclusive ? input.range : null;
    const prior = priorRangeOf(range);
    const window = r => r ? [r.start, addDays(r.endExclusive, -1)] : [null, null];
    const [start, end] = window(range);
    const [pStart, pEnd] = window(prior);
    const parts = periods.map(period => clip(period, start, end)).filter(Boolean);
    const priorParts = prior ? periods.map(period => clip(period, pStart, pEnd)).filter(Boolean) : [];
    const leads = input.leads || {};
    const current = aggregate(parts, leads.current);
    const previous = prior ? aggregate(priorParts, leads.prior) : null;

    const changes = {};
    Glossary.METRICS.forEach(metric => {
      changes[metric.key] = previous ? Glossary.compare(metric.key, current.metrics[metric.key], previous.metrics[metric.key]) : { pct: null, tone: null };
    });

    const names = new Map((input.campaigns || []).map(item => [String(item.id), item.name || 'Adsız kampanya']));
    const groups = new Map();
    parts.forEach(part => { if (!groups.has(part.campaignId)) groups.set(part.campaignId, []); groups.get(part.campaignId).push(part); });
    const totalSpend = current.totals.spend;
    const campaigns = [...groups.entries()].map(([campaignId, list]) => {
      const agg = aggregate(list);
      const first = list[0];
      return {
        campaignId, name: names.get(campaignId) || 'Bilinmeyen kampanya', platform: first.platform,
        resultType: first.resultType, resultMetric: first.resultMetric,
        metrics: agg.metrics, notes: agg.notes,
        spendShare: totalSpend > 0 && agg.metrics.spend !== null ? round(agg.metrics.spend / totalSpend * 100) : null
      };
    }).sort((a, b) => (b.metrics.spend || 0) - (a.metrics.spend || 0));

    const m = current.metrics;
    const conversations = addMeasured(m.messages, m.calls);
    const steps = [
      { key: 'impressions', label: 'Gösterim', value: m.impressions },
      { key: 'clicks', label: 'Bağlantı tıklaması', value: m.clicks },
      { key: 'conversations', label: 'Mesaj / arama', value: conversations },
      { key: 'leads', label: 'Talep (Lexbnb)', value: m.leads }
    ];
    const funnel = steps.map((step, index) => {
      const before = index ? steps[index - 1].value : null;
      return { ...step, rateFromPrevious: index && before > 0 && step.value !== null ? round(step.value / before * 100) : null };
    });

    const unmeasured = Glossary.METRICS.filter(metric => m[metric.key] === null).map(metric => metric.key);
    return {
      range, priorRange: prior, metrics: m, priorMetrics: previous ? previous.metrics : null,
      changes, notes: current.notes, campaigns, funnel,
      series: dailySeries(parts, start, end), unmeasured, periodCount: parts.length
    };
  }

  return { analyze, normalizePeriod, clip, priorRangeOf };
});
