// =============================================================================
// LEXBNB PHASE 10 — MESSAGING SECURITY & RLS TEST SUITE
// Tests multi-tenant RLS isolation on guests, templates, automation rules,
// scheduled messages, cross-tenant protection triggers, sent immutability,
// and secret credential containment.
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { maskSensitiveContent, VARIABLE_WHITELIST } = require('./message_template_engine.js');

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
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('=============================================================================');
console.log('🛡️  LEXBNB PHASE 10 — MESSAGING SECURITY & RLS TEST SUITE');
console.log('=============================================================================');

async function runMessagingSecurityTests() {
  const testRunId = Date.now();
  const userAEmail = `msg_sec_a_${testRunId}@lexbnb.test`;
  const userBEmail = `msg_sec_b_${testRunId}@lexbnb.test`;
  const testPass = 'SecPassWord123!';

  let userAId, userBId, tenantAId, tenantBId, propAId, propBId;
  let clientA, clientB;
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  // 1. Static Domain Security & Credential Protection Checks
  console.log('\n--- DOMAIN SECURITY: Sensitive Credential Containment ---');

  // Verify that sensitive credentials are classified as SENSITIVE
  assert.strictEqual(VARIABLE_WHITELIST.wifi_password.type, 'SENSITIVE');
  assert.strictEqual(VARIABLE_WHITELIST.door_code.type, 'SENSITIVE');
  assert.strictEqual(VARIABLE_WHITELIST.lockbox_code.type, 'SENSITIVE');
  recordPass('1. Secrets (wifi_password, door_code, lockbox_code) are classified as SENSITIVE');

  // Verify maskSensitiveContent strips pins and codes
  const rawSecret = 'Kapı şifresi: 4589, Wi-Fi: GizliPass123';
  const masked = maskSensitiveContent(rawSecret);
  assert.strictEqual(masked.includes('4589'), false);
  assert.strictEqual(masked.includes('GizliPass123'), false);
  recordPass('2. Sensitive secret masking cleanly neutralizes credentials for telemetry and logs');

  try {
    // 2. Check if Phase 10 tables exist in DB
    const { error: checkErr } = await adminClient.from('guests').select('id').limit(1);
    if (checkErr && checkErr.code === 'PGRST205') {
      console.log('\n[INFO] Phase 10 tables not yet detected in Supabase cache.');
      console.log('Lütfen supabase/migration_phase10_guest_messaging.sql dosyasını Supabase SQL Editor üzerinden çalıştırın.');
      console.log('\n=============================================================================');
      console.log(`STATIC TESTS PASSED: ${passedTests} / ${totalTests} (Awaiting DB Migration for remaining tests)`);
      console.log('=============================================================================');
      return;
    }

    // Live Database Multi-Tenant RLS & Trigger Tests
    console.log('\n--- SETUP: Provisioning Two Isolated Test Tenants ---');
    const { data: authA } = await adminClient.auth.admin.createUser({
      email: userAEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Msg Sec Host A' }
    });
    userAId = authA.user.id;

    const { data: authB } = await adminClient.auth.admin.createUser({
      email: userBEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Msg Sec Host B' }
    });
    userBId = authB.user.id;

    clientA = createClient(SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientA.auth.signInWithPassword({ email: userAEmail, password: testPass });

    clientB = createClient(SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientB.auth.signInWithPassword({ email: userBEmail, password: testPass });

    const { data: rpcA } = await clientA.rpc('create_tenant_and_owner', { p_company_name: `Msg Tenant A ${testRunId}` });
    tenantAId = rpcA.tenant_id;

    const { data: rpcB } = await clientB.rpc('create_tenant_and_owner', { p_company_name: `Msg Tenant B ${testRunId}` });
    tenantBId = rpcB.tenant_id;

    const { data: pA } = await adminClient.from('properties').insert({
      tenant_id: tenantAId, name: 'Villa Sec A', slug: `VILLA_SEC_A_${testRunId}`, base_price: 5000
    }).select().single();
    propAId = pA.id;

    const { data: pB } = await adminClient.from('properties').insert({
      tenant_id: tenantBId, name: 'Villa Sec B', slug: `VILLA_SEC_B_${testRunId}`, base_price: 6000
    }).select().single();
    propBId = pB.id;

    recordPass('Setup complete: Isolated tenants and authenticated sessions provisioned');

    // TEST 3: Cross-Tenant Guest Isolation
    console.log('\n--- TEST 3: Cross-Tenant Guest Isolation (RLS) ---');
    const { data: guestA, error: gAErr } = await clientA.from('guests').insert({
      tenant_id: tenantAId, first_name: 'Gizli', last_name: 'Misafir', phone: '+905554443322'
    }).select().single();
    assert.strictEqual(!gAErr && Boolean(guestA), true);

    const { data: guestReadByB } = await clientB.from('guests').select('*').eq('id', guestA.id);
    assert.strictEqual(guestReadByB.length, 0);
    recordPass('3. (RLS) Tenant B cannot view Tenant A guest records');

    // TEST 4: Cross-Tenant Template Isolation Trigger
    console.log('\n--- TEST 4: Cross-Tenant Template Isolation Trigger ---');
    const { error: tmplCrossErr } = await adminClient.from('message_templates').insert({
      tenant_id: tenantAId,
      property_id: propBId, // Foreign property
      name: 'Illegal Template',
      channel: 'WHATSAPP',
      lifecycle_stage: 'CHECKIN_INSTRUCTIONS',
      body: 'Giriş talimatları'
    });
    assert.strictEqual(Boolean(tmplCrossErr), true);
    recordPass('4. (DB Trigger) Template referencing foreign tenant property is strictly rejected');

    // TEST 5: Cross-Tenant Automation Rule Isolation Trigger
    console.log('\n--- TEST 5: Cross-Tenant Automation Rule Isolation Trigger ---');
    const { data: tmplA } = await adminClient.from('message_templates').insert({
      tenant_id: tenantAId, name: 'Valid Template A', channel: 'WHATSAPP', lifecycle_stage: 'PRE_ARRIVAL', body: 'Hoş geldiniz'
    }).select().single();

    const { error: ruleCrossErr } = await adminClient.from('message_automation_rules').insert({
      tenant_id: tenantBId, // Tenant B rule referencing Tenant A template
      template_id: tmplA.id,
      name: 'Illegal Rule',
      lifecycle_stage: 'PRE_ARRIVAL',
      channel: 'WHATSAPP',
      trigger_type: 'BOOKING_CREATED'
    });
    assert.strictEqual(Boolean(ruleCrossErr), true);
    recordPass('5. (DB Trigger) Automation rule referencing foreign tenant template is strictly rejected');

    // TEST 6: Sent Message Immutability Trigger
    console.log('\n--- TEST 6: Sent Message Immutability Trigger ---');
    const { data: sentMsg } = await adminClient.from('scheduled_messages').insert({
      tenant_id: tenantAId,
      channel: 'WHATSAPP',
      recipient: '+905554443322',
      recipient_snapshot: '+905554443322',
      scheduled_at: new Date().toISOString(),
      status: 'SENT',
      rendered_body: 'Gönderilmiş orijinal içerik',
      idempotency_key: `test_immutability_${testRunId}`
    }).select().single();

    // Attempt mutation of rendered_body on SENT message
    const { error: updateErr } = await adminClient.from('scheduled_messages').update({
      rendered_body: 'Tahrif edilmiş içerik'
    }).eq('id', sentMsg.id);
    assert.strictEqual(Boolean(updateErr), true);

    // Attempt deletion of SENT message
    const { error: deleteErr } = await adminClient.from('scheduled_messages').delete().eq('id', sentMsg.id);
    assert.strictEqual(Boolean(deleteErr), true);
    recordPass('6. (DB Trigger) Sent messages cannot be updated or deleted (audit protection)');

    // TEST 7: Cross-Tenant Scheduled Message Access Denial
    console.log('\n--- TEST 7: Cross-Tenant Scheduled Message Access Denial ---');
    const { data: readScheduledByB } = await clientB.from('scheduled_messages').select('*').eq('id', sentMsg.id);
    assert.strictEqual(readScheduledByB.length, 0);
    recordPass('7. (RLS) Tenant B cannot access Tenant A scheduled messages');

    // TEST 8: Atomic Stale Processing Recovery RPC
    console.log('\n--- TEST 8: Atomic Stale Processing Recovery RPC ---');
    const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: staleMsg } = await adminClient.from('scheduled_messages').insert({
      tenant_id: tenantAId,
      channel: 'WHATSAPP',
      recipient: '+905554443322',
      scheduled_at: staleTime,
      status: 'PROCESSING',
      claimed_at: staleTime,
      claimed_by: 'crashed_worker_1',
      rendered_body: 'Stale task',
      idempotency_key: `stale_test_${testRunId}`
    }).select().single();

    const { data: claimedBatch, error: claimErr } = await adminClient.rpc('claim_scheduled_messages_atomic', {
      p_tenant_id: tenantAId,
      p_worker_id: 'active_worker_2',
      p_batch_size: 5,
      p_stale_timeout_minutes: 5
    });
    assert.strictEqual(!claimErr && Array.isArray(claimedBatch), true);
    const reclaimedTarget = claimedBatch.find(m => m.id === staleMsg.id);
    assert.strictEqual(Boolean(reclaimedTarget), true);
    assert.strictEqual(reclaimedTarget.claimed_by, 'active_worker_2');
    recordPass('8. (Atomic RPC) Stale PROCESSING message reclaimed and assigned to new worker without deadlock');

    // CLEANUP
    console.log('\n--- CLEANUP ---');
    await adminClient.from('properties').delete().in('id', [propAId, propBId]);
    await adminClient.from('tenants').delete().in('id', [tenantAId, tenantBId]);
    await adminClient.auth.admin.deleteUser(userAId);
    await adminClient.auth.admin.deleteUser(userBId);
    console.log('[PASS] Cleanup finished.');

    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
    console.log('=============================================================================');

  } catch (err) {
    console.error('[FAIL] Messaging security test suite error:', err);
    process.exit(1);
  }
}

runMessagingSecurityTests().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
