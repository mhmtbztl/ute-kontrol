const assert = require('assert');
const C = require('./target_revenue_calculator');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (e) { failed++; console.error(`[FAIL] ${name}\n       ${e.stack || e.message}`); } }

test('sözleşme örneği: 300 bin hedefte doluluk ve beklenen fiyata göre gereken ortalama', () => {
  const r = C.calculate({ target: 300000, soldToDate: { nights: 0, netRoomRevenue: 0 }, openNights: { weekday: 30, weekend: 0, special: 0 }, prices: { weekday: 15000, weekend: 0, special: 0 }, expectedOccupancy: 0.55, focus: 'BALANCED' });
  assert.strictEqual(r.status, 'OK');
  assert(Math.abs(r.requiredOccupancy - 2 / 3) < 0.0001);
  assert.strictEqual(r.requiredAvgPriceAtExpected, 18181.82);
});

test('sözleşme örneği: hedef zaten gerçekleşti', () => {
  const r = C.calculate({ target: 90000, soldToDate: { nights: 6, netRoomRevenue: 90000 }, openNights: { weekday: 24, weekend: 0, special: 0 }, prices: { weekday: 15000, weekend: 0, special: 0 } });
  assert.strictEqual(r.status, 'REACHED');
  assert.strictEqual(r.remaining, 0);
});

test('boş işletme null neden döndürür; null ile sıfır ayrıdır', () => {
  const empty = C.calculate({});
  assert.strictEqual(empty.status, 'INPUT_MISSING');
  assert.strictEqual(empty.weightedAvgPrice, null);
  assert.strictEqual(empty.reason.code, 'TARGET_MISSING');
  const zero = C.calculate({ target: 0, soldToDate: { nights: 0, netRoomRevenue: 0 }, openNights: { weekday: 0, weekend: 0, special: 0 }, prices: { weekday: 0, weekend: 0, special: 0 } });
  assert.strictEqual(zero.status, 'REACHED');
});

test('odak yalnız vurguyu değiştirir, hesapları değiştirmez', () => {
  const base = { target: 100000, soldToDate: { nights: 0, netRoomRevenue: 0 }, openNights: { weekday: 10, weekend: 2, special: 0 }, prices: { weekday: 10000, weekend: 15000, special: 0 }, history: { occupancy: 0.7, adr: 11000 } };
  const a = C.calculate({ ...base, focus: 'OCCUPANCY' }), b = C.calculate({ ...base, focus: 'REVENUE' });
  assert.strictEqual(a.requiredOccupancy, b.requiredOccupancy);
  assert.notStrictEqual(a.highlightedRow, b.highlightedRow);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
