/**
 * PHASE 31 — CAPRAZ KIRACI IZOLASYONU VE ANON KAPISI (CANLI DAVRANIS TESTI)
 *
 * phase31 alti yeni tablo aciyor ve bunlar RPC ile degil, dogrudan
 * PostgREST uzerinden yaziliyor (semadaki baskin kalip: cleaning_tasks,
 * expenses, bookings ayni sekilde). Yani tek koruma katmani RLS'tir ve
 * RLS'in gercekten tuttugunu KAYNAK TARAMASI KANITLAYAMAZ — politikanin
 * dosyada yazili olmasi, veritabaninda etkili oldugu anlamina gelmez.
 *
 * Bu suit uc seyi olcer:
 *   1. Kiraci kendi defterine yazabiliyor (kontrol grubu — koruma her seyi
 *      reddederek "guvenli" gorunmesin).
 *   2. Yabanci kiraci ne yazabiliyor ne okuyabiliyor.
 *   3. `anon` — tarayicida duran anahtar — tablolara hic erisemiyor.
 *
 * Ucuncusu bos bir formalite degil: Supabase `public` semasindaki yeni
 * tablolara varsayilan olarak `anon` rolune yetki verir ve
 * `REVOKE ALL ... FROM PUBLIC` bunu KALDIRMAZ (CLAUDE.md 7). Ayni kural
 * 2026-09-13'te Phase 17'nin 15 goc dosyasinda birden ihlal edilmisti.
 *
 * Goc uygulanmamis bir veritabaninda bu suit KIRMIZI kalir — beklenen
 * durumdur (4.2: davranis gocleri boyle dogrulanir).
 *
 * YALNIZCA ayri test projesine kosar; uretim `core/test_env.js` icinde
 * kara listededir.
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
const users = [], tenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d || 'kosul saglanmadi');

const stamp = Date.now().toString(36);

async function makeOwner(label) {
  const email = `p31_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P31!' + stamp + 'Aa';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${label} kullanici: ${error.message}`);
  users.push(data.user.id);
  const client = newClient();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${label} giris: ${e2.message}`);
  const { data: t, error: e3 } = await client.rpc('create_tenant_and_owner', {
    p_company_name: `Phase31 ${label} ${stamp}`, p_full_name: 'P31'
  });
  if (e3) throw new Error(`${label} tenant: ${e3.message}`);
  tenants.push(t.tenant_id);
  const { data: p, error: e4 } = await client.from('properties')
    .insert({ tenant_id: t.tenant_id, name: 'Villa ' + label, slug: `p31${label}${stamp}`, base_price: 12000 })
    .select().single();
  if (e4) throw new Error(`${label} mulk: ${e4.message}`);
  return { client, tenantId: t.tenant_id, propertyId: p.id, userId: data.user.id };
}

async function run() {
  const A = await makeOwner('a');
  const B = await makeOwner('b');
  const anon = newClient();

  // ---------------------------------------------------------------------
  // 1. KONTROL GRUBU — kendi defterine yazabilmeli
  //
  // Bu olmadan suit anlamsizdir: her seyi reddeden bir koruma da
  // "izolasyon saglandi" gorunumu verir.
  // ---------------------------------------------------------------------
  const { data: kamp, error: ke } = await A.client.from('marketing_campaigns').insert({
    tenant_id: A.tenantId, property_id: A.propertyId,
    name: 'Yaz Kampanyasi ' + stamp, platform: 'META',
    start_date: '2026-06-01', end_date: '2026-06-30',
    budget: 10000, spent: 4200, clicks: 1300, leads_count: 22,
    bookings_count: 3, revenue: 88000, status: 'ACTIVE'
  }).select().single();
  check(!ke && kamp && kamp.id, '1. Sahip kendi kiracisinda kampanya kaydedebiliyor',
    ke && ke.message);

  const { error: ie } = await A.client.from('influencer_collabs').insert({
    tenant_id: A.tenantId, property_id: A.propertyId,
    handle: '@gezgin' + stamp, followers: '12,5K', collab_dates: '12-15 Haziran',
    cost: 5000, discount_code: 'KOD' + stamp.toUpperCase().slice(0, 6),
    bookings_count: 2, revenue: 40000, status: 'COMPLETED'
  });
  check(!ie, '2. Sahip influencer isbirligi kaydedebiliyor', ie && ie.message);

  const { error: se } = await A.client.from('tenant_settings').upsert({
    tenant_id: A.tenantId, key: 'ota_pricing_strategy', value: 'ABSORBED'
  }, { onConflict: 'tenant_id, key' });
  check(!se, '3. Sahip kiraci ayari yazabiliyor', se && se.message);

  const { error: ne } = await A.client.from('property_operator_notes').upsert({
    property_id: A.propertyId, tenant_id: A.tenantId, note: 'Jakuzi filtresi degisecek.'
  }, { onConflict: 'property_id' });
  check(!ne, '4. Sahip operator notu yazabiliyor', ne && ne.message);

  // Girilmemis basamak NULL: "bilinmiyor" ile "sifir" ayri seylerdir (3.6).
  const { data: merdiven, error: me } = await A.client.from('property_pricing_ladder').upsert({
    property_id: A.propertyId, tenant_id: A.tenantId,
    floor_price: 8000, target_price: null, premium_price: null,
    peak_price: null, heating_cost: 0
  }, { onConflict: 'property_id' }).select().single();
  check(!me && merdiven, '5. Sahip fiyat merdiveni yazabiliyor', me && me.message);
  check(merdiven && merdiven.target_price === null && Number(merdiven.heating_cost) === 0,
    '6. Girilmemis basamak NULL kaliyor, acikca girilen 0 korunuyor',
    'Sema NOT NULL DEFAULT 0 dayatiyorsa "girilmedi" ile "sifir" birbirine ' +
    'karisir ve ekranda "—" yerine uydurma bir rakam cikar (3.6).');

  const { error: he } = await A.client.from('housekeeping_status_overrides').upsert({
    property_id: A.propertyId, tenant_id: A.tenantId, status: 'CLEANING'
  }, { onConflict: 'property_id' });
  check(!he, '7. Sahip temizlik durumu gecersiz kilmasi yazabiliyor', he && he.message);

  // ---------------------------------------------------------------------
  // 2. CAPRAZ KIRACI — B, A'nin defterine yazamaz ve okuyamaz
  // ---------------------------------------------------------------------
  const { error: xe } = await B.client.from('marketing_campaigns').insert({
    tenant_id: A.tenantId, name: 'SIZINTI ' + stamp, platform: 'GOOGLE',
    budget: 1, spent: 1, status: 'ACTIVE'
  });
  check(!!xe, '8. Yabanci kiraci kampanya YAZAMIYOR (RLS reddediyor)',
    'RLS hata vermedi — yazma butunlugu kirik.');

  const { data: sizan } = await admin.from('marketing_campaigns')
    .select('id').eq('tenant_id', A.tenantId).eq('name', 'SIZINTI ' + stamp);
  check((sizan || []).length === 0,
    '9. Yabanci yazma veritabanina ULASMIYOR',
    `A kiracisinda yabanci satir: ${(sizan || []).length}`);

  const { error: xs } = await B.client.from('tenant_settings').upsert({
    tenant_id: A.tenantId, key: 'ota_pricing_strategy', value: 'MARKUP'
  }, { onConflict: 'tenant_id, key' });
  check(!!xs, '10. Yabanci kiraci ayar YAZAMIYOR',
    'Fiyat stratejisi misafire gosterilen fiyati belirler; yabanci birinin ' +
    'degistirebilmesi dogrudan para kaybidir.');

  const { error: xh } = await B.client.from('housekeeping_status_overrides').upsert({
    property_id: A.propertyId, tenant_id: A.tenantId, status: 'OCCUPIED'
  }, { onConflict: 'property_id' });
  check(!!xh, '11. Yabanci kiraci temizlik durumunu degistiremiyor', 'RLS gecirdi.');

  for (const tablo of ['marketing_campaigns', 'influencer_collabs', 'tenant_settings',
    'property_operator_notes', 'property_pricing_ladder', 'housekeeping_status_overrides']) {
    const { data: okunan } = await B.client.from(tablo).select('*').eq('tenant_id', A.tenantId);
    check((okunan || []).length === 0,
      `12. Yabanci kiraci ${tablo} OKUYAMIYOR`,
      `okunan satir: ${(okunan || []).length} — bir musterinin verisi ` +
      'baskasina gorunuyor.');
  }

  // ---------------------------------------------------------------------
  // 3. ANON KAPISI — tarayicida duran anahtar hicbir seye erisemez
  // ---------------------------------------------------------------------
  for (const tablo of ['marketing_campaigns', 'influencer_collabs', 'tenant_settings',
    'property_operator_notes', 'property_pricing_ladder', 'housekeeping_status_overrides']) {
    // `id` DEGIL `tenant_id` sorulur: dort tablonun birincil anahtari
    // (tenant_id, key) ya da property_id'dir, `id` sutunlari yoktur ve
    // PostgREST once 42703 dondurup asil yetki cevabini maskeler.
    const { data: aData, error: aErr } = await anon.from(tablo).select('tenant_id').limit(1);
    // Yetki geri alinmissa 42501 gelir; RLS'e kadar girerse bos donebilir.
    // Ikisi de "veri sizmadi" demek ama ILKI dogru olandir: grant duruyorsa
    // koruma tek katliya duser.
    check(!!aErr && String(aErr.code) === '42501',
      `13. anon ${tablo} tablosuna erisemiyor (yetki geri alinmis)`,
      aErr ? `beklenen 42501, gelen ${aErr.code}: ${aErr.message}`
           : `anon sorgusu HATA VERMEDI, ${(aData || []).length} satir dondu. ` +
             'Supabase yeni tablolara varsayilan anon yetkisi verir ve ' +
             'REVOKE ... FROM PUBLIC bunu kaldirmaz (7. bolum).');
  }

  // ---------------------------------------------------------------------
  // 4. SIFIRLAMA yeni defterleri de bosaltiyor (3.7)
  //
  // Yeni bir defter `reset_tenant_data` listesine yazilmazsa "sifirla"
  // onu oldugu gibi birakir ve musteri sifirladigini sanir.
  // ---------------------------------------------------------------------
  const { error: re } = await A.client.rpc('reset_tenant_data', {
    p_tenant_id: A.tenantId, p_confirm: 'VERILERI SIFIRLA'
  });
  check(!re, '14. Sahip isletme verisini sifirlayabiliyor', re && re.message);

  const { data: kalanKamp } = await admin.from('marketing_campaigns')
    .select('id').eq('tenant_id', A.tenantId);
  check((kalanKamp || []).length === 0,
    '15. Sifirlama sonrasi kampanya defteri BOS',
    `kalan kampanya: ${(kalanKamp || []).length} — reset_tenant_data tablo ` +
    'listesi guncellenmemis.');

  const { data: kalanInf } = await admin.from('influencer_collabs')
    .select('id').eq('tenant_id', A.tenantId);
  check((kalanInf || []).length === 0,
    '16. Sifirlama sonrasi influencer defteri BOS',
    `kalan kayit: ${(kalanInf || []).length}`);

  // Ayar bir DEFTER degildir: sifirlama isletmeyi, ekibi ve ayarlari korur.
  const { data: kalanAyar } = await admin.from('tenant_settings')
    .select('key').eq('tenant_id', A.tenantId);
  check((kalanAyar || []).length > 0,
    '17. Sifirlama kiraci AYARLARINI korumus',
    'Ayarlar da silinmis. Sifirlama "defterleri bosalt" demektir; ekip ve ' +
    'isletme korunuyorsa fiyat stratejisi de korunmalidir (3.7).');
}

async function cleanup() {
  for (const t of tenants) await admin.from('tenants').delete().eq('id', t);
  for (const u of users) await admin.auth.admin.deleteUser(u);
}

(async () => {
  try {
    await run();
  } catch (e) {
    failed++;
    console.error('[FAIL] calisma hatasi\n       ' + (e && e.message ? e.message : e));
  } finally {
    // Ozet `finally` icinde: `try` icindeki bir `return` ozeti ve cikis
    // kodunu atlar, suit hatali oldugu halde 0 ile cikar (CLAUDE.md 5.2).
    try { await cleanup(); } catch (e) { console.error('temizlik hatasi: ' + e.message); }
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED`);
    process.exit(failed ? 1 : 0);
  }
})();
