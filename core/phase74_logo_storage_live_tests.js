/** Phase 74 — tenant logo Storage/RLS (CANLI, YALNIZ TEST PROJESI). */
const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const fresh = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
let passed = 0, failed = 0;
const users = [], tenants = [], objects = [];
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const must = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.message}`); return r.data; };
const errorText = e => e ? `${e.statusCode || e.code || ''} ${e.message || e.error || ''}`.trim() : '';
async function makeUser(label, stamp) {
  const email = `p74_${label}_${stamp}@lexbnb-e2e.test`, password = `P74!${stamp}`;
  const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  users.push(created.user.id);
  const client = fresh(); must(await client.auth.signInWithPassword({ email, password }), `${label} giris`);
  return { id: created.user.id, client };
}

async function run() {
  const stamp = Date.now();
  try {
    const owner = await makeUser('owner', stamp), sales = await makeUser('sales', stamp), outsider = await makeUser('outsider', stamp);
    const tenantId = must(await owner.client.rpc('create_tenant_and_owner', { p_company_name: `P74 ${stamp}`, p_full_name: 'P74' }), 'isletme').tenant_id;
    tenants.push(tenantId);
    must(await admin.from('tenant_members').insert({ tenant_id: tenantId, user_id: sales.id, role: 'sales' }), 'sales uyeligi');
    const objectName = `${tenantId}/logo/p74-${stamp}.svg`;
    const badName = `${tenantId}/logo/p74-sales-${stamp}.svg`;
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><path fill="#123456" d="M0 0h2v2H0z"/></svg>');

    let r = await owner.client.storage.from('tenant-assets').upload(objectName, svg, { contentType: 'image/svg+xml', upsert: false });
    if (!r.error) objects.push(objectName);
    check(!r.error, 'A1. Yonetim kendi kiraci/logo yoluna yukler', errorText(r.error));
    r = await sales.client.storage.from('tenant-assets').upload(badName, svg, { contentType: 'image/svg+xml', upsert: false });
    if (!r.error) objects.push(badName);
    check(!!r.error, 'A2. Sales logo yukleyemez', errorText(r.error) || 'YUKLEDI');
    r = await owner.client.storage.from('tenant-assets').upload(`${tenantId}/yanlis.svg`, svg, { contentType: 'image/svg+xml', upsert: false });
    check(!!r.error, 'A3. Logo klasoru disina yukleme reddedilir', errorText(r.error) || 'YUKLEDI');

    r = await sales.client.storage.from('tenant-assets').download(objectName);
    check(!r.error && r.data && r.data.size > 0, 'B1. Kiraci uyesi ozel logoyu okur', errorText(r.error));
    r = await outsider.client.storage.from('tenant-assets').download(objectName);
    check(!!r.error, 'B2. Yabanci kullanici logoyu okuyamaz', errorText(r.error) || 'OKUDU');
    r = await sales.client.storage.from('tenant-assets').remove([objectName]);
    check(!!r.error || !(r.data || []).length, 'C1. Sales logo silemez', errorText(r.error) || JSON.stringify(r.data));
    r = await owner.client.storage.from('tenant-assets').remove([objectName]);
    if (!r.error) objects.splice(objects.indexOf(objectName), 1);
    check(!r.error && (r.data || []).length === 1, 'C2. Yonetim logoyu siler', errorText(r.error) || JSON.stringify(r.data));
    await owner.client.auth.signOut(); await sales.client.auth.signOut(); await outsider.client.auth.signOut();
  } catch (error) {
    check(false, 'Beklenmeyen hata', error.stack || error.message);
  } finally {
    if (objects.length) await admin.storage.from('tenant-assets').remove(objects);
    for (const tenantId of tenants) { const r = await admin.from('tenants').delete().eq('id', tenantId); if (r.error) check(false, 'Tenant temizligi', r.error.message); }
    for (const userId of users) { const r = await admin.auth.admin.deleteUser(userId); if (r.error && !/not found/i.test(r.error.message)) check(false, 'Kullanici temizligi', r.error.message); }
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed) process.exit(1);
  }
}
run();
