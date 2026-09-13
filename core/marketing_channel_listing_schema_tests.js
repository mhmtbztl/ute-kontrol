const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_channel_listing_rpc.sql'), 'utf8');
let totalTests = 0, passedTests = 0;
function runTest(name, fn) { totalTests++; try { fn(); passedTests++; console.log(`[PASS] ${name}`); } catch (e) { console.error(`[FAIL] ${name}`); console.error(`       ${e.message}`); } }

runTest('RPC is security-definer with a locked search path', () => {
  assert.match(sql, /save_property_channel_listing[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i);
});
runTest('Only manager roles may write channel listings', () => {
  assert.match(sql, /COALESCE\(public\.get_tenant_role\(p_tenant_id\), ''\) NOT IN \('owner', 'admin', 'manager'\)/i);
  assert.doesNotMatch(sql, /NOT IN \([^)]*'staff'/i);
});
runTest('Property ownership is checked with tenant and property ids', () => {
  assert.match(sql, /FROM public\.properties[\s\S]*?tenant_id = p_tenant_id AND id = p_property_id/i);
});
runTest('Natural listing identity is serialized and cannot move between properties', () => {
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /channel_code = v_channel[\s\S]*?external_listing_id = v_external_id/i);
  assert.match(sql, /CHANNEL_LISTING_REFERENCE_BELONGS_TO_ANOTHER_PROPERTY/);
});
runTest('Only HTTPS external URLs are accepted', () => {
  assert.match(sql, /HTTPS_CHANNEL_URL_REQUIRED/);
  assert.match(sql, /\^https:\/\//i);
});
runTest('Public execution is revoked before authenticated grant', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_property_channel_listing[\s\S]*?FROM PUBLIC/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.save_property_channel_listing[\s\S]*?TO authenticated/i);
});
console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
