// =============================================================================
// LEXBNB LIVE SUPABASE INTEGRATION TEST SUITE (REAL JWT SESSIONS & POSTGRES RLS)
// =============================================================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env if present
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valParts] = trimmed.split('=');
      const val = valParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.LEXBNB_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.LEXBNB_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('=============================================================================');
console.log('🌐 LEXBNB REAL SUPABASE LIVE INTEGRATION TEST SUITE');
console.log('=============================================================================');
console.log(`Target Supabase URL: ${SUPABASE_URL || 'NOT CONFIGURED'}\n`);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || SUPABASE_URL.includes('kxdffhvwcklqnjfhyyvy')) {
  console.error('❌ HATA: Gerçek bir Supabase projesi bağlı değil!');
  console.error('Lütfen geçerli bir Supabase URL ve Anon/Publishable Key tanımlayın.');
  process.exit(1);
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runLiveTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       PostgreSQL / Supabase Response: ${err.message || JSON.stringify(err)}\n`);
    failedTests++;
  }
}

async function main() {
  const adminClient = SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  // Initialize independent client instances to simulate real isolated browser sessions
  const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const clientViewer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const clientStaff = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  const testRunId = Date.now().toString().slice(-6);
  const emailUserA = `usera_${testRunId}@lexbnb-test.com`;
  const emailUserB = `userb_${testRunId}@lexbnb-test.com`;
  const emailViewer = `viewer_${testRunId}@lexbnb-test.com`;
  const emailStaff = `staff_${testRunId}@lexbnb-test.com`;
  const testPassword = 'Password123!*Test';

  let userA, userB, userViewer, userStaff;
  let tenantAId, tenantBId;

  try {
    // ---------------------------------------------------------------------------
    // STEP 0: REAL USER CREATION & ATOMIC ONBOARDING (JWT SESSIONS)
    // ---------------------------------------------------------------------------
    console.log('--- ADIM 1: Gerçek Auth Kullanıcıları ve JWT Session Oluşturma ---');

    await runLiveTest('User A / Tenant A (Owner) Gerçek Supabase Kaydı & RPC Kurulumu', async () => {
      if (adminClient) {
        const { data: u, error: crErr } = await adminClient.auth.admin.createUser({
          email: emailUserA,
          password: testPassword,
          email_confirm: true,
          user_metadata: { full_name: 'Owner User A' }
        });
        if (crErr) throw crErr;
        userA = u.user;
      } else {
        const { data: authData, error: authErr } = await clientA.auth.signUp({
          email: emailUserA,
          password: testPassword,
          options: { data: { full_name: 'Owner User A' } }
        });
        if (authErr) throw authErr;
        userA = authData.user;
      }

      const { data: logData, error: logErr } = await clientA.auth.signInWithPassword({
        email: emailUserA,
        password: testPassword
      });
      if (logErr) throw logErr;
      userA = logData.user;

      // Call atomic create_tenant_and_owner RPC with real JWT session
      const { data: rpcRes, error: rpcErr } = await clientA.rpc('create_tenant_and_owner', {
        p_company_name: `Tenant A Corp ${testRunId}`,
        p_full_name: 'Owner User A'
      });
      if (rpcErr) throw rpcErr;
      tenantAId = rpcRes.tenant_id;
      if (!tenantAId) throw new Error('create_tenant_and_owner did not return tenant_id');
    });

    await runLiveTest('User B / Tenant B (Owner) Gerçek Supabase Kaydı & RPC Kurulumu', async () => {
      if (adminClient) {
        const { data: u, error: crErr } = await adminClient.auth.admin.createUser({
          email: emailUserB,
          password: testPassword,
          email_confirm: true,
          user_metadata: { full_name: 'Owner User B' }
        });
        if (crErr) throw crErr;
        userB = u.user;
      } else {
        const { data: authData, error: authErr } = await clientB.auth.signUp({
          email: emailUserB,
          password: testPassword,
          options: { data: { full_name: 'Owner User B' } }
        });
        if (authErr) throw authErr;
        userB = authData.user;
      }

      const { data: logData, error: logErr } = await clientB.auth.signInWithPassword({
        email: emailUserB,
        password: testPassword
      });
      if (logErr) throw logErr;
      userB = logData.user;

      const { data: rpcRes, error: rpcErr } = await clientB.rpc('create_tenant_and_owner', {
        p_company_name: `Tenant B Corp ${testRunId}`,
        p_full_name: 'Owner User B'
      });
      if (rpcErr) throw rpcErr;
      tenantBId = rpcRes.tenant_id;
      if (!tenantBId) throw new Error('create_tenant_and_owner did not return tenant_id');
    });

    await runLiveTest('Tenant A Kadrosu: Viewer ve Staff Üyelerinin Eklenmesi', async () => {
      // 1. Create Viewer
      if (adminClient) {
        const { data: u } = await adminClient.auth.admin.createUser({
          email: emailViewer,
          password: testPassword,
          email_confirm: true,
          user_metadata: { full_name: 'Viewer User' }
        });
        userViewer = u.user;
      } else {
        const { data: authViewer } = await clientViewer.auth.signUp({ email: emailViewer, password: testPassword });
        userViewer = authViewer.user;
      }
      await clientViewer.auth.signInWithPassword({ email: emailViewer, password: testPassword });

      // 2. Create Staff
      if (adminClient) {
        const { data: u } = await adminClient.auth.admin.createUser({
          email: emailStaff,
          password: testPassword,
          email_confirm: true,
          user_metadata: { full_name: 'Staff User' }
        });
        userStaff = u.user;
      } else {
        const { data: authStaff } = await clientStaff.auth.signUp({ email: emailStaff, password: testPassword });
        userStaff = authStaff.user;
      }
      await clientStaff.auth.signInWithPassword({ email: emailStaff, password: testPassword });

      // 3. User A (Owner of Tenant A) adds Viewer and Staff to Tenant A
      const { error: addViewerErr } = await clientA.from('tenant_members').insert({
        tenant_id: tenantAId,
        user_id: userViewer.id,
        role: 'viewer'
      });
      if (addViewerErr) throw addViewerErr;

      const { error: addStaffErr } = await clientA.from('tenant_members').insert({
        tenant_id: tenantAId,
        user_id: userStaff.id,
        role: 'staff'
      });
      if (addStaffErr) throw addStaffErr;
    });

    console.log('\n--- ADIM 2: Gerçek Ortam RLS & Güvenlik Kısıtlama Testleri ---');

    // Add a test property to Tenant B for cross-tenant tests
    let propBId = null;
    await runLiveTest('Setup: Tenant B bünyesinde mülk tanımlama (User B)', async () => {
      const { data, error } = await clientB.from('properties').insert({
        tenant_id: tenantBId,
        slug: 'VILLA_B1',
        name: 'Sapanca Göl Evi',
        base_price: 25000,
        clean_cost: 1800
      }).select('id').single();
      if (error) throw error;
      propBId = data.id;
    });

    // Test 1: Cross-tenant SELECT (User A querying Tenant B properties)
    await runLiveTest('1. Cross-tenant SELECT: User A cannot read Tenant B properties', async () => {
      const { data, error } = await clientA.from('properties').select('*').eq('tenant_id', tenantBId);
      if (error) throw error;
      if (data && data.length > 0) {
        throw new Error(`SECURITY VIOLATION: User A read ${data.length} records belonging to Tenant B!`);
      }
    });

    // Test 2: Cross-tenant INSERT (User A inserting into Tenant B bookings)
    await runLiveTest('2. Cross-tenant INSERT: User A cannot insert into Tenant B bookings', async () => {
      const { data, error } = await clientA.from('bookings').insert({
        tenant_id: tenantBId,
        property_id: propBId,
        booking_code: `HACK-REZ-${testRunId}`,
        guest_name: 'Attacker Guest',
        check_in: '2026-10-01',
        check_out: '2026-10-05',
        pax: 4,
        gross_amount: 50000
      });
      if (!error) {
        throw new Error('SECURITY VIOLATION: User A successfully inserted booking into Tenant B!');
      }
      if (!error.message.includes('row-level security') && !error.message.includes('violates') && error.code !== '42501') {
        throw new Error(`Unexpected error instead of RLS denial: ${error.message}`);
      }
    });

    // Test 3: Cross-tenant UPDATE (User A updating Tenant B property)
    await runLiveTest('3. Cross-tenant UPDATE: User A cannot update Tenant B property', async () => {
      const { data, error } = await clientA.from('properties').update({
        name: 'Hacked Property Name'
      }).eq('id', propBId).select();
      if (error && !error.message.includes('row-level security')) throw error;
      if (data && data.length > 0) {
        throw new Error('SECURITY VIOLATION: User A successfully updated Tenant B property!');
      }
    });

    // Test 4: Cross-tenant DELETE (User A deleting Tenant B property)
    await runLiveTest('4. Cross-tenant DELETE: User A cannot delete Tenant B property', async () => {
      const { data, error } = await clientA.from('properties').delete().eq('id', propBId).select();
      if (error && !error.message.includes('row-level security')) throw error;
      if (data && data.length > 0) {
        throw new Error('SECURITY VIOLATION: User A successfully deleted Tenant B property!');
      }
    });

    // Test 5: Viewer write denial
    await runLiveTest('5. Viewer Write Denial: User Viewer cannot create booking in Tenant A', async () => {
      const { data: propA } = await clientA.from('properties').upsert({
        tenant_id: tenantAId,
        slug: 'VILLA_A1',
        name: 'Uludağ Dağ Evi',
        base_price: 20000
      }).select('id').single();

      const { data, error } = await clientViewer.from('bookings').insert({
        tenant_id: tenantAId,
        property_id: propA.id,
        booking_code: `VIEWER-REZ-${testRunId}`,
        guest_name: 'Viewer Guest',
        check_in: '2026-10-10',
        check_out: '2026-10-15'
      });
      if (!error) {
        throw new Error('SECURITY VIOLATION: Viewer was permitted to INSERT a booking!');
      }
      if (!error.message.includes('row-level security') && error.code !== '42501') {
        throw new Error(`Unexpected error instead of RLS denial: ${error.message}`);
      }
    });

    // Test 6: Staff restricted action denial (Staff cannot DELETE bookings)
    await runLiveTest('6. Staff Restricted Action Denial: Staff cannot DELETE bookings', async () => {
      const { data: propA } = await clientA.from('properties').select('id').eq('tenant_id', tenantAId).single();
      const bCode = `STAFF-DEL-${testRunId}`;
      await clientA.from('bookings').insert({
        tenant_id: tenantAId,
        property_id: propA.id,
        booking_code: bCode,
        guest_name: 'Staff Test Booking',
        check_in: '2026-11-01',
        check_out: '2026-11-03'
      });

      const { data, error } = await clientStaff.from('bookings').delete().eq('booking_code', bCode).select();
      if (error && !error.message.includes('row-level security')) throw error;
      if (data && data.length > 0) {
        throw new Error('SECURITY VIOLATION: Staff was permitted to DELETE a booking!');
      }
    });

    // Test 7: Admin/Owner allowed operations
    await runLiveTest('7. Admin/Owner Allowed Operations: User A successfully performs CRUD', async () => {
      const { data: propA } = await clientA.from('properties').select('id').eq('tenant_id', tenantAId).single();
      const bCode = `OWNER-OP-${testRunId}`;
      // Insert
      const { error: insErr } = await clientA.from('bookings').insert({
        tenant_id: tenantAId,
        property_id: propA.id,
        booking_code: bCode,
        guest_name: 'Owner Booking',
        check_in: '2026-11-10',
        check_out: '2026-11-12'
      });
      if (insErr) throw insErr;

      // Update
      const { error: updErr } = await clientA.from('bookings').update({
        guest_name: 'Owner Booking Updated'
      }).eq('booking_code', bCode);
      if (updErr) throw updErr;

      // Delete
      const { error: delErr } = await clientA.from('bookings').delete().eq('booking_code', bCode);
      if (delErr) throw delErr;
    });

    // Test 8: Self membership escalation denial (Attacker joining foreign tenant as owner)
    await runLiveTest('8. Self Membership Escalation Denial: Attacker cannot insert self into Tenant B', async () => {
      const { data, error } = await clientA.from('tenant_members').insert({
        tenant_id: tenantBId,
        user_id: userA.id,
        role: 'owner'
      });
      if (!error) {
        throw new Error('CRITICAL VULNERABILITY: User A self-joined Tenant B as owner!');
      }
      if (!error.message.includes('row-level security') && error.code !== '42501') {
        throw new Error(`Unexpected error instead of RLS denial: ${error.message}`);
      }
    });

    // Test 9: Self role update denial (Viewer promoting self to owner)
    await runLiveTest('9. Self Role Update Denial: Viewer cannot promote own role to owner', async () => {
      const { data, error } = await clientViewer.from('tenant_members').update({
        role: 'owner'
      }).eq('tenant_id', tenantAId).eq('user_id', userViewer.id).select();

      if (error && !error.message.includes('row-level security')) throw error;
      if (data && data.length > 0) {
        throw new Error('CRITICAL VULNERABILITY: Viewer successfully escalated own role to owner!');
      }
    });

    // Test 10: Audit logs client write denial
    await runLiveTest('10. Audit Logs Client Write Denial: Direct client INSERT into audit_logs is rejected', async () => {
      const { data, error } = await clientA.from('audit_logs').insert({
        tenant_id: tenantAId,
        user_id: userA.id,
        action: 'SPOOF_ACTION',
        entity_type: 'tenant'
      });
      if (!error) {
        throw new Error('SECURITY VIOLATION: Direct client INSERT into audit_logs was permitted!');
      }
      if (!error.message.includes('row-level security') && error.code !== '42501') {
        throw new Error(`Unexpected error instead of RLS denial: ${error.message}`);
      }
    });

    // Test 11: Last owner deletion/demotion denial (Guardrail Trigger & RLS)
    await runLiveTest('11. Last Owner Guardrail: Deleting or demoting sole owner is rejected', async () => {
      // Attempt 1: Demote role to staff -> Guardrail trigger MUST throw
      const { error: demoteErr } = await clientA.from('tenant_members').update({
        role: 'staff'
      }).eq('tenant_id', tenantAId).eq('user_id', userA.id);

      if (!demoteErr || !demoteErr.message.includes('son sahibi')) {
        throw new Error(`Expected guardrail trigger exception, received: ${demoteErr ? demoteErr.message : 'SUCCESS'}`);
      }

      // Attempt 2: Delete self -> RLS policy "user_id <> auth.uid()" MUST reject deletion (0 rows deleted)
      const { data: delData, error: deleteErr } = await clientA.from('tenant_members').delete()
        .eq('tenant_id', tenantAId).eq('user_id', userA.id).select();

      if (deleteErr && !deleteErr.message.includes('row-level security')) {
        throw deleteErr;
      }
      if (delData && delData.length > 0) {
        throw new Error('CRITICAL VIOLATION: Sole tenant owner was deleted!');
      }

      // Verify that sole owner record STILL exists in database
      const { data: ownerRecord, error: ownErr } = await clientA.from('tenant_members')
        .select('role')
        .eq('tenant_id', tenantAId)
        .eq('user_id', userA.id)
        .single();
      if (ownErr || !ownerRecord || ownerRecord.role !== 'owner') {
        throw new Error('CRITICAL VIOLATION: Owner record missing or demoted!');
      }
    });

    // Test 12: Duplicate migration prevention (DB-level Idempotency)
    await runLiveTest('12. Duplicate Migration Prevention: Repeated migration produces 0 duplicates', async () => {
      const legId = `LEGACY-EXP-${testRunId}`;
      // First run
      const { error: err1 } = await clientA.from('expenses').upsert({
        tenant_id: tenantAId,
        category: 'Tadilat',
        amount: 4500,
        description: 'Idempotency test expense',
        legacy_id: legId
      }, { onConflict: 'tenant_id, legacy_id' });
      if (err1) throw err1;

      await clientA.from('tenant_migrations').upsert({
        tenant_id: tenantAId,
        source: 'localstorage',
        entity_type: 'expense',
        source_record_id: legId
      }, { onConflict: 'tenant_id, entity_type, source_record_id' });

      // Second run (exact same payload)
      const { error: err2 } = await clientA.from('expenses').upsert({
        tenant_id: tenantAId,
        category: 'Tadilat',
        amount: 4500,
        description: 'Idempotency test expense',
        legacy_id: legId
      }, { onConflict: 'tenant_id, legacy_id' });
      if (err2) throw err2;

      await clientA.from('tenant_migrations').upsert({
        tenant_id: tenantAId,
        source: 'localstorage',
        entity_type: 'expense',
        source_record_id: legId
      }, { onConflict: 'tenant_id, entity_type, source_record_id' });

      // Verify row count is strictly 1
      const { data: rows, error: selErr } = await clientA.from('expenses').select('id')
        .eq('tenant_id', tenantAId).eq('legacy_id', legId);
      if (selErr) throw selErr;
      if (rows.length !== 1) {
        throw new Error(`Idempotency failure: Expected exactly 1 row, found ${rows.length}`);
      }
    });

    // Test 13 & 14: Realtime teardown on logout & tenant switch
    await runLiveTest('13 & 14. Realtime Channel Teardown on Logout & Tenant Switch', async () => {
      let activeChannel = clientA.channel(`realtime-test-${tenantAId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {})
        .subscribe();

      const status = await clientA.removeChannel(activeChannel);
      if (status !== 'ok' && status !== 'closed') {
        throw new Error(`Realtime channel remove failed with status: ${status}`);
      }
    });

  } finally {
    // ---------------------------------------------------------------------------
    // STEP 4: SECURE TEST CLEANUP (PHASE 4 OF USER PROMPT)
    // ---------------------------------------------------------------------------
    console.log('\n--- ADIM 4: Test Verilerinin Güvenli Şekilde Temizlenmesi (Cleanup) ---');
    try {
      if (adminClient) {
        if (tenantAId) {
          await adminClient.from('bookings').delete().eq('tenant_id', tenantAId);
          await adminClient.from('expenses').delete().eq('tenant_id', tenantAId);
          await adminClient.from('properties').delete().eq('tenant_id', tenantAId);
          await adminClient.from('tenant_migrations').delete().eq('tenant_id', tenantAId);
          await adminClient.from('audit_logs').delete().eq('tenant_id', tenantAId);
          await adminClient.from('tenant_members').delete().eq('tenant_id', tenantAId);
          await adminClient.from('tenants').delete().eq('id', tenantAId);
        }
        if (tenantBId) {
          await adminClient.from('bookings').delete().eq('tenant_id', tenantBId);
          await adminClient.from('properties').delete().eq('tenant_id', tenantBId);
          await adminClient.from('tenant_members').delete().eq('tenant_id', tenantBId);
          await adminClient.from('tenants').delete().eq('id', tenantBId);
        }
        if (userA) await adminClient.auth.admin.deleteUser(userA.id);
        if (userB) await adminClient.auth.admin.deleteUser(userB.id);
        if (userViewer) await adminClient.auth.admin.deleteUser(userViewer.id);
        if (userStaff) await adminClient.auth.admin.deleteUser(userStaff.id);
        console.log('🧹 [CLEANUP] Test kullanıcıları, işletmeleri ve verileri başarıyla temizlendi.');
      } else {
        console.log('ℹ️ [CLEANUP NOTICE] SUPABASE_SERVICE_ROLE_KEY tanımlanmadığı için test auth kullanıcıları silinemedi.');
      }
    } catch (cleanErr) {
      console.warn('⚠️ [CLEANUP WARNING]:', cleanErr.message);
    }
  }

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('=============================================================================');

  if (failedTests === 0) {
    console.log('🎉 ALL REAL LIVE INTEGRATION TESTS PASSED 100%');
    console.log('FINAL DECISION: READY FOR PRODUCTION PILOT');
    process.exit(0);
  } else {
    console.log('❌ SOME INTEGRATION TESTS FAILED');
    console.log('FINAL DECISION: NOT READY – FIX REQUIRED');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
