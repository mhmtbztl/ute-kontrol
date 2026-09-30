(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TargetRevenueCalculator = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const round = value => Math.round(value * 100) / 100;
  const missing = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value));
  function blank(status, code, text) { return { status, remaining: null, openNightsTotal: null, weightedAvgPrice: null, requiredOccupancy: null, requiredAvgPriceAtExpected: null, minAvgPriceAtFull: null, table: [], highlightedRow: null, realism: null, reason: { code, text } }; }
  function calculate(input) {
    const o = input || {};
    if (missing(o.target)) return blank('INPUT_MISSING', 'TARGET_MISSING', 'Ciro hedefi girilmemiş');
    const sold = o.soldToDate || {};
    if (missing(sold.netRoomRevenue)) return blank('INPUT_MISSING', 'SOLD_REVENUE_MISSING', 'Satılmış gecelerin net konaklama geliri girilmemiş');
    const target = Number(o.target), soldRevenue = Number(sold.netRoomRevenue);
    const remaining = round(Math.max(0, target - soldRevenue));
    const types = ['weekday', 'weekend', 'special'];
    if (!o.openNights || types.some(k => missing(o.openNights[k]))) return { ...blank('INPUT_MISSING', 'OPEN_NIGHTS_MISSING', 'Açık gece kapasitesi girilmemiş'), remaining };
    const nights = Object.fromEntries(types.map(k => [k, Number(o.openNights[k])]));
    const openNightsTotal = types.reduce((s, k) => s + nights[k], 0);
    if (remaining <= 0) return { ...blank('REACHED', 'TARGET_REACHED', 'Hedef gerçekleşti'), remaining: 0, openNightsTotal, realism: o.history || null };
    if (openNightsTotal <= 0) return { ...blank('NO_CAPACITY', 'NO_OPEN_NIGHTS', 'Satılabilir açık gece yok'), remaining, openNightsTotal, realism: o.history || null };
    if (!o.prices || types.some(k => nights[k] > 0 && missing(o.prices[k]))) return { ...blank('INPUT_MISSING', 'PRICES_MISSING', 'Açık gece türlerinin fiyatı girilmemiş'), remaining, openNightsTotal, realism: o.history || null };
    const revenueAtPrices = types.reduce((s, k) => s + nights[k] * Number(o.prices[k] || 0), 0);
    const weightedAvgPrice = round(revenueAtPrices / openNightsTotal);
    if (weightedAvgPrice <= 0) return { ...blank('INPUT_MISSING', 'PRICE_NOT_POSITIVE', 'Ortalama fiyat sıfırdan büyük olmalı'), remaining, openNightsTotal, weightedAvgPrice, realism: o.history || null };
    const requiredOccupancy = remaining / (weightedAvgPrice * openNightsTotal);
    const expected = missing(o.expectedOccupancy) ? null : Number(o.expectedOccupancy);
    const requiredAvgPriceAtExpected = expected !== null && expected > 0 ? round(remaining / (openNightsTotal * expected)) : null;
    const minAvgPriceAtFull = round(remaining / openNightsTotal);
    const steps = Array.isArray(o.steps) && o.steps.length ? o.steps : [0.8, 0.9, 1, 1.1, 1.2];
    const table = steps.map(step => {
      const avgPrice = round(weightedAvgPrice * Number(step));
      const occupancy = avgPrice > 0 ? remaining / (avgPrice * openNightsTotal) : null;
      return { avgPrice, requiredOccupancy: occupancy, feasible: occupancy !== null && occupancy <= 1 };
    });
    const feasible = table.map((row, index) => ({ row, index })).filter(x => x.row.feasible);
    let highlightedRow = null;
    if (feasible.length) {
      if (o.focus === 'OCCUPANCY') highlightedRow = feasible[0].index;
      else if (o.focus === 'REVENUE') {
        const ceiling = o.history && Number.isFinite(Number(o.history.occupancy)) ? Number(o.history.occupancy) : 1;
        const under = feasible.filter(x => x.row.requiredOccupancy <= ceiling);
        highlightedRow = (under.length ? under[under.length - 1] : feasible[feasible.length - 1]).index;
      } else highlightedRow = feasible[Math.floor((feasible.length - 1) / 2)].index;
    }
    return { status: requiredOccupancy > 1 ? 'IMPOSSIBLE_AT_PRICES' : 'OK', remaining, openNightsTotal, weightedAvgPrice, requiredOccupancy, requiredAvgPriceAtExpected, minAvgPriceAtFull, table, highlightedRow, realism: o.history || null };
  }
  return { calculate };
}));
