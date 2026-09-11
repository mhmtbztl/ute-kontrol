// =============================================================================
// LEXBNB PHASE 9 — OPERATIONS SECURITY & ISOLATION TEST SUITE
// Tests multi-tenant RLS, cross-tenant property/booking/staff assignment blocking,
// and evidence single-parent constraint.
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

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
console.log('🛡️  LEXBNB PHASE 9 — OPERATIONS SECURITY & ISOLATION TEST SUITE');
console.log('=============================================================================');

async function runOperationsSecurityTests() {
  const testRunId = Date.now();
  const userAEmail = `sec_a_${testRunId}@lexbnb.test`;
  const userBEmail = `sec_b_${testRunId}@lexbnb.test`;
  const testPass = 'SecPassword123!';

  let userAId, userBId, tenantAId, tenantBId, propAId, propBId, taskAId;
  let clientA, clientB;
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  try {
    // SETUP
    console.log('\n--- SETUP: Provisioning Two Isolated Tenants ---');
    const { data: authA } = await adminClient.auth.admin.createUser({
      email: userAEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Sec Host A' }
    });
    userAId = authA.user.id;

    const { data: authB } = await adminClient.auth.admin.createUser({
      email: userBEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Sec Host B' }
    });
    userBId = authB.user.id;

    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientA.auth.signInWithPassword({ email: userAEmail, password: testPass });

    clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientB.auth.signInWithPassword({ email: userBEmail, password: testPass });

    const { data: rpcA } = await clientA.rpc('create_tenant_and_owner', { p_company_name: 'Sec Tenant A' });
    tenantAId = rpcA.tenant_id;

    const { data: rpcB } = await clientB.rpc('create_tenant_and_owner', { p_company_name: 'Sec Tenant B' });
    tenantBId = rpcB.tenant_id;

    const { data: propA } = await clientA.from('properties').insert({
      tenant_id: tenantAId, slug: 'VILLA_SEC_A', name: 'Villa Sec A', base_price: 20000
    }).select().single();
    propAId = propA.id;

    const { data: propB } = await clientB.from('properties').insert({
      tenant_id: tenantBId, slug: 'VILLA_SEC_B', name: 'Villa Sec B', base_price: 25000
    }).select().single();
    propBId = propB.id;

    const { data: taskA } = await clientA.from('operational_tasks').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      task_type: 'GENERAL',
      title: 'Tenant A Private Task'
    }).select().single();
    taskAId = taskA.id;

    recordPass(`Setup complete. Tenant A: ${tenantAId}, Tenant B: ${tenantBId}`);

    // TEST 1: Cross-Tenant Task RLS Isolation
    console.log('\n--- TEST 1: Cross-Tenant Task RLS Isolation ---');
    const { data: bTasks, error: errBTasks } = await clientB
      .from('operational_tasks')
      .select('*')
      .eq('tenant_id', tenantAId);

    assert(!errBTasks && Array.isArray(bTasks) && bTasks.length === 0, 'Tenant B must see 0 tasks from Tenant A');
    recordPass('1. (RLS) Tenant B strictly denied from viewing Tenant A operational tasks');

    // TEST 2: Cross-Tenant Property Reference Rejected on Task Insert
    console.log('\n--- TEST 2: Cross-Tenant Property Reference Blocked on Task ---');
    const { error: errCrossPropTask } = await clientA.from('operational_tasks').insert({
      tenant_id: tenantAId,
      property_id: propBId, // Foreign property!
      task_type: 'GENERAL',
      title: 'Cross Property Attack'
    });

    assert(errCrossPropTask && (errCrossPropTask.code === '42501' || errCrossPropTask.message.includes('CROSS_TENANT_PROPERTY_VIOLATION')),
      'Cross-tenant property reference must be rejected by trigger');
    recordPass('2. (DB Trigger) Cross-tenant property reference on task blocked by check_task_tenant_isolation');

    // TEST 3: Cross-Tenant Staff Assignment Blocked
    console.log('\n--- TEST 3: Cross-Tenant Staff Assignment Blocked ---');
    const { error: errCrossStaff } = await clientA.from('operational_tasks').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      assigned_to: userBId, // User B is not a member of Tenant A!
      task_type: 'GENERAL',
      title: 'Cross Staff Attack'
    });

    assert(errCrossStaff && (errCrossStaff.code === '42501' || errCrossStaff.message.includes('CROSS_TENANT_STAFF_VIOLATION')),
      'Cross-tenant staff assignment must be rejected by trigger');
    recordPass('3. (DB Trigger) Assigning task to foreign tenant member blocked by check_task_tenant_isolation');

    // TEST 4: Cross-Tenant Property Reference Blocked on Maintenance Ticket
    console.log('\n--- TEST 4: Cross-Tenant Property on Maintenance Blocked ---');
    const { error: errCrossMaintProp } = await clientA.from('maintenance_tickets').insert({
      tenant_id: tenantAId,
      property_id: propBId, // Foreign property!
      category: 'Elektrik',
      title: 'Cross Maint Attack'
    });

    assert(errCrossMaintProp && (errCrossMaintProp.code === '42501' || errCrossMaintProp.message.includes('CROSS_TENANT_PROPERTY_VIOLATION')),
      'Cross-tenant property on maintenance ticket must be rejected');
    recordPass('4. (DB Trigger) Cross-tenant property on maintenance ticket blocked by check_maintenance_tenant_isolation');

    // TEST 5: Operation Evidence Single Parent Constraint Enforced
    console.log('\n--- TEST 5: Evidence Single Parent Constraint ---');
    // Create a real ticket for Tenant A
    const { data: ticketA } = await clientA.from('maintenance_tickets').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      category: 'Klima',
      title: 'Evidence Test Ticket'
    }).select().single();

    // Try creating evidence with BOTH operational_task_id and maintenance_ticket_id
    const { error: errBothParents } = await clientA.from('operation_evidence').insert({
      tenant_id: tenantAId,
      operational_task_id: taskAId,
      maintenance_ticket_id: ticketA.id,
      evidence_type: 'COMPLETION',
      storage_path: `tenant/${tenantAId}/operations/${taskAId}/evidence.jpg`
    });

    assert(errBothParents && errBothParents.code === '23514', 'Evidence with dual parents must be rejected by CHECK constraint');
    recordPass('5. (Correction 4) chk_evidence_single_parent enforces exclusive task or ticket parentage');

    // TEST 6: Cross-Tenant Evidence Upload Blocked
    console.log('\n--- TEST 6: Cross-Tenant Evidence Blocked ---');
    // Tenant B tries to attach evidence to Tenant A task
    const { error: errCrossEvidence } = await clientB.from('operation_evidence').insert({
      tenant_id: tenantBId,
      operational_task_id: taskAId, // Task belongs to Tenant A!
      evidence_type: 'COMPLETION',
      storage_path: `tenant/${tenantBId}/operations/${taskAId}/hacked.jpg`
    });

    assert(errCrossEvidence && (errCrossEvidence.code === '42501' || errCrossEvidence.message.includes('CROSS_TENANT_EVIDENCE_VIOLATION')),
      'Cross-tenant evidence linkage must be rejected');
    recordPass('6. (Correction 5) Linking evidence to foreign tenant task blocked by check_evidence_tenant_isolation');

  } finally {
    console.log('\n--- CLEANUP ---');
    if (tenantAId) {
      await adminClient.from('operation_evidence').delete().eq('tenant_id', tenantAId);
      await adminClient.from('operational_tasks').delete().eq('tenant_id', tenantAId);
      await adminClient.from('properties').delete().eq('tenant_id', tenantAId);
      await adminClient.from('tenants').delete().eq('id', tenantAId);
    }
    if (tenantBId) {
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

runOperationsSecurityTests().catch(err => {
  console.error('\n❌ UNHANDLED EXCEPTION IN OPERATIONS SECURITY SUITE:', err);
  process.exit(1);
});
