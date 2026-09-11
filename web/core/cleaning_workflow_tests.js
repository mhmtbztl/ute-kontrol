// =============================================================================
// LEXBNB PHASE 9 — CLEANING WORKFLOW & READINESS TEST SUITE
// Tests turnover cleaning, tight turnover, template snapshots, and cycle-aware readiness.
// =============================================================================

const assert = require('assert');
const { reconcileBookingOperations, resolveChecklistSnapshot } = require('./operations_engine.js');
const { computePropertyOperationsHealth } = require('./property_readiness_service.js');

console.log('=============================================================================');
console.log('🧹 LEXBNB PHASE 9 — CLEANING WORKFLOW & READINESS TEST SUITE');
console.log('=============================================================================');

function runCleaningWorkflowTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  const prop1 = { id: 'prop-001', slug: 'VILLA_CLEAN_1', name: 'Villa Clean 1' };
  const tenantId = 'tenant-001';

  // TEST 1: Turnover Cleaning Task Creation with Subtype
  console.log('\n--- TEST 1: Turnover Cleaning Task with Subtype ---');
  const booking1 = {
    id: 'b-001',
    tenant_id: tenantId,
    property_id: prop1.id,
    guest_name: 'Ahmet Bey',
    check_in: '2026-08-01',
    check_out: '2026-08-05',
    status: 'CONFIRMED'
  };

  const recon1 = reconcileBookingOperations(booking1, [booking1], [], []);
  const cleanTask = recon1.tasksToInsert.find(t => t.task_type === 'CLEANING');

  assert(cleanTask, 'Cleaning task must be created');
  assert.strictEqual(cleanTask.task_type, 'CLEANING');
  assert.strictEqual(cleanTask.task_subtype, 'TURNOVER');
  assert.strictEqual(cleanTask.due_at, '2026-08-05T11:00:00Z');
  recordPass('1. Booking checkout produces task_type = CLEANING and task_subtype = TURNOVER');

  // TEST 2: Tight Turnover Detection & Priority Elevation
  console.log('\n--- TEST 2: Tight Turnover Detection ---');
  const booking2 = {
    id: 'b-002',
    tenant_id: tenantId,
    property_id: prop1.id,
    guest_name: 'Mehmet Bey',
    check_in: '2026-08-05', // Same day check-in as booking1 check-out!
    check_out: '2026-08-10',
    status: 'CONFIRMED'
  };

  const allBookings = [booking1, booking2];
  const reconTight = reconcileBookingOperations(booking1, allBookings, [], []);
  const tightCleanTask = reconTight.tasksToInsert.find(t => t.task_type === 'CLEANING');

  assert(tightCleanTask.metadata.is_tight_turnover === true, 'Tight turnover flag must be true');
  assert.strictEqual(tightCleanTask.metadata.next_booking_id, 'b-002');
  assert.strictEqual(tightCleanTask.priority, 'HIGH');
  assert(tightCleanTask.priority_score >= 60, 'Priority score must be elevated for tight turnover');
  recordPass('2. Same-day turnover flags is_tight_turnover = true and elevates priority');

  // TEST 3: Template Snapshot & Mutation Isolation
  console.log('\n--- TEST 3: Template Snapshot Isolation ---');
  const mockTemplates = [
    {
      id: 'tmpl-001',
      property_id: prop1.id,
      task_type: 'CLEANING',
      version: 1,
      items: [
        { id: 'item1', text: 'Özel Sauna Dezenfeksiyonu', completed: false, required: true },
        { id: 'item2', text: 'Jakuzi Filtre Temizliği', completed: false, required: true }
      ]
    }
  ];

  const snapshotRes = resolveChecklistSnapshot(prop1.id, 'CLEANING', mockTemplates);
  assert.strictEqual(snapshotRes.templateVersion, 1);
  assert.strictEqual(snapshotRes.checklist.length, 2);

  // Simulate updating template to version 2
  mockTemplates[0].version = 2;
  mockTemplates[0].items.push({ id: 'item3', text: 'Yeni Şömine Odunu', completed: false, required: false });

  // Verify previous snapshot was NOT mutated by template change
  assert.strictEqual(snapshotRes.checklist.length, 2, 'Snapshot must not be affected by template changes');
  recordPass('3. Checklist is snapshotted into task and immune to subsequent template changes');

  // TEST 4: Cycle-Aware Property Readiness: Completed Cleaning -> READY
  console.log('\n--- TEST 4: Cycle-Aware Readiness (Initial Cleaning) ---');
  const tasksAfterClean1 = [
    {
      property_id: prop1.id,
      task_type: 'CLEANING',
      task_subtype: 'TURNOVER',
      status: 'DONE',
      completed_at: '2026-08-05T13:30:00Z',
      checklist: [
        { id: 'c1', text: 'Temizlik', completed: true, required: true }
      ]
    }
  ];

  const health1 = computePropertyOperationsHealth(prop1, tasksAfterClean1, [], [booking1], '2026-08-05T14:00:00Z');
  assert.strictEqual(health1.readinessState, 'READY');
  assert.strictEqual(health1.submetrics.cleaningReadiness, 'CLEAN');
  recordPass('4. Property transitions to READY upon current cycle cleaning completion');

  // TEST 5: Cycle-Aware Property Readiness: Subsequent Checkout Reverts to DIRTY
  console.log('\n--- TEST 5: Cycle-Aware Readiness (Subsequent Checkout Reverts) ---');
  // At August 10, 12:00: booking2 has checked out. The cleaning on Aug 5 is from the PREVIOUS cycle!
  const health2 = computePropertyOperationsHealth(prop1, tasksAfterClean1, [], allBookings, '2026-08-10T12:00:00Z');
  assert.strictEqual(health2.submetrics.cleaningReadiness, 'DIRTY', 'Past cleaning must not validate new checkout');
  assert(health2.readinessState !== 'READY', 'Property must NOT be READY after new checkout');
  recordPass('5. (Correction 8) Cleaning completed before latest checkout does NOT make property READY');

  // TEST 6: Incomplete Required Checklist Prevents READY
  console.log('\n--- TEST 6: Incomplete Checklist Prevents READY ---');
  const taskIncomplete = [
    {
      property_id: prop1.id,
      task_type: 'CLEANING',
      task_subtype: 'TURNOVER',
      status: 'DONE',
      completed_at: '2026-08-10T13:30:00Z',
      checklist: [
        { id: 'c1', text: 'Zorunlu Madde 1', completed: false, required: true } // REQUIRED BUT INCOMPLETE!
      ]
    }
  ];

  const healthIncomplete = computePropertyOperationsHealth(prop1, taskIncomplete, [], allBookings, '2026-08-10T14:00:00Z');
  assert.strictEqual(healthIncomplete.readinessState, 'NOT_READY');
  assert(healthIncomplete.reasons.some(r => r.includes('zorunlu maddeler eksik')));
  recordPass('6. (Correction 10) Missing required checklist items prevents READY state');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runCleaningWorkflowTests();
