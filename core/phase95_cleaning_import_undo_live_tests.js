/**
 * LEXBNB PHASE 95 — GECMIS TEMIZLIK AKTARIMI GERI ALINABILIR (CANLI, YALNIZ TEST PROJESI)
 *
 * Kullanici M25: gecmis temizlikler cleaning_tasks'a "yapildi" olarak aktarilir;
 * yanlis dosya tek tusla geri alinabilmeli.
 *
 *   1. Aktarim bagi temizlik gorevini tasir; tek hedef kurali korunur.
 *   2. Geri alma aktarilan temizligi siler; sonradan "Ödendi" isaretlenen
 *      (duzenlenen) temizlik atlanir.
 *   3. Kapanmis aya dusen temizlik varsa hicbir sey silinmez.
 *   4. Rezervasyon/gider geri almasi bozulmadi (phase35/37 kontrol grubu).
 *   5. Personel (staff) bag yazamaz; anon cagiramaz.
 *
 * phase95 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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
const ONAY = 'AKTARIMI GERI AL';

async function makeUser(label, stamp) {
  const email = `p95_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P95!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 95 — GECMIS TEMIZLIK AKTARIMI GERI ALINABILIR (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), stf = await makeUser('stf', s);
    clients.push(own, stf);
    const T = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P95 ' + s, p_full_name: 'P95' }), 'isletme').tenant_id;
    createdTenants.push(T);
    must(await admin.from('tenant_members').insert({ tenant_id: T, user_id: stf.id, role: 'staff' }), 'uye');
    const P = must(await own.client.from('properties').insert({ tenant_id: T, name: 'P95A', slug: 'p95a' + s, base_price: 10000, activated_on: '2025-01-01' }).select().single(), 'mulk');

    const temizlik = async (tarih, tutar) => must(await own.client.from('cleaning_tasks').insert({
      tenant_id: T, property_id: P.id, task_date: tarih, cleaner_name: 'TEST Geçmiş', amount: tutar, status: 'DONE', is_paid: true
    }).select('id, status, is_paid').single(), 'temizlik ' + tarih);
    const parti = async (ad) => must(await own.client.from('finance_import_batches').insert({
      tenant_id: T, file_hash: (ad + s).padEnd(64, '0').slice(0, 64), filename: ad, row_count: 1, imported_amount: 0
    }).select('id').single(), 'parti ' + ad).id;
    const bagla = (client, batch, alan) => client.from('finance_import_batch_rows').insert({ tenant_id: T, batch_id: batch, ...alan, source_row_num: 2 });

    // 1. Bag temizligi tasir
    const t1 = await temizlik('2025-06-10', 1200), t2 = await temizlik('2025-06-14', 1300);
    check(t1.status === 'DONE' && t1.is_paid === true, '1a. Gecmis temizlik "yapildi + odendi" olarak yazilir', JSON.stringify(t1));
    const b1 = await parti('temizlik-1.xlsx');
    let r = await bagla(own.client, b1, { cleaning_task_id: t1.id });
    const r2 = await bagla(own.client, b1, { cleaning_task_id: t2.id });
    check(!r.error && !r2.error, '1b. Aktarim bagi temizlik gorevini tasir', hataMetni(r.error || r2.error));
    r = await bagla(own.client, b1, { cleaning_task_id: t1.id, expense_id: null, booking_id: null });
    check(!!r.error, '1c. Ayni temizlik iki kez baglanamaz', 'KABUL EDILDI');
    const gider = must(await own.client.from('expenses').insert({ tenant_id: T, expense_date: '2025-06-01', category: 'Fatura', amount: 100, expense_type: 'OPEX' }).select('id').single(), 'gider');
    r = await bagla(own.client, b1, { cleaning_task_id: t2.id, expense_id: gider.id });
    check(!!r.error, '1d. Bir bag satiri iki hedef tasiyamaz', 'KABUL EDILDI');

    // 2. Geri alma: duzenlenen atlanir
    must(await own.client.from('cleaning_tasks').update({ description: 'elle duzeltildi' }).eq('id', t2.id), 'duzenleme');
    r = await own.client.rpc('undo_finance_import', { p_tenant_id: T, p_batch_id: b1, p_confirm: ONAY });
    const kalan = must(await admin.from('cleaning_tasks').select('id').eq('tenant_id', T), 'kalan').map(x => x.id);
    check(!r.error && r.data.deleted_cleaning_tasks === 1 && r.data.skipped_modified === 1 && !kalan.includes(t1.id) && kalan.includes(t2.id),
      '2. Geri alma aktarilan temizligi siler, sonradan duzenleneni atlar', hataMetni(r.error) || JSON.stringify({ data: r.data, kalan }));

    // 3. Kapanmis ay
    const t3 = await temizlik('2025-07-05', 900);
    const b3 = await parti('temizlik-kapali.xlsx');
    must(await bagla(own.client, b3, { cleaning_task_id: t3.id }), 'bag3');
    must(await admin.from('monthly_financial_closes').insert({ tenant_id: T, year: 2025, month: 7, status: 'CLOSED', closed_at: new Date().toISOString() }), 'kapanis');
    r = await own.client.rpc('undo_finance_import', { p_tenant_id: T, p_batch_id: b3, p_confirm: ONAY });
    const t3Var = must(await admin.from('cleaning_tasks').select('id').eq('id', t3.id), 't3');
    check(!!r.error && /CLOSED_PERIOD_BLOCK/.test(r.error.message || '') && t3Var.length === 1,
      '3. Kapanmis aya dusen temizlik varsa hicbir sey silinmez', hataMetni(r.error) || 'SILINDI');

    // 4. Gider geri almasi bozulmadi (kontrol grubu)
    const g2 = must(await own.client.from('expenses').insert({ tenant_id: T, expense_date: '2025-05-02', category: 'Fatura', amount: 250, expense_type: 'OPEX' }).select('id').single(), 'gider2');
    const b4 = await parti('gider.xlsx');
    must(await bagla(own.client, b4, { expense_id: g2.id }), 'bag4');
    r = await own.client.rpc('undo_finance_import', { p_tenant_id: T, p_batch_id: b4, p_confirm: ONAY });
    check(!r.error && r.data.deleted_expenses === 1 && r.data.batch_removed === true, '4. Gider aktarimi eskisi gibi geri alinir', hataMetni(r.error) || JSON.stringify(r.data));

    // 5. Yetki
    const t5 = await temizlik('2025-05-20', 700);
    const b5 = await parti('temizlik-5.xlsx');
    r = await bagla(stf.client, b5, { cleaning_task_id: t5.id });
    check(!!r.error, '5a. Personel (staff) aktarim bagi yazamaz', 'KABUL EDILDI');
    r = await newClient().rpc('undo_finance_import', { p_tenant_id: T, p_batch_id: b5, p_confirm: ONAY });
    check(!!r.error, '5b. anon geri alma cagiramaz', JSON.stringify(r.data));
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
    if (hata) failed++; else ok('6. Test verileri eksiksiz temizlendi');
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
