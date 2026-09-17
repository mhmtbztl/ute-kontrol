/**
 * LEXBNB YONETICI ANLIK GORUNTU RPC TEST SUITE
 * (get_executive_dashboard_snapshot — phase12 tanimi, phase24 duzeltmesi)
 *
 * Bu RPC'nin phase12'deki ilk hali CLAUDE.md 3.4'un uc kuralini ayni anda
 * ihlal ediyordu:
 *
 *   1) Gelir TAHAKKUK ETMIYORDU. `to_char(check_in,'YYYY-MM') = ay` ile
 *      suzuyor ve brut tutarin TAMAMINI giris ayina yaziyordu. 04-28 -> 05-03
 *      rezervasyonu Nisan'a 50.000 TL yaziyor, Mayis'a 0 yaziyordu.
 *   2) `booked_nights` GECE DEGIL REZERVASYON SAYIYORDU (COUNT(b.id)).
 *      Dolayisiyla doluluk da yanlisti.
 *   3) Kiraci, uyelik tablosundan `LIMIT 1` ile secitiliyordu. Birden fazla
 *      isletmeye uye bir kullanicinin hangi isletmenin rakamini gordugu
 *      rastgeleydi.
 *
 * phase24 ucunu de duzeltti: gece bazinda generate_series, acik p_tenant_id
 * argumani ve is_tenant_member kontrolu. Ama o duzeltmenin DAVRANISINI olcen
 * hicbir sey yoktu — `audit_remediation_tests` yalnizca SQL metnini tariyor,
 * yani fonksiyon gelecekte yanlis hesaplamaya baslasa da yesil kalirdi.
 *
 * Bu suit farki olcer. Asagidaki beklenen degerlerin hicbiri phase12 tanimiyla
 * uretilemez: 1. iddia phase12'de 85.000, 2. iddia 2, 3. iddia 0 donerdi.
 *
 * NOT: Arayuz bu RPC'yi hala cagirmiyor (CLAUDE.md 6. bolum). Suit, cagrilmaya
 * baslandiginda rakamin dogru olacagini garanti eder.
 */

const { createClient } = require('@supabase/supabase-js');

const env = require('./test_env.js').loadTestEnv();

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

// Para karsilastirmasi: RPC round(...,2) donduruyor, kurus toleransi yeterli.
const para = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

async function makeUser(label, stamp) {
  const email = `exs_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'Exs!' + stamp;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${label}: ${error.message}`);
  createdUsers.push(data.user.id);
  const client = newClient();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${label} giris: ${e2.message}`);
  return { email, client, id: data.user.id };
}

// Hatayi yuzeye cikaran cagri sarmalayicisi (CLAUDE.md 5.9).
async function anlik(client, tenantId, ay, propertyId = null) {
  const { data, error } = await client.rpc('get_executive_dashboard_snapshot', {
    p_tenant_id: tenantId, p_target_month: ay, p_property_id: propertyId
  });
  return { data, error };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB YONETICI ANLIK GORUNTU RPC TESTLERI');
  console.log('=============================================================================\n');

  const stamp = Date.now();
  let owner, yabanci;

  try {
    owner = await makeUser('own', stamp);
    const { data: t, error: te } = await owner.client.rpc('create_tenant_and_owner', {
      p_company_name: 'Yonetici Anlik ' + stamp, p_full_name: 'T'
    });
    if (te) throw new Error('tenant: ' + te.message);
    createdTenants.push(t.tenant_id);
    const TID = t.tenant_id;

    // Mulkler Ocak'ta aktif edildi; Nisan/Mayis'ta tam ay musait olmali.
    const mulkler = {};
    for (const anahtar of ['a', 'b']) {
      const { data: p, error: pe } = await owner.client.from('properties').insert({
        tenant_id: TID, name: 'Villa ' + anahtar.toUpperCase(),
        slug: 'villa-' + anahtar + '-' + stamp,
        base_price: 10000, activated_on: '2026-01-01'
      }).select().single();
      if (pe) throw new Error('mulk ' + anahtar + ': ' + pe.message);
      mulkler[anahtar] = p.id;
    }

    // Villa A — 04-28 -> 05-03: 5 gece. Brut 50.000, indirim 5.000.
    //   Taninan gelir 45.000 / 5 = 9.000/gece  ->  Nisan 27.000, Mayis 18.000
    //   OTA komisyonu 7.500 -> Nisan payi 4.500 (GELIRDEN DUSULMEZ, GIDER)
    const { error: b1e } = await owner.client.from('bookings').insert({
      tenant_id: TID, property_id: mulkler.a, booking_code: 'EXS-1', guest_name: 'Misafir 1',
      check_in: '2026-04-28', check_out: '2026-05-03',
      gross_amount: 50000, discount: 5000, ota_commission: 7500
    });
    if (b1e) throw new Error('rezervasyon 1: ' + b1e.message);

    // Villa B — 04-28 -> 06-02: 35 gece (Nisan 3 + Mayis 31 + Haziran 1).
    //   Brut 35.000 -> 1.000/gece. Mayis'i BASTAN SONA kapsiyor: phase12'nin
    //   "giris ayina yaz" mantiginda bu rezervasyon Mayis'ta HIC gorunmuyordu.
    const { error: b2e } = await owner.client.from('bookings').insert({
      tenant_id: TID, property_id: mulkler.b, booking_code: 'EXS-2', guest_name: 'Misafir 2',
      check_in: '2026-04-28', check_out: '2026-06-02', gross_amount: 35000
    });
    if (b2e) throw new Error('rezervasyon 2: ' + b2e.message);

    // Iptal edilmis rezervasyon hicbir rakama girmemeli.
    const { error: b3e } = await owner.client.from('bookings').insert({
      tenant_id: TID, property_id: mulkler.a, booking_code: 'EXS-3', guest_name: 'Iptal',
      check_in: '2026-05-10', check_out: '2026-05-12',
      gross_amount: 99999, status: 'CANCELLED'
    });
    if (b3e) throw new Error('rezervasyon 3: ' + b3e.message);

    const { error: ee } = await owner.client.from('expenses').insert({
      tenant_id: TID, category: 'Bakim', amount: 9000,
      expense_date: '2026-04-15', description: 'nisan bakim'
    });
    if (ee) throw new Error('gider: ' + ee.message);

    // -----------------------------------------------------------------------
    console.log('--- 1. TAHAKKUK: GELIR GECELERE BOLUNUR ---');
    const { data: nisan, error: ne } = await anlik(owner.client, TID, '2026-04');
    if (ne) throw new Error('Nisan anlik goruntu: ' + ne.message);

    check(para(nisan.total_revenue, 30000),
      '1. Nisan cirosu gece bazinda 30.000 TL (27.000 + 3.000)',
      'total_revenue=' + nisan.total_revenue +
      ' — 85.000 ise tahakkuk yok, tutarin tamami giris ayina yazilmis');

    check(Number(nisan.booked_nights) === 6,
      '2. booked_nights GECE sayar (3 + 3 = 6)',
      'booked_nights=' + nisan.booked_nights +
      ' — 2 ise rezervasyon sayiliyor, gece degil');

    const { data: mayis, error: me } = await anlik(owner.client, TID, '2026-05');
    if (me) throw new Error('Mayis anlik goruntu: ' + me.message);

    check(para(mayis.total_revenue, 49000),
      '3. Mayis cirosu 49.000 TL (18.000 + 31.000)',
      'total_revenue=' + mayis.total_revenue +
      ' — 0 ise giris ayi disindaki aylar hic gorunmuyor');

    check(Number(mayis.booked_nights) === 33,
      '4. Mayis 33 gece (2 + 31) — ayi bastan sona kapsayan rezervasyon dahil',
      'booked_nights=' + mayis.booked_nights);

    const { data: haziran, error: he } = await anlik(owner.client, TID, '2026-06');
    if (he) throw new Error('Haziran anlik goruntu: ' + he.message);

    check(para(haziran.total_revenue, 1000) && Number(haziran.booked_nights) === 1,
      '5. Haziran yalnizca kendi tek gecesini alir (1.000 TL)',
      'revenue=' + haziran.total_revenue + ' nights=' + haziran.booked_nights);

    const toplam = Number(nisan.total_revenue) + Number(mayis.total_revenue) + Number(haziran.total_revenue);
    check(para(toplam, 80000),
      '6. Aylik cirolarin toplami gercek ciroya esit (cift sayim yok)',
      'toplam=' + toplam + ' (beklenen 80.000 = 45.000 + 35.000)');

    // -----------------------------------------------------------------------
    console.log('\n--- 2. USALI SINIFLANDIRMASI (CLAUDE.md 3.4) ---');
    check(para(nisan.total_expenses, 13500),
      '7. OTA komisyonu gidere yazilir (9.000 elle + 4.500 komisyon payi)',
      'total_expenses=' + nisan.total_expenses +
      ' — 9.000 ise komisyon hic sayilmiyor');

    check(para(nisan.net_profit, 16500),
      '8. Net kar = ciro - gider (30.000 - 13.500)',
      'net_profit=' + nisan.net_profit);

    check(!para(nisan.total_revenue, 25500),
      '9. Komisyon CIRODAN DUSULMEZ (ciro brut tabanli kalir)',
      'total_revenue=' + nisan.total_revenue + ' — 25.500 ise komisyon gelirden dusulmus');

    // -----------------------------------------------------------------------
    console.log('\n--- 3. IPTAL VE DOLULUK ---');
    check(para(mayis.total_revenue, 49000) && Number(mayis.booked_nights) === 33,
      '10. Iptal edilmis rezervasyon ciroya da geceye de girmez',
      'revenue=' + mayis.total_revenue + ' nights=' + mayis.booked_nights);

    // Nisan 30 gun x 2 mulk = 60 musait gece; 6 satilmis -> %10
    check(Number(nisan.available_nights) === 60,
      '11. Musait gece ayin GERCEK gun sayisindan uretilir (30 x 2 = 60)',
      'available_nights=' + nisan.available_nights);

    check(para(nisan.occupancy, 10),
      '12. Doluluk = 6 / 60 = %10',
      'occupancy=' + nisan.occupancy);

    check(Number(mayis.available_nights) === 62 && para(mayis.occupancy, 53.23),
      '13. Mayis 31 gunluk paydayi kullanir (33 / 62 = %53,23)',
      'available=' + mayis.available_nights + ' occupancy=' + mayis.occupancy);

    // -----------------------------------------------------------------------
    console.log('\n--- 4. HESAPLANAMAYAN YERDE RAKAM UYDURULMAZ (3.6) ---');
    const { data: once, error: oe } = await anlik(owner.client, TID, '2025-12');
    if (oe) throw new Error('2025-12 anlik goruntu: ' + oe.message);

    check(once && once.occupancy === null && Number(once.available_nights) === 0,
      '14. Mulk daha aktif degilken doluluk NULL doner, 0 ya da 100 uydurulmaz',
      'occupancy=' + (once && once.occupancy) + ' available=' + (once && once.available_nights));

    // -----------------------------------------------------------------------
    console.log('\n--- 5. MULK FILTRESI ---');
    const { data: sadeceA, error: ae } = await anlik(owner.client, TID, '2026-04', mulkler.a);
    if (ae) throw new Error('mulk filtresi: ' + ae.message);

    check(para(sadeceA.total_revenue, 27000) && Number(sadeceA.booked_nights) === 3
          && Number(sadeceA.available_nights) === 30,
      '15. Tek mulk suzuldugunde hem ciro hem payda o mulke daralir',
      'revenue=' + sadeceA.total_revenue + ' nights=' + sadeceA.booked_nights +
      ' available=' + sadeceA.available_nights);

    // -----------------------------------------------------------------------
    console.log('\n--- 6. YETKI VE GIRDI DOGRULAMASI (phase24) ---');
    yabanci = await makeUser('yad', stamp);
    const { data: yt, error: yte } = await yabanci.client.rpc('create_tenant_and_owner', {
      p_company_name: 'Yabanci Isletme ' + stamp, p_full_name: 'Y'
    });
    if (yte) throw new Error('yabanci tenant: ' + yte.message);
    createdTenants.push(yt.tenant_id);

    const { data: sizinti, error: ye } = await anlik(yabanci.client, TID, '2026-04');
    check(!!ye && !sizinti,
      '16. Baska isletmenin sahibi bu isletmenin anlik goruntusunu ALAMAZ',
      ye ? ('beklenmedik veri dondu: ' + JSON.stringify(sizinti))
         : 'IZIN VERILDI — yabanci kiraci ciro ve kar rakamlarini okudu');

    // phase12'de kiraci uyelikten LIMIT 1 ile secitiliyordu: yabanci cagri
    // hata vermek yerine KENDI isletmesinin rakamini dondururdu.
    check(!sizinti || sizinti.tenant_id !== yt.tenant_id,
      '17. Kiraci acik argumandan gelir, uyelikten LIMIT 1 ile secilmez',
      'cagri yabanci kullanicinin KENDI isletmesine dustu: ' + JSON.stringify(sizinti));

    const { error: fe } = await anlik(owner.client, TID, '2026-13');
    check(!!fe, '18. Gecersiz ay formati reddedilir (2026-13)', 'kabul edildi');

    const { error: fe2 } = await anlik(owner.client, TID, 'Nisan');
    check(!!fe2, '19. Ay argumani serbest metin kabul etmez', 'kabul edildi');

    const { data: ymulk, error: yme } = await yabanci.client.from('properties').insert({
      tenant_id: yt.tenant_id, name: 'Yabanci Villa',
      slug: 'yabanci-' + stamp, base_price: 1000
    }).select().single();
    if (yme) throw new Error('yabanci mulk: ' + yme.message);

    const { error: pe2 } = await anlik(owner.client, TID, '2026-04', ymulk.id);
    check(!!pe2,
      '20. Baska isletmenin mulk id si filtre olarak kullanilamaz',
      'kabul edildi — mulk id sinin varligi sizdirilabilir');

    const anon = newClient();
    const { error: anone } = await anlik(anon, TID, '2026-04');
    check(!!anone && /permission denied|UNAUTHORIZED/i.test(anone.message || ''),
      '21. anon rolu fonksiyonu hic calistiramaz (7. bolum)',
      anone ? anone.message : 'anon cagirabildi');

  } catch (err) {
    no('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    console.log('\n--- TEMIZLIK ---');
    let hata = false;
    for (const c of [owner, yabanci]) {
      if (c && c.client) { try { await c.client.auth.signOut(); } catch (e) {} }
    }
    async function retry(l, fn) {
      for (let a = 1; a <= 3; a++) {
        const { error } = await fn();
        if (!error) return true;
        if (a === 3) { console.error(`[FAIL] ${l}: ${error.message}`); return false; }
        await new Promise(r => setTimeout(r, a * 400));
      }
      return false;
    }
    for (const t of createdTenants) if (!await retry('Tenant ' + t, () => admin.from('tenants').delete().eq('id', t))) hata = true;
    for (const u of createdUsers) if (!await retry('Kullanici ' + u, () => admin.auth.admin.deleteUser(u))) hata = true;

    const { data: after } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const kalan = (after ? after.users : []).filter(u => createdUsers.includes(u.id));
    if (kalan.length) { hata = true; console.error(`[FAIL] ${kalan.length} test hesabi duruyor`); }

    if (hata) failed++; else ok('22. Test verileri eksiksiz temizlendi');

    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
