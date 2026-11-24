'use strict';
// Fiyat listesi (Otomasyon #2, Lex 3 sutun, 22.11.2026): talimat yeni hesap yapmaz; motorun
// onerisi (₺50'ye yuvarli) ile kayitli fiyati (phase101) karsilastirir.
const assert = require('assert');
const App = require('../app.js');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (e) { failed++; console.error(`[FAIL] ${name}\n       ${e.message}`); }
}

const day = (date, extra) => Object.assign({ date, status: 'OPEN', price: 4900, basePrice: 4500, reasons: [] }, extra || {});
const ctx = (saved, extra) => Object.assign({
  blocks: [], specialByDate: new Map(), gapSet: new Set(), saved: new Map(saved || []), minStay: new Map(),
  research: [], propertyId: null, today: '2026-11-22', dailyReady: true
}, extra || {});

test('P1. Kayitli fiyat oneriden dusukse Artir; gerekce "kayitli → oneri"', () => {
  const [r] = App.pricingListRows([day('2026-12-01')], ctx([['2026-12-01', { price: 4500, source: 'APPROVED' }]]));
  assert.strictEqual(r.tag, 'Artır'); assert.strictEqual(r.tone, 'up');
  assert.match(r.reason, /4\.500.*→.*4\.900/);
  assert.strictEqual(r.c2, '₺4.500');
});

test('P2. Kayitli fiyat oneriden yuksekse Dusur; esitse Koru', () => {
  const [d] = App.pricingListRows([day('2026-12-02')], ctx([['2026-12-02', { price: 5500, source: 'MANUAL' }]]));
  assert.strictEqual(d.tag, 'Düşür'); assert.strictEqual(d.tone, 'down');
  const [k] = App.pricingListRows([day('2026-12-03')], ctx([['2026-12-03', { price: 4900, source: 'APPROVED' }]]));
  assert.strictEqual(k.tag, 'Koru'); assert.strictEqual(k.tone, 'keep');
});

test('P3. Kayit yoksa Yap (onay bekliyor); gunluk fiyat kaydi kapaliysa "onay" denmez', () => {
  const [y] = App.pricingListRows([day('2026-12-04')], ctx());
  assert.strictEqual(y.tag, 'Yap'); assert.match(y.reason, /onay bekliyor/);
  const [o] = App.pricingListRows([day('2026-12-04')], ctx([], { dailyReady: false }));
  assert.strictEqual(o.tag, 'Öneri'); assert.doesNotMatch(o.reason, /onay bekliyor/);
});

test('P4. Dolu ve kapali gunde fiyat yazilmaz (uydurma yok); baz fiyat yoksa oneri yok', () => {
  const rows = App.pricingListRows([day('2026-12-05', { status: 'BOOKED', price: null }), day('2026-12-06', { status: 'BLOCKED', price: null }), day('2026-12-07', { price: null })], ctx());
  assert.deepStrictEqual(rows.map(r => r.c2), ['Dolu', 'Kapalı', '—']);
  assert.match(rows[2].reason, /Baz fiyat/);
});

test('P5. Hafta sonu ve tarih Lex tablosu icin tasinir; ayrinti dugmesi gune gider', () => {
  const [r] = App.pricingListRows([day('2026-12-04')], ctx());
  assert.strictEqual(r.date, '2026-12-04');
  assert.match(r.c2Attr, /focusPricingDay\(decodeURIComponent\('2026-12-04'\)\)/);
});

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
