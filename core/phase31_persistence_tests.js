/**
 * LEXBNB PHASE 31 KALICILIK DENETIMI — son alti "kaydetmeyen kaydedici"
 *
 * `saveAppData()` hicbir sey kaydetmez; govdesi yalnizca eski
 * `LEXBNB_DATA_*` localStorage anahtarlarini siler (CLAUDE.md 6). Onu
 * cagiran fonksiyonlarin cogu 20 Eylul 2026'da Postgres'e baglandi;
 * ALTISI "yazilacak tablo yok" dendigi icin acik kaldi:
 *
 *   cycleHkStatus / saveMarketingCampaign / saveInfluencerCollab /
 *   setOtaPricingStrategy / saveOperatorNote / saveAllSettings (merdiven)
 *
 * Hepsi ayni belirtiyi veriyordu: kullanici kaydi giriyor, tabloda
 * goruyor, sayfayi yenileyince kaybediyordu. Ticari bir SaaS'ta bu
 * gorunur kusurlarin en kotusudur.
 *
 * Bu denetim uc katmani birden olcer:
 *   A) DAVRANIS — sahte bir Supabase istemcisiyle gercekten yazilan satir.
 *   B) KAYNAK   — alti fonksiyon kalici bir yoldan geciyor mu.
 *   C) SEMA     — phase31 gocu tablolari, RLS'i ve sifirlama listesini
 *                 gercekten kapsiyor mu.
 *
 * Eski koda karsi kirilir (CLAUDE.md 5.5): A bolumunun tamami ve B'nin
 * tamami, phase31 oncesi govdelerde kirmizidir — o govdelerde ne yazma
 * fonksiyonu ne de async imza vardir.
 *
 * Kaynak + saf mantik olcumudur; dis sisteme baglanmaz.
 */

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const APP_KAYNAK = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
const GOC = fs.readFileSync(
  path.join(KOK, 'supabase', 'migration_phase31_local_state_persistence.sql'), 'utf8');

/** Yalnizca CALISAN kodu birak; yorumlar hatanin gerekcesini tasiyor. */
function kodu(kaynak) {
  return kaynak.split(/\r?\n/)
    .filter(l => {
      const t = l.trim();
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const APP = kodu(APP_KAYNAK);

function govde(kaynak, ad) {
  const satirlar = kaynak.split(/\r?\n/);
  const i = satirlar.findIndex(l => {
    const t = l.trim();
    return t.startsWith('function ' + ad + '(') || t.startsWith('async function ' + ad + '(');
  });
  if (i < 0) return null;
  let d = 0;
  for (let j = i; j < satirlar.length; j++) {
    for (const c of satirlar[j]) {
      if (c === '{') d++;
      else if (c === '}') d--;
    }
    if (d === 0 && j > i) return satirlar.slice(i, j + 1).join('\n');
  }
  return null;
}

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

// -----------------------------------------------------------------------------
// SAHTE SUPABASE ISTEMCISI
//
// Supabase JS hata FIRLATMAZ, `{ error }` dondurur (CLAUDE.md 5.1) — sahte
// istemci de ayni sozlesmeyi tasimali, yoksa denetim gercekte olmayan bir
// davranisi olcer.
// -----------------------------------------------------------------------------
function sahteIstemci() {
  const kayit = { upserts: [], deletes: [] };
  const zincir = (tablo) => ({
    upsert(satir, secenek) {
      kayit.upserts.push({ tablo, satir, secenek });
      const sonuc = { data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', ...satir }, error: null };
      // PostgREST sorgu nesnesi hem zincirlenebilir hem "thenable"dir:
      // `.select().single()` ile de, dogrudan `await` ile de kullanilir.
      // Sahte istemci bu sozlesmeyi tasimazsa `{ error }` okuyan cagri
      // yolu hic olculmez.
      return {
        select: () => ({ single: async () => sonuc }),
        then: (res, rej) => Promise.resolve(sonuc).then(res, rej)
      };
    },
    delete() {
      return {
        match: async (esleme) => {
          kayit.deletes.push({ tablo, esleme });
          return { error: null };
        }
      };
    }
  });
  return { kayit, istemci: { from: (tablo) => zincir(tablo) } };
}

const TENANT = '11111111-2222-4333-8444-555555555555';
const PROP = '99999999-8888-4777-8666-555555555555';

/**
 * Eksik bir export yuzunden kosunun TAMAMI durmasin: o durumda kaynak ve
 * sema bolumleri hic calismaz ve denetim "neyin eksik oldugunu" degil
 * yalnizca "bir sey patladi"yi soyler.
 */
function eksikExportlar(app) {
  return ['cloudSaveMarketingCampaign', 'cloudSaveInfluencerCollab',
    'cloudSaveTenantSetting', 'cloudSaveOperatorNote', 'cloudSavePricingLadder',
    'cloudSaveHousekeepingOverride', 'fetchTenantRowsTolerant', 'isMissingSchemaError']
    .filter(ad => typeof app[ad] !== 'function');
}

async function davranisTestleri(app) {
  const eksik = eksikExportlar(app);
  if (eksik.length > 0) {
    eksik.forEach(ad => no(`0. ${ad} app.js tarafindan disa aktariliyor`,
      'Fonksiyon yok: bu akis hala yalnizca bellege yaziyor ve kullanici ' +
      'kaydini sayfa yenilendiginde kaybediyor.'));
    return;
  }
  const { kayit, istemci } = sahteIstemci();
  app.setSupabaseClient(istemci);
  app.setActiveTenant({ id: TENANT, name: 'Test' });
  app.setAppData({
    tenantId: TENANT,
    villas: { VILLA_A: { id: PROP, slug: 'VILLA_A', name: 'Villa A' } }
  });

  // --- 1. Kampanya: portfoy geneli mulke baglanmaz -------------------------
  await app.cloudSaveMarketingCampaign({
    id: null, name: 'Yaz Kampanyasi', platform: 'META', villa: 'ALL',
    startDate: '2026-06-01', endDate: '2026-06-30',
    budget: 10000, spent: 4200, clicks: 1300, leads: 22,
    bookingsCount: 3, revenue: 88000, status: 'ACTIVE', notes: ''
  });
  const kamp = kayit.upserts.find(u => u.tablo === 'marketing_campaigns');
  check(!!kamp, '1. saveMarketingCampaign yolu marketing_campaigns tablosuna yaziyor',
    'Hicbir upsert yapilmadi. Kampanya yalnizca bellekte kaliyor: kullanici ' +
    'girer, tabloda gorur, sayfayi yenileyince kaybeder.');
  check(kamp && kamp.satir.tenant_id === TENANT,
    '2. Kampanya satiri aktif kiracıya baglaniyor',
    'tenant_id yok ya da yanlis; RLS reddeder ya da baska kiraciya yazilir.');
  check(kamp && kamp.satir.property_id === null,
    '3. "Tüm Villalar" secimi property_id = NULL gidiyor',
    'Portfoy geneli bir kampanya gelisiguzel bir mulke baglanirsa o mulkun ' +
    'pazarlama raporu bozulur.');
  check(kamp && kamp.satir.leads_count === 22 && kamp.satir.bookings_count === 3,
    '4. Arayuz alanlari sutun adlarina dogru esleniyor',
    'leads/bookingsCount -> leads_count/bookings_count eslemesi yanlis; ' +
    'girilen sayi sessizce 0 yazilir.');

  // --- 2. Mulke bagli kampanya --------------------------------------------
  kayit.upserts.length = 0;
  await app.cloudSaveMarketingCampaign({
    id: null, name: 'Villa A Google', platform: 'GOOGLE', villa: 'VILLA_A',
    startDate: '', endDate: '', budget: 0, spent: 0, clicks: 0, leads: 0,
    bookingsCount: 0, revenue: 0, status: 'ACTIVE', notes: ''
  });
  const kamp2 = kayit.upserts.find(u => u.tablo === 'marketing_campaigns');
  check(kamp2 && kamp2.satir.property_id === PROP,
    '5. Villa secili kampanya dogru property_id aliyor',
    'Slug -> property_id cozumu calismiyor.');
  check(kamp2 && kamp2.satir.start_date === null && kamp2.satir.end_date === null,
    '6. Bos tarih NULL gidiyor, bos dizge degil',
    'Bos dizge DATE sutununa 22007 ile duser ve kayit tamamen kaybolur.');

  // --- 3. Influencer -------------------------------------------------------
  kayit.upserts.length = 0;
  await app.cloudSaveInfluencerCollab({
    id: null, handle: '@gezgin', followers: '12,5K', villa: 'VILLA_A',
    dates: '12-15 Haziran', cost: 5000, code: 'GEZGIN10',
    bookingsCount: 2, revenue: 40000, status: 'COMPLETED', notes: ''
  });
  const inf = kayit.upserts.find(u => u.tablo === 'influencer_collabs');
  check(!!inf, '7. saveInfluencerCollab yolu influencer_collabs tablosuna yaziyor',
    'Influencer defteri hala yalnizca bellekte.');
  check(inf && inf.satir.followers === '12,5K' && inf.satir.collab_dates === '12-15 Haziran',
    '8. Serbest metin alanlari oldugu gibi tasiniyor',
    '"12,5K" ve "12-15 Haziran" sayiya zorlanirsa girilen veri bozulur; ' +
    'uydurulmus bir sayiya cevirmek 3.6 ihlalidir.');
  check(inf && inf.satir.discount_code === 'GEZGIN10',
    '9. Indirim kodu discount_code sutununa yaziliyor',
    'Kod kaybolursa isbirliginin cirosu hicbir zaman eslestirilenemez.');

  // --- 4. Fiyat merdiveni: girilmemis basamak NULL -------------------------
  kayit.upserts.length = 0;
  await app.cloudSavePricingLadder('VILLA_A', {
    floor: 8000, target: null, premium: '', peak: undefined, heatCost: 0
  });
  const merdiven = kayit.upserts.find(u => u.tablo === 'property_pricing_ladder');
  check(!!merdiven, '10. Fiyat merdiveni property_pricing_ladder tablosuna yaziliyor',
    'saveAllSettings merdiveni hala yalnizca bu oturumda tutuyor.');
  check(merdiven && merdiven.satir.target_price === null
    && merdiven.satir.premium_price === null && merdiven.satir.peak_price === null,
    '11. Girilmemis basamak NULL yaziliyor, 0 DEGIL',
    'Bos birakilan basamak 0 yazilirsa "bilinmiyor" ile "sifir" birbirine ' +
    'karisir: ekranda "—" yerine rakam cikar ve o rakam firsat fiyatina, ' +
    'oradan misafire giden metne tasinir (3.6).');
  check(merdiven && merdiven.satir.heating_cost === 0,
    '12. Acikca girilen 0 korunuyor',
    '0 gecerli bir degerdir (isitmasiz mulk); NULL\'a cevrilirse kullanicinin ' +
    'girdigi bilgi silinir.');
  check(merdiven && merdiven.satir.property_id === PROP && merdiven.satir.tenant_id === TENANT,
    '13. Merdiven satiri mulke ve kiraciya bagli',
    'Kiraci kimligi olmadan RLS reddeder.');

  // --- 5. Temizlik durumu: AUTO = satirin SILINMESI ------------------------
  kayit.upserts.length = 0;
  kayit.deletes.length = 0;
  await app.cloudSaveHousekeepingOverride('VILLA_A', 'CLEANING');
  const hk = kayit.upserts.find(u => u.tablo === 'housekeeping_status_overrides');
  check(hk && hk.satir.status === 'CLEANING',
    '14. Elle secilen temizlik durumu yaziliyor',
    'cycleHkStatus hala yalnizca bellege yaziyor.');

  kayit.upserts.length = 0;
  await app.cloudSaveHousekeepingOverride('VILLA_A', null);
  check(kayit.upserts.length === 0 && kayit.deletes.some(
    d => d.tablo === 'housekeeping_status_overrides' && d.esleme.property_id === PROP),
    '15. AUTO durumu satiri SILIYOR, "AUTO" diye deger yazmiyor',
    'Otomatik hesaplanan durumu saklamak, hesaplanmis bir durumu elle ' +
    'girilmis gibi gosterir ve gercek durum degistiginde ekran yalan soyler.');

  // --- 6. Kiraci ayari -----------------------------------------------------
  kayit.upserts.length = 0;
  await app.cloudSaveTenantSetting('ota_pricing_strategy', 'ABSORBED');
  const ayar = kayit.upserts.find(u => u.tablo === 'tenant_settings');
  check(ayar && ayar.satir.key === 'ota_pricing_strategy' && ayar.satir.value === 'ABSORBED',
    '16. OTA fiyat stratejisi tenant_settings tablosuna yaziliyor',
    'setOtaPricingStrategy hala yalnizca bellege yaziyor; kullanici modu ' +
    'degistirir, yenilemede eski moda doner ve misafire yanlis fiyat cikar.');
  check(ayar && ayar.secenek && ayar.secenek.onConflict === 'tenant_id, key',
    '17. Ayar yazmasi (tenant_id, key) uzerinde upsert',
    'Cakisma anahtari yoksa her degisiklik yeni satir acar ve "hangisi ' +
    'guncel" belirsizlesir.');

  // --- 7. Operator notu ----------------------------------------------------
  kayit.upserts.length = 0;
  await app.cloudSaveOperatorNote('VILLA_A', 'Jakuzi filtresi degisecek.');
  const not = kayit.upserts.find(u => u.tablo === 'property_operator_notes');
  check(not && not.satir.note === 'Jakuzi filtresi degisecek.' && not.satir.property_id === PROP,
    '18. Operator notu mulke bagli olarak yaziliyor',
    'saveOperatorNote hala yalnizca appData.airbnbListings icinde tutuyor.');

  // --- 8. Sema yoksa yazma SESSIZCE basarili sayilmaz ----------------------
  const semasizSonuc = { data: null, error: { code: 'PGRST205', message: 'no table' } };
  const semasiz = {
    from: () => ({
      upsert: () => ({
        select: () => ({ single: async () => semasizSonuc }),
        then: (res, rej) => Promise.resolve(semasizSonuc).then(res, rej)
      })
    })
  };
  app.setSupabaseClient(semasiz);
  let firladi = false;
  try {
    await app.cloudSaveTenantSetting('ota_pricing_strategy', 'MARKUP');
  } catch (e) {
    firladi = app.isMissingSchemaError(e) || /PGRST205|no table/.test(e.message || '');
  }
  check(firladi,
    '19. Tablo yokken yazma hata FIRLATIYOR',
    'Supabase JS hata firlatmaz, { error } dondurur (5.1). Kontrol ' +
    'edilmezse yazma sessizce basarisiz olur ve kullaniciya "kaydedildi" ' +
    'denir — duzeltilen hatanin ta kendisi.');

  // --- 9. Okuma tarafi: tablo yoksa ekran calismaya devam eder -------------
  const okumaHatasi = { code: 'PGRST205' };
  const sonuc = await app.fetchTenantRowsTolerant(() => ({
    range: async () => ({ data: null, error: okumaHatasi })
  }));
  check(sonuc === null,
    '20. Okumada eksik sema `null` doner (bos dizi DEGIL)',
    'null = "sema hazir degil", [] = "hazir ama bos". Ikisi ayni sayilirsa ' +
    'goc uygulanmadan once ekran "kayit yok" der ve sorun gorunmez kalir.');

  app.setSupabaseClient(null);
}

function kaynakTestleri() {
  // Alti kapi. Hepsi async olmak ve gercek bir yazma yolundan gecmek zorunda.
  const KAPILAR = {
    cycleHkStatus: 'cloudSaveHousekeepingOverride',
    saveMarketingCampaign: 'cloudSaveMarketingCampaign',
    saveInfluencerCollab: 'cloudSaveInfluencerCollab',
    setOtaPricingStrategy: 'cloudSaveTenantSetting',
    saveOperatorNote: 'cloudSaveOperatorNote',
    saveAllSettings: 'cloudSavePricingLadder'
  };

  let i = 21;
  Object.entries(KAPILAR).forEach(([ad, yazici]) => {
    const g = govde(APP, ad);
    if (!g) {
      no(`${i++}. ${ad} bulundu`, 'Fonksiyon app.js icinde yok.');
      return;
    }
    check(g.includes(yazici),
      `${i++}. ${ad} -> ${yazici} cagiriyor`,
      `${ad} hala yalnizca saveAppData() cagiriyor. O fonksiyon hicbir sey ` +
      'kaydetmez: kullaniciya "kaydedildi" denir ve kayit yenilemede yok olur.');
    check(new RegExp('async function ' + ad + '\\s*\\(').test(APP),
      `${i++}. ${ad} async`,
      'Senkron govdede bulut yazmasi beklenemez; hata yakalanamaz ve ' +
      'yakalanmamis promise reddi olarak sessizce yutulur.');
  });

  // Silme de yazmadir: bellekten silip veritabaninda birakmak, yenilemede
  // silinen kaydin geri gelmesi demektir.
  [['deleteMarketingCampaign', 'cloudDeleteMarketingCampaign'],
   ['deleteInfluencerCollab', 'cloudDeleteInfluencerCollab']].forEach(([ad, yazici]) => {
    const g = govde(APP, ad) || '';
    check(g.includes(yazici),
      `${i++}. ${ad} veritabanindan da siliyor`,
      'Kayit yalnizca bellekten siliniyor; sayfa yenilenince geri gelir.');
  });

  // Yerel kimlik uretimi kalmamali: kimlik artik Postgres'ten gelir.
  check(!/'MKT-'\s*\+\s*Date\.now\(\)/.test(APP),
    `${i++}. Kampanya icin yerel 'MKT-...' kimligi uretilmiyor`,
    'Yerel kimlik, kaydin hicbir yere yazilmadiginin isaretidir; veritabani ' +
    'satiriyla eslesmez ve duzenleme/silme yanlis kaydi hedefler.');
  check(!/'INF-'\s*\+\s*Date\.now\(\)/.test(APP),
    `${i++}. Influencer icin yerel 'INF-...' kimligi uretilmiyor`,
    'Ayni sebep.');

  // Yukleme hatti alti tabloyu da okumali; yoksa yazma calissa bile
  // ekran yenilemeden sonra bos kalir ve hata "kaydedilmedi" sanilir.
  const yukle = govde(APP, 'loadTenantAppData') || '';
  ['marketing_campaigns', 'influencer_collabs', 'tenant_settings',
   'property_operator_notes', 'property_pricing_ladder',
   'housekeeping_status_overrides'].forEach(tablo => {
    check(yukle.includes(tablo),
      `${i++}. loadTenantAppData ${tablo} tablosunu okuyor`,
      'Yazilan kayit geri okunmuyorsa musteri icin hicbir sey degismez: ' +
      'yenilemeden sonra ekran yine bos.');
  });
  check(!/marketingCampaigns:\s*\[\],\s*[\r\n]+\s*influencerCollabs:\s*\[\],/.test(kodu(APP_KAYNAK).replace(/\r/g, ''))
    || !/appData = \{[\s\S]{0,4000}marketingCampaigns: \[\]/.test(yukle),
    `${i++}. Bulut yuklemesi marketingCampaigns'i SABIT bos dizi atamiyor`,
    'Sabit `[]` atamasi, tablodan okunan kaydi her yenilemede siler.');

  // Merdiven artik "alan yok" demiyor.
  const ayarlar = govde(APP, 'saveAllSettings') || '';
  check(!/veritabanında henüz alan yok/.test(ayarlar),
    `${i++}. saveAllSettings artik "veritabaninda alan yok" demiyor`,
    'Mesaj duruyorsa merdiven hala kaydedilmiyor demektir.');

  return i;
}

function semaTestleri(i) {
  const TABLOLAR = ['marketing_campaigns', 'influencer_collabs', 'tenant_settings',
    'property_operator_notes', 'property_pricing_ladder', 'housekeeping_status_overrides'];

  TABLOLAR.forEach(t => {
    check(new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + t + '\\b').test(GOC),
      `${i++}. phase31 ${t} tablosunu olusturuyor`,
      'Tablo yoksa istemci kodu 42501/PGRST205 ile duser.');
    check(new RegExp('ALTER TABLE public\\.' + t + ' ENABLE ROW LEVEL SECURITY').test(GOC),
      `${i++}. ${t} icin RLS aciliyor`,
      'RLS olmadan bir kiracinin defteri digerine gorunur — urunun en temel ' +
      'sozlesmesi kirilir.');
  });

  check(/REVOKE ALL ON TABLE public\.%I FROM anon/.test(GOC),
    `${i++}. Yeni tablolarda anon yetkisi geri aliniyor`,
    'Supabase `public` semasindaki yeni tablolara varsayilan olarak `anon` ' +
    'yetkisi verir ve `REVOKE ... FROM PUBLIC` bunu KALDIRMAZ (7. bolum). ' +
    'Tarayicida duran anon anahtariyla defter okunabilir hale gelir.');

  check(/PHASE31_ANON_TABLE_GRANT_PRESENT/.test(GOC),
    `${i++}. Goc kendi anon denetimini yapiyor`,
    'Dogrulama blogu olmadan gocun basarili gorunup yetkiyi birakmasi mumkun.');

  // NULL NOT IN tuzagi: politikalar POZITIF IN kullanmali (7. bolum).
  check(!/NOT IN \('owner'/.test(GOC),
    `${i++}. Yetki kontrolu prosedurel "NOT IN" kalibini kullanmiyor`,
    'SQL uc degerli mantiginda `NULL NOT IN (...)` sonucu NULL\'dir ve ' +
    '`IF NULL THEN` calismaz: koruma, tam da korumasi gereken anda ' +
    '(yabanci kiracidan gelen cagri) sessizce atlanir.');

  // Merdiven basamaklari NULL olabilmeli.
  check(/PHASE31_LADDER_STEP_NOT_NULLABLE/.test(GOC),
    `${i++}. Goc merdiven basamaklarinin NULL kalabildigini dogruluyor`,
    'NOT NULL DEFAULT 0 eklenirse "girilmedi" ile "sifir" birbirine karisir (3.6).');

  // Veri sifirlama yeni defterleri gormeli (3.7).
  check(/'marketing_campaigns', 'influencer_collabs'/.test(GOC),
    `${i++}. reset_tenant_data yeni defterleri siliyor`,
    'Yeni bir defter sifirlama listesine yazilmazsa "sifirla" o defteri ' +
    'oldugu gibi birakir ve musteri sifirladigini sanir (3.7).');
  check(/PHASE31_RESET_DELETES_SETTINGS/.test(GOC),
    `${i++}. Sifirlama kiraci AYARLARINI silmiyor`,
    'Sifirlama defterleri bosaltir; isletmeyi, ekibi ve ayarlari korur. ' +
    'Fiyat stratejisi bir ayardir, defter degil.');

  // Manifest kaydi (goc degismezligi).
  const manifest = fs.readFileSync(path.join(KOK, 'supabase', 'migration_manifest.txt'), 'utf8');
  check(manifest.includes('migration_phase31_local_state_persistence.sql'),
    `${i++}. phase31 manifeste islendi`,
    'Manifeste yazilmayan goc `verify:migrations` tarafindan gorulmez ve ' +
    'sifirdan kurulan bir veritabaninda hic uygulanmaz.');

  // Phase numarasi sahipligi: Claude tek numara (AGENTS.md).
  check(!fs.existsSync(path.join(KOK, 'supabase', 'migration_phase32_local_state_persistence.sql')),
    `${i++}. Numara sahipligine uyuldu (Claude tek numara)`,
    'Cift numara Codex\'e ayrilmistir; ayni numarayi iki arac secerse ' +
    'paralel worktree\'ler ayni goc adini uretir.');

  return i;
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 31 KALICILIK DENETIMI');
  console.log('=============================================================================\n');

  const app = require(path.join(KOK, 'app.js'));
  await davranisTestleri(app);
  const i = kaynakTestleri();
  semaTestleri(i);
}

run()
  .catch(err => {
    failed++;
    console.error('[FAIL] Denetim kosusu hata ile durdu\n       ' + (err && err.stack || err));
  })
  .finally(() => {
    // Ozet `finally` icinde: `try` icindeki bir `return` ozeti ve
    // process.exit(1) satirini atlar, suit hatali oldugu halde 0 ile
    // cikar (CLAUDE.md 5.2).
    console.log('\n-----------------------------------------------------------------------------');
    console.log(`TOPLAM: ${passed} gecti, ${failed} kaldi`);
    console.log('-----------------------------------------------------------------------------');
    if (failed > 0) process.exit(1);
  });
