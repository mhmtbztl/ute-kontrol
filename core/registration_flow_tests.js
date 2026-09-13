/**
 * LEXBNB REGISTRATION & LOGIN FLOW TEST SUITE
 *
 * Bu suit, diger tum suitlerin ATLADIGI yolu test eder.
 *
 * Diger suitler kullaniciyi service_role ile `admin.createUser({email_confirm:true})`
 * cagirarak aciyor. Bu, tarayicidaki gercek akisi tamamen atlar:
 *   - signUp() session dondurur mu (e-posta onayi ayari)
 *   - create_tenant_and_owner RPC'si gercek bir anon oturumla calisir mi
 *   - donen tenant_id gercekten UUID mi
 *   - o tenant_id ile mulk/rezervasyon yazilabilir mi
 *
 * Sonuc olarak 2026-09-11'de uretimde yasanan hatalarin HICBIRI testlerde
 * gorunmuyordu: kullanicilar kayit olabiliyor ama giris yapamiyordu ve
 * yerel uretilen 'ten_<timestamp>' tenant kimlikleri Postgres'e gonderilip
 * her mulk/rezervasyon eklemesi 22P02 ile dusuyordu.
 *
 * Bu suit YALNIZCA anon anahtar kullanir - yani tarayicinin gordugu dunya.
 * service_role sadece temizlik icin kullanilir.
 *
 * Suit, projenin e-posta onayi ayarini /auth/v1/settings'ten okur ve O MODA
 * gore dogru davranisi bekler. Boylece ayar degistiginde suit kirilmaz, ama
 * o moddaki yanlis davranisi yakalar:
 *   mailer_autoconfirm = false (uretim) -> signUp session DONDURMEMELI, kullanici
 *                                          once onay linkine tiklamali
 *   mailer_autoconfirm = true           -> signUp aninda session dondurmeli
 *
 * Kapsam:
 *  1. signUp, projenin onay moduna uygun davranir
 *  2. E-posta onayindan sonra hesap aktiflesir
 *  3. Onay sonrasi giris yapilabilir
 *  4. create_tenant_and_owner gercek oturumla calisir
 *  5. Donen tenant_id gercek bir UUID
 *  6. tenant_members satiri owner rolu ile olusur
 *  7. Yeni tenant ile mulk eklenebilir
 *  8. Yeni tenant ile rezervasyon eklenebilir
 *  9. Cakisan tarihli ikinci rezervasyon engellenir
 * 10. UUID olmayan tenant_id Postgres tarafindan reddedilir (22P02 regresyonu)
 * 11. Yabanci tenant_id ile yazma RLS tarafindan reddedilir
 * 12. Oturum kapaliyken tenant verisi gorunmez
 * 13. Ayni e-posta ile ikinci kayit reddedilir
 * 14. Yanlis sifreyle giris reddedilir
 * 15. Dogru sifreyle tekrar giris yapilabilir
 * 16. Sifre sifirlama istegi hesap varligini sizdirmaz
 * 17. Test verileri eksiksiz temizlenir
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Tarayicinin gordugu dunya: sadece anon anahtar.
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
// Yalnizca temizlik icin.
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let testsPassed = 0;
let testsFailed = 0;

function recordPass(name) {
  testsPassed++;
  console.log(`[PASS] ${name}`);
}

function recordFail(name, detail) {
  testsFailed++;
  console.error(`[FAIL] ${name}\n       ${detail}`);
}

function check(condition, name, detail) {
  if (condition) recordPass(name);
  else recordFail(name, detail || 'beklenen kosul saglanmadi');
}

async function runRegistrationFlowTests() {
  console.log('=============================================================================');
  console.log('LEXBNB REGISTRATION & LOGIN FLOW TESTS (anon key — tarayici yolu)');
  console.log('=============================================================================\n');

  const stamp = Date.now();
  const email = `regflow_${stamp}@lexbnb-e2e.test`;
  const pass = 'RegFlow!' + stamp;
  const company = 'Regresyon Test Isletmesi';

  let userId = null;
  let tenantId = null;

  // Projenin e-posta onayi ayarini oku. Suit iki modda da gecerli olmalidir:
  //   mailer_autoconfirm = true  -> signUp aninda session dondurur
  //   mailer_autoconfirm = false -> session DONMEZ; kullanici once maildeki
  //                                 onay linkine tiklar (uretimde beklenen hal)
  let requiresConfirmation = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    const settings = await res.json();
    requiresConfirmation = settings.mailer_autoconfirm === false;
  } catch (e) {
    console.warn('Uyari: auth ayarlari okunamadi, onay zorunlu varsayiliyor.');
    requiresConfirmation = true;
  }
  console.log(`Proje modu: e-posta onayi ${requiresConfirmation ? 'ZORUNLU' : 'KAPALI'}\n`);

  try {
    // -------------------------------------------------------------------
    console.log('--- 1. KAYIT ---');
    const { data: signUpData, error: signUpErr } = await anonClient.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: 'Regresyon Yoneticisi', company_name: company } }
    });

    if (signUpErr) {
      recordFail('1. signUp basarili', signUpErr.message);
      return;
    }
    userId = signUpData.user ? signUpData.user.id : null;

    if (requiresConfirmation) {
      // Onay zorunluyken session DONMEMELIDIR. Donuyorsa uygulama, dogrulanmamis
      // bir kullaniciya tenant kurmaya kalkar.
      check(
        !signUpData.session,
        '1. Onay zorunluyken signUp session DÖNDÜRMEZ',
        'onay acik olmasina ragmen session dondu'
      );

      // Kullanicinin maildeki onay linkine tiklamasini taklit et.
      const { error: confirmErr } = await adminClient.auth.admin.updateUserById(userId, { email_confirm: true });
      if (confirmErr) {
        recordFail('2. E-posta onayi simule edilir', confirmErr.message);
        return;
      }
      recordPass('2. E-posta onayı sonrası hesap aktifleşir');

      const { error: postConfirmErr } = await anonClient.auth.signInWithPassword({ email, password: pass });
      if (postConfirmErr) {
        recordFail('3. Onay sonrası giriş yapılabilir', postConfirmErr.message);
        return;
      }
      recordPass('3. Onay sonrası giriş yapılabilir');
    } else {
      check(
        !!signUpData.session,
        '1. Onay kapalıyken signUp anında session döndürür',
        'session gelmedi'
      );
      if (!signUpData.session) {
        console.error('\n  Session olmadan sonraki adimlar anlamsiz, suit durduruluyor.');
        return;
      }
      recordPass('2. Onay kapalı modda ek doğrulama adımı gerekmez');
      recordPass('3. Kayıt sonrası oturum hazır');
    }

    // -------------------------------------------------------------------
    console.log('\n--- 2. ATOMİK TENANT KURULUMU ---');
    const { data: rpcRes, error: rpcErr } = await anonClient.rpc('create_tenant_and_owner', {
      p_company_name: company,
      p_full_name: 'Regresyon Yoneticisi'
    });

    if (rpcErr || !rpcRes) {
      recordFail('4. create_tenant_and_owner calisir', rpcErr ? rpcErr.message : 'bos yanit');
      return;
    }
    tenantId = rpcRes.tenant_id;
    recordPass('4. create_tenant_and_owner gerçek oturumla çalışır');

    check(
      UUID_RE.test(tenantId),
      '5. Dönen tenant_id gerçek bir UUID',
      `tenant_id = "${tenantId}". UUID olmayan bir kimlik Postgres'e gonderilirse ` +
      `her yazma 22P02 ile duser.`
    );

    // -------------------------------------------------------------------
    console.log('\n--- 3. ÜYELİK KAYDI ---');
    const { data: members } = await anonClient
      .from('tenant_members')
      .select('role, tenant_id')
      .eq('tenant_id', tenantId);

    check(
      members && members.length === 1 && members[0].role === 'owner',
      '6. tenant_members satırı owner rolüyle oluşur',
      `donen: ${JSON.stringify(members)}`
    );

    // -------------------------------------------------------------------
    console.log('\n--- 4. VERİ YAZMA ---');
    const { data: prop, error: propErr } = await anonClient
      .from('properties')
      .insert({ tenant_id: tenantId, name: 'Regresyon Villa', slug: 'REG_VILLA', base_price: 4200, clean_cost: 600 })
      .select()
      .single();

    check(!propErr && prop && prop.id, '7. Yeni tenant ile mülk eklenebilir', propErr ? `${propErr.code} ${propErr.message}` : 'kayit donmedi');

    if (prop && prop.id) {
      const { error: bookErr } = await anonClient.from('bookings').insert({
        tenant_id: tenantId,
        property_id: prop.id,
        booking_code: `REG-${stamp}`,
        guest_name: 'Regresyon Misafiri',
        channel: 'Direct',
        check_in: '2027-05-01',
        check_out: '2027-05-06',
        pax: 4,
        gross_amount: 21000,
        net_room_revenue: 20100
      });
      check(!bookErr, '8. Yeni tenant ile rezervasyon eklenebilir', bookErr ? `${bookErr.code} ${bookErr.message}` : '');

      // Cakisan tarih araligi
      const { error: overlapErr } = await anonClient.from('bookings').insert({
        tenant_id: tenantId,
        property_id: prop.id,
        booking_code: `REG-${stamp}-OVERLAP`,
        guest_name: 'Cakisan Misafir',
        check_in: '2027-05-03',
        check_out: '2027-05-09',
        gross_amount: 9000
      });
      check(
        !!overlapErr,
        '9. Çakışan tarihli ikinci rezervasyon engellenir',
        'cakisan rezervasyon kabul edildi — exclude_overlapping_bookings kisiti devre disi olabilir'
      );
    }

    // -------------------------------------------------------------------
    console.log('\n--- 5. REGRESYON: UUID OLMAYAN TENANT KİMLİĞİ ---');
    const { error: badIdErr } = await anonClient
      .from('properties')
      .insert({ tenant_id: `ten_${stamp}`, name: 'Sahte Tenant', slug: 'FAKE', base_price: 100 });

    check(
      !!badIdErr,
      "10. 'ten_<timestamp>' gibi UUID olmayan tenant_id reddedilir",
      'UUID olmayan tenant_id kabul edildi'
    );
    if (badIdErr) {
      console.log(`       (beklenen sekilde reddedildi: ${badIdErr.code} ${badIdErr.message.slice(0, 60)})`);
    }

    // -------------------------------------------------------------------
    console.log('\n--- 6. TENANT İZOLASYONU ---');
    const { error: foreignErr } = await anonClient
      .from('properties')
      .insert({ tenant_id: '00000000-0000-4000-8000-000000000001', name: 'Sizinti', slug: 'LEAK', base_price: 1 });

    check(!!foreignErr, '11. Yabancı tenant_id ile yazma RLS tarafından reddedilir', 'yabanci tenant yazmasi kabul edildi');

    // -------------------------------------------------------------------
    console.log('\n--- 7. OTURUM KAPALIYKEN GÖRÜNÜRLÜK ---');
    await anonClient.auth.signOut();
    const { data: leaked } = await anonClient.from('properties').select('id').eq('tenant_id', tenantId);
    check((leaked || []).length === 0, '12. Oturum kapalıyken tenant verisi görünmez', `${(leaked || []).length} kayit sizdi`);

    // -------------------------------------------------------------------
    console.log('\n--- 8. GİRİŞ AKIŞI ---');
    // Mukerrer kayit: Supabase onay acikken BILEREK hata dondurmez; boylece
    // form, bir adresin kayitli olup olmadigini sizdiramaz (enumeration korumasi).
    // Guvenlik acisindan onemli olan sart, hata mesaji degil sudur:
    // mukerrer kayit ASLA kullanilabilir bir oturum vermemelidir.
    const { data: dupData, error: dupErr } = await anonClient.auth.signUp({ email, password: pass });
    const dupGaveSession = !!(dupData && dupData.session);
    const dupIdentities = dupData && dupData.user ? (dupData.user.identities || []).length : null;

    check(
      !dupGaveSession,
      '13. Mükerrer kayıt oturum ele geçirmeye izin vermez',
      'ayni e-posta ile ikinci kayit kullanilabilir bir session dondurdu'
    );
    console.log(
      `       (hata: ${dupErr ? dupErr.message : 'yok — enumeration korumasi'}` +
      `, identities: ${dupIdentities === null ? 'yok' : dupIdentities})`
    );

    const { error: wrongPassErr } = await anonClient.auth.signInWithPassword({ email, password: pass + 'yanlis' });
    check(!!wrongPassErr, '14. Yanlış şifreyle giriş reddedilir', 'yanlis sifre kabul edildi');

    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({ email, password: pass });
    check(
      !loginErr && loginData && loginData.user && loginData.user.email === email,
      '15. Doğru şifreyle tekrar giriş yapılabilir',
      loginErr ? loginErr.message : 'kullanici donmedi'
    );

    // -------------------------------------------------------------------
    console.log('\n--- 9. ŞİFRE SIFIRLAMA: HESAP VARLIĞI SIZMAMALI ---');
    const missing = `hicyok_${stamp}@lexbnb-e2e.test`;
    const { error: resetMissingErr } = await anonClient.auth.resetPasswordForEmail(missing, { redirectTo: 'https://lexbnb.space/' });
    const missingLeaks = resetMissingErr && /not found|no user|bulunamad/i.test(resetMissingErr.message || '');
    check(!missingLeaks, '16. Şifre sıfırlama, hesabın var olmadığını sızdırmaz', `yanit: ${resetMissingErr && resetMissingErr.message}`);

  } catch (err) {
    recordFail('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    // -------------------------------------------------------------------
    // TEMIZLIK — hatalari SESSIZCE YUTMA. Bu suit uretim projesine karsi
    // calisiyor; sizan her hesap orada kalici olarak birikir.
    // -------------------------------------------------------------------
    console.log('\n--- TEMİZLİK ---');
    let cleanupFailed = false;

    if (tenantId) {
      const { error: tErr } = await adminClient.from('tenants').delete().eq('id', tenantId);
      if (tErr) {
        cleanupFailed = true;
        console.error(`[FAIL] Tenant silinemedi (${tenantId}): ${tErr.message}`);
      }
    }

    if (userId) {
      // Supabase JS hata FIRLATMAZ, {error} dondurur. Kontrol edilmezse
      // temizlik basarisizligi gorunmez olur — 525 artik hesabin sebebi buydu.
      const { error: uErr } = await adminClient.auth.admin.deleteUser(userId);
      if (uErr) {
        cleanupFailed = true;
        console.error(
          `[FAIL] Test kullanicisi silinemedi (${email}): ${uErr.message}\n` +
          '       auth.users\'a isaret eden bir foreign key ON DELETE yan tumcesi olmadan ' +
          'tanimlanmis olabilir.\n' +
          '       Cozum: supabase/migration_phase13_user_deletion.sql'
        );
      }
    }

    if (cleanupFailed) {
      testsFailed++;
    } else {
      recordPass('17. Test verileri eksiksiz temizlendi');
    }

    // Ozet ve cikis kodu FINALLY icinde: try icindeki bir `return`
    // bunlari atlarsa suit hatali oldugu halde 0 ile cikar ve
    // kosucu tarafindan PASS sayilir.
    console.log(`TEST SUMMARY: ${testsPassed} / ${testsPassed + testsFailed} TESTS PASSED (${testsFailed} FAILED)`);
    console.log('=============================================================================\n');
    if (testsFailed > 0) process.exit(1);
  }
}

runRegistrationFlowTests();
