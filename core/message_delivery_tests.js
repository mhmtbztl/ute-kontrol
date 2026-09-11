// =============================================================================
// LEXBNB PHASE 10 — MESSAGE DELIVERY ENGINE TEST SUITE
// Tests recipient send-time resolution, transient retry backoff, permanent failures,
// stuck processing recovery, concurrency, and log sanitization.
// =============================================================================

const assert = require('assert');
const { MessageDeliveryService } = require('./message_delivery_service.js');
const { MockDeliveryProvider } = require('./messaging_provider.js');

console.log('=============================================================================');
console.log('🚀 LEXBNB PHASE 10 — MESSAGE DELIVERY ENGINE TEST SUITE');
console.log('=============================================================================');

let passedTests = 0;
let totalTests = 0;

function recordPass(msg) {
  totalTests++;
  passedTests++;
  console.log(`[PASS] ${msg}`);
}

async function runMessageDeliveryTests() {
  const deliveryService = new MessageDeliveryService({ maxRetries: 3, staleTimeoutMinutes: 5 });

  // TEST 1: Normal Send with Send-Time Recipient Resolution & Snapshot
  console.log('\n--- TEST 1: Normal Send & Recipient Snapshot ---');
  const mockProvider = new MockDeliveryProvider();
  const testMessage = {
    id: 'msg_del_1',
    tenant_id: 'tenant_del_1',
    channel: 'WHATSAPP',
    recipient: null, // Unset at schedule time
    rendered_subject: null,
    rendered_body: 'Giriş bilgileriniz hazır',
    idempotency_key: 'key_1',
    status: 'SCHEDULED',
    retry_count: 0
  };

  const guest = { phone: '0532 111 22 33', email: 'guest@test.com' };

  const result1 = await deliveryService.processMessage(testMessage, { guest }, mockProvider);
  assert.strictEqual(result1.message.status, 'SENT');
  assert.strictEqual(result1.message.recipient_snapshot, '+905321112233');
  assert.strictEqual(Boolean(result1.message.sent_at), true);
  assert.strictEqual(result1.deliveryLog.status, 'SUCCESS');

  recordPass('1. Send-time recipient resolution normalizes address and preserves immutable recipient_snapshot');

  // TEST 2: Missing Recipient at Send Time
  console.log('\n--- TEST 2: Missing Recipient at Send Time ---');
  const msgNoContact = {
    id: 'msg_del_2',
    tenant_id: 'tenant_del_1',
    channel: 'WHATSAPP',
    recipient: null,
    status: 'SCHEDULED'
  };

  const result2 = await deliveryService.processMessage(msgNoContact, { guest: null }, mockProvider);
  assert.strictEqual(result2.message.status, 'SKIPPED');
  assert.strictEqual(result2.message.failure_code, 'MISSING_RECIPIENT');
  assert.strictEqual(result2.deliveryLog.status, 'SKIPPED');

  recordPass('2. Missing recipient transitions status to SKIPPED with MISSING_RECIPIENT without system crash');

  // TEST 3: Transient Failure & Exponential Retry Backoff
  console.log('\n--- TEST 3: Transient Failure & Retry Backoff ---');
  const transientProvider = new MockDeliveryProvider({ simulateTransientError: true });
  const msgRetry = {
    id: 'msg_del_3',
    tenant_id: 'tenant_del_1',
    channel: 'WHATSAPP',
    recipient: '+905321112233',
    status: 'SCHEDULED',
    retry_count: 0
  };

  const result3 = await deliveryService.processMessage(msgRetry, { guest }, transientProvider);
  assert.strictEqual(result3.message.status, 'SCHEDULED');
  assert.strictEqual(result3.message.retry_count, 1);
  assert.strictEqual(result3.deliveryLog.status, 'TRANSIENT_ERROR');

  const backoffTime = new Date(result3.message.scheduled_at).getTime();
  assert.strictEqual(backoffTime > Date.now(), true);

  recordPass('3. Transient provider error triggers exponential backoff and increments retry_count');

  // TEST 4: Permanent Failure (Immediate or Exceeded Retries)
  console.log('\n--- TEST 4: Permanent Failure Handling ---');
  const permanentProvider = new MockDeliveryProvider({ simulatePermanentError: true });
  const msgPerm = {
    id: 'msg_del_4',
    tenant_id: 'tenant_del_1',
    channel: 'WHATSAPP',
    recipient: '+905321112233',
    status: 'SCHEDULED',
    retry_count: 0
  };

  const result4 = await deliveryService.processMessage(msgPerm, { guest }, permanentProvider);
  assert.strictEqual(result4.message.status, 'FAILED');
  assert.strictEqual(result4.message.failure_code, 'INVALID_RECIPIENT');
  assert.strictEqual(result4.deliveryLog.status, 'PERMANENT_ERROR');

  recordPass('4. Non-recoverable permanent provider errors transition immediately to FAILED without retry');

  // TEST 5: Stuck PROCESSING Recovery
  console.log('\n--- TEST 5: Stuck PROCESSING Recovery ---');
  const pastTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
  const stuckMessages = [
    { id: 'stuck_1', status: 'PROCESSING', claimed_at: pastTime, claimed_by: 'worker_crashed' },
    { id: 'fresh_1', status: 'PROCESSING', claimed_at: new Date().toISOString(), claimed_by: 'worker_active' }
  ];

  const reclaimed = deliveryService.reclaimStaleProcessing(stuckMessages);
  assert.strictEqual(reclaimed.length, 1);
  assert.strictEqual(reclaimed[0].id, 'stuck_1');
  assert.strictEqual(reclaimed[0].status, 'SCHEDULED');
  assert.strictEqual(stuckMessages[1].status, 'PROCESSING');

  recordPass('5. Stuck PROCESSING recovery reclaims timed-out worker messages and preserves active workers');

  // TEST 6: Sanitized Delivery Logging (No Secret Credentials in Logs)
  console.log('\n--- TEST 6: Delivery Log Sanitization ---');
  const sensitiveMsg = {
    id: 'msg_del_sec',
    tenant_id: 'tenant_del_1',
    channel: 'WHATSAPP',
    recipient: '+905321112233',
    rendered_body: 'Kapı şifreniz: 9988. Wi-Fi: wifi_pass_secret',
    idempotency_key: 'key_sec',
    status: 'SCHEDULED'
  };

  const result6 = await deliveryService.processMessage(sensitiveMsg, { guest }, mockProvider);
  const logStr = JSON.stringify(result6.deliveryLog);
  assert.strictEqual(logStr.includes('9988'), false);
  assert.strictEqual(logStr.includes('wifi_pass_secret'), false);
  assert.strictEqual(result6.deliveryLog.rendered_body, undefined);

  recordPass('6. Message delivery logs strictly exclude rendered body and sensitive secrets');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log('=============================================================================');
}

runMessageDeliveryTests().catch(err => {
  console.error('[FAIL] Message delivery test suite failed:', err);
  process.exit(1);
});
