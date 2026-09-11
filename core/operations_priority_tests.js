// =============================================================================
// LEXBNB PHASE 9 — OPERATIONS PRIORITY, SLA & TIMEZONE TEST SUITE
// Tests priority scoring algorithm, SLA breach detection, and timezone safety.
// =============================================================================

const assert = require('assert');
const { computeTaskPriority, OPERATIONS_PRIORITY_CONFIG } = require('./operations_priority_engine.js');
const { calculateSlaDeadline, evaluateTaskSla } = require('./operations_sla_service.js');
const { getTenantLocalDateStr, buildTodayOperationsDashboard } = require('./today_operations_service.js');

console.log('=============================================================================');
console.log('⚡ LEXBNB PHASE 9 — PRIORITY, SLA & TIMEZONE TEST SUITE');
console.log('=============================================================================');

function runPriorityAndSlaTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  const now = new Date('2026-09-15T10:00:00Z');

  // TEST 1: Base Priority Scoring matches Config
  console.log('\n--- TEST 1: Base Priority Scoring ---');
  const taskCrit = { priority: 'CRITICAL', task_type: 'GENERAL', status: 'TODO' };
  const taskMed = { priority: 'MEDIUM', task_type: 'GENERAL', status: 'TODO' };

  const critRes = computeTaskPriority(taskCrit, { currentDate: now });
  const medRes = computeTaskPriority(taskMed, { currentDate: now });

  assert.strictEqual(critRes.priorityScore, OPERATIONS_PRIORITY_CONFIG.base.CRITICAL);
  assert.strictEqual(medRes.priorityScore, OPERATIONS_PRIORITY_CONFIG.base.MEDIUM);
  recordPass('1. (Correction 6) Base priority points match centralized OPERATIONS_PRIORITY_CONFIG');

  // TEST 2: Proximity Boosts (Due Today & Overdue)
  console.log('\n--- TEST 2: Due Today and Overdue Scoring ---');
  const taskDueToday = {
    priority: 'MEDIUM', // 30
    due_at: '2026-09-15T18:00:00Z', // within 8 hours
    status: 'TODO'
  };
  const dueTodayRes = computeTaskPriority(taskDueToday, { currentDate: now });
  assert.strictEqual(dueTodayRes.priorityScore, 30 + 30); // Base 30 + DueToday 30 = 60
  recordPass('2. Task due today gains +30 proximity boost');

  const taskOverdue = {
    priority: 'MEDIUM', // 30
    due_at: '2026-09-15T08:00:00Z', // 2 hours in the past
    status: 'TODO'
  };
  const overdueRes = computeTaskPriority(taskOverdue, { currentDate: now });
  assert.strictEqual(overdueRes.priorityScore, 30 + 50); // Base 30 + Overdue 50 = 80
  recordPass('3. Overdue task gains +50 penalty boost');

  // TEST 3: Tight Turnover and Guest In-House Multipliers
  console.log('\n--- TEST 3: Turnover & Guest Multipliers ---');
  const taskTight = {
    priority: 'HIGH', // 60
    metadata: { is_tight_turnover: true },
    status: 'TODO'
  };
  const tightRes = computeTaskPriority(taskTight, { currentDate: now, isTightTurnover: true });
  assert.strictEqual(tightRes.priorityScore, 60 + 40); // 100
  recordPass('4. Tight turnover adds +40 turnover urgency boost');

  const taskMaintGuest = {
    priority: 'HIGH', // 60
    task_type: 'MAINTENANCE',
    metadata: { guest_in_house: true },
    status: 'TODO'
  };
  const maintGuestRes = computeTaskPriority(taskMaintGuest, { currentDate: now, isGuestInHouse: true });
  assert.strictEqual(maintGuestRes.priorityScore, 60 + 35); // 95
  recordPass('5. Active guest in house during maintenance adds +35 guest impact boost');

  // TEST 4: SLA Breach Detection
  console.log('\n--- TEST 4: SLA Breach Detection ---');
  const criticalMaintTask = {
    task_type: 'MAINTENANCE',
    priority: 'CRITICAL',
    created_at: '2026-09-15T07:00:00Z', // 3 hours ago -> 2h SLA breached!
    status: 'TODO'
  };
  criticalMaintTask.sla_breach_at = calculateSlaDeadline(criticalMaintTask, { currentDate: now });

  const slaRes = evaluateTaskSla(criticalMaintTask, now);
  assert.strictEqual(slaRes.isSlaBreached, true);
  assert.strictEqual(slaRes.status, 'BREACHED');
  recordPass('6. (Correction 7) Critical maintenance SLA (> 2 hours) detected as BREACHED');

  // TEST 5: Timezone-Safe "Today" Boundary
  console.log('\n--- TEST 5: Timezone-Safe "Today" Resolution ---');
  // UTC 2026-09-15 22:30 is 2026-09-16 01:30 in Europe/Istanbul (+3)
  const boundaryTime = new Date('2026-09-15T22:30:00Z');
  const utcDate = boundaryTime.toISOString().split('T')[0];
  const localDate = getTenantLocalDateStr(boundaryTime, 'Europe/Istanbul');

  assert.strictEqual(utcDate, '2026-09-15');
  assert.strictEqual(localDate, '2026-09-16');
  recordPass('7. (Correction 17 & 18) Timezone resolution reflects local calendar date across UTC boundary');

  // TEST 6: Today Dashboard Categorization
  console.log('\n--- TEST 6: Today Dashboard Categorization ---');
  const mockDashboard = buildTodayOperationsDashboard({
    tasks: [criticalMaintTask, taskDueToday],
    tickets: [{ id: 'tk-1', severity: 'CRITICAL', status: 'OPEN', property_id: 'p1' }],
    bookings: [
      { id: 'b-in', check_in: '2026-09-15', check_out: '2026-09-18', status: 'CONFIRMED' },
      { id: 'b-out', check_in: '2026-09-12', check_out: '2026-09-15', status: 'CONFIRMED' }
    ],
    referenceDate: '2026-09-15T12:00:00Z',
    timeZone: 'Europe/Istanbul'
  });

  assert.strictEqual(mockDashboard.counts.critical, 2, 'Must catch breached task and critical ticket');
  assert.strictEqual(mockDashboard.counts.checkins, 1, 'Must catch today check-in');
  assert.strictEqual(mockDashboard.counts.checkouts, 1, 'Must catch today check-out');
  recordPass('8. Today Operations Dashboard categorizes critical, checkins, and checkouts cleanly');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runPriorityAndSlaTests();
