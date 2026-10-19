const assert = require('assert');
const C = require('./monthly_goal_calculator');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed++;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

test('ADR elle değişince ciro sabit kalır ve gereken gece yukarı yuvarlanır', () => {
  const result = C.recalculate({ revenue: 100000, adr: 6000, nights: 10 }, 'adr');
  assert.deepStrictEqual(result.updates, { nights: 17 });
});

test('gece elle değişince ADR hedefin altında kalmayacak biçimde kuruşa yuvarlanır', () => {
  const result = C.recalculate({ revenue: 100000, adr: 6000, nights: 3 }, 'nights');
  assert.deepStrictEqual(result.updates, { adr: 33333.34 });
  assert(result.values.adr * result.values.nights >= result.values.revenue);
});

test('marj elle değişince net kâr ve hedef gider bütçesi hesaplanır', () => {
  const result = C.recalculate({ revenue: 300000, margin: 35, profit: 1, maxExpense: 1 }, 'margin');
  assert.deepStrictEqual(result.updates, { profit: 105000, maxExpense: 195000 });
});

test('net kâr elle değişince marj ve hedef gider bütçesi hesaplanır', () => {
  const result = C.recalculate({ revenue: 200000, margin: 10, profit: 50000, maxExpense: 1 }, 'profit');
  assert.deepStrictEqual(result.updates, { margin: 25, maxExpense: 150000 });
});

test('ciro değişince son elle düzenlenen ADR korunur', () => {
  const result = C.recalculate(
    { revenue: 250000, adr: 7000, nights: 30, margin: 30, profit: 90000 },
    'revenue',
    { rateDriver: 'adr', profitDriver: 'margin' }
  );
  assert.strictEqual(result.values.adr, 7000);
  assert.strictEqual(result.values.nights, 36);
  assert.strictEqual(result.values.margin, 30);
  assert.strictEqual(result.values.profit, 75000);
  assert.strictEqual(result.values.maxExpense, 175000);
});

test('ciro değişince son elle düzenlenen gece ve net kâr korunur', () => {
  const result = C.recalculate(
    { revenue: 240000, adr: 5000, nights: 40, margin: 30, profit: 60000 },
    'revenue',
    { rateDriver: 'nights', profitDriver: 'profit' }
  );
  assert.strictEqual(result.values.nights, 40);
  assert.strictEqual(result.values.adr, 6000);
  assert.strictEqual(result.values.profit, 60000);
  assert.strictEqual(result.values.margin, 25);
  assert.strictEqual(result.values.maxExpense, 180000);
});

test('boş ve sıfır bölen diğer manuel alanı silmez; NaN veya Infinity üretmez', () => {
  const adrMissing = C.recalculate({ revenue: 100000, adr: null, nights: 20 }, 'adr');
  assert.deepStrictEqual(adrMissing.updates, {});
  assert.strictEqual(adrMissing.values.nights, 20);

  const nightsZero = C.recalculate({ revenue: 100000, adr: 5000, nights: 0 }, 'nights');
  assert.deepStrictEqual(nightsZero.updates, {});
  assert.strictEqual(nightsZero.values.adr, 5000);
  assert(!Object.values(nightsZero.values).some(v => Number.isNaN(v) || v === Infinity || v === -Infinity));
});

test('kapasite aşımı yüzde 100e sıkıştırılmaz ve doğrulamada reddedilir', () => {
  const capacity = C.evaluateCapacity(31, 30);
  assert.deepStrictEqual(capacity, { occupancy: 103.33, exceeds: true, available: 30 });
  const validation = C.validateForSave({ revenue: 100000, nights: 31, adr: 3225.81, profit: 30000, margin: 30, maxExpense: 70000 }, 30);
  assert(validation.errors.some(error => error.code === 'CAPACITY_EXCEEDED'));
});

test('negatif, sonlu olmayan ve tutarsız tutarlar kayda uygun sayılmaz', () => {
  const validation = C.validateForSave({
    revenue: 100000,
    nights: 20,
    adr: Infinity,
    profit: -1,
    margin: NaN,
    maxExpense: -5
  }, 30);
  const codes = validation.errors.map(error => error.code);
  assert(codes.includes('ADR_INVALID'));
  assert(codes.includes('PROFIT_INVALID'));
  assert(codes.includes('MARGIN_INVALID'));
  assert(codes.includes('MAX_EXPENSE_INVALID'));
});

test('eski kayıtta net kâr yoksa manuel tavan gider değiştirilmez', () => {
  const result = C.recalculate({ revenue: 300000, margin: null, profit: null, maxExpense: 180000 }, 'revenue');
  assert.strictEqual(result.values.maxExpense, 180000);
  assert.strictEqual(result.updates.maxExpense, undefined);
});

console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed) process.exit(1);
