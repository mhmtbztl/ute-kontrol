/**
 * LEXBNB AY KAPANISI BUTUNLUGU TEST SUITE (PHASE 20)
 *
 * 2026-09-13'te CANLI ORTAMDA olculen alti acik:
 *
 *   A) Kapali aydaki rezervasyon ACIK bir aya tasinabiliyordu.
 *      Olcum: Mayis kapatildi, 05-10 -> 06-10 tasindi -> IZIN VERILDI.
 *             Kapali Mayis'in cirosu 50.000 TL azaldi.
 *   B) Ayni sey giderde de vardi (05-12 -> 06-12 IZIN VERILDI).
 *   C) Kapanis kaydi dogrudan OPEN yapilabiliyor ya da SILINEBILIYORDU.
 *      Snapshot ile birlikte tum denetim izi yok oluyordu.
 *   D) manager rolu kapanis kaydini silebiliyordu.
 *   E) Baslamamis ay kapatilabiliyordu (2099-12 kabul edildi).
 *   F) Aylari kesen rezervasyon korumayi tamamen deliyordu:
 *      Mayis kapaliyken 04-28 -> 05-03 KABUL EDILDI. Gelir gece bazinda
 *      dagitildigi icin bu, kapali Mayis'a 3 gecelik ciro ekliyordu.
 *
 * Ayrica: anlik goruntuyu (kapanisin resmi rakami) TARAYICI hesapliyordu.
 * Artik sunucu hesapliyor, istemcininki de saklanip karsilastiriliyor.
 *
 * Bu suit phase20 gocu UYGULANMADAN calistirilirsa kirilir. Oyle olmali.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let passed = 0, failed = 0;
const createdUsers = [];
const createdTenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

async function makeUser(label, stamp) {
  const email = `mci_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'Mci!' + stamp;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${label}: ${error.message}`);
  createdUsers.push(data.user.id);
  const client = newClient();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${label} giris: ${e2.message}`);
  return { email, client, id: data.user.id };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB AY KAPANISI BUTUNLUGU TESTLERI');
  console.log('=============================================================================\n');

  const stamp = Date.now();
  let owner, manager;

  try {
    owner = await makeUser('own', stamp);
    const { data: t, error: te } = await owner.client.rpc('create_tenant_and_owner', {
      p_company_name: 'Kapanis Butunlugu ' + stamp, p_full_name: 'T'
    });
    if (te) throw new Error('tenant: ' + te.message);
    createdTenants.push(t.tenant_id);
    const TID = t.tenant_id;

    const { data: prop, error: pe } = await owner.client.from('properties')
      .insert({ tenant_id: TID, name: 'Villa', slug: 'villa', base_price: 10000 }).select().single();
    if (pe) throw new Error('mulk: ' + pe.message);

    // Aylari kesen rezervasyon: 04-28,04-29,04-30 (Nisan 3 gece) + 05-01,05-02 (Mayis 2 gece)
    // Brut 50.000 / 5 gece = 10.000/gece  ->  Nisan 30.000, Mayis 20.000
    const { data: bk, error: be } = await owner.client.from('bookings').insert({
      tenant_id: TID, property_id: prop.id, booking_code: 'MCI-1', guest_name: 'Misafir',
      check_in: '2026-04-28', check_out: '2026-05-03', gross_amount: 50000
    }).select().single();
    if (be) throw new Error('rezervasyon: ' + be.message);

    const { data: exp, error: ee } = await owner.client.from('expenses').insert({
      tenant_id: TID, category: 'Bakim', amount: 9000, expense_date: '2026-04-15', description: 'test'
    }).select().single();
    if (ee) throw new Error('gider: ' + ee.message);

    // -----------------------------------------------------------------------
    console.log('--- 1. SUNUCU TARAFI ANLIK GORUNTU ---');
    // Istemci KASTEN yanlis rakam gonderiyor. Sunucu kendi hesabini yapmali.
    const { data: kap, error: ke } = await owner.client.rpc('close_monthly_period_atomic', {
      p_tenant_id: TID, p_year: 2026, p_month: 4,
      p_snapshot: { schemaVersion: 1, financial: { revenue: 999999 } }
    });
    if (ke) throw new Error('Nisan kapatilamadi: ' + ke.message);

    const srv = kap && kap.server_snapshot;
    check(!!srv, '1. Kapanis sunucu tarafi anlik goruntu dondurur',
      'server_snapshot yok — snapshot hala yalnizca istemciden geliyor: ' + JSON.stringify(kap));

    check(srv && Number(srv.soldNights) === 3,
      '2. Aylari kesen rezervasyon gece bazinda dagitilir (Nisan 3 gece)',
      'soldNights=' + (srv && srv.soldNights) + ' (beklenen 3)');

    check(srv && Math.abs(Number(srv.revenue) - 30000) < 0.01,
      '3. Nisan cirosu tahakkuk esasiyla 30.000 TL hesaplanir',
      'revenue=' + (srv && srv.revenue) + ' (beklenen 30000)');

    check(kap && kap.client_matches_server === false,
      '4. Istemcinin uydurma rakami sunucuyla uyusmadigi icin isaretlenir',
      'client_matches_server=' + (kap && kap.client_matches_server) +
      ' delta=' + (kap && kap.revenue_delta));

    // -----------------------------------------------------------------------
    console.log('\n--- 2. KAPALI DONEMDEN KACIS (A, B, F) ---');
    const { error: eA } = await owner.client.from('bookings')
      .update({ check_in: '2026-06-10', check_out: '2026-06-14' }).eq('id', bk.id);
    const { data: bkSonra } = await admin.from('bookings').select('check_in').eq('id', bk.id).single();
    check(!!eA && bkSonra.check_in === '2026-04-28',
      'A. Kapali aydaki rezervasyon acik bir aya TASINAMAZ',
      eA ? ('engellendi ama kayit degismis: ' + bkSonra.check_in)
         : 'IZIN VERILDI — kapali Nisan cirosu sessizce degisti');

    const { error: eB } = await owner.client.from('expenses')
      .update({ expense_date: '2026-06-15' }).eq('id', exp.id);
    const { data: expSonra } = await admin.from('expenses').select('expense_date').eq('id', exp.id).single();
    check(!!eB && expSonra.expense_date === '2026-04-15',
      'B. Kapali aydaki gider acik bir aya TASINAMAZ',
      eB ? ('engellendi ama kayit degismis: ' + expSonra.expense_date) : 'IZIN VERILDI');

    const { error: eB2 } = await owner.client.from('expenses').delete().eq('id', exp.id);
    check(!!eB2, 'B2. Kapali aydaki gider SILINEMEZ', 'IZIN VERILDI');

    const { error: eF } = await owner.client.from('bookings').insert({
      tenant_id: TID, property_id: prop.id, booking_code: 'MCI-2', guest_name: 'M2',
      check_in: '2026-03-30', check_out: '2026-04-02', gross_amount: 30000
    });
    check(!!eF,
      'F. Kapali aya gece dusuren rezervasyon EKLENEMEZ (03-30 -> 04-02)',
      'IZIN VERILDI — kapali Nisan\'a 2 gecelik ciro eklendi');

    // Regresyon: finansal olmayan alan hala duzenlenebilmeli
    const { error: eNot } = await owner.client.from('bookings')
      .update({ notes: 'kapali donemde not' }).eq('id', bk.id);
    check(!eNot, '5. Kapali donemde finansal olmayan alan (not) duzenlenebilir',
      eNot && eNot.message);

    // -----------------------------------------------------------------------
    console.log('\n--- 3. KAPANIS KAYDININ DEGISTIRILEMEZLIGI (C) ---');
    const { error: eC1 } = await owner.client.from('monthly_financial_closes')
      .update({ status: 'OPEN' }).eq('tenant_id', TID).eq('year', 2026).eq('month', 4);
    const { data: c1 } = await admin.from('monthly_financial_closes')
      .select('status').eq('tenant_id', TID).eq('year', 2026).eq('month', 4).single();
    check(!!eC1 && c1.status === 'CLOSED',
      'C1. Kapanis kaydi dogrudan OPEN yapilamaz',
      eC1 ? ('engellendi ama status=' + c1.status) : 'IZIN VERILDI — muhur anahtari ustunde');

    const { error: eC2 } = await owner.client.from('monthly_financial_closes')
      .delete().eq('tenant_id', TID).eq('year', 2026).eq('month', 4);
    const { data: c2 } = await admin.from('monthly_financial_closes')
      .select('id').eq('tenant_id', TID).eq('year', 2026).eq('month', 4);
    check(!!eC2 && (c2 || []).length === 1,
      'C2. Kapanis kaydi SILINEMEZ (denetim izi korunur)',
      eC2 ? ('engellendi ama kayit sayisi=' + (c2 || []).length)
          : 'IZIN VERILDI — snapshot ve denetim izi yok oldu');

    // -----------------------------------------------------------------------
    console.log('\n--- 4. GELECEK DONEM (E) ---');
    const { error: eE } = await owner.client.rpc('close_monthly_period_atomic', {
      p_tenant_id: TID, p_year: 2099, p_month: 12, p_snapshot: {}
    });
    check(!!eE, 'E. Henuz baslamamis bir ay KAPATILAMAZ (2099-12)',
      'IZIN VERILDI — o aya artik hic rezervasyon girilemez');

    // -----------------------------------------------------------------------
    console.log('\n--- 5. YENIDEN ACMA YETKISI (D) ---');
    manager = await makeUser('mgr', stamp);
    const { error: ie } = await owner.client.rpc('create_tenant_invitation', {
      p_tenant_id: TID, p_email: manager.email, p_role: 'manager'
    });
    if (ie) throw new Error('davet: ' + ie.message);
    await manager.client.rpc('accept_pending_invitations');

    const { error: eD1 } = await manager.client.rpc('reopen_monthly_period_atomic', {
      p_tenant_id: TID, p_year: 2026, p_month: 4, p_reason: 'Fatura duzeltmesi gerekiyor'
    });
    check(!!eD1, 'D1. manager rolu kapatilmis donemi YENIDEN ACAMAZ', 'manager acabildi');

    const { error: eD2 } = await manager.client.from('monthly_financial_closes')
      .delete().eq('tenant_id', TID).eq('year', 2026).eq('month', 4);
    check(!!eD2, 'D2. manager rolu kapanis kaydini SILEMEZ', 'manager silebildi');

    const { error: eRs } = await owner.client.rpc('reopen_monthly_period_atomic', {
      p_tenant_id: TID, p_year: 2026, p_month: 4, p_reason: 'kisa'
    });
    check(!!eRs, '6. Yeniden acmada gerekce ZORUNLU (kisa gerekce reddedilir)',
      'gerekcesiz acilabildi');

    const { data: rop, error: eR } = await owner.client.rpc('reopen_monthly_period_atomic', {
      p_tenant_id: TID, p_year: 2026, p_month: 4,
      p_reason: 'Nisan faturasi geç geldi, gider kaydi eksik kalmisti.'
    });
    check(!eR && rop && rop.status === 'OPEN',
      '7. owner gerekce yazarak donemi yeniden acabilir',
      eR ? eR.message : JSON.stringify(rop));

    const { data: kayit } = await admin.from('monthly_financial_closes')
      .select('snapshot_json,server_snapshot_json,history_json,reopen_reason')
      .eq('tenant_id', TID).eq('year', 2026).eq('month', 4).single();
    check(kayit && kayit.server_snapshot_json && Array.isArray(kayit.history_json)
          && kayit.history_json.length === 2
          && kayit.history_json[0].action === 'CLOSED'
          && kayit.history_json[1].action === 'REOPENED'
          && !!kayit.reopen_reason,
      '8. Yeniden acmada anlik goruntu korunur, gecmise CLOSED+REOPENED islenir',
      JSON.stringify(kayit && kayit.history_json));

    // -----------------------------------------------------------------------
    console.log('\n--- 6. ACILDIKTAN SONRA YAZMA SERBEST ---');
    const { error: eW } = await owner.client.from('expenses')
      .update({ amount: 9500 }).eq('id', exp.id);
    check(!eW, '9. Donem yeniden acilinca gider tekrar duzenlenebilir',
      eW && eW.message);

  } catch (err) {
    no('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    console.log('\n--- TEMIZLIK ---');
    let hata = false;
    for (const c of [owner, manager]) {
      if (c && c.client) { try { await c.client.auth.signOut(); } catch (e) {} }
    }
    async function retry(l, fn) {
      for (let a = 1; a <= 3; a++) {
        const { error } = await fn();
        if (!error) return true;
        if (a === 3) { console.error(`[FAIL] ${l}: ${error.message}`); return false; }
        await new Promise(r => setTimeout(r, a * 400));
      }
    }
    for (const t of createdTenants) if (!await retry('Tenant ' + t, () => admin.from('tenants').delete().eq('id', t))) hata = true;
    for (const u of createdUsers) if (!await retry('Kullanici ' + u, () => admin.auth.admin.deleteUser(u))) hata = true;

    const { data: after } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const kalan = (after ? after.users : []).filter(u => createdUsers.includes(u.id));
    if (kalan.length) { hata = true; console.error(`[FAIL] ${kalan.length} test hesabi duruyor`); }

    if (hata) failed++; else ok('10. Test verileri eksiksiz temizlendi');

    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
