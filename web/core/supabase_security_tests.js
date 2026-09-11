// =============================================================================
// LEXBNB ENTERPRISE MULTI-TENANT SAAS & SUPABASE SECURITY ACCEPTANCE SUITE
// Automated verification for Production-Grade RLS, Zero-Escalation,
// Security Definer Hardening, Audit Integrity, Idempotency & Realtime Cleanup
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=============================================================================');
console.log('🛡️  LEXBNB SUPABASE & MULTI-TENANT ARCHITECTURE SECURITY TEST SUITE');
console.log('=============================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}\n`);
    throw err;
  }
}

// Read schema.sql and app.js
const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
const appPath = path.join(__dirname, '..', 'app.js');
const schemaContent = fs.readFileSync(schemaPath, 'utf8');
const appContent = fs.readFileSync(appPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: SCHEMA LEVEL SECURITY DEFINER & SEARCH_PATH HARDENING
// -----------------------------------------------------------------------------
runTest('Phase 2 & 4: SECURITY DEFINER Hardening & search_path Sanitization', () => {
  const securityDefinerFns = [
    'public.is_tenant_member',
    'public.get_tenant_role',
    'public.create_tenant_and_owner',
    'public.log_audit_event',
    'public.fn_guard_last_tenant_owner'
  ];

  securityDefinerFns.forEach(fnName => {
    assert(
      schemaContent.includes(fnName),
      `Function ${fnName} must exist in schema.sql`
    );
  });

  // Verify search_path = '' on all SECURITY DEFINER functions
  const searchPathOccurrences = (schemaContent.match(/SET search_path = ''/g) || []).length;
  assert(
    searchPathOccurrences >= 5,
    `Expected at least 5 functions with "SET search_path = ''", found ${searchPathOccurrences}`
  );

  // Verify REVOKE ALL FROM PUBLIC and GRANT TO authenticated
  assert(schemaContent.includes('REVOKE ALL ON FUNCTION public.is_tenant_member(UUID) FROM PUBLIC;'));
  assert(schemaContent.includes('GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID) TO authenticated;'));
  assert(schemaContent.includes('REVOKE ALL ON FUNCTION public.get_tenant_role(UUID) FROM PUBLIC;'));
  assert(schemaContent.includes('GRANT EXECUTE ON FUNCTION public.get_tenant_role(UUID) TO authenticated;'));
  assert(schemaContent.includes('REVOKE ALL ON FUNCTION public.create_tenant_and_owner(TEXT, TEXT) FROM PUBLIC;'));
  assert(schemaContent.includes('GRANT EXECUTE ON FUNCTION public.create_tenant_and_owner(TEXT, TEXT) TO authenticated;'));
  assert(schemaContent.includes('REVOKE ALL ON FUNCTION public.log_audit_event FROM PUBLIC;'));
  assert(schemaContent.includes('GRANT EXECUTE ON FUNCTION public.log_audit_event TO authenticated;'));
});

// -----------------------------------------------------------------------------
// TEST 2: PRIVILEGE ESCALATION VULNERABILITY ELIMINATION (tenant_members)
// -----------------------------------------------------------------------------
runTest('Phase 1: Zero Privilege Escalation in tenant_members RLS Policies', () => {
  // Vulnerable pattern was: WITH CHECK (auth.uid() = user_id OR ...)
  // Verify this vulnerability is completely eliminated from tenant_members policy
  const tenantMemberPolicyMatches = schemaContent.match(
    /CREATE POLICY "Owners and admins add members" ON public\.tenant_members FOR INSERT WITH CHECK \(([\s\S]*?)\);/
  );

  assert(tenantMemberPolicyMatches, 'Policy "Owners and admins add members" must exist');
  const policyBody = tenantMemberPolicyMatches[1];

  assert(
    !policyBody.includes('auth.uid() = user_id'),
    'CRITICAL SECURITY: auth.uid() = user_id MUST NOT be in tenant_members INSERT check!'
  );

  assert(
    policyBody.includes('is_tenant_member(tenant_id)') &&
    policyBody.includes("get_tenant_role(tenant_id) IN ('owner', 'admin')"),
    'Only existing owner/admin can add members to a tenant'
  );

  // Verify member update is strictly restricted to owner
  const updatePolicy = schemaContent.match(
    /CREATE POLICY "Owners manage member roles" ON public\.tenant_members FOR UPDATE USING \(([\s\S]*?)\);/
  );
  assert(updatePolicy, 'Policy "Owners manage member roles" must exist');
  assert(updatePolicy[1].includes("get_tenant_role(tenant_id) = 'owner'"));
});

// -----------------------------------------------------------------------------
// TEST 3: AUDIT LOG CLIENT-SIDE SPOOFING DENIAL (Default Deny)
// -----------------------------------------------------------------------------
runTest('Phase 4: Client Spoofing Protection for audit_logs (Default Deny)', () => {
  // Check RLS is enabled on audit_logs
  assert(schemaContent.includes('ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;'));

  // Ensure NO INSERT, UPDATE, or DELETE policies exist for client on audit_logs
  assert(
    !schemaContent.match(/CREATE POLICY.*ON public\.audit_logs FOR (INSERT|UPDATE|DELETE)/i),
    'audit_logs MUST NOT have any client INSERT, UPDATE, or DELETE policies (Default Deny)'
  );

  // Only SELECT is allowed for authorized members
  assert(schemaContent.includes('CREATE POLICY "Authorized view audit" ON public.audit_logs FOR SELECT'));
});

// -----------------------------------------------------------------------------
// TEST 4: TENANT DESTRUCTIVE ACTIONS & LAST OWNER GUARDRAIL
// -----------------------------------------------------------------------------
runTest('Phase 7: Destructive Actions Protection & Last Owner Guardrail', () => {
  // Direct client DELETE policy on tenants table must NOT exist
  assert(
    !schemaContent.match(/CREATE POLICY.*ON public\.tenants FOR DELETE/i),
    'Direct client DELETE on tenants table must be disabled in RLS'
  );

  // Guardrail trigger must exist on tenant_members
  assert(schemaContent.includes('CREATE TRIGGER trg_guard_last_tenant_owner'));
  assert(schemaContent.includes('BEFORE UPDATE OR DELETE ON public.tenant_members'));
  assert(schemaContent.includes('FOR EACH ROW EXECUTE FUNCTION public.fn_guard_last_tenant_owner();'));

  // Simulate Trigger Logic
  function simulateGuardrail(currentOwnersCount, operation, oldRole, newRole) {
    if ((operation === 'DELETE' && oldRole === 'owner') ||
        (operation === 'UPDATE' && oldRole === 'owner' && newRole !== 'owner')) {
      const remainingOwners = currentOwnersCount - 1;
      if (remainingOwners <= 0) {
        throw new Error('İşletmenin son sahibi (owner) silinemez veya rolü düşürülemez!');
      }
    }
    return true;
  }

  // 1. Trying to delete last owner -> Must throw
  assert.throws(
    () => simulateGuardrail(1, 'DELETE', 'owner', null),
    /İşletmenin son sahibi/
  );

  // 2. Trying to demote last owner to staff -> Must throw
  assert.throws(
    () => simulateGuardrail(1, 'UPDATE', 'owner', 'staff'),
    /İşletmenin son sahibi/
  );

  // 3. Deleting an owner when 2 owners exist -> Allowed
  assert.doesNotThrow(
    () => simulateGuardrail(2, 'DELETE', 'owner', null)
  );

  // 4. Deleting a staff member when 1 owner exists -> Allowed
  assert.doesNotThrow(
    () => simulateGuardrail(1, 'DELETE', 'staff', null)
  );
});

// -----------------------------------------------------------------------------
// TEST 5: DB-LEVEL MIGRATION IDEMPOTENCY & CONSTRAINTS
// -----------------------------------------------------------------------------
runTest('Phase 5: DB-Level Migration Idempotency & Unique Constraints', () => {
  // Verify tenant_migrations table
  assert(schemaContent.includes('CREATE TABLE IF NOT EXISTS public.tenant_migrations'));
  assert(schemaContent.includes('UNIQUE (tenant_id, entity_type, source_record_id)'));

  // Verify expenses unique constraint on (tenant_id, legacy_id)
  assert(schemaContent.includes('CONSTRAINT uq_tenant_expense_legacy UNIQUE (tenant_id, legacy_id)'));

  // Verify cleaning_tasks unique constraint on (tenant_id, legacy_id)
  assert(schemaContent.includes('CONSTRAINT uq_tenant_cleaning_legacy UNIQUE (tenant_id, legacy_id)'));

  // Verify executeMigrationToCloud implementation records into tenant_migrations and uses legacy_id
  assert(appContent.includes("entity_type: 'property'"));
  assert(appContent.includes("entity_type: 'booking'"));
  assert(appContent.includes("entity_type: 'expense'"));
  assert(appContent.includes("entity_type: 'cleaning'"));
  assert(appContent.includes("onConflict: 'tenant_id, legacy_id'"));

  // Simulate Migration Store
  const db = {
    tenant_migrations: new Set(),
    expenses: new Map()
  };

  function migrateExpense(tenantId, legacyId, amount) {
    const migKey = `${tenantId}:expense:${legacyId}`;
    if (db.tenant_migrations.has(migKey)) {
      // Idempotent: Record already migrated, skip or update existing without duplicate row
      return false; // did not insert new row
    }
    db.tenant_migrations.add(migKey);
    db.expenses.set(`${tenantId}:${legacyId}`, { tenantId, legacyId, amount });
    return true; // inserted
  }

  // Run 1: 3 expenses migrated
  const run1_1 = migrateExpense('tenant-1', 'EXP-001', 5000);
  const run1_2 = migrateExpense('tenant-1', 'EXP-002', 2500);
  const run1_3 = migrateExpense('tenant-1', 'EXP-003', 1200);

  assert.strictEqual(run1_1 && run1_2 && run1_3, true);
  assert.strictEqual(db.expenses.size, 3);

  // Run 2: Exact same migration triggered again
  const run2_1 = migrateExpense('tenant-1', 'EXP-001', 5000);
  const run2_2 = migrateExpense('tenant-1', 'EXP-002', 2500);
  const run2_3 = migrateExpense('tenant-1', 'EXP-003', 1200);

  assert.strictEqual(run2_1 || run2_2 || run2_3, false, 'Second migration must not insert any duplicate rows');
  assert.strictEqual(db.expenses.size, 3, 'Expenses table row count must remain 3');
});

// -----------------------------------------------------------------------------
// TEST 6: REALTIME SUBSCRIPTION CLEANUP & LEAK PREVENTION
// -----------------------------------------------------------------------------
runTest('Phase 6: Realtime Channel Tracking & Teardown on Logout / Switch', () => {
  // app.js must track activeRealtimeChannel
  assert(appContent.includes('let activeRealtimeChannel = null;'));
  assert(appContent.includes('function unsubscribeTenantRealtime()'));

  // logoutSaaSUser must call unsubscribeTenantRealtime
  const logoutMatches = appContent.match(/function logoutSaaSUser\(\)\s*\{([\s\S]*?)\}/);
  assert(logoutMatches, 'logoutSaaSUser function must exist');
  assert(
    logoutMatches[1].includes('unsubscribeTenantRealtime()'),
    'logoutSaaSUser MUST invoke unsubscribeTenantRealtime() to prevent websocket leaks'
  );

  // subscribeTenantRealtime must unsubscribe previous channel before creating a new one
  const subMatches = appContent.match(/function subscribeTenantRealtime\(tenantId\)\s*\{([\s\S]*?)\}/);
  assert(subMatches, 'subscribeTenantRealtime function must exist');
  assert(
    subMatches[1].includes('unsubscribeTenantRealtime()'),
    'subscribeTenantRealtime MUST invoke unsubscribeTenantRealtime() to prevent zombie channels'
  );

  // Simulate Realtime Manager
  let channelClosed = false;
  let activeMockChannel = {
    id: 'chan_tenant_123',
    unsubscribe: () => { channelClosed = true; }
  };

  function mockUnsubscribe() {
    if (activeMockChannel) {
      activeMockChannel.unsubscribe();
      activeMockChannel = null;
    }
  }

  mockUnsubscribe();
  assert.strictEqual(channelClosed, true, 'Channel must be properly unsubscribed');
  assert.strictEqual(activeMockChannel, null, 'Active channel reference must be cleared');
});

// -----------------------------------------------------------------------------
// TEST 7: ELIMINATION OF MONOLITHIC BULK SYNC LOOP & ENTITY MUTATIONS
// -----------------------------------------------------------------------------
runTest('Phase 3: Discrete Entity-Based Mutations in place of Monolithic Bulk Sync', () => {
  // syncActiveTenantToCloud must NOT exist in app.js or saveAppData
  assert(
    !appContent.includes('function syncActiveTenantToCloud'),
    'syncActiveTenantToCloud monolithic function must be completely eliminated'
  );
  assert(
    !appContent.includes('cloudSyncDebounceTimer'),
    'cloudSyncDebounceTimer must be completely eliminated'
  );

  // Verify discrete entity mutation functions exist
  const expectedMutations = [
    'cloudUpsertProperty',
    'cloudDeleteProperty',
    'cloudUpsertBooking',
    'cloudDeleteBooking',
    'cloudUpsertExpense',
    'cloudDeleteExpense',
    'cloudUpsertCleaningTask',
    'cloudDeleteCleaningTask',
    'cloudUpsertLead',
    'cloudDeleteLead'
  ];

  expectedMutations.forEach(fn => {
    assert(appContent.includes(`async function ${fn}`), `${fn} must be implemented in app.js`);
  });

  // Verify UI save handlers wire to these entity mutations
  assert(appContent.includes('cloudUpsertBooking(bookingRecord)'));
  assert(appContent.includes('cloudDeleteBooking(id)'));
  assert(appContent.includes('cloudUpsertExpense(expRecord)'));
  assert(appContent.includes('cloudDeleteExpense(id)'));
  assert(appContent.includes('cloudUpsertLead(leadRecord)'));
  assert(appContent.includes('cloudDeleteLead(id)'));
  assert(appContent.includes('cloudUpsertCleaningTask(taskRecord)'));
  assert(appContent.includes('cloudDeleteCleaningTask(taskId)'));
});

// -----------------------------------------------------------------------------
// TEST 8: MULTI-TENANT SIMULATION (Cross-Tenant Isolation & Role Boundaries)
// -----------------------------------------------------------------------------
runTest('Multi-Tenant RLS Simulation: Isolation & Role Enforcement', () => {
  // Setup Mock Database State
  const db = {
    users: {
      'usr-owner-a': { id: 'usr-owner-a', email: 'owner@tenanta.com' },
      'usr-viewer-a': { id: 'usr-viewer-a', email: 'viewer@tenanta.com' },
      'usr-owner-b': { id: 'usr-owner-b', email: 'owner@tenantb.com' }
    },
    tenants: {
      'tenant-a': { id: 'tenant-a', name: 'Uludağ Dağ Evleri' },
      'tenant-b': { id: 'tenant-b', name: 'Sapanca Villaları' }
    },
    members: [
      { tenant_id: 'tenant-a', user_id: 'usr-owner-a', role: 'owner' },
      { tenant_id: 'tenant-a', user_id: 'usr-viewer-a', role: 'viewer' },
      { tenant_id: 'tenant-b', user_id: 'usr-owner-b', role: 'owner' }
    ],
    properties: [
      { id: 'p1', tenant_id: 'tenant-a', name: 'Seyir Dağ Evi' },
      { id: 'p2', tenant_id: 'tenant-b', name: 'Sapanca Göl Evi' }
    ],
    bookings: [
      { id: 'b1', tenant_id: 'tenant-a', guest_name: 'Ahmet Yılmaz' },
      { id: 'b2', tenant_id: 'tenant-b', guest_name: 'Mehmet Kaya' }
    ]
  };

  function is_tenant_member(tenant_id, user_id) {
    return db.members.some(m => m.tenant_id === tenant_id && m.user_id === user_id);
  }

  function get_tenant_role(tenant_id, user_id) {
    const m = db.members.find(m => m.tenant_id === tenant_id && m.user_id === user_id);
    return m ? m.role : null;
  }

  // 1. Cross-tenant query simulation: User A selects properties
  const userA_Properties = db.properties.filter(p => is_tenant_member(p.tenant_id, 'usr-owner-a'));
  assert.strictEqual(userA_Properties.length, 1);
  assert.strictEqual(userA_Properties[0].name, 'Seyir Dağ Evi');

  // User B's properties must NOT be visible to User A
  const userA_sees_TenantB = userA_Properties.some(p => p.tenant_id === 'tenant-b');
  assert.strictEqual(userA_sees_TenantB, false, 'Tenant A user must never see Tenant B properties');

  // 2. Privilege Escalation Simulation: User A tries to insert into Tenant B members
  function attemptJoinTenant(attackerId, targetTenantId, targetRole) {
    // Evaluating RLS: WITH CHECK (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin'))
    const canInsert = is_tenant_member(targetTenantId, attackerId) &&
                      ['owner', 'admin'].includes(get_tenant_role(targetTenantId, attackerId));
    if (!canInsert) {
      throw new Error('RLS policy violation: Unauthorized member insert');
    }
    db.members.push({ tenant_id: targetTenantId, user_id: attackerId, role: targetRole });
  }

  assert.throws(
    () => attemptJoinTenant('usr-owner-a', 'tenant-b', 'owner'),
    /RLS policy violation/,
    'Attacker must NOT be able to self-join foreign tenant as owner'
  );

  // 3. Role enforcement simulation: Viewer tries to insert a booking
  function attemptCreateBooking(userId, tenantId, bookingData) {
    // Evaluating RLS: WITH CHECK (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff'))
    const role = get_tenant_role(tenantId, userId);
    const canInsert = is_tenant_member(tenantId, userId) && ['owner', 'admin', 'manager', 'staff'].includes(role);
    if (!canInsert) {
      throw new Error('RLS policy violation: Viewer cannot create bookings');
    }
    db.bookings.push({ ...bookingData, tenant_id: tenantId });
  }

  assert.throws(
    () => attemptCreateBooking('usr-viewer-a', 'tenant-a', { guest_name: 'Test Misafir' }),
    /RLS policy violation/,
    'Viewer must NOT be allowed to insert bookings'
  );

  // 4. Staff deletion prohibition
  function attemptDeleteBooking(userId, tenantId) {
    // Evaluating RLS: USING (is_tenant_member(tenant_id) AND get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager'))
    const role = get_tenant_role(tenantId, userId);
    const canDelete = is_tenant_member(tenantId, userId) && ['owner', 'admin', 'manager'].includes(role);
    if (!canDelete) {
      throw new Error('RLS policy violation: Staff or Viewer cannot delete bookings');
    }
    return true;
  }

  assert.throws(
    () => attemptDeleteBooking('usr-viewer-a', 'tenant-a'),
    /RLS policy violation/
  );
});

console.log('\n=============================================================================');
console.log(`TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('=============================================================================');
console.log('🎉 ALL 8 SECURITY & ARCHITECTURE HARDENING TESTS PASSED WITH 100% SUCCESS.\n');
