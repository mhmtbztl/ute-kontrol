/** Phase 76 — reklam donemi tenant degismezligi (CANLI, YALNIZ TEST PROJESI). */
const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const fresh = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
let passed = 0, failed = 0;
const users = [], tenants = [];
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const must = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.message}`); return r.data; };
async function makeTenant(label, stamp) {
  const email = `p76_${label}_${stamp}@lexbnb-e2e.test`, password = `P76!${stamp}`;
  const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  users.push(created.user.id);
  const client = fresh(); must(await client.auth.signInWithPassword({ email, password }), `${label} giris`);
  const tenantId = must(await client.rpc('create_tenant_and_owner', { p_company_name: `P76 ${label} ${stamp}`, p_full_name: 'P76' }), 'isletme').tenant_id;
  tenants.push(tenantId);
  return tenantId;
}
async function run() {
  const stamp = Date.now();
  try {
    const tenantA = await makeTenant('a', stamp), tenantB = await makeTenant('b', stamp);
    const campaign = must(await admin.from('marketing_campaigns').insert({ tenant_id: tenantA, name: 'P76', platform: 'META', status: 'ACTIVE' }).select('id').single(), 'kampanya');
    const period = must(await admin.from('ad_metric_periods').insert({ tenant_id: tenantA, campaign_id: campaign.id, platform: 'META', period_start: '2026-10-01', period_end: '2026-10-07', result_type: 'MESSAGE', source: 'MANUAL' }).select('id').single(), 'donem');
    const changed = await admin.from('ad_metric_periods').update({ tenant_id: tenantB }).eq('id', period.id).select('id');
    check(!!changed.error && /TENANT_ID_IMMUTABLE|42501/.test(`${changed.error.code || ''} ${changed.error.message || ''}`),
      'A1. service_role dahil reklam donemini baska kiraciya tasiyamaz', changed.error ? changed.error.message : 'TASINDI');
  } catch (error) {
    check(false, 'Beklenmeyen hata', error.stack || error.message);
  } finally {
    for (const tenantId of tenants) { const r = await admin.from('tenants').delete().eq('id', tenantId); if (r.error) check(false, 'Tenant temizligi', r.error.message); }
    for (const userId of users) { const r = await admin.auth.admin.deleteUser(userId); if (r.error && !/not found/i.test(r.error.message)) check(false, 'Kullanici temizligi', r.error.message); }
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed) process.exit(1);
  }
}
run();
