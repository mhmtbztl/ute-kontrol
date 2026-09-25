/**
 * LEXBNB DONEM DEFTERI SOZLESMESI — CEVRIMDISI
 *
 * core/ledger_contract.js'i, canli phase45 suitinin (phase45_cleaning_cost_live_tests)
 * AYNI senaryolari ve AYNI beklenen rakamlariyla olcer. Canli suit sunucunun
 * bu rakamlari verdigini, bu suit istemcinin de ayni rakamlari verdigini
 * gosterir: "uc yer ayni rakam" (K-04 kabul I) iki ucundan baglanir.
 */
const assert = require('assert');
const L = require('./ledger_contract.js');

let passed = 0, failed = 0;
function test(ad, fn) {
  try { fn(); passed++; console.log(`[PASS] ${ad}`); }
  catch (e) { failed++; console.error(`[FAIL] ${ad}\n       ${e.message}`); }
}
const yakin = (a, b, msg) => assert.ok(Math.abs(Number(a) - Number(b)) < 0.011, `${msg}: ${a} != ${b}`);

function ay(monthKey, veri) {
  const r = L.monthRange(monthKey);
  return L.computePeriodLedger({
    ...veri,
    bookingShare: b => L.nightShareInRange(b, r.start, r.end),
    expenseInScope: e => (e.date || '') >= r.start && (e.date || '') <= r.end,
    taskInScope: t => (t.date || '') >= r.start && (t.date || '') <= r.end
  });
}

// Canli suitin Ocak 2031 senaryosu (2. bolum), istemcinin bellek bicimiyle.
const OCAK = {
  bookings: [
    { id: 'bA', checkIn: '2031-01-10', checkOut: '2031-01-12', gross: 20000, cleanFee: 1500, status: 'CONFIRMED' }
  ],
  cleaningTasks: [
    { id: 'tA', bookingId: 'bA', date: '2031-01-12', amount: 1200, status: 'SKIPPED', paid: false },
    { id: 'eski', date: '2031-01-05', amount: 300, status: 'DONE', paid: true },
    { id: 'tB', date: '2031-01-15', amount: 1200, status: 'DONE', paid: false },
    { id: 'tD', date: '2031-01-31', amount: 800, status: 'DONE', paid: false },
    { id: 'tE', dbId: 'tE', date: '2031-01-20', amount: 900, status: 'DONE', paid: true }
  ],
  expenses: [
    { id: 'x1', legacyId: 'EXP-CLEAN-tE', date: '2031-02-03', category: 'Temizlik', type: 'OPEX', amount: 900 }
  ]
};

test('A/B/D/E: yapilmayan 0, yapilan yapildigi ayda, eski EXP-CLEAN satiri ikinci kez sayilmaz', () => {
  const k = ay('2031-01', OCAK);
  yakin(k.cleaningCost, 2300, 'temizlik maliyeti');
  yakin(k.cleaningDebt, 2000, 'personel borcu');
  yakin(k.totalRevenue, 20000, 'toplam gelir (gelmeyen misafir)');
  yakin(k.cleaningRevenue, 1500, 'temizlik geliri');
});

test('C: odeme gideri degistirmez, borcu kapatir', () => {
  const odenmis = { ...OCAK, cleaningTasks: OCAK.cleaningTasks.map(t => (t.id === 'tB' || t.id === 'tD') ? { ...t, paid: true } : t) };
  const k = ay('2031-01', odenmis);
  yakin(k.cleaningCost, 2300, 'maliyet');
  yakin(k.cleaningDebt, 0, 'borc');
});

test('D/E: Subat\'ta temizlik maliyeti yok; eski satir Subat elle giderinde', () => {
  const k = ay('2031-02', OCAK);
  yakin(k.cleaningCost, 0, 'Subat temizlik');
  yakin(k.manualOpex, 900, 'Subat elle gider');
});

test('G: oda geliri, temizlik geliri, indirim ve odeme komisyonu gecelere dagilir', () => {
  const v = { bookings: [{ id: 'bG', checkIn: '2031-03-29', checkOut: '2031-04-03', gross: 40000, discount: 2000, cleanFee: 1500, paymentCommission: 500 }] };
  const mart = ay('2031-03', v), nisan = ay('2031-04', v);
  yakin(mart.netRoomRevenue, 21900, 'Mart net oda'); yakin(nisan.netRoomRevenue, 14600, 'Nisan net oda');
  yakin(mart.cleaningRevenue, 900, 'Mart temizlik geliri'); yakin(nisan.cleaningRevenue, 600, 'Nisan temizlik geliri');
  yakin(mart.paymentCommission, 300, 'Mart odeme kom.'); yakin(nisan.paymentCommission, 200, 'Nisan odeme kom.');
  yakin(mart.totalRevenue, 22800, 'odeme komisyonu ciroyu azaltmaz');
  yakin(mart.adr, 7300, 'ADR = net oda / gece');
});

test('OPEX = elle + OTA + odeme komisyonu + yapilmis temizlik; net kar = gelir - OPEX - CAPEX', () => {
  const k = ay('2031-05', {
    bookings: [{ checkIn: '2031-05-01', checkOut: '2031-05-03', gross: 10000, cleanFee: 1000, otaComm: 1500, paymentCommission: 200 }],
    expenses: [{ date: '2031-05-02', type: 'OPEX', amount: 700 }, { date: '2031-05-02', type: 'CAPEX', amount: 5000 }],
    cleaningTasks: [{ date: '2031-05-03', amount: 600, status: 'DONE' }]
  });
  yakin(k.totalOpex, 700 + 1500 + 200 + 600, 'OPEX');
  yakin(k.netProfit, 10000 - 3000 - 5000, 'net kar');
  yakin(k.operatingProfit, 7000, 'faaliyet kari');
});

test('Iptal rezervasyon ciroya girmez; ucret maliyet diye kopyalanmaz (gorev yoksa maliyet 0)', () => {
  const k = ay('2031-06', {
    bookings: [
      { checkIn: '2031-06-01', checkOut: '2031-06-03', gross: 9000, cleanFee: 1500, status: 'CANCELLED' },
      { checkIn: '2031-06-05', checkOut: '2031-06-07', gross: 8000, cleanFee: 1500 }
    ]
  });
  yakin(k.totalRevenue, 8000, 'iptal disi');
  yakin(k.cleaningCost, 0, 'gorev yoksa maliyet bilinmiyor, uydurulmaz');
  assert.strictEqual(k.soldNights, 2);
});

test('Durumu olmayan eski kayit: odenmisse yapilmis, degilse planli (sunucu eslemesiyle ayni)', () => {
  assert.strictEqual(L.taskStatus({ paid: true }), 'DONE');
  assert.strictEqual(L.taskStatus({ paid: false }), 'PLANNED');
  assert.strictEqual(L.taskStatus({ status: 'skipped' }), 'SKIPPED');
});

test('Satilan gece yoksa ADR "bilinmiyor" (null), 0 degil', () => {
  assert.strictEqual(ay('2031-07', {}).adr, null);
});

console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed > 0) process.exit(1);
