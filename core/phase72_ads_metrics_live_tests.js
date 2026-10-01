/** Phase 72 — reklam donemi + Finans bagi (CANLI, YALNIZ TEST PROJESI). */
const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const fresh = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
let passed = 0, failed = 0;
const users = [], tenants = [];
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const must = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.message}`); return r.data; };
const errorText = e => e ? `${e.code || ''} ${e.message || ''}`.trim() : '';
async function makeUser(label, stamp) {
  const email = `p72_${label}_${stamp}@lexbnb-e2e.test`, password = `P72!${stamp}`;
  const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  users.push(created.user.id);
  const client = fresh(); must(await client.auth.signInWithPassword({ email, password }), `${label} giris`);
  return { id: created.user.id, client };
}
const saveArgs = (tenantId, campaignId, overrides = {}) => ({
  p_id: null, p_tenant_id: tenantId, p_campaign_id: campaignId, p_platform: 'META',
  p_period_start: '2026-09-29', p_period_end: '2026-10-05', p_result_type: 'MESSAGE',
  p_result_metric: 'actions:onsite_conversion.messaging_conversation_started_7d',
  p_spend: 700, p_impressions: 7000, p_reach: 5000, p_clicks: 140,
  p_messages: 14, p_calls: null, p_source: 'CSV', ...overrides
});

async function run() {
  const stamp = Date.now();
  try {
    const owner = await makeUser('owner', stamp), sales = await makeUser('sales', stamp);
    const tenantId = must(await owner.client.rpc('create_tenant_and_owner', { p_company_name: `P72 ${stamp}`, p_full_name: 'P72' }), 'isletme').tenant_id;
    tenants.push(tenantId);
    must(await admin.from('tenant_members').insert({ tenant_id: tenantId, user_id: sales.id, role: 'sales' }), 'sales uyeligi');
    const campaign = must(await owner.client.from('marketing_campaigns').insert({ tenant_id: tenantId, name: 'P72 Meta', platform: 'META', status: 'ACTIVE' }).select('id').single(), 'kampanya');

    let r = await owner.client.from('ad_metric_periods').insert({ tenant_id: tenantId, campaign_id: campaign.id, platform: 'META', period_start: '2026-10-10', period_end: '2026-10-11', result_type: 'MESSAGE', source: 'MANUAL' });
    check(!!r.error, 'A1. Yonetici bile tabloya dogrudan yazamaz', errorText(r.error) || 'YAZDI');

    r = await owner.client.rpc('save_ad_metric_period', saveArgs(tenantId, campaign.id));
    check(!r.error && !!r.data, 'A2. Yonetim RPC ile donem kaydeder', errorText(r.error));
    const periodId = r.data;
    const period = await owner.client.from('ad_metric_periods').select('*').eq('id', periodId).single();
    check(!period.error && Number(period.data.spend) === 700 && period.data.messages === 14, 'A3. Donem metrigi kaybolmadan saklanir', errorText(period.error) || JSON.stringify(period.data));

    const expenses = must(await owner.client.from('expenses').select('expense_date,amount,category,legacy_id').like('legacy_id', `ADS_PERIOD:${periodId}:%`).order('expense_date'), 'reklam giderleri');
    check(expenses.length === 2 && expenses[0].expense_date === '2026-09-29' && Number(expenses[0].amount) === 200
      && expenses[1].expense_date === '2026-10-01' && Number(expenses[1].amount) === 500
      && expenses.every(x => x.category === 'Reklam'), 'B1. 700 TL gun sayisiyla Eylul 200 + Ekim 500 ayrilir', JSON.stringify(expenses));

    r = await owner.client.rpc('save_ad_metric_period', saveArgs(tenantId, campaign.id, { p_id: null, p_period_start: '2026-10-01', p_period_end: '2026-10-07' }));
    check(!!r.error && /ADS_PERIOD_OVERLAP/.test(errorText(r.error)), 'B2. Ayni kampanyada cakisan donem reddedilir', errorText(r.error) || 'KAYDEDILDI');
    r = await owner.client.rpc('save_ad_metric_period', saveArgs(tenantId, campaign.id, { p_period_start: '2026-01-01', p_period_end: '2026-02-01' }));
    check(!!r.error, 'B3. 31 gunden uzun donem veritabaninda da reddedilir', errorText(r.error) || 'KAYDEDILDI');
    r = await sales.client.rpc('save_ad_metric_period', saveArgs(tenantId, campaign.id, { p_period_start: '2026-10-10', p_period_end: '2026-10-16' }));
    check(!!r.error && /FORBIDDEN_ROLE|42501/.test(errorText(r.error)), 'C1. Sales reklam donemi yazamaz', errorText(r.error) || 'YAZDI');

    r = await owner.client.rpc('delete_ad_metric_period', { p_id: periodId });
    const remainingExpenses = must(await admin.from('expenses').select('id').like('legacy_id', `ADS_PERIOD:${periodId}:%`), 'silme kontrolu');
    check(!r.error && remainingExpenses.length === 0, 'D1. Donem silinince bagli aylik giderler atomik silinir', errorText(r.error) || JSON.stringify(remainingExpenses));
    await owner.client.auth.signOut(); await sales.client.auth.signOut();
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
