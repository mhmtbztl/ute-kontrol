const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migration_phase40_property_analysis_context.sql'), 'utf8');
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`[PASS] ${name}`);
}

test('Phase 40 creates a one-row-per-property tenant-bound context table', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.property_analysis_context/i);
  assert.match(migration, /property_id UUID PRIMARY KEY/i);
  assert.match(migration, /FOREIGN KEY \(tenant_id, property_id\)[\s\S]*?REFERENCES public\.properties \(tenant_id, id\)[\s\S]*?ON DELETE CASCADE/i);
  assert.match(migration, /country_code CHAR\(2\)/i);
  assert.match(migration, /social_links JSONB NOT NULL DEFAULT '\{\}'::jsonb/i);
});

test('Phase 40 constrains social keys, HTTPS URLs and payload size in PostgreSQL', () => {
  for (const key of ['website', 'instagram', 'facebook', 'tiktok', 'youtube', 'googleBusiness']) {
    assert(migration.includes(`'${key}'`), `missing ${key}`);
  }
  assert.match(migration, /social_links\s*-\s*'website'[\s\S]*?=\s*'\{\}'::jsonb/i);
  assert.match(migration, /\^https:\/\//i);
  assert.match(migration, /pg_column_size\(social_links\)\s*<=\s*8192/i);
});

test('Phase 40 combines authenticated grants with member and manager RLS', () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /FOR SELECT TO authenticated[\s\S]*?is_tenant_member\(tenant_id\)/i);
  assert.match(migration, /FOR INSERT TO authenticated[\s\S]*?get_tenant_role\(tenant_id\)[\s\S]*?'owner'[\s\S]*?'admin'[\s\S]*?'manager'/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.property_analysis_context FROM PUBLIC/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.property_analysis_context FROM anon/i);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.property_analysis_context TO authenticated/i);
});

test('save RPC is invoker-rights, validates tenant ownership and excludes anon', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.save_property_analysis_context/i);
  assert.match(migration, /SECURITY INVOKER/i);
  assert.match(migration, /SET search_path = ''/i);
  assert.match(migration, /auth\.uid\(\) IS NULL/i);
  assert.match(migration, /get_tenant_role\(p_tenant_id\)/i);
  assert.match(migration, /FROM public\.properties[\s\S]*?tenant_id = p_tenant_id[\s\S]*?id = p_property_id/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.save_property_analysis_context[\s\S]*?FROM PUBLIC/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.save_property_analysis_context[\s\S]*?FROM anon/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.save_property_analysis_context[\s\S]*?TO authenticated/i);
});

test('migration verifies its own table, policies, privileges and function body', () => {
  for (const marker of [
    'PHASE40_CONTEXT_TABLE_MISSING', 'PHASE40_RLS_DISABLED',
    'PHASE40_POLICY_MISSING', 'PHASE40_ANON_TABLE_OPEN',
    'PHASE40_ANON_FUNCTION_OPEN', 'PHASE40_AUTH_FUNCTION_MISSING',
    'PHASE40_FUNCTION_NOT_INVOKER'
  ]) assert(migration.includes(marker), `missing verification marker ${marker}`);
  assert.match(migration, /RAISE NOTICE 'PHASE 40 OK/i);
});

console.log(`\nTEST SUMMARY: ${passed} / ${passed} TESTS PASSED`);
