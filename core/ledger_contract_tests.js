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

// phase97 canli suitinin (phase97_income_live_tests) Mart 2031 senaryosu.
const MART = {
  bookings: [{ id: 'bM', checkIn: '2031-03-10', checkOut: '2031-03-12', gross: 20000, cleanFee: 2000, discount: 1000, status: 'CONFIRMED' }],
  expenses: [{ id: 'gM', date: '2031-03-05', type: 'OPEX', amount: 4000 }],
  incomes: [
    { id: 'iM1', date: '2031-03-15', type: 'OTHER_INCOME', amount: 2500 },
    { id: 'iM2', date: '2031-03-20', type: 'CAPITAL', amount: 50000 },
    { id: 'iM3', date: '2031-04-01', type: 'OTHER_INCOME', amount: 999 }
  ]
};

test('phase97: diger gelir toplam gelire ve kara girer, ciroya girmez', () => {
  const k = ay('2031-03', MART);
  yakin(k.netRoomRevenue, 17000, 'ciro (net oda geliri) degismez');
  yakin(k.otherIncome, 2500, 'diger gelir');
  yakin(k.totalRevenue, 21500, 'toplam gelir = 17000 + 2000 + 2500');
  yakin(k.netProfit, 17500, 'net kar = 21500 - 4000');
  yakin(k.adr, 8500, 'ADR yalniz oda gelirinden');
});

test('phase97: sermaye girisi gelir degildir; kara girmez, ayri tasinir', () => {
  const k = ay('2031-03', MART);
  yakin(k.capitalIn, 50000, 'sermaye girisi');
  const sermayesiz = ay('2031-03', { ...MART, incomes: MART.incomes.filter(i => i.type !== 'CAPITAL') });
  yakin(k.netProfit, sermayesiz.netProfit, 'sermaye kari degistirmez');
});

test('phase97: gelir kaydi kendi tarihinin donemine yazilir; turu bilinmeyen sayilmaz', () => {
  yakin(ay('2031-04', MART).otherIncome, 999, 'Nisan');
  yakin(ay('2031-03', { incomes: [{ date: '2031-03-02', type: 'BILINMIYOR', amount: 5 }] }).totalRevenue, 0, 'bilinmeyen tur');
});

// nightShareInRange hizli yolu (Analiz hizi, 06.11.2026): eski gece gece dongunun
// birebir kopyasina karsi rastgele ve sinir girdilerde AYNI sonuc.
function eskiGecePayi(b, start, end) {
  const ci = b && (b.checkIn || b.check_in);
  const co = b && (b.checkOut || b.check_out);
  const bos = { nights: 0, total: 0, ratio: 0 };
  if (!ci || !co) return bos;
  const gun = 86400000;
  const bas = Date.parse(ci + 'T00:00:00Z');
  const bit = Date.parse(co + 'T00:00:00Z');
  if (!Number.isFinite(bas) || !Number.isFinite(bit)) return bos;
  const toplam = Math.round((bit - bas) / gun);
  if (toplam <= 0) return bos;
  let icerde = 0;
  for (let i = 0; i < toplam; i++) {
    const g = new Date(bas + i * gun).toISOString().slice(0, 10);
    if (g >= start && g <= end) icerde++;
  }
  return { nights: icerde, total: toplam, ratio: icerde / toplam };
}

test('nightShareInRange hizli yol: 20.000 rastgele + sinir girdide eski donguyle birebir ayni', () => {
  let seed = 11;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const gun = 86400000;
  const taban = Date.UTC(1999, 0, 1);
  const tuhaf = ['2026-02-30', '2026-13-01', '2026-1-5', '', null, undefined, '2026-10', 'abc',
    '2024-02-29', '2023-02-29', '0999-12-31', '9999-12-31', '10000-01-01', '2026-10-31T10:00'];
  const vakalar = [];
  for (let i = 0; i < 20000; i++) {
    const ci = taban + Math.floor(r() * 12000) * gun;
    const n = Math.floor(r() * 420) - 5;
    const s = taban + Math.floor(r() * 12000) * gun;
    const e = s + (Math.floor(r() * 200) - 20) * gun;
    vakalar.push([{ checkIn: iso(ci), checkOut: iso(ci + n * gun) }, iso(s), iso(e)]);
  }
  // Sinirlar: ay sonu/basi, artik gun, ters aralik, tek gece, tuhaf metinler
  [['2026-01-31', '2026-02-02'], ['2024-02-28', '2024-03-02'], ['2026-10-30', '2026-11-01'], ['2026-10-31', '2026-11-01']]
    .forEach(([a, b]) => [['2026-11-01', '2026-11-30'], ['2026-10-01', '2026-10-31'], ['2024-02-29', '2024-02-29'], ['2026-11-30', '2026-11-01']]
      .forEach(([s, e]) => vakalar.push([{ checkIn: a, checkOut: b }, s, e])));
  tuhaf.forEach(x => {
    vakalar.push([{ checkIn: '2026-02-27', checkOut: '2026-03-03' }, x, '2026-03-31']);
    vakalar.push([{ checkIn: '2026-02-27', checkOut: '2026-03-03' }, '2026-02-01', x]);
    vakalar.push([{ checkIn: x, checkOut: '2026-03-03' }, '2026-02-01', '2026-03-31']);
    vakalar.push([{ check_in: '2026-02-27', check_out: x }, '2026-02-01', '2026-03-31']);
  });
  vakalar.push([{ checkIn: '9999-12-30', checkOut: '10000-01-02' }, '9999-12-01', '9999-12-31']);
  vakalar.push([{ checkIn: '0999-12-30', checkOut: '1000-01-02' }, '0999-12-01', '1000-12-31']);
  let fark = 0; let ilk = null;
  vakalar.forEach(([b, s, e]) => {
    const yeni = L.nightShareInRange(b, s, e);
    const eski = eskiGecePayi(b, s, e);
    if (yeni.nights !== eski.nights || yeni.total !== eski.total || yeni.ratio !== eski.ratio) {
      fark++; if (!ilk) ilk = JSON.stringify({ b, s, e, yeni, eski });
    }
  });
  assert.strictEqual(fark, 0, `${fark} farkli sonuc; ilk: ${ilk}`);
});

console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed > 0) process.exit(1);
