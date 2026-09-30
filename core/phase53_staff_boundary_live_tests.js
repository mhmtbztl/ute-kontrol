/**
 * LEXBNB PHASE 53 — PERSONEL VERI SINIRI VE SATIS ROLU (CANLI, YALNIZ TEST PROJESI)
 *
 * L-107: staff uye oldugu isletmenin butun defterlerini okuyabiliyor, temizlik
 * gorevinin tutarini ve "odendi" durumunu degistirebiliyordu.
 *
 * Kullanici karari (30.09.2026): staff = saha personeli, yalniz kendisine
 * atanan isi gorur; yeni `sales` rolu rezervasyon/talep/misafir yazar ama
 * finansi gormez; viewer oldugu gibi okur.
 *
 *   A. staff: rezervasyon, gider, temizlik, misafir, talep, mulk, kapi kodu,
 *      hedef, isletme geneli bildirim OKUYAMAZ; tutar/odendi DEGISTIREMEZ;
 *      rezervasyon ve finans ozeti RPC'leri 42501; yalniz kendi isini gorur.
 *   B. sales: rezervasyon/talep/misafir/mulk okur ve yazar; gider, temizlik
 *      maliyeti, hedef, finans ozeti GOREMEZ; rezervasyon SILEMEZ.
 *   C. viewer okur, yazamaz; owner hepsini yapar.
 *   D. Yabanci kiraci: teklif kabulu ve fiyat degisikligi govdede 42501
 *      (phase53 oncesi yalniz phase44 tablo tetikleyicisi koruyordu).
 *   E. anon hicbir seye erisemez.
 *
 * phase53 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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
const yetkiHatasi = e => !!e && (String(e.code) === '42501' || /permission denied|UNAUTHORIZED|FORBIDDEN|row-level security/i.test(String(e.message)));
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

async function makeUser(label, stamp) {
  const email = `p53_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P53!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

/** Istemcinin gordugu satir sayisi; hata da "gormedi" sayilir ama metni tasinir. */
async function gorulen(client, table, filter) {
  let q = client.from(table).select('id');
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const r = await q;
  return { n: (r.data || []).length, err: r.error };
}

const tekSatir = async (table, id, cols) =>
  must(await admin.from(table).select(cols).eq('id', id).single(), `${table} okuma`);

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 53 — PERSONEL VERI SINIRI VE SATIS ROLU (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), vw = await makeUser('vw', s), sls = await makeUser('sls', s),
      stf = await makeUser('stf', s), stf2 = await makeUser('stf2', s), atk = await makeUser('atk', s);
    clients.push(own, vw, sls, stf, stf2, atk);

    const A = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P53 A ' + s, p_full_name: 'P53' }), 'isletme A').tenant_id;
    createdTenants.push(A);
    const B = must(await atk.client.rpc('create_tenant_and_owner', { p_company_name: 'P53 B ' + s, p_full_name: 'P53' }), 'isletme B').tenant_id;
    createdTenants.push(B);

    must(await admin.from('tenant_members').insert([
      { tenant_id: A, user_id: vw.id, role: 'viewer' },
      { tenant_id: A, user_id: stf.id, role: 'staff' },
      { tenant_id: A, user_id: stf2.id, role: 'staff' }
    ]), 'uyeler');
    // sales rolu phase53 ile gelir; oncesinde CHECK reddeder. Kurulum durmaz,
    // B bolumu kirmizi olur (eski semaya karsi kirilma beklenir).
    const salesEkle = await admin.from('tenant_members').insert({ tenant_id: A, user_id: sls.id, role: 'sales' });
    const salesVar = !salesEkle.error;
    check(salesVar, '0. sales rolu kiraci uyeligi olarak kabul edilir', hataMetni(salesEkle.error));

    const p = must(await admin.from('properties').insert({ tenant_id: A, name: 'Villa P53', slug: 'p53' + s, base_price: 10000, clean_cost: 1500 }).select().single(), 'mulk');
    const bk = must(await admin.from('bookings').insert({ tenant_id: A, property_id: p.id, booking_code: 'P53-' + s, guest_name: 'Misafir P53',
      check_in: '2031-05-10', check_out: '2031-05-13', gross_amount: 30000 }).select().single(), 'rezervasyon');
    const ex = must(await admin.from('expenses').insert({ tenant_id: A, property_id: p.id, category: 'Elektrik', amount: 900,
      expense_date: '2031-05-01', expense_type: 'OPEX' }).select().single(), 'gider');
    const ct = must(await admin.from('cleaning_tasks').insert({ tenant_id: A, property_id: p.id, task_date: '2031-05-13',
      cleaner_name: 'Ayse', amount: 1200, is_paid: false }).select().single(), 'temizlik');
    const ld = must(await admin.from('leads').insert({ tenant_id: A, property_id: p.id, guest_name: 'Talep P53', channel: 'WhatsApp',
      status: 'NEW' }).select().single(), 'talep');
    const gs = must(await admin.from('guests').insert({ tenant_id: A, first_name: 'Misafir', last_name: 'P53' }).select().single(), 'misafir');
    must(await admin.from('property_guest_settings').insert({ tenant_id: A, property_id: p.id, door_code: '4321', wifi_password: 'gizli' }), 'mulk misafir ayari');
    const ot1 = must(await admin.from('operational_tasks').insert({ tenant_id: A, property_id: p.id, task_type: 'GENERAL', title: 'Staff gorevi',
      assigned_to: stf.id }).select().single(), 'gorev 1');
    const ot2 = must(await admin.from('operational_tasks').insert({ tenant_id: A, property_id: p.id, task_type: 'GENERAL', title: 'Baskasinin gorevi',
      assigned_to: stf2.id }).select().single(), 'gorev 2');
    const mt = must(await admin.from('maintenance_tickets').insert({ tenant_id: A, property_id: p.id, category: 'Tesisat', title: 'Musluk',
      assigned_to: stf.id }).select().single(), 'ariza');
    must(await admin.from('user_notifications').insert({ tenant_id: A, user_id: null, event_key: 'p53-' + s, domain: 'FINANCE',
      severity: 'INFO', title: 'Aylik kapanis', message: 'Net kar 120.000 TL' }), 'genel bildirim');
    const quote = must(await admin.from('booking_quotes').insert({ tenant_id: A, property_id: p.id, check_in: '2031-06-01', check_out: '2031-06-03',
      quoted_total: 20000, nightly_breakdown: [], expires_at: new Date(Date.now() + 86400000).toISOString() }).select().single(), 'teklif');

    // -----------------------------------------------------------------------
    console.log('\n--- A. STAFF: SAHA PERSONELI ---');
    for (const [table, filter, ad] of [
      ['bookings', { id: bk.id }, 'rezervasyon'],
      ['expenses', { id: ex.id }, 'gider'],
      ['cleaning_tasks', { id: ct.id }, 'temizlik hakedisi'],
      ['guests', { id: gs.id }, 'misafir'],
      ['leads', { id: ld.id }, 'talep'],
      ['properties', { id: p.id }, 'mulk (baz fiyat, temizlik maliyeti)'],
      ['property_guest_settings', { property_id: p.id }, 'kapi kodu / wifi'],
      ['operational_tasks', { id: ot2.id }, 'baskasinin gorevi'],
      ['user_notifications', { event_key: 'p53-' + s }, 'isletme geneli finans bildirimi']
    ]) {
      const g = await gorulen(stf.client, table, filter);
      check(g.n === 0, `A1. staff ${ad} OKUYAMAZ`, `${g.n} satir ${hataMetni(g.err)}`);
    }
    let g = await gorulen(stf.client, 'operational_tasks', { id: ot1.id });
    check(g.n === 1, 'A2. staff kendisine atanan gorevi gorur', `${g.n} satir ${hataMetni(g.err)}`);
    g = await gorulen(stf.client, 'maintenance_tickets', { id: mt.id });
    check(g.n === 1, 'A3. staff kendisine atanan arizayi gorur', `${g.n} satir ${hataMetni(g.err)}`);

    let r = await stf.client.from('cleaning_tasks').update({ amount: 99999 }).eq('id', ct.id).select('id');
    check(Number((await tekSatir('cleaning_tasks', ct.id, 'amount')).amount) === 1200,
      'A4. staff temizlik TUTARINI degistiremez', `${hataMetni(r.error)} ${(r.data || []).length} satir`);
    r = await stf.client.from('cleaning_tasks').update({ is_paid: true }).eq('id', ct.id).select('id');
    check((await tekSatir('cleaning_tasks', ct.id, 'is_paid')).is_paid === false,
      'A5. staff "odendi" isaretleyemez', `${hataMetni(r.error)} ${(r.data || []).length} satir`);
    r = await stf.client.from('operational_tasks').update({ title: 'degisti' }).eq('id', ot1.id).select('id');
    check((await tekSatir('operational_tasks', ot1.id, 'title')).title === 'Staff gorevi',
      'A6. staff gorevini dogrudan tabloya yazamaz (saha guncellemesi phase55 RPC)', `${hataMetni(r.error)} ${(r.data || []).length} satir`);
    r = await stf.client.from('monthly_targets').insert({ tenant_id: A, year: 2031, month: 5 }).select('id');
    const hedef = must(await admin.from('monthly_targets').select('id').eq('tenant_id', A), 'hedef okuma');
    check(!!r.error && hedef.length === 0, 'A7. staff aylik hedef yazamaz (phase8 "Staff manage targets")', hataMetni(r.error) || 'YAZILDI');
    r = await stf.client.rpc('create_booking_atomic', {
      p_tenant_id: A, p_property_id: p.id, p_booking_code: 'P53S-' + s, p_guest_name: 'X', p_guest_phone: null, p_channel: 'Direct',
      p_check_in: '2031-07-01', p_check_out: '2031-07-03', p_pax: 2, p_gross_amount: 10000, p_ota_commission: 0, p_cleaning_fee: 0,
      p_discount: 0, p_net_room_revenue: 10000, p_status: 'CONFIRMED', p_notes: null });
    check(yetkiHatasi(r.error), 'A8. staff rezervasyon olusturamaz (RPC)', hataMetni(r.error) || 'IZIN VERILDI');
    r = await stf.client.rpc('get_executive_dashboard_snapshot', { p_tenant_id: A, p_target_month: '2031-05', p_property_id: null });
    check(yetkiHatasi(r.error), 'A9. staff finans ozetini alamaz', hataMetni(r.error) || 'IZIN VERILDI');
    r = await stf.client.rpc('compute_month_close_snapshot', { p_tenant_id: A, p_year: 2031, p_month: 5 });
    check(yetkiHatasi(r.error), 'A10. staff ay kapanis hesabini alamaz', hataMetni(r.error) || 'IZIN VERILDI');
    r = await stf.client.rpc('resolve_maintenance_ticket_atomic', { p_tenant_id: A, p_ticket_id: mt.id, p_actual_cost: 5000,
      p_category: 'Tesisat', p_description: 'x' });
    check(yetkiHatasi(r.error) && (await tekSatir('maintenance_tickets', mt.id, 'status')).status === 'OPEN',
      'A11. staff arizayi gider yazarak kapatamaz', hataMetni(r.error) || 'IZIN VERILDI');

    // -----------------------------------------------------------------------
    console.log('\n--- B. SALES: REZERVASYON ALAN, FINANS GORMEYEN ---');
    for (const [table, id, ad] of [['bookings', bk.id, 'rezervasyon'], ['leads', ld.id, 'talep'], ['guests', gs.id, 'misafir'], ['properties', p.id, 'mulk']]) {
      g = await gorulen(sls.client, table, { id });
      check(salesVar && g.n === 1, `B1. sales ${ad} okur`, `${g.n} satir ${hataMetni(g.err)}`);
    }
    for (const [table, id, ad] of [['expenses', ex.id, 'gider'], ['cleaning_tasks', ct.id, 'temizlik maliyeti']]) {
      g = await gorulen(sls.client, table, { id });
      check(salesVar && g.n === 0, `B2. sales ${ad} OKUYAMAZ`, `${g.n} satir ${hataMetni(g.err)}`);
    }
    r = await sls.client.rpc('create_booking_atomic', {
      p_tenant_id: A, p_property_id: p.id, p_booking_code: 'P53B-' + s, p_guest_name: 'Satis Misafiri', p_guest_phone: null, p_channel: 'Direct',
      p_check_in: '2031-08-01', p_check_out: '2031-08-04', p_pax: 2, p_gross_amount: 15000, p_ota_commission: 0, p_cleaning_fee: 0,
      p_discount: 0, p_net_room_revenue: 15000, p_status: 'CONFIRMED', p_notes: null });
    check(salesVar && !r.error, 'B3. sales rezervasyon olusturur (RPC)', hataMetni(r.error) || JSON.stringify(r.data));
    r = await sls.client.from('leads').insert({ tenant_id: A, property_id: p.id, guest_name: 'Satis talebi', channel: 'Telefon', status: 'NEW' }).select('id');
    check(salesVar && !r.error && (r.data || []).length === 1, 'B4. sales talep yazar', hataMetni(r.error));
    r = await sls.client.rpc('delete_booking_atomic', { p_booking_id: bk.id, p_tenant_id: A });
    check(yetkiHatasi(r.error) && !!(await tekSatir('bookings', bk.id, 'id')), 'B5. sales rezervasyon SILEMEZ', hataMetni(r.error) || 'SILINDI');
    r = await sls.client.rpc('get_executive_dashboard_snapshot', { p_tenant_id: A, p_target_month: '2031-05', p_property_id: null });
    check(salesVar && yetkiHatasi(r.error), 'B6. sales finans ozetini alamaz', hataMetni(r.error) || 'IZIN VERILDI');
    r = await sls.client.from('monthly_targets').insert({ tenant_id: A, year: 2031, month: 6 }).select('id');
    check(!!r.error, 'B7. sales hedef yazamaz', 'YAZILDI');
    r = await sls.client.from('cleaning_tasks').update({ amount: 1 }).eq('id', ct.id).select('id');
    check(Number((await tekSatir('cleaning_tasks', ct.id, 'amount')).amount) === 1200, 'B8. sales temizlik tutarini degistiremez',
      `${hataMetni(r.error)} ${(r.data || []).length} satir`);

    // -----------------------------------------------------------------------
    console.log('\n--- C. VIEWER VE OWNER ---');
    for (const [table, id, ad] of [['bookings', bk.id, 'rezervasyon'], ['expenses', ex.id, 'gider'], ['cleaning_tasks', ct.id, 'temizlik']]) {
      g = await gorulen(vw.client, table, { id });
      check(g.n === 1, `C1. viewer ${ad} okumaya DEVAM EDER`, `${g.n} satir ${hataMetni(g.err)}`);
    }
    r = await vw.client.rpc('get_executive_dashboard_snapshot', { p_tenant_id: A, p_target_month: '2031-05', p_property_id: null });
    check(!r.error, 'C2. viewer finans ozetini alir', hataMetni(r.error));
    r = await vw.client.from('bookings').update({ guest_name: 'degisti' }).eq('id', bk.id).select('id');
    check((await tekSatir('bookings', bk.id, 'guest_name')).guest_name === 'Misafir P53', 'C3. viewer yazamaz', `${(r.data || []).length} satir`);
    g = await gorulen(vw.client, 'user_notifications', { event_key: 'p53-' + s });
    check(g.n === 1, 'C4. viewer isletme geneli bildirimi gorur', `${g.n} satir ${hataMetni(g.err)}`);
    r = await own.client.from('cleaning_tasks').update({ amount: 1300 }).eq('id', ct.id).select('id');
    check(!r.error && Number((await tekSatir('cleaning_tasks', ct.id, 'amount')).amount) === 1300, 'C5. owner temizlik tutarini degistirir', hataMetni(r.error));
    r = await own.client.rpc('get_executive_dashboard_snapshot', { p_tenant_id: A, p_target_month: '2031-05', p_property_id: null });
    check(!r.error, 'C6. owner finans ozetini alir', hataMetni(r.error));
    r = await own.client.rpc('create_tenant_invitation', { p_tenant_id: A, p_email: `p53_davet_${s}@lexbnb-e2e.test`, p_role: 'sales' });
    check(!r.error, 'C7. owner sales rolunde davet gonderir', hataMetni(r.error));

    // -----------------------------------------------------------------------
    console.log('\n--- D. YABANCI KIRACI: phase11 RPC GOVDE KAPISI ---');
    r = await atk.client.rpc('accept_booking_quote_atomic', { p_tenant_id: A, p_quote_id: quote.id });
    const teklifSonra = await tekSatir('booking_quotes', quote.id, 'status');
    check(!!r.error && /FORBIDDEN_ROLE/.test(hataMetni(r.error)) && teklifSonra.status === 'ACTIVE',
      'D1. yabanci kiraci teklifi kabul edemez — govdede yetki (FORBIDDEN_ROLE)', hataMetni(r.error) || 'KABUL EDILDI');
    r = await atk.client.rpc('save_manual_pricing_override_atomic', { p_tenant_id: A, p_property_id: p.id, p_start_date: '2031-09-01',
      p_end_date: '2031-09-02', p_rate_override: 1, p_reason: 'saldiri', p_bypass_guardrail: false, p_min_stay_override: null });
    check(!!r.error && /FORBIDDEN_ROLE/.test(hataMetni(r.error)), 'D2. yabanci kiraci fiyat yazamaz — govdede yetki (FORBIDDEN_ROLE)', hataMetni(r.error) || 'YAZILDI');
    g = await gorulen(atk.client, 'bookings', { id: bk.id });
    check(g.n === 0, 'D3. yabanci kiraci rezervasyonu goremez', `${g.n} satir`);

    // -----------------------------------------------------------------------
    console.log('\n--- E. ANON ---');
    const anon = newClient();
    r = await anon.from('bookings').select('id').limit(1);
    check(!!r.error || (r.data || []).length === 0, 'E1. anon rezervasyon okuyamaz', JSON.stringify(r.data));
    r = await anon.rpc('can_read_ledger', { p_tenant_id: A });
    check(yetkiHatasi(r.error) || /Could not find/i.test(hataMetni(r.error)), 'E2. anon rol yardimcisini calistiramaz', hataMetni(r.error) || JSON.stringify(r.data));
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
