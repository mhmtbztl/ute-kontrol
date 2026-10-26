/**
 * LEXBNB PHASE 105 — KVKK MISAFIR SILME + G9 TAKIPLERI (CANLI, YALNIZ TEST PROJESI)
 *
 * Kullanici karari 26.10.2026 (L-271): KVKK silme her seyi temizlemeli.
 *
 *   1. Misafir satiri, izin olaylari silinir; bagli ve ayni telefonlu
 *      rezervasyon/talep anonimlesir (ad, telefon, e-posta, not), tutar ve
 *      tarih ayni kalir; mesajlar, bildirimler silinir; temizlik metnindeki ad
 *      maskelenir; KAPALI DONEMDEKI rezervasyon da anonimlesir.
 *   2. Baska misafirin kaydina dokunulmaz; gunluge kisisel veri yazilmaz.
 *   3. Yetki: satis, yabanci isletme, anon silemez; onay metni zorunlu.
 *   4. G9 takipleri: teklifsiz talep quote_amount NULL; pax degisince
 *      guest_count esitlenir; hizli talep notu "kişi"; -%100 kural reddedilir;
 *      yonetim huni snapshot'ini silebilir.
 *
 * phase105 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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
  const email = `p105_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P105!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

function oncekiAy() {
  const d = new Date();
  const y = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  const m = d.getUTCMonth() === 0 ? 12 : d.getUTCMonth();
  return { y, m, key: `${y}-${String(m).padStart(2, '0')}` };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 105 — KVKK MISAFIR SILME + G9 TAKIPLERI (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), sls = await makeUser('sls', s), yab = await makeUser('yab', s);
    clients.push(own, sls, yab);
    const T = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P105 ' + s, p_full_name: 'P105' }), 'isletme').tenant_id;
    const Y = must(await yab.client.rpc('create_tenant_and_owner', { p_company_name: 'P105Y ' + s, p_full_name: 'P105Y' }), 'yabanci').tenant_id;
    createdTenants.push(T, Y);
    must(await admin.from('tenant_members').insert({ tenant_id: T, user_id: sls.id, role: 'sales' }), 'satis uyesi');
    const P = must(await admin.from('properties').insert({ tenant_id: T, name: 'P105A', slug: 'p105a' + s, base_price: 10000, activated_on: '2024-01-01' }).select().single(), 'mulk');

    const G = must(await admin.from('guests').insert({ tenant_id: T, first_name: 'Ayşe', last_name: 'Kvkk', phone: '+905551230105', email: 'ayse.kvkk@example.com', internal_notes: 'GIZLI NOT' }).select().single(), 'misafir');
    const D = must(await admin.from('guests').insert({ tenant_id: T, first_name: 'Diğer', last_name: 'Misafir', phone: '+905559990105' }).select().single(), 'diger misafir');
    must(await admin.from('guest_consent_events').insert({ tenant_id: T, guest_id: G.id, marketing_opt_in: true, source: 'APPLICATION' }), 'izin olayi');

    const ay = oncekiAy();
    const rez = (ek) => ({ tenant_id: T, property_id: P.id, channel: 'Direct', pax: 2, gross_amount: 20000, ...ek });
    const b1 = must(await admin.from('bookings').insert(rez({ booking_code: 'P105-1-' + s, guest_name: 'Ayşe Kvkk', guest_phone: '+905551230105', primary_guest_id: G.id, notes: 'Ayşe hanım geç gelecek', check_in: '2027-05-10', check_out: '2027-05-12' })).select().single(), 'rez1');
    const b2 = must(await admin.from('bookings').insert(rez({ booking_code: 'P105-2-' + s, guest_name: 'A. Kvkk', guest_phone: '0555 123 01 05', check_in: '2027-06-10', check_out: '2027-06-12' })).select().single(), 'rez2 (yalniz telefon)');
    const b3 = must(await admin.from('bookings').insert(rez({ booking_code: 'P105-3-' + s, guest_name: 'Ayşe Kvkk', guest_phone: '+905551230105', primary_guest_id: G.id, check_in: `${ay.key}-05`, check_out: `${ay.key}-07` })).select().single(), 'rez3 (kapanacak ay)');
    const bD = must(await admin.from('bookings').insert(rez({ booking_code: 'P105-D-' + s, guest_name: 'Diğer Misafir', guest_phone: '+905559990105', primary_guest_id: D.id, check_in: '2027-07-10', check_out: '2027-07-12' })).select().single(), 'rezD');
    must(await admin.from('cleaning_tasks').insert({ tenant_id: T, property_id: P.id, booking_id: b1.id, task_date: '2027-05-12', amount: 0, cleaner_name: 'Ekip', status: 'PLANNED', description: 'Ayşe Kvkk Çıkış Temizliği (P105A)' }), 'temizlik');
    const L = must(await admin.from('leads').insert({ tenant_id: T, guest_name: 'Ayşe Kvkk', guest_phone: '05551230105', guest_email: 'ayse.kvkk@example.com', channel: 'WhatsApp', status: 'NEW', notes: 'Ayşe: 4 kişi' }).select().single(), 'talep');
    must(await admin.from('scheduled_messages').insert({ tenant_id: T, booking_id: b1.id, guest_id: G.id, channel: 'WHATSAPP',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(), rendered_body: 'Merhaba Ayşe', recipient_snapshot: '+905551230105', idempotency_key: 'p105-' + s }), 'mesaj');
    must(await admin.from('user_notifications').insert({ tenant_id: T, user_id: own.id, event_key: 'collection_due:' + b1.id, domain: 'FINANCE', severity: 'WARNING',
      title: 'Tahsilat bekliyor: Ayşe Kvkk', message: 'x', deep_link: 'booking:' + b1.id, status: 'UNREAD' }), 'bildirim');
    must(await admin.from('user_notifications').insert({ tenant_id: T, user_id: own.id, event_key: 'collection_due:' + bD.id, domain: 'FINANCE', severity: 'WARNING',
      title: 'Tahsilat bekliyor: Diğer Misafir', message: 'x', deep_link: 'booking:' + bD.id, status: 'UNREAD' }), 'diger bildirim');
    // Gecen ay kapanir: kapali donemdeki rezervasyon da anonimlesmeli.
    must(await own.client.rpc('close_monthly_period_atomic', { p_tenant_id: T, p_year: ay.y, p_month: ay.m, p_snapshot: {} }), 'ay kapanisi');

    const sil = (u, tenant = T, onay = 'MISAFIRI SIL') => u.client.rpc('erase_guest_personal_data', { p_tenant_id: tenant, p_guest_id: G.id, p_confirm: onay });

    // 3. Yetki once
    let r = await sil(sls);
    check(!!r.error && /42501|FORBIDDEN/.test(hataMetni(r.error)), '3a. Satis rolu misafir silemez (42501)', hataMetni(r.error) || JSON.stringify(r.data));
    r = await sil(yab, T);
    check(!!r.error && /42501|FORBIDDEN/.test(hataMetni(r.error)), '3b. Yabanci isletme silemez', hataMetni(r.error) || JSON.stringify(r.data));
    r = await newClient().rpc('erase_guest_personal_data', { p_tenant_id: T, p_guest_id: G.id, p_confirm: 'MISAFIRI SIL' });
    check(!!r.error, '3c. anon cagiramaz', JSON.stringify(r.data));
    r = await sil(own, T, 'sil');
    check(!!r.error && /CONFIRMATION/.test(hataMetni(r.error)), '3d. Onay metni olmadan silmez', hataMetni(r.error));

    // 1. Silme
    r = await sil(own);
    check(!r.error && r.data && r.data.success === true && r.data.bookings === 3 && r.data.leads === 1,
      '1a. Sahip siler; 3 rezervasyon (bagli, ayni telefon, kapali ay) ve 1 talep islenir', hataMetni(r.error) || JSON.stringify(r.data));
    const g = must(await admin.from('guests').select('id').eq('id', G.id), 'misafir oku');
    check(g.length === 0, '1b. Misafir satiri silindi');
    const ce = must(await admin.from('guest_consent_events').select('id').eq('guest_id', G.id), 'izin oku');
    check(ce.length === 0, '1c. Izin olaylari silindi');
    const bs = must(await admin.from('bookings').select('id, guest_name, guest_phone, notes, primary_guest_id, gross_amount, check_in').in('id', [b1.id, b2.id, b3.id]), 'rez oku');
    check(bs.length === 3 && bs.every(b => b.guest_name === 'Silinmiş misafir' && b.guest_phone === null && b.notes === null && b.primary_guest_id === null),
      '1d. Rezervasyonlar anonimlesti (kapali aydaki dahil)', JSON.stringify(bs));
    check(bs.every(b => Number(b.gross_amount) === 20000), '1e. Tutar ve tarih degismedi (raporlar ayni)', JSON.stringify(bs.map(b => b.gross_amount)));
    const l = must(await admin.from('leads').select('guest_name, guest_phone, guest_email, notes').eq('id', L.id).single(), 'talep oku');
    check(l.guest_name === 'Silinmiş misafir' && !l.guest_phone && !l.guest_email && !l.notes, '1f. Talep anonimlesti', JSON.stringify(l));
    const m = must(await admin.from('scheduled_messages').select('id').eq('tenant_id', T), 'mesaj oku');
    check(m.length === 0, '1g. Misafire mesajlar silindi');
    const n = must(await admin.from('user_notifications').select('title').eq('tenant_id', T), 'bildirim oku');
    check(n.length === 1 && /Diğer/.test(n[0].title), '1h. Misafirin bildirimleri silindi, digerininki kaldi', JSON.stringify(n));
    const t = must(await admin.from('cleaning_tasks').select('description').eq('booking_id', b1.id).single(), 'temizlik oku');
    check(!/Ayşe|Kvkk/.test(t.description || '') && /Silinmiş misafir/.test(t.description || ''), '1i. Temizlik metnindeki ad maskelendi', t.description);
    const bd = must(await admin.from('bookings').select('guest_name, guest_phone').eq('id', bD.id).single(), 'diger rez');
    check(bd.guest_name === 'Diğer Misafir' && bd.guest_phone === '+905559990105', '2a. Baska misafirin rezervasyonuna dokunulmadi', JSON.stringify(bd));
    const log = must(await own.client.from('guest_erasure_log').select('*').eq('tenant_id', T), 'gunluk');
    check(log.length === 1 && !JSON.stringify(log).includes('Ayşe') && !JSON.stringify(log).includes('5551230105'), '2b. Silme gunluge kisisel veri olmadan yazildi', JSON.stringify(log));
    r = await own.client.rpc('get_executive_dashboard_snapshot', { p_tenant_id: T, p_target_month: ay.key, p_property_id: null });
    check(!r.error && Number(r.data && r.data.room_revenue) > 0, '2c. Kapali ayin ozeti hala okunur, ciro yerinde', hataMetni(r.error) || JSON.stringify(r.data && r.data.room_revenue));
    r = await admin.rpc('fn_tenant_reset_in_progress');
    check(!r.error && r.data === false, '2d. Sifirlama bayragi islemden sonra kapali', hataMetni(r.error) || JSON.stringify(r.data));

    // 4. G9 takipleri
    const L2 = must(await admin.from('leads').insert({ tenant_id: T, guest_phone: '05550000105', channel: 'Phone', status: 'NEW' }).select('quote_amount').single(), 'teklifsiz talep');
    check(L2.quote_amount === null, '4a. Teklifsiz talep quote_amount NULL (0 degil)', JSON.stringify(L2));
    const b4 = must(await admin.from('bookings').insert(rez({ booking_code: 'P105-4-' + s, guest_name: 'TEST Pax', pax: 7, check_in: '2027-08-10', check_out: '2027-08-12' })).select('guest_count').single(), 'pax rez');
    check(b4.guest_count === 7, '4b. Yeni rezervasyonda guest_count = pax', JSON.stringify(b4));
    const src = must(await own.client.from('lead_source_catalog').select('id').eq('tenant_id', T).limit(1), 'kaynak');
    r = await own.client.rpc('quick_capture_lead', { p_tenant_id: T, p_phone: '05550000205', p_source_id: src[0].id, p_channel: 'WhatsApp', p_pax: 4 });
    const qn = !r.error ? must(await admin.from('leads').select('notes, quote_amount').eq('id', r.data.lead_id).single(), 'hizli talep') : null;
    check(qn && /4 kişi/.test(qn.notes) && qn.quote_amount === null, '4c. Hizli talep notu "kişi", teklif NULL', hataMetni(r.error) || JSON.stringify(qn));
    r = await own.client.from('property_pricing_rule_settings').insert({ tenant_id: T, property_id: P.id, rule_key: 'lastMinute', pct: -100 });
    check(!!r.error, '4d. -%100 fiyat kurali reddedilir', 'KABUL EDILDI');
    const ilan = must(await admin.from('property_channel_listings').insert({ tenant_id: T, property_id: P.id, channel_code: 'AIRBNB', display_name: 'P105 ilan' }).select().single(), 'ilan');
    must(await own.client.rpc('record_manual_channel_snapshot', { p_tenant_id: T, p_channel_listing_id: ilan.id, p_period_start: '2026-09-01', p_period_end_exclusive: '2026-09-10', p_idempotency_key: 'p105s-' + s, p_impressions: 100, p_listing_views: 10, p_booking_attempts: null, p_platform_reported_bookings: null, p_wishlist_saves: null, p_notes: null }), 'snapshot');
    const snap = must(await admin.from('channel_performance_snapshots').select('id').eq('channel_listing_id', ilan.id).single(), 'snapshot oku');
    r = await sls.client.from('channel_performance_snapshots').delete().eq('id', snap.id).select();
    check(!r.error && (r.data || []).length === 0, '4e. Satis rolu snapshot silemez', hataMetni(r.error) || JSON.stringify(r.data));
    r = await own.client.from('channel_performance_snapshots').delete().eq('id', snap.id).select();
    check(!r.error && (r.data || []).length === 1, '4f. Yonetim snapshot silebilir', hataMetni(r.error) || JSON.stringify(r.data));
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
    if (hata) failed++; else ok('5. Test verileri eksiksiz temizlendi');
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
