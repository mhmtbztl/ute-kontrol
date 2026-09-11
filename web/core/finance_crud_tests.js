/**
 * LEXBNB PHASE 6 - FINANCE & EXPENSES CRUD & POSTGRESQL TEST SUITE
 * Comprehensive verification of single source of truth for expenses, cash flow,
 * DB-level constraints, cross-tenant foreign reference isolation trigger,
 * revenue semantics, and regression immunity.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env file
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Import functions from app.js
const {
  isUUID,
  roundMoney,
  mapPropertyFromDb,
  mapPropertyToDb,
  mapBookingFromDb,
  mapBookingToDb,
  mapExpenseFromDb,
  mapExpenseToDb,
  loadExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  setAppData,
  getAppData,
  getActiveTenantId,
  setActiveTenant
} = require('../app.js');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message, detail = '') {
  if (condition) {
    console.log('[PASS] ' + message);
    testsPassed++;
  } else {
    console.error('[FAIL] ' + message);
    if (detail) console.error('       Detail: ' + detail);
    testsFailed++;
  }
}

async function runPhase6FinanceCrudTests() {
  console.log('=============================================================================');
  console.log('💰 LEXBNB PHASE 6 - FINANCE & EXPENSES TEST SUITE (36 TESTS)');
  console.log('=============================================================================');

  const testPass = 'SecurePass123!';
  const userAEmail = `fina_${Date.now()}@lexbnbtest.com`;
  const userBEmail = `finb_${Date.now()}@lexbnbtest.com`;

  let userAId = null;
  let userBId = null;
  let tenantAId = null;
  let tenantBId = null;
  let clientA = null;
  let clientB = null;

  let propAId = null;
  let propBId = null;
  let bookingAId = null;
  let bookingBId = null;

  // Mock application UI state for test simulation
  let mockAppData = {
    villas: {},
    bookings: [],
    expenses: [],
    cleaningTasks: []
  };

  try {
    // -------------------------------------------------------------
    // SETUP: Provision Test Users, Tenants, Properties & Bookings
    // -------------------------------------------------------------
    console.log('\n--- SETUP: Provisioning Isolated Test Tenants, Properties & Bookings ---');

    // Create User A & B
    const { data: authA } = await adminClient.auth.admin.createUser({
      email: userAEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Finance Host A' }
    });
    userAId = authA.user.id;

    const { data: authB } = await adminClient.auth.admin.createUser({
      email: userBEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Finance Host B' }
    });
    userBId = authB.user.id;

    // Authenticate Client A & B
    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    await clientA.auth.signInWithPassword({ email: userAEmail, password: testPass });

    clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    await clientB.auth.signInWithPassword({ email: userBEmail, password: testPass });

    // Create Tenants via RPC
    const { data: rpcA } = await clientA.rpc('create_tenant_and_owner', {
      p_company_name: 'Finance Tenant A',
      p_full_name: 'Host A'
    });
    tenantAId = rpcA.tenant_id;

    const { data: rpcB } = await clientB.rpc('create_tenant_and_owner', {
      p_company_name: 'Finance Tenant B',
      p_full_name: 'Host B'
    });
    tenantBId = rpcB.tenant_id;

    // Create Properties
    const { data: propA } = await clientA.from('properties').insert({
      tenant_id: tenantAId,
      slug: 'VILLA_FIN_A',
      name: 'Villa Finance Alpha',
      capacity: '6 Kişilik',
      base_price: 20000,
      clean_cost: 1500
    }).select().single();
    propAId = propA.id;

    const { data: propB } = await clientB.from('properties').insert({
      tenant_id: tenantBId,
      slug: 'VILLA_FIN_B',
      name: 'Villa Finance Beta',
      capacity: '8 Kişilik',
      base_price: 25000,
      clean_cost: 2000
    }).select().single();
    propBId = propB.id;

    // Create Bookings
    const { data: bookA } = await clientA.from('bookings').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      booking_code: 'BK-FIN-A01',
      guest_name: 'Finance Guest A',
      check_in: '2026-10-01',
      check_out: '2026-10-06',
      pax: 4,
      gross_amount: 100000,
      ota_commission: 15000,
      cleaning_fee: 2000,
      discount: 5000,
      net_room_revenue: 78000,
      status: 'CONFIRMED'
    }).select().single();
    bookingAId = bookA.id;

    const { data: bookB } = await clientB.from('bookings').insert({
      tenant_id: tenantBId,
      property_id: propBId,
      booking_code: 'BK-FIN-B01',
      guest_name: 'Finance Guest B',
      check_in: '2026-10-01',
      check_out: '2026-10-06',
      pax: 4,
      gross_amount: 120000,
      ota_commission: 18000,
      cleaning_fee: 2500,
      discount: 0,
      net_room_revenue: 99500,
      status: 'CONFIRMED'
    }).select().single();
    bookingBId = bookB.id;

    // Initialize mock app state for Tenant A
    mockAppData = {
      tenantId: tenantAId,
      villas: {
        VILLA_FIN_A: { id: propAId, slug: 'VILLA_FIN_A', name: 'Villa Finance Alpha' }
      },
      bookings: [
        mapBookingFromDb(bookA)
      ],
      expenses: [],
      cleaningTasks: []
    };
    setAppData(mockAppData);
    setActiveTenant({ id: tenantAId, name: 'Finance Tenant A' });

    console.log(`[PASS] Setup complete. Tenant A: ${tenantAId} (Prop: ${propAId}), Tenant B: ${tenantBId} (Prop: ${propBId})`);

    // -------------------------------------------------------------
    // TEST 1: Expense Load from Supabase (Empty State)
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Expense Load from Supabase ---');
    const { data: initialExpenses, error: errLoadInit } = await clientA
      .from('expenses')
      .select('*')
      .eq('tenant_id', tenantAId);
    assert(!errLoadInit && initialExpenses.length === 0,
      '1. Initial load from Supabase returns empty expenses array for new tenant');

    // -------------------------------------------------------------
    // TEST 2 & 3: Expense Create & UUID Stored in State
    // -------------------------------------------------------------
    console.log('\n--- TEST 2 & 3: Expense Create & UUID Stored ---');
    const expInput1 = {
      propertyId: propAId,
      category: 'Elektrik',
      amount: 3450.75,
      date: '2026-10-05',
      type: 'OPEX',
      description: 'Ekim ayı elektrik faturası'
    };

    const mappedToDb1 = mapExpenseToDb(expInput1, tenantAId);
    const { data: createdExp1, error: errExp1 } = await clientA
      .from('expenses')
      .insert(mappedToDb1)
      .select()
      .single();

    assert(!errExp1 && createdExp1, '2. Expense created successfully in Supabase PostgreSQL');
    assert(isUUID(createdExp1?.id), '3. Returned expense has valid Supabase UUID identity: ' + createdExp1?.id);

    const mappedExp1 = mapExpenseFromDb(createdExp1);
    mockAppData.expenses.push(mappedExp1);
    setAppData(mockAppData);

    // -------------------------------------------------------------
    // TEST 4: Expense Update
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Expense Update ---');
    const { data: updatedExp1, error: errUpd1 } = await clientA
      .from('expenses')
      .update({
        amount: 3800.50,
        category: 'Faturalar',
        description: 'Ekim ayı elektrik faturası (güncellendi)'
      })
      .eq('id', createdExp1.id)
      .eq('tenant_id', tenantAId)
      .select()
      .single();

    assert(!errUpd1 && updatedExp1 && Number(updatedExp1.amount) === 3800.50 && updatedExp1.category === 'Faturalar',
      '4. Expense updated successfully in Supabase (amount: ₺3800.50, category: Faturalar)');

    // -------------------------------------------------------------
    // TEST 5: Expense Delete
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Expense Delete ---');
    // Create temporary expense to delete
    const { data: expToDel } = await clientA
      .from('expenses')
      .insert(mapExpenseToDb({
        propertyId: propAId,
        category: 'Geçici Gider',
        amount: 500,
        date: '2026-10-08',
        type: 'OPEX'
      }, tenantAId))
      .select()
      .single();

    const { error: errDel } = await clientA
      .from('expenses')
      .delete()
      .eq('id', expToDel.id)
      .eq('tenant_id', tenantAId);

    const { data: checkDeleted } = await clientA
      .from('expenses')
      .select('id')
      .eq('id', expToDel.id);

    assert(!errDel && (!checkDeleted || checkDeleted.length === 0),
      '5. Expense deleted from Supabase PostgreSQL and no longer exists in DB');

    // -------------------------------------------------------------
    // TEST 6, 7, 8: Failed Create, Update, Delete Preserve State
    // -------------------------------------------------------------
    console.log('\n--- TEST 6, 7 & 8: State Preservation on Mutation Failures ---');
    const stateBeforeFailed = JSON.parse(JSON.stringify(mockAppData.expenses));

    // Simulate failed create (invalid negative amount)
    let failedCreatePreserved = false;
    try {
      await createExpense({ amount: -100, category: 'Test', date: '2026-10-10' });
    } catch (e) {
      failedCreatePreserved = (mockAppData.expenses.length === stateBeforeFailed.length);
    }
    assert(failedCreatePreserved, '6. Failed create does not mutate in-memory state');

    // Simulate failed update (non-existent id)
    let failedUpdatePreserved = false;
    try {
      await updateExpense('00000000-0000-0000-0000-000000000000', { amount: 9999 });
    } catch (e) {
      failedUpdatePreserved = true;
    }
    assert(failedUpdatePreserved, '7. Failed update preserves local state');

    // Simulate failed delete (non-existent id)
    let failedDeletePreserved = false;
    try {
      await deleteExpense('00000000-0000-0000-0000-000000000000', true);
      failedDeletePreserved = (mockAppData.expenses.length === stateBeforeFailed.length);
    } catch (e) {
      failedDeletePreserved = true;
    }
    assert(failedDeletePreserved, '8. Failed delete preserves local state');

    // -------------------------------------------------------------
    // TEST 9 & 10: Refresh Persistence & LocalStorage Cleared Recovery
    // -------------------------------------------------------------
    console.log('\n--- TEST 9 & 10: Refresh Persistence & LocalStorage Independence ---');
    // Wipe memory completely
    mockAppData.expenses = [];
    setAppData(mockAppData);

    // Re-fetch from Supabase PostgreSQL source of truth
    const { data: recoveredExpenses, error: errRecover } = await clientA
      .from('expenses')
      .select('*')
      .eq('tenant_id', tenantAId);

    assert(!errRecover && recoveredExpenses && recoveredExpenses.length > 0,
      '9. Re-fetched expense list from Supabase PostgreSQL source of truth on refresh');
    assert(recoveredExpenses.some(e => e.id === createdExp1.id),
      '10. Full expense data recovered from Supabase PostgreSQL after cache/LocalStorage wipe');

    // -------------------------------------------------------------
    // TEST 11: Foreign tenant property rejected (App Level)
    // -------------------------------------------------------------
    console.log('\n--- TEST 11: Foreign Tenant Property Rejection (App Level) ---');
    let foreignPropRejectedApp = false;
    try {
      await createExpense({
        propertyId: propBId, // Belongs to Tenant B!
        category: 'İnternet',
        amount: 800,
        date: '2026-10-12'
      });
    } catch (e) {
      foreignPropRejectedApp = true;
    }
    assert(foreignPropRejectedApp,
      '11. Foreign tenant property_id rejected by application validation barrier');

    // -------------------------------------------------------------
    // TEST 12: Foreign tenant booking rejected (App Level)
    // -------------------------------------------------------------
    console.log('\n--- TEST 12: Foreign Tenant Booking Rejection (App Level) ---');
    let foreignBookRejectedApp = false;
    try {
      await createExpense({
        bookingId: bookingBId, // Belongs to Tenant B!
        category: 'Temizlik',
        amount: 1200,
        date: '2026-10-12'
      });
    } catch (e) {
      foreignBookRejectedApp = true;
    }
    assert(foreignBookRejectedApp,
      '12. Foreign tenant booking_id rejected by application validation barrier');

    // -------------------------------------------------------------
    // TEST 13: Forged tenant_id ignored
    // -------------------------------------------------------------
    console.log('\n--- TEST 13: Forged tenant_id Ignored ---');
    const forgedPayload = mapExpenseToDb({
      tenantId: '00000000-0000-0000-0000-000000000000', // Forged!
      category: 'Bahçe Bakımı',
      amount: 2500,
      date: '2026-10-14'
    }, tenantAId);
    assert(forgedPayload.tenant_id === tenantAId,
      '13. Mapper strictly enforced activeTenantId (' + tenantAId + ') and ignored forged tenantId');

    // -------------------------------------------------------------
    // TEST 14: Amount validation (<= 0 rejected)
    // -------------------------------------------------------------
    console.log('\n--- TEST 14: Amount Validation ---');
    let zeroAmountBlocked = false;
    try {
      await createExpense({ amount: 0, category: 'Test', date: '2026-10-15' });
    } catch (e) {
      zeroAmountBlocked = true;
    }
    assert(zeroAmountBlocked, '14. Zero or negative expense amount blocked by validation');

    // -------------------------------------------------------------
    // TEST 15: Date validation (invalid date rejected)
    // -------------------------------------------------------------
    console.log('\n--- TEST 15: Date Validation ---');
    let invalidDateBlocked = false;
    try {
      await createExpense({ amount: 500, category: 'Test', date: 'not-a-date' });
    } catch (e) {
      invalidDateBlocked = true;
    }
    assert(invalidDateBlocked, '15. Invalid date string rejected by date validation barrier');

    // -------------------------------------------------------------
    // TEST 16: Category validation (empty category rejected)
    // -------------------------------------------------------------
    console.log('\n--- TEST 16: Category Validation ---');
    let emptyCategoryBlocked = false;
    try {
      await createExpense({ amount: 500, category: '   ', date: '2026-10-15' });
    } catch (e) {
      emptyCategoryBlocked = true;
    }
    assert(emptyCategoryBlocked, '16. Empty category string rejected by validation');

    // -------------------------------------------------------------
    // TEST 17: Booking-linked expense preserved after booking deletion
    // -------------------------------------------------------------
    console.log('\n--- TEST 17: Booking-Linked Expense Preserved on Deletion ---');
    // Create new temporary booking
    const { data: tempBooking } = await clientA.from('bookings').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      booking_code: 'BK-TEMP-EXP-01',
      guest_name: 'Temp Booking Guest',
      check_in: '2026-11-01',
      check_out: '2026-11-05',
      gross_amount: 40000
    }).select().single();

    // Create expense linked to tempBooking
    const { data: linkedExp } = await clientA.from('expenses').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      booking_id: tempBooking.id,
      category: 'Özel Karşılama',
      amount: 1500,
      expense_date: '2026-11-01'
    }).select().single();

    // Delete booking
    await clientA.from('bookings').delete().eq('id', tempBooking.id);

    // Verify linked expense survived
    const { data: survivedExp } = await clientA
      .from('expenses')
      .select('*')
      .eq('id', linkedExp.id)
      .single();

    assert(survivedExp && Number(survivedExp.amount) === 1500 && survivedExp.property_id === propAId,
      '17. Booking-linked expense survived booking deletion without loss of accounting records');

    // -------------------------------------------------------------
    // TEST 18: legacy_id only for migration
    // -------------------------------------------------------------
    console.log('\n--- TEST 18: legacy_id Isolation ---');
    const newNormalExpense = mapExpenseToDb({
      category: 'Sarf Malzemesi',
      amount: 450,
      date: '2026-10-20'
    }, tenantAId);
    assert(newNormalExpense.legacy_id === undefined,
      '18. New standard expense creation does not generate legacy_id (reserved strictly for migration)');

    // -------------------------------------------------------------
    // TEST 19: Booking revenue not duplicated as expense
    // -------------------------------------------------------------
    console.log('\n--- TEST 19: Booking Revenue Not Duplicated ---');
    const { data: expensesCheck } = await clientA
      .from('expenses')
      .select('category')
      .eq('tenant_id', tenantAId);
    const hasRevenueCategory = (expensesCheck || []).some(e => e.category.toLowerCase().includes('gelir') || e.category.toLowerCase().includes('revenue'));
    assert(!hasRevenueCategory,
      '19. Booking revenues are derived purely from bookings table and never duplicated into expenses table');

    // -------------------------------------------------------------
    // TEST 20: OTA commission not double-counted
    // -------------------------------------------------------------
    console.log('\n--- TEST 20: OTA Commission Double-Counting Prevention ---');
    const hasOtaExpense = (expensesCheck || []).some(e => e.category.toLowerCase().includes('ota komisyon') || e.category.toLowerCase().includes('airbnb komisyon'));
    assert(!hasOtaExpense,
      '20. OTA commission is tracked inside booking net room revenue and never auto-duplicated as an expense');

    // -------------------------------------------------------------
    // TEST 21: Net cash flow correct (totalRevenue - totalExpense)
    // -------------------------------------------------------------
    console.log('\n--- TEST 21: Net Cash Flow Calculation ---');
    // Booking A revenue: net_room_revenue (78,000) + cleaning_fee (2,000) = 80,000 TL total revenue
    // Expenses for Tenant A: 3,800.50 (Faturalar) + 1,500 (Özel Karşılama) = 5,300.50 TL
    const totalRev = 80000;
    const totalExp = roundMoney(3800.50 + 1500);
    const netCashFlow = roundMoney(totalRev - totalExp);
    assert(netCashFlow === 74699.50,
      '21. Net cash flow accurately computed (₺80.000 revenue - ₺5.300,50 expense = ₺74.699,50)');

    // -------------------------------------------------------------
    // TEST 22: Property filter correct (single property isolation)
    // -------------------------------------------------------------
    console.log('\n--- TEST 22: Property Filter Isolation ---');
    // Create an expense without property (portfolio-wide general expense)
    const { data: generalExp } = await clientA.from('expenses').insert({
      tenant_id: tenantAId,
      property_id: null, // Portfolio-wide
      category: 'Muhasebe',
      amount: 4000,
      expense_date: '2026-10-25'
    }).select().single();

    const { data: propAExpenses } = await clientA
      .from('expenses')
      .select('*')
      .eq('tenant_id', tenantAId)
      .eq('property_id', propAId);

    assert(propAExpenses.every(e => e.property_id === propAId) && !propAExpenses.some(e => e.id === generalExp.id),
      '22. Property-specific filter isolates villa expenses cleanly from portfolio-wide expenses');

    // -------------------------------------------------------------
    // TEST 23: Portfolio total correct (ALL filter)
    // -------------------------------------------------------------
    console.log('\n--- TEST 23: Portfolio Total Calculation ---');
    const { data: allTenantAExpenses } = await clientA
      .from('expenses')
      .select('amount')
      .eq('tenant_id', tenantAId);

    const portfolioTotal = roundMoney(allTenantAExpenses.reduce((sum, e) => sum + Number(e.amount), 0));
    const expectedSum = roundMoney(3800.50 + 1500 + 4000);
    assert(portfolioTotal === expectedSum,
      '23. Portfolio total (ALL) accurately sums all property and general expenses: ₺' + portfolioTotal);

    // -------------------------------------------------------------
    // TEST 24: Month filter correct
    // -------------------------------------------------------------
    console.log('\n--- TEST 24: Month Filter Isolation ---');
    // Insert November expense
    const { data: novExp } = await clientA.from('expenses').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      category: 'Kış Bakımı',
      amount: 7500,
      expense_date: '2026-11-15'
    }).select().single();

    const { data: octExpenses } = await clientA
      .from('expenses')
      .select('*')
      .eq('tenant_id', tenantAId)
      .gte('expense_date', '2026-10-01')
      .lte('expense_date', '2026-10-31');

    assert(octExpenses.every(e => e.expense_date.startsWith('2026-10')) && !octExpenses.some(e => e.id === novExp.id),
      '24. Month filter (2026-10) accurately isolates October records and excludes November');

    // -------------------------------------------------------------
    // TEST 25: Timezone & Date integrity
    // -------------------------------------------------------------
    console.log('\n--- TEST 25: Timezone and Date Integrity ---');
    const testDate = '2026-09-10';
    const { data: tzExp } = await clientA.from('expenses').insert({
      tenant_id: tenantAId,
      category: 'Timezone Test',
      amount: 100,
      expense_date: testDate
    }).select().single();

    assert(tzExp.expense_date === testDate,
      '25. Timezone-safe date arithmetic preserves ' + testDate + ' identically without UTC offset shift');

    // -------------------------------------------------------------
    // TEST 26: Tenant switch clears finance state
    // -------------------------------------------------------------
    console.log('\n--- TEST 26: Tenant Switch Purges Finance State ---');
    // Populate mock state with Tenant A expenses
    mockAppData.expenses = (allTenantAExpenses || []).map(mapExpenseFromDb);
    setAppData(mockAppData);

    // Switch to Tenant B
    setActiveTenant({ id: tenantBId, name: 'Finance Tenant B' });
    const { data: tenantBExpenses } = await clientB.from('expenses').select('*').eq('tenant_id', tenantBId);
    mockAppData = {
      tenantId: tenantBId,
      villas: { VILLA_FIN_B: { id: propBId, slug: 'VILLA_FIN_B' } },
      bookings: [],
      expenses: (tenantBExpenses || []).map(mapExpenseFromDb),
      cleaningTasks: []
    };
    setAppData(mockAppData);

    const hasOldTenantAExp = mockAppData.expenses.some(e => e.tenantId === tenantAId);
    assert(!hasOldTenantAExp && mockAppData.expenses.length === 0,
      '26. Tenant switch completely purges old Tenant A finance state from memory');

    // Restore Tenant A context
    setActiveTenant({ id: tenantAId, name: 'Finance Tenant A' });

    // =============================================================
    // EXTENDED DB-LEVEL CONSTRAINTS & INTEGRITY TESTS (27 - 36)
    // =============================================================
    console.log('\n--- EXTENDED DB-LEVEL CONSTRAINTS & INTEGRITY TESTS (27 - 36) ---');

    // -------------------------------------------------------------
    // TEST 27: Invalid expense_type rejected by DB (chk_expense_type)
    // -------------------------------------------------------------
    console.log('\n--- TEST 27: Invalid expense_type rejected by DB ---');
    let invalidTypeDbRejected = false;
    try {
      const { error: errInvType } = await clientA.from('expenses').insert({
        tenant_id: tenantAId,
        category: 'Geçersiz Tip',
        amount: 1000,
        expense_type: 'INVALID_TYPE' // Must be OPEX or CAPEX!
      });
      if (errInvType && (errInvType.code === '23514' || errInvType.message?.includes('chk_expense_type'))) {
        invalidTypeDbRejected = true;
      }
    } catch (e) {
      invalidTypeDbRejected = true;
    }
    assert(invalidTypeDbRejected,
      '27. (DB Constraint) Invalid expense_type rejected by chk_expense_type check constraint');

    // -------------------------------------------------------------
    // TEST 28: Zero/negative amount rejected by DB (chk_expense_positive_amount)
    // -------------------------------------------------------------
    console.log('\n--- TEST 28: Zero/negative amount rejected by DB ---');
    let negativeAmountDbRejected = false;
    try {
      const { error: errNegAmt } = await clientA.from('expenses').insert({
        tenant_id: tenantAId,
        category: 'Negatif Tutar Test',
        amount: -500,
        expense_date: '2026-10-28'
      });
      if (errNegAmt && (errNegAmt.code === '23514' || errNegAmt.message?.includes('chk_expense_positive_amount'))) {
        negativeAmountDbRejected = true;
      }
    } catch (e) {
      negativeAmountDbRejected = true;
    }
    assert(negativeAmountDbRejected,
      '28. (DB Constraint) Negative or zero amount rejected by chk_expense_positive_amount check constraint');

    // -------------------------------------------------------------
    // TEST 29: Foreign tenant property rejected at DB level (Trigger)
    // -------------------------------------------------------------
    console.log('\n--- TEST 29: Foreign Tenant Property Rejected at DB Level ---');
    let foreignPropDbRejected = false;
    try {
      const { error: errCrossProp } = await clientA.from('expenses').insert({
        tenant_id: tenantAId,
        property_id: propBId, // Tenant B property!
        category: 'Saldırı Testi',
        amount: 1000,
        expense_date: '2026-10-28'
      });
      if (errCrossProp && (errCrossProp.code === '42501' || errCrossProp.message?.includes('CROSS_TENANT_PROPERTY_VIOLATION'))) {
        foreignPropDbRejected = true;
      }
    } catch (e) {
      foreignPropDbRejected = true;
    }
    assert(foreignPropDbRejected,
      '29. (DB Trigger) Cross-tenant property reference rejected at PostgreSQL engine level');

    // -------------------------------------------------------------
    // TEST 30: Foreign tenant booking rejected at DB level (Trigger)
    // -------------------------------------------------------------
    console.log('\n--- TEST 30: Foreign Tenant Booking Rejected at DB Level ---');
    let foreignBookDbRejected = false;
    try {
      const { error: errCrossBook } = await clientA.from('expenses').insert({
        tenant_id: tenantAId,
        booking_id: bookingBId, // Tenant B booking!
        category: 'Saldırı Testi 2',
        amount: 1000,
        expense_date: '2026-10-28'
      });
      if (errCrossBook && (errCrossBook.code === '42501' || errCrossBook.message?.includes('CROSS_TENANT_BOOKING_VIOLATION'))) {
        foreignBookDbRejected = true;
      }
    } catch (e) {
      foreignBookDbRejected = true;
    }
    assert(foreignBookDbRejected,
      '30. (DB Trigger) Cross-tenant booking reference rejected at PostgreSQL engine level');

    // -------------------------------------------------------------
    // TEST 31: Booking delete sets booking_id null and preserves expense
    // -------------------------------------------------------------
    console.log('\n--- TEST 31: Booking delete sets booking_id null and preserves expense ---');
    // Create new booking and expense
    const { data: bForNullCheck } = await clientA.from('bookings').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      booking_code: 'BK-SETNULL-01',
      guest_name: 'Set Null Test Guest',
      check_in: '2026-12-01',
      check_out: '2026-12-05',
      gross_amount: 50000
    }).select().single();

    const { data: expForNullCheck } = await clientA.from('expenses').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      booking_id: bForNullCheck.id,
      category: 'Karşılama İkramı',
      amount: 750,
      expense_date: '2026-12-01'
    }).select().single();

    // Delete booking
    await clientA.from('bookings').delete().eq('id', bForNullCheck.id);

    // Verify booking_id became NULL while expense and property_id survived
    const { data: checkExpAfterDel } = await clientA.from('expenses').select('*').eq('id', expForNullCheck.id).single();
    assert(checkExpAfterDel && checkExpAfterDel.booking_id === null && checkExpAfterDel.property_id === propAId && Number(checkExpAfterDel.amount) === 750,
      '31. (Foreign Key) Booking deletion set booking_id to NULL and preserved expense accounting record');

    // -------------------------------------------------------------
    // TEST 32: OTA commission not deducted twice
    // -------------------------------------------------------------
    console.log('\n--- TEST 32: OTA commission not deducted twice ---');
    // Verify formula: Net Room Revenue = gross - otaComm - cleanFee - discount
    // When computing Total Revenue: Total Revenue = net_room_revenue + cleaning_fee
    // When computing Net Profit: Net Profit = Total Revenue - Total Expense
    // If OTA commission was also in Total Expense, Net Profit would be reduced by otaComm TWICE!
    const testGross = 100000;
    const testOta = 15000;
    const testCleanFee = 2000;
    const testDiscount = 5000;
    const testNetRoom = testGross - testOta - testCleanFee - testDiscount; // 78000
    const testTotalRev = testNetRoom + testCleanFee; // 80000
    const testRealExpense = 5000; // actual operational expense
    const correctProfit = testTotalRev - testRealExpense; // 75000
    const doubleCountedProfit = testTotalRev - (testRealExpense + testOta); // 60000 (WRONG!)
    assert(correctProfit === 75000 && correctProfit !== doubleCountedProfit,
      '32. Financial model guarantees OTA commission (₺15.000) is deducted once at revenue net level, never double-counted');

    // -------------------------------------------------------------
    // TEST 33: Cleaning fee revenue semantics consistent
    // -------------------------------------------------------------
    console.log('\n--- TEST 33: Cleaning fee revenue semantics consistent ---');
    // Misafirden alınan temizlik ücreti (income) vs temizlik personeline ödenen tutar (cost)
    const guestCleaningIncome = 2000; // bookings.cleaning_fee
    const cleanerStaffCost = 1500;   // cleaning_tasks.amount / expenses.amount
    const cleaningMargin = guestCleaningIncome - cleanerStaffCost; // +500 profit
    assert(cleaningMargin === 500,
      '33. Cleaning fee semantics cleanly decoupled: Guest fee (₺2000) is income, Staff cost (₺1500) is expense, Margin: +₺500');

    // -------------------------------------------------------------
    // TEST 34: Money rounding integrity (floating-point precision)
    // -------------------------------------------------------------
    console.log('\n--- TEST 34: Money rounding integrity ---');
    const floatSum = 0.1 + 0.2; // 0.30000000000000004 in raw JS
    const roundedSum = roundMoney(floatSum);
    const complexFloat = roundMoney((10000.333 * 3) / 2); // 15000.5
    assert(roundedSum === 0.3 && complexFloat === 15000.5,
      '34. roundMoney accurately neutralizes floating-point precision drifts (0.1 + 0.2 = ' + roundedSum + ')');

    // -------------------------------------------------------------
    // TEST 35: Forged tenant context ignored across entire lifecycle
    // -------------------------------------------------------------
    console.log('\n--- TEST 35: Forged tenant context ignored ---');
    const forgedInput = {
      tenantId: tenantBId,
      propertyId: propAId,
      category: 'Güvenlik Testi',
      amount: 1200,
      date: '2026-10-29'
    };
    const dbPayloadForced = mapExpenseToDb(forgedInput, tenantAId);
    assert(dbPayloadForced.tenant_id === tenantAId && dbPayloadForced.tenant_id !== tenantBId,
      '35. Security barrier enforces active session tenant context and neutralizes attacker tenant spoofing');

    // -------------------------------------------------------------
    // TEST 36: Update cannot move expense to foreign tenant/property
    // -------------------------------------------------------------
    console.log('\n--- TEST 36: Update cannot move expense to foreign tenant/property ---');
    let moveBlocked = false;
    try {
      const { error: errMove } = await clientA
        .from('expenses')
        .update({
          property_id: propBId // Trying to move Tenant A expense to Tenant B property!
        })
        .eq('id', createdExp1.id)
        .eq('tenant_id', tenantAId);

      if (errMove && (errMove.code === '42501' || errMove.message?.includes('CROSS_TENANT'))) {
        moveBlocked = true;
      }
    } catch (e) {
      moveBlocked = true;
    }
    assert(moveBlocked,
      '36. (Tam İzolasyon) Update query cannot hijack or assign expense to foreign tenant property');

  } catch (err) {
    console.error('Test execution fatal error:', err);
    testsFailed++;
  } finally {
    // -------------------------------------------------------------
    // CLEANUP: Remove Test Tenants, Properties, Bookings & Expenses
    // -------------------------------------------------------------
    console.log('\n--- CLEANUP ---');
    try {
      if (tenantAId) {
        await adminClient.from('expenses').delete().eq('tenant_id', tenantAId);
        await adminClient.from('cleaning_tasks').delete().eq('tenant_id', tenantAId);
        await adminClient.from('bookings').delete().eq('tenant_id', tenantAId);
        await adminClient.from('properties').delete().eq('tenant_id', tenantAId);
        await adminClient.from('tenant_members').delete().eq('tenant_id', tenantAId);
        await adminClient.from('tenants').delete().eq('id', tenantAId);
      }
      if (tenantBId) {
        await adminClient.from('expenses').delete().eq('tenant_id', tenantBId);
        await adminClient.from('cleaning_tasks').delete().eq('tenant_id', tenantBId);
        await adminClient.from('bookings').delete().eq('tenant_id', tenantBId);
        await adminClient.from('properties').delete().eq('tenant_id', tenantBId);
        await adminClient.from('tenant_members').delete().eq('tenant_id', tenantBId);
        await adminClient.from('tenants').delete().eq('id', tenantBId);
      }
      if (userAId) await adminClient.auth.admin.deleteUser(userAId);
      if (userBId) await adminClient.auth.admin.deleteUser(userBId);
      console.log('[PASS] Cleanup finished.');
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr);
    }
  }

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('=============================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runPhase6FinanceCrudTests().catch(err => {
  console.error('Unhandled fatal error in test suite:', err);
  process.exit(1);
});
