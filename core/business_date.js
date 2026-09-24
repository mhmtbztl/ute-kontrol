// Canonical calendar-day resolution for tenant-facing business logic.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LexbnbBusinessDate = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_BUSINESS_TIME_ZONE = 'Europe/Istanbul';

  function getBusinessDate(value = new Date(), timeZone = DEFAULT_BUSINESS_TIME_ZONE) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('VALID_DATE_REQUIRED');
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${byType.year}-${byType.month}-${byType.day}`;
  }

  return { DEFAULT_BUSINESS_TIME_ZONE, getBusinessDate };
}));
