/**
 * LEXBNB PHASE 93 — BILDIRIM MERKEZI KAYNAGI (CANLI, YALNIZ TEST PROJESI)
 *
 * Kullanici M22 (14.10.2026): bildirim merkezi her hesapta bostu; satir
 * ureten kod yoktu. sync_my_notifications yalniz cagiranin KENDI satirlarini
 * yazar:
 *
 *   1. Uye kendi olaylarini yazar; ayni olay ikinci kez yazilmaz, metni guncellenir.
 *   2. Listeden cikan olay RESOLVED olur, geri gelirse yeniden UNREAD.
 *   3. Okundu durumu kisiseldir: A'nin okumasi B'ninkini degistirmez,
 *      B A'nin satirini goremez.
 *   4. Uyesi olunmayan isletmeye yazilamaz; anon cagiramaz.
 *   5. Gecersiz alan (anahtar, alan, onem, baglanti) reddedilir.
 *
 * phase93 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
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
  const email = `p93_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P93!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

const olay = (key, title, extra = {}) => ({ event_key: key, domain: 'OPERATIONS', severity: 'WARNING', title, message: 'test', deep_link: 'operations:cleaning', ...extra });

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 93 — BILDIRIM MERKEZI KAYNAGI (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s), sls = await makeUser('sls', s), yab = await makeUser('yab', s);
    clients.push(own, sls, yab);
    const T = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P93 ' + s, p_full_name: 'P93' }), 'isletme').tenant_id;
    const Y = must(await yab.client.rpc('create_tenant_and_owner', { p_company_name: 'P93Y ' + s, p_full_name: 'P93Y' }), 'yabanci isletme').tenant_id;
    createdTenants.push(T, Y);
    must(await admin.from('tenant_members').insert({ tenant_id: T, user_id: sls.id, role: 'sales' }), 'uye');
    const sync = (u, tenant, events) => u.client.rpc('sync_my_notifications', { p_tenant_id: tenant, p_events: events });

    // 1. Yazar, tekrar yazmaz, metni gunceller
    let r = await sync(own, T, [olay('cleaning_inspection:t1', 'Temizlik A'), olay('period_unclosed:2026-09', 'Eylul')]);
    check(!r.error && (r.data || []).length === 2 && r.data.every(n => n.user_id === own.id && n.status === 'UNREAD'),
      '1a. Uye kendi iki olayini UNREAD yazar', hataMetni(r.error) || JSON.stringify(r.data));
    r = await sync(own, T, [olay('cleaning_inspection:t1', 'Temizlik A yeni'), olay('period_unclosed:2026-09', 'Eylul')]);
    const satirlar = must(await admin.from('user_notifications').select('event_key, title').eq('tenant_id', T).eq('user_id', own.id), 'satirlar');
    check(!r.error && satirlar.length === 2 && satirlar.some(n => n.title === 'Temizlik A yeni'),
      '1b. Ayni olay ikinci kez yazilmaz; basligi guncellenir', hataMetni(r.error) || JSON.stringify(satirlar));

    // 2. Biten olay RESOLVED, geri gelen UNREAD
    r = await sync(own, T, [olay('period_unclosed:2026-09', 'Eylul')]);
    let durum = must(await admin.from('user_notifications').select('status').eq('tenant_id', T).eq('user_id', own.id).eq('event_key', 'cleaning_inspection:t1').single(), 'durum');
    check(!r.error && durum.status === 'RESOLVED' && (r.data || []).length === 1, '2a. Listeden cikan olay RESOLVED olur ve donmez', hataMetni(r.error) || JSON.stringify({ durum, data: r.data }));
    r = await sync(own, T, [olay('cleaning_inspection:t1', 'Temizlik A'), olay('period_unclosed:2026-09', 'Eylul')]);
    durum = must(await admin.from('user_notifications').select('status').eq('tenant_id', T).eq('user_id', own.id).eq('event_key', 'cleaning_inspection:t1').single(), 'durum2');
    check(!r.error && durum.status === 'UNREAD', '2b. Yeniden etkin olay UNREAD olur', hataMetni(r.error) || JSON.stringify(durum));

    // 3. Okundu kisiseldir
    must(await sync(sls, T, [olay('period_unclosed:2026-09', 'Eylul')]), 'satis esleme');
    const ownRow = (await sync(own, T, [olay('cleaning_inspection:t1', 'Temizlik A'), olay('period_unclosed:2026-09', 'Eylul')])).data.find(n => n.event_key === 'period_unclosed:2026-09');
    r = await own.client.from('user_notifications').update({ status: 'READ', read_at: new Date().toISOString() }).eq('id', ownRow.id).select('id');
    const slsRow = must(await admin.from('user_notifications').select('status').eq('tenant_id', T).eq('user_id', sls.id).eq('event_key', 'period_unclosed:2026-09').single(), 'satis satiri');
    check(!r.error && (r.data || []).length === 1 && slsRow.status === 'UNREAD', '3a. Sahibin okumasi satis rolunun bildirimini degistirmez', hataMetni(r.error) || JSON.stringify(slsRow));
    r = await sls.client.from('user_notifications').select('id').eq('tenant_id', T).eq('user_id', own.id);
    check(!r.error && (r.data || []).length === 0, '3b. Uye baskasinin bildirimini goremez', hataMetni(r.error) || JSON.stringify(r.data));
    r = await sync(own, T, [olay('cleaning_inspection:t1', 'Temizlik A'), olay('period_unclosed:2026-09', 'Eylul')]);
    check(!r.error && (r.data || []).find(n => n.event_key === 'period_unclosed:2026-09').status === 'READ', '3c. Eslemede okundu durumu korunur', hataMetni(r.error) || JSON.stringify(r.data));

    // 4. Yetki
    r = await sync(own, Y, [olay('cleaning_inspection:x', 'Sizma')]);
    check(!!r.error && /42501|UNAUTHORIZED/.test(hataMetni(r.error)), '4a. Uyesi olunmayan isletmeye yazilamaz', hataMetni(r.error) || 'IZIN VERILDI');
    r = await newClient().rpc('sync_my_notifications', { p_tenant_id: T, p_events: [] });
    check(!!r.error, '4b. anon cagiramaz', JSON.stringify(r.data));

    // 5. Dogrulama
    const red = async (ev, ad) => {
      const x = await sync(own, T, [ev]);
      check(!!x.error, ad, 'KABUL EDILDI');
    };
    await red(olay('BOZUK ANAHTAR', 'x'), '5a. Gecersiz olay anahtari reddedilir');
    await red(olay('cleaning_inspection:t9', 'x', { domain: 'HACK' }), '5b. Gecersiz alan reddedilir');
    await red(olay('cleaning_inspection:t9', 'x', { severity: 'PANIC' }), '5c. Gecersiz onem reddedilir');
    await red(olay('cleaning_inspection:t9', 'x', { deep_link: 'javascript:alert(1)' }), '5d. Gecersiz baglanti reddedilir');
    await red(olay('cleaning_inspection:t9', ''), '5e. Bos baslik reddedilir');
    const yuz = Array.from({ length: 101 }, (_, i) => olay('cleaning_inspection:n' + i, 'x'));
    r = await sync(own, T, yuz);
    check(!!r.error, '5f. 100den fazla olay reddedilir', 'KABUL EDILDI');
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
    if (hata) failed++; else ok('6. Test verileri eksiksiz temizlendi');
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
