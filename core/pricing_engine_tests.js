// =============================================================================
// LEXBNB PHASE 11 — PRICING ENGINE CORE TESTS
// Deterministic 9-step pipeline, weekend detection, deterministic sorting,
// guardrail clamping, explainable audit trail, idempotency context hash.
// =============================================================================

const assert = require('assert');
const PricingEngine = require('./pricing_engine.js');

console.log('=============================================================================');
console.log('⚡ LEXBNB PHASE 11 — PRICING ENGINE CORE TEST SUITE');
console.log('=============================================================================');

function runPricingEngineTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  const sampleProperty = {
    id: 'prop-101',
    name: 'Villa Akdeniz',
    base_price: 3000,
    min_price: 1500,
    max_price: 8000
  };

  const sampleProfile = {
    id: 'prof-101',
    property_id: 'prop-101',
    base_rate: 3000,
    minimum_rate: 1500,
    maximum_rate: 8000,
    weekend_multiplier: 1.25,
    min_stay_default: 2,
    currency: 'TRY'
  };

  // TEST 1: Base Rate Resolution
  console.log('\n--- TEST 1: Base Rate Resolution ---');
  const res1 = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    date: '2026-09-15', // Tuesday (weekday)
    profile: sampleProfile,
    rules: [],
    events: [],
    overrides: []
  });
  assert.strictEqual(res1.baseRate, 3000);
  assert.strictEqual(res1.finalRate, 3000);
  assert.strictEqual(res1.isWeekend, false);
  recordPass('1. Base rate initialized and weekday correctly detected');

  // TEST 2: Weekend Detection & Multiplier
  console.log('\n--- TEST 2: Weekend Multiplier ---');
  const res2Fri = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    date: '2026-09-18', // Friday
    profile: sampleProfile,
    rules: [],
    events: [],
    overrides: []
  });
  assert.strictEqual(res2Fri.isWeekend, true);
  assert.strictEqual(res2Fri.finalRate, 3750); // 3000 * 1.25
  assert.ok(res2Fri.rulesApplied.includes('DAY_OF_WEEK_WEEKEND'));
  recordPass('2. Friday detected as weekend with 1.25x profile weekend multiplier');

  const res2Sat = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    date: '2026-09-19', // Saturday
    profile: sampleProfile,
    rules: [],
    events: [],
    overrides: []
  });
  assert.strictEqual(res2Sat.isWeekend, true);
  assert.strictEqual(res2Sat.finalRate, 3750);
  recordPass('3. Saturday detected as weekend with 1.25x profile weekend multiplier');

  // TEST 3: Deterministic Rule Sorting (Priority -> Scope -> ID)
  console.log('\n--- TEST 3: Deterministic Rule Sorting ---');
  const rules = [
    { id: 'rule-b', priority: 50, property_id: null, rule_type: 'CUSTOM', multiplier: 1.1 },
    { id: 'rule-a', priority: 100, property_id: null, rule_type: 'CUSTOM', multiplier: 1.2 },
    { id: 'rule-c', priority: 50, property_id: 'prop-101', rule_type: 'CUSTOM', multiplier: 1.15 },
    { id: 'rule-d', priority: 50, property_id: null, rule_type: 'CUSTOM', multiplier: 1.05 }
  ];
  const sorted = PricingEngine.sortRulesDeterministically(rules);
  assert.strictEqual(sorted[0].id, 'rule-a', 'Priority 100 must come first');
  assert.strictEqual(sorted[1].id, 'rule-c', 'Property-specific rule must win priority tie over portfolio rules');
  assert.strictEqual(sorted[2].id, 'rule-b', 'Alphabetical tie-breaker rule-b before rule-d');
  assert.strictEqual(sorted[3].id, 'rule-d');
  recordPass('4. Deterministic tie-breaker sorts strictly by priority DESC -> property > portfolio -> id ASC');

  // TEST 4: Guardrail Clamping (Min & Max Rates)
  console.log('\n--- TEST 4: Guardrail Clamping ---');
  // Attempt to drop below minimum_rate (1500)
  const lowRule = {
    id: 'rule-discount',
    rule_type: 'LEAD_TIME',
    priority: 10,
    multiplier: 0.3, // 3000 * 0.3 = 900 < 1500
    is_active: true
  };
  const resClampedLow = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    date: '2026-09-15',
    profile: sampleProfile,
    rules: [lowRule],
    events: [],
    overrides: []
  });
  assert.strictEqual(resClampedLow.finalRate, 1500, 'Must clamp to minimum_rate 1500');
  assert.ok(resClampedLow.rulesApplied.includes('GUARDRAIL_MIN_RATE_APPLIED'));
  recordPass('5. Final rate clamped to minimum_rate when multipliers push price below floor');

  // Attempt to surge above maximum_rate (8000)
  const highRule = {
    id: 'rule-surge',
    rule_type: 'EVENT',
    priority: 10,
    multiplier: 4.0, // 3000 * 4 = 12000 > 8000
    is_active: true
  };
  const resClampedHigh = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    date: '2026-09-15',
    profile: sampleProfile,
    rules: [highRule],
    events: [],
    overrides: []
  });
  assert.strictEqual(resClampedHigh.finalRate, 8000, 'Must clamp to maximum_rate 8000');
  assert.ok(resClampedHigh.rulesApplied.includes('GUARDRAIL_MAX_RATE_APPLIED'));
  recordPass('6. Final rate clamped to maximum_rate when surges push price above ceiling');

  // TEST 5: Manual Override Clamping vs Privileged Bypass
  console.log('\n--- TEST 5: Manual Override Guardrails ---');
  // Normal override under min rate -> clamped to 1500
  const normalOverride = {
    property_id: 'prop-101',
    start_date: '2026-09-15',
    end_date: '2026-09-15',
    rate: 1000,
    bypass_guardrail: false
  };
  const resOverNormal = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    date: '2026-09-15',
    profile: sampleProfile,
    rules: [],
    events: [],
    overrides: [normalOverride]
  });
  assert.strictEqual(resOverNormal.finalRate, 1500, 'Normal override clamped to minimum_rate');
  recordPass('7. (Correction 1) Normal manual override strictly clamped between guardrails');

  // Privileged override under min rate with bypass_guardrail -> accepts 1000
  const privilegedOverride = {
    property_id: 'prop-101',
    start_date: '2026-09-15',
    end_date: '2026-09-15',
    rate: 1000,
    bypass_guardrail: true
  };
  const resOverPriv = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    date: '2026-09-15',
    profile: sampleProfile,
    rules: [],
    events: [],
    overrides: [privilegedOverride]
  });
  assert.strictEqual(resOverPriv.finalRate, 1000, 'Privileged override bypasses guardrail');
  assert.ok(resOverPriv.rulesApplied.includes('MANUAL_OVERRIDE_GUARDRAIL_BYPASSED'));
  recordPass('8. (Correction 1 & 2) Privileged override successfully bypasses guardrail when explicitly flagged');

  // TEST 6: Explainable Adjustments Array & Audit Trail
  console.log('\n--- TEST 6: Explainable Adjustments Array ---');
  assert.ok(Array.isArray(res1.adjustments), 'Adjustments must be an array');
  assert.ok(res1.adjustments.length > 0, 'Adjustments must have at least BASE_RATE');
  const baseStep = res1.adjustments[0];
  assert.strictEqual(baseStep.step, 'BASE_RATE');
  assert.strictEqual(baseStep.rateAfter, 3000);
  assert.strictEqual(baseStep.intermediateRate, 3000);
  recordPass('9. (Correction 7) Every pricing calculation records structured explainable adjustments');

  // TEST 7: Calculation Context Hash & Deterministic Idempotency
  console.log('\n--- TEST 7: Calculation Context Hash ---');
  const calcA = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    date: '2026-09-15',
    profile: sampleProfile
  });
  const calcB = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    date: '2026-09-15',
    profile: sampleProfile
  });
  assert.strictEqual(calcA.calculationContextHash, calcB.calculationContextHash);
  assert.strictEqual(calcA.finalRate, calcB.finalRate);
  assert.strictEqual(calcA.calculationContextHash.length, 16);
  recordPass('10. (Correction 8) Identical calculation inputs produce deterministic context hash and rate');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runPricingEngineTests();
