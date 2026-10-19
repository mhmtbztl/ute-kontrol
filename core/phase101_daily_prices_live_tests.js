/**
 * LEXBNB PHASE 101 — GUNLUK FIYAT KAYDI (CANLI, YALNIZ TEST PROJESI)
 *
 * Kullanici 19.10.2026 (M76, F.2.9): fiyat takvimindeki oneri onaylanabilmeli
 * ya da elle degistirilebilmeli.
 *
 *   1. Yonetim gunun fiyatini onaylar / elle yazar; ayni gun ikinci satir
 *      acilmaz, istemcinin gonderdigi upsert (onConflict) calisir.
 *   2. Satis ve izleyici okur, yazamaz; personel okuyamaz.
 *   3. Baska isletmenin mulku kullanilamaz; yabanci okuyamaz; anon erisemez;
 *      tenant_id degismez; "kim degistirdi" oturumdan yazilir.
 *   4. Isletme sifirlama gunluk fiyatlari da bosaltir.
 *
 * phase101 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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
  const email = `p101_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P101!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 101 — GUNLUK FIYAT KAYDI (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), vwr = await makeUser('vwr', s), sls = await makeUser('sls', s), stf = await makeUser('stf', s), yab = await makeUser('yab', s);
    clients.push(own, vwr, sls, stf, yab);
    const T = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P101 ' + s, p_full_name: 'P101' }), 'isletme').tenant_id;
    const Y = must(await yab.client.rpc('create_tenant_and_owner', { p_company_name: 'P101Y ' + s, p_full_name: 'P101Y' }), 'yabanci isletme').tenant_id;
    createdTenants.push(T, Y);
    must(await admin.from('tenant_members').insert([
      { tenant_id: T, user_id: vwr.id, role: 'viewer' },
      { tenant_id: T, user_id: sls.id, role: 'sales' },
      { tenant_id: T, user_id: stf.id, role: 'staff' }]), 'uyeler');
    const mulk = async (client, tenant, kod) => must(await client.from('properties').insert({
      tenant_id: tenant, name: kod, slug: kod + s, base_price: 10000, activated_on: '2024-01-01' }).select().single(), 'mulk ' + kod);
    const A = await mulk(own.client, T, 'P101A');
    const YM = await mulk(yab.client, Y, 'P101Y');
    // Istemcinin gonderdigi cagrinin aynisi (CLAUDE.md 5.15: test, istemcinin cagrisini olcer).
    const yaz = (client, satirlar) => client.from('property_daily_prices')
      .upsert(satirlar, { onConflict: 'property_id,price_date' }).select();

    // 1. Yonetim yazar
    let r = await yaz(own.client, [
      { tenant_id: T, property_id: A.id, price_date: '2031-07-01', price: 12500, source: 'APPROVED', suggested_price: 12500 },
      { tenant_id: T, property_id: A.id, price_date: '2031-07-02', price: 15000, source: 'MANUAL', suggested_price: 12500, note: 'Festival' }]);
    check(!r.error && (r.data || []).length === 2, '1a. Yonetim iki gunu tek istekte onaylar / elle yazar', hataMetni(r.error));
    check(!r.error && r.data.every(row => row.updated_by === own.id), '1b. "Kim degistirdi" oturumdan yazilir', JSON.stringify(r.data));
    r = await yaz(own.client, [{ tenant_id: T, property_id: A.id, price_date: '2031-07-01', price: 13000, source: 'MANUAL', suggested_price: 12500 }]);
    const ayniGun = must(await admin.from('property_daily_prices').select('price, source').eq('property_id', A.id).eq('price_date', '2031-07-01'), 'ayni gun');
    check(!r.error && ayniGun.length === 1 && Number(ayniGun[0].price) === 13000 && ayniGun[0].source === 'MANUAL',
      '1c. Ayni gun ikinci satir acmaz; upsert onConflict mevcut satiri gunceller', hataMetni(r.error) || JSON.stringify(ayniGun));
    r = await yaz(own.client, [{ tenant_id: T, property_id: A.id, price_date: '2031-07-03', price: 0, source: 'MANUAL' }]);
    check(!!r.error, '1d. Fiyat sifir olamaz (CHECK)', 'IZIN VERILDI');
    r = await yaz(own.client, [{ tenant_id: T, property_id: A.id, price_date: '2031-07-03', price: 100, source: 'GUESS' }]);
    check(!!r.error, '1e. Kaynak yalniz APPROVED / MANUAL', 'IZIN VERILDI');
    r = await own.client.from('property_daily_prices').delete().eq('property_id', A.id).eq('price_date', '2031-07-02').select();
    check(!r.error && (r.data || []).length === 1, '1f. Yonetim gunun kaydini kaldirir (oneriye doner)', hataMetni(r.error));

    // 2. Roller
    r = await sls.client.from('property_daily_prices').select('id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 1, '2a. Satis onayli fiyati okur', hataMetni(r.error) || JSON.stringify(r.data));
    r = await vwr.client.from('property_daily_prices').select('id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 1, '2b. Izleyici okur', hataMetni(r.error) || JSON.stringify(r.data));
    r = await stf.client.from('property_daily_prices').select('id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 0, '2c. Personel fiyat defterini okuyamaz', JSON.stringify(r.data));
    for (const [ad, u] of [['Satis', sls], ['Izleyici', vwr], ['Personel', stf]]) {
      r = await yaz(u.client, [{ tenant_id: T, property_id: A.id, price_date: '2031-07-05', price: 9000, source: 'MANUAL' }]);
      check(!!r.error, `2d. ${ad} fiyat yazamaz`, 'IZIN VERILDI');
    }

    // 3. Kiraci siniri
    r = await yaz(own.client, [{ tenant_id: T, property_id: YM.id, price_date: '2031-07-06', price: 9000, source: 'MANUAL' }]);
    check(!!r.error, '3a. Baska isletmenin mulkune fiyat yazilamaz', 'IZIN VERILDI');
    r = await yab.client.from('property_daily_prices').select('id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 0, '3b. Yabanci isletme fiyatlari goremez', JSON.stringify(r.data));
    r = await newClient().from('property_daily_prices').select('id').limit(1);
    check(!!r.error, '3c. anon tabloya erisemez', JSON.stringify(r.data));
    r = await own.client.from('property_daily_prices').update({ tenant_id: Y }).eq('property_id', A.id);
    check(!!r.error, '3d. tenant_id degistirilemez', 'IZIN VERILDI');

    // 4. Sifirlama
    r = await own.client.rpc('reset_tenant_data', { p_tenant_id: T, p_confirm: 'VERILERI SIFIRLA' });
    const kalan = must(await admin.from('property_daily_prices').select('id').eq('tenant_id', T), 'kalan');
    check(!r.error && kalan.length === 0 && Number((r.data?.deleted || {}).property_daily_prices) === 1,
      '4. Sifirlama gunluk fiyatlari bosaltir', hataMetni(r.error) || JSON.stringify({ kalan, d: r.data }));
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
