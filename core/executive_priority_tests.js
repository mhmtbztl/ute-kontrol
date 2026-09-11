// =============================================================================
// LEXBNB PHASE 12 — EXECUTIVE PRIORITY & COMMAND CENTER TEST SUITE
// Centralized Weights Config, Cross-Domain Priority Scoring, Duplicate Collapse,
// Strict Maximum Capacities (3+2+1), No Filler Items, and Mandatory Deep Links.
// =============================================================================

const assert = require('assert');
const {
  EXECUTIVE_PRIORITY_CONFIG,
  computeActionPriorityScore,
  collapseDuplicateActions,
  selectTodayCommandCenterActions
} = require('./executive_priority_service.js');

console.log('=============================================================================');
console.log('⚡ LEXBNB PHASE 12 — EXECUTIVE PRIORITY & COMMAND CENTER TEST SUITE');
console.log('=============================================================================');

function runExecutivePriorityTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  // TEST 1: Centralized Configuration Weights
  console.log('\n--- TEST 1: Centralized Priority Weights Config ---');
  assert.strictEqual(EXECUTIVE_PRIORITY_CONFIG.weights.guestImpact, 40);
  assert.strictEqual(EXECUTIVE_PRIORITY_CONFIG.weights.urgencyDueTime, 30);
  assert.strictEqual(EXECUTIVE_PRIORITY_CONFIG.weights.revenueImpact, 25);
  assert.strictEqual(EXECUTIVE_PRIORITY_CONFIG.weights.slaBreachProximity, 20);
  assert.strictEqual(EXECUTIVE_PRIORITY_CONFIG.weights.reversibilityConfidence, 15);
  recordPass('1. (Correction 1) Priority weights verified in centralized EXECUTIVE_PRIORITY_CONFIG');

  // TEST 2: Priority Score Calculation
  console.log('\n--- TEST 2: Deterministic Cross-Domain Scoring ---');
  const highImpactOverdueAction = {
    isGuestInHouse: true,       // 40 pts
    isOverdue: true,            // 30 pts
    revenueImpact: 'HIGH',      // 25 pts
    isSlaBreached: true,        // 20 pts
    confidence: 'HIGH'          // 15 pts
    // Total sum = 130, clamped to 100 max
  };
  const scoreHigh = computeActionPriorityScore(highImpactOverdueAction);
  assert.strictEqual(scoreHigh, 100);

  const lowImpactAction = {
    guestImpact: 'LOW',         // 10 pts
    hoursUntilDue: 48,          // 0 pts
    confidence: 'LOW'           // 0 pts
  };
  const scoreLow = computeActionPriorityScore(lowImpactAction);
  assert.strictEqual(scoreLow, 10);
  recordPass('2. Cross-domain priority scoring correctly weighs guest impact, urgency, revenue, and SLA breach');

  // TEST 3: Duplicate Action Collapse
  console.log('\n--- TEST 3: Duplicate Action Collapse ---');
  const propertyIssues = [
    {
      id: 'act-clean',
      propertyId: 'p101',
      propertyName: 'Villa Zirve',
      title: 'Temizlik tamamlanmadı',
      reason: 'Turnover temizliği henüz onaylanmadı',
      priorityScore: 75,
      category: 'CRITICAL',
      sourceMetrics: ['cleaning_status: PENDING'],
      deepLink: '/operations?propertyId=p101'
    },
    {
      id: 'act-notready',
      propertyId: 'p101',
      propertyName: 'Villa Zirve',
      title: 'Mülk hazır değil',
      reason: 'Girişe 2 saat kala mülk NOT_READY durumunda',
      priorityScore: 85,
      category: 'CRITICAL',
      sourceMetrics: ['readiness: NOT_READY'],
      deepLink: '/operations?propertyId=p101'
    },
    {
      id: 'act-standalone',
      propertyId: 'p202',
      propertyName: 'Dağ Evi',
      title: 'Rutin kontrol',
      reason: 'Aylık yangın tüpü kontrolü',
      priorityScore: 40,
      category: 'OPERATIONS',
      sourceMetrics: ['task_type: INSPECTION'],
      deepLink: '/operations?propertyId=p202'
    }
  ];

  const collapsed = collapseDuplicateActions(propertyIssues);
  assert.strictEqual(collapsed.length, 2, 'Must collapse 2 p101 issues into 1, keeping p202 standalone');

  const p101Collapsed = collapsed.find(c => c.propertyId === 'p101');
  assert.ok(p101Collapsed.isCollapsed, 'Must be marked as collapsed');
  assert.strictEqual(p101Collapsed.rootCauses.length, 2);
  assert.ok(p101Collapsed.sourceMetrics.includes('readiness: NOT_READY'));
  assert.ok(p101Collapsed.sourceMetrics.includes('cleaning_status: PENDING'));
  recordPass('3. (Correction 9) Duplicate property issues cleanly collapsed into unified card with root causes & sourceMetrics');

  // TEST 4: Maximum Capacity Selection (3 Critical + 2 Operations + 1 Revenue)
  console.log('\n--- TEST 4: Maximum Capacity Selection (3+2+1) ---');
  const heavyPool = [
    { id: 'c1', category: 'CRITICAL', priorityScore: 95, domain: 'OPERATIONS' },
    { id: 'c2', category: 'CRITICAL', priorityScore: 90, domain: 'OPERATIONS' },
    { id: 'c3', category: 'CRITICAL', priorityScore: 85, domain: 'OPERATIONS' },
    { id: 'c4', category: 'CRITICAL', priorityScore: 80, domain: 'OPERATIONS' }, // Should exceed max 3 critical
    { id: 'c5', category: 'CRITICAL', priorityScore: 75, domain: 'OPERATIONS' },
    { id: 'o1', category: 'OPERATIONS', priorityScore: 60, domain: 'OPERATIONS' },
    { id: 'o2', category: 'OPERATIONS', priorityScore: 55, domain: 'OPERATIONS' },
    { id: 'o3', category: 'OPERATIONS', priorityScore: 50, domain: 'OPERATIONS' }, // Should exceed max 2 ops
    { id: 'r1', category: 'REVENUE_OPPORTUNITY', priorityScore: 70, domain: 'PRICING' },
    { id: 'r2', category: 'REVENUE_OPPORTUNITY', priorityScore: 65, domain: 'PRICING' } // Should exceed max 1 rev
  ];

  const resultMax = selectTodayCommandCenterActions(heavyPool);
  assert.strictEqual(resultMax.critical.length, 3, 'Strict maximum 3 Critical actions');
  assert.strictEqual(resultMax.operations.length, 2, 'Strict maximum 2 Operations actions');
  assert.strictEqual(resultMax.revenueOpportunities.length, 1, 'Strict maximum 1 Revenue Opportunity');
  assert.strictEqual(resultMax.totalSelected, 6);
  recordPass('4. (Correction 2) Today Command Center enforces strict caps (3 Critical + 2 Operations + 1 Revenue Opportunity)');

  // TEST 5: No Fake Filler Items when Real Items are Fewer
  console.log('\n--- TEST 5: No Filler Items on Low Load ---');
  const lowLoadPool = [
    {
      id: 'c-single',
      category: 'CRITICAL',
      priorityScore: 90,
      title: 'Tek kritik görev',
      domain: 'OPERATIONS',
      sourceMetrics: ['metric: 1'],
      deepLink: '/operations'
    }
  ];

  const resultLow = selectTodayCommandCenterActions(lowLoadPool);
  assert.strictEqual(resultLow.critical.length, 1, 'Exactly 1 critical action');
  assert.strictEqual(resultLow.operations.length, 0, 'Must NOT fabricate operations actions');
  assert.strictEqual(resultLow.revenueOpportunities.length, 0, 'Must NOT fabricate revenue opportunities');
  assert.strictEqual(resultLow.totalSelected, 1);
  recordPass('5. (Correction 2) No fake or weak filler items generated when actual action count is below maximum capacity');

  // TEST 6: Mandatory sourceMetrics and deepLink Validation
  console.log('\n--- TEST 6: Mandatory Metrics & DeepLink ---');
  resultMax.critical.forEach(act => {
    assert.ok(Array.isArray(act.sourceMetrics), 'sourceMetrics must be an array');
    assert.ok(typeof act.deepLink === 'string' && act.deepLink.length > 0, 'deepLink must be non-empty string');
  });
  recordPass('6. (Correction 9) Every selected action enforces mandatory sourceMetrics array and deepLink target');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runExecutivePriorityTests();
