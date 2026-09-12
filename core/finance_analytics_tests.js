// =============================================================================
// LEXBNB PHASE 8 — FINANCE ANALYTICS, COMPARISONS, TRENDS & INSIGHTS TEST SUITE
// =============================================================================

const assert = require('assert');
const {
  computeFinancialMetrics,
  computeComparativeMetrics,
  computeTrendTimeline,
  detectAnomaliesAndInsights,
  computePropertyScorecards,
  buildAiAnalystPayload,
  validateAiResponseSchema,
  FINANCE_INSIGHT_THRESHOLDS
} = require('./financial_metrics_service');

console.log('=============================================================================');
console.log('📈 LEXBNB PHASE 8 — FINANCE ANALYTICS & INSIGHTS TEST SUITE');
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
// TEST 1: MoM (Month-over-Month) Normal Growth Calculation
// -------------------------------------------------------------
runTest('1. MoM Calculation: Normal positive and negative growth calculation', () => {
  const currentMetrics = {
    financial: { revenue: 120000, operatingExpenses: 40000, operatingProfit: 80000, netCashProfit: 75000 },
    operations: { occupancy: 60.00, adr: 5000, revpar: 3000 }
  };

  const prevMetrics = {
    financial: { revenue: 100000, operatingExpenses: 50000, operatingProfit: 50000, netCashProfit: 45000 },
    operations: { occupancy: 50.00, adr: 4500, revpar: 2250 }
  };

  const comp = computeComparativeMetrics({
    currentMetrics,
    previousMonthMetrics: prevMetrics
  });

  assert(comp.mom.comparisonAvailable, 'MoM comparison must be available');
  assert.strictEqual(comp.mom.revenue.changeAmount, 20000);
  assert.strictEqual(comp.mom.revenue.changePercent, 20.00, 'Revenue +20%');
  assert.strictEqual(comp.mom.operatingExpenses.changeAmount, -10000);
  assert.strictEqual(comp.mom.operatingExpenses.changePercent, -20.00, 'OPEX -20%');
  assert.strictEqual(comp.mom.occupancy.changeAmount, 10.00);
});

// -------------------------------------------------------------
// TEST 2: MoM Previous = 0 or Missing Previous Month Handling
// -------------------------------------------------------------
runTest('2. MoM Edge Cases: Previous = 0 or missing previous month produces comparisonAvailable: false (no fake %)', () => {
  const currentMetrics = {
    financial: { revenue: 50000, operatingExpenses: 20000, operatingProfit: 30000, netCashProfit: 30000 },
    operations: { occupancy: 40, adr: 4000, revpar: 1600 }
  };

  // Missing previous month
  const compMissing = computeComparativeMetrics({
    currentMetrics,
    previousMonthMetrics: null
  });
  assert.strictEqual(compMissing.mom.comparisonAvailable, false, 'Missing previous month must flag comparisonAvailable: false');

  // Previous month with 0 revenue
  const prevZero = {
    financial: { revenue: 0, operatingExpenses: 0, operatingProfit: 0, netCashProfit: 0 },
    operations: { occupancy: 0, adr: 0, revpar: 0 }
  };
  const compZero = computeComparativeMetrics({
    currentMetrics,
    previousMonthMetrics: prevZero
  });
  assert.strictEqual(compZero.mom.revenue.changePercent, null, 'Previous 0 revenue must not produce infinity or fake percent');
  assert.strictEqual(compZero.mom.revenue.comparisonAvailable, false);
});

// -------------------------------------------------------------
// TEST 3: YoY (Year-over-Year) Calculation
// -------------------------------------------------------------
runTest('3. YoY Calculation: Compares against same month of previous year', () => {
  const currentMetrics = {
    financial: { revenue: 200000, operatingExpenses: 80000, operatingProfit: 120000, netCashProfit: 110000 },
    operations: { occupancy: 70, adr: 6500, revpar: 4550 }
  };

  const prevYearMetrics = {
    financial: { revenue: 160000, operatingExpenses: 70000, operatingProfit: 90000, netCashProfit: 85000 },
    operations: { occupancy: 60, adr: 5800, revpar: 3480 }
  };

  const comp = computeComparativeMetrics({
    currentMetrics,
    previousYearMetrics: prevYearMetrics
  });

  assert(comp.yoy.comparisonAvailable, 'YoY comparison must be available');
  assert.strictEqual(comp.yoy.revenue.changeAmount, 40000);
  assert.strictEqual(comp.yoy.revenue.changePercent, 25.00, 'YoY revenue +25%');
  assert.strictEqual(comp.inflationDataAvailable, false, 'Inflation data is documented as unavailable');
});

// -------------------------------------------------------------
// TEST 4: Trend Engine (6M Timeline with Chronological Ordering)
// -------------------------------------------------------------
runTest('4. Trend Engine: Produces 6M monthly aggregated timeline with deterministic zero-fill', () => {
  const context = {
    properties: [{ id: 'P1', is_active: true }],
    bookings: [
      { id: 'B1', propertyId: 'P1', checkIn: '2026-08-10', checkOut: '2026-08-15', grossAmount: 50000, status: 'CONFIRMED' },
      { id: 'B2', propertyId: 'P1', checkIn: '2026-06-01', checkOut: '2026-06-05', grossAmount: 30000, status: 'CONFIRMED' }
    ],
    expenses: [
      { expense_date: '2026-08-12', amount: 15000, expense_type: 'OPEX' }
    ]
  };

  const timeline = computeTrendTimeline({
    range: '6M',
    endYear: 2026,
    endMonth: 8,
    context
  });

  assert.strictEqual(timeline.length, 6, 'Timeline must contain exactly 6 months');
  assert.strictEqual(timeline[timeline.length - 1].yearMonth, '2026-08', 'Last month in timeline must be 2026-08');
  assert.strictEqual(timeline[timeline.length - 1].revenue, 50000);
  assert.strictEqual(timeline[timeline.length - 1].operatingExpenses, 15000);

  // Month 2026-07 had 0 bookings and 0 expenses -> deterministic zero fill
  const july = timeline.find(t => t.yearMonth === '2026-07');
  assert(july, 'July 2026 must be present in timeline');
  assert.strictEqual(july.revenue, 0, 'July revenue must be 0');
  assert.strictEqual(july.soldNights, 0, 'July sold nights must be 0');
});

// -------------------------------------------------------------
// TEST 5: Deterministic Anomaly: High Occupancy + Low ADR
// -------------------------------------------------------------
runTest('5. Anomaly Detection: High Occupancy + Low ADR triggers descriptive pricing review insight', () => {
  const currentMetrics = {
    financial: { revenue: 100000, netCashMargin: 30 },
    operations: { occupancy: 50.00, adr: 6000 }
  };

  // Property Villa Alpha has 70% occupancy (> 50 + 15 = 65%) and 4.800 ADR (< 6000 * 0.85 = 5.100)
  const scorecards = [
    {
      propertyId: 'PROP-A',
      name: 'Villa Alpha',
      occupancy: 70.00,
      adr: 4800,
      soldNights: 21
    },
    {
      propertyId: 'PROP-B',
      name: 'Villa Beta',
      occupancy: 45.00,
      adr: 6500,
      soldNights: 14
    }
  ];

  const insights = detectAnomaliesAndInsights({
    currentMetrics,
    propertyScorecards: scorecards
  });

  const highOccLowAdr = insights.find(i => i.type === 'HIGH_OCC_LOW_ADR');
  assert(highOccLowAdr, 'HIGH_OCC_LOW_ADR insight must be detected');
  assert.strictEqual(highOccLowAdr.propertyId, 'PROP-A');
  assert(highOccLowAdr.message.includes('Fiyat/talep dengesi incelenebilir'), 'Description must be non-causal');
});

// -------------------------------------------------------------
// TEST 6: Deterministic Anomaly: Expense Spike MoM
// -------------------------------------------------------------
runTest('6. Anomaly Detection: Category expense growth > 25% and > ₺5,000 triggers Expense Spike', () => {
  const currentMetrics = {
    financial: {
      revenue: 150000,
      netCashMargin: 25,
      categoryBreakdown: { 'Elektrik': 16000, 'Bakım': 5000 }
    },
    operations: { occupancy: 50, adr: 5000 }
  };

  const prevMetrics = {
    financial: {
      categoryBreakdown: { 'Elektrik': 10000, 'Bakım': 4800 } // Elektrik grew from 10k to 16k (+6k, +60%)
    }
  };

  const insights = detectAnomaliesAndInsights({
    currentMetrics,
    previousMonthMetrics: prevMetrics
  });

  const spike = insights.find(i => i.type === 'EXPENSE_SPIKE' && i.title.includes('Elektrik'));
  assert(spike, 'Elektrik expense spike must be detected');
  assert.strictEqual(spike.currentValue, 16000);
  assert.strictEqual(spike.targetValue, 10000);
});

// -------------------------------------------------------------
// TEST 7: Property Scorecards Generation
// -------------------------------------------------------------
runTest('7. Property Scorecards: Computes direct revenue, direct expense, and operating contribution per villa', () => {
  const properties = [
    { id: 'P-1', slug: 'BELLA', name: 'Villa Bella Vista', is_active: true },
    { id: 'P-2', slug: 'AZURE', name: 'Villa Azure Bay', is_active: true }
  ];

  const bookings = [
    { propertyId: 'P-1', checkIn: '2026-08-01', checkOut: '2026-08-11', grossAmount: 60000, cleaningFee: 2000, status: 'CONFIRMED' },
    { propertyId: 'P-2', checkIn: '2026-08-01', checkOut: '2026-08-16', grossAmount: 120000, cleaningFee: 3000, status: 'CONFIRMED' }
  ];

  const expenses = [
    { property_id: 'P-1', expense_date: '2026-08-05', amount: 15000, expense_type: 'OPEX' },
    { property_id: 'P-2', expense_date: '2026-08-08', amount: 35000, expense_type: 'OPEX' }
  ];

  const scorecards = computePropertyScorecards({
    year: 2026,
    month: 8,
    properties,
    bookings,
    expenses
  });

  assert.strictEqual(scorecards.length, 2, 'Scorecards must cover both active properties');
  
  const bella = scorecards.find(s => s.slug === 'BELLA');
  assert.strictEqual(bella.revenue, 60000);
  assert.strictEqual(bella.roomRevenue, 58000);
  assert.strictEqual(bella.directOperatingExpense, 15000);
  assert.strictEqual(bella.estimatedOperatingContribution, 45000); // 60k - 15k = 45k

  const azure = scorecards.find(s => s.slug === 'AZURE');
  assert.strictEqual(azure.revenue, 120000);
  assert.strictEqual(azure.directOperatingExpense, 35000);
  assert.strictEqual(azure.estimatedOperatingContribution, 85000); // 120k - 35k = 85k
});

// -------------------------------------------------------------
// TEST 8: AI Analyst Payload Builder & Schema Validation
// -------------------------------------------------------------
runTest('8. AI Payload Builder: Builds sanitized structured payload and validates AI response schema', () => {
  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 8,
    bookings: [{ propertyId: 'P1', checkIn: '2026-08-01', checkOut: '2026-08-11', grossAmount: 70000, status: 'CONFIRMED' }],
    properties: [{ id: 'P1', name: 'Villa 1', is_active: true }]
  });

  const payload = buildAiAnalystPayload({
    metrics,
    comparative: { mom: {}, yoy: {} },
    scorecards: [],
    anomalies: []
  });

  assert.strictEqual(payload.period, '2026-08');
  assert.strictEqual(payload.financialSummary.revenue, 70000);
  assert(!payload.rawDatabaseDump, 'Payload must not contain raw sensitive database dumps');

  // Validate valid AI output
  const validAiResponse = {
    wins: ['Ağustos ayı ciro hedefi başarıyla aşıldı.'],
    risks: ['Bakım maliyetlerinde hafif yükseliş gözlemlendi.'],
    observations: ['Hafta içi doluluk hafta sonuna kıyasla güçlü seyretti.'],
    actions: [
      {
        title: 'Eylül Ayı Taban Fiyat Gözden Geçirmesi',
        reason: 'Yüksek talep dolayısıyla taban fiyat artırılabilir.',
        priority: 'MEDIUM',
        metric: 'adr',
        currentValue: 7000,
        targetValue: 8000
      }
    ]
  };
  assert(validateAiResponseSchema(validAiResponse), 'Valid AI schema must pass validation');

  // Validate invalid AI output (missing actions array)
  const invalidAiResponse = {
    wins: ['Tek bir win']
  };
  assert(!validateAiResponseSchema(invalidAiResponse), 'Invalid AI schema must be rejected');
});

console.log(`\n=============================================================================`);
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
console.log(`=============================================================================\n`);
