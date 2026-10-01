/** Phase 70 — is tarihi varsayilanlari (CANLI, YALNIZ TEST PROJESI). */
const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const anonClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
let passed = 0, failed = 0, userId = null, tenantId = null;
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const must = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.message}`); return r.data; };
const istanbulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function run() {
  const stamp = Date.now(), email = `p70_${stamp}@lexbnb-e2e.test`, password = `P70!${stamp}`;
  try {
    const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'kullanici');
    userId = created.user.id;
    const client = anonClient();
    must(await client.auth.signInWithPassword({ email, password }), 'giris');
    tenantId = must(await client.rpc('create_tenant_and_owner', { p_company_name: `P70 ${stamp}`, p_full_name: 'P70' }), 'isletme').tenant_id;
    const expected = istanbulToday();
    const property = must(await client.from('properties').insert({ tenant_id: tenantId, name: 'P70 Villa', slug: `p70-${stamp}`, base_price: 1000 }).select('activated_on').single(), 'mulk');
    const lead = must(await client.from('leads').insert({ tenant_id: tenantId, guest_name: 'P70 Talep', guest_phone: `90${String(stamp).slice(-10)}` }).select('lead_date').single(), 'talep');
    const expense = must(await client.from('expenses').insert({ tenant_id: tenantId, category: 'Diger', amount: 1, description: 'P70', expense_type: 'OPEX' }).select('expense_date').single(), 'gider');
    check(property.activated_on === expected, 'A1. Gece eklenen mulkun faaliyet tarihi Istanbul gunudur', `${property.activated_on} != ${expected}`);
    check(lead.lead_date === expected, 'A2. Talep tarihi Istanbul gunudur', `${lead.lead_date} != ${expected}`);
    check(expense.expense_date === expected, 'A3. Gider tarihi Istanbul gunudur', `${expense.expense_date} != ${expected}`);
    await client.auth.signOut();
  } catch (error) {
    check(false, 'Beklenmeyen hata', error.stack || error.message);
  } finally {
    if (tenantId) { const r = await admin.from('tenants').delete().eq('id', tenantId); if (r.error) check(false, 'Tenant temizligi', r.error.message); }
    if (userId) { const r = await admin.auth.admin.deleteUser(userId); if (r.error) check(false, 'Kullanici temizligi', r.error.message); }
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed) process.exit(1);
  }
}
run();
