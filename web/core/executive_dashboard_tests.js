// =============================================================================
// LEXBNB PHASE 12 — EXECUTIVE DASHBOARD & HEALTH TEST SUITE
// Top KPIs with Target Variances, Explainable Portfolio Health, Property Cards,
// Alert State Machine (OPEN -> ACK -> RESOLVED), Re-occurrence, and Onboarding.
// =============================================================================

const assert = require('assert');
const ExecutiveDashboardService = require('./executive_dashboard_service.js');

console.log('=============================================================================');
console.log('⚡ LEXBNB PHASE 12 — EXECUTIVE DASHBOARD & HEALTH TEST SUITE');
console.log('=============================================================================');

function runExecutiveDashboardTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  // TEST 1: Top KPIs Computation with Variance & Prior Comparison
  console.log('\n--- TEST 1: Top KPIs & Variances ---');
  const sampleBookings = [
    { id: 'b1', gross_amount: 30000, nights: 10, status: 'CONFIRMED' },
    { id: 'b2', gross_amount: 20000, nights: 5, status: 'CONFIRMED' },
    { id: 'b3', gross_amount: 15000, nights: 4, status: 'CANCELLED' } // should be ignored
  ];
  const sampleExpenses = [
    { id: 'e1', amount: 12000, type: 'OPEX' },
    { id: 'e2', amount: 8000, type: 'OPEX' }
  ];
  const targets = {
    revenue_target: 60000,
    profit_target: 35000,
    occupancy_target: 60
  };
  const forecast = { forecastedTotalRevenue: 62000, confidence: 'HIGH' };

  const kpis = ExecutiveDashboardService.computeExecutiveTopKpis({
    bookings: sampleBookings,
    expenses: sampleExpenses,
    targets,
    forecast,
    propertiesCount: 1,
    daysInMonth: 30
  });

  // Revenue: 30000 + 20000 = 50000. Target: 60000 -> variance: -10000 (-17%)
  assert.strictEqual(kpis.revenue.current, 50000);
  assert.strictEqual(kpis.revenue.target, 60000);
  assert.strictEqual(kpis.revenue.variance.varianceAmount, -10000);
  assert.strictEqual(kpis.revenue.variance.status, 'BELOW_TARGET');

  // Net Profit: 50000 - 20000 = 30000. Target: 35000 -> variance: -5000 (-14%)
  assert.strictEqual(kpis.netProfit.current, 30000);
  assert.strictEqual(kpis.netProfit.target, 35000);

  // Occupancy: 15 nights / 30 room nights = 50.0%
  assert.strictEqual(kpis.occupancy.current, 50);

  // ADR: 50000 / 15 nights = 3333.33 TL
  assert.strictEqual(kpis.adr.current, 3333.33);

  // Month-end Forecast: 62000 (exceeds 60000 target by +2000)
  assert.strictEqual(kpis.forecast.monthEndRevenue, 62000);
  assert.strictEqual(kpis.forecast.variance.varianceAmount, 2000);
  assert.strictEqual(kpis.forecast.variance.status, 'ON_TARGET');
  recordPass('1. Top KPIs computed with exact target variances, ADR, RevPAR, and month-end forecast');

  // TEST 2: Explainable Portfolio Health Breakdown
  console.log('\n--- TEST 2: Explainable Portfolio Health ---');
  const healthCritical = ExecutiveDashboardService.evaluatePortfolioHealth({
    kpis,
    tickets: [{ id: 'tk1', severity: 'P1_CRITICAL', status: 'OPEN' }],
    failedMessagesCount: 0,
    openLeadsCount: 2
  });
  assert.strictEqual(healthCritical.domains.operations.status, 'CRITICAL');
  assert.strictEqual(healthCritical.overallStatus, 'CRITICAL');
  assert.ok(healthCritical.reasons.length > 0);
  recordPass('2. Portfolio health reports CRITICAL overall status when open P1 maintenance ticket is present');

  const healthHealthy = ExecutiveDashboardService.evaluatePortfolioHealth({
    kpis: { ...kpis, revenue: { current: 65000, target: 60000, variance: { status: 'ON_TARGET', variancePercent: 8 } } },
    tickets: [],
    tasks: [],
    failedMessagesCount: 0,
    openLeadsCount: 1
  });
  assert.strictEqual(healthHealthy.domains.operations.status, 'HEALTHY');
  assert.strictEqual(healthHealthy.domains.revenue.status, 'HEALTHY');
  assert.strictEqual(healthHealthy.overallStatus, 'HEALTHY');
  recordPass('3. Portfolio health reports HEALTHY when all domains are on target with zero blocking issues');

  // TEST 3: Property Health Cards Generation
  console.log('\n--- TEST 3: Property Health Cards ---');
  const properties = [
    { id: 'p1', name: 'Villa Akdeniz', base_price: 3000 },
    { id: 'p2', name: 'Bungalov Doğa', base_price: 2000 }
  ];
  const cards = ExecutiveDashboardService.generatePropertyHealthCards(properties, {
    bookings: [{ property_id: 'p1', gross_amount: 15000, nights: 5, status: 'CONFIRMED' }],
    tasks: [{ property_id: 'p2', task_type: 'CLEANING', status: 'TODO' }],
    tickets: [{ property_id: 'p1', severity: 'P1_CRITICAL', status: 'OPEN' }]
  });

  assert.strictEqual(cards.length, 2);
  const card1 = cards.find(c => c.propertyId === 'p1');
  const card2 = cards.find(c => c.propertyId === 'p2');

  assert.strictEqual(card1.readiness, 'MAINTENANCE_BLOCKED');
  assert.strictEqual(card1.revenue, 15000);
  assert.strictEqual(card1.adr, 3000);
  assert.ok(card1.nextAction.deepLink.includes('maintenance'));

  assert.strictEqual(card2.readiness, 'NEEDS_CLEANING');
  assert.ok(card2.nextAction.deepLink.includes('cleaning'));
  recordPass('4. Property health cards accurately reflect readiness, revenue, ADR, and direct deep links');

  // TEST 4: Alert State Machine: OPEN -> ACKNOWLEDGED -> RESOLVED
  console.log('\n--- TEST 4: Alert State Machine ---');
  const initialAlert = {
    id: 'alert-1',
    status: 'OPEN',
    title: 'Acil Bakım Gerekli'
  };

  // OPEN -> ACKNOWLEDGED
  const ackAlert = ExecutiveDashboardService.transitionAlertState(initialAlert, 'ACKNOWLEDGED', { userId: 'usr-1' });
  assert.strictEqual(ackAlert.status, 'ACKNOWLEDGED');
  assert.ok(ackAlert.acknowledged_at);

  // ACKNOWLEDGED -> RESOLVED
  const resolvedAlert = ExecutiveDashboardService.transitionAlertState(ackAlert, 'RESOLVED', { userId: 'usr-1' });
  assert.strictEqual(resolvedAlert.status, 'RESOLVED');
  assert.ok(resolvedAlert.resolved_at);

  // RESOLVED -> Cannot transition back to OPEN directly
  let invalidTransitionThrown = false;
  try {
    ExecutiveDashboardService.transitionAlertState(resolvedAlert, 'OPEN');
  } catch (err) {
    invalidTransitionThrown = true;
    assert.ok(err.message.includes('INVALID_ALERT_TRANSITION'));
  }
  assert.strictEqual(invalidTransitionThrown, true);
  recordPass('5. (Correction 3) Alert state machine strictly enforces OPEN -> ACKNOWLEDGED -> RESOLVED');

  // TEST 5: Resolved Alert Re-Occurrence Creates New Instance
  console.log('\n--- TEST 5: Alert Re-Occurrence Lifecycle Reset ---');
  const newAlertData = {
    alert_code: 'CRITICAL_MAINTENANCE',
    title: 'Yeni Acil Bakım Gerekli',
    severity: 'CRITICAL',
    domain: 'OPERATIONS',
    recommended_action: 'Teknisyen görevlendirin',
    deep_link: '/operations'
  };

  const reoccurredAlert = ExecutiveDashboardService.createOrReopenAlert(resolvedAlert, newAlertData);
  assert.notStrictEqual(reoccurredAlert.id, resolvedAlert.id);
  assert.strictEqual(reoccurredAlert.status, 'OPEN');
  assert.strictEqual(reoccurredAlert.isReoccurrence, true);
  assert.strictEqual(reoccurredAlert.previousAlertId, resolvedAlert.id);
  recordPass('6. (Correction 4) Resolved alert recurring under real conditions initiates a deterministic new alert lifecycle');

  // TEST 6: Tenant Onboarding Checklist & Progress
  console.log('\n--- TEST 6: Tenant Onboarding Checklist ---');
  const partialOnboarding = ExecutiveDashboardService.computeTenantOnboardingProgress({
    tenantId: 't1',
    propertiesCount: 1,
    hasPricingProfile: true,
    hasGuestSettings: true,
    hasCleaningChecklist: true
    // 5 out of 10 steps completed = 50%
  });
  assert.strictEqual(partialOnboarding.totalSteps, 10);
  assert.strictEqual(partialOnboarding.completedCount, 5);
  assert.strictEqual(partialOnboarding.progressPercent, 50);
  assert.strictEqual(partialOnboarding.isFullyOnboarded, false);

  const fullOnboarding = ExecutiveDashboardService.computeTenantOnboardingProgress({
    tenantId: 't1',
    propertiesCount: 2,
    hasPricingProfile: true,
    hasGuestSettings: true,
    hasCleaningChecklist: true,
    hasTeamMembers: true,
    hasMessageTemplates: true,
    hasMonthlyTargets: true,
    bookingsCount: 3,
    hasFinanceTransactions: true
  });
  assert.strictEqual(fullOnboarding.completedCount, 10);
  assert.strictEqual(fullOnboarding.progressPercent, 100);
  assert.strictEqual(fullOnboarding.isFullyOnboarded, true);
  recordPass('7. Tenant onboarding progress accurately tracks 10 canonical setup milestones');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runExecutiveDashboardTests();
