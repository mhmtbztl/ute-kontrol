// =============================================================================
// LEXBNB PHASE 9 — MAINTENANCE & FINANCE INTEGRATION TEST SUITE
// Tests ticket lifecycle, severity, atomic resolution with Phase 6 expense creation,
// concurrency protection, and finalized cost immutability.
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
console.log('🔧 LEXBNB PHASE 9 — MAINTENANCE & FINANCE INTEGRATION TEST SUITE');
console.log('=============================================================================');

async function runMaintenanceTests() {
  const testRunId = Date.now();
  const userAEmail = `maint_a_${testRunId}@lexbnb.test`;
  const testPass = 'MaintPassword123!';

  let userAId, tenantAId, propAId;
  let clientA;
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  try {
    // SETUP
    console.log('\n--- SETUP: Provisioning Isolated Test Tenant & Property ---');
    const { data: authA } = await adminClient.auth.admin.createUser({
      email: userAEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Maint Host A' }
    });
    userAId = authA.user.id;

    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientA.auth.signInWithPassword({ email: userAEmail, password: testPass });

    const { data: rpcA } = await clientA.rpc('create_tenant_and_owner', { p_company_name: 'Maint Tenant A' });
    tenantAId = rpcA.tenant_id;

    const { data: propA } = await clientA.from('properties').insert({
      tenant_id: tenantAId, slug: 'VILLA_MAINT_A', name: 'Villa Maint A', base_price: 20000
    }).select().single();
    propAId = propA.id;

    recordPass(`Setup complete. Tenant: ${tenantAId}`);

    // TEST 1: Create Maintenance Ticket with Severity & Impact
    console.log('\n--- TEST 1: Create Maintenance Ticket ---');
    const { data: ticket1, error: err1 } = await clientA.from('maintenance_tickets').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      category: 'Klima',
      severity: 'CRITICAL',
      title: 'Salon kliması gaz kaçırıyor',
      description: 'Misafir salon klimasının soğutmadığını belirtti.',
      booking_impact: true,
      estimated_cost: 3500
    }).select().single();

    assert(!err1 && ticket1 && ticket1.id, 'Ticket 1 must be created');
    assert.strictEqual(ticket1.severity, 'CRITICAL');
    assert.strictEqual(ticket1.booking_impact, true);
    assert.strictEqual(ticket1.status, 'OPEN');
    recordPass('1. Maintenance ticket created with CRITICAL severity and booking_impact = true');

    // TEST 2: Atomic Resolve RPC -> Creates Phase 6 Expense
    console.log('\n--- TEST 2: Atomic Resolve RPC Execution ---');
    const { data: resolveRes, error: errResolve } = await clientA.rpc('resolve_maintenance_ticket_atomic', {
      p_tenant_id: tenantAId,
      p_ticket_id: ticket1.id,
      p_actual_cost: 4200,
      p_category: 'Tadilat',
      p_description: 'Klima kompresör ve gaz dolumu'
    });

    assert(!errResolve && resolveRes && resolveRes.success, 'Atomic resolve must succeed');
    assert.strictEqual(resolveRes.status, 'RESOLVED');
    assert(resolveRes.expense_id, 'Must generate and link expense_id');
    assert.strictEqual(Number(resolveRes.actual_cost), 4200);

    // Verify row was written to public.expenses
    const { data: expenseRow } = await clientA.from('expenses').select('*').eq('id', resolveRes.expense_id).single();
    assert(expenseRow, 'Expense row must exist in public.expenses');
    assert.strictEqual(expenseRow.property_id, propAId);
    assert.strictEqual(Number(expenseRow.amount), 4200);
    assert.strictEqual(expenseRow.category, 'Tadilat');
    recordPass('2. (Correction 13) Atomic resolve creates Phase 6 expense with property attribution');

    // TEST 3: Idempotent Resolve (No duplicate expense)
    console.log('\n--- TEST 3: Idempotent Second Resolve ---');
    const { data: resolveRes2, error: errResolve2 } = await clientA.rpc('resolve_maintenance_ticket_atomic', {
      p_tenant_id: tenantAId,
      p_ticket_id: ticket1.id,
      p_actual_cost: 4200
    });

    assert(!errResolve2 && resolveRes2.already_resolved === true);
    assert.strictEqual(resolveRes2.expense_id, resolveRes.expense_id);

    // Verify still exactly 1 expense row in DB for this ticket
    const { data: expensesList } = await clientA.from('expenses').select('id').eq('property_id', propAId);
    assert.strictEqual(expensesList.length, 1, 'Must still have exactly 1 expense row');
    recordPass('3. Re-resolving ticket is idempotent and generates 0 duplicate expenses');

    // TEST 4: Concurrent Resolve Protection
    console.log('\n--- TEST 4: Concurrent Resolve Protection ---');
    // Create new ticket
    const { data: ticket2 } = await clientA.from('maintenance_tickets').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      category: 'Tesisat',
      severity: 'HIGH',
      title: 'Banyo bataryası damlatıyor'
    }).select().single();

    // Call resolve twice concurrently
    const [c1, c2] = await Promise.allSettled([
      clientA.rpc('resolve_maintenance_ticket_atomic', { p_tenant_id: tenantAId, p_ticket_id: ticket2.id, p_actual_cost: 1500 }),
      clientA.rpc('resolve_maintenance_ticket_atomic', { p_tenant_id: tenantAId, p_ticket_id: ticket2.id, p_actual_cost: 1500 })
    ]);

    assert(c1.status === 'fulfilled' && c2.status === 'fulfilled');
    const { data: ticket2Expenses } = await clientA.from('expenses').select('id').eq('amount', 1500);
    assert.strictEqual(ticket2Expenses.length, 1, 'Exactly one expense must be created during concurrent race');
    recordPass('4. (Correction 13) Two concurrent resolve calls create exactly 1 expense via row locking');

    // TEST 5: Finalized Cost Mutation Blocked by DB Trigger
    console.log('\n--- TEST 5: Finalized Cost Immutability ---');
    const { error: errMutateCost } = await clientA.from('maintenance_tickets').update({
      actual_cost: 9999
    }).eq('id', ticket1.id);

    assert(errMutateCost && (errMutateCost.code === '42501' || errMutateCost.message.includes('FINALIZED_MAINTENANCE_COST_IMMUTABLE')),
      'Mutating actual_cost on resolved ticket must be rejected by trigger');
    recordPass('5. (Correction 14) Direct mutation of actual_cost on resolved ticket blocked by DB trigger');

  } finally {
    console.log('\n--- CLEANUP ---');
    if (tenantAId) {
      await adminClient.from('maintenance_tickets').delete().eq('tenant_id', tenantAId);
      await adminClient.from('expenses').delete().eq('tenant_id', tenantAId);
      await adminClient.from('properties').delete().eq('tenant_id', tenantAId);
      await adminClient.from('tenants').delete().eq('id', tenantAId);
    }
    if (userAId) await adminClient.auth.admin.deleteUser(userAId);
    recordPass('Cleanup finished.');
  }

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runMaintenanceTests().catch(err => {
  console.error('\n❌ UNHANDLED EXCEPTION IN MAINTENANCE SUITE:', err);
  process.exit(1);
});
