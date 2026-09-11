// =============================================================================
// LEXBNB PHASE 9 — OPERATIONAL TASKS TEST SUITE
// Tests task CRUD, status transitions, checklist validation, and DB constraints.
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
console.log('📋 LEXBNB PHASE 9 — OPERATIONAL TASKS TEST SUITE');
console.log('=============================================================================');

async function runOperationsTaskTests() {
  const testRunId = Date.now();
  const userAEmail = `task_a_${testRunId}@lexbnb.test`;
  const userBEmail = `task_b_${testRunId}@lexbnb.test`;
  const testPass = 'TaskPassword123!';

  let userAId, userBId, tenantAId, tenantBId, propAId;
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
    console.log('\n--- SETUP: Provisioning Isolated Test Tenants & Properties ---');
    const { data: authA } = await adminClient.auth.admin.createUser({
      email: userAEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Task Host A' }
    });
    userAId = authA.user.id;

    const { data: authB } = await adminClient.auth.admin.createUser({
      email: userBEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Task Host B' }
    });
    userBId = authB.user.id;

    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientA.auth.signInWithPassword({ email: userAEmail, password: testPass });

    clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientB.auth.signInWithPassword({ email: userBEmail, password: testPass });

    const { data: rpcA } = await clientA.rpc('create_tenant_and_owner', { p_company_name: 'Task Tenant A' });
    tenantAId = rpcA.tenant_id;

    const { data: rpcB } = await clientB.rpc('create_tenant_and_owner', { p_company_name: 'Task Tenant B' });
    tenantBId = rpcB.tenant_id;

    const { data: propA } = await clientA.from('properties').insert({
      tenant_id: tenantAId, slug: 'VILLA_TASK_A', name: 'Villa Task A', base_price: 15000
    }).select().single();
    propAId = propA.id;

    recordPass(`Setup complete. Tenant A: ${tenantAId}, Tenant B: ${tenantBId}`);

    // TEST 1: Task Create with Cleaning Subtype
    console.log('\n--- TEST 1: Task Create with Subtype ---');
    const { data: task1, error: err1 } = await clientA.from('operational_tasks').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      task_type: 'CLEANING',
      task_subtype: 'TURNOVER',
      title: 'Çıkış Temizliği',
      priority: 'HIGH',
      priority_score: 70,
      checklist: [
        { id: 'c1', text: 'Nevresim değişimi', completed: false, required: true },
        { id: 'c2', text: 'Banyo dezenfeksiyonu', completed: false, required: true }
      ]
    }).select().single();

    assert(!err1 && task1 && task1.id, 'Task 1 must be created');
    assert.strictEqual(task1.task_type, 'CLEANING');
    assert.strictEqual(task1.task_subtype, 'TURNOVER');
    assert.strictEqual(task1.status, 'TODO');
    recordPass('1. Task created successfully with task_type = CLEANING and task_subtype = TURNOVER');

    // TEST 2: Task Update (Status & Checklist)
    console.log('\n--- TEST 2: Task Update & Checklist Progress ---');
    const updatedChecklist = [
      { id: 'c1', text: 'Nevresim değişimi', completed: true, required: true },
      { id: 'c2', text: 'Banyo dezenfeksiyonu', completed: true, required: true }
    ];

    const { data: taskUpdated, error: errUpd } = await clientA.from('operational_tasks').update({
      status: 'DONE',
      completed_at: new Date().toISOString(),
      completed_by: userAId,
      checklist: updatedChecklist
    }).eq('id', task1.id).select().single();

    assert(!errUpd && taskUpdated && taskUpdated.status === 'DONE');
    assert.strictEqual(taskUpdated.completed_by, userAId);
    recordPass('2. Task updated to DONE with completed checklist');

    // TEST 3: Invalid Status Blocked by Check Constraint
    console.log('\n--- TEST 3: Invalid Status Blocked ---');
    const { error: errInvalidStatus } = await clientA.from('operational_tasks').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      task_type: 'MAINTENANCE',
      title: 'Geçersiz Durum',
      status: 'NOT_A_VALID_STATUS'
    });

    assert(errInvalidStatus && errInvalidStatus.code === '23514', 'Invalid status must be rejected by check constraint');
    recordPass('3. (DB Constraint) Invalid task status rejected by check constraint');

    // TEST 4: Invalid Task Type Blocked by Check Constraint
    console.log('\n--- TEST 4: Invalid Task Type Blocked ---');
    const { error: errInvalidType } = await clientA.from('operational_tasks').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      task_type: 'TURNOVER_CLEANING', // Not in allowed enum! Must be CLEANING with subtype
      title: 'Eski Type Denemesi'
    });

    assert(errInvalidType && errInvalidType.code === '23514', 'Disallowed task_type must be rejected');
    recordPass('4. (DB Constraint) TURNOVER_CLEANING rejected as task_type (enforces CLEANING + subtype)');

    // TEST 5: Task Delete
    console.log('\n--- TEST 5: Task Delete ---');
    const { error: errDel } = await clientA.from('operational_tasks').delete().eq('id', task1.id);
    assert(!errDel, 'Task delete must succeed');

    const { data: checkDeleted } = await clientA.from('operational_tasks').select('id').eq('id', task1.id);
    assert(checkDeleted.length === 0, 'Task must be removed from DB');
    recordPass('5. Task deleted successfully from database');

  } finally {
    console.log('\n--- CLEANUP ---');
    if (tenantAId) {
      await adminClient.from('operational_tasks').delete().eq('tenant_id', tenantAId);
      await adminClient.from('properties').delete().eq('tenant_id', tenantAId);
      await adminClient.from('tenants').delete().eq('id', tenantAId);
    }
    if (tenantBId) {
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

runOperationsTaskTests().catch(err => {
  console.error('\n❌ UNHANDLED EXCEPTION IN OPERATIONAL TASKS SUITE:', err);
  process.exit(1);
});
