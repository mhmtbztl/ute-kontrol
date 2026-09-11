// =============================================================================
// LEXBNB PHASE 9 — BOOKING OPERATIONS & RECONCILIATION TEST SUITE
// Tests booking-driven task generation, date change propagation, tight-turnover
// dynamic addition/removal, and type-specific cancellation policy.
// =============================================================================

const assert = require('assert');
const { reconcileBookingOperations } = require('./operations_engine.js');

console.log('=============================================================================');
console.log('📅 LEXBNB PHASE 9 — BOOKING OPERATIONS & RECONCILIATION TEST SUITE');
console.log('=============================================================================');

function runBookingOperationsTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  const tenantId = 'tenant-test-01';
  const propId = 'prop-test-01';

  // TEST 1: Initial Booking Generates Checkin Prep & Turnover Cleaning
  console.log('\n--- TEST 1: Initial Booking Automation ---');
  const b1 = {
    id: 'bk-101',
    tenant_id: tenantId,
    property_id: propId,
    guest_name: 'Can Yılmaz',
    check_in: '2026-09-01',
    check_out: '2026-09-05',
    status: 'CONFIRMED'
  };

  const res1 = reconcileBookingOperations(b1, [b1], [], []);
  assert.strictEqual(res1.tasksToInsert.length, 2);
  const prepTask = res1.tasksToInsert.find(t => t.task_type === 'CHECKIN_PREP');
  const cleanTask = res1.tasksToInsert.find(t => t.task_type === 'CLEANING');

  assert(prepTask && cleanTask);
  assert.strictEqual(prepTask.source_event_id, 'booking:bk-101:checkin_prep');
  assert.strictEqual(cleanTask.source_event_id, 'booking:bk-101:turnover_clean');
  recordPass('1. Booking confirmed generates CHECKIN_PREP and TURNOVER CLEANING with deterministic source_event_ids');

  // TEST 2: Repeated Reconciliation is Idempotent
  console.log('\n--- TEST 2: Repeated Reconciliation Idempotency ---');
  const existingTasks = [...res1.tasksToInsert];
  const res2 = reconcileBookingOperations(b1, [b1], [], existingTasks);

  assert.strictEqual(res2.tasksToInsert.length, 0, 'Must not insert any duplicate tasks');
  assert.strictEqual(res2.tasksToUpdate.length, 0, 'No updates needed when booking has not changed');
  recordPass('2. (Correction 2) Repeated reconciliation is 100% idempotent (0 duplicate tasks)');

  // TEST 3: Date Change Removes Previous Tight Turnover
  console.log('\n--- TEST 3: Date Change Removes Old Tight Turnover ---');
  // Initially, b2 checked in on Sept 05 (same day as b1 checkout)
  const b2Initial = {
    id: 'bk-102',
    tenant_id: tenantId,
    property_id: propId,
    guest_name: 'Zeynep Kaya',
    check_in: '2026-09-05', // Tight turnover!
    check_out: '2026-09-10',
    status: 'CONFIRMED'
  };

  // Reconcile with tight turnover
  const initialTightRes = reconcileBookingOperations(b1, [b1, b2Initial], [], []);
  const initialTightClean = initialTightRes.tasksToInsert.find(t => t.task_type === 'CLEANING');
  assert(initialTightClean.metadata.is_tight_turnover === true);

  // Now b2 changes dates to Sept 08 (no longer tight turnover)
  const b2Moved = { ...b2Initial, check_in: '2026-09-08', check_out: '2026-09-12' };
  const movedRes = reconcileBookingOperations(b1, [b1, b2Moved], [], [initialTightClean]);

  assert.strictEqual(movedRes.tasksToUpdate.length, 1);
  const updatedClean = movedRes.tasksToUpdate[0];
  assert.strictEqual(updatedClean.metadata.is_tight_turnover, false, 'Tight turnover flag must be cleared');
  assert.strictEqual(updatedClean.priority, 'MEDIUM', 'Priority must normalize to MEDIUM');
  recordPass('3. (Correction 3) Booking date change removes tight-turnover flag when dates separate');

  // TEST 4: Date Change Creates New Tight Turnover
  console.log('\n--- TEST 4: Date Change Creates New Tight Turnover ---');
  // Now b2 moves back to Sept 05
  const reTightRes = reconcileBookingOperations(b1, [b1, b2Initial], [], [updatedClean]);
  assert.strictEqual(reTightRes.tasksToUpdate.length, 1);
  const reTightClean = reTightRes.tasksToUpdate[0];
  assert.strictEqual(reTightClean.metadata.is_tight_turnover, true);
  assert.strictEqual(reTightClean.priority, 'HIGH');
  recordPass('4. (Correction 3) Booking date change creates tight-turnover when moving onto same day');

  // TEST 5: Type-Specific Cancellation Policy (Maintenance Preserved!)
  console.log('\n--- TEST 5: Type-Specific Cancellation Policy ---');
  const mockTasksForCancel = [
    { id: 't-prep', booking_id: 'bk-101', task_type: 'CHECKIN_PREP', status: 'TODO' },
    { id: 't-clean', booking_id: 'bk-101', task_type: 'CLEANING', task_subtype: 'TURNOVER', status: 'TODO' },
    { id: 't-maint', booking_id: 'bk-101', task_type: 'MAINTENANCE', status: 'OPEN' } // Maintenance on property!
  ];

  const b1Cancelled = { ...b1, status: 'CANCELLED' };
  const cancelRes = reconcileBookingOperations(b1Cancelled, [b1Cancelled], [], mockTasksForCancel);

  // CHECKIN_PREP and CLEANING should be cancelled
  assert.strictEqual(cancelRes.tasksToCancel.length, 2);
  const cancelledTypes = cancelRes.tasksToCancel.map(t => t.task_type);
  assert(cancelledTypes.includes('CHECKIN_PREP'));
  assert(cancelledTypes.includes('CLEANING'));

  // MAINTENANCE must NOT be cancelled!
  assert(!cancelledTypes.includes('MAINTENANCE'), 'MAINTENANCE task must remain active despite booking cancellation');
  recordPass('5. (Correction 15) Cancellation cancels prep and turnover cleaning, but preserves maintenance');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runBookingOperationsTests();
