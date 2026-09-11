// =============================================================================
// LEXBNB PHASE 8 — FINANCIAL METRICS & FORMULA TEST SUITE
// =============================================================================

const assert = require('assert');
const {
  roundMoney,
  splitBookingStayNights,
  calculateAvailableNights,
  computeFinancialMetrics
} = require('./financial_metrics_service');

console.log('=============================================================================');
console.log('📊 LEXBNB PHASE 8 — FINANCIAL METRICS TEST SUITE');
console.log('=============================================================================');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}\n`);
    throw err;
  }
}

// -------------------------------------------------------------
// TEST 1: Phase 8 Acceptance Fixture (Financial Profit Bridge)
// -------------------------------------------------------------
runTest('1. Phase 8 Acceptance Fixture: Financial P&L and Profit Bridge', () => {
  // Financial Acceptance Fixture:
  // Financial Revenue: 483.965
  // Operating Expenses: 337.306
  // CAPEX: 3.866
  // Operating Profit: 146.659
  // Net Cash Profit: 142.793
  // Operating Margin: ~30.30%
  // Net Cash Margin: ~29.50%

  const dummyBooking = {
    id: 'B-ACCEPTANCE',
    propertyId: 'PROP-1',
    checkIn: '2026-08-01',
    checkOut: '2026-08-31',
    grossAmount: 483965,
    cleaningFee: 0,
    discount: 0,
    status: 'CONFIRMED'
  };

  const dummyExpenses = [
    { expense_date: '2026-08-10', amount: 337306, expense_type: 'OPEX', category: 'Operasyonel Giderler' },
    { expense_date: '2026-08-20', amount: 3866, expense_type: 'CAPEX', category: 'Yatırım Harcamaları' }
  ];

  const dummyProperties = [{ id: 'PROP-1', is_active: true }];

  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 8,
    bookings: [dummyBooking],
    expenses: dummyExpenses,
    properties: dummyProperties
  });

  assert.strictEqual(metrics.financial.revenue, 483965, 'Revenue must match fixture exactly');
  assert.strictEqual(metrics.financial.operatingExpenses, 337306, 'OPEX must match fixture exactly');
  assert.strictEqual(metrics.financial.capex, 3866, 'CAPEX must match fixture exactly');
  assert.strictEqual(metrics.financial.operatingProfit, 146659, 'Operating Profit must be 146.659');
  assert.strictEqual(metrics.financial.netCashProfit, 142793, 'Net Cash Profit must be 142.793');
  assert.strictEqual(metrics.financial.operatingMargin, 30.30, 'Operating Margin must be 30.30%');
  assert.strictEqual(metrics.financial.netCashMargin, 29.50, 'Net Cash Margin must be 29.50%');
});

// -------------------------------------------------------------
// TEST 2: Phase 8 STR Operational Fixture (Decoupled from Financial Revenue)
// -------------------------------------------------------------
runTest('2. STR Operational Fixture: ADR, RevPAR, and Occupancy using Room Revenue', () => {
  // STR Fixture:
  // Room Revenue = 420.000 TL
  // Sold Nights = 70 nights
  // Available Nights = 150 nights (5 properties * 30 days)
  // ADR = 6.000 TL
  // RevPAR = 2.800 TL
  // Occupancy = 46.67%

  const properties = [
    { id: 'P1', is_active: true },
    { id: 'P2', is_active: true },
    { id: 'P3', is_active: true },
    { id: 'P4', is_active: true },
    { id: 'P5', is_active: true }
  ];

  // Create bookings summing to 70 nights and 420.000 room revenue (with 28.000 cleaning fee)
  // Financial Revenue = 448.000 TL != Room Revenue 420.000 TL
  const bookings = [
    {
      id: 'B1', propertyId: 'P1', checkIn: '2026-09-01', checkOut: '2026-09-21', // 20 nights
      grossAmount: 128000, cleaningFee: 8000, discount: 0, status: 'CONFIRMED'
    },
    {
      id: 'B2', propertyId: 'P2', checkIn: '2026-09-01', checkOut: '2026-09-26', // 25 nights
      grossAmount: 160000, cleaningFee: 10000, discount: 0, status: 'CONFIRMED'
    },
    {
      id: 'B3', propertyId: 'P3', checkIn: '2026-09-05', checkOut: '2026-09-30', // 25 nights
      grossAmount: 160000, cleaningFee: 10000, discount: 0, status: 'CONFIRMED'
    }
  ];

  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 9,
    bookings,
    properties
  });

  assert.strictEqual(metrics.operations.soldNights, 70, 'Sold nights must be 70');
  assert.strictEqual(metrics.operations.availableNights, 150, 'Available nights must be 150 (5 * 30)');
  assert.strictEqual(metrics.operations.roomRevenue, 420000, 'Room revenue must be 420.000 TL');
  assert.strictEqual(metrics.financial.revenue, 448000, 'Financial revenue must be 448.000 TL (includes cleaning fee)');
  assert.strictEqual(metrics.operations.adr, 6000.00, 'ADR must be 6.000 TL (420.000 / 70, NOT based on 448.000)');
  assert.strictEqual(metrics.operations.revpar, 2800.00, 'RevPAR must be 2.800 TL (420.000 / 150)');
  assert.strictEqual(metrics.operations.occupancy, 46.67, 'Occupancy must be 46.67%');
  assert.strictEqual(metrics.reconciliation.difference, 28000, 'Reconciliation must record 28.000 TL cleaning revenue difference');
});

// -------------------------------------------------------------
// TEST 3: CRITICAL TEST 14 — OTA Commission & Cleaning Revenue Decoupling
// -------------------------------------------------------------
runTest('3. Critical Test 14: Booking Room Rev 10k, Cleaning 2k, OTA 1.5k; Finance Rev 12k, OPEX 1.5k', () => {
  // Booking:
  // Room Revenue = 10,000 TL
  // Cleaning Revenue = 2,000 TL
  // Gross = 12,000 TL
  // OTA Commission = 1,500 TL
  // Finance records:
  // Financial Revenue = 12,000 TL
  // OTA Commission Expense = 1,500 TL (in expenses table as OPEX)
  
  const booking = {
    id: 'BK-CRIT-14',
    propertyId: 'PROP-ALPHA',
    checkIn: '2026-10-01',
    checkOut: '2026-10-03', // 2 nights
    grossAmount: 12000,
    cleaningFee: 2000,
    otaCommission: 1500,
    discount: 0,
    status: 'CONFIRMED'
  };

  const expenses = [
    {
      expense_date: '2026-10-02',
      amount: 1500,
      expense_type: 'OPEX',
      category: 'Komisyon',
      property_id: 'PROP-ALPHA'
    }
  ];

  const properties = [{ id: 'PROP-ALPHA', is_active: true }];

  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 10,
    bookings: [booking],
    expenses,
    properties
  });

  // Expected Validations:
  // 1. Financial Revenue = 12,000 TL
  assert.strictEqual(metrics.financial.revenue, 12000, 'Financial Revenue must be 12.000 TL');

  // 2. OPEX = 1,500 TL (commission counted once as OPEX)
  assert.strictEqual(metrics.financial.operatingExpenses, 1500, 'Operating Expense must include commission once (1.500 TL)');

  // 3. Operating Profit Impact = 10,500 TL before other expenses
  assert.strictEqual(metrics.financial.operatingProfit, 10500, 'Operating profit impact must be exactly 10.500 TL');

  // 4. Room Revenue = 10,000 TL
  assert.strictEqual(metrics.operations.roomRevenue, 10000, 'Room revenue must be 10.000 TL');

  // 5. ADR = 5,000 TL (10,000 / 2 nights). NEVER 12,000 / 2 = 6,000 TL!
  assert.strictEqual(metrics.operations.adr, 5000, 'ADR must be calculated from 10.000 TL (5.000 TL/night), NEVER 12.000 TL');

  // 6. Commission is NOT deducted twice
  assert(metrics.financial.operatingProfit !== (12000 - 1500 - 1500), 'Commission must not be double deducted');
});

// -------------------------------------------------------------
// TEST 4: Split-Month Accrual Across Month Boundaries (Aug 29 to Sept 2)
// -------------------------------------------------------------
runTest('4. Split-Month Accrual: Booking crossing month boundary (Aug 29 to Sept 02, 4 nights)', () => {
  // CheckIn: 2026-08-29, CheckOut: 2026-09-02 (4 nights: Aug 29, Aug 30, Aug 31, Sept 01)
  // Gross: 40.000 TL, Cleaning Fee: 4.000 TL -> Room Revenue: 36.000 TL (9.000 TL/night)
  // August (3 nights: 29, 30, 31) -> Room Rev: 27.000 TL, Fin Rev: 30.000 TL, Sold Nights: 3
  // September (1 night: 01) -> Room Rev: 9.000 TL, Fin Rev: 10.000 TL, Sold Nights: 1

  const crossBooking = {
    id: 'BK-CROSS',
    propertyId: 'PROP-X',
    checkIn: '2026-08-29',
    checkOut: '2026-09-02',
    grossAmount: 40000,
    cleaningFee: 4000,
    discount: 0,
    status: 'CONFIRMED'
  };

  const properties = [{ id: 'PROP-X', is_active: true }];

  const augMetrics = computeFinancialMetrics({
    year: 2026,
    month: 8,
    bookings: [crossBooking],
    properties
  });

  const septMetrics = computeFinancialMetrics({
    year: 2026,
    month: 9,
    bookings: [crossBooking],
    properties
  });

  assert.strictEqual(augMetrics.operations.soldNights, 3, 'August must have exactly 3 stay nights');
  assert.strictEqual(augMetrics.operations.roomRevenue, 27000, 'August room revenue must be 27.000 TL');
  assert.strictEqual(augMetrics.financial.revenue, 30000, 'August financial revenue must be 30.000 TL');

  assert.strictEqual(septMetrics.operations.soldNights, 1, 'September must have exactly 1 stay night');
  assert.strictEqual(septMetrics.operations.roomRevenue, 9000, 'September room revenue must be 9.000 TL');
  assert.strictEqual(septMetrics.financial.revenue, 10000, 'September financial revenue must be 10.000 TL');
});

// -------------------------------------------------------------
// TEST 5: Portfolio vs Single Property Scope & Unallocated Expenses
// -------------------------------------------------------------
runTest('5. Scope Handling: Portfolio includes unallocated expenses; Single Property excludes them', () => {
  const properties = [
    { id: 'PROP-A', slug: 'VILLA_A', is_active: true },
    { id: 'PROP-B', slug: 'VILLA_B', is_active: true }
  ];

  const expenses = [
    { expense_date: '2026-07-05', amount: 5000, expense_type: 'OPEX', property_id: 'PROP-A', category: 'Villa A Havuz' },
    { expense_date: '2026-07-10', amount: 3000, expense_type: 'OPEX', property_id: 'PROP-B', category: 'Villa B Bahçe' },
    { expense_date: '2026-07-15', amount: 8000, expense_type: 'OPEX', property_id: null, category: 'Şirket Muhasebe & Ofis' } // Unallocated
  ];

  // Portfolio Scope
  const portMetrics = computeFinancialMetrics({
    year: 2026,
    month: 7,
    propertyId: null,
    expenses,
    properties
  });

  assert.strictEqual(portMetrics.financial.operatingExpenses, 16000, 'Portfolio OPEX must sum all expenses (5k + 3k + 8k = 16k)');
  assert.strictEqual(portMetrics.financial.unallocatedPortfolioExpenses, 8000, 'Unallocated expenses must be recorded as 8.000 TL');

  // Single Property Scope (Villa A)
  const propAMetrics = computeFinancialMetrics({
    year: 2026,
    month: 7,
    propertyId: 'PROP-A',
    expenses,
    properties
  });

  assert.strictEqual(propAMetrics.financial.operatingExpenses, 5000, 'Prop A OPEX must include only direct expenses (5.000 TL)');
  assert.strictEqual(propAMetrics.financial.unallocatedPortfolioExpenses, 0, 'Prop A must not arbitrarily absorb unallocated portfolio expenses');
});

// -------------------------------------------------------------
// TEST 6: Zero Revenue & Zero Nights Safety (No NaN / Infinity)
// -------------------------------------------------------------
runTest('6. Safe Zero Handling: Zero revenue, sold nights, and available nights never yield NaN or Infinity', () => {
  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 5,
    bookings: [],
    expenses: [],
    properties: [] // Zero available nights
  });

  assert.strictEqual(metrics.financial.revenue, 0);
  assert.strictEqual(metrics.financial.operatingMargin, 0);
  assert.strictEqual(metrics.financial.netCashMargin, 0);
  assert.strictEqual(metrics.operations.occupancy, 0);
  assert.strictEqual(metrics.operations.adr, 0);
  assert.strictEqual(metrics.operations.revpar, 0);
  assert(!isNaN(metrics.operations.adr), 'ADR must not be NaN');
  assert(isFinite(metrics.operations.adr), 'ADR must not be Infinity');
});

// -------------------------------------------------------------
// TEST 7: Negative Profit Handling
// -------------------------------------------------------------
runTest('7. Negative Profit: High OPEX and CAPEX correctly calculate negative net cash profit', () => {
  const booking = {
    id: 'BK-LOW',
    propertyId: 'PROP-1',
    checkIn: '2026-06-01',
    checkOut: '2026-06-05',
    grossAmount: 10000,
    cleaningFee: 0,
    discount: 0,
    status: 'CONFIRMED'
  };

  const expenses = [
    { expense_date: '2026-06-10', amount: 15000, expense_type: 'OPEX', category: 'Maaşlar' },
    { expense_date: '2026-06-15', amount: 20000, expense_type: 'CAPEX', category: 'Klima' }
  ];

  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 6,
    bookings: [booking],
    expenses,
    properties: [{ id: 'PROP-1', is_active: true }]
  });

  assert.strictEqual(metrics.financial.operatingProfit, -5000, 'Operating profit must be -5.000 TL');
  assert.strictEqual(metrics.financial.netCashProfit, -25000, 'Net cash profit must be -25.000 TL');
  assert.strictEqual(metrics.financial.operatingMargin, -50.00, 'Operating margin must be -50%');
});

// -------------------------------------------------------------
// TEST 8: Cancelled Bookings Exclusion from STR KPIs
// -------------------------------------------------------------
runTest('8. Cancelled Bookings Exclusion: Cancelled bookings do not contribute to revenue or sold nights', () => {
  const bookings = [
    {
      id: 'BK-ACTIVE', propertyId: 'PROP-1', checkIn: '2026-09-01', checkOut: '2026-09-06',
      grossAmount: 30000, status: 'CONFIRMED'
    },
    {
      id: 'BK-CANCELLED', propertyId: 'PROP-1', checkIn: '2026-09-10', checkOut: '2026-09-20',
      grossAmount: 80000, status: 'CANCELLED' // Should be excluded completely
    }
  ];

  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 9,
    bookings,
    properties: [{ id: 'PROP-1', is_active: true }]
  });

  assert.strictEqual(metrics.operations.soldNights, 5, 'Sold nights must only reflect confirmed booking (5 nights)');
  assert.strictEqual(metrics.financial.revenue, 30000, 'Revenue must only reflect confirmed booking (30.000 TL)');
});

// -------------------------------------------------------------
// TEST 9: Available Nights with Mid-Month Activation and Maintenance Downtime
// -------------------------------------------------------------
runTest('9. Available Nights: Mid-month activation (Aug 15) and P1 maintenance downtime', () => {
  // Property opened on Aug 15: 17 days in August (15 to 31)
  // P1 maintenance with 2 days downtime
  // Available nights should be 17 - 2 = 15 nights (NOT 31 nights)

  const properties = [
    { id: 'PROP-MID', slug: 'VILLA_MID', is_active: true, activationDate: '2026-08-15' }
  ];

  const maintenances = [
    { villa: 'PROP-MID', priority: 'P1', status: 'OPEN', downtime: 2 }
  ];

  const avail = calculateAvailableNights(properties, 2026, 8, maintenances);
  assert.strictEqual(avail, 15, 'Available nights must be exactly 15 nights (17 active days - 2 downtime)');
});

// -------------------------------------------------------------
// TEST 10: Target Achievement & Target Difference Calculations
// -------------------------------------------------------------
runTest('10. Targets Engine: Target achievement percentage and delta calculations', () => {
  const booking = {
    id: 'BK-TGT', propertyId: 'PROP-1', checkIn: '2026-08-01', checkOut: '2026-08-11', // 10 nights
    grossAmount: 100000, cleaningFee: 0, discount: 0, status: 'CONFIRMED'
  };

  const targets = [
    {
      year: 2026,
      month: 8,
      property_id: null, // Portfolio target
      revenue_target: 120000,
      net_profit_target: 80000,
      occupancy_target: 50.00,
      adr_target: 9500
    }
  ];

  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 8,
    bookings: [booking],
    properties: [{ id: 'PROP-1', is_active: true }],
    targets
  });

  assert(metrics.targets.hasTarget, 'Target must be recognized');
  assert.strictEqual(metrics.targets.revenueTarget, 120000);
  assert.strictEqual(metrics.targets.revenueTargetAchievement, 83.33, '100k / 120k * 100 = 83.33%');
  assert.strictEqual(metrics.targets.revenueTargetDiff, -20000, '100k - 120k = -20.000 TL');
  assert.strictEqual(metrics.targets.adrDiff, undefined);
  assert.strictEqual(metrics.targets.adrTargetDiff, 500, 'ADR 10.000 - target 9.500 = +500 TL');
});

// -------------------------------------------------------------
// TEST 11: Missing Target State Handling (No fake 0% or 100%)
// -------------------------------------------------------------
runTest('11. Missing Target State: When no target exists, hasTarget is false and no fake percentage is produced', () => {
  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 8,
    bookings: [],
    targets: [] // No targets defined
  });

  assert.strictEqual(metrics.targets.hasTarget, false);
  assert.strictEqual(metrics.targets.revenueTarget, null);
  assert.strictEqual(metrics.targets.revenueTargetAchievement, null);
  assert.strictEqual(metrics.targets.revenueTargetDiff, null);
});

console.log(`\n=============================================================================`);
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
console.log(`=============================================================================\n`);
