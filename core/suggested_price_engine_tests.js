const assert = require('assert');
const E = require('./suggested_price_engine');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (e) { failed++; console.error(`[FAIL] ${name}\n       ${e.stack || e.message}`); } }

test('sözleşme fiyat örneği: hafta sonu, son dakika, boş gece ve taban', () => {
  const input = { property: { id: 'p1', basePrice: 12000, floorPrice: 10000 }, today: '2026-10-05', days: 10, occupancyTarget: null, bookings: [{ propertyId: 'p1', checkIn: '2026-10-13', checkOut: '2026-10-14' }, { propertyId: 'p1', checkIn: '2026-10-15', checkOut: '2026-10-16' }], blocks: [], specialDays: [] };
  const r = E.suggest(input);
  assert.strictEqual(r.days.find(x => x.date === '2026-10-09').price, 13800);
  assert.strictEqual(r.days.find(x => x.date === '2026-10-14').price, 10200);
  assert(r.warnings.some(x => x.code === 'OCCUPANCY_TARGET_MISSING'));
  const floored = E.suggest({ ...input, property: { ...input.property, floorPrice: 11000 } }).days.find(x => x.date === '2026-10-14');
  assert.strictEqual(floored.price, 11000);
  assert.strictEqual(floored.floorApplied, true);
});

test('boş işletmede fiyat uydurulmaz; null taban ile sıfır taban ayrıdır', () => {
  const missing = E.suggest({ property: {}, today: '2026-10-05', days: 1 });
  assert.strictEqual(missing.days[0].price, null);
  assert(missing.warnings.some(x => x.code === 'BASE_PRICE_MISSING'));
  const zero = E.suggest({ property: { basePrice: 0, floorPrice: 0 }, today: '2026-10-05', days: 1, occupancyTarget: 0 });
  assert.strictEqual(zero.days[0].price, 0);
});

test('geçmiş ipucu LedgerContract alanlarını ve 8 gecelik örnek eşiğini kullanır', () => {
  const sellableDates = ['2025-10-03','2025-10-04','2025-10-10','2025-10-11','2025-10-17','2025-10-18','2025-10-24','2025-10-25','2025-10-01','2025-10-02','2025-10-06','2025-10-07','2025-10-08','2025-10-09','2025-10-13','2025-10-14'];
  const bookings = sellableDates.map((date, i) => ({ property_id: 'p1', check_in: date, check_out: new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0,10), gross_amount: 1000 + i, cleaning_fee: 100, discount: 0 }));
  const h = E.historyHint({ property: { id: 'p1' }, bookings, sellableDates, monthKey: '2026-10' });
  assert.strictEqual(h.sampleNights.weekend, 8);
  assert.strictEqual(h.sampleNights.weekday, 8);
  assert(h.weekendAdr.value > 0);
});

test('geçmiş/öngörü boş veride ölçülmemiş kalır', () => {
  assert.strictEqual(E.historyHint({ property: { id: 'p1' }, bookings: [], sellableDates: [], monthKey: '2026-10' }), null);
  const f = E.forecastMonth({ monthKey: '2026-10', today: '2026-10-05', ledgerToDate: null, suggestions: [], historyHint: null });
  assert.strictEqual(f.actual, null);
  assert.strictEqual(f.planned, null);
  assert.strictEqual(f.reason.code, 'HISTORY_MISSING');
});

test('kimliksiz rezervasyon başka mülkü dolu göstermez', () => {
  const r = E.suggest({
    property: { id: 'p-zirve', basePrice: 10000 },
    today: '2026-10-05',
    days: 4,
    bookings: [{ villa: 'SEYIR', checkIn: '2026-10-06', checkOut: '2026-10-08' }]
  });
  assert.strictEqual(r.days.find(x => x.date === '2026-10-06').status, 'OPEN');
  assert.strictEqual(r.days.find(x => x.date === '2026-10-07').status, 'OPEN');
});

test('ay sonu tahmini yalnız seçili ayın kalan günlerini gece türü doluluğuyla tartar', () => {
  const suggestions = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.parse('2026-10-20T00:00:00Z') + index * 86400000).toISOString().slice(0, 10);
    return { date, status: 'OPEN', price: 10000 };
  });
  const r = E.forecastMonth({
    monthKey: '2026-10',
    today: '2026-10-20',
    ledgerToDate: { netRoomRevenue: 50000 },
    suggestions,
    historyHint: {
      weekendOccupancy: { value: 0.9 },
      weekdayOccupancy: { value: 0.3 }
    }
  });
  assert.strictEqual(r.actual, 50000);
  assert.strictEqual(r.planned, 60000);
  assert.strictEqual(r.expected, 110000);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
