/** Phase82 — atomik reklam donemi ice aktarimi (CANLI, YALNIZ TEST PROJESI). */
const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const fresh = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
let passed = 0, failed = 0;
const users = [], tenants = [], clients = [];
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const must = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.code || ''} ${r.error.message}`); return r.data; };
const errorText = e => e ? `${e.code || ''} ${e.message || ''}`.trim() : '';

async function makeUser(label, stamp) {
  const email = `p82_${label}_${stamp}@lexbnb-e2e.test`, password = `P82!${stamp}`;
  const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  users.push(created.user.id);
  const client = fresh();
  must(await client.auth.signInWithPassword({ email, password }), `${label} giris`);
  clients.push(client);
  return { id: created.user.id, client };
}

const row = (campaignId, start, end, spend = 100) => ({
  campaign_id: campaignId, platform: 'META', period_start: start, period_end: end,
  result_type: 'MESSAGE', result_metric: 'messages', spend, impressions: 1000,
  reach: 800, clicks: 40, messages: 5, calls: null, source: 'CSV'
});

async function run() {
  const stamp = Date.now();
  try {
    const owner = await makeUser('owner', stamp);
    const sales = await makeUser('sales', stamp);
    const viewer = await makeUser('viewer', stamp);
    const outsider = await makeUser('outsider', stamp);
    const tenantA = must(await owner.client.rpc('create_tenant_and_owner', { p_company_name: `P82 A ${stamp}`, p_full_name: 'P82' }), 'tenant A').tenant_id;
    const tenantB = must(await outsider.client.rpc('create_tenant_and_owner', { p_company_name: `P82 B ${stamp}`, p_full_name: 'P82' }), 'tenant B').tenant_id;
    tenants.push(tenantA, tenantB);
    must(await admin.from('tenant_members').insert([
      { tenant_id: tenantA, user_id: sales.id, role: 'sales' },
      { tenant_id: tenantA, user_id: viewer.id, role: 'viewer' }
    ]), 'roller');
    const campaign = must(await owner.client.from('marketing_campaigns').insert({
      tenant_id: tenantA, name: 'P82 Meta', platform: 'META', status: 'ACTIVE'
    }).select('id').single(), 'kampanya');

    let r = await owner.client.rpc('save_ad_metric_period_batch', {
      p_tenant_id: tenantA,
      p_rows: [row(campaign.id, '2027-01-01', '2027-01-03'), row(campaign.id, '2027-01-04', '2027-01-05')]
    });
    check(!r.error && r.data?.ids?.length === 2, 'A1. Toplu RPC tum satirlari kaydeder', errorText(r.error) || JSON.stringify(r.data));

    const beforeAtomicResult = await admin.from('ad_metric_periods').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantA);
    if (beforeAtomicResult.error) throw new Error(`atomik once: ${errorText(beforeAtomicResult.error)}`);
    r = await owner.client.rpc('save_ad_metric_period_batch', {
      p_tenant_id: tenantA,
      p_rows: [row(campaign.id, '2027-02-01', '2027-02-02'), row(campaign.id, '2027-01-02', '2027-01-03')]
    });
    const afterAtomicResult = await admin.from('ad_metric_periods').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantA);
    if (afterAtomicResult.error) throw new Error(`atomik sonra: ${errorText(afterAtomicResult.error)}`);
    check(!!r.error && beforeAtomicResult.count === afterAtomicResult.count, 'A2. Ortadaki cakisma tum batchi geri alir', errorText(r.error) || `${beforeAtomicResult.count} -> ${afterAtomicResult.count}`);

    const concurrentRows = [row(campaign.id, '2027-03-01', '2027-03-03')];
    const concurrent = await Promise.all([
      owner.client.rpc('save_ad_metric_period_batch', { p_tenant_id: tenantA, p_rows: concurrentRows }),
      owner.client.rpc('save_ad_metric_period_batch', { p_tenant_id: tenantA, p_rows: concurrentRows })
    ]);
    check(concurrent.filter(x => !x.error).length === 1 && concurrent.filter(x => x.error).length === 1,
      'A3. Eszamanli cakisan iki yazmadan yalniz biri kazanir', concurrent.map(x => errorText(x.error) || 'OK').join(' | '));

    for (const [actor, label] of [[sales, 'sales'], [viewer, 'viewer'], [outsider, 'yabanci kiraci']]) {
      r = await actor.client.rpc('save_ad_metric_period_batch', {
        p_tenant_id: tenantA, p_rows: [row(campaign.id, '2027-04-01', '2027-04-02')]
      });
      check(!!r.error && /42501|FORBIDDEN_ROLE/i.test(errorText(r.error)), `B. ${label} toplu reklam donemi yazamaz`, errorText(r.error) || 'YAZDI');
    }

    r = await owner.client.rpc('reset_tenant_data', { p_tenant_id: tenantA, p_confirm: 'VERILERI SIFIRLA' });
    const dayCount = await admin.from('ad_metric_period_days').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantA);
    check(!r.error && !dayCount.error && dayCount.count === 0, 'C1. Isletme sifirlama gun tekilligi satirlarini temizler', errorText(r.error || dayCount.error) || String(dayCount.count));
  } catch (error) {
    check(false, 'Beklenmeyen hata', error.stack || error.message);
  } finally {
    for (const client of clients) { try { await client.auth.signOut(); } catch (_) {} }
    for (const tenantId of tenants) { const r = await admin.from('tenants').delete().eq('id', tenantId); if (r.error) check(false, 'Tenant temizligi', r.error.message); }
    for (const userId of users) { const r = await admin.auth.admin.deleteUser(userId); if (r.error && !/not found/i.test(r.error.message)) check(false, 'Kullanici temizligi', r.error.message); }
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed) process.exit(1);
  }
}
run();
