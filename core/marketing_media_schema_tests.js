const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_media_ai.sql'), 'utf8');
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

runTest('Media bucket is private and constrained to image MIME types', () => {
  assert.match(sql, /'property-media'[\s\S]*?FALSE[\s\S]*?image\/jpeg/i);
  assert.doesNotMatch(sql, /public_url/i);
});

runTest('Storage tenant parser safely rejects invalid UUID prefixes', () => {
  assert.match(sql, /FUNCTION public\.marketing_storage_tenant_id/i);
  assert.match(sql, /FUNCTION public\.marketing_storage_property_id/i);
  assert.match(sql, /RETURN NULL/i);
});

runTest('Storage policies use tenant membership and manager roles', () => {
  assert.match(sql, /Members read private property media[\s\S]*?is_tenant_member\(public\.marketing_storage_tenant_id\(name\)\)/i);
  assert.match(sql, /Managers upload private property media[\s\S]*?get_tenant_role\(public\.marketing_storage_tenant_id\(name\)\)/i);
  assert.match(sql, /p\.id = public\.marketing_storage_property_id\(name\)/i);
});

runTest('Media rows enforce tenant and property in storage paths', () => {
  assert.match(sql, /original_storage_path LIKE tenant_id::TEXT \|\| '\/' \|\| property_id::TEXT/i);
  assert.match(sql, /fk_property_media_property_tenant/i);
});

runTest('Channel placement binds listing and media to the same property', () => {
  assert.match(sql, /fk_media_placement_listing_same_property/i);
  assert.match(sql, /fk_media_placement_media_same_property/i);
});

runTest('Only one active order and cover exist per channel listing', () => {
  assert.match(sql, /uq_active_channel_media_order/i);
  assert.match(sql, /uq_active_channel_cover/i);
});

runTest('Only one queued or processing analysis exists per property', () => {
  assert.match(sql, /WHERE status IN \('QUEUED', 'PROCESSING'\)/i);
});

runTest('AI cache key and context include versionable hashes', () => {
  assert.match(sql, /property_context_hash CHAR\(64\)/i);
  assert.match(sql, /cache_key CHAR\(64\)/i);
  assert.match(sql, /prompt_version VARCHAR/i);
  assert.match(sql, /schema_version VARCHAR/i);
});

runTest('Authenticated users cannot directly forge AI results', () => {
  assert.match(sql, /Members view photo analysis items[\s\S]*?FOR SELECT/i);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]+photo_analysis_items[^;]+FOR (?:ALL|INSERT|UPDATE|DELETE)/is);
});

runTest('Composite parent versions cannot null mandatory tenant keys on delete', () => {
  const constraint = sql.match(/CONSTRAINT fk_media_version_parent_tenant_property[\s\S]*?ON DELETE (?:RESTRICT|CASCADE|SET NULL|NO ACTION DEFERRABLE INITIALLY DEFERRED),/i);
  assert(constraint, 'Parent-version FK was not found');
  assert.match(constraint[0], /ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED/i);
});

runTest('Analysis requests validate role and property ownership', () => {
  assert.match(sql, /FUNCTION public\.request_photo_analysis/i);
  assert.match(sql, /get_tenant_role\(p_tenant_id\) NOT IN \('owner', 'admin', 'manager'\)/i);
  assert.match(sql, /PROPERTY_TENANT_MISMATCH/i);
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
