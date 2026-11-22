/** Phase121 — reklam verisinde TikTok ve "Diger" platform (CANLI, YALNIZ TEST PROJESI).
 *  Istemcinin gercekten gonderdigi yolu olcer: TikTok CSV -> parseCsv -> AdsPeriodService.importBatch,
 *  elle "Diger" girisi ve sunucunun bilinmeyen platformu hala reddettigi. */
const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const Parser = require('./ads_import_parser.js');
const Service = require('./ads_period_service.js');
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
let passed = 0, failed = 0;
const users = [], tenants = [], clients = [];
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const must = (r, label) => { if (r.error) throw new Error(`${label}: ${r.error.code || ''} ${r.error.message}`); return r.data; };
const errorText = e => e ? `${e.code || ''} ${e.message || ''}`.trim() : '';

async function run() {
  const stamp = Date.now();
  try {
    const email = `p121_owner_${stamp}@lexbnb-e2e.test`, password = `P121!${stamp}`;
    const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'owner');
    users.push(created.user.id);
    const owner = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
    clients.push(owner);
    must(await owner.auth.signInWithPassword({ email, password }), 'giris');
    const tenantId = must(await owner.rpc('create_tenant_and_owner', { p_company_name: `P121 ${stamp}`, p_full_name: 'P121' }), 'tenant').tenant_id;
    tenants.push(tenantId);

    // T1. TikTok dosyasi (tarih araligi dosya adinda) istemci yolundan kaydedilir.
    const parsed = Parser.parseCsv('Campaign name,Cost,Impressions,Clicks (destination),Results,Currency\nVilla TikTok,1250.40,54000,820,31,TRY\nTotal of 1 campaign,1250.40,54000,820,31,TRY',
      'TIKTOK', 'Campaign Report(2025-10-01 to 2025-10-31).csv');
    check(parsed.errors.length === 0 && parsed.rows.length === 1, 'T0. TikTok raporu okunur', JSON.stringify(parsed.errors));
    const rows = parsed.rows.map(r => ({ ...r, campaignKey: 'n0' }));
    const result = await Service.importBatch(owner, tenantId, [{ key: 'n0', name: 'Villa TikTok', platform: 'TIKTOK' }], rows);
    const periods = must(await admin.from('ad_metric_periods').select('platform, spend, results, campaign_id').eq('tenant_id', tenantId), 'donemler');
    const campaign = must(await admin.from('marketing_campaigns').select('platform, name').eq('tenant_id', tenantId), 'kampanyalar');
    const expenses = must(await admin.from('expenses').select('amount').eq('tenant_id', tenantId).like('legacy_id', 'ADS_PERIOD:%'), 'giderler');
    check(result && periods.length === 1 && periods[0].platform === 'TIKTOK' && Number(periods[0].spend) === 1250.4 && Number(periods[0].results) === 31,
      'T1. TikTok donemi kaydedilir (platform TIKTOK, harcama ve sonuc dosyadaki gibi)', JSON.stringify(periods));
    check(campaign.length === 1 && campaign[0].platform === 'TIKTOK', 'T2. Kampanya ayni islemde TikTok olarak acilir', JSON.stringify(campaign));
    check(expenses.length === 1 && Number(expenses[0].amount) === 1250.4, 'T3. Harcama Finans giderine yazilir', JSON.stringify(expenses));

    // T4. Elle "Diger" (Pinterest vb.) girisi.
    await Service.importBatch(owner, tenantId, [{ key: 'n0', name: 'Pinterest pin', platform: 'OTHER' }], [{
      campaignKey: 'n0', platform: 'OTHER', periodStart: '2025-10-01', periodEnd: '2025-10-31', resultType: 'OTHER', spend: 300, results: null, source: 'MANUAL' }]);
    const other = must(await admin.from('ad_metric_periods').select('platform, source').eq('tenant_id', tenantId).eq('platform', 'OTHER'), 'diger');
    check(other.length === 1 && other[0].source === 'MANUAL', 'T4. "Diger" platform elle girilir', JSON.stringify(other));

    // T5. Bilinmeyen platform hala reddedilir (kapi genisledi, kalkmadi).
    const bad = (await owner.rpc('import_ad_metric_batch', { p_tenant_id: tenantId, p_new_campaigns: [{ key: 'x', name: 'X', platform: 'SNAP' }], p_rows: [{
      campaign_key: 'x', platform: 'SNAP', period_start: '2025-11-01', period_end: '2025-11-02', result_type: 'OTHER', spend: 1, source: 'MANUAL' }] })).error;
    check(/ADS_NEW_CAMPAIGN_INVALID/.test(errorText(bad)), 'T5. Bilinmeyen platform (SNAP) reddedilir', errorText(bad));

    // T6. anon kapisi kapali.
    const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
    const anonErr = (await anon.rpc('import_ad_metric_batch', { p_tenant_id: tenantId, p_new_campaigns: [], p_rows: [] })).error;
    check(anonErr && /42501|permission denied/i.test(errorText(anonErr)), 'T6. anon import_ad_metric_batch cagiramaz', errorText(anonErr));
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
