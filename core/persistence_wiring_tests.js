/**
 * LEXBNB KALICILIK BAGLANTI DENETIMI — "kaydettim" diyen her yer yaziyor mu?
 *
 * 17 Eylul 2026'da `saveAppData()`'nin hicbir sey kaydetmedigi bulundu:
 * govdesi yalnizca eski `LEXBNB_DATA_*` localStorage anahtarlarini siliyor.
 * Postgres tek kaynak oldugu icin bu dogru bir temizlik — ama onu cagiran
 * 40 fonksiyonun 17'sinde yaninda HICBIR bulut yazmasi yoktu. Musteri
 * kaydettigini saniyor, sayfa yenilenince kayit yok.
 *
 * Bu denetim o 17'lik listeyi kucultur. Duzeltilen her fonksiyon asagidaki
 * KALICI listesine tasinir ve bir daha geri dusemez.
 *
 * Ikinci gorevi: `YYYY-MM` sabitlerini yakalamak. `demo_residue_tests`
 * tarih taramasi 10 karakterli `YYYY-MM-DD` ariyordu; 7 karakterli ay
 * sabiti gozden kacmisti ve `toggleCleaningPaid` gider kaydinin ayini
 * SABIT '2026-09' yaziyordu.
 *
 * Kaynak taramasidir; dis sisteme baglanmaz.
 */

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const APP_KAYNAK = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');

/** Yalnizca calisan kodu birak; yorumlar hatanin gerekcesini tasiyor. */
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

/** Bir govdenin gercek bir kalicilik yolundan gectigine dair isaretler. */
const YAZMA_IZLERI = [
  'cloudUpsert', 'cloudDelete', 'cloudSave', 'supabaseClient', 'requireCloudForWrite',
  'persistCleaningLedgerEntry', 'reportCleaningPersist', 'reportStatePersist',
  'createBooking(', 'createLead(', 'createExpense(', 'updateExpense(',
  'createMaintenanceTicket(', 'updateProperty(', 'loadTenantAppData('
];

/**
 * Duzeltilmis fonksiyonlar. Bu liste yalnizca BUYUR.
 * Bir fonksiyon buraya girdiyse, bir daha "yalnizca saveAppData()" haline
 * donemez — donerse bu denetim kirmizi olur.
 */
const KALICI = [
  // Temizlik & gider defteri (ayrica cleaning_ledger_persistence_tests)
  'promptEditCleaningAmount',
  'promptEditTaskAmount',
  'toggleCleaningPaid',
  'toggleTaskPaid',
  'payAllPendingCleaning',
  // WhatsApp -> Lead / Rezervasyon
  'saveWaAsLead',
  'saveWaAsBooking',
  // AI finans onerisi -> bakim kaydi
  'convertAiActionToTask',
  // phase31 — yerel kalan son alti defter (ayrica phase31_persistence_tests)
  'cycleHkStatus',
  'saveMarketingCampaign',
  'saveInfluencerCollab',
  'setOtaPricingStrategy',
  'saveOperatorNote',
  'saveAllSettings'
];

/**
 * Gercekten YEREL arayuz durumu olanlar: bunlar icin bulut yazmasi
 * beklenmez ve beklenmemesinin gerekcesi burada durur.
 */
const YEREL_MESRU = {
  changeImportMode: 'Ice aktarim modu yalnizca acik moddaki formun gorunumunu ' +
    'degistirir; is kaydi degildir.'
};

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB KALICILIK BAGLANTI DENETIMI');
  console.log('=============================================================================\n');

  // --- 1. Duzeltilmis fonksiyonlar gercekten yaziyor mu? -------------------
  KALICI.forEach((ad, i) => {
    const g = govde(APP, ad);
    if (!g) {
      no(`${i + 1}. ${ad} bulundu`, 'Fonksiyon app.js icinde yok.');
      return;
    }
    const izler = YAZMA_IZLERI.filter(w => g.includes(w));
    check(
      izler.length > 0,
      `${i + 1}. ${ad} kalici bir yazma yolundan geciyor`,
      `${ad} icinde hicbir bulut yazmasi yok. saveAppData() hicbir sey ` +
      'kaydetmez; kullaniciya "kaydedildi" denip kayit kaybediliyor.'
    );
  });

  // --- 2. Duzeltilenler async mi? ------------------------------------------
  const senkron = KALICI.filter(ad => !new RegExp('async function ' + ad + '\\s*\\(').test(APP));
  check(
    senkron.length === 0,
    '9. Kalici yazan fonksiyonlarin hepsi async',
    'Senkron kalmislar: ' + senkron.join(', ') +
    '. Bulut yazmasi beklenemez; hata yakalanamaz ve yakalanmayan promise ' +
    'reddi olarak sessizce yutulur.'
  );

  // --- 3. Yerel oldugu iddia edilenler gercekten yerel mi? -----------------
  Object.entries(YEREL_MESRU).forEach(([ad, gerekce]) => {
    const g = govde(APP, ad);
    if (!g) {
      ok(`10. ${ad} artik yok (kaldirilmis)`);
      return;
    }
    check(
      !/appData\.(bookings|expenses|leads|cleaningTasks|maintenance)\s*\.\s*(push|unshift)/.test(g),
      `10. ${ad} is kaydi olusturmuyor (yerel kalmasi mesru)`,
      `Gerekce "${gerekce}" artik gecerli degil: fonksiyon bir is kaydi ` +
      'yaratiyor ama Postgres\'e yazmiyor.'
    );
  });

  // --- 4. "Bu ay" sabit yazilmiyor -----------------------------------------
  // Yorumlar ayiklanmis kaynakta taranir; hatanin gerekcesini anlatan
  // aciklamalar ihlal sayilmaz.
  const aySabitleri = [];
  APP.split(/\r?\n/).forEach((satir, i) => {
    const m = satir.match(/['"](20\d\d-(0[1-9]|1[0-2]))['"]/g);
    if (m) aySabitleri.push(`  ${i + 1}: ${satir.trim().slice(0, 100)}`);
  });
  check(
    aySabitleri.length === 0,
    '11. app.js icinde SABIT `YYYY-MM` ay literali yok',
    'Sabit ay bulundu:\n' + aySabitleri.join('\n') +
    '\n"Bu ay"in tek kaynagi getCurrentMonthKey(); takvim ilerledikce ' +
    'sabit ay gecmis bir ayi "guncel" gostermeye devam eder ve KAYITLARI ' +
    'yanlis aya yazar (3.6).'
  );

  check(
    /function getCurrentMonthKey\(\)/.test(APP) &&
      govde(APP, 'getCurrentMonthKey').includes('getTodayStr()'),
    '12. getCurrentMonthKey() "bugün"un tek kaynagindan turer',
    'getCurrentMonthKey yok ya da getTodayStr() kullanmiyor; iki ayri ' +
    '"bugün" tanimi ay sinirinda birbirinden ayrilir.'
  );

  // --- 5. Baslangic filtresi tarayici saatine degil, getTodayStr'ye bakar --
  const filtre = APP.slice(APP.indexOf('let currentFilter = (() => {'), APP.indexOf('let activeTrendRange'));
  check(
    filtre.includes('getTodayStr()') && !filtre.includes('d.getFullYear()'),
    '13. Baslangic donemi Europe/Istanbul gununden hesaplaniyor',
    'currentFilter tarayicinin yerel saatini kullaniyor. Kayitlar ' +
    'getTodayStr() (Europe/Istanbul) gunune yaziliyor; ay sinirinda ' +
    'kullanici az once girdigi kaydi filtrede goremez.'
  );

  // --- 6. WhatsApp kaydedicileri gercek CRUD yolundan geciyor --------------
  const waLead = govde(APP, 'saveWaAsLead') || '';
  check(
    waLead.includes('createLead(') && waLead.includes('catch'),
    '14. saveWaAsLead createLead() cagiriyor ve hatayi kullaniciya soyluyor',
    'Talep dogrudan appData.leads\'e itiliyor; dogrulama ve bulut yazmasi ' +
    'atlaniyor.'
  );
  const waRez = govde(APP, 'saveWaAsBooking') || '';
  check(
    waRez.includes('createBooking(') && waRez.includes('catch'),
    '15. saveWaAsBooking createBooking() cagiriyor ve hatayi soyluyor',
    'Rezervasyon dogrudan appData.bookings\'e itiliyor: cakisma kontrolu, ' +
    'kapali donem kontrolu ve bulut yazmasi atlaniyor. Kullaniciya ' +
    '"rezervasyon kesinleştirildi" deniyor ve kayit kayboluyor.'
  );
  check(
    !/appData\.bookings\.unshift\(newRez\)/.test(APP),
    '16. WhatsApp rezervasyonu artik dogrudan belege itilmiyor',
    'appData.bookings.unshift(newRez) duruyor.'
  );

  // --- 7. AI aksiyonunun mukerrer kontrolu yenilemeye dayaniyor mu? -------
  const aiGorev = govde(APP, 'convertAiActionToTask') || '';
  check(
    aiGorev.includes('AI_AKSIYON_ETIKETI'),
    '17. AI aksiyonu mukerrer kontrolu KALICI bir alandan okuyor',
    'Kontrol yalnizca bellekteki metadata.actionKey\'e bakiyor. O alan ' +
    'yenilemede yok olur; ayni oneri her oturumda yeniden goreve ' +
    'donusturulebilir.'
  );
  check(
    aiGorev.includes('portföy geneli'),
    '18. Mulksuz AI onerisi icin rastgele mulk SECILMIYOR',
    'maintenance_tickets.property_id NOT NULL. Portfoy geneli bir oneriyi ' +
    'gelisiguzel bir mulke yazmak, o mulkun bakim defterini kirletir; ' +
    'durum kullaniciya soylenmeli.'
  );
}

try {
  run();
} finally {
  console.log('\n-----------------------------------------------------------------------------');
  console.log(`TOPLAM: ${passed} gecti, ${failed} kaldi`);
  console.log('-----------------------------------------------------------------------------');
  if (failed > 0) process.exit(1);
}
