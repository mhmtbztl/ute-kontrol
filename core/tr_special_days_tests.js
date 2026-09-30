const assert = require('assert');
const S = require('./tr_special_days');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (e) { failed++; console.error(`[FAIL] ${name}\n       ${e.stack || e.message}`); } }

test('2026 ve 2027 resmî kaynaklı günleri ve yarıyıl tatilini döndürür', () => {
  assert.deepStrictEqual(S.coveredYears(), [2026, 2027]);
  const d26 = S.forRange('2026-03-19', '2026-03-22');
  assert.deepStrictEqual(d26.map(x => x.date), ['2026-03-19', '2026-03-20', '2026-03-21', '2026-03-22']);
  assert.strictEqual(d26[0].name, 'Ramazan Bayramı Arefesi');
  assert(S.forRange('2027-01-25', '2027-02-05').every(x => x.kind === 'OKUL'));
});

test('bilinmeyen yıl hesaplanmaz ve uyarılır', () => {
  const rows = S.forRange('2028-01-01', '2028-01-03');
  assert.deepStrictEqual(Array.from(rows), []);
  assert.strictEqual(rows.warnings[0].code, 'SPECIAL_DAYS_UNKNOWN_FOR_YEAR');
});

test('boş/geçersiz aralık uydurma gün üretmez; yılbaşı sıfırdan farklı bir kayıttır', () => {
  assert.deepStrictEqual(Array.from(S.forRange(null, null)), []);
  const rows = S.forRange('2026-01-01', '2026-01-01');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].kind, 'YILBASI');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
