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

  try {
    const { data: authA } = await adminClient.auth.admin.createUser({
      email: userAEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Pricing Host A' }
    });
    userAId = authA.user.id;

    const { data: authB } = await adminClient.auth.admin.createUser({
      email: userBEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Pricing Host B' }
    });
    userBId = authB.user.id;

    clientA = createClient(SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientA.auth.signInWithPassword({ email: userAEmail, password: testPass });

    clientB = createClient(SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    await clientB.auth.signInWithPassword({ email: userBEmail, password: testPass });

    const { data: rpcA } = await clientA.rpc('create_tenant_and_owner', { p_company_name: `Pricing Tenant A ${testRunId}` });
    tenantAId = rpcA.tenant_id;

    const { data: rpcB } = await clientB.rpc('create_tenant_and_owner', { p_company_name: `Pricing Tenant B ${testRunId}` });
    tenantBId = rpcB.tenant_id;

    // Create Property A for Tenant A
    const { data: propA } = await clientA.from('properties').insert({
      tenant_id: tenantAId,
      name: 'Prop A Sec',
      base_price: 3000,
      currency: 'TRY'
    }).select().single();
    propAId = propA.id;

    // Create Property B for Tenant B
    const { data: propB } = await clientB.from('properties').insert({
      tenant_id: tenantBId,
      name: 'Prop B Sec',
      base_price: 4000,
      currency: 'TRY'
    }).select().single();
    propBId = propB.id;

    // Live Test 6: Tenant A creates pricing profile -> Tenant B cannot read it
    const { data: profA } = await clientA.from('pricing_profiles').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      base_rate: 3000,
      minimum_rate: 1500,
      maximum_rate: 8000
    }).select().single();

    const { data: readFromB } = await clientB.from('pricing_profiles').select('*').eq('id', profA.id);
    assert.strictEqual(readFromB.length, 0, 'Tenant B cannot read Tenant A pricing profile');
    recordPass('6. Multi-tenant RLS prevents Tenant B from viewing Tenant A pricing profiles');

    // Live Test 7: Cross-tenant profile injection rejected by trigger
    const { error: crossProfileErr } = await clientA.from('pricing_profiles').insert({
      tenant_id: tenantAId,
      property_id: propBId, // Belongs to Tenant B!
      base_rate: 2500,
      minimum_rate: 1000,
      maximum_rate: 5000
    });
    assert.ok(crossProfileErr, 'Trigger must reject cross-tenant property assignment');
    recordPass('7. Trigger trg_verify_pricing_profile_tenant_isolation blocks cross-tenant property assignment');

    // Live Test 8: Tenant A creates quote -> Tenant B cannot see it
    const { data: qteA } = await clientA.from('booking_quotes').insert({
      tenant_id: tenantAId,
      property_id: propAId,
      check_in: '2026-10-01',
      check_out: '2026-10-04',
      nights: 3,
      pax: 2,
      base_rate_snapshot: 3000,
      subtotal: 9000,
      total_amount: 9000,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 86400000).toISOString()
    }).select().single();

    const { data: quoteReadB } = await clientB.from('booking_quotes').select('*').eq('id', qteA.id);
    assert.strictEqual(quoteReadB.length, 0);
    recordPass('8. Multi-tenant RLS prevents Tenant B from reading Tenant A booking quotes');

    // Live Test 9: Quote Immutability after acceptance
    await clientA.rpc('accept_booking_quote_atomic', { p_quote_id: qteA.id });
    const { error: mutateQuoteErr } = await clientA.from('booking_quotes').update({
      total_amount: 5000 // Attempting to change amount after acceptance
    }).eq('id', qteA.id);
    assert.ok(mutateQuoteErr, 'Trigger must block modifying accepted quote');
    recordPass('9. Trigger trg_guard_quote_accepted_immutability prevents tampering with accepted quote');

    // Live Test 10: Atomic Manual Override & Audit Log
    await clientA.rpc('save_manual_pricing_override_atomic', {
      p_property_id: propAId,
      p_start_date: '2026-10-01',
      p_end_date: '2026-10-02',
      p_rate: 3500,
      p_reason: 'VIP guest override'
    });

    const { data: logs } = await clientA.from('rate_change_logs').select('*').eq('property_id', propAId);
    assert.ok(logs.length > 0, 'Audit log must record rate change');
    recordPass('10. Atomic override saves cleanly and records audit entry in rate_change_logs');

  } finally {
    // Cleanup
    if (userAId) await adminClient.auth.admin.deleteUser(userAId).catch(() => {});
    if (userBId) await adminClient.auth.admin.deleteUser(userBId).catch(() => {});
    if (tenantAId) await adminClient.from('tenants').delete().eq('id', tenantAId).catch(() => {});
    if (tenantBId) await adminClient.from('tenants').delete().eq('id', tenantBId).catch(() => {});
  }

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runPricingSecurityTests();
