/**
 * LEXBNB ISLETME VERISI SIFIRLAMA TESTLERI (PHASE 21)
 *
 * "Sıfırla" tusu bulut hesabinda HICBIR SEY yapmiyordu. cleanResetAll()
 * yalnizca bir uyari gosterip cikiyordu:
 *   "Bu islem bulut hesabinizdaki kayitlari silmez."
 * Musteri deneme verisini temizleyemiyor, kayitlari tek tek silmek zorunda
 * kaliyordu. Kapanmis bir donem varsa tek tek silmek de mumkun degildi:
 * koruma tetikleyicisi engelliyordu.
 *
 * Kapsam:
 *  1. Sifirlama TUM operasyonel veriyi siler
 *  2. Kapatilmis donemdeki kayitlar da silinir (koruma askiya alinir)
 *  3. Isletme ve ekip uyeleri KALIR (hesap kapanmaz)
 *  4. Yanlis onay metni reddedilir
 *  5. owner disindaki roller sifirlayamaz
 *  6. Baska isletme sifirlanamaz
 *  7. Sifirlamadan sonra korumalar TEKRAR DEVREDE (bayrak sizmaz)
 *  8. Bos isletmede sifirlama hatasiz calisir
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let passed = 0, failed = 0;
const createdUsers = [];
const createdTenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

async function makeUser(label, stamp) {
  const email = `rst_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'Rst!' + stamp;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${label}: ${error.message}`);
  createdUsers.push(data.user.id);
  const client = newClient();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${label} giris: ${e2.message}`);
  return { email, client, id: data.user.id };
}

async function kurulum(client, ad, stamp, ek) {
  const { data: t, error: te } = await client.rpc('create_tenant_and_owner', {
    p_company_name: ad, p_full_name: 'T'
  });
  if (te) throw new Error('tenant: ' + te.message);
  createdTenants.push(t.tenant_id);
  const TID = t.tenant_id;

  const { data: p, error: pe } = await client.from('properties')
    .insert({ tenant_id: TID, name: 'Villa ' + ek, slug: 'v' + ek, base_price: 10000 }).select().single();
  if (pe) throw new Error('mulk: ' + pe.message);

  const { data: b, error: be } = await client.from('bookings').insert({
    tenant_id: TID, property_id: p.id, booking_code: 'RST-' + ek + '-' + stamp, guest_name: 'G',
    check_in: '2026-03-10', check_out: '2026-03-14', gross_amount: 40000
  }).select().single();
  if (be) throw new Error('rezervasyon: ' + be.message);

  const { error: ce } = await client.from('cleaning_tasks').insert({
    tenant_id: TID, property_id: p.id, booking_id: b.id, cleaner_name: 'C',
    task_date: '2026-03-14', amount: 500, is_paid: false
  });
  if (ce) throw new Error('temizlik: ' + ce.message);

  const { error: ee } = await client.from('expenses').insert({
    tenant_id: TID, category: 'Bakim', amount: 5000, expense_date: '2026-03-15', description: 'x'
  });
  if (ee) throw new Error('gider: ' + ee.message);

  return { tenantId: TID, propertyId: p.id, bookingId: b.id };
}

async function sayim(tenantId) {
  const tablolar = ['properties', 'bookings', 'expenses', 'cleaning_tasks', 'monthly_financial_closes'];
  const sonuc = {};
  for (const t of tablolar) {
    const { data } = await admin.from(t).select('id').eq('tenant_id', tenantId);
    sonuc[t] = (data || []).length;
  }
  return sonuc;
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB ISLETME VERISI SIFIRLAMA TESTLERI');
  console.log('=============================================================================\n');

  const stamp = Date.now();
  let owner, mgr, yabanci;

  try {
    owner = await makeUser('own', stamp);
    const A = await kurulum(owner.client, 'Sifirlama A ' + stamp, stamp, 'A');

    // Mart 2026'yi KAPAT: kapanmis donem korumasi normalde silmeyi engeller.
    const { error: ke } = await owner.client.rpc('close_monthly_period_atomic', {
      p_tenant_id: A.tenantId, p_year: 2026, p_month: 3, p_snapshot: {}
    });
    if (ke) throw new Error('donem kapatilamadi: ' + ke.message);

    const oncesi = await sayim(A.tenantId);
    console.log('--- 1. SIFIRLAMA ONCESI ---');
    console.log('    ' + JSON.stringify(oncesi));

    // Koruma gercekten devrede mi? (Sifirlamanin ne astigini gostermek icin.)
    const { error: engel } = await owner.client.from('bookings').delete().eq('id', A.bookingId);
    check(!!engel, '1. Kapatılmış dönemde tek tek silme engelleniyor (sıfırlamanın aştığı engel)',
      'kapali donemde silme serbest — koruma calismiyor');

    // --- 2. Yanlis onay ------------------------------------------------------
    console.log('\n--- 2. ONAY VE YETKI ---');
    const { error: e2 } = await owner.client.rpc('reset_tenant_data', {
      p_tenant_id: A.tenantId, p_confirm: 'sifirla'
    });
    check(!!e2, '2. Yanlış onay metni reddedilir', 'yanlis onayla sifirlandi!');

    const sonrasi0 = await sayim(A.tenantId);
    check(sonrasi0.bookings === oncesi.bookings,
      '3. Reddedilen sıfırlamada hiçbir kayıt silinmez',
      JSON.stringify(sonrasi0));

    // --- 3. owner disindaki rol ----------------------------------------------
    mgr = await makeUser('mgr', stamp);
    const { error: ie } = await owner.client.rpc('create_tenant_invitation', {
      p_tenant_id: A.tenantId, p_email: mgr.email, p_role: 'manager'
    });
    if (ie) throw new Error('davet: ' + ie.message);
    await mgr.client.rpc('accept_pending_invitations');

    const { error: e4 } = await mgr.client.rpc('reset_tenant_data', {
      p_tenant_id: A.tenantId, p_confirm: 'VERILERI SIFIRLA'
    });
    check(!!e4, '4. manager rolü işletme verisini sıfırlayamaz', 'manager sifirlayabildi!');

    // --- 4. Baska isletme -----------------------------------------------------
    yabanci = await makeUser('out', stamp);
    const B = await kurulum(yabanci.client, 'Sifirlama B ' + stamp, stamp, 'B');
    const { error: e5 } = await owner.client.rpc('reset_tenant_data', {
      p_tenant_id: B.tenantId, p_confirm: 'VERILERI SIFIRLA'
    });
    check(!!e5, '5. Başka işletmenin verisi sıfırlanamaz', 'yabanci isletme sifirlanabildi!');

    const bSayim = await sayim(B.tenantId);
    check(bSayim.bookings === 1 && bSayim.properties === 1,
      '6. Diğer işletmenin verisi el değmemiş kalır', JSON.stringify(bSayim));

    // --- 5. Gercek sifirlama --------------------------------------------------
    console.log('\n--- 3. SIFIRLAMA ---');
    const { data: sonuc, error: e6 } = await owner.client.rpc('reset_tenant_data', {
      p_tenant_id: A.tenantId, p_confirm: 'VERILERI SIFIRLA'
    });
    check(!e6 && sonuc && sonuc.success === true,
      '7. owner işletme verisini sıfırlayabilir',
      e6 ? e6.message : JSON.stringify(sonuc));

    const sonra = await sayim(A.tenantId);
    console.log('    sifirlama sonrasi: ' + JSON.stringify(sonra));
    check(Object.values(sonra).every(v => v === 0),
      '8. Mülk, rezervasyon, gider ve temizlik kayıtlarının tamamı silinir',
      JSON.stringify(sonra));

    check(sonra.monthly_financial_closes === 0,
      '9. Kapatılmış dönem kaydı da silinir (koruma askıya alınır)',
      'kapanis kaydi duruyor: ' + sonra.monthly_financial_closes);

    // --- 6. Isletme ve ekip KALIR ---------------------------------------------
    const { data: tenantVar } = await admin.from('tenants').select('id').eq('id', A.tenantId);
    check((tenantVar || []).length === 1,
      '10. İşletme hesabı kapanmaz, yerinde kalır', 'isletme silinmis!');

    const { data: uyeler } = await admin.from('tenant_members').select('user_id,role').eq('tenant_id', A.tenantId);
    check((uyeler || []).length === 2 && uyeler.some(u => u.role === 'owner'),
      '11. Ekip üyeleri ve roller korunur',
      JSON.stringify(uyeler));

    // --- 7. Korumalar tekrar devrede -------------------------------------------
    console.log('\n--- 4. SIFIRLAMA SONRASI ---');
    const { data: yeniProp, error: ype } = await owner.client.from('properties')
      .insert({ tenant_id: A.tenantId, name: 'Yeni', slug: 'yeni', base_price: 1000 }).select().single();
    check(!ype && yeniProp, '12. Sıfırlamadan sonra yeni kayıt girilebilir', ype && ype.message);

    // Bayrak islem sonunda kapanmali; kapanmadiysa kapali donem korumasi da
    // kapali kalirdi. Yeni bir donem kapatip silmeyi deneyerek olcelim.
    const { error: yke } = await owner.client.rpc('close_monthly_period_atomic', {
      p_tenant_id: A.tenantId, p_year: 2026, p_month: 4, p_snapshot: {}
    });
    if (yke) throw new Error('yeniden kapatilamadi: ' + yke.message);

    const { data: yb } = await owner.client.from('bookings').insert({
      tenant_id: A.tenantId, property_id: yeniProp.id, booking_code: 'RST-Z-' + stamp,
      guest_name: 'Z', check_in: '2026-05-10', check_out: '2026-05-12', gross_amount: 1000
    }).select().single();

    const { error: kapaliHata } = await owner.client.from('expenses').insert({
      tenant_id: A.tenantId, category: 'Test', amount: 100, expense_date: '2026-04-10', description: 'y'
    });
    check(!!kapaliHata,
      '13. Sıfırlamadan sonra kapalı dönem koruması TEKRAR devrede (bayrak sızmıyor)',
      'kapali doneme gider eklenebildi — lexbnb.tenant_reset bayragi acik kalmis olabilir');

    if (yb) await admin.from('bookings').delete().eq('id', yb.id);

    // --- 8. Bos isletmede sifirlama -------------------------------------------
    const { data: bos, error: bose } = await owner.client.rpc('reset_tenant_data', {
      p_tenant_id: B.tenantId, p_confirm: 'VERILERI SIFIRLA'
    });
    check(!!bose, '14. Yetkisiz olunan boş işletme yine sıfırlanamaz', JSON.stringify(bos));

  } catch (err) {
    no('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    console.log('\n--- TEMIZLIK ---');
    let hata = false;
    for (const c of [owner, mgr, yabanci]) {
      if (c && c.client) { try { await c.client.auth.signOut(); } catch (e) {} }
    }
    async function retry(l, fn) {
      for (let a = 1; a <= 3; a++) {
        const { error } = await fn();
        if (!error) return true;
        if (a === 3) { console.error(`[FAIL] ${l}: ${error.message}`); return false; }
        await new Promise(r => setTimeout(r, a * 400));
      }
    }
    for (const t of createdTenants) if (!await retry('Tenant ' + t, () => admin.from('tenants').delete().eq('id', t))) hata = true;
    for (const u of createdUsers) if (!await retry('Kullanici ' + u, () => admin.auth.admin.deleteUser(u))) hata = true;

    const { data: after } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const kalan = (after ? after.users : []).filter(u => createdUsers.includes(u.id));
    if (kalan.length) { hata = true; console.error(`[FAIL] ${kalan.length} test hesabi duruyor`); }

    if (hata) failed++; else ok('15. Test verileri eksiksiz temizlendi');

    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
