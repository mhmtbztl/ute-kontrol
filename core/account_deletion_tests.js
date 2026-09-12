/**
 * LEXBNB ACCOUNT DELETION TEST SUITE (PHASE 18)
 *
 * KVKK/GDPR "unutulma hakki" akisini tarayicinin gordugu dunyadan (anon key)
 * test eder. service_role yalnizca kurulum ve dogrulama icin kullanilir.
 *
 * En kritik senaryo: bir kullanici hesabini silerken YALNIZCA tek sahibi
 * oldugu isletmeler yok olmali. Ortak sahipli bir isletmenin silinmesi,
 * baska bir musterinin verisini yok etmek demektir.
 *
 * Kapsam:
 *  1. Etki onizlemesi tek sahipli isletmeyi "silinecek" olarak gosterir
 *  2. Onizleme mulk ve rezervasyon sayilarini dogru verir
 *  3. Ortak sahipli isletme "ayrilinacak" listesinde, "silinecek"te DEGIL
 *  4. Yanlis onay metni reddedilir
 *  5. Bos onay reddedilir
 *  6. Dogru onayla hesap silinir
 *  7. Silinen kullanici artik giris yapamaz
 *  8. Tek sahipli isletme ve TUM verisi gitti
 *  9. Ortak sahipli isletme HAYATTA ve diger sahip hala erisebiliyor
 * 10. Silinen kullanicinin uyeligi kalkti
 * 11. O adrese bekleyen davetler iptal edildi
 * 12. Oturumsuz (anon) cagri reddedilir
 * 13. Test verileri eksiksiz temizlenir
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const admin = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function newClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

let testsPassed = 0, testsFailed = 0;
const createdUserIds = [];
const createdTenantIds = [];

function recordPass(n) { testsPassed++; console.log(`[PASS] ${n}`); }
function recordFail(n, d) { testsFailed++; console.error(`[FAIL] ${n}\n       ${d}`); }
function check(c, n, d) { if (c) recordPass(n); else recordFail(n, d || 'beklenen kosul saglanmadi'); }

async function makeUser(label, stamp) {
  const email = `del_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'Del!' + stamp;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: 'Del ' + label }
  });
  if (error) throw new Error(`${label}: ${error.message}`);
  createdUserIds.push(data.user.id);
  const client = newClient();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${label} giris: ${e2.message}`);
  return { email, password, client, id: data.user.id };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB ACCOUNT DELETION TESTS (anon key — tarayici yolu)');
  console.log('=============================================================================\n');

  const stamp = Date.now();
  let victim, partner;
  let soleTenant = null, sharedTenant = null;

  try {
    console.log('--- KURULUM ---');
    victim = await makeUser('victim', stamp);
    partner = await makeUser('partner', stamp);

    // A) Yalnizca victim'in sahibi oldugu isletme
    const { data: t1, error: e1 } = await victim.client.rpc('create_tenant_and_owner', {
      p_company_name: 'Tek Sahipli Isletme', p_full_name: 'Del victim'
    });
    if (e1) throw new Error('tek sahipli tenant: ' + e1.message);
    soleTenant = t1.tenant_id;
    createdTenantIds.push(soleTenant);

    const { data: prop } = await victim.client.from('properties')
      .insert({ tenant_id: soleTenant, name: 'Silinecek Villa', slug: 'SIL_VILLA', base_price: 4000 })
      .select().single();
    await victim.client.from('bookings').insert({
      tenant_id: soleTenant, property_id: prop.id, booking_code: 'DEL-1', guest_name: 'Misafir',
      check_in: '2027-07-01', check_out: '2027-07-05', gross_amount: 16000
    });

    // B) partner'in kurdugu, victim'in de OWNER oldugu ortak isletme
    const { data: t2, error: e2 } = await partner.client.rpc('create_tenant_and_owner', {
      p_company_name: 'Ortak Sahipli Isletme', p_full_name: 'Del partner'
    });
    if (e2) throw new Error('ortak tenant: ' + e2.message);
    sharedTenant = t2.tenant_id;
    createdTenantIds.push(sharedTenant);

    await partner.client.rpc('create_tenant_invitation', {
      p_tenant_id: sharedTenant, p_email: victim.email, p_role: 'manager'
    });
    await victim.client.rpc('accept_pending_invitations');
    // victim'i owner yap -> iki owner'li isletme
    await partner.client.from('tenant_members').update({ role: 'owner' })
      .eq('tenant_id', sharedTenant).eq('user_id', victim.id);

    await partner.client.from('properties')
      .insert({ tenant_id: sharedTenant, name: 'Kalacak Villa', slug: 'KAL_VILLA', base_price: 5000 });

    // C) victim'e bekleyen bir davet birak
    const { data: t3 } = await partner.client.rpc('create_tenant_and_owner', {
      p_company_name: 'Ucuncu Isletme', p_full_name: 'Del partner'
    });
    createdTenantIds.push(t3.tenant_id);
    await partner.client.rpc('create_tenant_invitation', {
      p_tenant_id: t3.tenant_id, p_email: victim.email, p_role: 'viewer'
    });

    // -------------------------------------------------------------------
    console.log('\n--- 1. ETKİ ÖNİZLEMESİ ---');
    const { data: impact, error: impErr } = await victim.client.rpc('get_account_deletion_impact');
    if (impErr) { recordFail('1. Etki önizlemesi çalışır', impErr.message); return; }

    const toDelete = impact.tenants_to_delete || [];
    const toLeave = impact.tenants_to_leave || [];

    check(toDelete.length === 1 && toDelete[0].id === soleTenant,
      '1. Tek sahipli işletme "silinecek" olarak listelenir', JSON.stringify(toDelete));

    check(toDelete[0] && toDelete[0].properties === 1 && toDelete[0].bookings === 1,
      '2. Önizleme mülk ve rezervasyon sayılarını doğru verir', JSON.stringify(toDelete[0]));

    check(toLeave.some(t => t.id === sharedTenant) && !toDelete.some(t => t.id === sharedTenant),
      '3. Ortak sahipli işletme "silinecek"te DEĞİL', JSON.stringify({ toLeave, toDelete }));

    // -------------------------------------------------------------------
    console.log('\n--- 2. ONAY KORUMASI ---');
    const { error: wrongErr } = await victim.client.rpc('delete_my_account', { p_confirmation: 'evet sil' });
    check(!!wrongErr, '4. Yanlış onay metni reddedilir', 'yanlis onay kabul edildi!');

    const { error: emptyErr } = await victim.client.rpc('delete_my_account', { p_confirmation: '' });
    check(!!emptyErr, '5. Boş onay reddedilir', 'bos onay kabul edildi!');

    // Hala var oldugunu dogrula
    const { data: stillThere } = await admin.auth.admin.getUserById(victim.id);
    check(!!(stillThere && stillThere.user), '5b. Reddedilen denemeler hesabı silmedi', 'hesap yanlislikla silindi!');

    // -------------------------------------------------------------------
    console.log('\n--- 3. SİLME ---');
    const { data: delRes, error: delErr } = await victim.client.rpc('delete_my_account', {
      p_confirmation: 'HESABIMI SIL'
    });
    check(!delErr && delRes && delRes.deleted === true, '6. Doğru onayla hesap silinir',
      delErr ? delErr.message : JSON.stringify(delRes));

    const { error: loginErr } = await newClient().auth.signInWithPassword({
      email: victim.email, password: victim.password
    });
    check(!!loginErr, '7. Silinen kullanıcı artık giriş yapamaz', 'silinen kullanici giris yapabildi!');

    // -------------------------------------------------------------------
    console.log('\n--- 4. VERİ SONUÇLARI ---');
    const { count: soleCount } = await admin.from('tenants')
      .select('*', { count: 'exact', head: true }).eq('id', soleTenant);
    check(soleCount === 0, '8. Tek sahipli işletme ve tüm verisi silindi', `${soleCount} kayit kaldi`);

    const { count: propCount } = await admin.from('properties')
      .select('*', { count: 'exact', head: true }).eq('tenant_id', soleTenant);
    const { count: bookCount } = await admin.from('bookings')
      .select('*', { count: 'exact', head: true }).eq('tenant_id', soleTenant);
    check(propCount === 0 && bookCount === 0, '8b. Bağlı mülk ve rezervasyonlar da gitti',
      `mulk=${propCount} rezervasyon=${bookCount}`);

    const { count: sharedCount } = await admin.from('tenants')
      .select('*', { count: 'exact', head: true }).eq('id', sharedTenant);
    const { data: partnerSees } = await partner.client.from('properties')
      .select('id').eq('tenant_id', sharedTenant);
    check(sharedCount === 1 && (partnerSees || []).length === 1,
      '9. Ortak sahipli işletme HAYATTA, diğer sahip erişebiliyor',
      `tenant=${sharedCount} partnerin gordugu mulk=${(partnerSees || []).length}`);

    const { count: memCount } = await admin.from('tenant_members')
      .select('*', { count: 'exact', head: true }).eq('user_id', victim.id);
    check(memCount === 0, '10. Silinen kullanıcının üyelikleri kalktı', `${memCount} uyelik kaldi`);

    const { data: pend } = await partner.client.rpc('get_tenant_invitations', { p_tenant_id: t3.tenant_id });
    check(!(pend || []).some(i => i.email === victim.email),
      '11. Bekleyen davetler iptal edildi', JSON.stringify(pend));

    // -------------------------------------------------------------------
    console.log('\n--- 5. YETKİSİZ ÇAĞRI ---');
    const anon = newClient();
    const { error: anonErr } = await anon.rpc('delete_my_account', { p_confirmation: 'HESABIMI SIL' });
    check(!!anonErr, '12. Oturumsuz çağrı reddedilir', 'anon delete_my_account calistirabildi!');

  } catch (err) {
    recordFail('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    console.log('\n--- TEMİZLİK ---');
    let failed = false;

    for (const c of [victim, partner]) {
      if (c && c.client) { try { await c.client.auth.signOut(); } catch (e) {} }
    }

    async function retry(label, fn) {
      for (let a = 1; a <= 3; a++) {
        const { error } = await fn();
        if (!error) return true;
        if (a === 3) { console.error(`[FAIL] ${label}: ${error.message}`); return false; }
        await new Promise(r => setTimeout(r, a * 400));
      }
    }

    for (const t of createdTenantIds) {
      if (!await retry('Tenant ' + t, () => admin.from('tenants').delete().eq('id', t))) failed = true;
    }
    for (const u of createdUserIds) {
      const { data: exists } = await admin.auth.admin.getUserById(u);
      if (!exists || !exists.user) continue;   // zaten silinmis (test hedefi)
      if (!await retry('Kullanici ' + u, () => admin.auth.admin.deleteUser(u))) failed = true;
    }

    const { data: after } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const survivors = (after ? after.users : []).filter(u => createdUserIds.includes(u.id));
    if (survivors.length) {
      failed = true;
      console.error(`[FAIL] ${survivors.length} test hesabi hala duruyor: ${survivors.map(u => u.email).join(', ')}`);
    }

    if (failed) testsFailed++; else recordPass('13. Test verileri eksiksiz temizlendi');

    // Ozet ve cikis kodu FINALLY icinde: try icindeki bir `return`
    // bunlari atlarsa suit hatali oldugu halde 0 ile cikar ve
    // kosucu tarafindan PASS sayilir.
    console.log(`TEST SUMMARY: ${testsPassed} / ${testsPassed + testsFailed} TESTS PASSED (${testsFailed} FAILED)`);
    console.log('=============================================================================\n');
    if (testsFailed > 0) process.exit(1);
  }
}

run();
