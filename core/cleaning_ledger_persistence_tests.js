/**
 * LEXBNB TEMIZLIK & GIDER DEFTERI KALICILIK DENETIMI
 *
 * 20 Eylul 2026 incelemesi. Temizlik defterine dokunan bes fonksiyonun
 * HICBIRI Postgres'e yazmiyordu; yalnizca `saveAppData()` cagiriyorlardi ve
 * onun govdesi sadece eski localStorage anahtarlarini siliyor (6. bolum).
 * Musteri "Ödendi" diyor, gider defterinde kalemi goruyor, sayfayi
 * yenileyince hem odeme hem gider kayboluyordu.
 *
 * Ayni incelemede uc hata daha cikti:
 *
 *   • `toggleCleaningPaid` olusturdugu gider kaydinin ayini SABIT '2026-09'
 *     yaziyordu. Odeme hangi ay yapilirsa yapilsin gider Eylul 2026'ya
 *     dusuyor, iki ayin net kari ayni anda yanlis cikiyordu (3.6).
 *
 *   • `cloudUpsertCleaningTask` gorevin id'sini her halukarda `legacy_id`
 *     olarak gonderiyordu. Bulut yuklemesinden gelen gorevin id'si satirin
 *     UUID'sidir; onu `legacy_id`'ye yazmak `tenant_id + legacy_id`
 *     benzersizligini kacirir ve MUKERRER gorev satiri acar.
 *
 *   • `cleaningPayments` (kokpitteki villa bazli odeme durumu) yukleme
 *     tarafinda hic kurulmuyordu; yenilemeden sonra her villa "borç"
 *     gorunuyordu.
 *
 * Bu denetim kaynak taramasi + saf mantik olcumudur; dis sisteme baglanmaz.
 */

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const APP_KAYNAK = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');

/**
 * Yalnizca CALISAN kodu birak. Aksi halde hatanin NEDEN duzeltildigini
 * anlatan yorumu silmek zorunda kalirsiniz; denetim kendi belgesini yok
 * eder. (demo_residue_tests ve notification_wiring_tests ayni sebeple
 * ayni seyi yapiyor.)
 */
function kodu(kaynak) {
  return kaynak.split(/\r?\n/)
    .filter(l => {
      const t = l.trim();
      return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const APP = kodu(APP_KAYNAK);

/** Bir fonksiyonun govdesini kume parantezi dengesiyle ayikla. */
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

// Defterin bes kapisi. Hepsi ayni yoldan (persistCleaningLedgerEntry)
// gecmek zorunda: ayri ayri yazan bes kopya kacinilmaz olarak ayrisir.
const KAPILAR = [
  'promptEditCleaningAmount',
  'promptEditTaskAmount',
  'toggleCleaningPaid',
  'toggleTaskPaid',
  'payAllPendingCleaning'
];

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB TEMIZLIK & GIDER DEFTERI KALICILIK DENETIMI');
  console.log('=============================================================================\n');

  // --- 1. Bes kapi da gercekten yaziyor mu? ---------------------------------
  KAPILAR.forEach((ad, i) => {
    const g = govde(APP, ad);
    if (!g) {
      no(`${i + 1}. ${ad} bulundu`, 'Fonksiyon app.js icinde yok.');
      return;
    }
    check(
      g.includes('reportCleaningPersist') || g.includes('persistCleaningLedgerEntry'),
      `${i + 1}. ${ad} temizlik defterini POSTGRES'e yaziyor`,
      `${ad} yalnizca saveAppData() cagiriyor. saveAppData() hicbir sey ` +
      'kaydetmez; kullanici "kaydedildi" gorur, sayfa yenilenince kayit yoktur.'
    );
  });

  // --- 2. Hepsi async, yoksa await edilemez ---------------------------------
  KAPILAR.forEach(ad => {
    check(
      new RegExp('async function ' + ad + '\\s*\\(').test(APP),
      `6. ${ad} async`,
      `${ad} senkron; bulut yazmasi beklenemez ve hata yakalanamaz.`
    );
  });

  // --- 3. Sabit ay yasagi ----------------------------------------------------
  const tcp = govde(APP, 'toggleCleaningPaid') || '';
  check(
    !/month:\s*['"]\d{4}-\d{2}['"]/.test(tcp),
    '7. toggleCleaningPaid gider ayini SABIT yazmiyor',
    "month: '2026-09' sabiti duruyor. Odeme hangi ay yapilirsa yapilsin " +
    'gider Eylul 2026\'ya duser; iki ayin net kari ayni anda yanlis olur.'
  );

  const ay = govde(APP, 'buildCleaningExpenseRecord') || '';
  check(
    ay.includes('slice(0, 7)') && !/['"]\d{4}-\d{2}['"]/.test(ay),
    '8. Gider ayi odeme tarihinden TURETILIYOR',
    'buildCleaningExpenseRecord ayi tarihten uretmiyor.'
  );

  // --- 4. Gider kaydinin tek kaynagi ----------------------------------------
  const elleKurulan = KAPILAR
    .map(ad => [ad, govde(APP, ad) || ''])
    .filter(([, g]) => /category:\s*['"]Temizlik['"]/.test(g))
    .map(([ad]) => ad);
  check(
    elleKurulan.length === 0,
    '9. Temizlik gideri nesnesi kapilarda ELLE kurulmuyor',
    'Su fonksiyonlar kaydi hala kendisi kuruyor: ' + elleKurulan.join(', ') +
    '. Uc kopyanin biri sabit ay yaziyordu; tek kaynak buildCleaningExpenseRecord.'
  );

  // --- 5. Mukerrer gorev satiri hatasi --------------------------------------
  const upsert = govde(APP, 'cloudUpsertCleaningTask') || '';
  check(
    upsert.includes('isUUID(task.id)'),
    '10. cloudUpsertCleaningTask UUID ile yerel anahtari AYIRIYOR',
    'Gorevin id\'si her halukarda legacy_id olarak gonderiliyor. Bulut ' +
    'yuklemesinden gelen gorevin id\'si satirin UUID\'sidir; onu legacy_id\'ye ' +
    'yazmak benzersizligi kacirir ve Postgres MUKERRER gorev satiri acar.'
  );
  check(
    upsert.includes("onConflict: 'id'"),
    '11. Bilinen satir birincil anahtardan guncelleniyor',
    "UUID'li gorev icin onConflict: 'id' yolu yok."
  );

  // --- 6. Hata yutulmuyor ----------------------------------------------------
  check(
    !/console\.warn\('cloudUpsertCleaningTask/.test(APP),
    '12. cloudUpsertCleaningTask hatayi YUTMUYOR',
    'Hata console.warn ile yutuluyor; cagiran taraf yazmanin basarisiz ' +
    'oldugunu ogrenemez ve kullaniciya "kaydedildi" der (3.3).'
  );
  const rapor = govde(APP, 'reportCleaningPersist') || '';
  check(
    rapor.includes('catch') && rapor.includes('loadTenantAppData'),
    '13. Yazma dustugunde ekran GERCEGE geri cekiliyor',
    'Basarisizlikta yeniden yukleme yok: bellekteki degisiklik ekranda ' +
    'kalir, veritabaninda yoktur — kullanici yanlis durumu dogru sanar.'
  );

  // --- 7. Sifir tutar: uydurma yok, sessiz basarisizlik da yok --------------
  const gider = govde(APP, 'cloudUpsertCleaningExpense') || '';
  check(
    gider.includes('TUTAR_YOK'),
    '14. Tutar girilmemisse gider satiri YAZILMIYOR ve sebebi donuyor',
    'expenses tablosunda chk_expense_positive_amount var: 0 tutarli satir ' +
    'reddedilir. Sebep dondurulmezse hata sessizce yutulur veya uydurma bir ' +
    'varsayilan yazilir (3.6).'
  );
  check(
    !/\|\|\s*1500/.test(gider) && !/\|\|\s*1500/.test(tcp),
    '15. Temizlik maliyetinde sifir olmayan VARSAYILAN yok',
    '`|| 1500` kalibi geri gelmis: girilmemis bir maliyet uydurulup borc ' +
    'defterine yaziliyor (3.6).'
  );

  // --- 8. Gider anahtari yeniden yuklemeye dayaniyor mu? --------------------
  const anahtar = govde(APP, 'cleaningExpenseKey') || '';
  check(
    anahtar.includes('task.dbId'),
    '16. Gider anahtari gorevin VERITABANI kimligine bagli',
    'Anahtar yerel TASK-CLN-... id\'sine bagli. O id yeniden yuklemede ' +
    'UUID\'ye donusur; eski gider satiri oksuz kalir ve "Borç" isaretlemek ' +
    'onu silemez.'
  );
  check(
    !/'EXP-CLEAN-'\s*\+\s*task\.id/.test(APP) && !/'EXP-CLEAN-'\s*\+\s*t\.id/.test(APP),
    '17. Gider anahtari hicbir yerde ELLE kurulmuyor',
    "'EXP-CLEAN-' + task.id kalibi duruyor; cleaningExpenseKey() kullanilmali."
  );

  // --- 9. Yukleme ucu --------------------------------------------------------
  check(
    /legacyId:\s*c\.legacy_id/.test(APP),
    '18. Yuklenen gorev legacy_id\'sini TASIYOR',
    'legacy_id tasinmiyor; yeniden yuklenen gorev bir sonraki yazmada ' +
    'anahtarini kaybeder.'
  );
  check(
    /cleaningPayments,/.test(APP) && /const cleaningPayments = \{\}/.test(APP),
    '19. cleaningPayments bulut yuklemesinde TURETILIYOR',
    'Kokpitteki villa bazli odeme durumu hic yuklenmiyor; yenilemeden sonra ' +
    'odenmis her villa yeniden "borç" gorunur.'
  );

  // --- 10. Davranis: ay gercekten tarihten mi geliyor? ----------------------
  // Kaynak taramasi "sabit yazmiyor" der; bu iddia SAYIYI olcer.
  let app = null;
  try {
    app = require(path.join(KOK, 'app.js'));
  } catch (err) {
    no('20. app.js Node icinde yuklenebiliyor', String(err && err.message));
  }

  if (app && typeof app.buildCleaningExpenseRecord === 'function') {
    global.appData = { villas: { AZURE: { name: 'Test Villa' } } };
    const kayit = app.buildCleaningExpenseRecord({
      id: 'TASK-CLN-AZURE-1',
      villa: 'AZURE',
      amount: 1200,
      paid: true,
      paidDate: '2027-03-04',
      cleaner: 'Ayse'
    });
    check(
      kayit.month === '2027-03',
      '20. Mart 2027\'de odenen temizlik Mart 2027\'ye yaziliyor',
      `Beklenen '2027-03', gelen '${kayit.month}'. Sabit ay hatasi geri gelmis.`
    );
    check(
      kayit.date === '2027-03-04' && kayit.amount === 1200,
      '21. Gider kaydi tarih ve tutari odeme gununden aliyor',
      `date='${kayit.date}', amount=${kayit.amount}`
    );
    check(
      kayit.legacyId === 'EXP-CLEAN-TASK-CLN-AZURE-1',
      '22. Yerel anahtarli gorevin gider anahtari yerel anahtardan turer',
      `legacyId='${kayit.legacyId}'`
    );
    const uuidKayit = app.buildCleaningExpenseRecord({
      id: '11111111-2222-3333-4444-555555555555',
      dbId: '11111111-2222-3333-4444-555555555555',
      villa: 'AZURE',
      amount: 900,
      paid: true,
      paidDate: '2027-03-04'
    });
    check(
      uuidKayit.legacyId === 'EXP-CLEAN-11111111-2222-3333-4444-555555555555',
      '23. Yeniden yuklenmis gorevin gider anahtari UUID\'den turer',
      `legacyId='${uuidKayit.legacyId}'`
    );
    delete global.appData;
  } else if (app) {
    no('20-23. buildCleaningExpenseRecord disa aktarilmis',
      'Fonksiyon module.exports icinde yok; davranis olculemiyor.');
  }
}

try {
  run();
} finally {
  console.log('\n-----------------------------------------------------------------------------');
  console.log(`TOPLAM: ${passed} gecti, ${failed} kaldi`);
  console.log('-----------------------------------------------------------------------------');
  if (failed > 0) process.exit(1);
}
