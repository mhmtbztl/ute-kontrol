/**
 * LEXBNB PHASE 57 — REZERVASYON ODEME DEFTERI (CANLI, YALNIZ TEST PROJESI)
 *
 *   A. Kayit ve kalan: sales kapora girer; kalan = (brut - indirim) - odemeler,
 *      saklanmaz, gorunumden hesaplanir.
 *   B. ODEME CIROYU DEGISTIRMEZ: sunucu anlik goruntusu ve ay kapanis
 *      hesabi odeme eklenmeden once ve sonra birebir ayni.
 *   C. Roller: staff gormez, viewer okur ama yazmaz, sales silemez,
 *      yabanci kiraci yazamaz.
 *   D. Kapanmis donem odeme tarihine gore muhurlu; tur/not duzeltilebilir.
 *   E. Odemesi olan rezervasyon silinmez; sifirlama calisir.
 *
 * phase57 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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

async function makeUser(label, stamp) {
  const email = `p57_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P57!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

/** Zaman damgasi tasiyan alanlari cikarir; kalan her sey birebir karsilastirilir. */
function sabitle(obj) {
  return JSON.stringify(obj, (k, v) => (/(_at|At|generated|computed|timestamp)$/.test(k) ? undefined : v));
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 57 — REZERVASYON ODEME DEFTERI (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), sls = await makeUser('sls', s), stf = await makeUser('stf', s),
      vw = await makeUser('vw', s), atk = await makeUser('atk', s);
    clients.push(own, sls, stf, vw, atk);
    const A = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P57 A ' + s, p_full_name: 'P57' }), 'isletme A').tenant_id;
    createdTenants.push(A);
    const B = must(await atk.client.rpc('create_tenant_and_owner', { p_company_name: 'P57 B ' + s, p_full_name: 'P57' }), 'isletme B').tenant_id;
    createdTenants.push(B);
    must(await admin.from('tenant_members').insert([
      { tenant_id: A, user_id: sls.id, role: 'sales' }, { tenant_id: A, user_id: stf.id, role: 'staff' },
      { tenant_id: A, user_id: vw.id, role: 'viewer' }]), 'uyeler');
    const p = must(await own.client.from('properties').insert({ tenant_id: A, name: 'Villa P57', slug: 'p57' + s, base_price: 10000 }).select().single(), 'mulk');
    must(await admin.from('properties').update({ activated_on: '2026-01-01' }).eq('id', p.id), 'faaliyet');
    const bk = must(await admin.from('bookings').insert({ tenant_id: A, property_id: p.id, booking_code: 'P57-' + s, guest_name: 'Misafir',
      check_in: '2026-08-10', check_out: '2026-08-13', gross_amount: 30000, discount: 2000 }).select().single(), 'rezervasyon');
    const bk2 = must(await admin.from('bookings').insert({ tenant_id: A, property_id: p.id, booking_code: 'P57B-' + s, guest_name: 'Ikinci',
      check_in: '2026-08-20', check_out: '2026-08-22', gross_amount: 20000 }).select().single(), 'rezervasyon 2');

    const snapAug = async () => must(await own.client.rpc('get_executive_dashboard_snapshot', { p_tenant_id: A, p_target_month: '2026-08', p_property_id: null }), 'anlik');
    const closeAug = async () => must(await own.client.rpc('compute_month_close_snapshot', { p_tenant_id: A, p_year: 2026, p_month: 8 }), 'kapanis hesabi');
    const onceSnap = sabitle(await snapAug()), onceClose = sabitle(await closeAug());

    // -----------------------------------------------------------------------
    console.log('\n--- A. KAYIT VE KALAN ---');
    let r = await sls.client.from('booking_payments').insert({ tenant_id: A, booking_id: bk.id, paid_on: '2026-07-20', amount: 5000,
      kind: 'DEPOSIT', method: 'BANK_TRANSFER', note: 'Kapora' }).select().single();
    check(!r.error, 'A1. sales kapora kaydeder', hataMetni(r.error));
    const kapora = r.data || {};
    r = await sls.client.from('booking_payments').insert({ tenant_id: A, booking_id: bk.id, paid_on: '2026-08-10', amount: 13000, kind: 'INTERIM', method: 'CASH' });
    check(!r.error, 'A2. Ara odeme kaydedilir', hataMetni(r.error));
    r = await sls.client.from('booking_payment_balances').select('*').eq('booking_id', bk.id).single();
    check(!r.error && Number(r.data.amount_due) === 28000 && Number(r.data.paid_total) === 18000 && Number(r.data.remaining) === 10000
      && r.data.payment_count === 2, 'A3. Kalan hesaplanir: (30.000 - 2.000) - 18.000 = 10.000', hataMetni(r.error) || JSON.stringify(r.data));
    r = await sls.client.from('booking_payments').insert({ tenant_id: A, booking_id: bk.id, paid_on: '2026-08-10', amount: 0, kind: 'BALANCE' });
    check(!!r.error, 'A4. Sifir tutarli odeme reddedilir', 'KAYDEDILDI');
    r = await sls.client.from('booking_payments').insert({ tenant_id: A, booking_id: bk.id, paid_on: '2026-08-10', amount: 10, kind: 'KAPORA' });
    check(!!r.error, 'A5. Tanimsiz odeme turu reddedilir', 'KAYDEDILDI');

    // -----------------------------------------------------------------------
    console.log('\n--- B. ODEME CIROYU DEGISTIRMEZ ---');
    check(sabitle(await snapAug()) === onceSnap, 'B1. Sunucu anlik goruntusu (Agustos) odemeden once ve sonra birebir ayni', 'DEGISTI');
    check(sabitle(await closeAug()) === onceClose, 'B2. Ay kapanis hesabi (Agustos) birebir ayni', 'DEGISTI');

    // -----------------------------------------------------------------------
    console.log('\n--- C. ROLLER ---');
    let g = await stf.client.from('booking_payments').select('id').eq('tenant_id', A);
    check((g.data || []).length === 0, 'C1. staff odemeleri goremez', `${(g.data || []).length} satir`);
    g = await stf.client.from('booking_payment_balances').select('booking_id').eq('tenant_id', A);
    check((g.data || []).length === 0, 'C2. staff kalan gorunumunden de bir sey goremez (security_invoker)', `${(g.data || []).length} satir`);
    r = await stf.client.from('booking_payments').insert({ tenant_id: A, booking_id: bk.id, paid_on: '2026-08-11', amount: 1, kind: 'INTERIM' });
    check(!!r.error, 'C3. staff odeme yazamaz', 'YAZDI');
    g = await vw.client.from('booking_payments').select('id').eq('tenant_id', A);
    check((g.data || []).length === 2, 'C4. viewer odemeleri okur', `${(g.data || []).length} satir`);
    r = await vw.client.from('booking_payments').insert({ tenant_id: A, booking_id: bk.id, paid_on: '2026-08-11', amount: 1, kind: 'INTERIM' });
    check(!!r.error, 'C5. viewer odeme yazamaz', 'YAZDI');
    r = await sls.client.from('booking_payments').delete().eq('id', kapora.id).select('id');
    check((await admin.from('booking_payments').select('id').eq('id', kapora.id)).data.length === 1, 'C6. sales odeme SILEMEZ', `${(r.data || []).length} satir`);
    r = await atk.client.from('booking_payments').insert({ tenant_id: A, booking_id: bk.id, paid_on: '2026-08-11', amount: 1, kind: 'INTERIM' });
    check(!!r.error, 'C7. yabanci kiraci A defterine yazamaz', 'YAZDI');
    r = await atk.client.from('booking_payments').insert({ tenant_id: B, booking_id: bk.id, paid_on: '2026-08-11', amount: 1, kind: 'INTERIM' });
    check(!!r.error && /CROSS_TENANT/.test(hataMetni(r.error)), 'C8. yabanci kiraci A rezervasyonuna kendi defterinden baglanamaz', hataMetni(r.error) || 'YAZDI');

    // -----------------------------------------------------------------------
    console.log('\n--- D. KAPANMIS DONEM (ODEME TARIHI) ---');
    must(await own.client.rpc('close_monthly_period_atomic', { p_tenant_id: A, p_year: 2026, p_month: 7, p_snapshot: {} }), 'Temmuz kapanisi');
    r = await own.client.from('booking_payments').update({ amount: 6000 }).eq('id', kapora.id).select('id');
    check(!!r.error && /CLOSED_PERIOD_VIOLATION/.test(hataMetni(r.error)), 'D1. Kapanmis aydaki odemenin tutari degismez', hataMetni(r.error) || 'DEGISTI');
    r = await own.client.from('booking_payments').delete().eq('id', kapora.id).select('id');
    check(!!r.error && /CLOSED_PERIOD_VIOLATION/.test(hataMetni(r.error)), 'D2. Kapanmis aydaki odeme silinmez', hataMetni(r.error) || 'SILINDI');
    r = await own.client.from('booking_payments').insert({ tenant_id: A, booking_id: bk.id, paid_on: '2026-07-25', amount: 100, kind: 'INTERIM' });
    check(!!r.error && /CLOSED_PERIOD_VIOLATION/.test(hataMetni(r.error)), 'D3. Kapanmis aya yeni odeme yazilmaz', hataMetni(r.error) || 'YAZDI');
    r = await own.client.from('booking_payments').update({ note: 'Havale dekontu alindi', method: 'CASH' }).eq('id', kapora.id).select('id');
    check(!r.error && (r.data || []).length === 1, 'D4. Kapanmis aydaki odemenin notu ve yontemi duzeltilir', hataMetni(r.error));
    r = await sls.client.from('booking_payments').insert({ tenant_id: A, booking_id: bk.id, paid_on: '2026-09-01', amount: 10000, kind: 'BALANCE', method: 'CASH' });
    check(!r.error, 'D5. Acik ayda kalan odemesi alinir', hataMetni(r.error));
    const son = must(await own.client.from('booking_payment_balances').select('remaining').eq('booking_id', bk.id).single(), 'kalan');
    check(Number(son.remaining) === 0, 'D6. Tum odemeler alininca kalan 0', JSON.stringify(son));

    // -----------------------------------------------------------------------
    console.log('\n--- E. SILME VE SIFIRLAMA ---');
    r = await own.client.rpc('delete_booking_atomic', { p_booking_id: bk.id, p_tenant_id: A });
    check(!!r.error && /BOOKING_HAS_PAYMENTS/.test(hataMetni(r.error)) && (await admin.from('bookings').select('id').eq('id', bk.id)).data.length === 1,
      'E1. Odemesi olan rezervasyon silinmez; mesaj nedenini soyler', hataMetni(r.error) || 'SILINDI');
    r = await own.client.rpc('delete_booking_atomic', { p_booking_id: bk2.id, p_tenant_id: A });
    check(!r.error, 'E2. Odemesi olmayan rezervasyon silinmeye devam eder', hataMetni(r.error));
    r = await own.client.rpc('reset_tenant_data', { p_tenant_id: A, p_confirm: 'VERILERI SIFIRLA' });
    const kalan = must(await admin.from('booking_payments').select('id').eq('tenant_id', A), 'odemeler');
    check(!r.error && kalan.length === 0, 'E3. Sifirlama kapanmis ay ve odemeli rezervasyon varken calisir', hataMetni(r.error) || `${kalan.length} odeme kaldi`);
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
    if (hata) failed++; else ok('Z. Test verileri eksiksiz temizlendi');
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
