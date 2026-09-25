#!/usr/bin/env node
/**
 * LEXBNB ORNEK SABLON URETICISI
 *
 * `sablonlar/` altindaki dosyalari uretir. Bunlar GitHub Pages ile birlikte
 * yayinlanir, yani giris yapmadan da indirilebilir:
 *
 *     https://lexbnb.space/sablonlar/lexbnb-rezervasyon-sablonu.csv
 *
 * NEDEN URETICI VAR, ELLE YAZILMIYOR:
 * Sablon basliklari `core/finance_import_engine.js` icindeki eslesme
 * sozlugune bagli. Elle yazilan bir sablon sozluk degisince sessizce
 * gecersizlesir — `core/marketing_ui.js` damgalarinda tam olarak bu oldu ve
 * 15 damganin 15'i de dosya icerigiyle uyusmuyordu (CLAUDE.md 4.1). Burada
 * ayni riski `--check` kapatir: uretilen icerik ile depodaki dosya ayrisirsa
 * kosu kirmizi olur.
 *
 * NEDEN ORNEK SATIRLARDA "MULK_KODU_1" YAZIYOR:
 * Statik bir dosya musterinin kendi mulk kodlarini bilemez. Uydurma bir villa
 * adi koymak (eskiden 'AZURE'/'BELLA' vardi) musteriyi tanimsiz bir mulke
 * kayit girmeye gonderiyordu (3.6). Acik bir yer tutucu koymak bunu tersine
 * cevirir: sablon DEGISTIRILMEDEN yuklenirse mulk eslesmez ve her satir
 * reddedilir — yani yanlislikla ornek veri yazilmasi SEMA DUZEYINDE imkansiz.
 * Giris yapmis kullanici icin uygulama icindeki `downloadSampleTemplate()`
 * zaten musterinin KENDI mulk kodlariyla ve bugune gore tarihlerle uretiyor;
 * statik dosya onun yerine gecmez, yanina durur.
 *
 * CSV BICIMI — iki karar, ikisi de Excel yuzunden:
 *   * UTF-8 **BOM ile**: BOM'suz UTF-8 bir CSV'yi Turkce Windows'ta Excel
 *     windows-1254 sanar ve "Misafir Adı" -> "Misafir AdÄ±" olur. Kendi
 *     ice aktarma motorumuz ikisini de cozer (phase33) ama musterinin
 *     Excel'i cozmez.
 *   * Ayirici **noktali virgul**: Turkce yerel ayarda Excel'in liste ayiricisi
 *     ';' oldugu icin virgullu bir CSV tek sutun olarak acilir.
 *
 * Kullanim:
 *   node scripts/build_sample_templates.js           # uret
 *   node scripts/build_sample_templates.js --check   # ayrisma var mi
 */

const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const HEDEF = path.join(KOK, 'sablonlar');
const XLSX = require(path.join(KOK, 'xlsx.full.min.js'));

// Basliklar BURADA TANIMLANMAZ. Ornek sablon, disa aktarilan defter ve ice
// aktarma eslemesi ayni listeye bagli; uc yerde ayri ayri yazilirsa
// "disa aktar -> duzelt -> geri yukle" dongusu sessizce kirilir.
const { SABLON_SUTUNLARI } = require(path.join(KOK, 'core', 'finance_import_engine.js'));

const BOM = '﻿';
const CRLF = '\r\n';
const AYIRICI = ';';

// -----------------------------------------------------------------------------
// Icerik
//
// Basliklar `FinanceImportEngine.BASLIKLAR` sozlugunde TANINAN adlardan
// secildi. Turkce buyuk "İ" ile baslayan baslik BILEREK yok: JavaScript'te
// 'İ'.toLowerCase() sonucu 'i' degil 'i' + U+0307'dir ve eslesme tutmaz.
// -----------------------------------------------------------------------------

const SABLONLAR = {
  rezervasyon: {
    dosya: 'lexbnb-rezervasyon-sablonu',
    sayfa: 'Rezervasyonlar',
    basliklar: SABLON_SUTUNLARI.BOOKINGS,
    satirlar: [
      ['MULK_KODU_1', 'Örnek Misafir 1', '2026-07-15', '2026-07-19',
        '72500', 'WHATSAPP', '0', '1500', '8', 'CONFIRMED', '2500', '', 'Örnek not'],
      ['MULK_KODU_2', 'Örnek Misafir 2', '2026-07-20', '2026-07-24',
        '56000', 'AIRBNB', '8400', '1200', '6', 'CONFIRMED', '0', '', '']
    ],
    aciklama: [
      'LEXBNB — REZERVASYON DEFTERİ ŞABLONU',
      '',
      'ZORUNLU SÜTUNLAR: Villa, Misafir Adı, Giriş Tarihi, Çıkış Tarihi, Brüt Tutar',
      'Diğer sütunlar isteğe bağlıdır; boş bırakabilir veya tamamen silebilirsiniz.',
      '',
      '1) "Villa" sütununa KENDİ mülk kodunuzu yazın.',
      '   MULK_KODU_1 / MULK_KODU_2 yalnızca yer tutucudur; değiştirmezseniz',
      '   hiçbir satır kaydedilmez (bilerek böyle — yanlış mülke kayıt girmeyin).',
      '2) Tarihler: 2026-07-15 veya 15.07.2026 — ikisi de kabul edilir.',
      '3) Tutar: 72500 veya 72.500,50 — ikisi de kabul edilir.',
      '4) Brüt tutar temizlik ücretini İÇERİR; ayrıca "Temizlik Ücreti" sütununa',
      '   yazdığınız kısım gelir olarak ayrı raporlanır.',
      '5) Gece sayısı tarihlerden hesaplanır, ayrı sütun gerekmez.',
      '6) Başlık satırı DOSYANIN İLK SATIRI olmalıdır; üstüne rapor başlığı eklemeyin.',
      '7) Sütun sırası önemsizdir, fazladan sütunlar yok sayılır.',
      '8) "Oda İndirimi" yalnız oda gelirinden düşer; temizlik ücretini etkilemez.',
      '   "Telefon" ve "Not" isteğe bağlıdır.',
      '',
      'Durum değerleri: CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED'
    ]
  },

  gider: {
    dosya: 'lexbnb-gider-sablonu',
    sayfa: 'Giderler',
    basliklar: SABLON_SUTUNLARI.EXPENSES,
    satirlar: [
      ['2026-07-03', 'Şömine & Yakacak', '18000', 'Örnek: yakacak alımı', 'OPEX', 'ALL'],
      ['2026-07-08', 'Bakım & Onarım', '6500', 'Örnek: kombi bakımı', 'OPEX', 'MULK_KODU_1'],
      ['2026-07-14', 'Yatırım & Demirbaş', '45000', 'Örnek: mobilya alımı', 'CAPEX', 'MULK_KODU_2']
    ],
    aciklama: [
      'LEXBNB — GİDER DEFTERİ ŞABLONU',
      '',
      'ZORUNLU SÜTUNLAR: Tarih, Kategori, Tutar',
      'Diğer sütunlar isteğe bağlıdır.',
      '',
      '1) "Villa" sütunu boş veya ALL ise gider tüm portföye yazılır.',
      '   Tek bir mülke yazmak için KENDİ mülk kodunuzu girin.',
      '   MULK_KODU_1 / MULK_KODU_2 yalnızca yer tutucudur; değiştirmezseniz',
      '   o satırlar kaydedilmez.',
      '2) "Tür": OPEX (işletme gideri) veya CAPEX (yatırım). Boşsa OPEX sayılır.',
      '3) Tarih: 2026-07-03 veya 03.07.2026 — ikisi de kabul edilir.',
      '4) Tutar: 18000 veya 18.000,50 — ikisi de kabul edilir.',
      '5) Başlık satırı DOSYANIN İLK SATIRI olmalıdır.',
      '',
      'NOT: Temizlik personeline ödenen tutar buraya GİRİLMEZ; o, rezervasyonun',
      'temizlik görevinden otomatik gider yazılır.'
    ]
  }
};

// -----------------------------------------------------------------------------

/** Satir sonlarini LF'e cevirir (depo/checkout farkini yok sayar). */
function satirSonuNormal(metin) {
  return String(metin).replace(/\r\n?/g, '\n');
}

/** Bir hucreyi CSV icin kacirir. */
function hucre(v) {
  const s = String(v === null || v === undefined ? '' : v);
  return /["\r\n]|;/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvUret(spec) {
  const satirlar = [spec.basliklar].concat(spec.satirlar);
  return BOM + satirlar.map(r => r.map(hucre).join(AYIRICI)).join(CRLF) + CRLF;
}

function xlsxUret(spec) {
  const wb = XLSX.utils.book_new();
  // Veri sayfasi ILK sirada olmali: ice aktarma motoru `SheetNames[0]` okur.
  XLSX.utils.book_append_sheet(
    wb, XLSX.utils.aoa_to_sheet([spec.basliklar].concat(spec.satirlar)), spec.sayfa);
  XLSX.utils.book_append_sheet(
    wb, XLSX.utils.aoa_to_sheet(spec.aciklama.map(s => [s])), 'NASIL DOLDURULUR');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Bir xlsx'i ice aktarma motorunun gordugu bicimde geri okur. */
function xlsxOku(baytlar) {
  const wb = XLSX.read(baytlar, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return {
    sayfalar: wb.SheetNames.slice(),
    satirlar: XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
      .map(r => r.map(c => String(c)))
  };
}

function beklenenXlsxIcerik(spec) {
  return {
    sayfalar: [spec.sayfa, 'NASIL DOLDURULUR'],
    satirlar: [spec.basliklar].concat(spec.satirlar).map(r => r.map(c => String(c)))
  };
}

function calis() {
  const kontrol = process.argv.includes('--check');
  if (!kontrol && !fs.existsSync(HEDEF)) fs.mkdirSync(HEDEF, { recursive: true });

  const sorunlar = [];
  let yazilan = 0;

  Object.values(SABLONLAR).forEach(spec => {
    const csvYol = path.join(HEDEF, spec.dosya + '.csv');
    const xlsxYol = path.join(HEDEF, spec.dosya + '.xlsx');
    const csv = csvUret(spec);

    if (kontrol) {
      if (!fs.existsSync(csvYol)) sorunlar.push(spec.dosya + '.csv yok');
      // Satir sonu NORMALIZE edilerek karsilastirilir. Depo LF saklar,
      // Windows checkout'u CRLF verir (`core.autocrlf=true`, .gitattributes
      // yok); bayt karsilastirmasi Linux CI'da kacinilmaz olarak kirmizi
      // olurdu. `scripts/verify_migration_chain.js` de ayni sebeple hash'ten
      // once normalize ediyor.
      else if (satirSonuNormal(fs.readFileSync(csvYol, 'utf8')) !== satirSonuNormal(csv)) {
        sorunlar.push(spec.dosya + '.csv ayrismis');
      }

      if (!fs.existsSync(xlsxYol)) {
        sorunlar.push(spec.dosya + '.xlsx yok');
      } else {
        // xlsx bir zip'tir ve bayt duzeyinde kararli degildir; ICERIK
        // karsilastirilir — zaten onemli olan dosyanin ne tasidigi.
        const okunan = xlsxOku(fs.readFileSync(xlsxYol));
        if (JSON.stringify(okunan) !== JSON.stringify(beklenenXlsxIcerik(spec))) {
          sorunlar.push(spec.dosya + '.xlsx icerigi ayrismis');
        }
      }
    } else {
      fs.writeFileSync(csvYol, csv, 'utf8');
      fs.writeFileSync(xlsxYol, xlsxUret(spec));
      yazilan += 2;
    }
  });

  if (kontrol) {
    if (sorunlar.length) {
      console.error('HATA: ornek sablonlar guncel degil:');
      sorunlar.forEach(s => console.error('  - ' + s));
      console.error('Cozum: node scripts/build_sample_templates.js');
      process.exit(1);
    }
    console.log('OK ornek sablonlar guncel (' + Object.keys(SABLONLAR).length * 2 + ' dosya).');
    return;
  }
  console.log('Uretildi: sablonlar/ ' + yazilan + ' dosya.');
}

if (require.main === module) calis();

module.exports = { SABLONLAR, csvUret, xlsxUret, beklenenXlsxIcerik, HEDEF };
