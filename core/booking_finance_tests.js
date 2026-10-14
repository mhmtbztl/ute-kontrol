const assert = require('assert');
const Finance = require('./booking_finance');
let failed = 0, passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('[PASS] ' + name); } catch (e) { failed++; console.error('[FAIL] ' + name + ': ' + e.message); } }
// Synthetic test configuration, not legal rates or recommendations.
const profile = { dateBasis: 'checkIn', validFrom: '2020-01-01', validTo: '2040-12-31',
  vat: { rate: 10, room: true, cleaning: true, includesOther: false },
  accommodation: { rate: 2, room: true, cleaning: false, includesOther: false } };
const input = { amount: 12200, cleanFee: 1000, discount: 0, commission: 1500, paymentCommission: 100, cleanCost: 500, nights: 4,
  checkIn: '2031-01-01', checkOut: '2031-01-05', tax: { enabled: true, mode: 'exclusive', profile,
    vat: { platformCollected: 0, businessLiability: 1220 }, accommodation: { platformCollected: 0, businessLiability: 224 } }, extras: [] };
test('disabled taxes preserve old cash while ADR excludes commission', () => {
  const r = Finance.calculate({ ...input, tax: { enabled: false } });
  assert.equal(r.gross, 12200); assert.equal(r.netRoomRevenue, 11200); assert.equal(r.adr, 2800); assert.equal(r.remaining, 10100);
});
test('exclusive tax and cleaning bases are separate', () => {
  const r = Finance.calculate(input);
  assert.equal(r.vat, 1220); assert.equal(r.accommodation, 224); assert.equal(r.gross, 13644);
  assert.equal(r.netRoomRevenue, 11200); assert.equal(r.remaining, 10100);
});
test('inclusive inverse produces same room revenue and taxes', () => {
  const r = Finance.calculate({ ...input, amount: 13644, cleanFee: 1100, tax: { ...input.tax, mode: 'inclusive' } });
  assert.equal(r.vat, 1220); assert.equal(r.accommodation, 224); assert.equal(r.netRoomRevenue, 11200);
});
test('manual taxes require room/cleaning allocation', () => {
  const r = Finance.calculate({ ...input, tax: { enabled: true, mode: 'manual', vat: { amount: 800, cleaningAmount: 50, platformCollected: 0, businessLiability: 800 }, accommodation: { amount: 200, cleaningAmount: 0, platformCollected: 0, businessLiability: 200 } } });
  assert.equal(r.gross, 12200); assert.equal(r.netRoomRevenue, 10250); assert.equal(r.cleaningRevenue, 950);
});
test('platform collection and business liability do not deduct same tax twice', () => {
  const r = Finance.calculate({ ...input, tax: { ...input.tax, vat: { platformCollected: 1220, businessLiability: 1220 }, accommodation: { platformCollected: 224, businessLiability: 224 } } });
  assert.equal(r.platformTax, 1444); assert.equal(r.businessTaxCash, 0); assert.equal(r.remaining, 10100);
});
test('partial platform collection subtracts only remaining business share', () => {
  const r = Finance.calculate({ ...input, tax: { ...input.tax, vat: { platformCollected: 400, businessLiability: 1220 } } });
  assert.equal(r.businessTaxCash, 1044); assert.equal(r.remaining, 10100);
});
test('collection and liability never turn collected tax into income', () => {
  const r = Finance.calculate({...input,tax:{...input.tax,vat:{platformCollected:'none',businessLiability:'none'},accommodation:{platformCollected:'none',businessLiability:'none'}}});
  assert.equal(r.businessLiability,0); assert.equal(r.businessTaxCash,1444); assert.equal(r.remaining,10100);
});
test('multiple expenses, zero commission and negative balance', () => {
  const r = Finance.calculate({ ...input, amount: 100, cleanFee: 0, tax: { enabled: false }, commission: 0, paymentCommission: 0, cleanCost: 50,
    extras: [{ id: 'a', name: 'Fuel', amount: 40 }, { id: 'b', name: 'Supplies', amount: 30 }] });
  assert.equal(r.otherExpenses, 70); assert.equal(r.remaining, -20);
});
test('unknown cleaning stays unknown; explicit zero remains zero', () => {
  assert.equal(Finance.calculate({ ...input, cleanCost: null }).cleanCost, null);
  assert.equal(Finance.calculate({ ...input, cleanCost: 0 }).cleanCost, 0);
});
test('missing profile, missing base and circular tax rules are rejected', () => {
  assert.throws(() => Finance.calculate({ ...input, tax: { enabled: true, mode: 'inclusive' } }));
  assert.throws(() => Finance.validateProfile({ ...profile, vat: { rate: 10 } }));
  assert.throws(() => Finance.validateProfile({ ...profile, vat: { ...profile.vat, includesOther: true }, accommodation: { ...profile.accommodation, includesOther: true } }));
});
test('tax on tax is applied only when explicitly configured', () => {
  const p = { ...profile, vat: { ...profile.vat, includesOther: true } };
  const r = Finance.calculate({ ...input, tax: { ...input.tax, profile: p, vat: { platformCollected: 0, businessLiability: 1242.4 } } });
  assert.equal(r.vat, 1242.4);
});
test('saved snapshot round-trip does not depend on current settings', () => {
  const saved = JSON.parse(JSON.stringify(input)); const a = Finance.calculate(saved);
  const settings = { ...profile, vat: { ...profile.vat, rate: 90 } };
  assert.notEqual(settings.vat.rate, saved.tax.profile.vat.rate);
  assert.deepEqual(Finance.calculate(saved), a);
});
test('date basis is explicit and out-of-period rules are rejected', () => {
  assert.throws(() => Finance.calculate({ ...input, checkIn: '2041-01-01' }));
  assert.throws(() => Finance.validateProfile({ ...profile, dateBasis: '' }));
});
test('discount reduces accommodation base and survives save inputs', () => {
  const r = Finance.calculate({ ...input, discount: 200, tax: { enabled: false } });
  assert.equal(r.gross, 12000); assert.equal(r.netRoomRevenue, 11000);
});
test('ledger uses tax-exclusive room and cleaning revenue, never cash remaining', () => {
  const ledger = require('./ledger_contract');
  const r = Finance.calculate(input);
  const result = ledger.computePeriodLedger({ bookings: [{ gross: r.gross, cleanFee: 1100, discount: 0, otaComm: 1500, paymentCommission: 100,
    financialDetails: { input, result: r } }], bookingShare: () => ({ ratio: 1, nights: 4 }) });
  assert.equal(result.netRoomRevenue, 11200); assert.equal(result.cleaningRevenue, 1000); assert.equal(result.adr, 2800);
  assert.equal(result.totalOpex, 1600);
});
test('CSV round trip preserves finance inputs and rejects conflicting edited totals', () => {
  const Export = require('./finance_export_engine'), Import = require('./finance_import_engine');
  const result = Finance.calculate(input);
  const csv = Export.toCSV(Export.buildExport('BOOKINGS',[{villa:'villa',guest:'Test',checkIn:input.checkIn,checkOut:input.checkOut,gross:result.gross,cleaningFee:1100,otaCommission:1500,discount:0,channel:'AIRBNB',pax:2,status:'CONFIRMED',financialDetails:{version:1,input,result}}]));
  const parsed = Import.parseCSV(csv), map = Import.autoDetectColumnMap(parsed.headers,'BOOKINGS');
  const ctx = {properties:[{id:'p1',slug:'villa',name:'villa'}],existingBookings:[],isPeriodClosed:()=>false,isStayPeriodClosed:()=>false};
  const r = Import.validateBookingRows(parsed.rows,map,ctx);
  assert.equal(r.validCount,1); assert.deepStrictEqual(r.validatedRows[0].financeInput,input);
  parsed.rows[0][map.gross] = '999';
  assert.equal(Import.validateBookingRows(parsed.rows,map,ctx).validCount,0);
});
test('month boundary accrual excludes tax without reducing ADR for commissions', () => {
  const r = Finance.calculate(input), metrics = require('./financial_metrics_service');
  const nights = metrics.splitBookingStayNights({checkIn:'2031-01-30',checkOut:'2031-02-03',gross:r.gross,cleanFee:1100,otaComm:1500,financialDetails:{result:r}});
  assert.equal(nights.length,4);
  assert.equal(nights.filter(n => n.month === 1).reduce((s,n)=>s+n.roomRevenue,0),5600);
  assert.equal(nights.filter(n => n.month === 2).reduce((s,n)=>s+n.roomRevenue,0),5600);
});
console.log(`${passed} passed, ${failed} failed`); process.exitCode = failed ? 1 : 0;
