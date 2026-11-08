/**
 * LEXBNB PHASE 115 — RAKIP ARASTIRMASINDA RAKIP ADI (CANLI, YALNIZ TEST PROJESI)
 *
 * Kullanici 08.11.2026: ayni rakibin fiyatini zaman icinde izlemek ve en fazla
 * 5 rakibin ortalamasini gostermek icin rakip adi.
 *
 *   1. Yonetim adli kayit yazar; istemcinin gercek cagrisi (saveResearch) ile.
 *   2. Bos / bosluklu / 120 karakterden uzun ad reddedilir; ad verilmezse NULL.
 *   3. Satis okur, yazamaz; yabanci isletme goremez; anon tabloya giremez.
 *   4. Eski (adsiz) satir NULL kalir; ad sonradan duzenlemeyle eklenir.
 *
 * phase115 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
 */

const { createClient } = require('@supabase/supabase-js');
const Research = require('./pricing_research_service.js');

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
  const email = `p115_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P115!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 115 — RAKIP ADI (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), sls = await makeUser('sls', s), yab = await makeUser('yab', s);
    clients.push(own, sls, yab);
    const T = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P115 ' + s, p_full_name: 'P115' }), 'isletme').tenant_id;
    const Y = must(await yab.client.rpc('create_tenant_and_owner', { p_company_name: 'P115Y ' + s, p_full_name: 'P115Y' }), 'yabanci isletme').tenant_id;
    createdTenants.push(T, Y);
    must(await admin.from('tenant_members').insert([{ tenant_id: T, user_id: sls.id, role: 'sales' }]), 'uyeler');
    const A = must(await own.client.from('properties').insert({ tenant_id: T, name: 'P115A', slug: 'p115a' + s, base_price: 10000, activated_on: '2024-01-01' }).select().single(), 'mulk');
    const base = { tenantId: T, propertyId: A.id, researchedOn: '2026-11-01', sourceKind: 'OTA', sourceUrl: 'https://ornek.test/ilan', values: { WEEKDAY: 9000, WEEKEND: 12000 } };

    // 1. Istemcinin gercek yazma yolu
    let row = null, hata = null;
    try { row = await Research.saveResearch(own.client, { ...base, competitorName: '  Villa   Mavi ' }); } catch (e) { hata = e; }
    check(row && row.competitor_name === 'Villa Mavi', '1a. Yonetim adli arastirma yazar; ad sadelesmis kaydedilir (istemcinin saveResearch cagrisi)', hataMetni(hata) || JSON.stringify(row));
    let adsiz = null;
    try { adsiz = await Research.saveResearch(own.client, base); } catch (e) { hata = e; }
    check(adsiz && adsiz.competitor_name === null, '1b. Ad verilmezse sutun NULL (eski davranis bozulmaz)', hataMetni(hata) || JSON.stringify(adsiz));

    // 2. Kisit
    const payload = name => ({ tenant_id: T, property_id: A.id, researched_on: '2026-11-02', source_kind: 'OTA', source_url: 'https://ornek.test/x', prices: [{ type: 'WEEKDAY', amount: 1, currency: 'TRY' }], competitor_name: name });
    for (const [ad, etiket] of [['', 'bos'], ['   ', 'yalniz bosluk'], [' Ev ', 'basta/sonda bosluk'], ['x'.repeat(121), '121 karakter']]) {
      const r = await own.client.from('competitor_price_research').insert(payload(ad)).select();
      check(!!r.error && /23514|check/i.test(hataMetni(r.error)), `2. ${etiket} ad reddedilir (CHECK)`, hataMetni(r.error) || 'IZIN VERILDI');
    }
    const r120 = await own.client.from('competitor_price_research').insert(payload('y'.repeat(120))).select();
    check(!r120.error, '2e. 120 karakter kabul edilir', hataMetni(r120.error));

    // 3. Yetki
    let r = await sls.client.from('competitor_price_research').select('id, competitor_name').eq('tenant_id', T);
    check(!r.error && (r.data || []).some(x => x.competitor_name === 'Villa Mavi'), '3a. Satis rolu rakip adini okur', hataMetni(r.error) || JSON.stringify(r.data));
    r = await sls.client.from('competitor_price_research').update({ competitor_name: 'Satis' }).eq('id', row.id).select();
    check(!r.error && (r.data || []).length === 0, '3b. Satis rolu rakip adini degistiremez (RLS)', hataMetni(r.error) || JSON.stringify(r.data));
    r = await yab.client.from('competitor_price_research').select('id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 0, '3c. Yabanci isletme kayitlari goremez', hataMetni(r.error) || JSON.stringify(r.data));
    r = await newClient().from('competitor_price_research').select('competitor_name').limit(1);
    check(!!r.error && /42501|permission/i.test(hataMetni(r.error)), '3d. anon tabloya giremez (42501)', hataMetni(r.error) || JSON.stringify(r.data));

    // 4. Eski satir duzenlemeyle ad alir
    let duz = null;
    try { duz = await Research.saveResearch(own.client, { ...base, id: adsiz.id, competitorName: 'Ev Zeytin' }); } catch (e) { hata = e; }
    check(duz && duz.id === adsiz.id && duz.competitor_name === 'Ev Zeytin', '4. Adsiz kayit duzenlemeyle ad alir', hataMetni(hata) || JSON.stringify(duz));
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
