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

// M3 (kullanici, 04.10): enlem/boylami herkes bilmez. Kullanicinin elinde
// olabilecek her bicim okunur; okunamayan icin NEDEN soylenir.
const near = (got, lat, lng, tol = 0.0005) => got && Math.abs(got.latitude - lat) < tol && Math.abs(got.longitude - lng) < tol;
const read = value => Engine.readLocationInput(value);
// Pin konumu (!3d!4d) ekran merkezinden (@) once gelir.
assert.ok(near(read('https://www.google.com/maps/place/Villa/@36.20,29.60,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d36.2012345!4d29.6431234'), 36.2012345, 29.6431234), 'pin konumu');
assert.ok(near(read('36.2012, 29.6431'), 36.2012, 29.6431), 'kopyalanan düz koordinat');
assert.ok(near(read('https://www.google.com/maps/search/36.2012,+29.6431'), 36.2012, 29.6431), 'arama bağlantısı');
assert.ok(near(read('https://maps.google.com/maps?ll=36.2012,29.6431&z=15'), 36.2012, 29.6431), 'll parametresi');
// Tam Plus Code cevrimdisi cozulur (Open Location Code).
assert.ok(near(read('8FVC9G8F+6X'), 47.36556, 8.52481, 0.0003), 'tam Plus Code (Zürih)');
assert.ok(near(read('849VCWC8+R9'), 37.42199, -122.08406, 0.0003), 'tam Plus Code (Mountain View)');
assert.strictEqual(read('849VCWC8+R9').source, 'PLUS_CODE');
// Kisa Plus Code ve kisa paylasim baglantisi cevrimdisi cozulemez: uydurulmaz, neden soylenir.
assert.strictEqual(read('CWC8+R9 Mountain View').error, 'SHORT_PLUS_CODE');
assert.strictEqual(read('https://maps.app.goo.gl/AbCdEf123').error, 'SHORT_LINK');
assert.strictEqual(read('https://goo.gl/maps/AbCdEf123').error, 'SHORT_LINK');
assert.strictEqual(read('rastgele metin').error, 'NOT_FOUND');
assert.strictEqual(read('').error, 'EMPTY');
assert.strictEqual(read('95.0, 29.0').error, 'NOT_FOUND', 'aralık dışı enlem');
console.log('[PASS] M3. Konum: Maps bağlantısı, pin, düz koordinat ve tam Plus Code okunur; kısa kod/bağlantı nedenle reddedilir');

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
