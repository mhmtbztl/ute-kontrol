// =============================================================================
// LEXBNB PHASE 8 — MONTHLY CLOSE & PERIOD PROTECTION TEST SUITE
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
console.log('🔒 LEXBNB PHASE 8 — MONTHLY CLOSE & PERIOD PROTECTION TEST SUITE');
console.log('=============================================================================');

async function runMonthCloseTests() {
  const testRunId = Date.now();
  const userAEmail = `close_a_${testRunId}@lexbnb.test`;
  const userBEmail = `close_b_${testRunId}@lexbnb.test`;
  const testPass = 'CloseTestPassword123!';

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
    // -------------------------------------------------------------
    // SETUP: Create Auth Users & Tenants
    // -------------------------------------------------------------
    console.log('\n--- SETUP: Provisioning Isolated Test Tenants & Properties ---');
    const { data: authA } = await adminClient.auth.admin.createUser({
      email: userAEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Close Host A' }
    });
    userAId = authA.user.id;

    const { data: authB } = await adminClient.auth.admin.createUser({
      email: userBEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Close Host B' }
    });
    userBId = authB.user.id;

    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientA.auth.signInWithPassword({ email: userAEmail, password: testPass });

    clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientB.auth.signInWithPassword({ email: userBEmail, password: testPass });

    const { data: rpcA } = await clientA.rpc('create_tenant_and_owner', { p_company_name: 'Close Tenant A' });
    tenantAId = rpcA.tenant_id;

    const { data: rpcB } = await clientB.rpc('create_tenant_and_owner', { p_company_name: 'Close Tenant B' });
    tenantBId = rpcB.tenant_id;

    const { data: propA } = await clientA.from('properties').insert({
      tenant_id: tenantAId, slug: 'VILLA_CLOSE_A', name: 'Villa Close A', base_price: 20000
    }).select().single();
    propAId = propA.id;

    recordPass(`Setup complete. Tenant A: ${tenantAId}, Tenant B: ${tenantBId}`);

    // -------------------------------------------------------------
    // TEST 1: Initial State (Period is OPEN)
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Initial Period State ---');
    // Period 2026-07 is initially open (no record in monthly_financial_closes)
    const { data: initialClose } = await clientA
      .from('monthly_financial_closes')
      .select('*')
      .eq('tenant_id', tenantAId)
      .eq('year', 2026)
      .eq('month', 7);

    assert(Array.isArray(initialClose) && initialClose.length === 0);
    recordPass('1. Initial period is OPEN with no closing record');

    // Create an initial expense and booking for 2026-07 while open
    const { data: expJuly } = await clientA.from('expenses').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      expense_date: '2026-07-15',
      category: 'Elektrik',
      amount: 4500,
      expense_type: 'OPEX'
    }).select().single();

    const { data: bookJuly } = await clientA.from('bookings').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      booking_code: 'BK-JULY-01',
      guest_name: 'July Guest',
      check_in: '2026-07-10',
      check_out: '2026-07-14',
      gross_amount: 50000
    }).select().single();

    assert(expJuly && bookJuly);

    // -------------------------------------------------------------
    // TEST 2: Atomic Close RPC with Versioned Snapshot
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Atomic Close RPC Execution ---');
    const snapshotPayload = {
      schemaVersion: 1,
      period: '2026-07',
      closedAt: new Date().toISOString(),
      financial: { revenue: 50000, operatingExpenses: 4500, operatingProfit: 45500 },
      operations: { soldNights: 4, availableNights: 31, occupancy: 12.9 },
      targets: { hasTarget: false },
      reconciliation: { bookedRoomRevenue: 50000, recordedFinancialRevenue: 50000, difference: 0 }
    };

    const { data: closeRes, error: errClose } = await clientA.rpc('close_monthly_period_atomic', {
      p_tenant_id: tenantAId,
      p_year: 2026,
      p_month: 7,
      p_snapshot: snapshotPayload
    });

    assert(!errClose && closeRes && closeRes.success, 'Atomic close RPC must succeed');
    assert.strictEqual(closeRes.status, 'CLOSED');
    assert.strictEqual(closeRes.year, 2026);
    assert.strictEqual(closeRes.month, 7);
    recordPass('2. Atomic close_monthly_period_atomic RPC succeeded and saved versioned snapshot');

    // -------------------------------------------------------------
    // TEST 3: Concurrent Close Idempotency
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Concurrent Close Idempotency ---');
    const [c1, c2] = await Promise.allSettled([
      clientA.rpc('close_monthly_period_atomic', { p_tenant_id: tenantAId, p_year: 2026, p_month: 7, p_snapshot: snapshotPayload }),
      clientA.rpc('close_monthly_period_atomic', { p_tenant_id: tenantAId, p_year: 2026, p_month: 7, p_snapshot: snapshotPayload })
    ]);

    assert(c1.status === 'fulfilled' && c2.status === 'fulfilled');
    const { data: countCloses } = await clientA.from('monthly_financial_closes').select('id').eq('tenant_id', tenantAId).eq('year', 2026).eq('month', 7);
    assert.strictEqual(countCloses.length, 1, 'Exactly 1 row must exist for (tenant, year, month)');
    recordPass('3. Concurrent close attempts handled idempotently without duplicate rows');

    // -------------------------------------------------------------
    // TEST 4: Closed Period Protection Trigger on Expenses
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Closed Period Protection Trigger on Expenses ---');
    // Attempt to insert an expense in CLOSED July 2026
    const { error: errClosedExp } = await clientA.from('expenses').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      expense_date: '2026-07-20',
      category: 'Tadilat',
      amount: 10000,
      expense_type: 'OPEX'
    });

    assert(errClosedExp && (errClosedExp.code === '42501' || errClosedExp.message.includes('CLOSED_PERIOD_VIOLATION')),
      'Inserting expense into a closed month must be rejected by DB trigger');
    recordPass('4. (DB Trigger) Expense creation in closed month blocked by guard_expense_closed_period');

    // Attempt to delete an expense in CLOSED July 2026
    const { error: errDelClosedExp } = await clientA.from('expenses').delete().eq('id', expJuly.id);
    assert(errDelClosedExp && (errDelClosedExp.code === '42501' || errDelClosedExp.message.includes('CLOSED_PERIOD_VIOLATION')),
      'Deleting expense in a closed month must be rejected by DB trigger');
    recordPass('5. (DB Trigger) Expense deletion in closed month blocked by guard_expense_closed_period');

    // -------------------------------------------------------------
    // TEST 5: Closed Period Protection Trigger on Bookings (KPI Mutations)
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Closed Period Protection Trigger on Bookings ---');
    // Attempt to create a booking in CLOSED July 2026
    const { error: errClosedBook } = await clientA.from('bookings').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      booking_code: 'BK-JULY-ILLEGAL',
      guest_name: 'Illegal Guest',
      check_in: '2026-07-20',
      check_out: '2026-07-24',
      gross_amount: 40000
    });

    assert(errClosedBook && (errClosedBook.code === '42501' || errClosedBook.message.includes('CLOSED_PERIOD_VIOLATION')),
      'Creating booking in a closed month must be rejected by DB trigger');
    recordPass('6. (DB Trigger) Booking creation in closed month blocked by guard_booking_closed_period');

    // Attempt to modify dates/price of booking in CLOSED July 2026
    const { error: errUpdClosedBook } = await clientA.from('bookings').update({
      gross_amount: 80000
    }).eq('id', bookJuly.id);

    assert(errUpdClosedBook && (errUpdClosedBook.code === '42501' || errUpdClosedBook.message.includes('CLOSED_PERIOD_VIOLATION')),
      'Modifying price/dates in a closed month must be rejected by DB trigger');
    recordPass('7. (DB Trigger) Booking financial/dates modification in closed month blocked');

    // -------------------------------------------------------------
    // TEST 6: Allowed Non-KPI Update on Booking (e.g. Notes only)
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Allowed Non-KPI Update on Booking ---');
    const { data: updatedNoteBook, error: errNote } = await clientA.from('bookings').update({
      notes: 'İç not: Kapanış sonrası misafir faturası yollandı.'
    }).eq('id', bookJuly.id).select().single();

    assert(!errNote && updatedNoteBook && updatedNoteBook.notes.includes('Kapanış sonrası'));
    recordPass('8. Updating non-KPI fields (notes) permitted during closed period');

    // -------------------------------------------------------------
    // TEST 7: Cross-Tenant Close Isolation
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Cross-Tenant Close Isolation ---');
    const { data: bCloses, error: errBCloses } = await clientB
      .from('monthly_financial_closes')
      .select('*')
      .eq('tenant_id', tenantAId);

    assert(!errBCloses && Array.isArray(bCloses) && bCloses.length === 0,
      'Tenant B cannot view Tenant A closing records');
    recordPass('9. (RLS) Tenant B cannot view Tenant A closing records');

  } finally {
    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    console.log('\n--- CLEANUP ---');
    if (tenantAId) {
      await adminClient.from('monthly_financial_closes').delete().eq('tenant_id', tenantAId);
      await adminClient.from('expenses').delete().eq('tenant_id', tenantAId);
      await adminClient.from('bookings').delete().eq('tenant_id', tenantAId);
      await adminClient.from('properties').delete().eq('tenant_id', tenantAId);
      await adminClient.from('tenants').delete().eq('id', tenantAId);
    }
    if (tenantBId) {
      await adminClient.from('monthly_financial_closes').delete().eq('tenant_id', tenantBId);
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

runMonthCloseTests().catch(err => {
  console.error('\n❌ UNHANDLED EXCEPTION IN MONTH CLOSE SUITE:', err);
  process.exit(1);
});
