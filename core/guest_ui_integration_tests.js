const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { mapBookingFromDb, mapBookingToDb, mapGuestToDb, splitGuestName } = require('../app.js');

const booking = mapBookingFromDb({
  id: 'b1', tenant_id: 't1', property_id: 'p1', booking_code: 'BK-1',
  guest_name: 'Ayşe Yılmaz', primary_guest_id: 'g1', check_in: '2026-01-01',
  check_out: '2026-01-03', gross_amount: 10000, status: 'CONFIRMED'
});
assert.strictEqual(booking.primaryGuestId, 'g1');
assert.strictEqual(mapBookingToDb(booking, 't1').primary_guest_id, 'g1');
console.log('[PASS] Booking mapper preserves canonical guest linkage');

assert.deepStrictEqual(splitGuestName('  Ayşe Nur Yılmaz  '), { firstName: 'Ayşe', lastName: 'Nur Yılmaz' });
const dbGuest = mapGuestToDb({ firstName: ' Ayşe ', lastName: ' Yılmaz ', email: 'AYSE@EXAMPLE.COM', marketingOptIn: true, preferences: ' Sessiz oda ', internalNotes: ' Tekrar arayın ', tags: [' VIP ', 'VIP', 'Aile'] });
assert.strictEqual(dbGuest.first_name, 'Ayşe');
assert.strictEqual(dbGuest.last_name, 'Yılmaz');
assert.strictEqual(dbGuest.email, 'ayse@example.com');
assert.strictEqual(dbGuest.marketing_opt_in, true);
assert.strictEqual(dbGuest.preferences, 'Sessiz oda');
assert.strictEqual(dbGuest.internal_notes, 'Tekrar arayın');
assert.deepStrictEqual(dbGuest.tags, ['VIP', 'Aile']);
console.log('[PASS] Guest form fields map to the Phase10 schema without camelCase leakage');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const renderStart = appSource.indexOf('function renderGuestsTab()');
const renderEnd = appSource.indexOf('function renderPricingTab()', renderStart);
const renderSource = appSource.slice(renderStart, renderEnd);
assert(renderSource.includes('appData.guests'));
assert(renderSource.includes('filterGuestRows'));
assert(renderSource.includes('openGuestProfileModal'));
assert(!renderSource.includes('openReservationModal'));
assert(!renderSource.includes('activeBookings.slice(0, 20)'));
console.log('[PASS] Misafirler screen renders canonical profiles with working detail action');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(html.includes('id="guestDirectorySearch"'));
assert(html.includes('id="guestDirectorySegment"'));
assert(html.includes('id="guestDirectoryDateStart"'));
assert(html.includes('id="guestDirectoryDateEnd"'));
assert(html.includes('id="guestDirectorySortDirection"'));
assert(html.includes('id="guestDirectoryProperty"'));
assert(html.includes('value="REBOOKING"'));
assert(html.includes('id="guestKpiRebooking"'));
assert(renderSource.includes('openGuestRebookingWhatsApp'));
assert(html.includes('id="guestProfileModal"'));
assert(html.includes('id="guestPreferences"'));
assert(html.includes('id="guestInternalNotes"'));
assert(html.includes('id="guestTags"'));
assert(html.includes('id="resGuestPhone"'));
assert(html.includes('id="resGuestEmail"'));
console.log('[PASS] Search, segmentation, guest detail and reservation contact capture are present');

console.log('TEST SUMMARY: 4 / 4 TESTS PASSED (0 FAILED)');
