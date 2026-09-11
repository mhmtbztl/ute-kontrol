// =============================================================================
// LEXBNB PHASE 10 — MESSAGE SCHEDULING & RECONCILIATION TEST SUITE
// Tests booking lifecycle reconciliation, idempotency, date shift rescheduling,
// cancellation behavior, and sent message immutability.
// =============================================================================

const assert = require('assert');
const { reconcileBookingMessages } = require('./guest_messaging_engine.js');

console.log('=============================================================================');
console.log('📅 LEXBNB PHASE 10 — MESSAGE SCHEDULING & RECONCILIATION TEST SUITE');
console.log('=============================================================================');

let passedTests = 0;
let totalTests = 0;

function recordPass(msg) {
  totalTests++;
  passedTests++;
  console.log(`[PASS] ${msg}`);
}

async function runMessageSchedulingTests() {
  const sampleBooking = {
    id: 'bk_rec_1',
    tenant_id: 'tenant_sched_1',
    property_id: 'prop_sched_1',
    guest_name: 'Zeynep Kaya',
    guest_phone: '0532 999 88 77',
    check_in: '2026-11-10',
    check_out: '2026-11-15',
    status: 'CONFIRMED',
    gross_amount: 50000
  };

  const sampleRules = [
    {
      id: 'rule_conf',
      lifecycle_stage: 'BOOKING_CONFIRMED',
      trigger_type: 'BOOKING_CREATED',
      offset_minutes: 0,
      channel: 'WHATSAPP',
      is_active: true
    },
    {
      id: 'rule_pre',
      lifecycle_stage: 'PRE_ARRIVAL',
      trigger_type: 'X_MINUTES_BEFORE_CHECKIN',
      offset_minutes: 1440, // 24h
      channel: 'WHATSAPP',
      is_active: true
    }
  ];

  const sampleTemplates = [
    {
      id: 'tmpl_conf',
      lifecycle_stage: 'BOOKING_CONFIRMED',
      channel: 'WHATSAPP',
      language: 'tr',
      version: 1,
      is_active: true,
      body: 'Sayın {{guest_first_name}}, rezervasyonunuz onaylandı. Giriş: {{check_in_date}}'
    },
    {
      id: 'tmpl_pre',
      lifecycle_stage: 'PRE_ARRIVAL',
      channel: 'WHATSAPP',
      language: 'tr',
      version: 1,
      is_active: true,
      body: 'Girişinize 24 saat kaldı {{guest_first_name}}. Adres: {{property_address}}'
    }
  ];

  // TEST 1: Booking Created Schedules Messages
  console.log('\n--- TEST 1: Booking Created Schedules Messages ---');
  const res1 = reconcileBookingMessages({
    booking: sampleBooking,
    rules: sampleRules,
    templates: sampleTemplates,
    existingMessages: []
  });

  assert.strictEqual(res1.scheduled.length, 2);
  assert.strictEqual(res1.scheduled.some(m => m.automation_rule_id === 'rule_conf'), true);
  assert.strictEqual(res1.scheduled.some(m => m.automation_rule_id === 'rule_pre'), true);

  recordPass('1. Reconcile schedules confirmation and pre-arrival messages on booking creation');

  // TEST 2: Nullable Recipient at Schedule Time
  console.log('\n--- TEST 2: Nullable Recipient at Schedule Time ---');
  const bookingNoContact = {
    ...sampleBooking,
    id: 'bk_no_contact',
    guest_phone: null
  };

  const res2 = reconcileBookingMessages({
    booking: bookingNoContact,
    guest: null,
    rules: [sampleRules[0]],
    templates: sampleTemplates,
    existingMessages: []
  });

  assert.strictEqual(res2.scheduled.length, 1);
  assert.strictEqual(res2.scheduled[0].recipient, null);
  assert.strictEqual(res2.scheduled[0].status, 'SCHEDULED');

  recordPass('2. Missing guest contact at schedule time keeps recipient nullable without failing');

  // TEST 3: Idempotency (Repeated Reconcile Produces 0 Duplicates)
  console.log('\n--- TEST 3: Idempotency (0 Duplicates on Repeated Reconcile) ---');
  const existingMsgs = res1.scheduled.map((m, idx) => ({
    ...m,
    id: `msg_db_${idx}`
  }));

  const res3 = reconcileBookingMessages({
    booking: sampleBooking,
    rules: sampleRules,
    templates: sampleTemplates,
    existingMessages: existingMsgs
  });

  assert.strictEqual(res3.scheduled.length, 0);
  assert.strictEqual(res3.updated.length, 0);
  assert.strictEqual(res3.cancelled.length, 0);

  recordPass('3. Running reconcile repeatedly on unchanged booking produces 0 duplicate scheduled messages');

  // TEST 4: Date Change Reschedules Pending Messages
  console.log('\n--- TEST 4: Date Change Reschedules Pending Messages ---');
  const bookingShifted = {
    ...sampleBooking,
    check_in: '2026-11-20',
    check_out: '2026-11-25'
  };

  const res4 = reconcileBookingMessages({
    booking: bookingShifted,
    rules: sampleRules,
    templates: sampleTemplates,
    existingMessages: existingMsgs
  });

  assert.strictEqual(res4.scheduled.length, 0);
  assert.strictEqual(res4.updated.length > 0, true);

  const updatedPre = res4.updated.find(u => u.idempotency_key.includes('rule_pre'));
  assert.strictEqual(Boolean(updatedPre), true);
  assert.strictEqual(updatedPre.scheduled_at.startsWith('2026-11-19'), true);

  recordPass('4. Booking date change automatically reschedules pending messages and updates rendered date context');

  // TEST 5: Booking Cancellation Cancels Pending Messages
  console.log('\n--- TEST 5: Booking Cancellation Cancels Pending Messages ---');
  const cancelledBooking = {
    ...sampleBooking,
    status: 'CANCELLED'
  };

  const res5 = reconcileBookingMessages({
    booking: cancelledBooking,
    rules: sampleRules,
    templates: sampleTemplates,
    existingMessages: existingMsgs
  });

  assert.strictEqual(res5.cancelled.length, 2);
  assert.strictEqual(res5.cancelled.every(c => c.status === 'CANCELLED'), true);

  recordPass('5. Booking cancellation transitions all pending messages to CANCELLED state');

  // TEST 6: SENT Messages Remain Strictly Immutable
  console.log('\n--- TEST 6: SENT Message Immutability ---');
  const sentMsgs = [
    {
      id: 'msg_sent_1',
      booking_id: sampleBooking.id,
      idempotency_key: `booking:${sampleBooking.id}:rule_conf:BOOKING_CONFIRMED`,
      status: 'SENT',
      scheduled_at: '2026-11-01T10:00:00Z',
      rendered_body: 'Eski Onay Metni'
    }
  ];

  const res6 = reconcileBookingMessages({
    booking: bookingShifted,
    rules: [sampleRules[0]],
    templates: sampleTemplates,
    existingMessages: sentMsgs
  });

  assert.strictEqual(res6.scheduled.length, 0);
  assert.strictEqual(res6.updated.length, 0);
  assert.strictEqual(res6.cancelled.length, 0);

  recordPass('6. Already SENT messages are strictly ignored during date shifts and never altered');

  // TEST 7: Marketing Consent Enforcement
  console.log('\n--- TEST 7: Marketing Consent Enforcement ---');
  const marketingRule = {
    id: 'rule_promo',
    lifecycle_stage: 'REBOOKING_OFFER',
    trigger_type: 'BOOKING_CREATED',
    channel: 'WHATSAPP',
    message_type: 'MARKETING',
    is_active: true
  };

  const promoTemplate = {
    id: 'tmpl_promo',
    lifecycle_stage: 'REBOOKING_OFFER',
    channel: 'WHATSAPP',
    language: 'tr',
    message_type: 'MARKETING',
    version: 1,
    is_active: true,
    body: 'Tekrar bekleriz {{guest_first_name}}!'
  };

  const guestOptOut = { first_name: 'Zeynep', marketing_opt_in: false };
  const resOptOut = reconcileBookingMessages({
    booking: sampleBooking,
    guest: guestOptOut,
    rules: [marketingRule],
    templates: [promoTemplate],
    existingMessages: []
  });

  assert.strictEqual(resOptOut.skipped.length, 1);
  assert.strictEqual(resOptOut.skipped[0].status, 'SKIPPED');
  assert.strictEqual(resOptOut.skipped[0].failure_code, 'MARKETING_OPT_OUT');

  recordPass('7. Marketing messages are cleanly SKIPPED when guest has not opted into marketing');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log('=============================================================================');
}

runMessageSchedulingTests().catch(err => {
  console.error('[FAIL] Message scheduling test suite failed:', err);
  process.exit(1);
});
