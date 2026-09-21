/**
 * LEXBNB CSV / METIN ICE AKTARMA DENETIMI (phase33)
 *
 * NE BULUNDU (21 Eylul 2026 olcumu):
 *
 * Dosya secici `.csv, .tsv, .txt` kabul ediyordu, kutu "CSV Raporunuzu
 * Buraya Surukleyin" diyordu — ama app.js'te NE CSV yolu NE surukleme olayi
 * vardi. Her dosya SheetJS'in bayt yoluna gidiyordu. Ayni ornek satirla
 * olculen sonuclar:
 *
 *   "72.500,50"        ->  72.5005      (raw:true sayiyi ABD bicimi saniyor)
 *   UTF-8, BOM yok     ->  "Misafir AdÄ±",  "AyÅe Åahin"
 *   windows-1254       ->  "Misafir Ad1",  "Ay_e ^ahin"   (Turk Excel varsayilani)
 *   sekme ayirici      ->  tum satir TEK sutun
 *   tirnak icinde \n   ->  2 kayit 3 kayda bolunuyor, tutar kayiyor
 *   dosya birakma      ->  tarayici uygulamadan cikip dosyaya gidiyor
 *
 * Ilki en tehlikelisidir cunku SESSIZDIR: 72.500,50 TL'lik bir rezervasyon
 * 72,50 TL olarak yazilir, ekranda makul bir sayi durur ve ciro bininci
 * katina duser. Digerleri gurultuludur (sutun eslesmez) ama misafir adi
 * eslesirse bozuk metin Postgres'e gider.
 *
 * Bu denetim uc katmani olcer:
 *   A) MOTOR   — parseCSV / decodeImportText / detectImportSourceKind
 *   B) KAYNAK  — app.js metin yolundan geciyor mu, surukleme bagli mi
 *   C) ARAYUZ  — index.html ve style.css vaat ettigini yapiyor mu
 *
 * Eski koda karsi kirilir (CLAUDE.md 5.5).
 *
 * Kaynak + saf mantik olcumudur; dis sisteme baglanmaz.
 */

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const APP_KAYNAK = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(KOK, 'style.css'), 'utf8');

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

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const TAB = String.fromCharCode(9);

/** windows-1254 baytlari: Turkce harfler 1254'teki karsiliklarina cevrilir. */
function win1254(metin) {
  const esleme = { 'ı': 0xFD, 'İ': 0xDD, 'ş': 0xFE, 'Ş': 0xDE, 'ğ': 0xF0, 'Ğ': 0xD0 };
  const cikti = [];
  for (const c of String(metin)) {
    if (esleme[c] !== undefined) cikti.push(esleme[c]);
    else cikti.push(...Buffer.from(c, 'latin1'));
  }
  return Uint8Array.from(cikti);
}

const baytlar = (s, kod) => Uint8Array.from(Buffer.from(s, kod || 'utf8'));

// =============================================================================
// A) MOTOR
// =============================================================================
function motorTestleri(E) {
  console.log('\n--- A) MOTOR ---');

  // Eksik bir export yuzunden bolumun TAMAMI atlanmasin: o zaman denetim
  // "hangi davranis bozuk" degil yalnizca "bir sey eksik" der. Eksikler
  // FAIL olarak yazilir, var olanlarin davranisi yine de olculur.
  const varMi = (ad) => {
    if (typeof E[ad] === 'function') return true;
    no(`A0. FinanceImportEngine.${ad} disa aktariliyor`,
      'Fonksiyon yok: metin dosyasi yolu kurulmamis, CSV yuklemesi SheetJS ' +
      'bayt yoluna dusuyor ve "72.500,50" -> 72.5005 oluyor.');
    return false;
  };
  const parseVar = varMi('parseCSV');
  const ayiriciVar = varMi('detectDelimiter');
  const imzaVar = varMi('detectImportSourceKind');
  const kodVar = varMi('decodeImportText');
  if (!parseVar) return;

  // --- Ayirici ---------------------------------------------------------------
  const tsv = E.parseCSV(['Tarih' + TAB + 'Kategori' + TAB + 'Tutar',
    '15.03.2026' + TAB + 'BAKIM' + TAB + '1500'].join(NL));
  check(tsv.headers.length === 3 && tsv.rows.length === 1 && tsv.rows[0]['Tutar'] === '1500',
    'A1. Sekme ile ayrilmis dosya (TSV) uc sutun olarak okunur',
    'Sekme taninmiyor; tum satir TEK sutun oluyor ve dosya "zorunlu sutun ' +
    'eksik" ile reddediliyor. Excel\'in "Unicode Metin (.txt)" disa aktarimi ' +
    'tam olarak budur. Okunan: ' + JSON.stringify(tsv.headers));

  const boru = E.parseCSV(['Tarih|Kategori|Tutar', '15.03.2026|BAKIM|1500'].join(NL));
  check(boru.headers.length === 3,
    'A2. Dikey cizgi ile ayrilmis dosya okunur',
    'Okunan: ' + JSON.stringify(boru.headers));

  const noktaliVirgul = E.parseCSV(['Tarih;Kategori;Tutar', '15.03.2026;BAKIM;"1.234,56"'].join(NL));
  check(noktaliVirgul.headers.length === 3 && noktaliVirgul.rows[0]['Tutar'] === '1.234,56',
    'A3. Noktali virgul ve tirnakli alan (mevcut sozlesme korunuyor)',
    JSON.stringify(noktaliVirgul));

  const virgul = E.parseCSV('Tarih,Kategori,Tutar,Açıklama,Ev' + NL +
    '2026-08-01,Elektrik,3500,"Ağustos faturası",Villa Bella Vista');
  check(virgul.headers.length === 5 && virgul.rows[0]['Ev'] === 'Villa Bella Vista',
    'A4. Virgullu dosya ve tirnak icindeki bosluklu alan (mevcut sozlesme)',
    JSON.stringify(virgul.rows[0]));

  if (ayiriciVar) {
    check(E.detectDelimiter('"Villa Bella Vista, Kalkan";Tutar') === ';',
      'A5. Ayirici sayimi TIRNAK DISINDA yapilir',
      'Tirnak icindeki virgul sayiliyor; basliginda virgul gecen tek bir mulk ' +
      'adi tum dosyanin ayiricisini yanlis sectiriyor.');

    check(E.detectDelimiter('TekSutun') === ',',
      'A6. Ayirici bulunamayan dosyada varsayilan virguldur',
      'Donen: ' + JSON.stringify(E.detectDelimiter('TekSutun')));
  }

  // --- Tirnak icinde satir sonu ---------------------------------------------
  const cokSatirli = E.parseCSV([
    'Tarih;Kategori;Açıklama;Tutar',
    '15.03.2026;BAKIM;"Kombi arizasi' + NL + 'ikinci satir";1500',
    '16.03.2026;FATURA;Elektrik;900'
  ].join(NL));
  check(cokSatirli.rows.length === 2,
    'A7. Tirnak icindeki satir sonu kaydi BOLMEZ',
    'Satir sonu tirnak icinde de kayit bitiriyor: iki satirlik bir gider ' +
    'aciklamasi 2 kaydi 3 kayda ceviriyor, tutar bir sonraki satira kayiyor ' +
    've 1500 TL kayboluyor. Okunan satir sayisi: ' + cokSatirli.rows.length);
  check(cokSatirli.rows.length === 2 &&
        cokSatirli.rows[0]['Açıklama'] === 'Kombi arizasi' + NL + 'ikinci satir' &&
        cokSatirli.rows[0]['Tutar'] === '1500',
    'A8. Bolunmeyen kaydin alanlari yerinde kalir',
    JSON.stringify(cokSatirli.rows[0]));

  // --- Satir sonu bicimleri --------------------------------------------------
  const crlf = E.parseCSV('a;b' + CR + NL + '1;2' + CR + NL);
  check(crlf.rows.length === 1 && crlf.rows[0]['b'] === '2',
    'A9. CRLF satir sonu ve dosya sonundaki bos satir dogru islenir',
    JSON.stringify(crlf.rows));

  const bosluklu = E.parseCSV('a;b' + NL + NL + '1;2' + NL + ';' + NL);
  check(bosluklu.rows.length === 1,
    'A10. Bos satirlar kayit uretmez',
    'Okunan: ' + JSON.stringify(bosluklu.rows));

  // --- Tirnak kacislari ------------------------------------------------------
  const kacis = E.parseCSV('Ad;Not' + NL + 'X;"12"" balkon"');
  check(kacis.rows[0]['Not'] === '12" balkon',
    'A11. Ikili tirnak tek tirnaga cozulur',
    JSON.stringify(kacis.rows[0]));

  // --- BOM -------------------------------------------------------------------
  const bom = E.parseCSV('﻿Tarih;Tutar' + NL + '15.03.2026;500');
  check(bom.headers[0] === 'Tarih',
    'A12. Metne kacan BOM ilk baslik adina yapismaz',
    'Ilk baslik: ' + JSON.stringify(bom.headers[0]) + ' — BOM yapisirsa ' +
    '"Tarih" sutunu hicbir eslemede bulunamaz.');

  // --- SAYIYA CEVIRMEME (en kritik madde) ------------------------------------
  const para = E.parseCSV('Brüt Tutar (TL)' + NL + '"72.500,50"');
  const hucre = para.rows[0]['Brüt Tutar (TL)'];
  check(typeof hucre === 'string' && hucre === '72.500,50',
    'A13. Hucreler STRING kalir — ayristirici sayi uretmez',
    'Donen: ' + JSON.stringify(hucre) + ' (' + typeof hucre + '). Ayristirici ' +
    'sayiya cevirirse Turk bicimli "72.500,50" ABD bicimi sanilip 72.5005 ' +
    'olur: 72.500,50 TL\'lik rezervasyon 72,50 TL olarak yazilir.');
  check(E.normalizeAmount(hucre) === 72500.5,
    'A14. normalizeAmount metni dogru okur (72.500,50 -> 72500.5)',
    'Donen: ' + E.normalizeAmount(hucre));

  let sayiVar = false;
  E.parseCSV('a;b' + NL + '1;2,5').headers.forEach(() => {});
  Object.values(E.parseCSV('a;b' + NL + '1;2,5').rows[0]).forEach(v => {
    if (typeof v !== 'string') sayiVar = true;
  });
  check(!sayiVar,
    'A15. Sade sayilar bile string olarak tasinir',
    'Ayristirici tur tahmini yapiyor; yorum normalizeAmount/normalizeDate\'in isidir.');

  // --- Kaynak turu imzasi ----------------------------------------------------
  if (imzaVar) {
    check(E.detectImportSourceKind(Uint8Array.from([0x50, 0x4B, 0x03, 0x04])) === 'XLSX',
      'A16. PK imzasi XLSX olarak taninir', 'Zip imzasi taninmiyor.');
    check(E.detectImportSourceKind(Uint8Array.from([0xD0, 0xCF, 0x11, 0xE0])) === 'XLS',
      'A17. OLE2 imzasi eski XLS olarak taninir', 'OLE2 imzasi taninmiyor.');
    check(E.detectImportSourceKind(baytlar('Villa;Misafir')) === 'TEXT',
      'A18. Imzasiz dosya METIN sayilir',
      'Uzantiya degil imzaya bakilmali: OTA disa aktarimlari uzantiyi duzenli ' +
      'olarak yanlis verir.');
  }

  // --- Kod sayfasi -----------------------------------------------------------
  if (!kodVar) return;
  const gov = 'Villa;Misafir Adı' + NL + 'M1;Ayşe Şahin';
  check(E.decodeImportText(baytlar('﻿' + gov)) === gov,
    'A19. UTF-8 BOM ayiklanarak cozulur', JSON.stringify(E.decodeImportText(baytlar('﻿' + gov))));
  check(E.decodeImportText(baytlar(gov)) === gov,
    'A20. BOM\'suz UTF-8 dogru cozulur',
    'Cozulen: ' + JSON.stringify(E.decodeImportText(baytlar(gov))) +
    ' — latin1 varsayilirsa "Misafir AdÄ±" olur ve sutun hic eslesmez.');
  check(E.decodeImportText(win1254(gov)) === gov,
    'A21. windows-1254 dogru cozulur (Turk Excel\'in CSV varsayilani)',
    'Cozulen: ' + JSON.stringify(E.decodeImportText(win1254(gov))) +
    ' — UTF-8 varsayilirsa "Ay_e ^ahin" olur ve bozuk metin Postgres\'e gider.');
  const u16 = Uint8Array.from(Buffer.concat([
    Buffer.from([0xFF, 0xFE]), Buffer.from(gov.replace(/;/g, TAB), 'utf16le')]));
  check(E.decodeImportText(u16) === gov.replace(/;/g, TAB),
    'A22. UTF-16LE BOM cozulur (Excel "Unicode Metin" disa aktarimi)',
    JSON.stringify(E.decodeImportText(u16)));
  check(E.decodeImportText(new Uint8Array(0)) === '',
    'A23. Bos dosya cokmez', 'Bos baytta hata firlatiyor.');
}

// =============================================================================
// B) APP.JS — metin yolu gercekten kullaniliyor mu
// =============================================================================
function kaynakTestleri(app) {
  console.log('\n--- B) APP.JS ---');

  check(typeof app.buildImportSource === 'function',
    'B1. buildImportSource app.js tarafindan disa aktariliyor',
    'Metin yolu yok: her dosya SheetJS bayt yoluna gidiyor.');

  const hfi = govde(APP, 'handleFileImport') || '';
  check(hfi && !hfi.includes('XLSX.read'),
    'B2. handleFileImport artik dogrudan XLSX.read cagirmiyor',
    'Dosya turu sorulmadan Excel varsayiliyor; CSV bayt yoluna dusuyor.');
  check(hfi.includes('readImportFile'),
    'B3. handleFileImport tek okuma yolundan geciyor',
    'Dosya secici ve surukle-birak ayri yollardan giderse ikisi ayrisir.');

  const bis = govde(APP, 'buildImportSource') || '';
  check(bis.includes('detectImportSourceKind'),
    'B4. Kaynak turu bayt imzasindan belirleniyor',
    'Uzantiya guvenmek OTA disa aktarimlarinda yaniltir.');
  check(bis.includes('decodeImportText') && bis.includes('parseCSV'),
    'B5. Metin dosyasi kod sayfasi cozulup parseCSV ile ayristiriliyor',
    'Motorda parseCSV var ama app.js onu HIC cagirmiyorsa CSV yolu yok demektir.');

  const rip = govde(APP, 'readImportFile') || '';
  check(rip.includes('buildImportSource'),
    'B6. readImportFile kaynagi buildImportSource ile kuruyor', 'Yol ayrisimis.');

  const cim = govde(APP, 'changeImportMode') || '';
  check(cim.includes('pendingImportData.source'),
    'B7. Tur secici kaynak nesnesi uzerinden yeniden ayristiriyor',
    'Eski `pendingImportData.workbook` kontrolu duruyor: CSV yuklendiginde ' +
    'workbook olmadigi icin tur secici SESSIZCE hicbir sey yapmaz.');

  check(!/\bparseWorkbookWithMode\b|\banalyzeAndPreviewWorkbook\b/.test(APP),
    'B8. Yalnizca workbook bilen eski yol kaldirildi',
    'Iki yol birden durursa hangisinin kostugu belirsizlesir.');

  // --- Surukle birak ---------------------------------------------------------
  const drop = govde(APP, 'initImportDropzone') || '';
  check(drop,
    'B9. initImportDropzone var',
    'Kutu "Buraya Surukleyin" diyor ama hicbir surukleme olayi bagli degil: ' +
    'dosya birakilinca tarayici sekmeyi o dosyaya goturuyor ve kullanici ' +
    'uygulamadan cikiyor.');
  check(drop.includes("'drop'") && drop.includes('dataTransfer') && drop.includes('readImportFile'),
    'B10. Birakilan dosya okuma yoluna veriliyor', 'drop olayi dosyayi islemiyor.');
  check(drop.includes('preventDefault'),
    'B11. Tarayicinin varsayilan davranisi durduruluyor',
    'preventDefault yoksa dosya yine de sekmede aciliyor.');
  check(drop.includes('zone.contains'),
    'B12. Kutunun DISINA birakilan dosya da sekmeyi goturmuyor',
    'Kullanici kutuyu isabet ettiremezse yarim kalan formunu kaybeder.');
  check((govde(APP, 'openImportModal') || '').includes('initImportDropzone'),
    'B13. Surukleme kapisi modal acilinca baglaniyor', 'initImportDropzone hic cagrilmiyor.');

  const kapat = govde(APP, 'closeImportModal') || '';
  check(kapat.includes('resetImportPreview'),
    'B14. Modal kapaninca ayristirilmis dosya birakiliyor',
    'Yalnizca kutu gizleniyor; `pendingImportData` ayakta kaliyor ve modal ' +
    'yeniden acilip tur secici oynatildiginda KAPATILAN dosyanin onizlemesi ' +
    'geri geliyor.');

  check(!/\bpendingImportRows\b/.test(APP),
    'B15. Olu `pendingImportRows` degiskeni kaldirildi',
    'Yalnizca null atanan, hicbir yerde okunmayan degisken duruyor.');

  // --- Tek sutun ipucu -------------------------------------------------------
  const onizleme = govde(APP, 'renderImportPreviewBox') || '';
  check(onizleme.includes('Sütun ayırıcısı bulunamadı'),
    'B16. Tek sutun okunan metin dosyasinda sebep ACIKCA soyleniyor',
    '"Zorunlu sutun eksik" demek kullaniciyi basliklarini duzeltmeye ' +
    'gonderir; oysa duzeltilecek sey dosyanin kaydedilme bicimidir.');

  // --- Node yolu -------------------------------------------------------------
  check(typeof app.getImportEngine === 'function' && app.getImportEngine(),
    'B17. Motor Node\'da da cozulebiliyor',
    'Cozulemezse bu denetim yalnizca kaynak taramasi olarak kalir ve gercek ' +
    'davranis hic olculmez (CLAUDE.md 5.5).');
}

// =============================================================================
// B2) DAVRANIS — buildImportSource gercekten kosturuluyor
// =============================================================================
function davranisTestleri(app) {
  console.log('\n--- B2) DAVRANIS ---');
  if (typeof app.buildImportSource !== 'function') {
    no('B18. buildImportSource kosturulabiliyor', 'Fonksiyon yok.');
    return;
  }

  const govdeMetni = ['Villa;Misafir Adı;Giriş Tarihi;Çıkış Tarihi;Brüt Tutar (TL)',
    'M1;Ayşe Şahin;15.03.2026;19.03.2026;"72.500,50"'].join(NL);

  const utf8 = app.buildImportSource(baytlar('﻿' + govdeMetni), 'defter.csv');
  check(utf8.kind === 'CSV' && utf8.headers.length === 5,
    'B18. UTF-8 CSV bes sutunlu bir CSV kaynagi olarak kuruluyor',
    JSON.stringify({ kind: utf8.kind, headers: utf8.headers }));
  check(utf8.rows[0]['Brüt Tutar (TL)'] === '72.500,50',
    'B19. Tutar bozulmadan tasiniyor',
    'Donen: ' + JSON.stringify(utf8.rows[0]['Brüt Tutar (TL)']) +
    ' — SheetJS bayt yolu burada 72.5005 uretiyordu.');
  check(utf8.fileName === 'defter.csv' && Array.isArray(utf8.sheetNames),
    'B20. Kaynak nesnesi dosya adini ve sayfa listesini tasiyor', JSON.stringify(utf8.sheetNames));

  const t1254 = app.buildImportSource(win1254(govdeMetni), 'defter.csv');
  check(t1254.headers[1] === 'Misafir Adı' && t1254.rows[0]['Misafir Adı'] === 'Ayşe Şahin',
    'B21. windows-1254 CSV\'de baslik ve misafir adi bozulmuyor',
    JSON.stringify({ headers: t1254.headers, ad: t1254.rows[0] && t1254.rows[0]['Misafir Adı'] }));

  // XLSX yolu bozulmadi mi? Ayni dosya iki yoldan da ayni sonucu vermeli.
  let XLSX = null;
  try { XLSX = require(path.join(KOK, 'xlsx.full.min.js')); } catch (e) { /* yok */ }
  if (!XLSX) {
    no('B22. XLSX yolu hala calisiyor', 'xlsx.full.min.js yuklenemedi, olculemedi.');
    return;
  }
  global.XLSX = XLSX;
  try {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { 'Villa': 'M1', 'Misafir Adı': 'Ayşe Şahin', 'Brüt Tutar (TL)': 72500.5 }
    ]), 'Rezervasyonlar');
    const bayt = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const x = app.buildImportSource(bayt, 'defter.xlsx');
    check(x.kind === 'XLSX' && x.rows.length === 1 && x.rows[0]['Brüt Tutar (TL)'] === 72500.5,
      'B22. XLSX yolu hala calisiyor ve sayisal hucre sayi kaliyor',
      JSON.stringify({ kind: x.kind, rows: x.rows }));
    check(x.sheetNames.length === 1 && x.sheetNames[0] === 'Rezervasyonlar',
      'B23. XLSX sayfa adlari kaynaga tasiniyor (Sirket Raporu sezgisi buna bakar)',
      JSON.stringify(x.sheetNames));
    check(app.buildImportSource(bayt, 'yanlis-ad.csv').kind === 'XLSX',
      'B24. Uzantisi yanlis verilmis Excel dosyasi yine Excel olarak okunuyor',
      'Uzantiya guveniliyor; .csv diye kaydedilmis bir xlsx metin sanilip cozulemez.');
  } finally {
    delete global.XLSX;
  }
}

// =============================================================================
// C) ARAYUZ — vaat ile davranis ortusuyor mu
// =============================================================================
function arayuzTestleri() {
  console.log('\n--- C) ARAYUZ ---');

  const kabul = (HTML.match(/id="excelFileInput"[^>]*accept="([^"]*)"/) || [])[1] || '';
  check(!kabul.includes('.json'),
    'C1. Dosya secici uygulanmayan bir bicim vaat etmiyor',
    'accept listesinde `.json` var ama JSON\'u okuyan hicbir kod yok: ' +
    'kullanici secebiliyor, dosya hata veriyor. Kabul edilen: ' + kabul);
  check(kabul.includes('.csv') && kabul.includes('.tsv'),
    'C2. CSV ve TSV kabul ediliyor', 'Kabul edilen: ' + kabul);

  check(!/CSV ve Şirket Raporlarını Otomatik Çözer/.test(HTML),
    'C3. "Sirket Raporlarini Otomatik Cozer" vaadi kaldirildi',
    'Sirket genel raporu BILEREK ice aktarilmiyor (aylik toplamdan ' +
    'rezervasyon uretmek uydurma veri olurdu, 3.6) — ama basligi hala ' +
    'cozdugunu soyluyor.');

  check(/\.upload-dropzone\.dropzone-active/.test(CSS),
    'C4. Surukleme sirasinda kutu geri bildirim veriyor',
    'Birakmanin bir sey yapacagi gorunmezse kullanici tarayicinin ' +
    'varsayilanina guvenip kutunun disina birakiyor.');
  check(/\.upload-dropzone\.dropzone-active[^}]*!important/.test(CSS),
    'C5. Aktif kutu stili satir ici stili yenebiliyor',
    '#excelDropzone border/background degerlerini SATIR ICI style ile ' +
    'veriyor; satir ici bildirim sinif secicisini yener ve geri bildirim ' +
    'hic gorunmez.');
}

// =============================================================================
// D) BASLIK ESLESMESI — Turkce buyuk "İ" tuzagi
// =============================================================================
function baslikTestleri(E) {
  console.log('\n--- D) BASLIK ESLESMESI ---');

  const alan = (h, mod, k) => E.autoDetectColumnMap([h], mod)[k];

  check(alan('İşlem Tarihi', 'EXPENSES', 'date') === 'İşlem Tarihi',
    'D1. Turkce buyuk İ ile baslayan baslik taniniyor ("İşlem Tarihi")',
    'JavaScript\'te \'İ\'.toLowerCase() sonucu \'i\' DEGIL, \'i\' + U+0307 ' +
    '(birlestirici ustnokta). Sozlukteki "işlem tarihi" ile asla eslesmiyor ' +
    've banka ekstresi bicimindeki dosya "zorunlu sutun eksik" ile ' +
    'reddediliyor. Donen: ' + JSON.stringify(alan('İşlem Tarihi', 'EXPENSES', 'date')));

  check(alan('İsim', 'BOOKINGS', 'guest') === 'İsim',
    'D2. "İsim" misafir adi olarak taniniyor', 'Ayni U+0307 tuzagi.');

  check(alan('Misafir Sayısı', 'BOOKINGS', 'pax') === 'Misafir Sayısı',
    'D3. "Misafir Sayısı" kisi sayisi olarak taniniyor',
    'Sozlukte yalnizca noktasiz "misafir sayisi" vardi.');

  // Duzeltme Ingilizce adlari bozmamali: `toLocaleLowerCase("tr")` kullanmak
  // 'I' harfini 'ı'ya cevirir ve bu kez "Invoice"/"ID"/"ISIM" kirilir.
  const ing = { Property: 'property', Guest: 'guest', 'Check-in': 'checkIn',
    'Check-out': 'checkOut', Gross: 'gross' };
  const bozulan = Object.keys(ing).filter(h => alan(h, 'BOOKINGS', ing[h]) !== h);
  check(bozulan.length === 0,
    'D4. Ingilizce basliklar duzeltmeden etkilenmiyor',
    'Bozulan: ' + bozulan.join(', ') + '. Turkce yerel kucultme I -> ı ' +
    'cevirdigi icin sozlukteki Ingilizce adlari kirar.');

  check(alan('Isim', 'BOOKINGS', 'guest') === 'Isim' &&
        alan('Islem Tarihi', 'EXPENSES', 'date') === 'Islem Tarihi',
    'D5. Noktasiz yazimlar da calismaya devam ediyor', 'Eski davranis kayboldu.');
}

// =============================================================================
// E) YAYINLANAN ORNEK SABLONLAR
// =============================================================================
function sablonTestleri(app, E) {
  console.log('\n--- E) ORNEK SABLONLAR ---');

  const KLASOR = path.join(KOK, 'sablonlar');
  const dosyalar = ['lexbnb-rezervasyon-sablonu.csv', 'lexbnb-rezervasyon-sablonu.xlsx',
    'lexbnb-gider-sablonu.csv', 'lexbnb-gider-sablonu.xlsx'];

  const eksik = dosyalar.filter(d => !fs.existsSync(path.join(KLASOR, d)));
  check(eksik.length === 0,
    'E1. Dort ornek sablon depoda yayinlanmis durumda',
    'Eksik: ' + eksik.join(', ') + '. Arayuzdeki indirme baglantilari 404 verir.');
  if (eksik.length) return;

  // CSV sablonlari Excel tarafindan da dogru acilmali.
  ['lexbnb-rezervasyon-sablonu.csv', 'lexbnb-gider-sablonu.csv'].forEach((d, i) => {
    const ham = fs.readFileSync(path.join(KLASOR, d));
    check(ham[0] === 0xEF && ham[1] === 0xBB && ham[2] === 0xBF,
      `E${2 + i}. ${d} UTF-8 BOM ile yaziliyor`,
      'BOM\'suz bir UTF-8 CSV\'yi Turkce Windows\'ta Excel windows-1254 sanar ' +
      've "Misafir Adı" -> "Misafir AdÄ±" olur. Kendi motorumuz ikisini de ' +
      'cozer, musterinin Excel\'i cozmez.');
    check(ham.toString('utf8').split(/\r?\n/)[0].includes(';'),
      `E${4 + i}. ${d} noktali virgulle ayrilmis`,
      'Turkce yerel ayarda Excel\'in liste ayiricisi ";" oldugu icin virgullu ' +
      'bir CSV tek sutun olarak acilir.');
  });

  // En onemlisi: verdigimiz sablon KENDI ice aktaricimizdan geciyor mu?
  const ctx = {
    properties: [
      { id: 'p1', slug: 'MULK_KODU_1', key: 'MULK_KODU_1', name: 'Villa A' },
      { id: 'p2', slug: 'MULK_KODU_2', key: 'MULK_KODU_2', name: 'Villa B' }
    ],
    existingBookings: [], isPeriodClosed: () => false, isStayPeriodClosed: () => false
  };

  let XLSX = null;
  try { XLSX = require(path.join(KOK, 'xlsx.full.min.js')); } catch (e) { /* yok */ }
  if (XLSX) global.XLSX = XLSX;
  try {
    dosyalar.forEach((d, i) => {
      const kaynak = app.buildImportSource(
        new Uint8Array(fs.readFileSync(path.join(KLASOR, d))), d);
      const mod = d.includes('rezervasyon') ? 'BOOKINGS' : 'EXPENSES';
      const zor = (mod === 'BOOKINGS')
        ? ['property', 'guest', 'checkIn', 'checkOut', 'gross']
        : ['date', 'category', 'amount'];
      const map = E.autoDetectColumnMap(kaynak.headers, mod);
      const eksikSutun = zor.filter(k => !map[k]);
      const r = (mod === 'BOOKINGS')
        ? E.validateBookingRows(kaynak.rows, map, ctx)
        : E.validateExpenseRows(kaynak.rows, map, ctx);

      check(eksikSutun.length === 0 && r.validCount === kaynak.rows.length && r.invalidCount === 0,
        `E${6 + i}. ${d} kendi ice aktaricimizdan hatasiz geciyor`,
        'Eksik sutun: ' + (eksikSutun.join(', ') || '-') +
        ' | gecerli=' + r.validCount + ' hatali=' + r.invalidCount +
        (r.errors && r.errors.length ? ' | ' + r.errors[0].errors.join(' ') : '') +
        '. Musteriye verdigimiz sablonun yuklenememesi en utanc verici hatadir.');
    });

    // Yer tutucu korumasi: sablon DEGISTIRILMEDEN yuklenirse hicbir sey yazilmamali.
    const yabanci = {
      properties: [{ id: 'p9', slug: 'CINAR', key: 'CINAR', name: 'Villa Çınar' }],
      existingBookings: [], isPeriodClosed: () => false, isStayPeriodClosed: () => false
    };
    const rez = app.buildImportSource(
      new Uint8Array(fs.readFileSync(path.join(KLASOR, 'lexbnb-rezervasyon-sablonu.csv'))), 'r.csv');
    const rr = E.validateBookingRows(rez.rows,
      E.autoDetectColumnMap(rez.headers, 'BOOKINGS'), yabanci);
    check(rr.validCount === 0 && rr.invalidCount === rez.rows.length,
      'E10. Yer tutucu mulk kodu degistirilmezse HICBIR satir yazilmiyor',
      'Ornek satirlar gercek mulke eslesiyor: sablonu oldugu gibi yukleyen ' +
      'musteri defterine ornek veri yazmis olur (3.6). gecerli=' + rr.validCount);
  } finally {
    if (XLSX) delete global.XLSX;
  }

  // Uretici ile depodaki dosyalar ayrismis mi?
  const { execSync } = require('child_process');
  let temiz = true, cikti = '';
  try {
    cikti = execSync('node scripts/build_sample_templates.js --check',
      { cwd: KOK, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    temiz = false;
    cikti = (e.stdout || '') + (e.stderr || '');
  }
  check(temiz,
    'E11. Yayinlanan sablonlar ureticiyle ayrismamis',
    'Elle duzenlenen bir sablon, eslesme sozlugu degisince sessizce ' +
    'gecersizlesir. Cozum: node scripts/build_sample_templates.js\n' +
    String(cikti).trim().slice(0, 400));

  // Ice aktarilamayan bir bicimin sablonu sunulmamali.
  check(!/downloadSampleTemplate\('COMPANY'\)/.test(HTML) && !/'COMPANY'/.test(govde(APP, 'downloadSampleTemplate') || ''),
    'E12. Ice aktarilamayan "Sirket Genel Raporu" sablonu sunulmuyor',
    'Sablon indirtip dosyayi "bu dosya ice aktarilamaz" duvarina gondermek, ' +
    'yapmadigimiz seyi vaat etmenin bir baska bicimidir (3.6).');

  // Arayuz baglantilari gercek dosyalara gitmeli.
  const linkler = (HTML.match(/href="(sablonlar\/[^"]+)"/g) || [])
    .map(m => m.replace(/^href="|"$/g, ''));
  check(linkler.length === 4,
    'E13. Modalda dort indirme baglantisi var',
    'Bulunan: ' + JSON.stringify(linkler));
  const kirik = linkler.filter(l => !fs.existsSync(path.join(KOK, l)));
  check(kirik.length === 0,
    'E14. Indirme baglantilarinin hepsi var olan dosyayi gosteriyor',
    'Kirik: ' + kirik.join(', '));
  check((HTML.match(/href="sablonlar\/[^"]+"\s+download/g) || []).length === linkler.length,
    'E15. Baglantilar `download` ile indiriliyor',
    '`download` olmadan tarayici CSV\'yi sekmede acar, kullanici dosyayi ' +
    'alamaz ve uygulamadan cikar.');
}

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB CSV / METIN ICE AKTARMA DENETIMI (phase33)');
  console.log('=============================================================================');

  const E = require(path.join(KOK, 'core', 'finance_import_engine.js'));
  const app = require(path.join(KOK, 'app.js'));

  motorTestleri(E);
  kaynakTestleri(app);
  davranisTestleri(app);
  arayuzTestleri();
  baslikTestleri(E);
  sablonTestleri(app, E);
}

try {
  run();
} catch (e) {
  no('KOSU', 'Denetim yarida kesildi: ' + (e && e.message ? e.message : e));
} finally {
  // Ozet `finally` icinde: `try` icindeki bir `return` ozeti ve cikis kodunu
  // atlar, suit hatali oldugu halde 0 ile cikar (CLAUDE.md 5.2).
  console.log('\n-----------------------------------------------------------------------------');
  console.log(`TOPLAM: ${passed} gecti, ${failed} kaldi`);
  console.log('-----------------------------------------------------------------------------');
  if (failed > 0) process.exit(1);
}
