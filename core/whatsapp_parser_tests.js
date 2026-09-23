const assert = require('assert');
const fs = require('fs');
const path = require('path');
const App = require('../app.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

const villas = {
  SAHIL: { name: 'Sahil Konaklari' },
  ORMAN: { name: 'Orman Evi' }
};
const today = '2026-09-23';

test('Explicit numeric dates parse and a phone is not mistaken for money', () => {
  const result = App.parseWhatsAppMessageText(
    'Merhaba ben Ayşe Yılmaz. 0532 123 45 67. 10.01.2027 - 14.01.2027 arası 4 kişi',
    villas,
    today
  );
  assert.strictEqual(result.phone, '0532 123 45 67');
  assert.strictEqual(result.amount, null);
  assert.strictEqual(result.checkIn, '2027-01-10');
  assert.strictEqual(result.checkOut, '2027-01-14');
  assert.strictEqual(result.pax, 4);
  assert.strictEqual(result.villa, null);
});

test('Month names roll forward to the next future occurrence without inventing pax or property', () => {
  const result = App.parseWhatsAppMessageText(
    '20-24 Ocak için yer var mı? Bütçemiz 45 bin',
    villas,
    today
  );
  assert.strictEqual(result.checkIn, '2027-01-20');
  assert.strictEqual(result.checkOut, '2027-01-24');
  assert.strictEqual(result.amount, 45000);
  assert.strictEqual(result.pax, null);
  assert.strictEqual(result.villa, null);
});

test('Decimal thousand amounts and explicit guest counts are preserved', () => {
  const result = App.parseWhatsAppMessageText(
    'Misafir: Can Demir, 3-7 Mart, 2 yetişkin, fiyat 1.5 bin',
    villas,
    today
  );
  assert.strictEqual(result.guest, 'Can Demir');
  assert.strictEqual(result.amount, 1500);
  assert.strictEqual(result.pax, 2);
  assert.strictEqual(result.checkIn, '2027-03-03');
  assert.strictEqual(result.checkOut, '2027-03-07');
});

test('Property is selected only when the message names a real tenant property', () => {
  const result = App.parseWhatsAppMessageText(
    'Orman Evi için 5-8 Ekim, 3 kişi, teklif 24.000 TL',
    villas,
    today
  );
  assert.strictEqual(result.villa, 'ORMAN');
  assert.strictEqual(result.amount, 24000);
});

test('Parser UI has no hidden six-person default', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.doesNotMatch(html, /id="waParsedPax"[^>]*value="6"/);
  assert.doesNotMatch(app, /getElementById\('waParsedPax'\)\.value\) \|\| 6/);
  assert.match(app, /if \(!villa\)[\s\S]*Lütfen rezervasyon için villayı seçiniz/);
  assert.match(app, /if \(!paxText \|\| !Number\.isFinite\(pax\) \|\| pax <= 0\)/);
});

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
