(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdsMetricsEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const ratio = (top, bottom, scale = 1) => bottom > 0 && top !== null ? round((top / bottom) * scale) : null;
  const measuredSum = (rows, key) => rows.some(row => row[key] !== null && row[key] !== undefined)
    ? round(rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)) : null;

  function statusFor(row, targets, minResults) {
    if (row.resultType === 'OTHER') return { status: null, statusReason: { code: 'OTHER_RESULT', text: 'Mesaj/arama hedefli kampanya değil.' } };
    const isMessage = row.resultType === 'MESSAGE';
    const result = isMessage ? row.messages : row.calls;
    const target = isMessage ? Number(targets.costPerMessage) : Number(targets.costPerCall);
    const metric = isMessage ? row.costPerMessage : row.costPerCall;
    const label = isMessage ? 'mesaj' : 'arama';
    if (!(target > 0)) return { status: null, statusReason: { code: 'TARGET_MISSING', text: `${label} başı hedef belirlenmemiş.` } };
    if (row.spend > 0 && result === 0) return { status: 'PAHALI', statusReason: { code: 'ZERO_RESULT', text: `₺${row.spend} harcama var, ${label} yok.` } };
    if (result === null) return { status: null, statusReason: { code: 'RESULT_UNMEASURED', text: `${label} sonucu ölçülmemiş.` } };
    if (result < minResults) return { status: 'IZLE', statusReason: { code: 'LOW_SAMPLE', text: `${result} ${label}; karar için en az ${minResults} sonuç gerekli.` } };
    const efficient = metric <= target;
    return { status: efficient ? 'VERIMLI' : 'PAHALI', statusReason: { code: efficient ? 'AT_OR_BELOW_TARGET' : 'ABOVE_TARGET', text: `${label} başı ₺${metric}; hedef ₺${target}.` } };
  }

  function campaignMetrics(rows, options = {}) {
    const groups = new Map();
    (rows || []).forEach(row => {
      const key = `${row.campaignId}|${row.platform}|${row.resultType}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return Array.from(groups.values()).map(group => {
      const first = group[0];
      const out = {
        campaignId: first.campaignId, platform: first.platform, resultType: first.resultType,
        spend: measuredSum(group, 'spend'), impressions: measuredSum(group, 'impressions'),
        clicks: measuredSum(group, 'clicks'), messages: measuredSum(group, 'messages'), calls: measuredSum(group, 'calls')
      };
      out.ctr = ratio(out.clicks, out.impressions, 100);
      out.cpc = ratio(out.spend, out.clicks);
      out.costPerMessage = ratio(out.spend, out.messages);
      out.costPerCall = ratio(out.spend, out.calls);
      return Object.assign(out, statusFor(out, options.targets || {}, Number(options.minResults) || 10));
    });
  }

  function channelLeadCost({ spendByPlatform = {}, leadsBySource = {}, messagesByPlatform = {} } = {}) {
    return ['META', 'GOOGLE'].map(platform => {
      const sources = platform === 'META' ? ['INSTAGRAM_AD', 'FACEBOOK_AD'] : ['GOOGLE_AD'];
      const hasLeads = sources.some(key => leadsBySource[key] !== null && leadsBySource[key] !== undefined);
      const hasSpend = spendByPlatform[platform] !== null && spendByPlatform[platform] !== undefined;
      const leads = hasLeads ? sources.reduce((sum, key) => sum + (Number(leadsBySource[key]) || 0), 0) : null;
      const spend = hasSpend ? Number(spendByPlatform[platform]) : null;
      const messages = messagesByPlatform[platform] == null ? null : Number(messagesByPlatform[platform]);
      return {
        platform, source: sources.join('+'), spend, leads,
        costPerLead: ratio(spend, leads), messageToLeadRatio: ratio(leads, messages),
        reason: !hasSpend && !hasLeads ? 'Harcama ve talep verisi ölçülmedi.' : null
      };
    });
  }

  function adShare({ adSpend, netRoomRevenue }) {
    if (!(Number(netRoomRevenue) > 0)) return { pct: null, reason: 'Net konaklama cirosu yok veya ölçülmedi.' };
    return { pct: ratio(Number(adSpend) || 0, Number(netRoomRevenue), 100) };
  }
  function pctDelta(current, previous) { return Number(previous) === 0 || previous == null ? null : round(((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100); }
  function trend(current = {}, previous = {}) {
    return { spend: pctDelta(current.spend, previous.spend), messages: pctDelta(current.messages, previous.messages), calls: pctDelta(current.calls, previous.calls), leads: pctDelta(current.leads, previous.leads), revenue: pctDelta(current.revenue, previous.revenue), label: 'EGILIM' };
  }
  function parseDate(value) { const [y, m, d] = String(value).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function dateKey(date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`; }
  function allocatePeriodToMonths(row) {
    if (row.spend === null || row.spend === undefined) return [];
    const start = parseDate(row.periodStart), end = parseDate(row.periodEnd);
    const totalDays = Math.floor((end - start) / 86400000) + 1;
    if (!(totalDays > 0)) return [];
    const counts = new Map();
    for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const key = dateKey(cursor); counts.set(key, (counts.get(key) || 0) + 1);
    }
    let assigned = 0;
    const entries = Array.from(counts.entries());
    return entries.map(([monthKey, days], index) => {
      const spend = index === entries.length - 1 ? round(Number(row.spend) - assigned) : round(Number(row.spend) * days / totalDays);
      assigned = round(assigned + spend);
      return { monthKey, days, spend };
    });
  }
  return { campaignMetrics, channelLeadCost, adShare, trend, allocatePeriodToMonths };
});
