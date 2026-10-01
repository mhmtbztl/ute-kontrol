(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BookingPaymentEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KIND_LABELS = Object.freeze({ DEPOSIT: 'Kapora', INTERIM: 'Ara ödeme', BALANCE: 'Kalan' });
  const METHOD_LABELS = Object.freeze({ CASH: 'Nakit', BANK_TRANSFER: 'Havale/EFT', CARD: 'Kart', OTA: 'OTA', OTHER: 'Diğer' });

  function kindLabel(kind) { return KIND_LABELS[kind] || '—'; }
  function methodLabel(method) { return METHOD_LABELS[method] || '—'; }
  function totalCollections(payments, from, to) {
    return (payments || []).reduce((sum, item) => {
      const date = String(item.paid_on || '');
      return date >= from && date <= to ? sum + (Number(item.amount) || 0) : sum;
    }, 0);
  }

  return { KIND_LABELS, METHOD_LABELS, kindLabel, methodLabel, totalCollections };
});
