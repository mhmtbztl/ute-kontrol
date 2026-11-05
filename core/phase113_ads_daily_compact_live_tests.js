/** Phase113 — gunluk reklam dokumu kampanya x ay basina tek satir (CANLI, YALNIZ TEST PROJESI).
 *  Istemcinin gercekten gonderdigi yolu olcer: parseCsv -> compactDaily -> AdsPeriodService.importBatch. */
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
const MSG = 'actions:onsite_conversion.messaging_conversation_started_7d';
const csv = lines => '"Gün","Kampanya Adı","Sonuçlar","Sonuç Göstergesi","Harcanan Tutar (TRY)","Gösterim","Bağlantı Tıklamaları"\n' + lines.join('\n');
const monthDays = (ym, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${ym}-${String(from + i).padStart(2, '0')}`);

async function state(tenantId) {
  const periods = must(await admin.from('ad_metric_periods').select('id, campaign_id, period_start, period_end, spend, daily_metrics').eq('tenant_id', tenantId).order('period_start'), 'donemler');
  const expenses = must(await admin.from('expenses').select('amount, legacy_id, expense_date').eq('tenant_id', tenantId).like('legacy_id', 'ADS_PERIOD:%'), 'giderler');
  const expenseTotal = Math.round(expenses.reduce((sum, e) => sum + Number(e.amount), 0) * 100) / 100;
  return { periods, expenses, expenseTotal };
}

async function run() {
  const stamp = Date.now();
  try {
    const email = `p113_owner_${stamp}@lexbnb-e2e.test`, password = `P113!${stamp}`;
    const created = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'owner');
    users.push(created.user.id);
    const owner = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
    clients.push(owner);
    must(await owner.auth.signInWithPassword({ email, password }), 'giris');
    const tenantId = must(await owner.rpc('create_tenant_and_owner', { p_company_name: `P113 ${stamp}`, p_full_name: 'P113' }), 'tenant').tenant_id;
    tenants.push(tenantId);

    // Istemci yolu: dosya -> kampanya esleme -> kampanya x ay -> RPC.
    async function upload(lines) {
      const parsed = Parser.parseCsv(csv(lines), 'META');
      if (parsed.errors.length) throw new Error(JSON.stringify(parsed.errors));
      const campaigns = must(await owner.from('marketing_campaigns').select('id, name, platform').eq('tenant_id', tenantId), 'kampanyalar');
      const existing = await Service.loadPeriods(owner, tenantId);
      const compact = Parser.compactDaily(Parser.matchCampaigns(parsed.rows, campaigns), existing);
      if (compact.errors.length) throw new Error(JSON.stringify(compact.errors));
      const fresh = [...new Set(compact.rows.filter(r => !r.campaignId).map(r => r.campaignName))];
      const newCampaigns = fresh.map((name, i) => ({ key: `n${i}`, name, platform: 'META' }));
      const rows = compact.rows.map(r => ({ ...r, campaignKey: r.campaignId ? null : `n${fresh.indexOf(r.campaignName)}` }));
      return { sent: rows.length, result: await Service.importBatch(owner, tenantId, newCampaigns, rows) };
    }

    // D1. 3 kampanya x 31 gun = 93 dosya satiri -> 3 donem, 3 gider satiri.
    const may = monthDays('2025-05', 1, 31);
    let u = await upload([
      ...may.map(d => `${d},"Kış Satış",2,${MSG},100.10,1000,10`),
      ...may.map(d => `${d},"Profil",1,${MSG},40,800,8`),
      ...may.map(d => `${d},"Web",1,${MSG},25.50,500,5`)
    ]);
    let s = await state(tenantId);
    check(u.sent === 3 && s.periods.length === 3 && s.expenses.length === 3,
      'D1. 93 gunluk satir 3 donem + 3 gider satiri olarak yazilir (eskiden 93 + 93)', `gonderilen ${u.sent}, donem ${s.periods.length}, gider ${s.expenses.length}`);
    const kis = s.periods.find(p => Number(p.spend) === 3103.1);
    check(kis && Array.isArray(kis.daily_metrics) && kis.daily_metrics.length === 31 && s.expenseTotal === Math.round((3103.1 + 1240 + 790.5) * 100) / 100,
      'D2. Gunluk kirilim saklanir; Finans gideri gunlerin toplamina esit', JSON.stringify({ expenseTotal: s.expenseTotal, days: kis?.daily_metrics?.length }));

    // D3. Ay sonu yeniden yukleme (20-31 degisti): yine tek donem, tek gider; eski 1-19 korunur.
    u = await upload(monthDays('2025-05', 20, 31).map(d => `${d},"Kış Satış",3,${MSG},200,1000,10`));
    s = await state(tenantId);
    const kis2 = s.periods.find(p => p.campaign_id === kis.campaign_id);
    const kisExpenses = s.expenses.filter(e => e.legacy_id.startsWith(`ADS_PERIOD:${kis2?.id}:`));
    check(s.periods.length === 3 && kisExpenses.length === 1 && Number(kis2.spend) === Math.round((19 * 100.1 + 12 * 200) * 100) / 100 && kis2.daily_metrics.length === 31,
      'D3. Ay ortasi + ay sonu yuklemesi tek satirda birlesir; mukerrer gider yok', JSON.stringify({ spend: kis2?.spend, periods: s.periods.length, kisExpenses: kisExpenses.length }));

    // D4. Ay sinirini kesen kampanya: her ay ayri satir, gider dogru ayda.
    u = await upload(['2025-06-29', '2025-06-30', '2025-07-01'].map(d => `${d},"Sınır",1,${MSG},10,100,1`));
    s = await state(tenantId);
    const border = s.expenses.filter(e => /^2025-0[67]/.test(e.expense_date)).map(e => `${e.expense_date.slice(0, 7)}:${Number(e.amount)}`).sort();
    check(u.sent === 2 && JSON.stringify(border) === JSON.stringify(['2025-06:20', '2025-07:10']), 'D4. Ay sinirini kesen gunler kendi ayina gider olarak duser', JSON.stringify(border));

    // E. Sunucu kapilari — dogrudan RPC (istemci bunlari uretmez, kotu istemci uretebilir).
    const before = JSON.stringify(await state(tenantId));
    const campaignId = kis.campaign_id;
    const bad = async daily => (await owner.rpc('import_ad_metric_batch', { p_tenant_id: tenantId, p_new_campaigns: [], p_rows: [{
      campaign_id: campaignId, platform: 'META', period_start: '2025-08-01', period_end: '2025-08-02', result_type: 'MESSAGE',
      result_metric: MSG, spend: 30, results: 2, messages: 2, source: 'CSV', daily }] })).error;
    let e = await bad([{ d: '2025-08-01', s: 10 }, { d: '2025-08-02', s: 10 }]);
    check(/ADS_DAILY_SPEND_MISMATCH/.test(errorText(e)), 'E1. Gunluk toplam donem harcamasina esit degilse reddedilir (grafik ile Finans ayrismaz)', errorText(e));
    e = await bad([{ d: '2025-08-01', s: 15 }, { d: '2025-08-01', s: 15 }]);
    check(/ADS_DAILY_INVALID/.test(errorText(e)), 'E2. Ayni gun iki kez reddedilir', errorText(e));
    e = await bad([{ d: '2025-08-01', s: 15 }, { d: '2025-08-03', s: 15 }]);
    check(/ADS_DAILY_INVALID/.test(errorText(e)), 'E3. Donem disindaki gun reddedilir', errorText(e));
    e = await bad([{ d: '2025-08-01', s: 15, x: 1 }, { d: '2025-08-02', s: 15 }]);
    check(/ADS_DAILY_INVALID/.test(errorText(e)), 'E4. Bilinmeyen alan reddedilir (satir sisirilemez)', errorText(e));
    e = await bad([{ d: '2025-08-01', s: 15, i: -1 }, { d: '2025-08-02', s: 15 }]);
    check(/ADS_DAILY_INVALID/.test(errorText(e)), 'E5. Negatif gunluk sayac reddedilir', errorText(e));
    e = await bad([{ d: '2025-08-01', s: 15, c: 1.5 }, { d: '2025-08-02', s: 15 }]);
    check(/ADS_DAILY_INVALID/.test(errorText(e)), 'E6. Kesirli gunluk sayac reddedilir', errorText(e));
    check(JSON.stringify(await state(tenantId)) === before, 'E7. Reddedilen aktarim hicbir sey yazmaz', 'durum degisti');

    // F. Gunluk kirilimsiz satir (phase111 istemcisi) aynen calisir.
    e = (await owner.rpc('import_ad_metric_batch', { p_tenant_id: tenantId, p_new_campaigns: [], p_rows: [{
      campaign_id: campaignId, platform: 'META', period_start: '2025-09-01', period_end: '2025-09-30', result_type: 'MESSAGE',
      result_metric: MSG, spend: 900, results: 9, messages: 9, source: 'CSV' }] })).error;
    s = await state(tenantId);
    const sept = s.periods.find(p => p.period_start === '2025-09-01');
    check(!e && sept && sept.daily_metrics === null, 'F1. Aylik (gunluk kirilimsiz) dosya phase111 gibi calisir, gun uydurulmaz', errorText(e) || JSON.stringify(sept));
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
