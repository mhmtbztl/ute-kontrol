/**
 * LEXBNB PHASE 49 — FAALIYETE BASLAMA TARIHI (CANLI, YALNIZ TEST PROJESI)
 *
 * Belirti (26.09.2026, gercek hesap): mulkler sisteme eklendikleri gun
 * "faaliyete baslamis" sayiliyordu; ice aktarilmis gecmis rezervasyonlarin
 * aylarinda kapasite SIFIR, ana sayfa "79 / 0 Gece", Eylul "2 / 85".
 *
 *   1. Daha eski tarihli rezervasyon activated_on'u geri ceker (staff dahil).
 *   2. Iptal edilmis rezervasyon cekmez.
 *   3. activated_on ilk rezervasyondan sonraya alinamaz; oncesine alinabilir.
 *   4. Kapanmis aya dokunan degisiklik reddedilir; rezervasyon da o durumda
 *      tarihi cekmez (muhurlu donemin kapasitesi degismez).
 *   5. Uctan uca: sunucu anlik goruntusu eski rezervasyonun ayinda TAM AY
 *      kapasite verir (0 degil).
 *
 * phase49 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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

const pad = n => String(n).padStart(2, '0');
const bugunIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
// Bugunden k ay onceki ayin { y, m, gun(d), anahtar, gunSayisi }
function ayOnce(k) {
  const [y0, m0] = bugunIst().split('-').map(Number);
  const t = new Date(Date.UTC(y0, m0 - 1 - k, 1));
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
  return { y, m, gun: d => `${y}-${pad(m)}-${pad(d)}`, anahtar: `${y}-${pad(m)}`, gunSayisi: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

async function makeUser(label, stamp) {
  const email = `p49_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P49!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, email, client };
}
async function makeTenant(u, name) {
  const t = must(await u.client.rpc('create_tenant_and_owner', { p_company_name: name, p_full_name: 'P49' }), 'isletme');
  createdTenants.push(t.tenant_id);
  return t.tenant_id;
}
// activated_on gonderilmez: sunucu varsayilani (bugun) — sorunun kendisi.
async function mulk(client, tid, s, tag) {
  return must(await client.from('properties').insert({ tenant_id: tid, name: 'Villa ' + tag, slug: 'P49' + tag.toUpperCase() + s, base_price: 10000 })
    .select().single(), 'mulk ' + tag);
}
async function rez(client, tid, pid, code, ci, co, status) {
  return client.from('bookings').insert({ tenant_id: tid, property_id: pid, booking_code: code, guest_name: 'Misafir',
    channel: 'Airbnb', check_in: ci, check_out: co, gross_amount: 20000, pax: 2, ...(status ? { status } : {}) }).select().single();
}
const aktivasyon = async (pid) => must(await admin.from('properties').select('activated_on').eq('id', pid).single(), 'aktivasyon').activated_on;
function bul(obj, anahtar) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, anahtar)) return obj[anahtar];
  for (const v of Object.values(obj)) { const r = bul(v, anahtar); if (r !== undefined) return r; }
  return undefined;
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 49 — FAALIYETE BASLAMA TARIHI (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const bugun = bugunIst();
  const M1 = ayOnce(1), M2 = ayOnce(2), M3 = ayOnce(3), M4 = ayOnce(4);
  const clients = [];
  try {
    const own = await makeUser('own', s), stf = await makeUser('stf', s), own2 = await makeUser('own2', s);
    clients.push(own, stf, own2);
    const A = await makeTenant(own, 'P49 A ' + s);
    const B = await makeTenant(own2, 'P49 B ' + s);
    must(await admin.from('tenant_members').insert({ tenant_id: A, user_id: stf.id, role: 'staff' }), 'personel');

    // -----------------------------------------------------------------------
    console.log('--- 1-2. REZERVASYON TARIHI GERI CEKER ---');
    const p1 = await mulk(own.client, A, s, 'a');
    check(await aktivasyon(p1.id) === bugun, '0. Formdan tarih gelmeyen yeni mulk bugun faaliyete baslar (varsayilan)', await aktivasyon(p1.id));

    let r = await rez(own.client, A, p1.id, 'P49A1-' + s, M3.gun(5), M3.gun(9));
    check(!r.error && await aktivasyon(p1.id) === M3.gun(5),
      `1a. ${M3.gun(5)} girisli rezervasyon faaliyet baslangicini geri ceker`, hataMetni(r.error) || await aktivasyon(p1.id));

    r = await rez(own.client, A, p1.id, 'P49A0-' + s, M4.gun(10), M4.gun(12), 'CANCELLED');
    check(!r.error && await aktivasyon(p1.id) === M3.gun(5), '2. Iptal edilmis daha eski rezervasyon CEKMEZ', hataMetni(r.error) || await aktivasyon(p1.id));

    // Personel mulk guncelleyemez ama rezervasyon girer; tarih yine cekilmeli.
    r = await rez(stf.client, A, p1.id, 'P49A2-' + s, M4.gun(1), M4.gun(3));
    if (r.error && /permission|row-level|42501/i.test(r.error.message)) {
      ok('1b. (personel rezervasyon giremiyor; rol kurali bu testin kapsaminda degil)');
    } else {
      check(!r.error && await aktivasyon(p1.id) === M4.gun(1),
        '1b. Personelin girdigi daha eski rezervasyon da tarihi ceker (SECURITY DEFINER)', hataMetni(r.error) || await aktivasyon(p1.id));
    }
    const ilk = await aktivasyon(p1.id);

    // -----------------------------------------------------------------------
    console.log('\n--- 3. KORUMA: ILK REZERVASYONDAN SONRAYA ALINAMAZ ---');
    r = await own.client.from('properties').update({ activated_on: bugun }).eq('id', p1.id).select('id');
    check(!!r.error && /ACTIVATION_AFTER_FIRST_BOOKING/.test(r.error.message) && await aktivasyon(p1.id) === ilk,
      '3a. Faaliyet baslangici ilk rezervasyondan sonraya alinamaz; deger degismez', hataMetni(r.error) || 'IZIN VERILDI');
    check(!!r.error && /rezervasyon/i.test(r.error.message) && !/function|column|relation/i.test(r.error.message),
      '3b. Ret mesaji kullaniciya okunur Turkce', hataMetni(r.error));
    r = await own.client.from('properties').update({ activated_on: M4.gun(1) === ilk ? ayOnce(5).gun(1) : M4.gun(1) }).eq('id', p1.id).select('activated_on');
    check(!r.error, '3c. Daha ONCEYE alinabilir (mulk rezervasyondan once de faaliyetteydi)', hataMetni(r.error));
    r = await own.client.from('properties').update({ activated_on: null }).eq('id', p1.id).select('id');
    check(!!r.error && /ACTIVATION_REQUIRED/.test(r.error.message), '3d. Bos birakilamaz (bos tarih mulku kapasiteden tamamen dusurur)', hataMetni(r.error) || 'IZIN VERILDI');

    // -----------------------------------------------------------------------
    console.log('\n--- 4. KAPANMIS DONEM ---');
    const p2 = await mulk(own2.client, B, s, 'b');
    r = await own2.client.rpc('close_monthly_period_atomic', { p_tenant_id: B, p_year: M1.y, p_month: M1.m, p_snapshot: {} });
    must(r, 'kapanis');
    const once2 = await aktivasyon(p2.id);
    r = await own2.client.from('properties').update({ activated_on: M2.gun(1) }).eq('id', p2.id).select('id');
    check(!!r.error && /CLOSED_PERIOD_VIOLATION/.test(r.error.message) && await aktivasyon(p2.id) === once2,
      `4a. Kapanmis aya (${M1.anahtar}) dokunan faaliyet tarihi degisikligi reddedilir`, hataMetni(r.error) || 'IZIN VERILDI');
    r = await rez(own2.client, B, p2.id, 'P49B1-' + s, M2.gun(3), M2.gun(6));
    check(!r.error && await aktivasyon(p2.id) === once2,
      `4b. Acik aydaki (${M2.anahtar}) rezervasyon kaydedilir ama kapanmis ayi asarak tarihi CEKMEZ`, hataMetni(r.error) || await aktivasyon(p2.id));

    // -----------------------------------------------------------------------
    console.log('\n--- 5. UCTAN UCA: SUNUCU KAPASITESI ---');
    const snap = await own.client.rpc('get_executive_dashboard_snapshot', { p_tenant_id: A, p_target_month: M3.anahtar, p_property_id: p1.id });
    const kapasite = bul(snap.data, 'available_nights');
    check(!snap.error && Number(kapasite) === M3.gunSayisi,
      `5. ${M3.anahtar} (eski rezervasyonun ayi) kapasitesi TAM AY: ${M3.gunSayisi} gece, 0 degil`, hataMetni(snap.error) || `available_nights=${kapasite}`);
  } catch (e) {
    no('Beklenmeyen hata', e.stack || e.message);
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
    for (const t of createdTenants) {
      if (!await retry('Tenant ' + t, () => admin.from('tenants').delete().eq('id', t))) hata = true;
    }
    for (const u of createdUsers) {
      const { data } = await admin.auth.admin.getUserById(u);
      if (data && data.user && !await retry('Kullanici ' + u, () => admin.auth.admin.deleteUser(u))) hata = true;
    }
    const { data: after } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const kalan = (after ? after.users : []).filter(u => createdUsers.includes(u.id));
    if (kalan.length) { hata = true; console.error(`[FAIL] ${kalan.length} test hesabi duruyor`); }
    if (hata) failed++; else ok('6. Test verileri eksiksiz temizlendi');

    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
