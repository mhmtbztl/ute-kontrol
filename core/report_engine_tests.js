const assert = require('assert');
const R = require('./report_engine');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (e) { failed++; console.error(`[FAIL] ${name}\n       ${e.stack || e.message}`); } }

test('aynı ledger değerleri rapor hücrelerine birebir gider, yeniden hesaplanmaz', () => {
  const ledger = { netRoomRevenue: 12345.67, cleaningRevenue: 890.12, totalRevenue: 13235.79, totalOpex: 4567.89, netProfit: 8667.9, soldNights: 7, adr: 1763.667142857 };
  const r = R.buildReport({ page: 'FINANCE', period: { start: '2026-09-01', end: '2026-09-30' }, filters: {}, data: { ledger, bookings: [], expenses: [] }, business: { name: 'Lex' }, today: '2026-09-30' });
  const values = Object.fromEntries(r.sections[0].items.map(x => [x.id, x.value]));
  assert.strictEqual(values.netRoomRevenue, ledger.netRoomRevenue);
  assert.strictEqual(values.netProfit, ledger.netProfit);
  assert.strictEqual(values.adr, ledger.adr);
  assert.strictEqual(r.excel.roundTrip, true);
});

test('ölçülmeyen kâr null ve nedeni ile döner; sıfır ölçülmüş değerdir', () => {
  const base = { page: 'FINANCE', period: { start: '2026-09-01', end: '2026-09-30' }, filters: {}, business: {}, today: '2026-09-30' };
  const unknown = R.buildReport({ ...base, data: { ledger: { netRoomRevenue: 0, netProfit: 999 }, isProfitUnmeasured: true, bookings: [], expenses: [] } });
  assert.strictEqual(unknown.sections[0].items.find(x => x.id === 'netProfit').value, null);
  assert.strictEqual(unknown.unmeasured[0].id, 'netProfit');
  const zero = R.buildReport({ ...base, data: { ledger: { netRoomRevenue: 0, netProfit: 0 }, isProfitUnmeasured: false, bookings: [], expenses: [] } });
  assert.strictEqual(zero.sections[0].items.find(x => x.id === 'netProfit').value, 0);
});

test('boş işletme uydurma rakam üretmez', () => {
  const r = R.buildReport({ page: 'PROPERTY', period: { start: '2026-09-01', end: '2026-09-30' }, data: {}, business: {}, today: '2026-09-30' });
  assert(r.sections[0].items.every(x => x.value === null));
  assert(r.unmeasured.length > 0);
});

test('ChatGPT bağlamı misafir alanlarını içermez ve rapor Exceli rapor olarak işaretlenir', () => {
  const r = R.buildReport({ page: 'SALES', period: { start: '2026-09-01', end: '2026-09-30' }, data: { leads: [{ guestName: 'Ayşe', phone: '0555', email: 'a@b.c', status: 'NEW' }], funnel: { new: 1 } }, business: { name: 'Lex' }, today: '2026-09-30' });
  assert(!JSON.stringify(r.chatGptContext).includes('Ayşe'));
  assert.strictEqual(r.excel.roundTrip, false);
  assert(r.excel.sheets[0].rows[0].notice.includes('içe aktarılamaz'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
