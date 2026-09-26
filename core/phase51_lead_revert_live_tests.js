/**
 * LEXBNB PHASE 51 — SILINEN REZERVASYONUN TALEBI ACIK SATISA DONER (CANLI, YALNIZ TEST PROJESI)
 *
 * Belirti (26.09.2026, gercek hesap): talepten donusturulen rezervasyon
 * silindiginde talep WON kaliyordu. Olmayan satis donusum oraninda kazanilmis
 * sayiliyor, talep "kazanilmis satis" diye silinemiyordu.
 *
 *   1. delete_booking_atomic, silinen rezervasyona bagli WON talebi ayni
 *      islemde QUOTE_SENT'e dondurur (bag ON DELETE SET NULL ile bosalir).
 *   2. Baska bir rezervasyona bagli WON talep degismez.
 *   3. Elle WON yapilmis (rezervasyon bagi olmayan) talep degismez.
 *   4. Yetki kapisi phase41/47 ile ayni: staff silemez, talep de degismez.
 *
 * phase51 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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
  const email = `p51_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P51!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 51 — SILINEN REZERVASYONUN TALEBI (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), stf = await makeUser('stf', s);
    clients.push(own, stf);
    const t = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P51 ' + s, p_full_name: 'P51' }), 'isletme');
    const T = t.tenant_id; createdTenants.push(T);
    must(await admin.from('tenant_members').insert({ tenant_id: T, user_id: stf.id, role: 'staff' }), 'personel');
    const p = must(await own.client.from('properties').insert({ tenant_id: T, name: 'Villa', slug: 'P51V' + s, base_price: 10000 }).select().single(), 'mulk');

    const talep = async (ad, extra) => must(await own.client.from('leads').insert({ tenant_id: T, property_id: p.id, guest_name: ad,
      channel: 'WhatsApp', quote_amount: 20000, status: 'QUOTE_SENT', ...(extra || {}) }).select().single(), 'talep ' + ad);
    const donustur = async (lead, ci, co) => must(await own.client.rpc('convert_lead_to_booking_atomic', {
      p_lead_id: lead.id, p_tenant_id: T, p_property_id: p.id, p_booking_code: null, p_check_in: ci, p_check_out: co,
      p_pax: 2, p_gross_amount: 20000, p_ota_commission: null, p_cleaning_fee: null, p_discount: null, p_notes: null }), 'donusturme ' + lead.guest_name);
    const oku = async (id) => must(await admin.from('leads').select('status, converted_booking_id').eq('id', id).single(), 'talep okuma');

    const l1 = await talep('Silinecek'), l2 = await talep('Kalacak'), l3 = await talep('Elle kazanildi', { status: 'WON' });
    const d1 = await donustur(l1, '2031-03-01', '2031-03-04');
    const d2 = await donustur(l2, '2031-04-01', '2031-04-04');
    const b1 = d1.converted_booking_id || (d1.booking && d1.booking.id);
    const b2 = d2.converted_booking_id || (d2.booking && d2.booking.id);
    check((await oku(l1.id)).status === 'WON' && !!b1 && !!b2, '0. Donusturme talebi WON yapar ve rezervasyona baglar', JSON.stringify(await oku(l1.id)));

    // 4. Yetki: staff silemez; talep degismez
    let r = await stf.client.rpc('delete_booking_atomic', { p_booking_id: b1, p_tenant_id: T });
    check(!!r.error && (await oku(l1.id)).status === 'WON', '4. Personel rezervasyon silemez; talep degismez', hataMetni(r.error) || 'IZIN VERILDI');

    // 1. Sahibin silmesi talebi acik satisa dondurur
    r = await own.client.rpc('delete_booking_atomic', { p_booking_id: b1, p_tenant_id: T });
    const s1 = await oku(l1.id);
    check(!r.error && s1.status === 'QUOTE_SENT' && s1.converted_booking_id === null,
      '1. Silinen rezervasyonun talebi QUOTE_SENT\'e doner, bag bosalir', hataMetni(r.error) || JSON.stringify(s1));

    // 2-3. Digerleri degismez
    const s2 = await oku(l2.id), s3 = await oku(l3.id);
    check(s2.status === 'WON' && s2.converted_booking_id === b2, '2. Baska rezervasyona bagli WON talep degismez', JSON.stringify(s2));
    check(s3.status === 'WON', '3. Elle WON yapilmis (bagsiz) talep degismez', JSON.stringify(s3));
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
