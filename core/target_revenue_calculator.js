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
    if (Array.isArray(o.scenarios)) {
      const scenarioTable = scenarioRows(o.scenarios, { remaining, openNightsTotal, weightedAvgPrice, bounds: o.bounds || {} });
      const pick = pickScenario(scenarioTable, o.focus);
      return { status: requiredOccupancy > 1 ? 'IMPOSSIBLE_AT_PRICES' : 'OK', remaining, openNightsTotal, weightedAvgPrice, requiredOccupancy, requiredAvgPriceAtExpected, minAvgPriceAtFull, table: scenarioTable, highlightedRow: pick.index, highlightReason: pick.reason, scenarioMode: true, realism: o.history || null };
    }
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
  /**
   * Senaryo satirlari (fiyat ekrani, 08.11.2026). Sabit %80-%120 basamaklari
   * her ay ayni bes satiri uretiyordu; senaryolar verinin kendisinden gelir:
   *   { key, label, note, useSuggested: true }  -> takvimin onerileri
   *   { key, label, note, avgPrice }            -> verilen fiyatla gereken doluluk
   *   { key, label, note, occupancy }           -> verilen dolulukla gereken fiyat
   * Gercekcilik isaretleri (bounds): fiyat tabanin altinda / yogun fiyatin
   * ustunde; gereken doluluk son 12 ayda gorulen en yuksek dolulugun ustunde.
   * Olculemeyen sinir isaret uretmez.
   */
  function scenarioRows(scenarios, ctx) {
    const { remaining, openNightsTotal, weightedAvgPrice, bounds } = ctx;
    const floor = missing(bounds.floor) || Number(bounds.floor) <= 0 ? null : Number(bounds.floor);
    const peak = missing(bounds.peak) || Number(bounds.peak) <= 0 ? null : Number(bounds.peak);
    const maxSeen = missing(bounds.maxOccupancy) || Number(bounds.maxOccupancy) <= 0 ? null : Number(bounds.maxOccupancy);
    // Taban/yogun fiyat yoksa (tum mulkler) takvimin bu ayki en dusuk / en yuksek onerisi sinirdir.
    const minSuggested = missing(bounds.minSuggested) || Number(bounds.minSuggested) <= 0 ? null : Number(bounds.minSuggested);
    const maxSuggested = missing(bounds.maxSuggested) || Number(bounds.maxSuggested) <= 0 ? null : Number(bounds.maxSuggested);
    return scenarios.map(item => {
      let avgPrice = null, occupancy = null;
      if (item.useSuggested) avgPrice = weightedAvgPrice;
      else if (!missing(item.avgPrice) && Number(item.avgPrice) > 0) avgPrice = round(Number(item.avgPrice));
      else if (!missing(item.occupancy) && Number(item.occupancy) > 0) {
        occupancy = Math.min(1, Number(item.occupancy));
        avgPrice = round(remaining / (openNightsTotal * occupancy));
      } else return null;
      if (occupancy === null) occupancy = remaining / (avgPrice * openNightsTotal);
      const nightsNeeded = Math.ceil(occupancy * openNightsTotal - 1e-9);
      const flags = [];
      if (floor !== null && avgPrice < floor) flags.push('BELOW_FLOOR');
      if (peak !== null && avgPrice > peak) flags.push('ABOVE_PEAK');
      if (floor === null && minSuggested !== null && avgPrice < minSuggested - 0.005) flags.push('BELOW_SUGGESTIONS');
      if (peak === null && maxSuggested !== null && avgPrice > maxSuggested + 0.005) flags.push('ABOVE_SUGGESTIONS');
      if (occupancy <= 1 && maxSeen !== null && occupancy > maxSeen + 1e-9) flags.push('ABOVE_SEEN');
      return { key: item.key, label: item.label, note: item.note || '', avgPrice, requiredOccupancy: occupancy, nightsNeeded: occupancy <= 1 ? nightsNeeded : null, feasible: occupancy <= 1, flags };
    }).filter(Boolean).sort((a, b) => a.avgPrice - b.avgPrice);
  }

  // Odak yalniz uygulanabilir ve isaretsiz satirlar arasindan secer; hic yoksa
  // uygulanabilir satirlardan, o da yoksa secim yok.
  function pickScenario(table, focus) {
    const rows = table.map((row, index) => ({ row, index }));
    const clean = rows.filter(x => x.row.feasible && !x.row.flags.length);
    const pool = clean.length ? clean : rows.filter(x => x.row.feasible);
    if (!pool.length) return { index: null, reason: null };
    if (clean.length === 1) return { index: clean[0].index, reason: 'tek uyarısız seçenek; odak seçimi değiştirmez' };
    const caveat = clean.length ? '' : ' (hepsinde uyarı var)';
    if (focus === 'OCCUPANCY') return { index: pool[0].index, reason: `en düşük fiyatlı uygulanabilir seçenek${caveat}` };
    if (focus === 'REVENUE') return { index: pool[pool.length - 1].index, reason: `en yüksek fiyatlı uygulanabilir seçenek${caveat}` };
    return { index: pool[Math.floor((pool.length - 1) / 2)].index, reason: `uygulanabilir seçeneklerin ortadakisi${caveat}` };
  }

  return { calculate, scenarioRows, pickScenario };
}));
