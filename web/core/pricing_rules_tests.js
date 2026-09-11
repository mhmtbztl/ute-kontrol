// =============================================================================
// LEXBNB PHASE 11 — PRICING RULES & PIPELINE TEST SUITE
// Seasonality, Day-of-week, Event surges, Occupancy pressure, Lead time,
// Multi-rule interaction, Pipeline ordering, and Inactivity filtering.
// =============================================================================

const assert = require('assert');
const PricingEngine = require('./pricing_engine.js');

console.log('=============================================================================');
console.log('⚡ LEXBNB PHASE 11 — PRICING RULES & PIPELINE TEST SUITE');
console.log('=============================================================================');

function runPricingRulesTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  const sampleProperty = {
    id: 'prop-rules-1',
    name: 'Villa Sapphire',
    base_price: 2000,
    min_price: 1000,
    max_price: 10000
  };

  const sampleProfile = {
    id: 'prof-rules-1',
    property_id: 'prop-rules-1',
    weekday_base_rate: 2000,
    weekend_base_rate: 2400,
    minimum_rate: 1000,
    maximum_rate: 10000,
    weekend_days: [5, 6]
  };

  // TEST 1: Season Rule Multiplier (+25% in Summer)
  console.log('\n--- TEST 1: Season Multiplier ---');
  const summerSeasonRule = {
    id: 'rule-summer',
    name: 'High Season Summer',
    rule_type: 'SEASON',
    priority: 10,
    multiplier: 1.25,
    start_date: '2026-06-01',
    end_date: '2026-08-31',
    is_active: true
  };

  const resSeason = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-07-15', // Wednesday in summer
    rules: [summerSeasonRule]
  });

  // 2000 * 1.25 = 2500
  assert.strictEqual(resSeason.finalRate, 2500);
  assert.ok(resSeason.rulesApplied.includes('High Season Summer'));
  recordPass('1. Summer season rule correctly applies 1.25x multiplier (+500 TL)');

  // Date outside season should not apply rule
  const resOffSeason = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-10-15', // Outside season
    rules: [summerSeasonRule]
  });
  assert.strictEqual(resOffSeason.finalRate, 2000);
  assert.ok(!resOffSeason.rulesApplied.includes('High Season Summer'));
  recordPass('2. Season rule inactive outside its effective date window');

  // TEST 2: Season Fixed Rate Override
  console.log('\n--- TEST 2: Season Fixed Rate Override ---');
  const fixedWinterRule = {
    id: 'rule-winter-fixed',
    name: 'Winter Promo Flat Rate',
    rule_type: 'SEASON',
    priority: 20,
    fixed_rate_override: 1800,
    start_date: '2026-11-01',
    end_date: '2026-12-31',
    is_active: true
  };
  const resFixedSeason = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-11-15',
    rules: [fixedWinterRule]
  });
  assert.strictEqual(resFixedSeason.finalRate, 1800);
  recordPass('3. Season rule with fixed_rate_override replaces base rate with exact fixed amount');

  // TEST 3: Day of Week Rule (e.g. Thursday discount)
  console.log('\n--- TEST 3: Day of Week Rule ---');
  // 2026-09-17 is Thursday (dayIndex = 4)
  const thuDiscountRule = {
    id: 'rule-thu-disc',
    name: 'Thursday Special',
    rule_type: 'DAY_OF_WEEK',
    priority: 15,
    multiplier: 0.9,
    conditions: { days: [4] },
    is_active: true
  };
  const resThu = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-09-17',
    rules: [thuDiscountRule]
  });
  // 2000 * 0.9 = 1800
  assert.strictEqual(resThu.finalRate, 1800);
  recordPass('4. Day-of-week rule matches specific weekday condition');

  // TEST 4: Pricing Event Surge (Bayram / Concert)
  console.log('\n--- TEST 4: Pricing Event Surge ---');
  const bayramEvent = {
    id: 'evt-bayram',
    name: 'Kurban Bayramı Surge',
    start_date: '2026-06-25',
    end_date: '2026-06-30',
    multiplier: 1.5,
    is_active: true
  };
  const resBayram = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-06-26', // Friday during bayram
    events: [bayramEvent]
  });
  // Weekend base 2400 * 1.5 = 3600
  assert.strictEqual(resBayram.finalRate, 3600);
  assert.ok(resBayram.rulesApplied.includes('Kurban Bayramı Surge'));
  recordPass('5. Special event surge (+50%) applies to target date range on top of weekend rate');

  // TEST 5: Occupancy Pressure Multiplier
  console.log('\n--- TEST 5: Occupancy Pressure Multiplier ---');
  const highOccRule = {
    id: 'rule-high-occ',
    name: 'High Occupancy Pressure',
    rule_type: 'OCCUPANCY',
    priority: 10,
    multiplier: 1.20,
    conditions: { min_occupancy: 0.80 },
    is_active: true
  };
  // When occupancy is 85%
  const resOccHigh = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-09-15',
    occupancy: 0.85,
    rules: [highOccRule]
  });
  // 2000 * 1.20 = 2400
  assert.strictEqual(resOccHigh.finalRate, 2400);
  recordPass('6. Occupancy pressure rule activates when property occupancy meets threshold (>=80%)');

  // When occupancy is 60%
  const resOccNormal = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-09-15',
    occupancy: 0.60,
    rules: [highOccRule]
  });
  assert.strictEqual(resOccNormal.finalRate, 2000);
  recordPass('7. Occupancy pressure rule does not trigger when occupancy is below threshold');

  // TEST 6: Lead Time (Early Bird vs Last Minute)
  console.log('\n--- TEST 6: Lead Time Multipliers ---');
  const earlyBirdRule = {
    id: 'rule-early-bird',
    name: 'Early Bird 30+ Days',
    rule_type: 'LEAD_TIME',
    priority: 10,
    multiplier: 0.90, // -10%
    conditions: { min_lead_days: 30 },
    is_active: true
  };
  const lastMinuteRule = {
    id: 'rule-last-minute',
    name: 'Last Minute <3 Days',
    rule_type: 'LAST_MINUTE',
    priority: 20,
    multiplier: 0.85, // -15%
    conditions: { max_lead_days: 2 },
    is_active: true
  };

  const resEarly = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-09-15',
    bookingLeadTime: 45,
    rules: [earlyBirdRule, lastMinuteRule]
  });
  // 2000 * 0.90 = 1800
  assert.strictEqual(resEarly.finalRate, 1800);
  assert.ok(resEarly.rulesApplied.includes('Early Bird 30+ Days'));
  recordPass('8. Early bird discount applied when lead time >= 30 days');

  const resLastMinute = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-09-15',
    bookingLeadTime: 1,
    rules: [earlyBirdRule, lastMinuteRule]
  });
  // 2000 * 0.85 = 1700
  assert.strictEqual(resLastMinute.finalRate, 1700);
  assert.ok(resLastMinute.rulesApplied.includes('Last Minute <3 Days'));
  recordPass('9. Last-minute discount applied when lead time <= 2 days');

  // TEST 7: Inactive Rules Skipped
  console.log('\n--- TEST 7: Inactive Rules Skipped ---');
  const inactiveRule = {
    id: 'rule-inactive',
    name: 'Disabled Surcharge',
    rule_type: 'SEASON',
    priority: 99,
    multiplier: 2.0,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    is_active: false
  };
  const resInactive = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-09-15',
    rules: [inactiveRule]
  });
  assert.strictEqual(resInactive.finalRate, 2000);
  recordPass('10. Inactive rules (is_active: false) are strictly ignored regardless of priority');

  // TEST 8: Full Pipeline Interaction Order
  console.log('\n--- TEST 8: Pipeline Multi-Step Interaction ---');
  // Date: 2026-07-15 (Wednesday, weekday base 2000)
  // Summer season (+25% -> 2500)
  // High occupancy (+20% -> 3000)
  // Early bird (-10% -> 2700)
  const resCombo = PricingEngine.calculateDailyPrice({
    property: sampleProperty,
    profile: sampleProfile,
    date: '2026-07-15',
    occupancy: 0.85,
    bookingLeadTime: 40,
    rules: [summerSeasonRule, highOccRule, earlyBirdRule]
  });
  assert.strictEqual(resCombo.finalRate, 2700);
  assert.strictEqual(resCombo.adjustments.length, 4); // BASE, SEASON, OCCUPANCY, LEAD_TIME
  recordPass('11. Full multi-rule pipeline executes deterministically in sequence (Base -> Season -> Occ -> LeadTime = 2700 TL)');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runPricingRulesTests();
