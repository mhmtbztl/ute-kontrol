/**
 * LEXBNB PHASE 103 — SATIS ROLUNE YALNIZ KAPALI TARIHLER (CANLI, YALNIZ TEST PROJESI)
 *
 * Kullanici 19.10.2026 (M83, F.7.1): satis rolu arizalari okuyamadigi icin
 * fiyat takviminde bakimla kapali gunu "Acik" goruyordu.
 *
 *   1. Satis ve izleyici kapali araligi okur; baslik/aciklama/maliyet donmez.
 *   2. Tarihsiz kritik ariza yalniz bugunu kapatir; cozulmus/iptal ariza donmez.
 *   3. Personel, yabanci isletme ve anon cagiramaz (42501); arizalarin
 *      kendisini satis rolu hala okuyamaz.
 *
 * phase103 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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
const istanbulBugun = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const gun = (bugun, n) => new Date(Date.parse(bugun + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

async function makeUser(label, stamp) {
  const email = `p103_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P103!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 103 — SATIS ROLUNE YALNIZ KAPALI TARIHLER (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), sls = await makeUser('sls', s), vwr = await makeUser('vwr', s), stf = await makeUser('stf', s), yab = await makeUser('yab', s);
    clients.push(own, sls, vwr, stf, yab);
    const T = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P103 ' + s, p_full_name: 'P103' }), 'isletme').tenant_id;
    const Y = must(await yab.client.rpc('create_tenant_and_owner', { p_company_name: 'P103Y ' + s, p_full_name: 'P103Y' }), 'yabanci isletme').tenant_id;
    createdTenants.push(T, Y);
    must(await admin.from('tenant_members').insert([
      { tenant_id: T, user_id: sls.id, role: 'sales' },
      { tenant_id: T, user_id: vwr.id, role: 'viewer' },
      { tenant_id: T, user_id: stf.id, role: 'staff' }]), 'uyeler');
    const A = must(await own.client.from('properties').insert({ tenant_id: T, name: 'P103A', slug: 'p103a' + s, base_price: 10000, activated_on: '2024-01-01' }).select().single(), 'mulk');
    const B = gun(istanbulBugun(), 0);
    // Toplu eklemede her satir ayni anahtarlari tasimali (eksik anahtar NULL gider).
    const ariza = (ek) => ({ tenant_id: T, property_id: A.id, category: 'Genel', title: 'GIZLI BASLIK', description: 'GIZLI ACIKLAMA', estimated_cost: 9999,
      severity: 'MEDIUM', blocks_availability: false, downtime_start: null, downtime_end: null, ...ek });
    must(await admin.from('maintenance_tickets').insert([
      ariza({ status: 'OPEN', blocks_availability: true, downtime_start: gun(B, 3), downtime_end: gun(B, 5) }),
      ariza({ status: 'IN_PROGRESS', severity: 'CRITICAL' }),
      ariza({ status: 'RESOLVED', blocks_availability: true, downtime_start: gun(B, 10), downtime_end: gun(B, 12) }),
      ariza({ status: 'CANCELLED', blocks_availability: true, downtime_start: gun(B, 20), downtime_end: gun(B, 21) }),
      ariza({ status: 'OPEN', severity: 'LOW' })
    ]), 'arizalar');
    const cagir = (u, tenant = T) => u.client.rpc('get_property_closures', { p_tenant_id: tenant, p_from: B, p_to: gun(B, 60) });

    // 1. Satis ve izleyici kapali araligi okur
    let r = await cagir(sls);
    const anahtar = rows => (rows || []).map(x => `${x.start_date}..${x.end_date}`).sort();
    check(!r.error && JSON.stringify(anahtar(r.data)) === JSON.stringify([`${B}..${B}`, `${gun(B, 3)}..${gun(B, 5)}`].sort()),
      '1a. Satis acik arizalarin kapali araligini gorur (tarihli aralik + tarihsiz kritik yalniz bugun)', hataMetni(r.error) || JSON.stringify(r.data));
    check(!r.error && (r.data || []).every(x => Object.keys(x).sort().join(',') === 'end_date,property_id,start_date' && x.property_id === A.id),
      '1b. Yalniz mulk + baslangic + bitis doner; baslik, aciklama, maliyet sizmaz', JSON.stringify(r.data));
    r = await cagir(vwr);
    check(!r.error && (r.data || []).length === 2, '1c. Izleyici de kapali araligi okur', hataMetni(r.error) || JSON.stringify(r.data));
    r = await cagir(own);
    check(!r.error && (r.data || []).length === 2, '1d. Yonetim de ayni cevabi alir', hataMetni(r.error));

    // 2. Cozulmus / iptal / bloklamayan ariza donmez — 1a'daki tam liste bunu olcer; aralik disi da donmez
    r = await sls.client.rpc('get_property_closures', { p_tenant_id: T, p_from: gun(B, 30), p_to: gun(B, 60) });
    check(!r.error && (r.data || []).length === 0, '2a. Istenen aralik disindaki kapanis ve bugunku tarihsiz ariza donmez', hataMetni(r.error) || JSON.stringify(r.data));
    r = await sls.client.rpc('get_property_closures', { p_tenant_id: T, p_from: B, p_to: gun(B, 500) });
    check(!!r.error, '2b. 400 gunden uzun aralik reddedilir', 'IZIN VERILDI');

    // 3. Yetki
    r = await cagir(stf);
    check(!!r.error && /42501|FORBIDDEN/.test(hataMetni(r.error)), '3a. Personel cagiramaz (42501)', hataMetni(r.error) || JSON.stringify(r.data));
    r = await cagir(yab);
    check(!!r.error && /42501|FORBIDDEN/.test(hataMetni(r.error)), '3b. Yabanci isletme cagiramaz (42501)', hataMetni(r.error) || JSON.stringify(r.data));
    r = await newClient().rpc('get_property_closures', { p_tenant_id: T, p_from: B, p_to: gun(B, 60) });
    check(!!r.error, '3c. anon cagiramaz', JSON.stringify(r.data));
    r = await sls.client.from('maintenance_tickets').select('id, title').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 0, '3d. Satis rolu arizalarin kendisini hala okuyamaz (phase53 siniri korunur)', JSON.stringify(r.data));
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
    if (hata) failed++; else ok('4. Test verileri eksiksiz temizlendi');
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
