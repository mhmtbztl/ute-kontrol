const assert = require('assert');
const fs = require('fs');
const path = require('path');
const App = require('../app.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

App.setAppData({ villas: {}, bookings: [], expenses: [], cleaningTasks: [] });
App.setCurrentFilter({ period: '2027-YEAR', villa: 'ALL', startDate: null, endDate: null });

test('Any YYYY-YEAR key produces its complete calendar range', () => {
  assert.deepStrictEqual(App.getFilterDateRange(), {
    start: '2027-01-01',
    end: '2027-12-31'
  });
});

test('Year filter includes only overlapping booking nights', () => {
  assert.strictEqual(App.isBookingInFilter({ checkIn: '2027-02-10', checkOut: '2027-02-12' }), true);
  assert.strictEqual(App.isBookingInFilter({ checkIn: '2026-12-10', checkOut: '2026-12-12' }), false);
});

test('Year filter is shared by expenses, cleaning dates and campaigns', () => {
  assert.strictEqual(App.isExpenseInFilter({ date: '2027-05-03', villa: 'ALL' }), true);
  assert.strictEqual(App.isExpenseInFilter({ date: '2026-05-03', villa: 'ALL' }), false);
  assert.strictEqual(App.isDateInFilter('2027-09-23'), true);
  assert.strictEqual(App.isDateInFilter('2028-01-01'), false);
  assert.strictEqual(App.isCampaignInFilter({ startDate: '2027-11-01', endDate: '2028-01-15', villa: 'ALL' }), true);
  assert.strictEqual(App.isCampaignInFilter({ startDate: '2026-11-01', endDate: '2026-12-15', villa: 'ALL' }), false);
});

test('Legacy fixed-year and fixed-start fallbacks are absent from filter code', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(!source.includes("currentFilter.period === '2026-YEAR' || currentFilter.period === '2025-YEAR'"));
  assert.ok(!source.includes("currentFilter.startDate || '2025-07-01'"));
});

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
