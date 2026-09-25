// =============================================================================
// LEXBNB DISA AKTARMA MOTORU
// Defteri, GERI YUKLENEBILIR bicimde disariya yazar.
// =============================================================================
//
// NEDEN VAR (22 Eylul 2026):
//
// Uygulamada tek bir disa aktarma vardi: "📊 Portföy Performansı" bolumundeki
// "💾 Raporu İndir (JSON)" dugmesi. Yaptigi sey `appData`'nin TAMAMINI ham
// JSON olarak dokmekti — misafir adlari, telefonlari, riza kayitlari,
// planlanmis mesajlar dahil. Uc ayri sorun:
//
//   * Rapor DEGILDI. Dugme "Rapor" diyordu, dosya ham veri yigiydi.
//   * Donem filtresini YOK SAYIYORDU. Ekranda Eylul secilyken dosya her ayi
//     iceriyordu.
//   * Kimsenin ise yaramiyordu. Bir STR isletmecisi ya da muhasebeci JSON
//     acmaz; herkes Excel acar.
//
// Bu modulun kurali tek: **disa aktarilan dosya geri yuklenebilmeli.**
// Sutunlar `FinanceImportEngine.SABLON_SUTUNLARI` sabitinden gelir — ornek
// sablonla ve ice aktarma eslemesiyle ayni listedir. Boylece
// "disa aktar -> Excel'de toplu duzelt -> geri yukle" dongusu calisir.
//
// SAYI VE TARIH BICIMI — iki ayri hedef, iki ayri karar:
//   * XLSX'e sayi SAYI olarak yazilir. Excel onu kullanicinin yerel ayarina
//     gore gosterir ve ice aktarirken SheetJS yine sayi verir.
//   * CSV'ye sayi TURK bicimiyle yazilir (`72500,5`), binlik ayraci YOK.
//     Sebep phase33'te olculdu: Turkce Excel `72500.5` metnini yanlis
//     yorumlayabiliyor, `72.500,50` gibi binlik ayrac ise SheetJS'in bayt
//     yolunda 72.5005'e donusuyordu. Binliksiz Turk ondaligi hem Excel-TR
//     hem `normalizeAmount` tarafindan tek anlamli okunur.
//
// Tarih her zaman `YYYY-MM-DD` yazilir: `normalizeDate` bunu kabul eder ve
// gun/ay sirasi belirsizligi (03.04.2026) hic dogmaz.
//
// Saf veri donusumudur; DOM'a, agi'a ve Supabase'e dokunmaz.
// =============================================================================

function getImportSpec() {
  if (typeof FinanceImportEngine !== 'undefined') return FinanceImportEngine;
  if (typeof window !== 'undefined' && window.FinanceImportEngine) return window.FinanceImportEngine;
  if (typeof require !== 'undefined') {
    try { return require('./finance_import_engine.js'); } catch (e) { /* tarayici */ }
  }
  return null;
}

/** 'YYYY-MM-DD'. Cozulemeyen deger bos birakilir — UYDURULMAZ (3.6). */
function disaTarih(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v)) {
    return v.getUTCFullYear() + '-' +
      String(v.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(v.getUTCDate()).padStart(2, '0');
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const E = getImportSpec();
  return (E && E.normalizeDate(s)) || '';
}

/**
 * Sayiyi disa aktarim hucresine cevirir.
 * Olculemeyen deger `null` tasir; 0 ise 0 kalir — "girilmedi" ile "sifir"
 * ayrimi burada da korunur (3.6).
 */
function disaSayi(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Excel bir CSV hucresini `=`, `+`, `-` veya `@` ile aciliyorsa FORMUL sayar
 * ve dosyayi acan kisinin makinesinde CALISTIRIR. Yani bir misafir adina
 * `=HYPERLINK("http://kotu.site","Fatura")` yazilirsa, o defteri Excel'de
 * acan muhasebeci tiklanabilir bir tuzak gorur; eski Excel'lerde DDE ile
 * daha kotusu mumkundur.
 *
 * Bu "CSV formul enjeksiyonu"dur ve dosyayi BIZ urettigimiz icin sorumlulugu
 * bizdedir: veri kendi veritabanimizdan cikip musterinin Excel'ine giriyor.
 *
 * Savunma, Excel'in kendi kuralidir: basa tek tirnak koymak hucreyi METIN'e
 * sabitler ve Excel o tirnagi hucre degerine DAHIL ETMEZ. Tur bozulmasin
 * diye `parseCSV` ayni koruyucuyu geri okurken soyuyor.
 */
const FORMUL_BASLANGICI = /^[=+\-@\t\r]/;

/** CSV hucresi: sayilar TURK ondaligi, binlik ayrac yok. */
function csvHucre(v, ayirici) {
  if (v === null || v === undefined) return '';
  // Sayilar tirnaklanmaz: `-500` bir formul degil, negatif tutardir ve
  // hucre zaten sayi olarak yazilir.
  if (typeof v === 'number') return String(v).replace('.', ',');
  let s = String(v);
  if (FORMUL_BASLANGICI.test(s)) s = "'" + s;
  const kacismaGerek = s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 ||
    s.indexOf('\r') !== -1 || s.indexOf(ayirici) !== -1;
  return kacismaGerek ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Bir rezervasyon kaydini sablon sutun sirasina gore satira cevirir.
 * Sira `SABLON_SUTUNLARI.BOOKINGS` ile birebir ayni olmak zorundadir.
 */
function rezervasyonSatiri(b) {
  const kayit = b || {};
  return [
    String(kayit.villa || ''),
    String(kayit.guest || ''),
    disaTarih(kayit.checkIn),
    disaTarih(kayit.checkOut),
    disaSayi(kayit.gross !== undefined ? kayit.gross : kayit.grossAmount),
    String(kayit.channel || ''),
    disaSayi(kayit.otaCommission !== undefined ? kayit.otaCommission : kayit.otaComm),
    // Temizlik UCRETI (misafirden alinan gelir) yazilir; temizlik MALIYETI
    // bookings'te durmaz, temizlik borc defterindedir (3.4). Maliyeti bu
    // sutuna koymak iki kalemi tek sayiya indirger ve tam olarak 14 Eylul'de
    // ayiklanan hatayi geri getirirdi.
    disaSayi(kayit.cleaningFee !== undefined ? kayit.cleaningFee : kayit.cleanFee),
    disaSayi(kayit.pax),
    String(kayit.status || ''),
    // L-39: indirim, telefon ve not da tura girer; yoksa geri yuklenen
    // rezervasyonun cirosu indirim kadar artiyordu.
    disaSayi(kayit.discount || 0),
    String(kayit.phone || kayit.guestPhone || ''),
    String(kayit.notes || '')
  ];
}

/** Bir gider kaydini sablon sutun sirasina gore satira cevirir. */
function giderSatiri(e) {
  const kayit = e || {};
  return [
    disaTarih(kayit.date),
    String(kayit.category || ''),
    disaSayi(kayit.amount),
    String(kayit.description || ''),
    String(kayit.type || ''),
    // Portfoy geneli gider 'ALL' tasir; ice aktarma bunu "tum portfoy"
    // olarak geri okur.
    String(kayit.villa || 'ALL')
  ];
}

/**
 * @param {'BOOKINGS'|'EXPENSES'} mod
 * @param {Array} kayitlar  zaten SUZULMUS kayitlar (donem/mulk filtresi
 *                          cagirana aittir; bu modul veri secmez)
 * @returns {{mode, headers: string[], rows: Array<Array>}}
 */
function buildExport(mod, kayitlar) {
  const E = getImportSpec();
  if (!E || !E.SABLON_SUTUNLARI) {
    throw new Error('İçe aktarma sütun tanımı yüklenemedi; dışa aktarma dosyası geri yüklenemez olurdu.');
  }
  const headers = E.SABLON_SUTUNLARI[mod];
  if (!headers) throw new Error('Bilinmeyen dışa aktarma türü: ' + mod);

  const satirla = (mod === 'BOOKINGS') ? rezervasyonSatiri : giderSatiri;
  const rows = (kayitlar || []).map(satirla);

  // Sutun sayisi tutmuyorsa dosya geri yuklenemez; sessizce yazmaktansa
  // burada durmak dogrudur.
  rows.forEach((r, i) => {
    if (r.length !== headers.length) {
      throw new Error(`Dışa aktarma satırı ${i + 1} ${r.length} sütun üretti, ${headers.length} bekleniyordu.`);
    }
  });

  return { mode: mod, headers: headers.slice(), rows };
}

/**
 * CSV metni: UTF-8 BOM + noktali virgul.
 * Ikisi de Excel yuzunden zorunlu (phase33): BOM'suz UTF-8'i Turkce
 * Windows'ta Excel windows-1254 sanar, virgullu CSV'yi tek sutun acar.
 */
function toCSV(disaAktarim, secenek) {
  const ayirici = (secenek && secenek.ayirici) || ';';
  const bom = (secenek && secenek.bom === false) ? '' : '﻿';
  const satirlar = [disaAktarim.headers].concat(disaAktarim.rows);
  return bom + satirlar
    .map(r => r.map(h => csvHucre(h, ayirici)).join(ayirici))
    .join('\r\n') + '\r\n';
}

/** XLSX/aoa icin: null hucreler bos dizgiye duser, sayilar SAYI kalir. */
function toAOA(disaAktarim) {
  return [disaAktarim.headers].concat(
    disaAktarim.rows.map(r => r.map(h => (h === null || h === undefined ? '' : h))));
}

/** `LexBnB_Rezervasyonlar_2026-09.xlsx` gibi. */
function dosyaAdi(mod, donemEtiketi, uzanti) {
  const ad = (mod === 'BOOKINGS') ? 'Rezervasyonlar' : 'Giderler';
  const donem = String(donemEtiketi || '').replace(/[^0-9A-Za-z_-]+/g, '_').replace(/^_+|_+$/g, '');
  return 'LexBnB_' + ad + (donem ? '_' + donem : '') + '.' + uzanti;
}

const FinanceExportEngine = {
  buildExport,
  toCSV,
  toAOA,
  dosyaAdi,
  disaTarih,
  disaSayi,
  csvHucre,
  rezervasyonSatiri,
  giderSatiri
};

if (typeof module !== 'undefined' && module.exports) module.exports = FinanceExportEngine;
if (typeof window !== 'undefined') window.FinanceExportEngine = FinanceExportEngine;
