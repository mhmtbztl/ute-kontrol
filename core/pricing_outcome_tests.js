'use strict';
// core/pricing_outcome.js — kayitli gunluk fiyat -> gerceklesen (kullanici 08.11.2026).
// Atif kurali, defter tanimi (oda geliri), iptal/toplu ozet, ornek yok -> null.
const O = require('./pricing_outcome.js');
const LedgerContract = require('./ledger_contract.js');

let passed = 0, failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

const P = 'p-1';
const TODAY = '2026-11-08';
const price = (date, amount, extra = {}) => ({ property_id: P, price_date: date, price: amount, source: 'APPROVED', suggested_price: amount, updated_at: '2026-10-01T09:00:00Z', ...extra });
const booking = (id, ci, co, gross, extra = {}) => ({ id, propertyId: P, villa: 'SEYIR', checkIn: ci, checkOut: co, gross, status: 'CONFIRMED', createdAt: '2026-10-05T10:00:00Z', ...extra });
const run = (dailyPrices, bookings, extra = {}) => O.computePricingOutcome({ dailyPrices, bookings, propertyId: P, propertyKey: 'SEYIR', today: TODAY, isBulkSummary: b => /^TOPLU AKTARIM/.test(b.guest || ''), ...extra });

try {
  // Ay sinirini kesen rezervasyon: gece fiyati tum konaklamanin gece ortalamasi.
  const r1 = run([price('2026-10-31', 10000), price('2026-11-01', 10000)], [booking('b1', '2026-10-30', '2026-11-02', 36000, { cleaningFee: 3000, discount: 3000 })]);
  const gece = (36000 - 3000 - 3000) / 3;
  check(r1.days.length === 2 && r1.days.every(d => d.outcome === 'SOLD_AFTER' && d.realized === gece) && r1.summary.avgDiff === gece - 10000,
    'O1 Gerceklesen gece fiyati defter tanimi: (tutar - temizlik ucreti - indirim) / gece; ay siniri kesse de ayni', JSON.stringify(r1.days));
  const a = LedgerContract.bookingAmounts(booking('x', '2026-10-30', '2026-11-02', 36000, { cleaningFee: 3000, discount: 3000 }));
  check(a.gross - a.cleanFee - a.discount === 30000, 'O2 Formul LedgerContract.bookingAmounts ile ayni alanlari kullanir');

  // Iptal ve toplu ozet gece satmaz.
  const r2 = run([price('2026-10-20', 9000), price('2026-10-21', 9000)], [
    booking('c1', '2026-10-20', '2026-10-21', 9000, { status: 'CANCELLED' }),
    booking('t1', '2026-10-21', '2026-10-22', 9000, { guest: 'TOPLU AKTARIM — Ekim 2026' })
  ]);
  check(r2.days.every(d => d.outcome === 'UNSOLD') && r2.summary.sellRate === 0 && r2.summary.avgDiff === null,
    'O3 Iptal edilen rezervasyon ve toplu aktarim ozeti geceyi satilmis saymaz; fark olculemez (null)');

  // Atif: kayittan once satilan karsilastirmaya girmez; olusturma zamani yok / ice aktarim olculemez.
  const r3 = run([price('2026-10-10', 9000, { updated_at: '2026-10-08T09:00:00Z' }), price('2026-10-11', 9000), price('2026-10-12', 9000)], [
    booking('e1', '2026-10-10', '2026-10-11', 12000, { createdAt: '2026-10-01T09:00:00Z' }),
    booking('e2', '2026-10-11', '2026-10-12', 12000, { createdAt: null }),
    booking('e3', '2026-10-12', '2026-10-13', 12000, { id: 'imp' })
  ], { isImported: b => b.id === 'imp' });
  const byDate = Object.fromEntries(r3.days.map(d => [d.date, d]));
  check(byDate['2026-10-10'].outcome === 'SOLD_BEFORE' && byDate['2026-10-11'].outcome === 'UNATTRIBUTED' && byDate['2026-10-11'].reason === 'NO_CREATED_AT'
    && byDate['2026-10-12'].reason === 'IMPORTED' && r3.summary.sellRate === null && r3.summary.avgDiff === null && r3.summary.soldBefore === 1 && r3.summary.unattributed === 2,
    'O4 Kayittan once satilan gun orana/farka girmez; olusturma zamani olmayan ve ice aktarilan kayit orneklenmez', JSON.stringify(r3.summary));

  // Yalniz gecmis gunler; bugun ve sonrasi, baska mulk, pencere disi sayilmaz.
  const r4 = run([price(TODAY, 9000), price('2026-12-01', 9000), { ...price('2026-10-01', 9000), property_id: 'baska' }, price('2026-01-05', 9000)], [], { from: '2026-08-10' });
  check(r4.summary === null && r4.days.length === 0,
    'O5 Bugun, gelecek, baska mulk ve pencere disi kayit sayilmaz; ornek yoksa ozet null (0 degil)');

  // Onayli / elle ayrimi ve satilma orani.
  const r5 = run([price('2026-10-01', 10000), price('2026-10-02', 10000), price('2026-10-03', 12000, { source: 'MANUAL' })], [booking('m1', '2026-10-01', '2026-10-02', 11000)]);
  check(r5.summary.sellRate === 33.33 && r5.bySource.APPROVED.sellRate === 50 && r5.bySource.MANUAL.sellRate === 0 && r5.summary.avgDiff === 1000 && r5.summary.avgDiffPct === 10,
    'O6 Satilma orani ve ortalama fark onayli/elle ayri da hesaplanir', JSON.stringify(r5.bySource));

  check(O.bookingForNight([booking('n1', '2026-10-01', '2026-10-03', 1)], '2026-10-03', { propertyId: P }) === null
    && O.bookingForNight([booking('n1', '2026-10-01', '2026-10-03', 1)], '2026-10-02', { propertyId: P }).id === 'n1',
    'O7 Cikis gunu gece degildir; gece rezervasyonu dogru bulunur');
  let atti = false;
  try { O.computePricingOutcome({ dailyPrices: [] }); } catch (e) { atti = /TODAY_REQUIRED/.test(e.message); }
  check(atti, 'O8 Bugun verilmezse hesap yapilmaz');
} catch (error) {
  failed++;
  console.error(`[FAIL] beklenmeyen hata — ${error.stack || error}`);
} finally {
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
