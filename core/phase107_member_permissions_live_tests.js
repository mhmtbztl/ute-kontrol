/**
 * LEXBNB PHASE 107 — KISI BAZINDA IZIN MATRISI (CANLI, YALNIZ TEST PROJESI)
 *
 * L-211 (kullanici M40, 27.10.2026): isletme sahibi her uyenin satis, finans ve
 * operasyon izinlerini rol varsayilaninin ustune ayri ayri acar/kapatir.
 * Sunucu zorlar: tablo politikalari ve RPC'ler ayni yetki fonksiyonlarindan
 * gecer. Arayuzde dugme gizlemek guvenlik siniri degildir; burada olculen
 * sunucunun kendisidir.
 *
 * phase107 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
 */

const { createClient } = require('@supabase/supabase-js');

const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);

let passed = 0, failed = 0;
const createdUsers = [], createdTenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const hata = r => (r && r.error) ? `${r.error.code || ''} ${r.error.message || ''}`.trim() : '';
const bugun = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
function onceki() {
  const [y, m] = bugun().split('-').map(Number);
  const p = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return { ...p, gun: d => `${p.y}-${String(p.m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

async function makeUser(label, s) {
  const email = `p107_${label}_${s}@lexbnb-e2e.test`, password = 'P107!' + s;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, client };
}

(async () => {
  console.log('LEXBNB PHASE 107 — KISI BAZINDA IZIN MATRISI (CANLI)\n');
  const s = Date.now();
  const p = onceki();
  try {
    const own = await makeUser('own', s), mgr = await makeUser('mgr', s), sls = await makeUser('sls', s), vwr = await makeUser('vwr', s), yab = await makeUser('yab', s);
    const T = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'P107 ' + s, p_full_name: 'P107' }), 'isletme').tenant_id;
    const Y = must(await yab.client.rpc('create_tenant_and_owner', { p_company_name: 'P107Y ' + s, p_full_name: 'P107Y' }), 'yabanci').tenant_id;
    createdTenants.push(T, Y);
    must(await admin.from('tenant_members').insert([
      { tenant_id: T, user_id: mgr.id, role: 'manager' }, { tenant_id: T, user_id: sls.id, role: 'sales' }, { tenant_id: T, user_id: vwr.id, role: 'viewer' }]), 'uyeler');
    const prop = must(await own.client.from('properties').insert({ tenant_id: T, name: 'P107 Villa', slug: 'p107' + s, base_price: 10000, activated_on: '2024-01-01' }).select().single(), 'mulk');
    must(await own.client.from('expenses').insert({ tenant_id: T, property_id: prop.id, expense_date: p.gun(3), category: 'Bakim', amount: 100, description: 'P107 gider' }), 'gider');
    const izin = (u, kim, perms) => u.client.rpc('set_member_permissions', { p_tenant_id: T, p_user_id: kim.id, p_permissions: perms });
    const giderEkle = u => u.client.from('expenses').insert({ tenant_id: T, property_id: prop.id, expense_date: p.gun(4), category: 'Bakim', amount: 50, description: 'P107 yazma' });
    const rezervasyon = (u, kod, g = 10) => u.client.rpc('create_booking_atomic', { p_tenant_id: T, p_property_id: prop.id, p_booking_code: kod, p_guest_name: 'P107 Misafir',
      p_guest_phone: null, p_channel: 'Direct', p_check_in: p.gun(g), p_check_out: p.gun(g + 1), p_pax: 2, p_gross_amount: 1000, p_ota_commission: 0, p_cleaning_fee: 0,
      p_discount: 0, p_net_room_revenue: 1000, p_status: 'CONFIRMED', p_notes: null });

    // 0. Giris akisinin kendi sorgusu (handleAuthenticatedSession): izin tablosu
    //    ikinci bir tenants iliskisi acarsa PostgREST gommesi PGRST201 ile duser.
    let r0 = await own.client.from('tenant_members').select('tenant_id, role, tenants(id, name, slug, plan)').eq('user_id', own.id);
    check(!r0.error && r0.data.length === 1 && r0.data[0].tenants && r0.data[0].tenants.id === T, '0. Giris sorgusu (uyelik + isletme gommesi) bozulmadi', hata(r0));

    // 1. Varsayilanlar degismedi
    let r = await sls.client.from('expenses').select('id').eq('tenant_id', T);
    check(!r.error && r.data.length === 0, '1a. Varsayilan: satis rolu finans defterini okumaz', hata(r) || JSON.stringify(r.data));
    r = await giderEkle(mgr);
    check(!r.error, '1b. Varsayilan: yonetici gider yazar', hata(r));
    r = await rezervasyon(sls, 'P107-A-' + s);
    check(!r.error, '1c. Varsayilan: satis rezervasyon yazar', hata(r));

    // 2. Yetki: yalniz sahip; sahibin izni sabit; bilinmeyen izin reddedilir
    r = await izin(mgr, sls, { 'ledger.read': true });
    check(r.error && /42501|UNAUTHORIZED/.test(hata(r)), '2a. Yonetici izin degistiremez (yalniz sahip)', hata(r) || 'kabul edildi');
    r = await yab.client.rpc('set_member_permissions', { p_tenant_id: T, p_user_id: sls.id, p_permissions: { 'ledger.read': true } });
    check(r.error && /42501|UNAUTHORIZED/.test(hata(r)), '2b. Yabanci isletme sahibi izin degistiremez', hata(r) || 'kabul edildi');
    r = await newClient().rpc('set_member_permissions', { p_tenant_id: T, p_user_id: sls.id, p_permissions: { 'ledger.read': true } });
    check(r.error && /42501|permission denied/i.test(hata(r)), '2c. Oturumsuz (anon) cagiramaz', hata(r) || 'kabul edildi');
    r = await izin(own, own, { 'ledger.read': false });
    check(r.error && /OWNER_PERMISSIONS_FIXED/.test(hata(r)), '2d. Sahibin izinleri degistirilemez', hata(r) || 'kabul edildi');
    r = await izin(own, sls, { 'tenant.manage': true });
    check(r.error && /UNKNOWN_PERMISSION/.test(hata(r)), '2e. Yonetim izni (ve bilinmeyen izin) verilemez', hata(r) || 'kabul edildi');

    // 3. Finans: satisa okuma, sonra yazma
    r = await izin(own, sls, { 'ledger.read': true });
    check(!r.error && r.data.effective['ledger.read'] === true, '3a. Sahip satisa finans okuma izni verir', hata(r));
    r = await sls.client.from('expenses').select('id').eq('tenant_id', T);
    check(!r.error && r.data.length >= 1, '3b. Izinle satis finans defterini okur', hata(r) || '0 satir');
    r = await giderEkle(sls);
    check(!!r.error, '3c. Okuma izni yazma vermez', 'gider yazildi');
    r = await izin(own, sls, { 'ledger.write': true });
    r = await giderEkle(sls);
    check(!r.error, '3d. Finans yazma izniyle satis gider yazar', hata(r));
    r = await sls.client.rpc('close_monthly_period_atomic', { p_tenant_id: T, p_year: p.y, p_month: p.m, p_snapshot: {} });
    check(!r.error, '3e. Finans yazma izni ay kapanisini da acar (RPC ayni yetkiden gecer)', hata(r));

    // 4. Yoneticiden finans yazma geri alinir; okumaya dokunulmaz
    r = await izin(own, mgr, { 'ledger.write': false });
    r = await mgr.client.from('expenses').insert({ tenant_id: T, property_id: prop.id, expense_date: bugun(), category: 'Bakim', amount: 10, description: 'P107 red' });
    check(!!r.error, '4a. Yazma izni kaldirilan yonetici gider yazamaz (yonetim rolune ragmen)', 'yazildi');
    r = await mgr.client.from('expenses').select('id').eq('tenant_id', T);
    check(!r.error && r.data.length >= 1, '4b. Yonetici finans defterini okumaya devam eder', hata(r));

    // 5. Satistan satis yazma kaldirilir: RPC de reddeder
    r = await izin(own, sls, { 'sales.write': false });
    r = await rezervasyon(sls, 'P107-B-' + s, 20);
    check(r.error && /UNAUTHORIZED|42501|yetki/i.test(hata(r)), '5a. Satis yazma izni kaldirilan kullanici rezervasyon RPC\'siyle yazamaz', 'yazildi');
    r = await sls.client.from('bookings').select('id').eq('tenant_id', T);
    check(!r.error && r.data.length >= 1, '5b. Satis verisini okumaya devam eder', hata(r));
    r = await izin(own, sls, { 'sales.read': false });
    check(!r.error && r.data.effective['sales.write'] === false && r.data.effective['sales.read'] === false, '5c. Okuma kapatilinca yazma da kapanir', JSON.stringify(r.data));
    r = await izin(own, sls, { 'sales.write': true });
    check(!r.error && r.data.effective['sales.read'] === true, '5d. Yazma acilinca okuma da acilir', JSON.stringify(r.data));

    // 6. Operasyon: izleyiciye operasyon yonetimi
    r = await vwr.client.from('cleaning_tasks').insert({ tenant_id: T, property_id: prop.id, task_date: bugun(), cleaner_name: 'P107', amount: 500, is_paid: false });
    check(!!r.error, '6a. Varsayilan: izleyici temizlik gorevi yazamaz', 'yazildi');
    r = await izin(own, vwr, { 'operations.manage': true });
    r = await vwr.client.from('cleaning_tasks').insert({ tenant_id: T, property_id: prop.id, task_date: bugun(), cleaner_name: 'P107', amount: 500, is_paid: false }).select('id').single();
    check(!r.error && r.data && r.data.id, '6b. Operasyon izniyle izleyici temizlik gorevi yazar', hata(r));
    r = await izin(own, mgr, { 'operations.manage': false });
    r = await mgr.client.from('maintenance_tickets').insert({ tenant_id: T, property_id: prop.id, category: 'Genel', title: 'P107', severity: 'LOW', status: 'OPEN' });
    check(!!r.error, '6c. Operasyon izni kaldirilan yonetici ariza acamaz', 'yazildi');

    // 7. Izin satirlarini kim gorur
    r = await sls.client.from('tenant_member_permissions').select('user_id').eq('tenant_id', T);
    check(!r.error && r.data.length >= 1 && r.data.every(x => x.user_id === sls.id), '7a. Uye yalniz kendi izinlerini gorur', hata(r) || JSON.stringify(r.data));
    r = await mgr.client.from('tenant_member_permissions').select('user_id').eq('tenant_id', T);
    check(!r.error && new Set(r.data.map(x => x.user_id)).size >= 3, '7b. Yonetim ekibin izinlerini gorur', hata(r) || JSON.stringify(r.data));
    r = await sls.client.from('tenant_member_permissions').insert({ tenant_id: T, user_id: sls.id, permission: 'ledger.write', granted: true });
    check(!!r.error, '7c. Tabloya dogrudan yazilamaz (yalniz RPC)', 'yazildi');

    // 8. Rol degisince kisi bazindaki izinler silinir
    must(await admin.from('tenant_members').update({ role: 'viewer' }).eq('tenant_id', T).eq('user_id', sls.id), 'rol');
    r = await admin.from('tenant_member_permissions').select('permission').eq('tenant_id', T).eq('user_id', sls.id);
    check(!r.error && r.data.length === 0, '8. Rol degisince o uyenin izin satirlari silinir (yeni rol yeni paket)', JSON.stringify(r.data));

    for (const u of [own, mgr, sls, vwr, yab]) { try { await u.client.auth.signOut(); } catch (e) {} }
  } catch (err) {
    no('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    console.log('\n--- TEMIZLIK ---');
    let h = false;
    for (const t of createdTenants) {
      await admin.from('financial_transactions').delete().eq('tenant_id', t);
      const { error } = await admin.from('tenants').delete().eq('id', t);
      if (error) { h = true; console.error('[FAIL] tenant: ' + error.message); }
    }
    for (const u of createdUsers) {
      const { data } = await admin.auth.admin.getUserById(u);
      if (data && data.user) { const { error } = await admin.auth.admin.deleteUser(u); if (error) { h = true; console.error('[FAIL] kullanici: ' + error.message); } }
    }
    if (h) failed++; else ok('9. Test verileri temizlendi');
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    setImmediate(() => process.exit(failed > 0 ? 1 : 0));
  }
})();
