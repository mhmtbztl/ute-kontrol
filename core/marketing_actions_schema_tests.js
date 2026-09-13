const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_findings_actions.sql'), 'utf8');
let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests += 1;
  try {
    fn();
    passedTests += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${error.message}`);
  }
}

runTest('Persisted executive domains include the Today REVENUE contract', () => {
  assert.match(sql, /domain IN[\s\S]*?'REVENUE'[\s\S]*?'MARKETING'/i);
});

runTest('Only one active finding exists per tenant fingerprint', () => {
  assert.match(sql, /uq_active_marketing_finding_fingerprint[\s\S]*?WHERE status IN \('OPEN', 'ACKNOWLEDGED'\)/i);
});

runTest('Finding links are tenant-aware and property-aware', () => {
  assert.match(sql, /fk_marketing_finding_property_tenant/i);
  assert.match(sql, /fk_marketing_finding_listing_same_property/i);
  assert.match(sql, /FOREIGN KEY \(tenant_id, property_id, channel_listing_id\)/i);
});

runTest('Backend upsert reuses active fingerprint and alert', () => {
  assert.match(sql, /FUNCTION public\.upsert_marketing_finding/i);
  assert.match(sql, /ON CONFLICT \(tenant_id, finding_fingerprint\)[\s\S]*?DO UPDATE SET/i);
  assert.match(sql, /ON CONFLICT \(tenant_id, marketing_finding_id\)[\s\S]*?DO UPDATE SET/i);
});

runTest('Only service role may execute finding upsert', () => {
  assert.match(sql, /auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.upsert_marketing_finding[\s\S]*?TO service_role/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.upsert_marketing_finding[\s\S]*?FROM PUBLIC, authenticated/i);
});

runTest('Lifecycle links preserve records and remain tenant-delete safe', () => {
  assert.match(sql, /fk_executive_alert_marketing_finding_tenant[\s\S]*?ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED/i);
  assert.match(sql, /fk_operational_task_marketing_finding_tenant[\s\S]*?ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED/i);
});

runTest('Authenticated clients can only read findings directly', () => {
  assert.match(sql, /Members view marketing findings[\s\S]*?FOR SELECT/i);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]+marketing_findings[^;]+FOR (?:ALL|INSERT|UPDATE|DELETE)/is);
});

runTest('Finding review requires manager role and locks the row', () => {
  assert.match(sql, /FUNCTION public\.review_marketing_finding/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /COALESCE\(public\.get_tenant_role\(v_finding\.tenant_id\), ''\) NOT IN \('owner', 'admin', 'manager'\)/i);
});

runTest('Operational tasks require ACCEPT_TASK and a physical action kind', () => {
  assert.match(sql, /v_action = 'ACCEPT_TASK'/i);
  assert.match(sql, /action_kind NOT IN \('RESHOOT', 'ON_SITE_CONTENT'\)/i);
  assert.match(sql, /'GENERAL', 'MARKETING_CREATIVE'/i);
});

runTest('Task creation is idempotent through source_event_id', () => {
  assert.match(sql, /'MKT:' \|\| v_finding\.id::TEXT/i);
  assert.match(sql, /ON CONFLICT \(tenant_id, source_event_id\)/i);
});

runTest('Completing a linked task resolves its finding and alert', () => {
  assert.match(sql, /FUNCTION public\.sync_marketing_finding_from_task/i);
  assert.match(sql, /NEW\.status = 'DONE'/i);
  assert.match(sql, /UPDATE public\.marketing_findings[\s\S]*?UPDATE public\.executive_alerts/i);
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
