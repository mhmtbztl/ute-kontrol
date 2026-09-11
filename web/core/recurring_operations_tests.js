// =============================================================================
// LEXBNB PHASE 9 — RECURRING OPERATIONS TEST SUITE
// Tests recurring rules matching (daily, weekly, monthly), idempotent instance
// generation, and deduplication across cycles.
// =============================================================================

const assert = require('assert');
const { isRuleDueOnDate, generateRecurringInstances } = require('./recurring_tasks_service.js');

console.log('=============================================================================');
console.log('🔄 LEXBNB PHASE 9 — RECURRING OPERATIONS TEST SUITE');
console.log('=============================================================================');

function runRecurringOperationsTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  // 2026-09-07 is a Monday (day_of_week = 1, day_of_month = 7)
  const targetDateMonday = new Date('2026-09-07T10:00:00Z');
  // 2026-09-08 is a Tuesday (day_of_week = 2, day_of_month = 8)
  const targetDateTuesday = new Date('2026-09-08T10:00:00Z');

  const ruleDaily = { id: 'r-daily', tenant_id: 't1', property_id: 'p1', frequency: 'DAILY', title: 'Günlük Bahçe Kontrolü', is_active: true };
  const ruleWeeklyMonday = { id: 'r-weekly', tenant_id: 't1', property_id: 'p1', frequency: 'WEEKLY', day_of_week: 1, title: 'Haftalık Jakuzi Bakımı', is_active: true };
  const ruleMonthly7th = { id: 'r-monthly', tenant_id: 't1', property_id: 'p1', frequency: 'MONTHLY', day_of_month: 7, title: 'Aylık Klima Filtre Kontrolü', is_active: true };
  const ruleInactive = { id: 'r-inactive', tenant_id: 't1', property_id: 'p1', frequency: 'DAILY', title: 'Pasif Kural', is_active: false };

  // TEST 1: Daily Rule Matches Any Date
  console.log('\n--- TEST 1: Daily Rule Matching ---');
  assert(isRuleDueOnDate(ruleDaily, targetDateMonday));
  assert(isRuleDueOnDate(ruleDaily, targetDateTuesday));
  recordPass('1. Daily recurring rule matches any target calendar date');

  // TEST 2: Weekly Rule Matches Only Specified Day of Week
  console.log('\n--- TEST 2: Weekly Rule Matching ---');
  assert(isRuleDueOnDate(ruleWeeklyMonday, targetDateMonday), 'Must match Monday');
  assert(!isRuleDueOnDate(ruleWeeklyMonday, targetDateTuesday), 'Must not match Tuesday');
  recordPass('2. Weekly recurring rule matches only on designated day_of_week (Monday)');

  // TEST 3: Monthly Rule Matches Only Specified Day of Month
  console.log('\n--- TEST 3: Monthly Rule Matching ---');
  assert(isRuleDueOnDate(ruleMonthly7th, targetDateMonday), 'Must match on 7th');
  assert(!isRuleDueOnDate(ruleMonthly7th, targetDateTuesday), 'Must not match on 8th');
  recordPass('3. Monthly recurring rule matches only on designated day_of_month (7th)');

  // TEST 4: Inactive Rule Does Not Trigger
  console.log('\n--- TEST 4: Inactive Rule Suppression ---');
  assert(!isRuleDueOnDate(ruleInactive, targetDateMonday));
  recordPass('4. Inactive recurring rule is suppressed and never triggers');

  // TEST 5: Idempotent Instance Generation
  console.log('\n--- TEST 5: Idempotent Instance Generation ---');
  const rules = [ruleDaily, ruleWeeklyMonday, ruleMonthly7th, ruleInactive];
  const instances1 = generateRecurringInstances(rules, targetDateMonday, []);

  // On Sept 07: Daily, Weekly, Monthly are due -> 3 instances
  assert.strictEqual(instances1.length, 3);
  assert.strictEqual(instances1[0].source, 'RECURRING');
  assert(instances1[0].source_event_id.startsWith('recur:'));
  recordPass('5. Generates 3 instances on Monday with source = RECURRING');

  // TEST 6: Deduplication Against Existing Tasks
  console.log('\n--- TEST 6: Deduplication Across Cycles ---');
  const instances2 = generateRecurringInstances(rules, targetDateMonday, instances1);
  assert.strictEqual(instances2.length, 0, 'Must generate 0 duplicates when run on the same date');
  recordPass('6. Running recurring instance generator twice on same date produces 0 duplicate tasks');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runRecurringOperationsTests();
