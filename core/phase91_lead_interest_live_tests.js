/**
 * LEXBNB PHASE 91 — TALEBIN EK ILGILENDIGI MULKLER (CANLI, YALNIZ TEST PROJESI)
 *
 * Kullanici M16 (14.10.2026): talep birden fazla mulkle ilgilenebilmeli.
 * lead_interest_properties bag tablosu, talebin kendi rol sozlesmesiyle:
 *
 *   1. Satis rolu ayni isletmenin talebine ek mulk baglar, okur ve kaldirir.
 *   2. Baska isletmenin mulku baglanamaz (CROSS_TENANT_PROPERTY).
 *   3. Baska isletmenin talebine bag yazilamaz (RLS + CROSS_TENANT_LEAD).
 *   4. Izleyici okur, yazamaz; personel (staff) hic okuyamaz.
 *   5. anon tabloya erisemez.
 *   6. Talep silinince baglari cascade ile gider.
 *
 * phase91 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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
  const email = `p91_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P91!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 91 — TALEBIN EK ILGILENDIGI MULKLER (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), sls = await makeUser('sls', s), vwr = await makeUser('vwr', s), stf = await makeUser('stf', s), yab = await makeUser('yab', s);
    clients.push(own, sls, vwr, stf, yab);
    const T = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P91 ' + s, p_full_name: 'P91' }), 'isletme').tenant_id;
    const Y = must(await yab.client.rpc('create_tenant_and_owner', { p_company_name: 'P91Y ' + s, p_full_name: 'P91Y' }), 'yabanci isletme').tenant_id;
    createdTenants.push(T, Y);
    must(await admin.from('tenant_members').insert([
      { tenant_id: T, user_id: sls.id, role: 'sales' },
      { tenant_id: T, user_id: vwr.id, role: 'viewer' },
      { tenant_id: T, user_id: stf.id, role: 'staff' }]), 'uyeler');
    const mulk = async (client, tenant, kod) => must(await client.from('properties').insert({ tenant_id: tenant, name: kod, slug: kod + s, base_price: 10000 }).select().single(), 'mulk ' + kod);
    const A = await mulk(own.client, T, 'P91A'), B = await mulk(own.client, T, 'P91B'), C = await mulk(own.client, T, 'P91C');
    const YM = await mulk(yab.client, Y, 'P91Y');
    const lead = must(await own.client.from('leads').insert({ tenant_id: T, property_id: A.id, guest_name: 'TEST Coklu', channel: 'WhatsApp', status: 'NEW' }).select().single(), 'talep');
    const ylead = must(await yab.client.from('leads').insert({ tenant_id: Y, property_id: YM.id, guest_name: 'TEST Yabanci', channel: 'WhatsApp', status: 'NEW' }).select().single(), 'yabanci talep');

    // 1. Satis rolu baglar, okur, kaldirir
    let r = await sls.client.from('lead_interest_properties').insert([
      { tenant_id: T, lead_id: lead.id, property_id: B.id },
      { tenant_id: T, lead_id: lead.id, property_id: C.id }]);
    check(!r.error, '1a. Satis rolu talebe iki ek mulk baglar', hataMetni(r.error));
    r = await sls.client.from('lead_interest_properties').select('property_id').eq('lead_id', lead.id);
    check(!r.error && (r.data || []).length === 2, '1b. Satis rolu baglari okur', hataMetni(r.error) || JSON.stringify(r.data));
    r = await sls.client.from('lead_interest_properties').delete().eq('lead_id', lead.id).eq('property_id', C.id);
    const kalan = must(await admin.from('lead_interest_properties').select('property_id').eq('lead_id', lead.id), 'kalan');
    check(!r.error && kalan.length === 1 && kalan[0].property_id === B.id, '1c. Satis rolu bag kaldirir', hataMetni(r.error) || JSON.stringify(kalan));

    // 2. Baska isletmenin mulku baglanamaz
    r = await own.client.from('lead_interest_properties').insert({ tenant_id: T, lead_id: lead.id, property_id: YM.id });
    check(!!r.error && /CROSS_TENANT_PROPERTY/.test(r.error.message || ''), '2. Baska isletmenin mulku baglanamaz', hataMetni(r.error) || 'IZIN VERILDI');

    // 3. Baska isletmenin talebine bag yazilamaz
    r = await own.client.from('lead_interest_properties').insert({ tenant_id: T, lead_id: ylead.id, property_id: B.id });
    check(!!r.error, '3a. Kendi tenant_id ile baska isletmenin talebine bag yazilamaz', 'IZIN VERILDI');
    r = await own.client.from('lead_interest_properties').insert({ tenant_id: Y, lead_id: ylead.id, property_id: YM.id });
    check(!!r.error, '3b. Uyesi olunmayan isletmeye bag yazilamaz (RLS)', 'IZIN VERILDI');
    r = await yab.client.from('lead_interest_properties').select('lead_id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 0, '3c. Yabanci isletme baglari goremez', hataMetni(r.error) || JSON.stringify(r.data));

    // 4. Izleyici okur yazamaz; personel okuyamaz
    r = await vwr.client.from('lead_interest_properties').select('property_id').eq('lead_id', lead.id);
    check(!r.error && (r.data || []).length === 1, '4a. Izleyici baglari okur', hataMetni(r.error) || JSON.stringify(r.data));
    r = await vwr.client.from('lead_interest_properties').insert({ tenant_id: T, lead_id: lead.id, property_id: C.id });
    check(!!r.error, '4b. Izleyici bag yazamaz', 'IZIN VERILDI');
    r = await stf.client.from('lead_interest_properties').select('property_id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 0, '4c. Personel (staff) satis verisini okuyamaz', hataMetni(r.error) || JSON.stringify(r.data));

    // 5. anon
    r = await newClient().from('lead_interest_properties').select('lead_id').limit(1);
    check(!!r.error, '5. anon tabloya erisemez', JSON.stringify(r.data));

    // 6. Talep silinince baglar gider
    must(await own.client.from('leads').delete().eq('id', lead.id), 'talep silme');
    const sonra = must(await admin.from('lead_interest_properties').select('lead_id').eq('lead_id', lead.id), 'cascade');
    check(sonra.length === 0, '6. Talep silinince baglari cascade ile gider', JSON.stringify(sonra));
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
    if (hata) failed++; else ok('7. Test verileri eksiksiz temizlendi');
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
