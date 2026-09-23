/**
 * PHASE 40 LIVE ISOLATION TESTS
 * Runs only through the dedicated destructive-test gate in core/test_env.js.
 */
const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const anonymous = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const users = [];
const tenants = [];
let passed = 0;
let failed = 0;
const check = (condition, name, detail) => {
  if (condition) { passed += 1; console.log(`[PASS] ${name}`); }
  else { failed += 1; console.error(`[FAIL] ${name}\n       ${detail || 'condition failed'}`); }
};
const stamp = Date.now().toString(36);

async function makeOwner(label) {
  const email = `ctx_${label}_${stamp}@lexbnb-e2e.test`;
  const password = `Ctx!${stamp}Aa`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError) throw createError;
  users.push(created.user.id);
  const client = anonymous();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  const { data: tenant, error: tenantError } = await client.rpc('create_tenant_and_owner', {
    p_company_name: `Context ${label} ${stamp}`, p_full_name: 'Context Owner'
  });
  if (tenantError) throw tenantError;
  tenants.push(tenant.tenant_id);
  const { data: property, error: propertyError } = await client.from('properties')
    .insert({ tenant_id: tenant.tenant_id, slug: `CTX_${label}_${stamp}`.toUpperCase(), name: `Villa ${label}` })
    .select('id').single();
  if (propertyError) throw propertyError;
  return { client, tenantId: tenant.tenant_id, propertyId: property.id };
}

async function run() {
  const A = await makeOwner('a');
  const B = await makeOwner('b');
  const rpcArgs = {
    p_tenant_id: A.tenantId, p_property_id: A.propertyId, p_country_code: 'TR',
    p_admin_area: 'Antalya', p_city: 'Kaş', p_district_region: 'Kalkan',
    p_social_links: { instagram: 'https://instagram.com/context-test' }
  };

  const { error: anonError } = await anonymous().rpc('save_property_analysis_context', rpcArgs);
  check(!!anonError && /permission denied/i.test(anonError.message || ''),
    '1. anon cannot execute the Phase 40 save RPC', anonError && anonError.message);

  const { data: own, error: ownError } = await A.client.rpc('save_property_analysis_context', rpcArgs);
  check(!ownError && own && own.success === true,
    '2. tenant owner can save own property analysis context', ownError && ownError.message);

  const { error: unsafeError } = await A.client.rpc('save_property_analysis_context', {
    ...rpcArgs, p_social_links: { website: 'https://user:secret@example.com' }
  });
  check(!!unsafeError && /HTTPS_PUBLIC_URL_REQUIRED/i.test(unsafeError.message || ''),
    '3. credential-bearing public links are rejected', unsafeError && unsafeError.message);

  const { error: crossWriteError } = await B.client.rpc('save_property_analysis_context', rpcArgs);
  check(!!crossWriteError && /UNAUTHORIZED/i.test(crossWriteError.message || ''),
    '4. a foreign tenant cannot write context', crossWriteError && crossWriteError.message);

  const { data: foreignRows, error: foreignReadError } = await B.client.from('property_analysis_context')
    .select('property_id').eq('tenant_id', A.tenantId);
  check(!foreignReadError && (foreignRows || []).length === 0,
    '5. a foreign tenant cannot read context through RLS', foreignReadError && foreignReadError.message);

  const { data: ownRows, error: ownReadError } = await A.client.from('property_analysis_context')
    .select('country_code,city,district_region,social_links').eq('property_id', A.propertyId);
  check(!ownReadError && ownRows && ownRows.length === 1 && ownRows[0].city === 'Kaş',
    '6. the owner reads only the persisted allowlisted context', ownReadError && ownReadError.message);
}

async function cleanup() {
  for (const tenantId of tenants) await admin.from('tenants').delete().eq('id', tenantId);
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}

(async () => {
  try { await run(); }
  catch (error) { failed += 1; console.error(`[FAIL] live test crashed\n       ${error.message}`); }
  finally {
    try { await cleanup(); } catch (error) { console.error(`cleanup failed: ${error.message}`); }
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED`);
    process.exit(failed ? 1 : 0);
  }
})();
