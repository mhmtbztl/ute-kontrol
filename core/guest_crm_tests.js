const assert = require('assert');
const { isBulkSummaryBooking, buildGuestCrmView, filterGuestRows } = require('./guest_crm_engine.js');

let passed = 0;
function ok(name) { passed++; console.log('[PASS] ' + name); }

const guests = [
  { id: 'g1', firstName: 'Ayşe', lastName: 'Yılmaz', phone: '+905321111111', marketingOptIn: true },
  { id: 'g2', firstName: 'Can', email: 'can@example.com' },
  { id: 'g3', firstName: 'Deniz' }
];
const bookings = [
  { id: 'b1', primaryGuestId: 'g1', guest: 'Ayşe Yılmaz', checkIn: '2026-01-01', checkOut: '2026-01-04', nights: 3, gross: 30000, channel: 'AIRBNB', status: 'CHECKED_OUT' },
  { id: 'b2', primaryGuestId: 'g1', guest: 'Ayşe Yılmaz', checkIn: '2026-10-01', checkOut: '2026-10-05', nights: 4, gross: 50000, channel: 'WHATSAPP', status: 'CONFIRMED' },
  { id: 'b3', primaryGuestId: 'g2', guest: 'Can', checkIn: '2026-09-10', checkOut: '2026-09-16', nights: 6, gross: 60000, channel: 'BOOKING', status: 'CHECKED_IN' },
  { id: 'b4', guest: 'Bağlantısız Kayıt', checkIn: '2026-08-01', checkOut: '2026-08-02', gross: 10000, status: 'CONFIRMED' },
  { id: 'b5', guest: 'TOPLU AKTARIM — Temmuz 2025', checkIn: '2025-07-01', checkOut: '2025-07-05', gross: 53050, status: 'CONFIRMED' },
  { id: 'b6', primaryGuestId: 'g1', guest: 'Ayşe Yılmaz', checkIn: '2026-02-01', checkOut: '2026-02-03', gross: 20000, status: 'CANCELLED' }
];

assert.strictEqual(isBulkSummaryBooking(bookings[4]), true);
assert.strictEqual(isBulkSummaryBooking(bookings[0]), false);
ok('Toplu aktarım özetleri gerçek misafir sayılmaz');

const view = buildGuestCrmView({
  guests,
  bookings,
  messages: [{ booking_id: 'b2', status: 'SCHEDULED' }],
  offers: [{ booking_id: 'b2', status: 'OFFERED', created_at: '2026-09-14T10:00:00Z' }],
  today: '2026-09-14'
});
assert.strictEqual(view.metrics.totalGuests, 3);
assert.strictEqual(view.metrics.repeatGuests, 1);
assert.strictEqual(view.metrics.repeatRate, 1 / 3);
assert.strictEqual(view.metrics.repeatRevenue, 80000);
assert.strictEqual(view.metrics.contactableGuests, 2);
assert.strictEqual(view.metrics.unlinkedBookingCount, 1);
assert.strictEqual(view.metrics.excludedAggregateBookingCount, 1);
ok('KPI değerleri yalnız kanonik profiller ve bağlı rezervasyonlardan hesaplanır');

const ayse = view.rows.find(row => row.id === 'g1');
assert.strictEqual(ayse.stayCount, 2);
assert.strictEqual(ayse.nights, 7);
assert.strictEqual(ayse.isRepeat, true);
assert.strictEqual(ayse.directShare, 0.5);
assert.strictEqual(ayse.lifecycle.code, 'UPCOMING');
assert.strictEqual(ayse.scheduledCount, 1);
assert.strictEqual(ayse.latestOffer.status, 'OFFERED');
ok('Tekrar, değer, yaşam döngüsü, mesaj ve teklif durumu doğru birleşir');

const can = view.rows.find(row => row.id === 'g2');
assert.strictEqual(can.lifecycle.code, 'IN_HOUSE');
assert.strictEqual(can.stayCount, 1);
assert.strictEqual(can.isRepeat, false);
ok('Konaklamadaki misafirin yaşam döngüsü doğru belirlenir');

assert.deepStrictEqual(filterGuestRows(view.rows, { segment: 'REPEAT' }).map(row => row.id), ['g1']);
assert.deepStrictEqual(filterGuestRows(view.rows, { query: 'example.com' }).map(row => row.id), ['g2']);
assert.strictEqual(filterGuestRows(view.rows, { sort: 'VALUE' })[0].id, 'g1');
ok('Arama, segment ve sıralama kanonik satırlarda çalışır');

console.log(`TEST SUMMARY: ${passed} / ${passed} TESTS PASSED (0 FAILED)`);
