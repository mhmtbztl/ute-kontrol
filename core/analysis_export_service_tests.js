const assert = require('assert');

const {
  ANALYSIS_SCHEMA_VERSION,
  validateAnalysisRequest,
  buildAnalysisPackage
} = require('./analysis_export_service');

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

function expectCode(fn, code) {
  assert.throws(fn, error => error && error.code === code);
}

test('analysis contract exposes a stable schema version', () => {
  assert.strictEqual(ANALYSIS_SCHEMA_VERSION, '1.0');
});

test('inclusive UI dates normalize to an end-exclusive internal range', () => {
  const request = validateAnalysisRequest({
    period: { start: '2026-09-01', end: '2026-09-30' },
    propertyIds: ['prop-a'],
    sections: ['FINANCE']
  });

  assert.deepStrictEqual(request.period, {
    start: '2026-09-01',
    end: '2026-09-30',
    endExclusive: '2026-10-01',
    dayCount: 30
  });
});

test('invalid periods fail with a stable error code', () => {
  expectCode(() => validateAnalysisRequest({
    period: { start: '2026-09-30', end: '2026-09-01' },
    propertyIds: ['prop-a'], sections: ['FINANCE']
  }), 'ANALYSIS_INVALID_PERIOD');

  expectCode(() => validateAnalysisRequest({
    period: { start: '09/01/2026', end: '2026-09-30' },
    propertyIds: ['prop-a'], sections: ['FINANCE']
  }), 'ANALYSIS_INVALID_PERIOD');
});

test('empty property and section scopes are rejected explicitly', () => {
  expectCode(() => validateAnalysisRequest({
    period: { start: '2026-09-01', end: '2026-09-30' },
    propertyIds: [], sections: ['FINANCE']
  }), 'ANALYSIS_EMPTY_PROPERTY_SCOPE');

  expectCode(() => validateAnalysisRequest({
    period: { start: '2026-09-01', end: '2026-09-30' },
    propertyIds: ['prop-a'], sections: []
  }), 'ANALYSIS_EMPTY_SECTIONS');
});

test('minimal package is versioned, deterministic and contains only allowlisted business fields', () => {
  const input = {
    period: { start: '2026-09-01', end: '2026-09-30' },
    comparison: { mode: 'NONE' },
    propertyIds: ['prop-a'],
    sections: ['FINANCE'],
    currency: 'TRY',
    generatedAt: '2026-09-22T12:00:00.000Z',
    business: { name: 'Lex Villas', tenantId: 'tenant-secret-id' },
    properties: [{ id: 'prop-a', name: 'Seyir', tenant_id: 'tenant-secret-id' }],
    bookings: [], expenses: [], maintenances: []
  };

  const first = buildAnalysisPackage(input);
  const second = buildAnalysisPackage(input);

  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.schemaVersion, '1.0');
  assert.strictEqual(first.generatedAt, input.generatedAt);
  assert.strictEqual(first.currency, 'TRY');
  assert.deepStrictEqual(first.portfolio.properties, [{ name: 'Seyir' }]);
  assert.strictEqual(first.financials.financialRevenue, 0);
  assert.strictEqual(first.financials.operatingExpenses, 0);
  assert.strictEqual(first.financials.netMargin, null);
  assert.strictEqual(first.comparisonPeriod, null);
  assert.strictEqual(first.dataQuality.status, 'INSUFFICIENT_DATA');

  const serialized = JSON.stringify(first);
  assert(!serialized.includes('tenant-secret-id'));
  assert(!serialized.includes('prop-a'));
  assert(!serialized.includes('guest_name'));
});

test('analysis package maps canonical range finance and STR metrics without exposing source rows', () => {
  const result = buildAnalysisPackage({
    period: { start: '2026-09-01', end: '2026-09-05' },
    comparison: { mode: 'NONE' },
    propertyIds: ['prop-a'],
    sections: ['FINANCE', 'BOOKING_KPIS', 'EXPENSES', 'INVESTMENTS'],
    currency: 'TRY',
    generatedAt: '2026-09-22T12:00:00.000Z',
    properties: [{ id: 'prop-a', name: 'Seyir', activated_on: '2026-09-01' }],
    bookings: [{
      id: 'booking-internal-id', property_id: 'prop-a',
      check_in: '2026-08-31', check_out: '2026-09-03',
      gross_amount: 3000, cleaning_fee: 300, ota_commission: 300,
      guest_name: 'Export edilmemeli', guest_phone: '+900000000'
    }],
    expenses: [
      { id: 'expense-1', property_id: 'prop-a', expense_date: '2026-09-02', amount: 500, expense_type: 'OPEX', category: 'Bakım' },
      { id: 'expense-2', property_id: 'prop-a', expense_date: '2026-09-04', amount: 1000, expense_type: 'CAPEX', category: 'Yatırım' }
    ],
    maintenances: []
  });

  assert.deepStrictEqual(result.financials, {
    financialRevenue: 2000,
    roomRevenue: 1800,
    otherRevenue: 200,
    operatingExpenses: 700,
    totalExpenses: 1700,
    otaCommission: 200,
    investments: 1000,
    operatingProfit: 1300,
    netCashProfit: 300,
    operatingMargin: 65,
    netMargin: 15,
    expenseCategories: { 'Bakım': 500, 'Yatırım': 1000 },
    unallocatedPortfolioExpenses: 0,
    dateBasis: 'STAY_DATE_AND_EXPENSE_DATE'
  });
  assert.deepStrictEqual(result.bookingKpis, {
    reservationCount: 1,
    soldNights: 2,
    availableNights: 5,
    occupancy: 40,
    adr: 900,
    revpar: 360,
    averageBookingValue: 2000,
    dateBasis: 'STAY_DATE'
  });
  const serialized = JSON.stringify(result);
  assert(!serialized.includes('booking-internal-id'));
  assert(!serialized.includes('Export edilmemeli'));
  assert(!serialized.includes('+900000000'));
});

test('selected properties must belong to the provided tenant-scoped property set', () => {
  expectCode(() => buildAnalysisPackage({
    period: { start: '2026-09-01', end: '2026-09-30' },
    propertyIds: ['foreign-property'], sections: ['FINANCE'],
    properties: [{ id: 'owned-property', name: 'Owned' }]
  }), 'ANALYSIS_UNKNOWN_PROPERTY');
});

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
