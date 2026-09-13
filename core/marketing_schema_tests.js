const assert = require('assert');
const fs = require('fs');
const path = require('path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'migration_phase17_marketing_foundation.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

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

runTest('Phase 17 uses tenant-aware composite property references', () => {
  assert.match(sql, /FOREIGN KEY\s*\(tenant_id, property_id\)[\s\S]*?REFERENCES public\.properties\s*\(tenant_id, id\)/i);
});

runTest('All three foundation tables enable RLS', () => {
  for (const table of ['property_channel_listings', 'marketing_metric_import_batches', 'channel_performance_snapshots']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
  }
});

runTest('Viewer membership is not enough for channel-listing writes', () => {
  assert.match(sql, /Managers insert channel listings[\s\S]*?get_tenant_role\(tenant_id\) IN \('owner', 'admin', 'manager'\)/i);
  assert.doesNotMatch(sql, /Managers insert channel listings[\s\S]*?viewer/i);
});

runTest('Performance snapshots are append-only for authenticated clients', () => {
  assert.match(sql, /Staff append channel snapshots/i);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]+channel_performance_snapshots FOR UPDATE/is);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]+channel_performance_snapshots FOR DELETE/is);
});

runTest('Staff can append snapshots only to an authorized draft batch', () => {
  assert.match(sql, /Staff append channel snapshots[\s\S]*?batch\.status = 'DRAFT'/i);
  assert.match(sql, /batch\.created_by = auth\.uid\(\)[\s\S]*?get_tenant_role/i);
});

runTest('Derived funnel rates live in a security-invoker view', () => {
  assert.match(sql, /CREATE OR REPLACE VIEW public\.channel_performance_rates\s+WITH \(security_invoker = true\)/i);
  assert.match(sql, /ELSE NULL END AS search_to_view_ctr_percent/i);
  assert.doesNotMatch(sql, /search_to_view_ctr\s+NUMERIC/i);
});

runTest('Raw counters reject negatives and impossible funnel ordering', () => {
  assert.match(sql, /chk_channel_snapshot_nonnegative_counts/i);
  assert.match(sql, /listing_views <= impressions/i);
  assert.match(sql, /platform_reported_bookings <= booking_attempts/i);
});

runTest('Import batches have tenant-scoped idempotency', () => {
  assert.match(sql, /UNIQUE \(tenant_id, idempotency_key\)/i);
});

runTest('The channel model allows multiple listings per property and channel', () => {
  assert.doesNotMatch(sql, /UNIQUE \(tenant_id, property_id, channel_code\)/i);
  assert.match(sql, /uq_channel_listing_external_identity/i);
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
