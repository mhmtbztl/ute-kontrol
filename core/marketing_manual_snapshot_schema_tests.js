const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_manual_snapshot.sql'), 'utf8');
let totalTests = 0;
let passedTests = 0;
function runTest(name, fn) {
  totalTests += 1;
  try { fn(); passedTests += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}`); console.error(`       ${error.message}`); }
}

runTest('Manual snapshot uses one security-definer RPC with a locked search path', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.record_manual_channel_snapshot[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
});
runTest('Caller role and tenant-owned listing are verified', () => {
  assert.match(sql, /COALESCE\(public\.get_tenant_role\(p_tenant_id\), ''\) NOT IN \('owner', 'admin', 'manager', 'staff'\)/i);
  assert.match(sql, /property_channel_listings[\s\S]*?tenant_id = p_tenant_id AND id = p_channel_listing_id/i);
});
runTest('Empty, negative and impossible funnels fail before insert', () => {
  assert.match(sql, /AT_LEAST_ONE_FUNNEL_COUNTER_REQUIRED/);
  assert.match(sql, /NEGATIVE_FUNNEL_COUNTER/);
  assert.match(sql, /INVALID_FUNNEL_ORDER/);
});
runTest('Idempotency reuses identical payload and rejects a changed payload', () => {
  assert.match(sql, /ON CONFLICT \(tenant_id, idempotency_key\)/i);
  assert.match(sql, /channel_listing_id IS DISTINCT FROM p_channel_listing_id/i);
  assert.match(sql, /period_start IS DISTINCT FROM p_period_start/i);
  assert.match(sql, /'reused', TRUE/i);
  assert.match(sql, /IDEMPOTENCY_PAYLOAD_MISMATCH/);
  assert.match(sql, /v_snapshot\.notes IS DISTINCT FROM NULLIF\(trim\(p_notes\), ''\)/i);
});
runTest('Raw snapshot stays immutable and the batch commits atomically', () => {
  assert.doesNotMatch(sql, /UPDATE public\.channel_performance_snapshots/i);
  assert.match(sql, /UPDATE public\.marketing_metric_import_batches[\s\S]*?status = 'COMMITTED'/i);
});
runTest('Public access is revoked and authenticated execution is explicit', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_manual_channel_snapshot[\s\S]*?FROM PUBLIC/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.record_manual_channel_snapshot[\s\S]*?TO authenticated/i);
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
