(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ledger_contract'));
  else root.SuggestedPriceEngine = factory(root.LedgerContract);
}(typeof self !== 'undefined' ? self : this, function (LedgerContract) {
  'use strict';
  const DAY = 86400000;
  const DEFAULTS = {
    weekend: { enabled: true, pct: 25, nights: [5, 6] }, specialDay: { enabled: true, pct: 40 },
    demand: { enabled: true, pct: 10 }, lastMinute: { enabled: true, pct: -10, withinDays: 7 },
    gapNight: { enabled: true, pct: -15, maxGap: 2 }
  };
  const missing = value => value === undefined || value === null || value === '' || !Number.isFinite(Number(value));
  const parse = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(value + 'T00:00:00Z') : NaN;
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  const dayOfWeek = date => new Date(parse(date)).getUTCDay();
  function rulesWithDefaults(input) {
    return Object.fromEntries(Object.keys(DEFAULTS).map(key => {
      const supplied = input && input[key];
      return [key, { ...DEFAULTS[key], ...(supplied || {}), isDefault: !supplied }];
    }));
  }
  function sameProperty(record, property) {
    const wanted = property && property.id, got = record && (record.propertyId || record.property_id || record.villaId || record.villa_id);
    return !wanted || (!!got && String(wanted) === String(got));
  }
  function bookedOn(record, date) {
    const start = record && (record.checkIn || record.check_in), end = record && (record.checkOut || record.check_out);
    return start && end && date >= start && date < end && String(record.status || '').toUpperCase() !== 'CANCELLED';
  }
  function blockedOn(record, date) {
    const start = record && (record.start || record.startDate || record.start_date), end = record && (record.end || record.endDate || record.end_date);
    return start && end && date >= start && date <= end;
  }
  function roundTo(value, step) { return Math.round(value / step) * step; }
  function suggest(input) {
    const o = input || {}, property = o.property || {}, rules = rulesWithDefaults(o.rules);
    const todayMs = parse(o.today), days = Number.isInteger(o.days) && o.days > 0 ? o.days : 30;
    if (!Number.isFinite(todayMs)) return { days: [], next30: { soldNights: 0, sellableNights: 0, occupancy: null }, warnings: [{ code: 'TODAY_INVALID', text: 'Bugün tarihi geçerli değil' }], rules };
    const dates = Array.from({ length: days }, (_, i) => iso(todayMs + i * DAY));
    const bookings = (o.bookings || []).filter(b => sameProperty(b, property));
    const blocks = (o.blocks || []).filter(b => sameProperty(b, property));
    const statusForDate = date => bookings.some(b => bookedOn(b, date)) ? 'BOOKED' : blocks.some(b => blockedOn(b, date)) ? 'BLOCKED' : 'OPEN';
    const status = Object.fromEntries(dates.map(date => [date, statusForDate(date)]));
    const soldNights = dates.filter(date => status[date] === 'BOOKED').length;
    const sellableNights = dates.filter(date => status[date] !== 'BLOCKED').length;
    const occupancy = sellableNights > 0 ? soldNights / sellableNights : null;
    const warnings = [];
    if (missing(property.basePrice)) warnings.push({ code: 'BASE_PRICE_MISSING', text: 'Baz fiyat girilmemiş' });
    if (missing(property.floorPrice)) warnings.push({ code: 'FLOOR_PRICE_MISSING', text: 'Taban fiyat girilmemiş' });
    if (rules.demand.enabled && missing(o.occupancyTarget)) warnings.push({ code: 'OCCUPANCY_TARGET_MISSING', text: 'Doluluk hedefi girilmediği için talep kuralı uygulanmadı' });
    ((o.specialDays && o.specialDays.warnings) || []).forEach(w => warnings.push(w));
    const specialSet = new Set((Array.isArray(o.specialDays) ? o.specialDays : []).map(x => x.date));
    const gapDates = new Set();
    for (let i = 0; i < dates.length;) {
      if (status[dates[i]] !== 'OPEN') { i++; continue; }
      const start = i;
      while (i < dates.length && status[dates[i]] === 'OPEN') i++;
      const length = i - start;
      const before = iso(parse(dates[start]) - DAY);
      const after = iso(parse(dates[i - 1]) + DAY);
      if (length <= rules.gapNight.maxGap && statusForDate(before) === 'BOOKED' && statusForDate(after) === 'BOOKED') {
        for (let j = start; j < i; j++) gapDates.add(dates[j]);
      }
    }
    const basePrice = missing(property.basePrice) ? null : Number(property.basePrice);
    const floorPrice = missing(property.floorPrice) ? null : Number(property.floorPrice);
    const rounding = Number(o.rounding) > 0 ? Number(o.rounding) : 50;
    const resultDays = dates.map(date => {
      const rowStatus = status[date];
      if (rowStatus !== 'OPEN' || basePrice === null) return { date, status: rowStatus, price: null, basePrice, floorApplied: false, reasons: [] };
      const calendar = [];
      if (rules.weekend.enabled && rules.weekend.nights.includes(dayOfWeek(date))) calendar.push({ code: 'WEEKEND', pct: Number(rules.weekend.pct), text: 'hafta sonu' });
      if (rules.specialDay.enabled && specialSet.has(date)) calendar.push({ code: 'SPECIAL_DAY', pct: Number(rules.specialDay.pct), text: 'özel gün' });
      const positive = calendar.sort((a, b) => b.pct - a.pct)[0];
      const reasons = positive ? [positive] : [];
      if (rules.demand.enabled && !missing(o.occupancyTarget) && occupancy !== null && occupancy >= Number(o.occupancyTarget)) reasons.push({ code: 'DEMAND', pct: Number(rules.demand.pct), text: 'hedef doluluğa ulaşıldı' });
      const discounts = [];
      const daysAway = Math.round((parse(date) - todayMs) / DAY);
      if (rules.lastMinute.enabled && daysAway <= Number(rules.lastMinute.withinDays)) discounts.push({ code: 'LAST_MINUTE', pct: Number(rules.lastMinute.pct), text: 'son dakika' });
      if (rules.gapNight.enabled && gapDates.has(date)) discounts.push({ code: 'GAP_NIGHT', pct: Number(rules.gapNight.pct), text: 'boş gece aralığı' });
      const discount = discounts.sort((a, b) => a.pct - b.pct)[0];
      if (discount) reasons.push(discount);
      const totalPct = reasons.reduce((sum, reason) => sum + reason.pct, 0);
      let price = roundTo(basePrice * (1 + totalPct / 100), rounding), floorApplied = false;
      if (floorPrice !== null && price < floorPrice) { price = floorPrice; floorApplied = true; }
      return { date, status: rowStatus, price, basePrice, floorApplied, reasons };
    });
    return { days: resultDays, next30: { soldNights, sellableNights, occupancy }, warnings, rules };
  }
  function metric(value, code, text) { return value === null ? { value: null, reason: { code, text } } : { value, reason: null }; }
  function historyHint(input) {
    const o = input || {}, property = o.property || {};
    if (!/^\d{4}-\d{2}$/.test(o.monthKey || '') || !Array.isArray(o.sellableDates) || !o.sellableDates.length) return null;
    const previousPrefix = `${Number(o.monthKey.slice(0, 4)) - 1}${o.monthKey.slice(4)}`;
    const sellable = o.sellableDates.filter(date => date.startsWith(previousPrefix));
    if (!sellable.length) return null;
    const groups = { weekend: { sellable: 0, sold: new Set(), revenue: 0 }, weekday: { sellable: 0, sold: new Set(), revenue: 0 } };
    sellable.forEach(date => groups[[5, 6].includes(dayOfWeek(date)) ? 'weekend' : 'weekday'].sellable++);
    (o.bookings || []).filter(b => sameProperty(b, property) && String(b.status || '').toUpperCase() !== 'CANCELLED').forEach(booking => {
      const amounts = LedgerContract.bookingAmounts(booking);
      sellable.forEach(date => {
        const share = LedgerContract.nightShareInRange(booking, date, date);
        if (!share.nights) return;
        const group = groups[[5, 6].includes(dayOfWeek(date)) ? 'weekend' : 'weekday'];
        if (!group.sold.has(date)) group.sold.add(date);
        group.revenue += (amounts.gross - amounts.cleanFee - amounts.discount) * share.ratio;
      });
    });
    const result = { sampleNights: { weekend: groups.weekend.sold.size, weekday: groups.weekday.sold.size } };
    ['weekend', 'weekday'].forEach(key => {
      const group = groups[key], enough = group.sold.size >= 8;
      result[`${key}Occupancy`] = metric(enough && group.sellable ? group.sold.size / group.sellable : null, 'SAMPLE_TOO_SMALL', 'En az 8 satılmış gece gerekli');
      result[`${key}Adr`] = metric(enough ? group.revenue / group.sold.size : null, 'SAMPLE_TOO_SMALL', 'En az 8 satılmış gece gerekli');
    });
    return Object.values(result).slice(1).every(x => x.value === null) ? null : result;
  }
  function forecastMonth(input) {
    const o = input || {}, ledger = o.ledgerToDate;
    const actual = ledger && !missing(ledger.netRoomRevenue) ? Number(ledger.netRoomRevenue) : null;
    if (!o.historyHint) return { actual, planned: null, expected: null, reason: { code: 'HISTORY_MISSING', text: 'Geçmiş doluluk ipucu yok' } };
    const weekendOccupancy = o.historyHint.weekendOccupancy && o.historyHint.weekendOccupancy.value;
    const weekdayOccupancy = o.historyHint.weekdayOccupancy && o.historyHint.weekdayOccupancy.value;
    if (!Number.isFinite(weekendOccupancy) && !Number.isFinite(weekdayOccupancy)) {
      return { actual, planned: null, expected: null, reason: { code: 'HISTORY_MISSING', text: 'Geçmiş doluluk ölçülemedi' } };
    }
    const monthPrefix = /^\d{4}-\d{2}$/.test(o.monthKey || '') ? `${o.monthKey}-` : null;
    const eligible = (o.suggestions || [])
      .filter(x => x.status === 'OPEN' && Number.isFinite(x.price) && (!monthPrefix || String(x.date || '').startsWith(monthPrefix)) && (!o.today || x.date >= o.today));
    const requiredNightTypes = new Set(eligible.map(row => [5, 6].includes(dayOfWeek(row.date)) ? 'weekend' : 'weekday'));
    const missingNightTypes = ['weekend', 'weekday'].filter(type => requiredNightTypes.has(type)
      && !Number.isFinite(type === 'weekend' ? weekendOccupancy : weekdayOccupancy));
    if (missingNightTypes.length) {
      return {
        actual,
        planned: null,
        expected: null,
        reason: {
          code: 'HISTORY_INCOMPLETE',
          text: 'Kalan gecelerin tum turleri icin gecmis doluluk olculemedi',
          missingNightTypes
        }
      };
    }
    const planned = eligible.reduce((sum, row) => {
      const occupancy = [5, 6].includes(dayOfWeek(row.date)) ? weekendOccupancy : weekdayOccupancy;
      return sum + row.price * occupancy;
    }, 0);
    return { actual, planned, expected: actual === null ? null : actual + planned };
  }
  return { suggest, historyHint, forecastMonth };
}));
