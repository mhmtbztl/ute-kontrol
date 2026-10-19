/**
 * LEXBNB PHASE 97 — GELIR VE SERMAYE DEFTERI (CANLI, YALNIZ TEST PROJESI)
 *
 * Kullanici 19.10.2026: Finans'ta gider gibi gelir de eklenebilmeli; "diger
 * gelir" toplam gelire girer ciroya girmez, sermaye girisi kara hic girmez.
 *
 *   1. Yonetim gelir kaydeder, duzeltir, siler; zorunlu alanlar sunucuda.
 *   2. Izleyici okur yazamaz; satis ve personel finans defterini okuyamaz.
 *   3. Baska isletmenin mulku kullanilamaz; anon erisemez.
 *   4. Ay kapanisi ve yonetici anlik goruntusu istemciyle AYNI rakami verir
 *      (ledger_contract_tests "phase97" Mart 2031 senaryosu).
 *   5. Kapanmis donemde gelir eklenemez, degistirilemez, silinemez.
 *   6. Isletme sifirlama gelir defterini de bosaltir (kapali donem olsa bile).
 *
 * phase97 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
 */

const { createClient } = require('@supabase/supabase-js');

const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);

let passed = 0, failed = 0;
const createdUsers = [];
const createdTenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const hataMetni = e => (e && (e.message || e.code)) ? `${e.code || ''} ${e.message || ''}`.trim() : '';
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const esit = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011;

async function makeUser(label, stamp) {
  const email = `p97_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P97!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 97 — GELIR VE SERMAYE DEFTERI (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), vwr = await makeUser('vwr', s), sls = await makeUser('sls', s), stf = await makeUser('stf', s), yab = await makeUser('yab', s);
    clients.push(own, vwr, sls, stf, yab);
    const T = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P97 ' + s, p_full_name: 'P97' }), 'isletme').tenant_id;
    const Y = must(await yab.client.rpc('create_tenant_and_owner', { p_company_name: 'P97Y ' + s, p_full_name: 'P97Y' }), 'yabanci isletme').tenant_id;
    createdTenants.push(T, Y);
    must(await admin.from('tenant_members').insert([
      { tenant_id: T, user_id: vwr.id, role: 'viewer' },
      { tenant_id: T, user_id: sls.id, role: 'sales' },
      { tenant_id: T, user_id: stf.id, role: 'staff' }]), 'uyeler');
    const mulk = async (client, tenant, kod) => must(await client.from('properties').insert({
      tenant_id: tenant, name: kod, slug: kod + s, base_price: 10000, activated_on: '2024-01-01' }).select().single(), 'mulk ' + kod);
    const A = await mulk(own.client, T, 'P97A');
    const YM = await mulk(yab.client, Y, 'P97Y');
    const gelir = (client, alanlar) => client.from('income_entries').insert({ tenant_id: T, ...alanlar }).select().single();

    // Mart 2031 senaryosu — ledger_contract_tests ile ayni rakamlar.
    must(await own.client.from('bookings').insert({ tenant_id: T, property_id: A.id, booking_code: 'M' + s,
      guest_name: 'Misafir M', channel: 'Airbnb', check_in: '2031-03-10', check_out: '2031-03-12', pax: 2,
      gross_amount: 20000, cleaning_fee: 2000, discount: 1000 }), 'rezervasyon');
    must(await own.client.from('expenses').insert({ tenant_id: T, property_id: A.id, expense_date: '2031-03-05',
      category: 'Fatura', expense_type: 'OPEX', amount: 4000, description: 'TEST' }), 'gider');

    // 1. Yonetim yazar
    let r = await gelir(own.client, { property_id: A.id, income_type: 'OTHER_INCOME', income_date: '2031-03-15', amount: 2500, description: 'Transfer' });
    check(!r.error, '1a. Yonetim mulke bagli diger gelir kaydeder', hataMetni(r.error));
    const diger = r.data;
    r = await gelir(own.client, { income_type: 'CAPITAL', income_date: '2031-03-20', amount: 50000, description: 'Ortak sermayesi' });
    check(!r.error && r.data.property_id === null, '1b. Portfoy geneli sermaye girisi kaydedilir', hataMetni(r.error));
    r = await gelir(own.client, { income_type: 'OTHER_INCOME', income_date: '2031-04-01', amount: 999, description: 'Nisan' });
    check(!r.error, '1c. Baska aya diger gelir kaydedilir', hataMetni(r.error));
    const nisan = r.data;
    r = await own.client.from('income_entries').update({ description: 'Havalimani transferi' }).eq('id', diger.id).select().single();
    check(!r.error && r.data.description === 'Havalimani transferi', '1d. Yonetim kaydi duzeltir', hataMetni(r.error));
    r = await own.client.from('income_entries').delete().eq('id', nisan.id).select();
    check(!r.error && (r.data || []).length === 1, '1e. Yonetim kaydi siler', hataMetni(r.error));
    r = await gelir(own.client, { income_type: 'OTHER_INCOME', income_date: '2031-03-15', amount: 0, description: 'sifir' });
    check(!!r.error, '1f. Tutar sifir olamaz (CHECK)', 'IZIN VERILDI');
    r = await gelir(own.client, { income_type: 'OTHER_INCOME', income_date: '2031-03-15', amount: 10, description: '   ' });
    check(!!r.error, '1g. Aciklama bos olamaz (CHECK)', 'IZIN VERILDI');
    r = await gelir(own.client, { income_type: 'KREDI', income_date: '2031-03-15', amount: 10, description: 'x' });
    check(!!r.error, '1h. Tanimsiz tur reddedilir', 'IZIN VERILDI');

    // 2. Rol sinirlari (3.3.1)
    r = await vwr.client.from('income_entries').select('id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 2, '2a. Izleyici gelir defterini okur', hataMetni(r.error) || JSON.stringify(r.data));
    r = await gelir(vwr.client, { income_type: 'OTHER_INCOME', income_date: '2031-03-15', amount: 10, description: 'x' });
    check(!!r.error, '2b. Izleyici gelir yazamaz', 'IZIN VERILDI');
    r = await sls.client.from('income_entries').select('id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 0, '2c. Satis rolu finans defterini okuyamaz', hataMetni(r.error) || JSON.stringify(r.data));
    r = await stf.client.from('income_entries').select('id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 0, '2d. Personel finans defterini okuyamaz', hataMetni(r.error) || JSON.stringify(r.data));

    // 3. Kiraci sinirlari
    r = await gelir(own.client, { property_id: YM.id, income_type: 'OTHER_INCOME', income_date: '2031-03-15', amount: 10, description: 'x' });
    check(!!r.error && /CROSS_TENANT_PROPERTY/.test(r.error.message || ''), '3a. Baska isletmenin mulku kullanilamaz', hataMetni(r.error) || 'IZIN VERILDI');
    r = await own.client.from('income_entries').insert({ tenant_id: Y, income_type: 'OTHER_INCOME', income_date: '2031-03-15', amount: 10, description: 'x' });
    check(!!r.error, '3b. Uyesi olunmayan isletmeye gelir yazilamaz (RLS)', 'IZIN VERILDI');
    r = await yab.client.from('income_entries').select('id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 0, '3c. Yabanci isletme gelirleri goremez', hataMetni(r.error) || JSON.stringify(r.data));
    r = await newClient().from('income_entries').select('id').limit(1);
    check(!!r.error, '3d. anon tabloya erisemez', JSON.stringify(r.data));
    r = await own.client.from('income_entries').update({ tenant_id: Y }).eq('id', diger.id);
    check(!!r.error, '3e. tenant_id degistirilemez', 'IZIN VERILDI');

    // 4. Sunucu ayni formul
    const kap = must(await own.client.rpc('compute_month_close_snapshot', { p_tenant_id: T, p_year: 2031, p_month: 3 }), 'kapanis snapshot');
    check(esit(kap.revenue, 19000) && esit(kap.otherIncome, 2500) && esit(kap.capitalIn, 50000)
      && esit(kap.totalIncome, 21500) && esit(kap.netProfit, 17500),
      '4a. Kapanis: rezervasyon geliri 19.000, diger 2.500, toplam 21.500, net kar 17.500 (sermaye haric)', JSON.stringify(kap));
    const dash = must(await own.client.rpc('get_executive_dashboard_snapshot', { p_tenant_id: T, p_target_month: '2031-03' }), 'yonetici snapshot');
    check(esit(dash.total_revenue, 21500) && esit(dash.room_revenue, 17000) && esit(dash.other_income, 2500)
      && esit(dash.capital_in, 50000) && esit(dash.net_profit, 17500) && esit(dash.operating_profit, 17500),
      '4b. Yonetici: toplam gelir 21.500, ciro 17.000 degismez, net kar 17.500', JSON.stringify(dash));
    const dashA = must(await own.client.rpc('get_executive_dashboard_snapshot', { p_tenant_id: T, p_target_month: '2031-03', p_property_id: A.id }), 'mulk snapshot');
    check(esit(dashA.other_income, 2500) && esit(dashA.capital_in, 0),
      '4c. Mulk gorunumu yalniz o mulkun gelirini sayar (portfoy sermayesi dahil degil)', JSON.stringify(dashA));

    // 5. Kapanmis donem
    must(await admin.from('income_entries').insert({ tenant_id: T, income_type: 'OTHER_INCOME', income_date: '2025-01-10', amount: 100, description: 'Ocak' }), 'ocak geliri');
    const ocak = must(await admin.from('income_entries').select('id').eq('tenant_id', T).eq('income_date', '2025-01-10').single(), 'ocak');
    must(await own.client.rpc('close_monthly_period_atomic', { p_tenant_id: T, p_year: 2025, p_month: 1, p_snapshot: {} }), 'ocak kapanisi');
    r = await own.client.from('income_entries').update({ amount: 200 }).eq('id', ocak.id);
    check(!!r.error && /CLOSED_PERIOD/.test(r.error.message || ''), '5a. Kapanmis donemde gelir degistirilemez', hataMetni(r.error) || 'IZIN VERILDI');
    r = await own.client.from('income_entries').delete().eq('id', ocak.id);
    check(!!r.error && /CLOSED_PERIOD/.test(r.error.message || ''), '5b. Kapanmis donemde gelir silinemez', hataMetni(r.error) || 'IZIN VERILDI');
    r = await gelir(own.client, { income_type: 'CAPITAL', income_date: '2025-01-20', amount: 10, description: 'x' });
    check(!!r.error && /CLOSED_PERIOD/.test(r.error.message || ''), '5c. Kapanmis doneme gelir eklenemez', hataMetni(r.error) || 'IZIN VERILDI');
    r = await own.client.from('income_entries').update({ income_date: '2025-01-15' }).eq('id', diger.id);
    check(!!r.error && /CLOSED_PERIOD/.test(r.error.message || ''), '5d. Acik donemdeki gelir kapanmis aya tasinamaz', hataMetni(r.error) || 'IZIN VERILDI');

    // 6. Sifirlama
    r = await own.client.rpc('reset_tenant_data', { p_tenant_id: T, p_confirm: 'VERILERI SIFIRLA' });
    const kalan = must(await admin.from('income_entries').select('id').eq('tenant_id', T), 'kalan');
    check(!r.error && kalan.length === 0 && Number((r.data?.deleted || {}).income_entries) === 3,
      '6. Sifirlama gelir defterini bosaltir (kapanmis donem dahil)', hataMetni(r.error) || JSON.stringify({ kalan, d: r.data }));
  } catch (e) {
    no('Beklenmeyen hata', e.stack || e.message);
  } finally {
    console.log('\n--- TEMIZLIK ---');
    let hata = false;
    for (const c of clients) { try { await c.client.auth.signOut(); } catch (e) {} }
    for (const t of createdTenants) {
      const { error } = await admin.from('tenants').delete().eq('id', t);
      if (error) { hata = true; console.error('[FAIL] Tenant ' + t + ': ' + error.message); }
    }
    for (const u of createdUsers) {
      const { data } = await admin.auth.admin.getUserById(u);
      if (data && data.user) { const { error } = await admin.auth.admin.deleteUser(u); if (error) { hata = true; console.error('[FAIL] Kullanici ' + u + ': ' + error.message); } }
    }
    if (hata) failed++; else ok('7. Test verileri eksiksiz temizlendi');
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
