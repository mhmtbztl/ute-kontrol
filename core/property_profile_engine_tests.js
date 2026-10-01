const assert = require('assert');
const Engine = require('./property_profile_engine');

assert.deepStrictEqual(
  Engine.parseMapCoordinates('https://www.google.com/maps/place/Test/@40.123456,29.012345,15z'),
  { latitude: 40.123456, longitude: 29.012345 }
);
assert.deepStrictEqual(
  Engine.parseMapCoordinates('https://maps.google.com/?q=40.5001%2C29.6002'),
  { latitude: 40.5001, longitude: 29.6002 }
);
assert.strictEqual(Engine.parseMapCoordinates('https://example.com/no-location'), null);

const report = Engine.buildPropertyReport({
  property: { id: 'p1', slug: 'EV1' },
  bookings: [
    { propertyId: 'p1', status: 'CONFIRMED', checkIn: '2026-10-01', checkOut: '2026-10-03', gross: 22000, cleanFee: 2000, otaComm: 1000 },
    { propertyId: 'p2', status: 'CONFIRMED', checkIn: '2026-10-01', checkOut: '2026-10-02', gross: 999999 }
  ],
  expenses: [{ propertyId: 'p1', amount: 3000, type: 'OPEX' }, { propertyId: 'p2', amount: 999999 }],
  cleaningTasks: []
});
assert.strictEqual(report.netRoomRevenue, 20000);
assert.strictEqual(report.totalOpex, 4000);
assert.strictEqual(report.soldNights, 2);
console.log('[PASS] Mülk profili koordinatı istemcide okur ve raporu tek defterden üretir');
