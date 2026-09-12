const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_health_inputs_worker.sql'), 'utf8');
let total = 0; let passed = 0;
function test(name, fn) { total += 1; try { fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.message}`); } }

test('Eight component keys have explicit measurement-kind contracts', () => {
  assert.match(sql, /component_key = 'PHOTO_QUALITY' AND measurement_kind = 'DIRECT_SCORE'/i);
  assert.match(sql, /component_key = 'NET_ECONOMICS' AND measurement_kind = 'NET_ECONOMICS'/i);
  assert.match(sql, /'CLICK_PERFORMANCE'.*'CONVERSION_POWER'.*'VISIBILITY_STRENGTH'.*'REVIEW_STRENGTH'.*'AVAILABILITY_FLEX'.*'LISTING_DEPTH'/is);
});
test('Available and unavailable raw inputs have distinct validity rules', () => {
  assert.match(sql, /status = 'UNAVAILABLE' AND reason IS NOT NULL/i);
  assert.match(sql, /status = 'AVAILABLE' AND observed_value IS NOT NULL/i);
});
test('Raw inputs are append-only for authenticated clients', () => {
  assert.match(sql, /FOR SELECT/i);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]+property_marketing_health_inputs[^;]+FOR (?:ALL|INSERT|UPDATE|DELETE)/is);
});
test('Only service role can persist final snapshots', () => {
  assert.match(sql, /auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.persist_property_marketing_health_snapshot.*FROM PUBLIC, authenticated/i);
});
test('Final snapshots require same-property source evidence and no imputation', () => {
  assert.match(sql, /HEALTH_SOURCE_SCOPE_MISMATCH/i);
  assert.match(sql, /'missingDataImputed' IS DISTINCT FROM 'false'::jsonb/i);
  assert.match(sql, /source_input_ids UUID\[\]/i);
});
test('Idempotent conflict handling does not mutate an immutable snapshot', () => {
  assert.match(sql, /ON CONFLICT \(tenant_id, property_id, input_fingerprint, scoring_version\)\s+DO NOTHING/i);
  assert.doesNotMatch(sql, /ON CONFLICT[\s\S]{0,150}DO UPDATE/i);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
