// =============================================================================
// LEXBNB PHASE 12 — NOTIFICATION CENTER TEST SUITE
// Deterministic Event Keys, State Transitions (UNREAD -> READ -> ACK -> RESOLVED),
// Deduplication Protection, and Re-Occurrence Lifecycle Reset.
// =============================================================================

const assert = require('assert');
const {
  buildNotificationEventKey,
  processCandidateNotification,
  transitionNotificationState
} = require('./notification_center_service.js');

console.log('=============================================================================');
console.log('⚡ LEXBNB PHASE 12 — NOTIFICATION CENTER TEST SUITE');
console.log('=============================================================================');

function runNotificationCenterTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  // TEST 1: Deterministic Event Key Generation
  console.log('\n--- TEST 1: Deterministic Event Key Generation ---');
  const key1 = buildNotificationEventKey('tenant-101', 'OPERATIONS', 'p-99', 'MAINTENANCE_P1', '2026-09-20');
  const key2 = buildNotificationEventKey('tenant-101', 'OPERATIONS', 'p-99', 'MAINTENANCE_P1', '2026-09-20');
  assert.strictEqual(key1, key2);
  assert.strictEqual(key1, 'notif:tenant-101:OPERATIONS:p-99:MAINTENANCE_P1:2026-09-20');
  recordPass('1. Deterministic event keys format consistently across duplicate calls');

  // TEST 2: Brand New Notification Processing
  console.log('\n--- TEST 2: Brand New Notification ---');
  const candidate1 = {
    tenantId: 'tenant-101',
    domain: 'OPERATIONS',
    entityId: 'p-99',
    eventType: 'MAINTENANCE_P1',
    dateStr: '2026-09-20',
    severity: 'CRITICAL',
    title: 'Acil Bakım Bildirimi',
    message: 'Villa Akdeniz klima arızası',
    deepLink: '/operations?propertyId=p-99'
  };

  const res1 = processCandidateNotification([], candidate1);
  assert.strictEqual(res1.shouldCreate, true);
  assert.strictEqual(res1.notification.status, 'UNREAD');
  recordPass('2. Initial notification candidate accepted and initialized in UNREAD status');

  // TEST 3: Deduplication of Active Notifications
  console.log('\n--- TEST 3: Deduplication of Active Notifications ---');
  const existingActive = [res1.notification];
  const resDuplicate = processCandidateNotification(existingActive, candidate1);

  assert.strictEqual(resDuplicate.shouldCreate, false);
  assert.strictEqual(resDuplicate.reason, 'DUPLICATE_ACTIVE');
  assert.strictEqual(resDuplicate.existingId, res1.notification.id);
  recordPass('3. Duplicate notification candidate rejected while existing notification is active');

  // TEST 4: Notification State Transitions: UNREAD -> READ -> ACKNOWLEDGED -> RESOLVED
  console.log('\n--- TEST 4: State Machine Transitions ---');
  const notif = res1.notification;

  // UNREAD -> READ
  const readNotif = transitionNotificationState(notif, 'READ');
  assert.strictEqual(readNotif.status, 'READ');
  assert.ok(readNotif.read_at);

  // READ -> ACKNOWLEDGED
  const ackNotif = transitionNotificationState(readNotif, 'ACKNOWLEDGED');
  assert.strictEqual(ackNotif.status, 'ACKNOWLEDGED');
  assert.ok(ackNotif.acknowledged_at);

  // ACKNOWLEDGED -> RESOLVED
  const resolvedNotif = transitionNotificationState(ackNotif, 'RESOLVED');
  assert.strictEqual(resolvedNotif.status, 'RESOLVED');
  assert.ok(resolvedNotif.resolved_at);

  // Terminal state: RESOLVED cannot transition directly
  let invalidTransitionThrown = false;
  try {
    transitionNotificationState(resolvedNotif, 'UNREAD');
  } catch (err) {
    invalidTransitionThrown = true;
    assert.ok(err.message.includes('INVALID_NOTIFICATION_TRANSITION'));
  }
  assert.strictEqual(invalidTransitionThrown, true);
  recordPass('4. (Correction 3) Notification transitions strictly follow UNREAD -> READ -> ACKNOWLEDGED -> RESOLVED');

  // TEST 5: Re-Occurrence After Resolution
  console.log('\n--- TEST 5: Re-Occurrence After Resolution ---');
  const existingResolved = [resolvedNotif];
  const resReoccurred = processCandidateNotification(existingResolved, candidate1);

  assert.strictEqual(resReoccurred.shouldCreate, true);
  assert.strictEqual(resReoccurred.notification.status, 'UNREAD');
  assert.strictEqual(resReoccurred.notification.is_reoccurrence, true);
  assert.strictEqual(resReoccurred.notification.previous_notification_id, resolvedNotif.id);
  assert.notStrictEqual(resReoccurred.notification.id, resolvedNotif.id);
  recordPass('5. (Correction 4) Candidate re-occurring after resolution initiates a fresh notification lifecycle');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runNotificationCenterTests();
