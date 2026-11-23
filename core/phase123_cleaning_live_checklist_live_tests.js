/**
 * LEXBNB PHASE 123 — TEMIZLIK LISTESI: IKI SUTUN, AYNI ANDA ISARETLEME (CANLI, YALNIZ TEST PROJESI)
 *
 * Kullanici karari (22.11.2026): her maddede Temizlikci (Z) ve Kontrol (M) ayri; ikisi de
 * istedigi an isaretler. Olculen:
 *   1. Yonetici M'yi temizlik SURERKEN yazar (eskiden yalniz onayla, imzadan sonra).
 *   2. M yazmak Z'ye dokunmaz; temizlikcinin ilerleme kaydi M'yi silmez (iki yon).
 *   3. phase68 siniri: yonetici Z yazamaz; temizlikci M yazamaz; yabanci ve anon yazamaz.
 *   4. Onaylanmis temizlik muhurlu; M isareti onay degildir (gider dogmaz).
 *   5. cleaning_task_executions canli yayinda.
 * phase123 UYGULANMADAN kosulursa kirilir (CLAUDE.md 5.5).
 */
const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);

let passed = 0, failed = 0;
const users = [], tenants = [], clients = [];
const check = (c, n, d) => c ? (passed++, console.log(`[PASS] ${n}`)) : (failed++, console.error(`[FAIL] ${n}\n       ${d}`));
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.code || ''} ${r.error.message}`); return r.data; };
const hata = e => e ? `${e.code || ''} ${e.message || ''}`.trim() : '';
const yetki = e => !!e && (String(e.code) === '42501' || /permission denied|FORBIDDEN/i.test(String(e.message)));

async function makeUser(label, s) {
  const email = `p123_${label}_${s}@lexbnb-e2e.test`, password = 'P123!' + s;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  users.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  clients.push(client);
  return { id: d.user.id, client };
}

async function run() {
  console.log('LEXBNB PHASE 123 — TEMIZLIK LISTESI IKI SUTUN, AYNI ANDA (CANLI)\n');
  const s = Date.now();
  try {
    const own = await makeUser('own', s), stf = await makeUser('stf', s), atk = await makeUser('atk', s);
    const A = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P123 A ' + s, p_full_name: 'P123' }), 'A').tenant_id;
    tenants.push(A);
    const B = must(await atk.client.rpc('create_tenant_and_owner', { p_company_name: 'P123 B ' + s, p_full_name: 'P123' }), 'B').tenant_id;
    tenants.push(B);
    must(await admin.from('tenant_members').insert({ tenant_id: A, user_id: stf.id, role: 'staff' }), 'uye');
    const p = must(await own.client.from('properties').insert({ tenant_id: A, name: 'Villa Nefes', slug: 'p123' + s, base_price: 9000, clean_cost: 1200 }).select().single(), 'mulk');
    must(await own.client.from('property_checklist_templates').insert({ tenant_id: A, property_id: p.id, task_type: 'CLEANING', template_name: 'Nefes',
      items: { sections: [{ title: 'Mutfak', items: [{ text: 'Ocak', important: true, subChecks: ['Fırın'] }, { text: 'Çöp' }] }], supplies: [] } }), 'liste');
    const kisi = must(await own.client.from('operational_people').insert({ tenant_id: A, kind: 'CLEANER', full_name: 'Zeynep', user_id: stf.id }).select().single(), 'kisi');
    const ct = must(await own.client.from('cleaning_tasks').insert({ tenant_id: A, property_id: p.id, task_date: '2026-08-20', cleaner_name: 'Zeynep', amount: 1200, is_paid: false, status: 'PLANNED' }).select().single(), 'temizlik');
    const atama = must(await own.client.rpc('assign_cleaning_task', { p_cleaning_task_id: ct.id, p_person_id: kisi.id, p_template_id: null }), 'atama');
    const ex = atama.execution_id;
    const oku = async () => must(await admin.from('cleaning_task_executions').select('*').eq('id', ex).single(), 'oku');

    // 1. Temizlikci Z, yonetici M — ayni anda, temizlik surerken.
    let r = await stf.client.rpc('save_cleaning_progress', { p_execution_id: ex, p_checklist_result: { 's0.i0': { z: true } }, p_supplies_result: {}, p_note: null });
    check(!r.error, '1a. Temizlikci Z isaretler (kaydedilir)', hata(r.error));
    r = await own.client.rpc('set_cleaning_manager_marks', { p_execution_id: ex, p_marks: { 's0.i0': true, 's0.i0.sub0': true } });
    let e = await oku();
    check(!r.error && e.checklist_result['s0.i0'].m === true && e.checklist_result['s0.i0'].z === true && e.checklist_result['s0.i0.sub0'].m === true,
      '1b. Yonetici temizlik surerken Kontrol (M) yazar; Z korunur', hata(r.error) || JSON.stringify(e.checklist_result));
    check(e.status === 'IN_PROGRESS' && !e.inspector_signed_at, '1c. M isareti onay degildir: durum IN_PROGRESS, M imzasi yok', JSON.stringify({ s: e.status, m: e.inspector_signed_at }));

    // 2. Temizlikcinin sonraki kaydi M'yi silmez.
    r = await stf.client.rpc('save_cleaning_progress', { p_execution_id: ex, p_checklist_result: { 's0.i0': { z: false }, 's0.i1': { z: true } }, p_supplies_result: {}, p_note: null });
    e = await oku();
    check(!r.error && e.checklist_result['s0.i0'].m === true && e.checklist_result['s0.i0'].z === false && e.checklist_result['s0.i1'].z === true,
      '2. Temizlikci kaydi yoneticinin M isaretini silmez', JSON.stringify(e.checklist_result));

    // 3. Sinirlar.
    r = await own.client.rpc('save_cleaning_progress', { p_execution_id: ex, p_checklist_result: { 's0.i1': { z: false } }, p_supplies_result: {}, p_note: null });
    check(yetki(r.error), '3a. Yonetici Z yazamaz (phase68 siniri)', hata(r.error) || 'YAZDI');
    r = await stf.client.rpc('set_cleaning_manager_marks', { p_execution_id: ex, p_marks: { 's0.i1': true } });
    check(yetki(r.error), '3b. Temizlikci Kontrol (M) yazamaz', hata(r.error) || 'YAZDI');
    r = await atk.client.rpc('set_cleaning_manager_marks', { p_execution_id: ex, p_marks: { 's0.i1': true } });
    check(yetki(r.error), '3c. Yabanci kiraci M yazamaz', hata(r.error) || 'YAZDI');
    r = await newClient().rpc('set_cleaning_manager_marks', { p_execution_id: ex, p_marks: { 's0.i1': true } });
    check(!!r.error && /42501|permission denied|28000/i.test(hata(r.error)), '3d. Anon cagiramaz', hata(r.error) || 'YAZDI');
    r = await own.client.rpc('set_cleaning_manager_marks', { p_execution_id: ex, p_marks: { 'x; drop': true } });
    check(!!r.error && /INVALID_RESULT/.test(hata(r.error)), '3e. Gecersiz anahtar reddedilir', hata(r.error) || 'YAZDI');
    e = await oku();
    check(e.checklist_result['s0.i1'].z === true && e.checklist_result['s0.i1'].m == null, '3f. Reddedilen cagrilar hicbir isareti degistirmedi', JSON.stringify(e.checklist_result));

    // 4. Onay muhru; gider M onayiyla.
    must(await stf.client.rpc('save_cleaning_progress', { p_execution_id: ex, p_checklist_result: { 's0.i0': { z: true }, 's0.i0.sub0': { z: true } }, p_supplies_result: {}, p_note: null }), 'z tamam');
    let task = must(await admin.from('cleaning_tasks').select('status').eq('id', ct.id).single(), 'gorev');
    check(task.status === 'PLANNED', '4a. Isaretler gorevi "yapildi" yapmaz (gider dogmaz)', task.status);
    must(await stf.client.rpc('sign_cleaning_done', { p_execution_id: ex }), 'Z imza');
    must(await own.client.rpc('inspect_cleaning', { p_execution_id: ex, p_approve: true, p_m_marks: {}, p_inspector_note: null }), 'onay');
    e = await oku();
    task = must(await admin.from('cleaning_tasks').select('status').eq('id', ct.id).single(), 'gorev');
    check(e.status === 'INSPECTED' && task.status === 'DONE' && e.checklist_result['s0.i0'].m === true,
      '4b. Onay bos isaretle gelir; once yazilan M korunur, gorev DONE', JSON.stringify({ s: e.status, t: task.status, r: e.checklist_result['s0.i0'] }));
    r = await own.client.rpc('set_cleaning_manager_marks', { p_execution_id: ex, p_marks: { 's0.i1': true } });
    check(!!r.error && /EXECUTION_LOCKED/.test(hata(r.error)), '4c. Onaylanmis temizlik muhurlu', hata(r.error) || 'YAZDI');

    // 5. Canli yayin.
    const pub = await admin.rpc('set_cleaning_manager_marks', { p_execution_id: ex, p_marks: {} });
    check(!!pub.error, '5a. service_role da yonetici degildir (oturum yok)', 'CAGRILDI');
    const { data: tablo } = await admin.from('cleaning_task_executions').select('id').eq('id', ex);
    check(Array.isArray(tablo) && tablo.length === 1, '5b. Okuma RLS altinda kirilmadi', JSON.stringify(tablo));
  } catch (err) {
    failed++; console.error('[FAIL] Beklenmeyen hata\n       ' + (err.stack || err.message));
  } finally {
    for (const c of clients) { try { await c.auth.signOut(); } catch (e) { /* yok */ } }
    let kirli = false;
    for (const t of tenants) { const { error } = await admin.from('tenants').delete().eq('id', t); if (error) { kirli = true; console.error('[FAIL] tenant ' + error.message); } }
    for (const u of users) { const { data } = await admin.auth.admin.getUserById(u); if (data && data.user) { const { error } = await admin.auth.admin.deleteUser(u); if (error) { kirli = true; console.error('[FAIL] kullanici ' + error.message); } } }
    kirli ? failed++ : (passed++, console.log('[PASS] Z. Test verileri temizlendi'));
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed > 0) process.exit(1);
  }
}

run();
