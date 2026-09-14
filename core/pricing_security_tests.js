// =============================================================================
// LEXBNB PHASE 11 — PRICING SECURITY & RLS TEST SUITE
// Tests multi-tenant isolation on pricing profiles, rules, events, overrides,
// daily rates, booking quotes, trigger protections, and quote immutability.
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const PricingEngine = require('./pricing_engine.js');
const PricingBookingService = require('./pricing_booking_service.js');

const env = require('./test_env.js').loadTestEnv();

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('=============================================================================');
console.log('🛡️  LEXBNB PHASE 11 — PRICING SECURITY & RLS TEST SUITE');
console.log('=============================================================================');

async function runPricingSecurityTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  // 1. Static Domain Security & Guardrail Protection Checks
  console.log('\n--- DOMAIN SECURITY: Guardrails & Role Privilege Checks ---');

  // Test 1: Normal user cannot bypass guardrails in PricingEngine
  const testProp = { id: 'p-sec-1', base_price: 3000, min_price: 1500, max_price: 6000 };
  const testProfile = { property_id: 'p-sec-1', minimum_rate: 1500, maximum_rate: 6000 };

  const lowOverride = {
    property_id: 'p-sec-1',
    start_date: '2026-09-20',
    end_date: '2026-09-20',
    rate: 800, // Below minimum 1500
    bypass_guardrail: false
  };

  const clampedRes = PricingEngine.calculateDailyPrice({
    property: testProp,
    profile: testProfile,
    date: '2026-09-20',
    overrides: [lowOverride],
    userRole: 'staff'
  });
  assert.strictEqual(clampedRes.finalRate, 1500, 'Staff override must be clamped to minimum rate');
  recordPass('1. (Correction 1) Staff manual override is strictly clamped to minimum_rate floor (1500 TL)');

  // Test 2: Staff attempting explicit bypass throws unauthorized
  let staffErrorThrown = false;
  try {
    PricingEngine.calculateDailyPrice({
      property: testProp,
      profile: testProfile,
      date: '2026-09-20',
      overrides: [{ ...lowOverride, bypass_guardrail: true }],
      userRole: 'staff'
    });
  } catch (err) {
    staffErrorThrown = true;
    assert.ok(err.message.includes('UNAUTHORIZED'));
  }
  assert.strictEqual(staffErrorThrown, true);
  recordPass('2. (Correction 1 & 2) Non-owner user role attempting bypass_guardrail is strictly rejected with UNAUTHORIZED');

  // Test 3: Owner role explicit bypass succeeds
  const ownerBypassRes = PricingEngine.calculateDailyPrice({
    property: testProp,
    profile: testProfile,
    date: '2026-09-20',
    overrides: [{ ...lowOverride, bypass_guardrail: true }],
    userRole: 'owner'
  });
  assert.strictEqual(ownerBypassRes.finalRate, 800);
  assert.ok(ownerBypassRes.rulesApplied.includes('MANUAL_OVERRIDE_GUARDRAIL_BYPASSED'));
  recordPass('3. (Correction 2) Owner role with bypass_guardrail successfully sets privileged sub-guardrail rate');

  // Test 4: Pricing rule mode mutual exclusivity verification
  function validateRulePricingMode(rule) {
    const hasMult = rule.multiplier !== undefined && rule.multiplier !== null;
    const hasFixed = rule.fixed_rate_override !== undefined && rule.fixed_rate_override !== null;
    if ((hasMult && hasFixed) || (!hasMult && !hasFixed)) {
      return { valid: false, error: 'RULE_PRICING_MODE_INVALID' };
    }
    return { valid: true };
  }
  assert.strictEqual(validateRulePricingMode({ multiplier: 1.2 }).valid, true);
  assert.strictEqual(validateRulePricingMode({ fixed_rate_override: 2500 }).valid, true);
  assert.strictEqual(validateRulePricingMode({ multiplier: 1.2, fixed_rate_override: 2500 }).valid, false);
  assert.strictEqual(validateRulePricingMode({}).valid, false);
  recordPass('4. (Correction 4) Pricing rule mode enforces mutual exclusivity (multiplier XOR fixed_rate_override)');

  // Test 5: Quote state transition & acceptance security
  const testQuote = {
    quote_id: 'QTE-123',
    status: 'ACCEPTED',
    expires_at: new Date(Date.now() + 86400000).toISOString()
  };
  const reAcceptCheck = PricingBookingService.validateQuoteAcceptance(testQuote);
  assert.strictEqual(reAcceptCheck.valid, false);
  assert.strictEqual(reAcceptCheck.error, 'QUOTE_INACTIVE');
  recordPass('5. (Correction 16) Terminal accepted quotes cannot be re-accepted or mutated');

  // 2. Check if Phase 11 tables exist in DB
  const { error: checkErr } = await adminClient.from('pricing_profiles').select('id').limit(1);
  if (checkErr && checkErr.code === 'PGRST205') {
    console.log('\n[INFO] Phase 11 tables not yet detected in Supabase schema cache.');
    console.log('Lütfen supabase/migration_phase11_pricing.sql dosyasını Supabase SQL Editor üzerinden çalıştırın.');
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
    console.log('=============================================================================\n');
    return;
  }

  // Live Database Multi-Tenant RLS & Trigger Tests
  console.log('\n--- LIVE DATABASE: Multi-Tenant RLS & Triggers ---');
  const testRunId = Date.now();
  const userAEmail = `pricing_sec_a_${testRunId}@lexbnb.test`;
  const userBEmail = `pricing_sec_b_${testRunId}@lexbnb.test`;
  const testPass = 'SecPassWord123!';

  let userAId, userBId, tenantAId, tenantBId, propAId, propBId;
  let clientA, clientB;

  // Supabase JS FIRLATMAZ, { error } dondurur (CLAUDE.md 5.1). Hata
  // okunmadiginda bir sonraki satir "null.id" ile patliyor ve ASIL sebep
  // (ornegin eksik sutun) hicbir yerde gorunmuyordu. Bu yardimci sebebi
  // hatanin kendisine yazar.
  const must = (result, what) => {
    if (result.error) {
      throw new Error(`${what}: ${result.error.code || ''} ${result.error.message}`.trim());
    }
    return result.data;
  };

  try {
    userAId = must(await adminClient.auth.admin.createUser({
      email: userAEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Pricing Host A' }
    }), 'createUser A').user.id;

    userBId = must(await adminClient.auth.admin.createUser({
      email: userBEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Pricing Host B' }
    }), 'createUser B').user.id;

    clientA = createClient(SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    must(await clientA.auth.signInWithPassword({ email: userAEmail, password: testPass }), 'signIn A');

    clientB = createClient(SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    must(await clientB.auth.signInWithPassword({ email: userBEmail, password: testPass }), 'signIn B');

    tenantAId = must(await clientA.rpc('create_tenant_and_owner', { p_company_name: `Pricing Tenant A ${testRunId}` }), 'create_tenant A').tenant_id;

    tenantBId = must(await clientB.rpc('create_tenant_and_owner', { p_company_name: `Pricing Tenant B ${testRunId}` }), 'create_tenant B').tenant_id;

    // Create Property A for Tenant A
    const propA = must(await clientA.from('properties').insert({
      tenant_id: tenantAId,
      name: 'Prop A Sec',
      slug: 'PROPA' + testRunId,
      base_price: 3000
    }).select().single(), 'properties insert A');
    propAId = propA.id;

    // Create Property B for Tenant B
    const propB = must(await clientB.from('properties').insert({
      tenant_id: tenantBId,
      name: 'Prop B Sec',
      slug: 'PROPB' + testRunId,
      base_price: 4000
    }).select().single(), 'properties insert B');
    propBId = propB.id;

    // Live Test 6: Tenant A creates pricing profile -> Tenant B cannot read it
    const profA = must(await clientA.from('pricing_profiles').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      weekday_base_rate: 3000,
      weekend_base_rate: 3600,
      minimum_rate: 1500,
      maximum_rate: 8000
    }).select().single(), 'pricing_profiles insert A');

    const readFromB = must(await clientB.from('pricing_profiles').select('*').eq('id', profA.id), 'pricing_profiles read B');
    assert.strictEqual(readFromB.length, 0, 'Tenant B cannot read Tenant A pricing profile');
    recordPass('6. Multi-tenant RLS prevents Tenant B from viewing Tenant A pricing profiles');

    // Live Test 7: Cross-tenant profile injection rejected by trigger
    const { error: crossProfileErr } = await clientA.from('pricing_profiles').insert({
      tenant_id: tenantAId,
      property_id: propBId, // Belongs to Tenant B!
      weekday_base_rate: 2500,
      weekend_base_rate: 2900,
      minimum_rate: 1000,
      maximum_rate: 5000
    });
    assert.ok(crossProfileErr, 'Trigger must reject cross-tenant property assignment');
    recordPass('7. Trigger trg_verify_pricing_profile_tenant_isolation blocks cross-tenant property assignment');

    // Live Test 8: Tenant A creates quote -> Tenant B cannot see it
    const qteA = must(await clientA.from('booking_quotes').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      check_in: '2026-10-01',
      check_out: '2026-10-04',
      quoted_total: 9000,
      nightly_breakdown: [
        { date: '2026-10-01', rate: 3000 },
        { date: '2026-10-02', rate: 3000 },
        { date: '2026-10-03', rate: 3000 }
      ],
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 86400000).toISOString()
    }).select().single(), 'booking_quotes insert A');

    const quoteReadB = must(await clientB.from('booking_quotes').select('*').eq('id', qteA.id), 'booking_quotes read B');
    assert.strictEqual(quoteReadB.length, 0);
    recordPass('8. Multi-tenant RLS prevents Tenant B from reading Tenant A booking quotes');

    // Live Test 9: Quote Immutability after acceptance
    must(await clientA.rpc('accept_booking_quote_atomic', {
      p_tenant_id: tenantAId, p_quote_id: qteA.id
    }), 'accept_booking_quote_atomic');
    const { error: mutateQuoteErr } = await clientA.from('booking_quotes').update({
      quoted_total: 5000 // Kabul edilmis teklifin tutarini degistirme denemesi
    }).eq('id', qteA.id);
    assert.ok(mutateQuoteErr, 'Trigger must block modifying accepted quote');
    recordPass('9. Trigger trg_guard_quote_accepted_immutability prevents tampering with accepted quote');

    // Live Test 10: Atomic Manual Override & Audit Log
    must(await clientA.rpc('save_manual_pricing_override_atomic', {
      p_tenant_id: tenantAId,
      p_property_id: propAId,
      p_start_date: '2026-10-01',
      p_end_date: '2026-10-02',
      p_rate_override: 3500,
      p_reason: 'VIP guest override'
    }), 'save_manual_pricing_override_atomic');

    const logs = must(await clientA.from('rate_change_logs').select('*').eq('property_id', propAId), 'rate_change_logs read');
    assert.ok(logs.length > 0, 'Audit log must record rate change');
    recordPass('10. Atomic override saves cleanly and records audit entry in rate_change_logs');

  } finally {
    // Cleanup
    if (userAId) await adminClient.auth.admin.deleteUser(userAId).catch(() => {});
    if (userBId) await adminClient.auth.admin.deleteUser(userBId).catch(() => {});
    // Supabase JS FIRLATMAZ, { error } dondurur (CLAUDE.md 5.1) — PostgREST
    // sorgu nesnesinde .catch() tanimli DEGIL. Buradaki .catch(() => {}) her
    // temizlikte TypeError atiyor ve finally'den once olusan ASIL hatayi
    // tamamen gizliyordu; suit bu yuzden sebebi gorunmez bir sekilde kirmiziydi.
    for (const [label, id] of [['A', tenantAId], ['B', tenantBId]]) {
      if (!id) continue;
      const { error } = await adminClient.from('tenants').delete().eq('id', id);
      if (error) console.error(`[CLEANUP] Tenant ${label} silinemedi: ${error.message}`);
    }
  }

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runPricingSecurityTests();
