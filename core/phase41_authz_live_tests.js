/**
 * LEXBNB PHASE 41 — ROL VE KIRACI YETKILERI (CANLI, YALNIZ TEST PROJESI)
 *
 * phase41 bes sinifi birden kapatir; bu suit her birini gercek Postgres'te,
 * gercek kullanicilarla olcer:
 *
 *   L-01  Uc SECURITY DEFINER RPC uyelik/rol kontrolu yapmiyordu.
 *   L-02  phase10 ve phase12 tablolarinda "uye olan her sey yazar" politikasi.
 *   L-03  delete_booking_atomic RLS'ten genis rol kabul ediyordu.
 *   L-04  phase24'ten sonra acilan tablolarda tenant_id degistirilebiliyordu.
 *   L-05  anon rolu tablolara RLS'e kadar girebiliyordu (tek katli koruma).
 *   L-06  Uyeligi olan kullanici ikinci bir isletme acabiliyordu.
 *   L-07  schema_migrations tablosunda RLS kapaliydi.
 *
 * Her acik icin hem "yasak olan artik olmuyor" hem de "izinli olan hala
 * oluyor" olculur. Yalniz yasagi olcen bir ag, her seyi kiran bir gocu de
 * yesil gosterir.
 *
 * Katalog bolumu (L-04, L-05, L-07) TEST_DATABASE_URL varsa pg ile dogrudan
 * sistem kataloguna bakar; yoksa bunu acikca "ATLANDI" diye yazar.
 *
 * phase41 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
 */

const { createClient } = require('@supabase/supabase-js');

const testEnv = require('./test_env.js');
const env = testEnv.loadTestEnv();

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
const yetkiHatasi = e => !!e && (String(e.code) === '42501' || /permission denied|UNAUTHORIZED|FORBIDDEN|SERVICE_ROLE_REQUIRED/i.test(String(e.message)));

// Kurulum adimlari hatayi yutmaz (CLAUDE.md 5.1 / 5.9).
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

async function makeUser(label, stamp) {
  const email = `p41_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P41!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, email, client };
}

async function makeTenant(u, name) {
  const t = must(await u.client.rpc('create_tenant_and_owner', { p_company_name: name, p_full_name: 'P41' }), 'isletme ' + name);
  createdTenants.push(t.tenant_id);
  return t.tenant_id;
}

async function row(table, id, cols) {
  return must(await admin.from(table).select(cols || '*').eq('id', id).maybeSingle(), `${table} okuma`);
}

async function katalogBolumu() {
  console.log('\n--- 8. KATALOG (L-04, L-05, L-07) ---');
  const dbUrl = String(env.TEST_DATABASE_URL || '');
  if (!dbUrl) {
    console.log('[ATLANDI] TEST_DATABASE_URL yok; katalog iddialari olculmedi. (CI\'da beklenen durum)');
    return;
  }
  // Baglanti dizesi SUPABASE_URL ile ayni projeyi gostermeli; uretim kara listesi
  // loadTestEnv() tarafinda zaten uygulandi.
  const ref = testEnv.projectRefOf(new URL(env.SUPABASE_URL).hostname);
  if (!ref || dbUrl.indexOf(ref) === -1 || testEnv.PRODUCTION_PROJECT_REFS.some(p => dbUrl.indexOf(p) !== -1)) {
    no('Katalog baglantisi test projesini gostermeli', 'TEST_DATABASE_URL farkli bir projeyi gosteriyor');
    return;
  }
  const { Client } = require('pg');
  const pg = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  try {
    const trg = await pg.query(`
      SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = c.oid AND t.tgname = 'trg_tenant_id_immutable')
      ORDER BY 1`);
    check(trg.rows.length === 0,
      '8a. tenant_id sutunu olan HER tabloda degismezlik tetikleyicisi var (L-04)',
      'eksik: ' + trg.rows.map(r => r.relname).join(', '));

    const anon = await pg.query(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p')
        AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
          OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE'))
      ORDER BY 1`);
    check(anon.rows.length === 0,
      '8b. public semasinda anon rolunun hicbir tablo/gorunum yetkisi yok (L-05)',
      'acik: ' + anon.rows.map(r => r.relname).join(', '));

    const sm = await pg.query(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.schema_migrations'::regclass`);
    check(sm.rows[0] && sm.rows[0].relrowsecurity === true,
      '8c. schema_migrations tablosunda RLS acik (L-07)', JSON.stringify(sm.rows));

    const led = await pg.query(`SELECT 1 FROM public.schema_migrations WHERE version = 41`);
    check(led.rows.length === 1, '8d. phase41 kendini schema_migrations defterine yazdi', 'satir yok');
  } finally {
    await pg.end();
  }
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 41 — ROL VE KIRACI YETKI TESTLERI (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), atk = await makeUser('atk', s), vw = await makeUser('vw', s),
      st = await makeUser('st', s), dual = await makeUser('dual', s);
    clients.push(own, atk, vw, st, dual);
    const A = await makeTenant(own, 'P41 A ' + s);
    const B = await makeTenant(atk, 'P41 B ' + s);
    must(await admin.from('tenant_members').insert([
      { tenant_id: A, user_id: vw.id, role: 'viewer' },
      { tenant_id: A, user_id: st.id, role: 'staff' },
      { tenant_id: A, user_id: dual.id, role: 'manager' },
      { tenant_id: B, user_id: dual.id, role: 'manager' }
    ]), 'uyeler');

    const p = must(await admin.from('properties').insert({ tenant_id: A, name: 'Villa P41', slug: 'p41' + s, base_price: 10000 }).select().single(), 'mulk');
    const bk = must(await admin.from('bookings').insert({ tenant_id: A, property_id: p.id, booking_code: 'P41-' + s, guest_name: 'Misafir A',
      check_in: '2027-10-10', check_out: '2027-10-14', gross_amount: 40000 }).select().single(), 'rezervasyon');
    const msg = must(await admin.from('scheduled_messages').insert({ tenant_id: A, booking_id: bk.id, channel: 'WHATSAPP',
      scheduled_at: new Date(Date.now() - 60000).toISOString(), rendered_body: 'GIZLI MESAJ A', idempotency_key: 'p41a-' + s }).select().single(), 'mesaj');
    const msg2 = must(await admin.from('scheduled_messages').insert({ tenant_id: A, booking_id: bk.id, channel: 'WHATSAPP',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(), rendered_body: 'MESAJ 2', idempotency_key: 'p41b-' + s }).select().single(), 'mesaj2');
    const log = must(await admin.from('message_delivery_logs').insert({ tenant_id: A, scheduled_message_id: msg2.id, channel: 'WHATSAPP',
      provider: 'x', status: 'SUCCESS' }).select().single(), 'teslim kaydi');
    const offer = must(await admin.from('extension_offers').insert({ tenant_id: A, booking_id: bk.id, property_id: p.id, target_date: '2027-10-14',
      base_price: 10000, offered_price: 8000, expires_at: new Date(Date.now() + 86400000).toISOString() }).select().single(), 'teklif');
    const notif = must(await admin.from('user_notifications').insert({ tenant_id: A, user_id: own.id, event_key: 'p41' + s, domain: 'FINANCE',
      severity: 'HIGH', title: 't', message: 'm' }).select().single(), 'bildirim');
    const alert = must(await admin.from('executive_alerts').insert({ tenant_id: A, alert_code: 'P41', severity: 'HIGH', domain: 'FINANCE',
      title: 't', reason: 'r', recommended_action: 'a', deep_link: '#' }).select().single(), 'uyari');

    // -----------------------------------------------------------------------
    console.log('--- 1. L-01: WORKER RPC\'LERI YALNIZ service_role ---');
    let r = await atk.client.rpc('claim_scheduled_messages_atomic', { p_tenant_id: A, p_worker_id: 'atk', p_batch_size: 10, p_stale_timeout_minutes: 5 });
    check(yetkiHatasi(r.error) && !(r.data || []).length,
      '1a. Yabanci kiraci A\'nin mesaj kuyrugunu ALAMAZ', r.error ? hataMetni(r.error) : `aldi: ${JSON.stringify((r.data || []).map(x => x.rendered_body))}`);
    r = await own.client.rpc('claim_scheduled_messages_atomic', { p_tenant_id: A, p_worker_id: 'own', p_batch_size: 10, p_stale_timeout_minutes: 5 });
    check(yetkiHatasi(r.error),
      '1b. Isletmenin kendi sahibi bile kuyrugu tarayicidan alamaz (worker islemi)', r.error ? hataMetni(r.error) : `${(r.data || []).length} satir aldi`);
    check((await row('scheduled_messages', msg.id, 'status')).status === 'SCHEDULED',
      '1c. Reddedilen cagrilardan sonra mesaj SCHEDULED kaldi', 'durum degisti');

    r = await atk.client.rpc('record_message_delivery_result_atomic', { p_tenant_id: A, p_message_id: msg.id, p_status: 'SUCCESS', p_recipient_snapshot: 'x', p_provider: 'atk' });
    check(yetkiHatasi(r.error), '1d. Yabanci kiraci teslim sonucu YAZAMAZ', r.error ? hataMetni(r.error) : JSON.stringify(r.data));
    check((await row('scheduled_messages', msg.id, 'status')).status === 'SCHEDULED',
      '1e. Mesaj durumu yabanci tarafindan degistirilmedi', 'durum degisti');

    r = await admin.rpc('claim_scheduled_messages_atomic', { p_tenant_id: A, p_worker_id: 'worker', p_batch_size: 10, p_stale_timeout_minutes: 5 });
    check(!r.error && (r.data || []).some(x => x.id === msg.id),
      '1f. service_role (worker) kuyrugu almaya DEVAM EDER', r.error ? hataMetni(r.error) : JSON.stringify(r.data));
    r = await admin.rpc('record_message_delivery_result_atomic', { p_tenant_id: A, p_message_id: msg.id, p_status: 'SUCCESS', p_recipient_snapshot: 'x', p_provider: 'worker' });
    check(!r.error && (await row('scheduled_messages', msg.id, 'status')).status === 'SENT',
      '1g. service_role (worker) teslim sonucunu yazmaya DEVAM EDER', r.error ? hataMetni(r.error) : JSON.stringify(r.data));

    console.log('\n--- 2. L-01: UZATMA TEKLIFI KABULU ---');
    r = await atk.client.rpc('accept_extension_offer_atomic', { p_tenant_id: A, p_offer_id: offer.id });
    let o = await row('extension_offers', offer.id, 'status');
    let b = await row('bookings', bk.id, 'check_out,gross_amount');
    check(yetkiHatasi(r.error) && o.status === 'OFFERED' && b.check_out === '2027-10-14',
      '2a. Yabanci kiraci baska isletmenin rezervasyonunu UZATAMAZ',
      `${hataMetni(r.error) || JSON.stringify(r.data)}; teklif=${o.status}; rez=${JSON.stringify(b)}`);
    r = await vw.client.rpc('accept_extension_offer_atomic', { p_tenant_id: A, p_offer_id: offer.id });
    o = await row('extension_offers', offer.id, 'status');
    check(yetkiHatasi(r.error) && o.status === 'OFFERED',
      '2b. viewer teklif kabul EDEMEZ (rezervasyon yazar)', `${hataMetni(r.error) || JSON.stringify(r.data)}; teklif=${o.status}`);
    r = await own.client.rpc('accept_extension_offer_atomic', { p_tenant_id: A, p_offer_id: offer.id });
    b = await row('bookings', bk.id, 'check_out,gross_amount');
    check(!r.error && r.data && r.data.success === true && b.check_out === '2027-10-15',
      '2c. Isletme sahibi teklifi kabul etmeye DEVAM EDER', `${hataMetni(r.error) || JSON.stringify(r.data)}; rez=${JSON.stringify(b)}`);

    // -----------------------------------------------------------------------
    console.log('\n--- 3. L-02: viewer YAZAMAZ, OKUR ---');
    r = await vw.client.from('scheduled_messages').update({ rendered_body: 'VIEWER DEGISTIRDI' }).eq('id', msg2.id).select();
    check((await row('scheduled_messages', msg2.id, 'rendered_body')).rendered_body === 'MESAJ 2',
      '3a. viewer misafire gidecek mesaj metnini DEGISTIREMEZ', `${hataMetni(r.error)} ${(r.data || []).length} satir`);
    r = await vw.client.from('message_delivery_logs').delete().eq('id', log.id).select();
    check(!!(await row('message_delivery_logs', log.id, 'id')),
      '3b. viewer teslim kaydini SILEMEZ', `${hataMetni(r.error)} ${(r.data || []).length} satir silindi`);
    r = await vw.client.from('executive_alerts').update({ status: 'RESOLVED' }).eq('id', alert.id).select();
    check((await row('executive_alerts', alert.id, 'status')).status === 'OPEN',
      '3c. viewer yonetici uyarisini tablo yolundan COZEMEZ', `${hataMetni(r.error)} ${(r.data || []).length} satir`);
    r = await vw.client.rpc('resolve_executive_alert_atomic', { p_alert_id: alert.id, p_resolved_by: null });
    check(yetkiHatasi(r.error) && (await row('executive_alerts', alert.id, 'status')).status === 'OPEN',
      '3d. viewer yonetici uyarisini RPC yolundan da COZEMEZ', hataMetni(r.error) || JSON.stringify(r.data));

    r = await vw.client.from('scheduled_messages').select('id').eq('id', msg2.id);
    check(!r.error && (r.data || []).length === 1, '3e. viewer mesajlari OKUMAYA devam eder', hataMetni(r.error) || '0 satir');
    r = await vw.client.from('executive_alerts').select('id').eq('id', alert.id);
    check(!r.error && (r.data || []).length === 1, '3f. viewer uyarilari OKUMAYA devam eder', hataMetni(r.error) || '0 satir');

    r = await st.client.from('scheduled_messages').update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() }).eq('id', msg2.id).select('id');
    check(!r.error && (r.data || []).length === 1, '3g. staff zamanlanmis mesaji iptal etmeye DEVAM EDER', hataMetni(r.error) || '0 satir');
    r = await st.client.from('executive_alerts').update({ status: 'ACKNOWLEDGED' }).eq('id', alert.id).select('id');
    check((await row('executive_alerts', alert.id, 'status')).status === 'OPEN',
      '3h. staff yonetici uyarisini DEGISTIREMEZ', `${hataMetni(r.error)} ${(r.data || []).length} satir`);
    r = await dual.client.from('executive_alerts').update({ status: 'ACKNOWLEDGED' }).eq('id', alert.id).select('id');
    check(!r.error && (r.data || []).length === 1, '3i. manager uyariyi isaretlemeye DEVAM EDER', hataMetni(r.error) || '0 satir');

    console.log('\n--- 4. L-02: BILDIRIM YALNIZ SAHIBININ ---');
    r = await vw.client.from('user_notifications').update({ status: 'RESOLVED' }).eq('id', notif.id).select();
    check((await row('user_notifications', notif.id, 'status')).status === 'UNREAD',
      '4a. viewer sahibin bildirimini DEGISTIREMEZ', `${hataMetni(r.error)} ${(r.data || []).length} satir`);
    r = await vw.client.from('user_notifications').select('id').eq('id', notif.id);
    check(!r.error && (r.data || []).length === 0, '4b. Uye baskasinin kisisel bildirimini GOREMEZ', hataMetni(r.error) || JSON.stringify(r.data));
    r = await dual.client.rpc('acknowledge_notification_atomic', { p_notification_id: notif.id });
    check(yetkiHatasi(r.error) && (await row('user_notifications', notif.id, 'status')).status === 'UNREAD',
      '4c. manager bile baskasinin kisisel bildirimini RPC ile ONAYLAYAMAZ', hataMetni(r.error) || JSON.stringify(r.data));
    r = await own.client.from('user_notifications').select('id').eq('id', notif.id);
    check(!r.error && (r.data || []).length === 1, '4d. Bildirim sahibi kendi bildirimini gorur', hataMetni(r.error) || '0 satir');
    r = await own.client.from('user_notifications').update({ status: 'READ', read_at: new Date().toISOString() }).eq('id', notif.id).select('id');
    check(!r.error && (r.data || []).length === 1, '4e. Bildirim sahibi "okundu" isaretlemeye DEVAM EDER', hataMetni(r.error) || '0 satir');

    // -----------------------------------------------------------------------
    console.log('\n--- 5. L-03: REZERVASYON SILME ROLU ---');
    const bk2 = must(await admin.from('bookings').insert({ tenant_id: A, property_id: p.id, booking_code: 'P41B-' + s, guest_name: 'X',
      check_in: '2027-11-10', check_out: '2027-11-12', gross_amount: 20000 }).select().single(), 'rezervasyon2');
    r = await st.client.rpc('delete_booking_atomic', { p_booking_id: bk2.id, p_tenant_id: A });
    check(yetkiHatasi(r.error) && !!(await row('bookings', bk2.id, 'id')),
      '5a. staff rezervasyon SILEMEZ (RLS ile ayni kural)', hataMetni(r.error) || JSON.stringify(r.data));
    r = await dual.client.rpc('delete_booking_atomic', { p_booking_id: bk2.id, p_tenant_id: A });
    check(!r.error && !(await row('bookings', bk2.id, 'id')),
      '5b. manager rezervasyon silmeye DEVAM EDER', hataMetni(r.error) || JSON.stringify(r.data));

    // -----------------------------------------------------------------------
    console.log('\n--- 6. L-04: tenant_id TASINAMAZ ---');
    must(await dual.client.from('tenant_settings').insert({ tenant_id: A, key: 'p41_key', value: { v: 1 } }), 'ayar');
    r = await dual.client.from('tenant_settings').update({ tenant_id: B }).eq('tenant_id', A).eq('key', 'p41_key').select();
    const ayar = must(await admin.from('tenant_settings').select('tenant_id').eq('key', 'p41_key').in('tenant_id', [A, B]), 'ayar okuma');
    check(!!r.error && ayar.length === 1 && ayar[0].tenant_id === A,
      '6a. Iki isletmeye uye kullanici tenant_settings satirini TASIYAMAZ', `${hataMetni(r.error)}; satir=${JSON.stringify(ayar)}`);

    // -----------------------------------------------------------------------
    console.log('\n--- 7. L-05 / L-06 ---');
    const anon = newClient();
    for (const t of ['guests', 'bookings', 'profiles', 'scheduled_messages']) {
      r = await anon.from(t).select('*').limit(1);
      check(r.error && /permission denied/i.test(String(r.error.message)),
        `7a. anon ${t} tablosuna GIREMEZ (RLS'e kadar bile)`, r.error ? hataMetni(r.error) : `200 ${JSON.stringify(r.data)}`);
    }

    r = await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P41 Ikinci ' + s, p_full_name: 'P41' });
    if (r.data && r.data.tenant_id) createdTenants.push(r.data.tenant_id);
    let uyelik = must(await admin.from('tenant_members').select('tenant_id').eq('user_id', own.id), 'uyelik');
    check(!!r.error && uyelik.length === 1,
      '7b. Isletmesi olan kullanici IKINCI isletme acamaz', `${hataMetni(r.error) || JSON.stringify(r.data)}; uyelik=${uyelik.length}`);
    r = await vw.client.rpc('create_tenant_and_owner', { p_company_name: 'P41 Viewer ' + s, p_full_name: 'P41' });
    if (r.data && r.data.tenant_id) createdTenants.push(r.data.tenant_id);
    uyelik = must(await admin.from('tenant_members').select('tenant_id').eq('user_id', vw.id), 'uyelik vw');
    check(!!r.error && uyelik.length === 1,
      '7c. Baska isletmede uyeligi olan kullanici yeni isletme acamaz', `${hataMetni(r.error) || JSON.stringify(r.data)}; uyelik=${uyelik.length}`);

    await katalogBolumu();
  } catch (err) {
    no('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    console.log('\n--- TEMIZLIK ---');
    let hata = false;
    for (const c of clients) { try { await c.client.auth.signOut(); } catch (e) {} }
    async function retry(l, fn) {
      for (let a = 1; a <= 3; a++) {
        const { error } = await fn();
        if (!error) return true;
        if (a === 3) { console.error(`[FAIL] ${l}: ${error.message}`); return false; }
        await new Promise(res => setTimeout(res, a * 400));
      }
      return false;
    }
    for (const t of createdTenants) if (!await retry('Tenant ' + t, () => admin.from('tenants').delete().eq('id', t))) hata = true;
    for (const u of createdUsers) if (!await retry('Kullanici ' + u, () => admin.auth.admin.deleteUser(u))) hata = true;

    const { data: after } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const kalan = (after ? after.users : []).filter(u => createdUsers.includes(u.id));
    if (kalan.length) { hata = true; console.error(`[FAIL] ${kalan.length} test hesabi duruyor`); }
    if (hata) failed++; else ok('9. Test verileri eksiksiz temizlendi');

    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
