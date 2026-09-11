// =============================================================================
// LEXBNB PHASE 8 — MONTHLY TARGETS TEST SUITE (DB INTEGRATION & CONSTRAINTS)
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Load .env
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .filter(line => line.includes('='))
    .map(line => {
      const [k, ...v] = line.trim().split('=');
      return [k.trim(), v.join('=').trim()];
    })
);

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('=============================================================================');
console.log('🎯 LEXBNB PHASE 8 — MONTHLY TARGETS TEST SUITE');
console.log('=============================================================================');

async function runMonthlyTargetTests() {
  const testRunId = Date.now();
  const userAEmail = `target_a_${testRunId}@lexbnb.test`;
  const userBEmail = `target_b_${testRunId}@lexbnb.test`;
  const testPass = 'TargetTestPassword123!';

  let userAId, userBId, tenantAId, tenantBId, propAId, propBId;
  let clientA, clientB;
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  try {
    // -------------------------------------------------------------
    // SETUP: Create Auth Users & Tenants
    // -------------------------------------------------------------
    console.log('\n--- SETUP: Provisioning Isolated Test Tenants & Properties ---');
    const { data: authA } = await adminClient.auth.admin.createUser({
      email: userAEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Target Host A' }
    });
    userAId = authA.user.id;

    const { data: authB } = await adminClient.auth.admin.createUser({
      email: userBEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Target Host B' }
    });
    userBId = authB.user.id;

    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientA.auth.signInWithPassword({ email: userAEmail, password: testPass });

    clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientB.auth.signInWithPassword({ email: userBEmail, password: testPass });

    const { data: rpcA } = await clientA.rpc('create_tenant_and_owner', { p_company_name: 'Target Tenant A' });
    tenantAId = rpcA.tenant_id;

    const { data: rpcB } = await clientB.rpc('create_tenant_and_owner', { p_company_name: 'Target Tenant B' });
    tenantBId = rpcB.tenant_id;

    const { data: propA } = await clientA.from('properties').insert({
      tenant_id: tenantAId, slug: 'VILLA_TGT_A', name: 'Villa Target A', base_price: 20000
    }).select().single();
    propAId = propA.id;

    const { data: propB } = await clientB.from('properties').insert({
      tenant_id: tenantBId, slug: 'VILLA_TGT_B', name: 'Villa Target B', base_price: 25000
    }).select().single();
    propBId = propB.id;

    recordPass(`Setup complete. Tenant A: ${tenantAId}, Tenant B: ${tenantBId}`);

    // -------------------------------------------------------------
    // TEST 1: Create Portfolio Target (property_id = null)
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Create Portfolio Target ---');
    const { data: portTarget, error: errPort } = await clientA.from('monthly_targets').insert({
      tenant_id: tenantAId,
      property_id: null,
      year: 2026,
      month: 8,
      revenue_target: 350000,
      net_profit_target: 150000,
      occupancy_target: 65.0,
      adr_target: 8500
    }).select().single();

    assert(!errPort && portTarget && portTarget.id, 'Portfolio target must be created');
    assert.strictEqual(portTarget.property_id, null);
    assert.strictEqual(Number(portTarget.revenue_target), 350000);
    recordPass('1. Portfolio target created successfully with property_id = null');

    // -------------------------------------------------------------
    // TEST 2: Create Property-Specific Target
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Create Property Target ---');
    const { data: propTarget, error: errProp } = await clientA.from('monthly_targets').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      year: 2026,
      month: 8,
      revenue_target: 100000,
      net_profit_target: 50000,
      occupancy_target: 70.0,
      adr_target: 9000
    }).select().single();

    assert(!errProp && propTarget && propTarget.id, 'Property target must be created');
    assert.strictEqual(propTarget.property_id, propAId);
    recordPass('2. Property-specific target created successfully linking to property UUID');

    // -------------------------------------------------------------
    // TEST 3: Duplicate Portfolio Target Blocked
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Duplicate Portfolio Target Blocked ---');
    const { error: errDupPort } = await clientA.from('monthly_targets').insert({
      tenant_id: tenantAId,
      property_id: null,
      year: 2026,
      month: 8,
      revenue_target: 400000
    });
    assert(errDupPort, 'Duplicate portfolio target must be rejected by unique index');
    recordPass('3. Duplicate portfolio target blocked by uq_monthly_targets_portfolio unique index');

    // -------------------------------------------------------------
    // TEST 4: Duplicate Property Target Blocked
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Duplicate Property Target Blocked ---');
    const { error: errDupProp } = await clientA.from('monthly_targets').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      year: 2026,
      month: 8,
      revenue_target: 120000
    });
    assert(errDupProp, 'Duplicate property target must be rejected by unique index');
    recordPass('4. Duplicate property target blocked by uq_monthly_targets_property unique index');

    // -------------------------------------------------------------
    // TEST 5: Negative Target Blocked by CHECK Constraint
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Negative Target Blocked by CHECK Constraint ---');
    const { error: errNeg } = await clientA.from('monthly_targets').insert({
      tenant_id: tenantAId,
      year: 2026,
      month: 9,
      revenue_target: -5000 // Negative revenue target
    });
    assert(errNeg && errNeg.code === '23514', 'Negative revenue target must be rejected by CHECK constraint');
    recordPass('5. Negative revenue target blocked by DB CHECK constraint');

    // -------------------------------------------------------------
    // TEST 6: Occupancy Target > 100 Blocked by CHECK Constraint
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Occupancy Target > 100 Blocked ---');
    const { error: errOcc } = await clientA.from('monthly_targets').insert({
      tenant_id: tenantAId,
      year: 2026,
      month: 9,
      occupancy_target: 125.0 // > 100%
    });
    assert(errOcc && errOcc.code === '23514', 'Occupancy > 100% must be rejected by CHECK constraint');
    recordPass('6. Occupancy target > 100% blocked by DB CHECK constraint');

    // -------------------------------------------------------------
    // TEST 7: Cross-Tenant Property Target Blocked by Trigger
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Cross-Tenant Property Target Blocked ---');
    const { error: errCross } = await clientA.from('monthly_targets').insert({
      tenant_id: tenantAId,
      property_id: propBId, // Tenant B property!
      year: 2026,
      month: 8,
      revenue_target: 80000
    });
    assert(errCross && (errCross.code === '42501' || errCross.message.includes('CROSS_TENANT')),
      'Cross-tenant property reference must be blocked by DB trigger');
    recordPass('7. (DB Trigger) Cross-tenant property target rejected by check_target_tenant_isolation');

    // -------------------------------------------------------------
    // TEST 8: Cross-Tenant Isolation via RLS
    // -------------------------------------------------------------
    console.log('\n--- TEST 8: Cross-Tenant Target Isolation ---');
    const { data: bViewTargets, error: errBView } = await clientB
      .from('monthly_targets')
      .select('*')
      .eq('tenant_id', tenantAId);
    assert(!errBView && Array.isArray(bViewTargets) && bViewTargets.length === 0,
      'Tenant B must not be able to read Tenant A targets');
    recordPass('8. (RLS) Tenant B cannot read Tenant A monthly targets');

    // -------------------------------------------------------------
    // TEST 9: Target Update
    // -------------------------------------------------------------
    console.log('\n--- TEST 9: Target Update ---');
    const { data: updatedTarget, error: errUpd } = await clientA
      .from('monthly_targets')
      .update({ revenue_target: 380000, updated_at: new Date().toISOString() })
      .eq('id', portTarget.id)
      .select()
      .single();

    assert(!errUpd && Number(updatedTarget.revenue_target) === 380000);
    recordPass('9. Monthly target updated successfully (revenue_target: ₺380.000)');

    // -------------------------------------------------------------
    // TEST 10: Target Delete
    // -------------------------------------------------------------
    console.log('\n--- TEST 10: Target Delete ---');
    const { error: errDel } = await clientA
      .from('monthly_targets')
      .delete()
      .eq('id', propTarget.id);

    assert(!errDel);
    const { data: checkDeleted } = await clientA.from('monthly_targets').select('id').eq('id', propTarget.id);
    assert(!checkDeleted || checkDeleted.length === 0);
    recordPass('10. Monthly target deleted successfully and removed from DB');

  } finally {
    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    console.log('\n--- CLEANUP ---');
    if (tenantAId) {
      await adminClient.from('monthly_targets').delete().eq('tenant_id', tenantAId);
      await adminClient.from('properties').delete().eq('tenant_id', tenantAId);
      await adminClient.from('tenants').delete().eq('id', tenantAId);
    }
    if (tenantBId) {
      await adminClient.from('monthly_targets').delete().eq('tenant_id', tenantBId);
      await adminClient.from('properties').delete().eq('tenant_id', tenantBId);
      await adminClient.from('tenants').delete().eq('id', tenantBId);
    }
    if (userAId) await adminClient.auth.admin.deleteUser(userAId);
    if (userBId) await adminClient.auth.admin.deleteUser(userBId);
    recordPass('Cleanup finished.');
  }

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runMonthlyTargetTests().catch(err => {
  console.error('\n❌ UNHANDLED EXCEPTION IN MONTHLY TARGETS SUITE:', err);
  process.exit(1);
});
