/**
 * LEXBNB PHASE 55 — OPERASYON INSANLARI VE IKI IMZALI TEMIZLIK (CANLI, YALNIZ TEST PROJESI)
 *
 * Kullanici karari (30.09.2026): Z = temizlikci "yaptim", M = yonetici
 * denetimi. GIDER M ILE OLUSUR; gider ayi temizlik gunudur (task_date).
 * Denetim bekleyen temizlik varken ay kapanmaz.
 *
 *   A. Liste ve genel gorev: kisi listesi, mulksuz gorev, sablon bicimi.
 *   B. Atama ve saha gorunumu: get_my_field_work kapi kodunu verir, tutari
 *      VERMEZ; baskasinin isi gorunmez.
 *   C. Z/M: Z imzasi gider yazmaz; ay kapanmaz; M reddi Z'yi siler; M onayi
 *      gideri temizlik gununun ayina yazar (sunucu anlik goruntusu).
 *   D. Yetki: staff atayamaz/denetleyemez/baskasinin isine yazamaz, sales
 *      operasyon defterini okumaz, yabanci kiraci atayamaz.
 *
 * phase55 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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
const yetkiHatasi = e => !!e && (String(e.code) === '42501' || /permission denied|FORBIDDEN|row-level security/i.test(String(e.message)));
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

function bul(obj, anahtar) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, anahtar)) return obj[anahtar];
  for (const v of Object.values(obj)) { const r = bul(v, anahtar); if (r !== undefined) return r; }
  return undefined;
}

async function makeUser(label, stamp) {
  const email = `p55_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P55!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

const MONTH = '2026-08';           // bitmis ay: kapanis denenebilir (phase43)
const TASK_DATE = '2026-08-20';

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 55 — OPERASYON INSANLARI VE IKI IMZALI TEMIZLIK (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), stf = await makeUser('stf', s), stf2 = await makeUser('stf2', s),
      sls = await makeUser('sls', s), atk = await makeUser('atk', s);
    clients.push(own, stf, stf2, sls, atk);
    const A = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P55 A ' + s, p_full_name: 'P55' }), 'isletme A').tenant_id;
    createdTenants.push(A);
    const B = must(await atk.client.rpc('create_tenant_and_owner', { p_company_name: 'P55 B ' + s, p_full_name: 'P55' }), 'isletme B').tenant_id;
    createdTenants.push(B);
    must(await admin.from('tenant_members').insert([
      { tenant_id: A, user_id: stf.id, role: 'staff' }, { tenant_id: A, user_id: stf2.id, role: 'staff' },
      { tenant_id: A, user_id: sls.id, role: 'sales' }]), 'uyeler');

    const p = must(await own.client.from('properties').insert({ tenant_id: A, name: 'Villa Seyir', slug: 'p55' + s, base_price: 10000, clean_cost: 1500 }).select().single(), 'mulk');
    must(await admin.from('properties').update({ activated_on: '2026-01-01' }).eq('id', p.id), 'faaliyet');
    must(await own.client.from('property_guest_settings').insert({ tenant_id: A, property_id: p.id, door_code: '2468', address_text: 'Koy yolu 5' }), 'giris bilgisi');
    const ct = must(await own.client.from('cleaning_tasks').insert({ tenant_id: A, property_id: p.id, task_date: TASK_DATE,
      cleaner_name: 'Ayse', amount: 1500, is_paid: false, status: 'PLANNED' }).select().single(), 'temizlik');

    // -----------------------------------------------------------------------
    console.log('\n--- A. LISTE, GENEL GOREV, SABLON ---');
    let r = await own.client.from('operational_people').insert({ tenant_id: A, kind: 'CLEANER', full_name: 'Ayse Temiz', phone: '05550000000', user_id: stf.id }).select().single();
    check(!r.error, 'A1. Temizlikci listeye eklenir (hesabiyla bagli)', hataMetni(r.error));
    const ayse = r.data || {};
    r = await own.client.from('operational_people').insert({ tenant_id: A, kind: 'TECHNICIAN', full_name: 'Usta Ali', specialty: 'Tesisat', phone: '05551111111' }).select().single();
    check(!r.error, 'A2. Usta listeye eklenir (hesapsiz)', hataMetni(r.error));
    const genelGorev = await own.client.from('operational_tasks').insert({ tenant_id: A, property_id: null, task_type: 'GENERAL',
      title: 'Depo sayimi', assigned_to: stf.id }).select().single();
    check(!genelGorev.error && genelGorev.data.property_id === null, 'A3. Mulke bagli olmayan genel gorev kaydedilir', hataMetni(genelGorev.error));
    r = await own.client.from('property_checklist_templates').insert({ tenant_id: A, property_id: null, task_type: 'CLEANING', template_name: 'Genel',
      items: { sections: [{ title: 'Mutfak', items: [{ text: 'Ocak temiz', important: true }, { text: 'Bulasik', subChecks: [] }] }],
               supplies: [{ area: 'Mutfak', item: 'Cay' }] } });
    check(!r.error, 'A4. Genel kontrol listesi sablonu (yeni bicim) kaydedilir', hataMetni(r.error));
    r = await own.client.from('property_checklist_templates').insert({ tenant_id: A, property_id: p.id, task_type: 'CLEANING', template_name: 'Seyir',
      items: { sections: [{ title: 'Yatak odalari', items: [{ text: 'Nevresimler sokuldu', subChecks: ['ODA 1', 'ODA 2'] }] }],
               supplies: [{ area: 'Bahce', item: 'Jenerator mazot' }] } });
    check(!r.error, 'A5. Eve ozel sablon kaydedilir', hataMetni(r.error));
    r = await own.client.from('property_checklist_templates').insert({ tenant_id: A, task_type: 'CLEANING', template_name: 'Bozuk',
      items: { sections: [{ title: '', items: [] }] } });
    check(!!r.error, 'A6. Bicimi bozuk sablon reddedilir', 'KAYDEDILDI');

    // -----------------------------------------------------------------------
    console.log('\n--- B. ATAMA VE SAHA GORUNUMU ---');
    r = await stf.client.rpc('assign_cleaning_task', { p_cleaning_task_id: ct.id, p_person_id: ayse.id, p_template_id: null });
    check(yetkiHatasi(r.error), 'B1. staff temizlik atayamaz', hataMetni(r.error) || 'ATANDI');
    r = await atk.client.rpc('assign_cleaning_task', { p_cleaning_task_id: ct.id, p_person_id: ayse.id, p_template_id: null });
    check(yetkiHatasi(r.error), 'B2. yabanci kiraci atayamaz', hataMetni(r.error) || 'ATANDI');
    r = await own.client.rpc('assign_cleaning_task', { p_cleaning_task_id: ct.id, p_person_id: ayse.id, p_template_id: null });
    check(!r.error && r.data && r.data.sections === 2, 'B3. Yonetici atar; genel + eve ozel bolumler birlesir (2 bolum)', hataMetni(r.error) || JSON.stringify(r.data));
    const execId = r.data && r.data.execution_id;

    r = await stf.client.rpc('get_my_field_work', { p_tenant_id: A, p_from: '2026-08-01', p_to: '2026-08-31' });
    const is = r.data && r.data.cleanings && r.data.cleanings[0];
    check(!r.error && is && is.access && is.access.door_code === '2468' && is.property.name === 'Villa Seyir',
      'B4. staff kendi temizligini kapi koduyla gorur', hataMetni(r.error) || JSON.stringify(r.data));
    const json = JSON.stringify(r.data || {});
    check(!/"amount"|"is_paid"|"cleaner_name"|"guest_name"|"gross_amount"/.test(json), 'B5. Saha gorunumunde tutar, odeme, misafir adi YOK', json.slice(0, 300));
    check(!r.error && (r.data.tasks || []).some(t => t.title === 'Depo sayimi' && t.property === null), 'B6. staff mulksuz genel gorevini gorur', json.slice(0, 300));
    r = await stf2.client.rpc('get_my_field_work', { p_tenant_id: A, p_from: '2026-08-01', p_to: '2026-08-31' });
    check(!r.error && r.data.cleanings.length === 0 && r.data.tasks.length === 0, 'B7. Baska personel bu isi gormez', JSON.stringify(r.data));

    // -----------------------------------------------------------------------
    console.log('\n--- C. Z / M ---');
    const snap = async () => {
      const x = must(await own.client.rpc('get_executive_dashboard_snapshot', { p_tenant_id: A, p_target_month: MONTH, p_property_id: null }), 'anlik goruntu');
      return Number(bul(x, 'cleaning_cost') || 0);
    };
    const costBefore = await snap();
    r = await own.client.rpc('save_cleaning_progress', { p_execution_id: execId,
      p_checklist_result: { 's0.i0': { z: true } }, p_supplies_result: {}, p_note: 'yonetici Z denemesi' });
    check(yetkiHatasi(r.error), 'C0a. Yonetici, baskasina atanmis temizlikte Z ilerlemesi yazamaz', hataMetni(r.error) || 'YAZDI');
    r = await own.client.rpc('sign_cleaning_done', { p_execution_id: execId });
    check(yetkiHatasi(r.error), 'C0b. Yonetici, baskasina atanmis temizlikte Z imzasi atamaz', hataMetni(r.error) || 'IMZALADI');
    r = await stf.client.rpc('save_cleaning_progress', { p_execution_id: execId,
      p_checklist_result: { 's0.i0': { z: true, m: true }, 's1.i0.0': { z: true } }, p_supplies_result: { '0': 'LOW', '1': 'OUT' }, p_note: 'Cay azaldi' });
    const ex1 = must(await admin.from('cleaning_task_executions').select('*').eq('id', execId).single(), 'icra');
    check(!r.error && ex1.checklist_result['s0.i0'].z === true && ex1.checklist_result['s0.i0'].m === null && ex1.supplies_result['1'] === 'OUT',
      'C1. Temizlikci Z isaretler, malzeme uc durumlu; M isaretini KENDISI koyamaz', hataMetni(r.error) || JSON.stringify(ex1.checklist_result));
    r = await stf2.client.rpc('save_cleaning_progress', { p_execution_id: execId, p_checklist_result: {}, p_supplies_result: {}, p_note: 'x' });
    check(yetkiHatasi(r.error), 'C2. Baska personel bu temizlige yazamaz', hataMetni(r.error) || 'YAZDI');
    r = await stf.client.from('cleaning_task_executions').update({ status: 'INSPECTED' }).eq('id', execId).select('id');
    check((await admin.from('cleaning_task_executions').select('status').eq('id', execId).single()).data.status === 'IN_PROGRESS',
      'C3. staff icra tablosuna dogrudan yazamaz', `${(r.data || []).length} satir`);

    r = await stf.client.rpc('sign_cleaning_done', { p_execution_id: execId });
    const t1 = must(await admin.from('cleaning_tasks').select('status').eq('id', ct.id).single(), 'temizlik');
    check(!r.error && t1.status === 'PLANNED', 'C4. Z imzasi temizligi DONE yapmaz (gider henuz yok)', hataMetni(r.error) || t1.status);
    check(await snap() === costBefore, 'C5. Z sonrasi sunucu temizlik maliyeti degismedi', `${costBefore} -> ${await snap()}`);
    r = await own.client.rpc('close_monthly_period_atomic', { p_tenant_id: A, p_year: 2026, p_month: 8, p_snapshot: {} });
    check(!!r.error && /CLEANING_AWAITING_INSPECTION/.test(hataMetni(r.error)), 'C6. Denetim bekleyen temizlik varken ay KAPANMAZ', hataMetni(r.error) || 'KAPANDI');
    r = await stf.client.rpc('inspect_cleaning', { p_execution_id: execId, p_approve: true, p_m_marks: {}, p_inspector_note: null });
    check(yetkiHatasi(r.error), 'C7. staff denetleyemez', hataMetni(r.error) || 'DENETLEDI');

    r = await own.client.rpc('inspect_cleaning', { p_execution_id: execId, p_approve: false, p_m_marks: { 's0.i0': false }, p_inspector_note: 'Ocak yeniden' });
    const ex2 = must(await admin.from('cleaning_task_executions').select('*').eq('id', execId).single(), 'icra');
    check(!r.error && ex2.status === 'REOPENED' && ex2.cleaner_signed_at === null && ex2.checklist_result['s0.i0'].m === false
      && (await admin.from('cleaning_tasks').select('status').eq('id', ct.id).single()).data.status === 'PLANNED',
      'C8. M reddi: Z imzasi silinir, madde yeniden acilir, gider yok', hataMetni(r.error) || JSON.stringify(ex2));

    must(await stf.client.rpc('sign_cleaning_done', { p_execution_id: execId }), 'yeniden Z');
    const zAt = (await admin.from('cleaning_task_executions').select('cleaner_signed_at').eq('id', execId).single()).data.cleaner_signed_at;
    r = await own.client.rpc('inspect_cleaning', { p_execution_id: execId, p_approve: true, p_m_marks: { 's0.i0': true }, p_inspector_note: null });
    const t2 = must(await admin.from('cleaning_tasks').select('status, completed_at').eq('id', ct.id).single(), 'temizlik');
    check(!r.error && t2.status === 'DONE' && new Date(t2.completed_at).getTime() === new Date(zAt).getTime(),
      'C9. M onayi temizligi DONE yapar; tamamlanma ani Z imzasinin ani', hataMetni(r.error) || JSON.stringify(t2));
    const costAfter = await snap();
    check(costAfter === costBefore + 1500, 'C10. Gider temizlik gununun ayina (2026-08) yazildi: sunucu +1.500', `${costBefore} -> ${costAfter}`);
    r = await stf.client.rpc('save_cleaning_progress', { p_execution_id: execId, p_checklist_result: {}, p_supplies_result: {}, p_note: 'sonradan' });
    check(!!r.error && /EXECUTION_LOCKED/.test(hataMetni(r.error)), 'C11. Denetlenmis temizlik temizlikci tarafindan degistirilemez', hataMetni(r.error) || 'DEGISTI');
    r = await own.client.rpc('close_monthly_period_atomic', { p_tenant_id: A, p_year: 2026, p_month: 8, p_snapshot: {} });
    check(!r.error, 'C12. Denetim bittikten sonra ay kapanir', hataMetni(r.error));

    // -----------------------------------------------------------------------
    console.log('\n--- D. GOREV DURUMU VE ROLLER ---');
    const gorev2 = must(await own.client.from('operational_tasks').insert({ tenant_id: A, property_id: p.id, task_type: 'GENERAL',
      title: 'Baskasinin', assigned_to: stf2.id }).select().single(), 'gorev 2');
    r = await stf.client.rpc('set_my_task_status', { p_task_id: genelGorev.data.id, p_status: 'DONE', p_note: 'sayildi' });
    const g1 = must(await admin.from('operational_tasks').select('status, completed_by').eq('id', genelGorev.data.id).single(), 'gorev');
    check(!r.error && g1.status === 'DONE' && g1.completed_by === stf.id, 'D1. staff kendi gorevini tamamlar', hataMetni(r.error) || JSON.stringify(g1));
    r = await stf.client.rpc('set_my_task_status', { p_task_id: gorev2.id, p_status: 'DONE' });
    check(yetkiHatasi(r.error), 'D2. staff baskasinin gorevini degistiremez', hataMetni(r.error) || 'DEGISTI');
    for (const table of ['operational_people', 'cleaning_task_executions', 'task_templates']) {
      const g = await sls.client.from(table).select('id').eq('tenant_id', A);
      check((g.data || []).length === 0, `D3. sales ${table} okumaz`, `${(g.data || []).length} satir`);
    }
    const kendi = await stf.client.from('operational_people').select('id, full_name').eq('tenant_id', A);
    check((kendi.data || []).length === 1 && kendi.data[0].id === ayse.id, 'D4. staff kisi listesinde yalniz kendini gorur', JSON.stringify(kendi.data));
    r = await own.client.from('task_templates').insert({ tenant_id: A, title: 'Havuz kontrolu', task_type: 'INSPECTION', priority: 'HIGH',
      default_checklist: { sections: [{ title: 'Havuz', items: [{ text: 'pH olc' }] }] } });
    check(!r.error, 'D5. Gorev sablonu kaydedilir', hataMetni(r.error));
    r = await stf.client.from('task_templates').insert({ tenant_id: A, title: 'x' });
    check(!!r.error, 'D6. staff gorev sablonu yazamaz', 'YAZDI');

    // Sifirlama (CLAUDE.md 3.7): kapali ay ve icra varken calisir; icra
    // cleaning_tasks ile gider, kisi listesi ve gorev sablonu (ekip/ayar) kalir.
    r = await own.client.rpc('reset_tenant_data', { p_tenant_id: A, p_confirm: 'VERILERI SIFIRLA' });
    const icraKalan = must(await admin.from('cleaning_task_executions').select('id').eq('tenant_id', A), 'icra');
    const kisiKalan = must(await admin.from('operational_people').select('id').eq('tenant_id', A), 'kisi');
    const sablonKalan = must(await admin.from('task_templates').select('id').eq('tenant_id', A), 'sablon');
    check(!r.error && icraKalan.length === 0 && kisiKalan.length === 2 && sablonKalan.length === 1,
      'D7. Sifirlama icrayi siler; kisi listesi ve gorev sablonu korunur', hataMetni(r.error) || `icra=${icraKalan.length} kisi=${kisiKalan.length} sablon=${sablonKalan.length}`);
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
    if (hata) failed++; else ok('Z. Test verileri eksiksiz temizlendi (kapali ay, icra ve kisi listesi dahil)');
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
