const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_change_impact.sql'), 'utf8');
let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.message}`); }
}

test('The schema names the method as an experiment without claiming A/B assignment', () => {
  assert.match(sql, /listing_change_experiments/i);
  assert.doesNotMatch(sql, /randomi[sz]ed|treatment_group|control_group/i);
});

test('Before and after windows cannot cross the change date', () => {
  assert.match(sql, /before_end_exclusive <= change_date/i);
  assert.match(sql, /after_start_date >= change_date/i);
});

test('Minimum observation days are enforced by the database', () => {
  assert.match(sql, /\(before_end_exclusive - before_start_date\) >= minimum_days_per_window/i);
  assert.match(sql, /\(after_end_exclusive - after_start_date\) >= minimum_days_per_window/i);
});

test('Verdicts distinguish association, confounding and insufficient evidence', () => {
  assert.match(sql, /'POSITIVE_ASSOCIATION', 'NEGATIVE_ASSOCIATION', 'NO_CLEAR_CHANGE'/i);
  assert.match(sql, /'CONFOUNDED', 'INSUFFICIENT_DATA'/i);
});

test('Evaluation results must be complete and atomic', () => {
  assert.match(sql, /status = 'EVALUATED' AND verdict IS NOT NULL AND confidence_tier IS NOT NULL/i);
  assert.match(sql, /evaluation_payload IS NOT NULL AND evaluated_at IS NOT NULL/i);
});

test('Evidence rows prove experiment and snapshot use the same listing', () => {
  assert.match(sql, /fk_experiment_snapshot_experiment_same_listing/i);
  assert.match(sql, /fk_experiment_snapshot_source_same_listing/i);
  assert.match(sql, /FOREIGN KEY \(tenant_id, channel_listing_id, snapshot_id\)/i);
});

test('One source snapshot cannot be counted twice in an experiment', () => {
  assert.match(sql, /UNIQUE \(tenant_id, experiment_id, snapshot_id\)/i);
});

test('Only managers may request an evaluation', () => {
  assert.match(sql, /COALESCE\(public\.get_tenant_role\(p_tenant_id\), ''\) NOT IN \('owner', 'admin', 'manager'\)/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.request_listing_change_evaluation[\s\S]*?TO authenticated/i);
});

test('Clients cannot directly forge experiments, evidence or results', () => {
  assert.match(sql, /Members view listing change experiments[\s\S]*?FOR SELECT/i);
  assert.match(sql, /Members view listing experiment evidence[\s\S]*?FOR SELECT/i);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]+listing_(?:change_experiments|experiment_snapshots)[^;]+FOR (?:ALL|INSERT|UPDATE|DELETE)/is);
});

test('Media links remain property- and tenant-aware', () => {
  assert.match(sql, /fk_listing_experiment_old_media_same_property/i);
  assert.match(sql, /FOREIGN KEY \(tenant_id, property_id, new_media_id\)/i);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
