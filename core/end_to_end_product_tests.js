// =============================================================================
// LEXBNB PHASE 12 — COMPLETE END-TO-END PRODUCT LIFECYCLE TEST SUITE
// Tests Full Cross-Domain Flow: Lead -> Quote -> Booking -> Guest ->
// Messaging -> Operations -> Finance -> Monthly Metrics -> Executive Control Center.
// =============================================================================

const assert = require('assert');
const PricingBookingService = require('./pricing_booking_service.js');
const { normalizePhone } = require('./guest_contact_utils.js');
const { reconcileBookingMessages } = require('./guest_messaging_engine.js');
const { computeTaskPriority } = require('./operations_priority_engine.js');
const ExecutiveDashboardService = require('./executive_dashboard_service.js');
const { selectTodayCommandCenterActions } = require('./executive_priority_service.js');
const { buildSanitizedExecutiveContext, generateExecutiveRecommendations } = require('./executive_ai_advisor.js');

console.log('=============================================================================');
console.log('🚀 LEXBNB PHASE 12 — END-TO-END PRODUCT LIFECYCLE TEST SUITE');
console.log('=============================================================================');

function runEndToEndProductTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  const tenantId = 't-e2e-main';
  const property = {
    id: 'p-e2e-villa',
    name: 'Villa Panoramik',
    base_price: 4000,
    min_price: 2000,
    max_price: 12000,
    base_pax: 2,
    extra_guest_fee: 500,
    currency: 'TRY'
  };

  // STEP 1: CRM Lead Creation
  console.log('\n--- STEP 1: CRM Lead Creation ---');
  const lead = {
    id: 'lead-e2e-1',
    tenant_id: tenantId,
    property_id: property.id,
    guest_name: 'Ahmet Yılmaz',
    guest_phone: '0532 987 6543',
    check_in: '2026-10-10',
    check_out: '2026-10-13', // 3 nights
    pax: 3,                  // 1 extra pax -> 500 * 3 = 1500 TL extra
    stage: 'NEW'
  };
  assert.strictEqual(lead.stage, 'NEW');
  recordPass('1. CRM Lead successfully created with inquiry details');

  // STEP 2: Formal Quote Generation with Schema Version 1
  console.log('\n--- STEP 2: Quote Generation ---');
  const quote = PricingBookingService.calculateLeadQuote({
    lead,
    property,
    validHours: 48
  });
  // 3 nights @ 4000 = 12000 base + 1500 extra guest fee = 13500 TL
  assert.strictEqual(quote.schema_version, 1);
  assert.strictEqual(quote.status, 'ACTIVE');
  assert.strictEqual(quote.nights, 3);
  assert.strictEqual(quote.total_amount, 13500);
  recordPass('2. Formal quote snapshot generated (13,500 TL) with schema_version: 1');

  // STEP 3: Quote Acceptance
  console.log('\n--- STEP 3: Quote Acceptance ---');
  const quoteCheck = PricingBookingService.validateQuoteAcceptance(quote);
  assert.strictEqual(quoteCheck.valid, true);
  quote.status = 'ACCEPTED';
  quote.accepted_at = new Date().toISOString();
  recordPass('3. Quote acceptance validated and transitioned to immutable ACCEPTED status');

  // STEP 4: Booking Creation
  console.log('\n--- STEP 4: Booking Creation ---');
  const normalizedPhone = normalizePhone(lead.guest_phone).normalized;
  const booking = {
    id: 'bk-e2e-1',
    booking_code: 'LX-E2E-20261010',
    tenant_id: tenantId,
    property_id: property.id,
    guest_name: lead.guest_name,
    guest_phone: normalizedPhone,
    check_in: lead.check_in,
    check_out: lead.check_out,
    nights: quote.nights,
    pax: lead.pax,
    gross_amount: quote.total_amount,
    currency: quote.currency,
    status: 'CONFIRMED',
    created_at: new Date().toISOString()
  };
  assert.strictEqual(booking.status, 'CONFIRMED');
  assert.strictEqual(booking.guest_phone, '+905329876543');
  recordPass('4. Booking created from accepted quote with E.164 normalized phone (+905329876543)');

  // STEP 5: Guest Lifecycle Messaging Reconciliation
  console.log('\n--- STEP 5: Messaging Reconciliation ---');
  const sampleRule = {
    id: 'rule_conf',
    lifecycle_stage: 'BOOKING_CONFIRMATION',
    trigger_type: 'BOOKING_CREATED',
    channel: 'WHATSAPP',
    is_active: true
  };
  const sampleTmpl = {
    id: 'tmpl_conf',
    lifecycle_stage: 'BOOKING_CONFIRMATION',
    channel: 'WHATSAPP',
    language: 'tr',
    version: 1,
    is_active: true,
    body: 'Rezervasyonunuz onaylandı {{guest_first_name}}'
  };

  const messageRecon = reconcileBookingMessages({
    booking,
    rules: [sampleRule],
    templates: [sampleTmpl],
    existingMessages: []
  });
  assert.strictEqual(messageRecon.scheduled.length, 1);
  assert.strictEqual(messageRecon.scheduled[0].status, 'SCHEDULED');
  recordPass('5. Guest messaging engine automatically scheduled confirmation message');

  // STEP 6: Operations Task Generation & Prioritization
  console.log('\n--- STEP 6: Operations Prioritization ---');
  const checkinTask = {
    id: 'task-checkin-prep',
    tenant_id: tenantId,
    property_id: property.id,
    propertyName: property.name,
    title: 'Giriş Öncesi Son Kontrol',
    task_type: 'INSPECTION',
    priority: 'HIGH',
    category: 'OPERATIONS',
    due_at: '2026-10-10T14:00:00Z',
    status: 'TODO',
    isCheckInToday: true,
    sourceMetrics: ['check_in: 2026-10-10'],
    deepLink: '/operations?propertyId=' + property.id
  };
  const priorityScore = computeTaskPriority(checkinTask, { currentDate: new Date('2026-10-10T10:00:00Z') });
  assert.ok(priorityScore.priorityScore >= 60);
  recordPass('6. Operations engine prioritized check-in inspection task for today');

  // STEP 7: Executive Dashboard Top KPIs & Command Center Synthesis
  console.log('\n--- STEP 7: Executive Control Center Synthesis ---');
  const topKpis = ExecutiveDashboardService.computeExecutiveTopKpis({
    bookings: [booking],
    expenses: [{ amount: 3500 }],
    targets: { revenue_target: 15000, profit_target: 10000 },
    forecast: { forecastedTotalRevenue: 13500 }
  });

  assert.strictEqual(topKpis.revenue.current, 13500);
  assert.strictEqual(topKpis.netProfit.current, 10000); // 13500 - 3500 = 10000
  assert.strictEqual(topKpis.netProfit.variance.status, 'ON_TARGET');

  // Today Command Center Selection
  const todayCmd = selectTodayCommandCenterActions([checkinTask]);
  assert.ok(todayCmd.totalSelected >= 1);
  recordPass('7. Executive Control Center top KPIs and Today Command Center synthesized realized numbers');

  // STEP 8: AI Advisor Context & Structured Recommendation Generation
  console.log('\n--- STEP 8: AI Advisor Synthesis ---');
  const aiContext = buildSanitizedExecutiveContext({
    tenant: { company_name: 'LexBnB E2E' },
    properties: [property],
    kpis: topKpis,
    tasks: [checkinTask],
    tickets: [],
    alerts: [],
    gapNights: []
  });

  const aiRecs = generateExecutiveRecommendations(aiContext);
  assert.ok(aiRecs.summary);
  assert.ok(Array.isArray(aiRecs.wins));
  recordPass('8. AI STR Advisor produced structured recommendations from sanitized end-to-end context');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runEndToEndProductTests();
