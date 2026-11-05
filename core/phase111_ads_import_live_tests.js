/** Phase111 — Meta CSV ice aktarimi: kampanya acma, cakisan gunleri degistirme (CANLI, YALNIZ TEST PROJESI). */
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
  const email = `p111_${label}_${stamp}@lexbnb-e2e.test`, password = `P111!${stamp}`;
  const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  users.push(created.user.id);
  const client = fresh();
  must(await client.auth.signInWithPassword({ email, password }), `${label} giris`);
  clients.push(client);
  return { id: created.user.id, client };
}

const row = (target, start, end, spend, extra = {}) => ({
  ...target, platform: 'META', period_start: start, period_end: end,
  result_type: 'MESSAGE', result_metric: 'actions:onsite_conversion.messaging_conversation_started_7d',
  spend, impressions: 1000, reach: 800, clicks: null, messages: 5, calls: null, results: 5, source: 'CSV', ...extra
});
const days = (target, year, month, count, spendEach) => Array.from({ length: count }, (_, i) => {
  const d = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
  return row(target, d, d, spendEach);
});

async function state(tenantId) {
  const periods = must(await admin.from('ad_metric_periods').select('id, campaign_id, period_start, period_end, spend, results, extra_metrics').eq('tenant_id', tenantId).order('period_start'), 'donemler');
  const expenses = must(await admin.from('expenses').select('amount, legacy_id, expense_date').eq('tenant_id', tenantId).like('legacy_id', 'ADS_PERIOD:%'), 'giderler');
  const campaigns = must(await admin.from('marketing_campaigns').select('id, name, budget').eq('tenant_id', tenantId), 'kampanyalar');
  const expenseTotal = Math.round(expenses.reduce((sum, e) => sum + Number(e.amount), 0) * 100) / 100;
  return { periods, expenses, campaigns, expenseTotal };
}
const fingerprint = s => JSON.stringify([s.periods.map(p => [p.campaign_id, p.period_start, p.period_end, Number(p.spend)]), s.expenseTotal, s.campaigns.length]);

async function run() {
  const stamp = Date.now();
  try {
    const owner = await makeUser('owner', stamp);
    const manager = await makeUser('manager', stamp);
    const sales = await makeUser('sales', stamp);
    const viewer = await makeUser('viewer', stamp);
    const outsider = await makeUser('outsider', stamp);
    const tenantA = must(await owner.client.rpc('create_tenant_and_owner', { p_company_name: `P111 A ${stamp}`, p_full_name: 'P111' }), 'tenant A').tenant_id;
    const tenantB = must(await outsider.client.rpc('create_tenant_and_owner', { p_company_name: `P111 B ${stamp}`, p_full_name: 'P111' }), 'tenant B').tenant_id;
    tenants.push(tenantA, tenantB);
    must(await admin.from('tenant_members').insert([
      { tenant_id: tenantA, user_id: manager.id, role: 'manager' },
      { tenant_id: tenantA, user_id: sales.id, role: 'sales' },
      { tenant_id: tenantA, user_id: viewer.id, role: 'viewer' }
    ]), 'roller');
    const imp = (client, newCampaigns, rows) => client.rpc('import_ad_metric_batch', { p_tenant_id: tenantA, p_new_campaigns: newCampaigns, p_rows: rows });

    // A. Yeni kampanya + sonuc + ek metrik
    let r = await imp(owner.client, [{ key: 'k1', name: 'Kış Satış WP-IG', platform: 'META', budget: 180 }],
      [row({ campaign_key: 'k1' }, '2025-03-01', '2025-03-31', 3100, { extra_metrics: { 'ThruPlay': 412 } })]);
    let s = await state(tenantA);
    const kis = s.campaigns.find(c => c.name === 'Kış Satış WP-IG');
    check(!r.error && r.data?.created_campaigns?.length === 1 && kis && Number(kis.budget) === 180,
      'A1. Eslesmeyen ad ayni islemde kampanya olarak acilir (gunluk butceyle)', errorText(r.error) || JSON.stringify(r.data));
    check(s.periods.length === 1 && Number(s.periods[0].results) === 5 && s.periods[0].extra_metrics?.ThruPlay === 412,
      'A2. Sonuc sayisi ve ek metrik saklanir', JSON.stringify(s.periods));
    check(s.expenseTotal === 3100, 'A3. Harcama Finans giderine bir kez yazilir', String(s.expenseTotal));

    r = await imp(owner.client, [{ key: 'tekrar', name: 'Kış Satış WP-IG', platform: 'META' }],
      [row({ campaign_key: 'tekrar' }, '2025-04-01', '2025-04-30', 10)]);
    s = await state(tenantA);
    check(!r.error && r.data?.created_campaigns?.length === 0 && s.campaigns.length === 1,
      'A4. Ayni ad + platform ikinci kez acilmaz (cift tiklama)', errorText(r.error) || JSON.stringify(s.campaigns));

    // B. Ay ortasi + ay sonu indirme: ayni donem yeni rakamla degisir
    r = await imp(owner.client, [], [row({ campaign_id: kis.id }, '2025-03-01', '2025-03-31', 4200)]);
    s = await state(tenantA);
    const march = s.periods.filter(p => p.period_start.startsWith('2025-03'));
    check(!r.error && r.data?.replaced_periods === 1 && march.length === 1 && Number(march[0].spend) === 4200,
      'B1. Ayni donemin ikinci yuklemesi eskinin yerine gecer', errorText(r.error) || JSON.stringify(march));
    check(s.expenseTotal === 4210, 'B2. Eski gider silinir, yeni harcama tek kez yazilir (mukerrer gider yok)', String(s.expenseTotal));

    // C. Kismi kapsama: aylik kaydin ustune tek gun -> dur, hicbir sey degismesin
    const beforePartial = fingerprint(await state(tenantA));
    r = await imp(owner.client, [], [row({ campaign_id: kis.id }, '2025-03-01', '2025-03-01', 50)]);
    const afterPartial = fingerprint(await state(tenantA));
    check(!!r.error && /ADS_PARTIAL_OVERLAP/.test(errorText(r.error)) && beforePartial === afterPartial,
      'C1. Tek gunluk dosya aylik kaydi silip 2-31 Mart\'i kaybettirmez', errorText(r.error) || 'kabul edildi');

    // D. Gunluk dokum tum ayi kapsiyorsa aylik kaydin yerine gecer
    r = await imp(owner.client, [], days({ campaign_id: kis.id }, 2025, 3, 31, 100));
    s = await state(tenantA);
    const marchDays = s.periods.filter(p => p.period_start.startsWith('2025-03'));
    check(!r.error && r.data?.replaced_periods === 1 && r.data?.inserted_periods === 31 && marchDays.length === 31,
      'D1. Ayin tamami gunluk gelince aylik kayit 31 gunluk kayda doner', errorText(r.error) || `${marchDays.length} donem`);
    check(s.expenseTotal === 3110, 'D2. Gider toplami yeni gunluk toplamla birebir', String(s.expenseTotal));

    // E. Atomiklik: ikinci satir gecersizse yeni kampanya da acilmaz
    const beforeAtomic = fingerprint(await state(tenantA));
    r = await imp(owner.client, [{ key: 'yarim', name: 'Yarım Kalan', platform: 'META' }], [
      row({ campaign_key: 'yarim' }, '2025-05-01', '2025-05-01', 10),
      row({ campaign_key: 'yarim' }, '2025-05-02', '2025-05-02', 10, { extra_metrics: { ThruPlay: 'cok' } })
    ]);
    check(!!r.error && /ADS_EXTRA_METRICS_INVALID/.test(errorText(r.error)) && fingerprint(await state(tenantA)) === beforeAtomic,
      'E1. Gecersiz satir tum islemi geri alir; yarim kampanya kalmaz', errorText(r.error) || 'kabul edildi');
    r = await imp(owner.client, [], [row({ campaign_id: kis.id }, '2025-06-01', '2025-06-01', 10, { results: -1 })]);
    check(!!r.error && /ADS_BATCH_INVALID/.test(errorText(r.error)), 'E2. Negatif sonuc reddedilir', errorText(r.error) || 'kabul edildi');
    r = await imp(owner.client, [], [row({ campaign_id: kis.id }, '2025-06-01', '2025-06-02', 10), row({ campaign_id: kis.id }, '2025-06-02', '2025-06-03', 10)]);
    check(!!r.error && /OVERLAP|23P01/.test(errorText(r.error)), 'E3. Dosya icinde ayni gunu iki kez sayan satirlar reddedilir', errorText(r.error) || 'kabul edildi');

    // F. Kapali ay: degistirme tum islemi reddeder
    r = await owner.client.rpc('close_monthly_period_atomic', { p_tenant_id: tenantA, p_year: 2025, p_month: 3, p_snapshot: {} });
    if (r.error) throw new Error(`ay kapanisi: ${errorText(r.error)}`);
    const beforeClosed = fingerprint(await state(tenantA));
    r = await imp(owner.client, [], days({ campaign_id: kis.id }, 2025, 3, 31, 120));
    check(!!r.error && /CLOSED_PERIOD/.test(errorText(r.error)) && fingerprint(await state(tenantA)) === beforeClosed,
      'F1. Kapanmis aya dusen degistirme reddedilir, defter oldugu gibi kalir', errorText(r.error) || 'kabul edildi');

    // G. Yetki
    for (const [actor, label] of [[sales, 'sales'], [viewer, 'viewer'], [outsider, 'yabanci kiraci']]) {
      r = await imp(actor.client, [], [row({ campaign_id: kis.id }, '2025-07-01', '2025-07-01', 10)]);
      check(!!r.error && /42501|FORBIDDEN_ROLE/i.test(errorText(r.error)), `G1. ${label} ice aktaramaz`, errorText(r.error) || 'YAZDI');
    }
    r = await imp(fresh(), [], [row({ campaign_id: kis.id }, '2025-07-01', '2025-07-01', 10)]);
    check(!!r.error && /42501|permission denied/i.test(errorText(r.error)), 'G2. Oturumsuz (anon) cagiramaz', errorText(r.error) || 'YAZDI');
    r = await imp(manager.client, [], [row({ campaign_id: kis.id }, '2025-07-01', '2025-07-01', 10)]);
    check(!r.error, 'G3. Varsayilan yonetici ice aktarir', errorText(r.error));
    must(await owner.client.rpc('set_member_permissions', { p_tenant_id: tenantA, p_user_id: manager.id, p_permissions: { 'ledger.write': false } }), 'izin');
    r = await imp(manager.client, [], [row({ campaign_id: kis.id }, '2025-07-02', '2025-07-02', 10)]);
    check(!!r.error && /42501|FORBIDDEN_ROLE/i.test(errorText(r.error)), 'G4. Finans yazma izni kaldirilan yonetici gider doguran aktarimi yapamaz', errorText(r.error) || 'YAZDI');

    // H. Capraz kiraci: baska isletmenin kampanyasina yazilamaz
    const foreign = must(await outsider.client.from('marketing_campaigns').insert({ tenant_id: tenantB, name: 'B Meta', platform: 'META', status: 'ACTIVE' }).select('id').single(), 'B kampanyasi');
    r = await imp(owner.client, [], [row({ campaign_id: foreign.id }, '2025-08-01', '2025-08-01', 10)]);
    const foreignPeriods = must(await admin.from('ad_metric_periods').select('id').eq('campaign_id', foreign.id), 'B donemleri');
    check(!!r.error && /ADS_CAMPAIGN_NOT_FOUND/.test(errorText(r.error)) && foreignPeriods.length === 0,
      'H1. Yabanci kampanya kimligi reddedilir', errorText(r.error) || 'YAZDI');
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
