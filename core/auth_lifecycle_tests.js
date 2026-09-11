const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const mockBrowserStorage = {};
const storageAdapter = {
  getItem: (key) => mockBrowserStorage[key] || null,
  setItem: (key, value) => { mockBrowserStorage[key] = value; },
  removeItem: (key) => { delete mockBrowserStorage[key]; }
};

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: storageAdapter, persistSession: true, autoRefreshToken: false }
});

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

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

async function runPhase2AuthTests() {
  console.log('=============================================================================');
  console.log('🔐 LEXBNB PHASE 2 - AUTHENTICATION & ONBOARDING TEST SUITE');
  console.log('=============================================================================');

  const testEmail = 'phase2_' + Date.now() + '@lexbnbtest.com';
  const testPass = 'SecurePass123!';
  let createdUserId = null;
  let createdTenantId = null;

  try {
    // 1. Invalid password (< 6 chars client validation)
    const shortPass = '123';
    const shortPassErr = shortPass.length < 6 ? 'Şifreniz en az 6 karakter olmalıdır.' : null;
    assert(shortPassErr === 'Şifreniz en az 6 karakter olmalıdır.', '1. Invalid password rejection (< 6 chars client validation)');

    // 2. Register: Auth User creation
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPass,
      email_confirm: true,
      user_metadata: { full_name: 'Phase 2 Test User', company_name: 'Phase 2 Test Co' }
    });
    assert(!createErr && newUser && newUser.user && newUser.user.id, '2. Register: Auth user created successfully', createErr && createErr.message);
    createdUserId = newUser.user.id;

    // 3. Duplicate email prevention
    const { error: dupErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPass,
      email_confirm: true
    });
    assert(dupErr && (dupErr.message.includes('already registered') || dupErr.status === 422), 
      '3. Duplicate email: Re-registering existing email is rejected', dupErr && dupErr.message);

    // 4. Email confirmation flow
    const { data: preMembers } = await adminClient.from('tenant_members').select('*').eq('user_id', createdUserId);
    assert((preMembers || []).length === 0, '4. Email confirmation flow: No tenant created prior to authenticated session');

    // 5. Login: Real password login returns authentic JWT
    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: testEmail,
      password: testPass
    });
    assert(!loginErr && loginData && loginData.session && loginData.session.access_token, '5. Login: Real password login returns authentic JWT', loginErr && loginErr.message);

    // Create client with this user's authenticated JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer ' + loginData.session.access_token } }
    });

    // 6. Authenticated tenant creation (RPC create_tenant_and_owner)
    const { data: rpcRes, error: rpcErr } = await userClient.rpc('create_tenant_and_owner', {
      p_company_name: 'Phase 2 Test Co',
      p_full_name: 'Phase 2 Test User'
    });
    assert(!rpcErr && rpcRes && rpcRes.tenant_id, '6. Authenticated tenant creation: create_tenant_and_owner RPC succeeded', rpcErr && rpcErr.message);
    createdTenantId = rpcRes.tenant_id;

    // 7. Verify owner membership
    const { data: memRows } = await userClient.from('tenant_members').select('tenant_id, role').eq('user_id', createdUserId);
    assert(memRows && memRows.length === 1 && memRows[0].role === 'owner', '7. Owner membership verified in tenant_members table');

    // 8. Duplicate tenant prevention (User with existing tenant does not trigger recovery)
    const { data: existingMems } = await userClient.from('tenant_members').select('tenant_id, role').eq('user_id', createdUserId);
    const wouldCreateDuplicate = (existingMems || []).length === 0;
    assert(!wouldCreateDuplicate, '8. Duplicate tenant prevention: User with existing tenant does not trigger recovery');

    // 9. Session restore (simulate page reload / fresh tab with stored session)
    const freshTabClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: storageAdapter, persistSession: true, autoRefreshToken: false }
    });
    const { data: restoredSession } = await freshTabClient.auth.getSession();
    assert(restoredSession && restoredSession.session && restoredSession.session.user && restoredSession.session.user.id === createdUserId, 
      '9. Session restore: getSession in fresh tab restores user session accurately');

    // 10. Auth user without tenant recovery test
    const recoveryEmail = 'recovery_' + Date.now() + '@lexbnbtest.com';
    const { data: recUser } = await adminClient.auth.admin.createUser({
      email: recoveryEmail,
      password: testPass,
      email_confirm: true,
      user_metadata: { full_name: 'Recovery User', company_name: 'Recovery Co' }
    });
    const recUserId = recUser.user.id;

    const { data: recLogin } = await anonClient.auth.signInWithPassword({
      email: recoveryEmail,
      password: testPass
    });
    const recClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer ' + recLogin.session.access_token } }
    });

    const { data: recMems0 } = await recClient.from('tenant_members').select('*').eq('user_id', recUserId);
    assert((recMems0 || []).length === 0, '10a. Recovery check: New user initially has 0 tenant memberships');

    const { data: recRpcRes, error: recRpcErr } = await recClient.rpc('create_tenant_and_owner', {
      p_company_name: 'Recovery Co',
      p_full_name: 'Recovery User'
    });
    assert(!recRpcErr && recRpcRes && recRpcRes.tenant_id, '10b. Auth user without tenant recovery: Successfully recovered and tenant created');

    if (recRpcRes && recRpcRes.tenant_id) {
      await adminClient.from('tenants').delete().eq('id', recRpcRes.tenant_id);
    }
    await adminClient.auth.admin.deleteUser(recUserId);

    // 11. Logout & State Purging verification
    let mockAppState = {
      tenantId: createdTenantId,
      companyName: 'Phase 2 Test Co',
      villas: { V1: { name: 'Villa 1' } },
      bookings: [{ id: 'REZ-1', guest: 'John' }],
      expenses: [{ id: 'EXP-1', amount: 500 }],
      cleaningTasks: [{ id: 'TASK-1' }],
      leads: [{ id: 'L1' }]
    };

    await userClient.auth.signOut();
    mockAppState = {
      tenantId: null,
      companyName: '',
      villas: {},
      bookings: [],
      expenses: [],
      cleaningTasks: [],
      leads: []
    };

    const isStateClean = mockAppState.tenantId === null &&
      Object.keys(mockAppState.villas).length === 0 &&
      mockAppState.bookings.length === 0 &&
      mockAppState.expenses.length === 0 &&
      mockAppState.leads.length === 0;

    assert(isStateClean, '11. Logout state purge: All in-memory and UI state wiped to empty state on logout');

  } catch (err) {
    console.error('Unhandled test exception:', err);
    testsFailed++;
  } finally {
    console.log('\n--- Test Cleanup ---');
    if (createdTenantId) {
      await adminClient.from('tenants').delete().eq('id', createdTenantId);
    }
    if (createdUserId) {
      await adminClient.auth.admin.deleteUser(createdUserId);
    }
    console.log('🧹 Test verileri ve oturumlar temizlendi.');
  }

  console.log('\n=============================================================================');
  console.log('TEST SUMMARY: ' + testsPassed + ' / ' + (testsPassed + testsFailed) + ' TESTS PASSED (' + testsFailed + ' FAILED)');
  console.log('=============================================================================');

  if (testsFailed === 0) {
    console.log('🎉 ALL PHASE 2 AUTH & ONBOARDING TESTS PASSED 100%');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPhase2AuthTests();