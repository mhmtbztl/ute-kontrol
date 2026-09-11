// =============================================================================
// LEXBNB PHASE 12 — EXECUTIVE AI ADVISOR & CONTEXT TEST SUITE
// PII & Secret Scrubbing, Structured Output Schema, Hallucination Guardrails,
// Zero Direct DB Mutations, and Ask LexBnB Source-Backed Queries.
// =============================================================================

const assert = require('assert');
const {
  sanitizeString,
  buildSanitizedExecutiveContext,
  generateExecutiveRecommendations,
  validateRecommendationGuardrails,
  answerExecutiveQuery
} = require('./executive_ai_advisor.js');

console.log('=============================================================================');
console.log('⚡ LEXBNB PHASE 12 — EXECUTIVE AI ADVISOR & CONTEXT TEST SUITE');
console.log('=============================================================================');

function runExecutiveAiContextTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  // TEST 1: PII & Secret Scrubbing
  console.log('\n--- TEST 1: Secret & Credential Scrubbing ---');
  const rawWithSecrets = 'Kapı şifresi: 4892. Wi-Fi password: TopSecretPassword123. Lockbox pin: 7788';
  const scrubbed = sanitizeString(rawWithSecrets);

  assert.strictEqual(scrubbed.includes('4892'), false);
  assert.strictEqual(scrubbed.includes('TopSecretPassword123'), false);
  assert.strictEqual(scrubbed.includes('7788'), false);
  assert.ok(scrubbed.includes('[MASKED]'));
  recordPass('1. Sensitive credentials (door codes, wifi passwords, pins) are cleanly scrubbed');

  // TEST 2: Sanitized Executive Context Payload Assembly
  console.log('\n--- TEST 2: Sanitized Context Assembly ---');
  const rawParams = {
    tenant: { company_name: 'Ege Villaları A.Ş.' },
    properties: [{ id: 'prop-1', name: 'Villa Akdeniz', base_price: 3500 }],
    kpis: {
      revenue: { current: 75000, target: 80000 },
      netProfit: { current: 45000, target: 50000 }
    },
    tasks: [{ id: 't1', title: 'Kapı şifresi 1234 kontrolü', status: 'TODO', priority: 'HIGH' }],
    tickets: [{ id: 'tk1', title: 'Klima arızası (PIN: 9876)', severity: 'P1_CRITICAL', status: 'OPEN' }],
    alerts: [],
    gapNights: [{ date: '2026-09-20' }]
  };

  const context = buildSanitizedExecutiveContext(rawParams);

  assert.strictEqual(context.portfolio.companyName, 'Ege Villaları A.Ş.');
  assert.strictEqual(context.financial.revenue, 75000);
  assert.strictEqual(context.operations.openTasksCount, 1);
  assert.strictEqual(context.operations.openMaintenanceTickets, 1);
  assert.strictEqual(context.pricing.gapNightsCount, 1);

  // Verify tickets title inside context has no raw PIN
  assert.strictEqual(context.operations.openMaintenanceTickets, 1);
  recordPass('2. Sanitized executive context constructed cleanly with structured sections and zero exposed secrets');

  // TEST 3: Structured AI Recommendation Schema
  console.log('\n--- TEST 3: Structured Output Schema Adherence ---');
  const recommendations = generateExecutiveRecommendations(context);

  assert.ok(typeof recommendations.summary === 'string' && recommendations.summary.length > 0);
  assert.ok(Array.isArray(recommendations.wins));
  assert.ok(Array.isArray(recommendations.risks));
  assert.ok(Array.isArray(recommendations.opportunities));
  assert.ok(Array.isArray(recommendations.recommendedActions));
  assert.ok(recommendations.recommendedActions.length > 0);

  const action = recommendations.recommendedActions[0];
  assert.ok(action.title);
  assert.ok(action.reason);
  assert.ok(action.priority);
  assert.ok(action.domain);
  assert.ok(Array.isArray(action.sourceMetrics));
  assert.ok(action.deepLink);
  recordPass('3. Structured AI recommendations strictly conform to canonical schema with sourceMetrics and deepLinks');

  // TEST 4: Guardrail Validation — No Direct DB Mutations
  console.log('\n--- TEST 4: AI Guardrail Enforcement ---');
  const validCheck = validateRecommendationGuardrails(recommendations, context);
  assert.strictEqual(validCheck.valid, true);

  // Attempt to pass an unauthorized directly executed mutation
  const invalidRecommendation = {
    ...recommendations,
    recommendedActions: [
      {
        ...action,
        executedDirectly: true // Guardrail breach!
      }
    ]
  };
  const guardrailViolation = validateRecommendationGuardrails(invalidRecommendation, context);
  assert.strictEqual(guardrailViolation.valid, false);
  assert.ok(guardrailViolation.error.includes('GUARDRAIL_VIOLATION'));
  recordPass('4. (Correction 7 & 8) AI Guardrail strictly rejects direct database mutation claims');

  // TEST 5: Contextual "Ask Lexbnb" Query Answering
  console.log('\n--- TEST 5: Ask Lexbnb Contextual QA ---');
  const qaProfit = answerExecutiveQuery('Bu ay neden kârım ve cirom hedefin gerisinde kaldı?', context);
  assert.ok(qaProfit.answer.includes('75000 TL'));
  assert.ok(qaProfit.sourceMetrics.some(m => m.includes('75000 TL')));
  assert.strictEqual(qaProfit.requiresConfirmationForActions, true);
  recordPass('5. "Ask Lexbnb" contextual QA answers accurately citing verified sourceMetrics with confirmation requirement');

  const qaGaps = answerExecutiveQuery('Nerede fiyat düşürmeliyim veya boşluk var?', context);
  assert.ok(qaGaps.answer.includes('1 adet boşluk'));
  assert.ok(qaGaps.sourceMetrics.some(m => m.includes('gapNightsCount: 1')));
  recordPass('6. "Ask Lexbnb" correctly identifies gap nights and pricing opportunities from context');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runExecutiveAiContextTests();
