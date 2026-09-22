/**
 * LEXBNB DEFTER DISA AKTARMA DENETIMI
 *
 * NE BULUNDU (22 Eylul 2026):
 *
 * Uygulamada tek bir disa aktarma vardi — `exportDataJSON()` — ve iki ayri
 * dugme onu cagiriyordu:
 *   * "📊 Portföy Performansı" bolumunde "💾 Raporu İndir (JSON)"
 *   * Ust menude "Veri Tabanı Yedeği İndir — Tüm kayıtları JSON olarak"
 *
 * Yaptigi sey `appData`'nin TAMAMINI ham JSON olarak dokmekti: misafir
 * adlari, telefonlari, riza kayitlari, planlanmis mesajlar dahil. Uc sorun:
 *   * Rapor DEGILDI; dugme "Rapor" diyordu, dosya ham veri yigiydi.
 *   * Donem filtresini YOK SAYIYORDU; ekranda Eylul secilyken her ay geliyordu.
 *   * YEDEK DE DEGILDI: JSON'u geri okuyan hicbir kod yok, yani geri
 *     yuklenemeyen bir "yedek"ti.
 *
 * Yerine gelenin tek kurali var ve bu denetimin omurgasi odur:
 * **disa aktarilan dosya GERI YUKLENEBILMELI.**
 *
 * Bolumler:
 *   A) MOTOR   — bicimlendirme (tarih, sayi, CSV kacisi, BOM, ayirici)
 *   B) TUR     — disa aktar -> geri oku -> BIREBIR ayni mi (asil olcum)
 *   C) TEK KAYNAK — sablon / disa aktarim / ice aktarma eslemesi ayni mi
 *   D) KAYNAK  — app.js ve index.html gercekten bu yoldan geciyor mu
 *
 * Eski gövdeye karsi kirilir: `finance_export_engine.js` ve `exportLedger`
 * yoktu (CLAUDE.md 5.5).
 *
 * Kaynak + saf mantik olcumudur; dis sisteme baglanmaz.
 */

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const APP_KAYNAK = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');

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

const REZERVASYONLAR = [
  { villa: 'CINAR', guest: 'Ayşe Şahin', checkIn: '2026-09-15', checkOut: '2026-09-19',
    gross: 72500.5, otaCommission: 0, cleaningFee: 1500, channel: 'WHATSAPP',
    pax: 8, status: 'CONFIRMED' },
  { villa: 'ZEYTIN', guest: 'Ömer Çelik', checkIn: '2026-09-20', checkOut: '2026-09-22',
    gross: 18500, otaCommission: 2775, cleaningFee: 1200, channel: 'AIRBNB',
    pax: 4, status: 'CHECKED_OUT' },
  // Noktali virgul + tirnak + Turkce buyuk İ: ucu de ayni satirda.
  { villa: 'CINAR', guest: 'İsmail Öz; "özel" not', checkIn: '2026-09-25', checkOut: '2026-09-28',
    gross: 41000, otaCommission: 0, cleaningFee: 0, channel: 'Direct',
    pax: 6, status: 'CANCELLED' }
];

const GIDERLER = [
  { date: '2026-09-03', category: 'Şömine & Yakacak', amount: 18000,
    description: 'Yakacak; kış', type: 'OPEX', villa: 'ALL' },
  { date: '2026-09-08', category: 'Bakım & Onarım', amount: 6500.75,
    description: 'Kombi', type: 'OPEX', villa: 'CINAR' },
  { date: '2026-09-14', category: 'Yatırım', amount: 45000,
    description: '', type: 'CAPEX', villa: 'CINAR' }
];

const MULKLER = [
  { id: 'p1', slug: 'CINAR', key: 'CINAR', name: 'Çınar' },
  { id: 'p2', slug: 'ZEYTIN', key: 'ZEYTIN', name: 'Zeytin' }
];
const CTX = {
  properties: MULKLER, existingBookings: [],
  isPeriodClosed: () => false, isStayPeriodClosed: () => false
};

// =============================================================================
// A) MOTOR
// =============================================================================
function motorTestleri(X, I) {
  console.log('\n--- A) MOTOR ---');

  const d = X.buildExport('BOOKINGS', REZERVASYONLAR);
  check(JSON.stringify(d.headers) === JSON.stringify(I.SABLON_SUTUNLARI.BOOKINGS),
    'A1. Basliklar SABLON_SUTUNLARI\'ndan geliyor (kopyalanmiyor)',
    'Disa aktarim kendi baslik listesini tutuyor; sablon degisince sessizce ' +
    'ayrisir ve indirilen dosya geri yuklenemez olur.\n       ' + JSON.stringify(d.headers));

  check(d.rows.length === 3 && d.rows.every(r => r.length === d.headers.length),
    'A2. Her satir baslik sayisi kadar hucre uretiyor',
    JSON.stringify(d.rows.map(r => r.length)));

  // --- Tarih ---
  check(X.disaTarih('2026-09-15') === '2026-09-15' &&
        X.disaTarih('15.09.2026') === '2026-09-15' &&
        X.disaTarih(new Date(Date.UTC(2026, 8, 15))) === '2026-09-15',
    'A3. Tarihler YYYY-MM-DD yaziliyor',
    'Gun/ay sirasi belirsiz bir bicim (03.04.2026) geri yuklenirken yanlis ' +
    'aya dusebilir. Donen: ' + [X.disaTarih('2026-09-15'), X.disaTarih('15.09.2026')].join(' / '));
  check(X.disaTarih('') === '' && X.disaTarih(null) === '' && X.disaTarih('abc') === '',
    'A4. Cozulemeyen tarih BOS birakiliyor, uydurulmuyor',
    'Bugunun tarihini yazmak kaydi yanlis gune tasir (3.6).');

  // --- Sayi ---
  check(X.disaSayi(0) === 0 && X.disaSayi('') === null && X.disaSayi(null) === null,
    'A5. 0 korunuyor, girilmemis deger null kaliyor',
    '"Girilmedi" ile "sifir" ayrimi burada da durmali (3.6). ' +
    JSON.stringify([X.disaSayi(0), X.disaSayi(''), X.disaSayi(null)]));
  check(X.disaSayi(72500.499) === 72500.5,
    'A6. Kurus duzeyinde yuvarlaniyor', String(X.disaSayi(72500.499)));

  // --- CSV ---
  const csv = X.toCSV(d);
  check(csv.charCodeAt(0) === 0xFEFF,
    'A7. CSV UTF-8 BOM ile basliyor',
    'BOM\'suz UTF-8\'i Turkce Windows\'ta Excel windows-1254 sanar ve ' +
    '"Misafir Adı" -> "Misafir AdÄ±" olur.');
  check(csv.split('\r\n')[0].indexOf(';') !== -1,
    'A8. CSV noktali virgulle ayriliyor',
    'Turkce yerel ayarda virgullu CSV tek sutun olarak acilir.');
  check(csv.indexOf('72500,5') !== -1 && csv.indexOf('72500.5') === -1,
    'A9. CSV\'de sayi TURK ondaligiyla, binlik ayrac OLMADAN yaziliyor',
    'Binlik ayrac ("72.500,50") SheetJS bayt yolunda 72.5005\'e donusuyordu; ' +
    'nokta ondalik ise Excel-TR yanlis okuyor. CSV: ' +
    csv.split('\r\n')[1]);
  check(csv.indexOf('"İsmail Öz; ""özel"" not"') !== -1,
    'A10. Ayirici ve tirnak iceren hucre kaciriliyor',
    'Kacirilmazsa tek bir misafir adi tum satiri kaydirir.\n       ' + csv.split('\r\n')[3]);
  check(csv.endsWith('\r\n') && csv.split('\r\n').filter(s => s).length === 4,
    'A11. CSV satir sonlari CRLF ve fazladan bos kayit yok',
    JSON.stringify(csv.split('\r\n')));

  // --- AOA (xlsx) ---
  const aoa = X.toAOA(d);
  check(typeof aoa[1][4] === 'number',
    'A12. XLSX yolunda sayi SAYI olarak kaliyor',
    'Metin olarak yazilirsa Excel onu hucrede metin gosterir ve toplama ' +
    'islemine sokmaz. Tip: ' + typeof aoa[1][4]);
  check(aoa[3][7] === 0,
    'A13. XLSX yolunda 0 degeri korunuyor (bos hucreye dusmuyor)',
    'Donen: ' + JSON.stringify(aoa[3][7]));

  // --- Dosya adi ---
  check(X.dosyaAdi('BOOKINGS', '2026-09', 'xlsx') === 'LexBnB_Rezervasyonlar_2026-09.xlsx' &&
        X.dosyaAdi('EXPENSES', '2026-09', 'csv') === 'LexBnB_Giderler_2026-09.csv',
    'A14. Dosya adi defteri ve donemi tasiyor',
    X.dosyaAdi('BOOKINGS', '2026-09', 'xlsx'));
  check(X.dosyaAdi('BOOKINGS', 'Özel Tarih/Aralığı', 'csv').indexOf('/') === -1,
    'A15. Dosya adindan gecersiz karakterler ayiklaniyor',
    X.dosyaAdi('BOOKINGS', 'Özel Tarih/Aralığı', 'csv'));

  // --- Sutun sayisi koruyucusu ---
  let durdu = false;
  try { X.buildExport('BILINMEYEN', []); } catch (e) { durdu = true; }
  check(durdu, 'A16. Bilinmeyen defter turu sessizce gecmiyor',
    'Tanimsiz tur bos bir dosya uretirdi.');
}

// =============================================================================
// B) TUR — asil olcum
// =============================================================================
function turTestleri(app, X, I) {
  console.log('\n--- B) TUR (disa aktar -> geri yukle) ---');

  const esitMi = (v, o) =>
    v.propertyKey === o.villa && v.guest === o.guest &&
    v.checkIn === o.checkIn && v.checkOut === o.checkOut &&
    v.gross === o.gross && v.otaCommission === o.otaCommission &&
    v.cleaningFee === o.cleaningFee && v.pax === o.pax && v.status === o.status;

  // --- CSV turu ---
  const csv = X.toCSV(X.buildExport('BOOKINGS', REZERVASYONLAR));
  const kaynakCsv = app.buildImportSource(Uint8Array.from(Buffer.from(csv, 'utf8')), 'geri.csv');
  const rCsv = I.validateBookingRows(kaynakCsv.rows,
    I.autoDetectColumnMap(kaynakCsv.headers, 'BOOKINGS'), CTX);

  check(rCsv.invalidCount === 0 && rCsv.validCount === REZERVASYONLAR.length,
    'B1. Disa aktarilan CSV hatasiz geri okunuyor',
    'gecerli=' + rCsv.validCount + ' hatali=' + rCsv.invalidCount +
    (rCsv.errors[0] ? ' | ' + rCsv.errors[0].errors.join(' ') : ''));

  const farkliCsv = rCsv.validatedRows.filter((v, i) => !esitMi(v, REZERVASYONLAR[i]));
  check(farkliCsv.length === 0,
    'B2. CSV turunda her alan BIREBIR geri geliyor',
    'Farkli satirlar: ' + JSON.stringify(farkliCsv.map(v => ({
      guest: v.guest, gross: v.gross, ota: v.otaCommission,
      temizlik: v.cleaningFee, pax: v.pax, durum: v.status
    }))));

  check(rCsv.validatedRows[0] && rCsv.validatedRows[0].gross === 72500.5,
    'B3. Kuruslu tutar turdan tam donuyor (72500,5)',
    'Donen: ' + (rCsv.validatedRows[0] && rCsv.validatedRows[0].gross) +
    ' — bu sayi phase33\'te SheetJS bayt yolunda 72.5005 oluyordu.');
  check(rCsv.validatedRows[2] && rCsv.validatedRows[2].guest === 'İsmail Öz; "özel" not',
    'B4. Ayirici, tirnak ve Turkce İ iceren misafir adi bozulmuyor',
    'Donen: ' + JSON.stringify(rCsv.validatedRows[2] && rCsv.validatedRows[2].guest));
  check(rCsv.validatedRows[2] && rCsv.validatedRows[2].status === 'CANCELLED',
    'B5. Iptal edilmis rezervasyon iptal olarak geri geliyor',
    'Durum kaybolursa iptal kayit CIRO\'ya geri sayilir.');

  // --- XLSX turu ---
  let XLSX = null;
  try { XLSX = require(path.join(KOK, 'xlsx.full.min.js')); } catch (e) { /* yok */ }
  if (!XLSX) {
    no('B6. Disa aktarilan XLSX hatasiz geri okunuyor', 'xlsx.full.min.js yuklenemedi.');
  } else {
    global.XLSX = XLSX;
    try {
      const d = X.buildExport('BOOKINGS', REZERVASYONLAR);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(X.toAOA(d)), 'Rezervasyonlar');
      const bayt = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
      const k = app.buildImportSource(bayt, 'geri.xlsx');
      const r = I.validateBookingRows(k.rows, I.autoDetectColumnMap(k.headers, 'BOOKINGS'), CTX);
      check(k.kind === 'XLSX' && r.invalidCount === 0 && r.validCount === REZERVASYONLAR.length,
        'B6. Disa aktarilan XLSX hatasiz geri okunuyor',
        'tur=' + k.kind + ' gecerli=' + r.validCount + ' hatali=' + r.invalidCount);
      check(r.validatedRows.filter((v, i) => !esitMi(v, REZERVASYONLAR[i])).length === 0,
        'B7. XLSX turunda her alan BIREBIR geri geliyor',
        JSON.stringify(r.validatedRows.map(v => ({ g: v.guest, br: v.gross }))));
    } finally {
      delete global.XLSX;
    }
  }

  // --- Gider turu ---
  const csvG = X.toCSV(X.buildExport('EXPENSES', GIDERLER));
  const kG = app.buildImportSource(Uint8Array.from(Buffer.from(csvG, 'utf8')), 'g.csv');
  const rG = I.validateExpenseRows(kG.rows, I.autoDetectColumnMap(kG.headers, 'EXPENSES'), CTX);
  check(rG.invalidCount === 0 && rG.validCount === GIDERLER.length,
    'B8. Disa aktarilan gider defteri hatasiz geri okunuyor',
    'gecerli=' + rG.validCount + ' hatali=' + rG.invalidCount +
    (rG.errors[0] ? ' | ' + rG.errors[0].errors.join(' ') : ''));
  const farkliG = rG.validatedRows.filter((v, i) => {
    const o = GIDERLER[i];
    return v.date !== o.date || v.category !== o.category || v.amount !== o.amount ||
      (v.description || '') !== o.description || v.expenseType !== o.type ||
      (v.propertyKey || 'ALL') !== o.villa;
  });
  check(farkliG.length === 0,
    'B9. Gider turunda her alan BIREBIR geri geliyor',
    JSON.stringify(farkliG.map(v => ({ t: v.date, tutar: v.amount, mulk: v.propertyKey }))));
  check(rG.validatedRows[0] && rG.validatedRows[0].propertyId === null,
    'B10. Portfoy geneli gider ("ALL") tur sonunda yine portfoy geneli',
    'Tek bir mulke baglanirsa gider yanlis mulkun karliligini bozar. ' +
    'propertyId=' + (rG.validatedRows[0] && rG.validatedRows[0].propertyId));
}

// =============================================================================
// C) TEK KAYNAK
// =============================================================================
function tekKaynakTestleri(I) {
  console.log('\n--- C) TEK KAYNAK ---');

  const varMi = !!(I.SABLON_SUTUNLARI && I.SABLON_SUTUNLARI.BOOKINGS && I.SABLON_SUTUNLARI.EXPENSES);
  check(varMi,
    'C1. SABLON_SUTUNLARI ice aktarma motorunda tanimli',
    'Sutun listesi uc ayri yerde yazilirsa sessizce ayrisir.');
  // Sabit yoksa geri kalan C olcumleri anlamsiz; ama kosu DURMAMALI,
  // yoksa D bolumu hic calismaz ve denetim tek bir satirla susar.
  if (!varMi) return;

  // Her baslik, kendi modunda GERCEKTEN taninmali.
  Object.keys(I.SABLON_SUTUNLARI).forEach(mod => {
    const basliklar = I.SABLON_SUTUNLARI[mod];
    const map = I.autoDetectColumnMap(basliklar, mod);
    const taninmayan = basliklar.filter(h =>
      !Object.keys(map).some(alan => map[alan] === h));
    check(taninmayan.length === 0,
      `C2. ${mod} sablon basliklarinin hepsi eslesme sozlugunde taniniyor`,
      'Taninmayan: ' + JSON.stringify(taninmayan) + '. Bir baslik sozlukte ' +
      'yoksa o sutun disa aktarilir ama geri yuklenirken YOK SAYILIR — veri ' +
      'sessizce kaybolur.');
  });

  // Zorunlu alanlarin hepsi sablonda bulunmali.
  const zorunlu = {
    BOOKINGS: ['property', 'guest', 'checkIn', 'checkOut', 'gross'],
    EXPENSES: ['date', 'category', 'amount']
  };
  Object.keys(zorunlu).forEach(mod => {
    const map = I.autoDetectColumnMap(I.SABLON_SUTUNLARI[mod], mod);
    const eksik = zorunlu[mod].filter(k => !map[k]);
    check(eksik.length === 0,
      `C3. ${mod} sablonunda zorunlu alanlarin hepsi var`,
      'Eksik: ' + eksik.join(', ') + '. Kendi disa aktardigimiz dosya ' +
      '"zorunlu sutun eksik" diye reddedilirdi.');
  });

  // Ornek sablon uretici de ayni listeden beslenmeli.
  const uretici = fs.readFileSync(path.join(KOK, 'scripts', 'build_sample_templates.js'), 'utf8');
  check(/basliklar:\s*SABLON_SUTUNLARI\.(BOOKINGS|EXPENSES)/.test(uretici) &&
        (uretici.match(/basliklar:\s*SABLON_SUTUNLARI\./g) || []).length === 2,
    'C4. Ornek sablon uretici de ayni sabitten besleniyor',
    'Uretici kendi baslik dizisini tutuyor; sablon ile disa aktarim ayrisabilir.');
}

// =============================================================================
// D) KAYNAK — app.js / index.html
// =============================================================================
function kaynakTestleri(app) {
  console.log('\n--- D) KAYNAK ---');

  check(typeof app.exportLedger === 'function',
    'D1. exportLedger app.js tarafindan disa aktariliyor', 'Fonksiyon yok.');
  check(typeof app.getExportEngine === 'function' && app.getExportEngine(),
    'D2. Disa aktarma motoru Node\'da da cozulebiliyor',
    'Cozulemezse bu denetim yalnizca kaynak taramasi olur (CLAUDE.md 5.5).');

  const toplayici = govde(APP, 'collectExportRecords') || '';
  check(toplayici.includes('isBookingInFilter') && toplayici.includes('isExpenseInFilter'),
    'D3. Disa aktarilan kayitlar EKRANDAKI filtreden geciyor',
    'Filtre yok sayilirsa kullanici Eylul secili iken her ayi indirir — ' +
    'eski JSON dokumunun hatasi tam olarak buydu.');

  const dis = govde(APP, 'exportLedger') || '';
  check(dis.includes('kayitlar.length === 0'),
    'D4. Bos donemde bos dosya indirtilmiyor, sebebi soyleniyor',
    'Bos bir dosya "disa aktarim calismadi" izlenimi verir.');
  check(dis.includes('buildExport'),
    'D5. Satirlar motordan uretiliyor', 'app.js kendi satirini kuruyor.');

  check(!/\bexportDataJSON\b/.test(APP),
    'D6. Ham JSON dokumu kaldirildi',
    '`appData`\'nin tamamini (misafir adi, telefon, riza kaydi, planlanmis ' +
    'mesaj) tek dosyaya doken, donem filtresini yok sayan ve GERI ' +
    'YUKLENEMEYEN bir "yedek" duruyor.');
  check(!/exportDataJSON\s*\(/.test(HTML),
    'D7. Arayuzde JSON dokumune giden dugme kalmadi',
    'Dugme duruyor ama fonksiyon yok: tiklayinca sessizce hicbir sey olmaz.');

  check(/core\/finance_export_engine\.js/.test(HTML),
    'D8. Disa aktarma motoru index.html\'de yukleniyor',
    'Modul tarayiciya hic girmez; `exportLedger` her zaman "motor ' +
    'yuklenemedi" der.');

  const cagrilar = (HTML.match(/exportLedger\('(BOOKINGS|EXPENSES)','(xlsx|csv)'\)/g) || []);
  check(cagrilar.length >= 4,
    'D9. Arayuz her iki defteri ve her iki bicimi sunuyor',
    'Bulunan: ' + JSON.stringify(cagrilar));

  check((govde(APP, 'triggerFileDownload') || '').includes('revokeObjectURL'),
    'D10. Indirme sonrasi object URL birakiliyor',
    'Birakilmazsa her disa aktarim sekme kapanana kadar bellekte kalir.');
}

// =============================================================================
// E) GUVENLIK — CSV formul enjeksiyonu
// =============================================================================
function guvenlikTestleri(app, X, I) {
  console.log('\n--- E) GUVENLIK ---');

  const tuzakli = [
    { villa: 'CINAR', guest: '=HYPERLINK("http://kotu.site","Fatura")', checkIn: '2026-09-15',
      checkOut: '2026-09-16', gross: 1000, otaCommission: 0, cleaningFee: 0,
      channel: 'X', pax: 2, status: 'CONFIRMED' },
    { villa: 'CINAR', guest: '+1+1', checkIn: '2026-09-17', checkOut: '2026-09-18',
      gross: -500, otaCommission: 0, cleaningFee: 0, channel: 'X', pax: 2, status: 'CONFIRMED' },
    { villa: 'CINAR', guest: '@SUM(1+1)', checkIn: '2026-09-19', checkOut: '2026-09-20',
      gross: 1000, otaCommission: 0, cleaningFee: 0, channel: 'X', pax: 2, status: 'CONFIRMED' },
    { villa: 'CINAR', guest: "'Ali", checkIn: '2026-09-21', checkOut: '2026-09-22',
      gross: 1000, otaCommission: 0, cleaningFee: 0, channel: 'X', pax: 2, status: 'CONFIRMED' }
  ];

  const csv = X.toCSV(X.buildExport('BOOKINGS', tuzakli));
  const satirlar = csv.split('\r\n');

  const korumasiz = satirlar.slice(1, 5).filter(s => /;[=+@]/.test(s));
  check(korumasiz.length === 0,
    'E1. Formulle baslayan hucreler METIN olarak sabitleniyor',
    'Excel `=`, `+`, `-`, `@` ile acilan bir CSV hucresini FORMUL sayar ve ' +
    'dosyayi acanin makinesinde calistirir. Misafir adina ' +
    '=HYPERLINK("http://kotu.site","Fatura") yazan biri, o defteri acan ' +
    'muhasebeciye tiklanabilir bir tuzak gonderir. Dosyayi BIZ urettigimiz ' +
    'icin sorumluluk bizdedir.\n       Korumasiz: ' + JSON.stringify(korumasiz));

  check(/;-500;/.test(csv),
    'E2. Negatif TUTAR tirnaklanmiyor (formul degil, sayidir)',
    'Sayiyi metne sabitlemek Excel\'de toplama islemini bozar. CSV: ' + satirlar[2]);

  // Tur bozulmamali: koruyucu geri okunurken soyulmali.
  const k = app.buildImportSource(Uint8Array.from(Buffer.from(csv, 'utf8')), 'g.csv');
  const farkli = k.rows.filter((r, i) => r['Misafir Adı'] !== tuzakli[i].guest);
  check(farkli.length === 0,
    'E3. Koruyucu geri okunurken soyuluyor — tur bozulmuyor',
    'Soyulmazsa misafir adi her disa aktarim/geri yukleme turunda bir tirnak ' +
    'daha kazanir. Farkli: ' + JSON.stringify(farkli.map(r => r['Misafir Adı'])));

  check(I.formulKoruyucusunuSoy("'Ali") === "'Ali",
    'E4. Formul karakteri olmayan tek tirnak KORUNUYOR',
    'Kor bir soyma, tirnakla baslayan mesru bir degeri bozardi. Donen: ' +
    JSON.stringify(I.formulKoruyucusunuSoy("'Ali")));

  // XLSX yolu: hucre metin tipinde olmali, formul alani bulunmamali.
  let XLSX = null;
  try { XLSX = require(path.join(KOK, 'xlsx.full.min.js')); } catch (e) { /* yok */ }
  if (!XLSX) {
    no('E5. XLSX hucresi formula donusmuyor', 'xlsx.full.min.js yuklenemedi.');
    return;
  }
  const d = X.buildExport('BOOKINGS', tuzakli);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(X.toAOA(d)), 'R');
  const hucre = wb.Sheets['R']['B2'];
  check(hucre && hucre.t === 's' && hucre.f === undefined,
    'E5. XLSX hucresi formula donusmuyor',
    'Hucre tipi=' + (hucre && hucre.t) + ' formul=' + (hucre && hucre.f));
}

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB DEFTER DISA AKTARMA DENETIMI');
  console.log('=============================================================================');

  const I = require(path.join(KOK, 'core', 'finance_import_engine.js'));
  const app = require(path.join(KOK, 'app.js'));

  let X = null;
  try { X = require(path.join(KOK, 'core', 'finance_export_engine.js')); } catch (e) { /* yok */ }

  if (X) {
    motorTestleri(X, I);
    turTestleri(app, X, I);
    guvenlikTestleri(app, X, I);
  } else {
    // Motor yoksa A ve B kosturulamaz — ama C ve D yalnizca ice aktarma
    // motoruna ve kaynaga bakar, onlar yine kossun. Yoksa denetim "neyin
    // bozuk oldugunu" degil sadece "bir sey eksik"i soyler.
    no('0. core/finance_export_engine.js var',
      'Disa aktarma motoru yok: defter disariya yalnizca ham JSON olarak ' +
      'cikiyor ve geri yuklenemiyor.');
  }
  tekKaynakTestleri(I);
  kaynakTestleri(app);
}

try {
  run();
} catch (e) {
  no('KOSU', 'Denetim yarida kesildi: ' + (e && e.message ? e.message : e));
} finally {
  console.log('\n-----------------------------------------------------------------------------');
  console.log(`TOPLAM: ${passed} gecti, ${failed} kaldi`);
  console.log('-----------------------------------------------------------------------------');
  if (failed > 0) process.exit(1);
}
