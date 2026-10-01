(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./ledger_contract') : root.LedgerContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PropertyProfileEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LedgerContract) {
  'use strict';

  function validPair(latitude, longitude) {
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }

  function parseMapCoordinates(value) {
    const text = decodeURIComponent(String(value || '').trim());
    const patterns = [/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,|\/|$)/, /[?&](?:q|query)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)(?:&|$)/];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (validPair(latitude, longitude)) return { latitude, longitude };
    }
    return null;
  }

  function belongs(row, property) {
    const id = row && (row.propertyId || row.property_id);
    const slug = row && row.villa;
    return id === property.id || slug === property.slug;
  }

  function buildPropertyReport(input = {}) {
    if (!LedgerContract) throw new Error('LEDGER_CONTRACT_UNAVAILABLE');
    const property = input.property || {};
    const bookings = (input.bookings || []).filter(row => belongs(row, property));
    const expenses = (input.expenses || []).filter(row => belongs(row, property));
    const cleaningTasks = (input.cleaningTasks || []).filter(row => belongs(row, property));
    return LedgerContract.computePeriodLedger({
      bookings, expenses, allExpenses: input.expenses || [], cleaningTasks,
      bookingInScope: () => true,
      bookingShare: row => {
        const checkIn = row.checkIn || row.check_in;
        const checkOut = row.checkOut || row.check_out;
        const nights = checkIn && checkOut ? Math.max(0, Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000)) : 0;
        return { ratio: nights > 0 ? 1 : 0, nights };
      },
      expenseInScope: () => true,
      taskInScope: () => true
    });
  }

  return { parseMapCoordinates, buildPropertyReport };
});
