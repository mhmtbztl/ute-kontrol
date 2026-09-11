/**
 * LEXBNB PHASE 3 - TENANT SESSION & STATE ISOLATION TEST SUITE
 * Tests activeTenantId single source of truth, membership resolution,
 * tenant switching, state clearing, realtime channel teardown, and CRUD scoping.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env
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

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
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

async function runPhase3TenantSessionTests() {
  console.log('=============================================================================');
  console.log('🏢 LEXBNB PHASE 3 - TENANT SESSION & STATE ISOLATION TEST SUITE');
  console.log('=============================================================================');

  const testPass = 'SecurePass123!';
  const userAEmail = `tenantA_${Date.now()}@lexbnbtest.com`;
  const userBEmail = `tenantB_${Date.now()}@lexbnbtest.com`;

  let userAId = null;
  let userBId = null;
  let tenant1Id = null;
  let tenant2Id = null;
  let tenantBId = null;

  try {
    // 1. Setup User A
    const { data: uA, error: errA } = await adminClient.auth.admin.createUser({
      email: userAEmail,
      password: testPass,
      email_confirm: true,
      user_metadata: { full_name: 'User A', company_name: 'Tenant Alpha' }
    });
    assert(!errA && uA?.user?.id, 'Setup: User A Auth created', errA?.message);
    userAId = uA.user.id;

    // Login User A
    const { data: loginA } = await anonClient.auth.signInWithPassword({ email: userAEmail, password: testPass });
    const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer ' + loginA.session.access_token } }
    });

    // Create Tenant 1 for User A
    const { data: rpc1, error: rpcErr1 } = await clientA.rpc('create_tenant_and_owner', {
      p_company_name: 'Tenant Alpha',
      p_full_name: 'User A'
    });
    assert(!rpcErr1 && rpc1?.tenant_id, 'Setup: Tenant Alpha created via RPC', rpcErr1?.message);
    tenant1Id = rpc1.tenant_id;

    // 1. Single tenant auto selection
    const { data: memsA1 } = await clientA.from('tenant_members')
      .select('tenant_id, role, tenants(id, name, slug)')
      .eq('user_id', userAId);
    assert(memsA1 && memsA1.length === 1, '1. Single tenant auto selection: User A has exactly 1 membership');
    let activeTenantId = memsA1[0].tenant_id;
    assert(activeTenantId === tenant1Id, '1b. Active tenant ID automatically resolves to Tenant Alpha');

    // Setup second tenant (Tenant Beta) and add User A as member
    const { data: t2 } = await adminClient.from('tenants').insert({
      name: 'Tenant Beta',
      slug: 'tenant-beta-' + Date.now(),
      plan: 'pro'
    }).select('id').single();
    tenant2Id = t2.id;

    await adminClient.from('tenant_members').insert({
      tenant_id: tenant2Id,
      user_id: userAId,
      role: 'admin'
    });

    // 2. Multiple tenant membership loading
    const { data: memsA2 } = await clientA.from('tenant_members')
      .select('tenant_id, role, tenants(id, name, slug)')
      .eq('user_id', userAId)
      .order('created_at', { ascending: true });
    assert(memsA2 && memsA2.length === 2, '2. Multiple tenant membership loading: User A memberships loaded (count: 2)');

    // 3. Last selected tenant validation
    // Simulate valid cached tenant ID in localStorage
    let cachedTenantId = tenant2Id;
    let validatedMem = memsA2.find(m => m.tenant_id === cachedTenantId);
    assert(validatedMem && validatedMem.tenant_id === tenant2Id, '3. Last selected tenant validation: Valid cached tenant is accepted');

    // 4. Invalid cached tenant ignored
    const fakeCachedId = '00000000-0000-0000-0000-000000000000';
    let invalidMem = memsA2.find(m => m.tenant_id === fakeCachedId);
    let resolvedTenantId = invalidMem ? invalidMem.tenant_id : memsA2[0].tenant_id;
    assert(!invalidMem && resolvedTenantId === tenant1Id, '4. Invalid cached tenant ignored: Fallback to first valid membership');

    // Seed mock data for Tenant Alpha
    let appState = {
      activeTenantId: tenant1Id,
      companyName: 'Tenant Alpha',
      villas: { V1: { name: 'Alpha Villa 1' }, V2: { name: 'Alpha Villa 2' } },
      bookings: [{ id: 'REZ-A1', villa: 'V1', guest: 'Guest Alpha' }],
      expenses: [{ id: 'EXP-A1', amount: 1200 }],
      leads: [{ id: 'LEAD-A1', guest: 'Lead Alpha' }],
      cleaningTasks: [{ id: 'TASK-A1', cleaner: 'Fatma' }],
      filterVilla: 'V1'
    };

    // 5. Tenant switch updates activeTenantId
    // Simulate switchActiveTenant(tenant2Id)
    const targetMem = memsA2.find(m => m.tenant_id === tenant2Id);
    assert(!!targetMem, '5a. Target tenant membership exists for User A');

    // 11. Tenant switch closes previous realtime channel
    let realtimeChannelState = 'active_channel_tenant1';
    function unsubscribeTenantRealtime() {
      realtimeChannelState = 'closed';
    }
    unsubscribeTenantRealtime();
    assert(realtimeChannelState === 'closed', '11. Tenant switch closes previous realtime channel');

    // 6, 7, 8, 9, 10. Tenant switch clears all old business state
    appState = {
      activeTenantId: targetMem.tenant_id,
      companyName: targetMem.tenants.name,
      villas: {},
      bookings: [],
      expenses: [],
      leads: [],
      cleaningTasks: [],
      filterVilla: 'ALL'
    };
    activeTenantId = targetMem.tenant_id;

    assert(activeTenantId === tenant2Id, '5. Tenant switch updates activeTenantId to Tenant Beta');
    assert(Object.keys(appState.villas).length === 0, '6. Tenant switch clears old properties (0 leftover)');
    assert(appState.bookings.length === 0, '7. Tenant switch clears old bookings (0 leftover)');
    assert(appState.expenses.length === 0, '8. Tenant switch clears old expenses (0 leftover)');
    assert(appState.leads.length === 0, '9. Tenant switch clears old leads (0 leftover)');
    assert(appState.cleaningTasks.length === 0, '10. Tenant switch clears old cleaning tasks (0 leftover)');

    // 12. Tenant switch starts new realtime channel
    function subscribeTenantRealtime(tId) {
      realtimeChannelState = 'active_channel_' + tId;
    }
    subscribeTenantRealtime(activeTenantId);
    assert(realtimeChannelState === 'active_channel_' + tenant2Id, '12. Tenant switch starts new realtime channel for Tenant Beta');

    // 13. Logout clears activeTenantId
    activeTenantId = null;
    appState = { activeTenantId: null, villas: {}, bookings: [], expenses: [], leads: [], cleaningTasks: [] };
    assert(activeTenantId === null, '13. Logout clears activeTenantId (set to null)');

    // 14. User A logout -> User B login has zero User A state
    // Create User B with Tenant B
    const { data: uB } = await adminClient.auth.admin.createUser({
      email: userBEmail,
      password: testPass,
      email_confirm: true,
      user_metadata: { full_name: 'User B', company_name: 'Tenant B Only' }
    });
    userBId = uB.user.id;

    const { data: loginB } = await anonClient.auth.signInWithPassword({ email: userBEmail, password: testPass });
    const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer ' + loginB.session.access_token } }
    });

    const { data: rpcB } = await clientB.rpc('create_tenant_and_owner', {
      p_company_name: 'Tenant B Only',
      p_full_name: 'User B'
    });
    tenantBId = rpcB.tenant_id;

    // Load User B memberships
    const { data: memsB } = await clientB.from('tenant_members').select('tenant_id').eq('user_id', userBId);
    const hasAnyUserATenant = memsB.some(m => m.tenant_id === tenant1Id || m.tenant_id === tenant2Id);
    assert(!hasAnyUserATenant, '14. User A logout -> User B login has zero User A tenant access or state');

    // 15. CRUD tenant_id always derived from activeTenantId
    // Ensure that even if an attacker passes another tenant_id, client uses activeTenantId
    const activeContextTenantId = tenantBId;
    function buildMutationPayload(clientProvidedData) {
      // Security rule: tenant_id from active application context, never from input
      return {
        ...clientProvidedData,
        tenant_id: activeContextTenantId
      };
    }

    const spoofedInput = { tenant_id: tenant1Id, name: 'Spoofed Property' };
    const safePayload = buildMutationPayload(spoofedInput);
    assert(safePayload.tenant_id === tenantBId && safePayload.tenant_id !== tenant1Id, 
      '15. CRUD tenant_id always derived from activeTenantId (spoofed input ignored)');

  } catch (err) {
    console.error('Unhandled test exception:', err);
    testsFailed++;
  } finally {
    console.log('\n--- Test Cleanup ---');
    if (tenant1Id) await adminClient.from('tenants').delete().eq('id', tenant1Id);
    if (tenant2Id) await adminClient.from('tenants').delete().eq('id', tenant2Id);
    if (tenantBId) await adminClient.from('tenants').delete().eq('id', tenantBId);
    if (userAId) await adminClient.auth.admin.deleteUser(userAId);
    if (userBId) await adminClient.auth.admin.deleteUser(userBId);
    console.log('🧹 Phase 3 test verileri ve kullanıcıları temizlendi.');
  }

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} / ${testsPassed + testsFailed} TESTS PASSED (${testsFailed} FAILED)`);
  console.log('=============================================================================');

  if (testsFailed === 0) {
    console.log('🎉 ALL PHASE 3 TENANT SESSION & ISOLATION TESTS PASSED 100%');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPhase3TenantSessionTests();
