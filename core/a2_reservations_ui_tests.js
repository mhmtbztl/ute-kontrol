const assert = require('assert');
const fs = require('fs');
const path = require('path');
const App = require('../app.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (error) { failed++; console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

test('Rezervasyon listesi varsayılan ay aralığını ve operasyon önceliğini uygular', () => {
  assert.strictEqual(typeof App.buildReservationListView, 'function');
  const rows = App.buildReservationListView({
    bookings: [
      { id: 'past', checkIn: '2026-09-01', checkOut: '2026-09-03', status: 'CHECKED_OUT' },
      { id: 'near', checkIn: '2026-09-16', checkOut: '2026-09-18', status: 'CONFIRMED' },
      { id: 'inside', checkIn: '2026-09-14', checkOut: '2026-09-17', status: 'CHECKED_IN' },
      { id: 'outside', checkIn: '2026-10-02', checkOut: '2026-10-04', status: 'CONFIRMED' }
    ],
    cleaningTasks: [{ bookingId: 'past', status: 'PLANNED', date: '2026-09-03' }],
    today: '2026-09-15', rangeStart: '2026-09-01', rangeEnd: '2026-09-30'
  });
  assert.deepStrictEqual(rows.map(row => row.booking.id), ['inside', 'near', 'past']);
  assert.strictEqual(rows[2].markers.cleaningPending, true);
});

test('Liste yalnız altı karar bilgisi taşır ve ayrıntı ortak SidePanel ile açılır', () => {
  assert.match(html, /class="[^"]*reservation-list-table[^"]*"/);
  assert.doesNotMatch(html, /WhatsApp'tan Rezervasyona Aktar/);
  assert.match(source, /function openBookingDetailsPanel/);
  assert.match(source, /SidePanel\.open/);
  assert.doesNotMatch(source.match(/function openBookingDetailsPanel[\s\S]*?\n}/)?.[0] || '', /Ödeme/);
});

test('Liste filtresi ortak DateRangePicker range kipini kullanır', () => {
  assert.match(html, /id="reservationRangePicker"/);
  assert.match(source, /pick\([^\n]+['"]range['"]\)/);
  assert.doesNotMatch(html, /id="rezPeriodFilter"/);
});

test('Takvim ay, bir hafta ve iki hafta görünümlerine sahiptir', () => {
  assert.match(html, /data-onclick="setTapeChartView\('WEEK_1'\)"/);
  assert.match(html, /data-onclick="setTapeChartView\('WEEK_2'\)"/);
  assert.match(html, /data-onclick="setTapeChartView\('MONTH'\)"/);
  assert.match(css, /tape-property-dot/);
  assert.match(css, /tape-chart-table tbody tr:nth-child\(even\)/);
});

test('Mobil rezervasyon listesi tabloyu kartlara dönüştürür', () => {
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*reservation-list-table/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
