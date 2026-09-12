const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_photo_worker.sql'), 'utf8');
let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

test('Only service role can claim, complete or fail analysis work', () => {
  assert.strictEqual((sql.match(/SERVICE_ROLE_REQUIRED/g) || []).length, 3);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_photo_analysis_run\(UUID\) FROM PUBLIC, authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.complete_photo_analysis_run[\s\S]*?TO service_role/i);
});

test('Workers claim queued runs with row locking and skip locked semantics', () => {
  assert.match(sql, /run\.status = 'QUEUED'[\s\S]*?FOR UPDATE SKIP LOCKED/i);
  assert.match(sql, /SET status = 'PROCESSING', started_at = COALESCE\(started_at, NOW\(\)\)/i);
});

test('Expired leases are retried at most three times and then fail terminally', () => {
  assert.match(sql, /lease_expires_at = NOW\(\) \+ INTERVAL '5 minutes'/i);
  assert.match(sql, /attempt_count = attempt_count \+ 1/i);
  assert.match(sql, /attempt_count < 3/i);
  assert.match(sql, /WORKER_RETRY_EXHAUSTED/i);
  assert.match(sql, /lease_token = gen_random_uuid\(\)/i);
  assert.match(sql, /v_run\.lease_token IS DISTINCT FROM p_lease_token/i);
});

test('Successful aggregate results are scope and schema-version bound', () => {
  assert.match(sql, /p_result_payload ->> 'runId' IS DISTINCT FROM v_run\.id::TEXT/i);
  assert.match(sql, /p_result_payload ->> 'propertyId' IS DISTINCT FROM v_run\.property_id::TEXT/i);
  assert.match(sql, /p_result_payload ->> 'schemaVersion' IS DISTINCT FROM v_run\.schema_version/i);
});

test('Completion rejects duplicate, inactive and malformed media evidence', () => {
  assert.match(sql, /count\(DISTINCT item\."mediaId"\)/i);
  assert.match(sql, /media\.media_status <> 'ACTIVE'/i);
  assert.match(sql, /item\."cacheKey" !~ '\^\[0-9a-f\]\{64\}\$'/i);
});

test('Run and item writes complete in one database transaction', () => {
  assert.match(sql, /INSERT INTO public\.photo_analysis_items[\s\S]*?UPDATE public\.photo_analysis_runs/i);
  assert.match(sql, /status = 'SUCCEEDED'[\s\S]*?result_schema_validated_at = NOW\(\)/i);
});

test('Failure recording is terminal, bounded and active-run only', () => {
  assert.match(sql, /SET status = 'FAILED'/i);
  assert.match(sql, /left\(p_error_detail, 2000\)/i);
  assert.match(sql, /status = 'PROCESSING' AND lease_token = p_lease_token/i);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
