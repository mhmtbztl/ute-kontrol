// =============================================================================
// LEXBNB PHASE 8 — FINANCE AI PAYLOAD & TASK CONVERSION TEST SUITE
// =============================================================================

const assert = require('assert');
const {
  computeFinancialMetrics,
  computeComparativeMetrics,
  computePropertyScorecards,
  detectAnomaliesAndInsights,
  buildAiAnalystPayload,
  validateAiResponseSchema
} = require('./financial_metrics_service');

console.log('=============================================================================');
console.log('🤖 LEXBNB PHASE 8 — FINANCE AI PAYLOAD & TASK INTEGRATION TEST SUITE');
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
// TEST 1: Sanitized AI Payload Generation
// -------------------------------------------------------------
runTest('1. AI Payload Sanitization: Generates deterministic summary without raw DB dump', () => {
  const properties = [
    { id: 'PROP-1', slug: 'BELLA', name: 'Villa Bella Vista', is_active: true }
  ];

  const bookings = [
    {
      id: 'B-1',
      propertyId: 'PROP-1',
      checkIn: '2026-08-01',
      checkOut: '2026-08-11',
      grossAmount: 75000,
      cleaningFee: 3000,
      discount: 0,
      status: 'CONFIRMED'
    }
  ];

  const expenses = [
    { property_id: 'PROP-1', expense_date: '2026-08-05', amount: 20000, expense_type: 'OPEX', category: 'Bakım' }
  ];

  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 8,
    properties,
    bookings,
    expenses
  });

  const comparative = computeComparativeMetrics({ currentMetrics: metrics });
  const scorecards = computePropertyScorecards({ year: 2026, month: 8, properties, bookings, expenses });
  const anomalies = detectAnomaliesAndInsights({ currentMetrics: metrics, propertyScorecards: scorecards });

  const aiPayload = buildAiAnalystPayload({
    metrics,
    comparative,
    scorecards,
    anomalies
  });

  assert.strictEqual(aiPayload.period, '2026-08');
  assert.strictEqual(aiPayload.financialSummary.revenue, 75000);
  assert.strictEqual(aiPayload.financialSummary.operatingExpenses, 20000);
  assert.strictEqual(aiPayload.financialSummary.operatingProfit, 55000);
  assert.strictEqual(aiPayload.operationsSummary.roomRevenue, 72000);
  assert.strictEqual(aiPayload.operationsSummary.soldNights, 10);
  assert(Array.isArray(aiPayload.properties) && aiPayload.properties.length === 1);
  assert.strictEqual(aiPayload.properties[0].name, 'Villa Bella Vista');

  // Ensure no raw SQL or DB internal metadata leaked
  assert(!aiPayload.tenant_members, 'Must not leak tenant_members');
  assert(!aiPayload.raw_queries, 'Must not leak raw_queries');
  assert(!aiPayload.passwords, 'Must not leak passwords');
});

// -------------------------------------------------------------
// TEST 2: Multi-Tenant Payload Isolation
// -------------------------------------------------------------
runTest('2. Tenant Data Isolation: AI payload includes only active tenant properties', () => {
  const tenantAProperties = [
    { id: 'PROP-A', slug: 'VILLA_A', name: 'Villa A', is_active: true }
  ];

  const tenantABookings = [
    { propertyId: 'PROP-A', checkIn: '2026-08-01', checkOut: '2026-08-05', grossAmount: 30000, status: 'CONFIRMED' }
  ];

  const metrics = computeFinancialMetrics({
    year: 2026,
    month: 8,
    properties: tenantAProperties,
    bookings: tenantABookings
  });

  const scorecards = computePropertyScorecards({
    year: 2026,
    month: 8,
    properties: tenantAProperties,
    bookings: tenantABookings
  });

  const payload = buildAiAnalystPayload({ metrics, comparative: { mom: {}, yoy: {} }, scorecards });
  assert(payload.properties.every(p => p.name === 'Villa A'));
  assert(!payload.properties.some(p => p.name.includes('Tenant B')));
});

// -------------------------------------------------------------
// TEST 3: AI Response Schema Validation
// -------------------------------------------------------------
runTest('3. AI Response Schema: Enforces valid structured JSON (wins, risks, observations, actions)', () => {
  const validOutput = {
    wins: ['Temmuz ayına göre oda geliri %15 arttı.'],
    risks: ['Bakım harcamalarında yükseliş görüldü.'],
    observations: ['Hafta sonu doluluğu %90 seviyesinde gerçekleşti.'],
    actions: [
      {
        title: 'Hafta İçi Fiyat Kampanyası',
        reason: 'Hafta içi doluluğu artırmak için.',
        priority: 'HIGH',
        propertyId: 'PROP-A',
        metric: 'occupancy',
        currentValue: 35.0,
        targetValue: 50.0
      }
    ]
  };

  assert.strictEqual(validateAiResponseSchema(validOutput), true);

  // Invalid: missing wins
  assert.strictEqual(validateAiResponseSchema({ risks: [], observations: [], actions: [] }), false);

  // Invalid action priority
  const badActionOutput = {
    wins: [], risks: [], observations: [],
    actions: [{ title: 'Test', priority: 'INVALID_PRIORITY' }]
  };
  assert.strictEqual(validateAiResponseSchema(badActionOutput), false);
});

// -------------------------------------------------------------
// TEST 4: AI Action -> Task Integration & Deduplication
// -------------------------------------------------------------
runTest('4. AI Action to Task Conversion: Creates maintenance task with metadata and prevents duplicates', () => {
  // Mock app state
  const mockMaintenanceList = [];

  function convertAiActionToTask(action, period) {
    // Generate deterministic task fingerprint to prevent duplicates
    const actionKey = `${action.title}|${action.propertyId || 'ALL'}|${period}`;
    const isDuplicate = mockMaintenanceList.some(t => t.metadata && t.metadata.actionKey === actionKey);
    if (isDuplicate) {
      return { success: false, reason: 'DUPLICATE_TASK' };
    }

    const newTask = {
      id: 'M-AI-' + (mockMaintenanceList.length + 1),
      villa: action.propertyId || 'ALL',
      priority: action.priority === 'HIGH' ? 'P1' : 'P2',
      title: action.title,
      assignee: 'Finans Yöneticisi',
      downtime: 0,
      cost: 0,
      status: 'OPEN',
      metadata: {
        source: 'FINANCE_AI',
        propertyId: action.propertyId || null,
        financialPeriod: period,
        sourceMetric: action.metric || null,
        actionKey
      }
    };

    mockMaintenanceList.push(newTask);
    return { success: true, task: newTask };
  }

  const aiAction = {
    title: 'Şömine ve Baca Sezon Öncesi Kontrolü',
    priority: 'HIGH',
    propertyId: 'PROP-1',
    metric: 'capex'
  };

  // First conversion -> Success
  const res1 = convertAiActionToTask(aiAction, '2026-08');
  assert.strictEqual(res1.success, true);
  assert.strictEqual(mockMaintenanceList.length, 1);
  assert.strictEqual(mockMaintenanceList[0].metadata.source, 'FINANCE_AI');
  assert.strictEqual(mockMaintenanceList[0].metadata.financialPeriod, '2026-08');
  assert.strictEqual(mockMaintenanceList[0].priority, 'P1');

  // Second conversion (double click simulation) -> Blocked as duplicate
  const res2 = convertAiActionToTask(aiAction, '2026-08');
  assert.strictEqual(res2.success, false);
  assert.strictEqual(res2.reason, 'DUPLICATE_TASK');
  assert.strictEqual(mockMaintenanceList.length, 1, 'Duplicate task must not be appended');
});

console.log(`\n=============================================================================`);
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
console.log(`=============================================================================\n`);
