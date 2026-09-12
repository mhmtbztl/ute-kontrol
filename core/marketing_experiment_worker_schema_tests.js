const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_experiment_worker.sql'), 'utf8');

let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.message}`); }
}

test('Worker RPCs are service-role only', () => {
  assert.strictEqual((sql.match(/auth\.role\(\) IS DISTINCT FROM 'service_role'/g) || []).length, 3);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_listing_change_experiment\(UUID\) FROM PUBLIC, authenticated/i);
});
test('Claims use skip-locked leases and bounded retries', () => {
  assert.match(sql, /FOR UPDATE SKIP LOCKED/i);
  assert.match(sql, /INTERVAL '5 minutes'/i);
  assert.match(sql, /attempt_count < 3/i);
  assert.match(sql, /WORKER_RETRY_EXHAUSTED/i);
});
test('Only completed observation windows are claimable', () => {
  assert.match(sql, /after_end_exclusive <= CURRENT_DATE/i);
});
test('Completion rejects causal payloads and cross-scope evidence', () => {
  assert.match(sql, /'causalClaim'.*IS DISTINCT FROM 'false'::jsonb/i);
  assert.match(sql, /EXPERIMENT_EVALUATION_SCOPE_MISMATCH/i);
  assert.match(sql, /snapshot\.channel_listing_id = v_experiment\.channel_listing_id/i);
});
test('Non-insufficient verdicts require both exact-window snapshots', () => {
  assert.match(sql, /v_verdict <> 'INSUFFICIENT_DATA'.*p_before_snapshot_id IS NULL.*p_after_snapshot_id IS NULL/is);
  assert.match(sql, /snapshot\.period_start = v_experiment\.before_start_date/i);
  assert.match(sql, /snapshot\.period_end_exclusive = v_experiment\.after_end_exclusive/i);
});
test('Lease token fences completion and failure writes', () => {
  assert.match(sql, /v_experiment\.lease_token IS DISTINCT FROM p_lease_token/i);
  assert.match(sql, /status = 'PROCESSING' AND lease_token = p_lease_token/i);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
