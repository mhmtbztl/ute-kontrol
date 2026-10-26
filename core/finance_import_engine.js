// =============================================================================
// LEXBNB İÇE AKTARMA MOTORU
// Ayristir -> Sutunlari esle -> Dogrula -> Onizle -> Yaz
// =============================================================================
//
// BU MODUL NEDEN YENIDEN YAZILDI (2026-09-13):
//
// app.js'teki ice aktarma "calisiyormus gibi" yapiyordu. Onay yolu:
//     appData.bookings = appData.bookings.concat(...);
//     saveAppData();                       // yalnizca localStorage
//     alert('142 rezervasyon basariyla aktarildi!');
// Supabase'e HIC gitmiyordu. Sayfa yenilenince her sey kayboluyordu.
//
// Ustelik ayni yerde:
//   * Villa eslemesi bes uydurma villaya sabitti, varsayilan 'AZURE' —
//     olmayan bir mulk. Her satir tanimsiz bir mulke atanirdi.
//   * Eksik alanlar SESSIZCE uyduruluyordu: gece yoksa 2, tarih yoksa bugun,
//     kisi yoksa 6, misafir adi yoksa "Misafir 3".
//   * Hatali satir bildirimi yoktu; bozuk satirlar zorla duzeltilip yaziliyordu.
//   * createBooking cagrilmadigi icin cakisma kontrolu, kapali donem korumasi
//     ve tenant dogrulamasi devre disiydi.
//
// Bu modulun kurallari:
//   1. Eksik veya bozuk alan UYDURULMAZ. Satir reddedilir, nedeni yazilir.
//   2. Mulk yalnizca MUSTERININ KENDI mulkleriyle eslesir. Eslesmezse hata.
//   3. Her satirin sonucu ayri raporlanir; kismi basari normaldir.
//   4. Yazma isi cagirana aittir ve createBooking/createExpense uzerinden
//      yapilmalidir — korumalar ancak oyle devrede kalir.
// =============================================================================

const nodeCrypto = (typeof require !== 'undefined' && typeof window === 'undefined') ? require('crypto') : null;

/** Dosya parmak izi — ayni dosyanin iki kez yuklenmesini engellemek icin. */
function computeHash(content) {
  if (nodeCrypto) return nodeCrypto.createHash('sha256').update(content).digest('hex');
  let hash = 0;
  const str = String(content);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'hash_' + Math.abs(hash).toString(16);
}

/**
 * Daha once yazilmis bir rezervasyonla ice aktarim satirini karsilastirmak
 * icin kararlı parmak izi. Rezervasyon kodu dahil edilmez: kod bos
 * birakildiginda createBooking tarafindan her denemede yeniden uretilir.
 */
function bookingFingerprint(row = {}) {
  const propertyId = String(row.propertyId || row.property_id || row.villa || '').trim().toLowerCase();
  const guest = String(row.guest || row.guest_name || '').trim().toLocaleLowerCase('tr-TR');
  const checkIn = normalizeDate(row.checkIn || row.check_in) || '';
  const checkOut = normalizeDate(row.checkOut || row.check_out) || '';
  const amount = (value) => {
    const normalized = normalizeAmount(value);
    return normalized === null ? '' : String(Math.round(normalized * 100) / 100);
  };
  const gross = amount(row.gross !== undefined ? row.gross : (row.grossAmount !== undefined ? row.grossAmount : row.gross_amount));
  const otaCommission = amount(row.otaCommission !== undefined ? row.otaCommission : (row.otaComm !== undefined ? row.otaComm : row.ota_commission));
  const cleaningFee = amount(row.cleaningFee !== undefined ? row.cleaningFee : (row.cleanFee !== undefined ? row.cleanFee : row.cleaning_fee));
  const pax = String(Number(row.pax) || 2);
  const channel = String(row.channel || 'Direct').trim().toLocaleLowerCase('tr-TR');
  const status = String(row.status || 'CONFIRMED').trim().toUpperCase();
  return [propertyId, guest, checkIn, checkOut, gross, otaCommission, cleaningFee, pax, channel, status].join('|');
}

/**
 * Gider kaydinin parmak izi: dosya ici ve defterdeki kayitla karsilastirma
 * ayni anahtari kullanir (L-304). Aciklama ve kategori Turkce kucuk harfe
 * indirilir; portfoy geneli gider 'portfoy' anahtarini alir.
 */
function expenseFingerprint(row = {}) {
  const date = normalizeDate(row.date || row.expense_date) || '';
  const amountRaw = normalizeAmount(row.amount);
  const amount = amountRaw === null ? '' : String(Math.round(amountRaw * 100) / 100);
  const category = String(row.category || '').trim().toLocaleLowerCase('tr-TR');
  const description = String(row.description || '').trim().toLocaleLowerCase('tr-TR');
  const propertyId = String(row.propertyId || row.property_id || '').trim().toLowerCase() || 'portfoy';
  return [date, amount, category, description, propertyId].join('|');
}

// -----------------------------------------------------------------------------
// Normalizasyon
// -----------------------------------------------------------------------------

/**
 * Para tutarini sayiya cevirir.
 * "₺76.322,50" / "76,322.50" / "76322" / 76322.5 hepsini kabul eder.
 * Cozulemezse null doner — 0 DONMEZ, cunku 0 gecerli bir tutardir ve
 * "okunamadi" ile "sifir" birbirine karistirilmamalidir.
 */
function normalizeAmount(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;
  // Yabanci para birimi TL SAYILMAZ: "$100" eskiden sembolu silinip 100 TL
  // yaziliyordu (uydurma tutar, §3.6). Okunamadi -> satir reddedilir.
  if (/[$€£]|(^|[^A-Za-z])(USD|EUR|GBP)([^A-Za-z]|$)/i.test(s)) return null;
  // TL ailesi kabul edilir: "1.500 TL", "TRY 1500", "₺1.500".
  s = s.replace(/₺/g, '').replace(/(^|[^A-Za-z])(TRY|TRL|TL)(?=[^A-Za-z]|$)/gi, '$1').trim();
  const eksi = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[\s()]/g, '').replace(/^-/, '');
  if (!s) return null;
  if (!/^[\d.,]+$/.test(s)) return null;

  const sonNokta = s.lastIndexOf('.');
  const sonVirgul = s.lastIndexOf(',');
  if (sonNokta !== -1 && sonVirgul !== -1) {
    // Hangisi sonraysa ondalik ayiricidir: "1.234,56" veya "1,234.56"
    if (sonVirgul > sonNokta) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (sonVirgul !== -1) {
    // Tek virgul: ondalik mi binlik mi? Sagda tam 3 hane varsa binlik say.
    const sag = s.length - sonVirgul - 1;
    s = (sag === 3 && s.indexOf(',') === sonVirgul && /^\d{1,3},\d{3}$/.test(s))
      ? s.replace(',', '')
      : s.replace(',', '.');
  } else if (sonNokta !== -1) {
    const sag = s.length - sonNokta - 1;
    if (sag === 3 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (!isFinite(n)) return null;
  return eksi ? -n : n;
}

/**
 * Tarihi 'YYYY-MM-DD' formatina cevirir.
 * Date nesnesi, Excel seri numarasi, YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY kabul eder.
 * order === 'MDY' ise AA/GG/YYYY okunur; dosyanin sirasini detectDateOrder verir.
 * Cozulemezse null.
 */
function normalizeDate(v, order) {
  if (v === null || v === undefined || v === '') return null;

  const bicim = (y, a, g) => {
    const yy = Number(y), aa = Number(a), gg = Number(g);
    if (!(yy >= 1900 && yy <= 2200) || !(aa >= 1 && aa <= 12) || !(gg >= 1 && gg <= 31)) return null;
    // Ayin gercek gun sayisini asan tarih (31 Şubat) reddedilir.
    const sonGun = new Date(Date.UTC(yy, aa, 0)).getUTCDate();
    if (gg > sonGun) return null;
    return `${yy}-${String(aa).padStart(2, '0')}-${String(gg).padStart(2, '0')}`;
  };

  if (v instanceof Date && !isNaN(v.getTime())) {
    return bicim(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }

  if (typeof v === 'number' && isFinite(v)) {
    // Excel seri numarasi (1900 tabanli). 1 = 1900-01-01.
    if (v < 1 || v > 80000) return null;
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return bicim(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return bicim(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    // Sira dosyadan belirlenir (detectDateOrder). Varsayilan gun.ay.yil (TR).
    return order === 'MDY' ? bicim(m[3], m[1], m[2]) : bicim(m[3], m[2], m[1]);
  }
  return null;
}

const GUN_AY_DESENI = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})/;

/**
 * Tek hucrenin sira kaniti: 'DMY' | 'MDY' | 'AMBIGUOUS' | null (sayisal
 * gun/ay/yil degil). Ilk sayi 12'den buyukse gundur; ikinci sayi 12'den
 * buyukse gundur; nokta ayirici Turk bicimidir (ABD bicimi noktayi kullanmaz).
 */
function dateCellEvidence(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(GUN_AY_DESENI);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[3]);
  if (a > 12 && b <= 12) return 'DMY';
  if (b > 12 && a <= 12) return 'MDY';
  if (m[2] === '.') return 'DMY';
  return 'AMBIGUOUS';
}

/**
 * Dosyanin tarih sirasi, TUM tarih hucrelerine bakilarak.
 * Donen: { order: 'DMY' | 'MDY' | 'MIXED', assumed: bool }
 *   - yalniz GG/AA kaniti ya da hic kanit yok -> DMY (kanit yoksa assumed)
 *   - yalniz AA/GG kaniti                    -> MDY
 *   - ikisi birden                           -> MIXED: belirsiz hucreler reddedilir
 * Eskiden her hucre tek basina GG/AA sayiliyordu: ABD bicimli dosyada gunu
 * 12'den kucuk tarihler sessizce yanlis aya yaziliyordu.
 */
function detectDateOrder(values = []) {
  let dmy = false, mdy = false;
  for (const v of values) {
    const e = dateCellEvidence(v);
    if (e === 'DMY') dmy = true;
    else if (e === 'MDY') mdy = true;
  }
  if (dmy && mdy) return { order: 'MIXED', assumed: false };
  if (mdy) return { order: 'MDY', assumed: false };
  return { order: 'DMY', assumed: !dmy };
}

/** Dosya sirasina gore tek hucre. MIXED'de belirsiz hucre { error } doner. */
function parseDateCell(v, fileOrder) {
  if (fileOrder !== 'MIXED') return { value: normalizeDate(v, fileOrder) };
  const e = dateCellEvidence(v);
  if (e === 'AMBIGUOUS') return { value: null, ambiguous: true };
  return { value: normalizeDate(v, e === 'MDY' ? 'MDY' : 'DMY') };
}

function fileDateOrder(rawRows, columns) {
  const values = [];
  for (const r of rawRows) for (const c of columns) if (c !== undefined) values.push(r[c]);
  return detectDateOrder(values);
}

const BELIRSIZ_TARIH = 'Tarih biçimi belirsiz: dosyada hem GG/AA hem AA/GG yazılmış tarihler var';

/** Iki tarih arasindaki gece sayisi. */
function nightsBetween(checkIn, checkOut) {
  const a = Date.parse(checkIn + 'T00:00:00Z');
  const b = Date.parse(checkOut + 'T00:00:00Z');
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

// -----------------------------------------------------------------------------
// Sutun eslestirme
// -----------------------------------------------------------------------------

const BASLIKLAR = {
  EXPENSES: {
    date:        ['tarih', 'date', 'gider tarihi', 'odeme tarihi', 'ödeme tarihi', 'islem tarihi', 'işlem tarihi'],
    category:    ['kategori', 'category', 'gider kategorisi', 'ktgr', 'gider turu', 'gider türü'],
    amount:      ['tutar', 'amount', 'fiyat', 'bedel', 'harcama', 'tutar (tl)', 'gider'],
    description: ['aciklama', 'açıklama', 'description', 'detay', 'not', 'aciklamalar'],
    property:    ['villa', 'ev', 'mulk', 'mülk', 'property', 'daire'],
    expenseType: ['tur', 'tür', 'gider tipi', 'tip', 'type', 'expense_type', 'opex/capex']
  },
  BOOKINGS: {
    property:    ['villa', 'ev', 'mulk', 'mülk', 'property', 'daire'],
    guest:       ['misafir', 'misafir adi', 'misafir adı', 'guest', 'musteri', 'müşteri', 'ad soyad', 'isim'],
    checkIn:     ['giris', 'giriş', 'giris tarihi', 'giriş tarihi', 'check-in', 'checkin', 'baslangic', 'başlangıç'],
    checkOut:    ['cikis', 'çıkış', 'cikis tarihi', 'çıkış tarihi', 'check-out', 'checkout', 'bitis', 'bitiş'],
    gross:       ['brut tutar', 'brüt tutar', 'brut tutar (tl)', 'brüt tutar (tl)', 'tutar', 'ciro', 'gross', 'fiyat', 'toplam'],
    channel:     ['kanal', 'channel', 'kaynak', 'platform'],
    otaCommission: ['ota komisyonu', 'ota komisyonu (tl)', 'komisyon', 'commission'],
    cleaningFee: ['temizlik', 'temizlik ucreti', 'temizlik ücreti', 'temizlik ücreti (tl)', 'misafirden temizlik ücreti', 'misafirden temizlik ücreti (tl)', 'cleaning', 'cleanfee'],
    pax:         ['kisi', 'kişi', 'kisi sayisi', 'kişi sayısı', 'pax', 'misafir sayisi', 'misafir sayısı'],
    status:      ['durum', 'status'],
    code:        ['kod', 'rezervasyon kodu', 'code', 'booking code', 'referans'],
    // Tur kapanisi (L-39): disa aktarilan indirim, telefon ve not geri
    // yuklendiginde kaybolmamali.
    discount:    ['indirim', 'indirim (tl)', 'oda indirimi', 'oda indirimi (tl)', 'discount'],
    phone:       ['telefon', 'tel', 'phone', 'telefon no', 'gsm', 'misafir telefonu'],
    notes:       ['not', 'notlar', 'notes', 'aciklama', 'açıklama'],
    financeDetails: ['finans ayrıntıları json', 'finans ayrintilari json']
  },
  // Gecmis temizlikler (L-195, kullanici M25): cleaning_tasks'a "yapildi".
  CLEANING: {
    date:        ['tarih', 'temizlik tarihi', 'date', 'gun', 'gün'],
    property:    ['villa', 'ev', 'mulk', 'mülk', 'property', 'daire'],
    amount:      ['tutar', 'tutar (tl)', 'ucret', 'ücret', 'maliyet', 'personele odenen', 'personele ödenen', 'amount'],
    cleaner:     ['temizlikci', 'temizlikçi', 'personel', 'temizlik personeli', 'cleaner'],
    paid:        ['odendi', 'ödendi', 'odendi mi', 'ödendi mi', 'odeme', 'ödeme', 'paid'],
    description: ['aciklama', 'açıklama', 'not', 'description']
  }
};

/**
 * SABLON SUTUNLARI — tek kaynak.
 *
 * Uc yer bu listeye bagli ve UCU DE ayni olmak zorunda:
 *   1. `scripts/build_sample_templates.js`  — indirilen ornek sablon
 *   2. `core/finance_export_engine.js`      — disa aktarilan defter
 *   3. `autoDetectColumnMap`                — geri yuklerken eslesme
 *
 * Ayrisirlarsa "disa aktar -> Excel'de duzelt -> geri yukle" dongusu
 * sessizce kirilir: kullanici kendi disa aktardigi dosyayi geri
 * yukleyemez. Listeyi burada tutmak bu ihtimali ortadan kaldirir;
 * `csv_import_tests` her uc tarafi da bu sabite karsi olcer.
 *
 * Basliklar `BASLIKLAR` sozlugunde TANINAN adlardan secilmistir ve Turkce
 * buyuk "İ" ile baslayan baslik BILEREK yoktur (U+0307 tuzagi, bkz. norm).
 */
const SABLON_SUTUNLARI = {
  BOOKINGS: ['Villa', 'Misafir Adı', 'Giriş Tarihi', 'Çıkış Tarihi',
    'Brüt Tutar (TL)', 'Kanal', 'OTA Komisyonu (TL)', 'Misafirden Temizlik Ücreti (TL)',
    'Kişi Sayısı', 'Durum', 'Oda İndirimi (TL)', 'Telefon', 'Not'],
  EXPENSES: ['Tarih', 'Kategori', 'Tutar (TL)', 'Açıklama', 'Tür', 'Villa'],
  CLEANING: ['Tarih', 'Villa', 'Tutar (TL)', 'Temizlikçi', 'Ödendi', 'Açıklama']
};

/** Basliklardan sutun eslemesi cikarir. Eslesmeyen alan null kalir. */
function autoDetectColumnMap(headers = [], mode = 'EXPENSES') {
  const sozluk = BASLIKLAR[mode] || BASLIKLAR.EXPENSES;
  const map = {};
  Object.keys(sozluk).forEach(k => { map[k] = null; });

  // Turkce buyuk "İ" tuzagi: JavaScript'te 'İ'.toLowerCase() sonucu 'i'
  // DEGILDIR, 'i' + U+0307 (birlestirici ustnokta) olur. Yani "İşlem Tarihi"
  // basligi 'i̇şlem tarihi' haline gelir ve sozlukteki 'işlem tarihi'
  // ile ASLA eslesmez. Banka ekstrelerinin standart sutun adi tam olarak
  // budur; dosya "zorunlu sutun eksik" diye reddediliyordu.
  //
  // `toLocaleLowerCase('tr')` dogru gorunur ama daha kotudur: 'I' harfini de
  // 'ı'ya cevirir ve sozlukteki Ingilizce adlari ("Invoice", "ID", "ISIM")
  // bu kez o bozar. Cozum yalnizca artik isareti atmak.
  const norm = h => String(h || '').toLowerCase()
    .replace(/̇/g, '')
    .trim().replace(/\s+/g, ' ');
  headers.forEach(h => {
    const n = norm(h);
    if (!n) return;
    for (const alan of Object.keys(sozluk)) {
      if (map[alan]) continue;
      if (sozluk[alan].includes(n)) { map[alan] = h; return; }
    }
  });
  return map;
}

// -----------------------------------------------------------------------------
// Gecerli degerler (L-194, kullanici M24)
//
// Gider kategorisi ve kanal eskiden serbest metindi: dosyadaki "Şömine &
// Yakacak" oldugu gibi yaziliyor, raporda taninmayip sessizce "Diğer"e
// dusuyordu; "Airbnb " ile formun yazdigi AIRBNB iki ayri kanal oluyordu.
// Artik taninan deger standart adina cevrilir, taninmayan satir gecerli
// degerlerin listesiyle reddedilir. Gider kategorilerinin TEK listesi
// burasidir; app.js EXPENSE_CATEGORIES ayni adlari tasir (renk ekler).
// -----------------------------------------------------------------------------

// Tur (M66, 9.6.2): kategori giderin OPEX mi CAPEX mi oldugunu soyler; form
// kategori secilince turu buna gore doldurur. Tur satirda (expense_type)
// durur; kategori yalniz varsayilani verir. "Diğer" turu belirlemez.
const GIDER_KATEGORILERI = [
  { name: 'Maaş', label: 'Maaş (Personel / Yönetici)', type: 'OPEX' },
  { name: 'Temizlik', label: 'Temizlik & Çamaşırhane', type: 'OPEX' },
  { name: 'Bakım', label: 'Bakım, Onarım & Tesisat', type: 'OPEX', aliases: ['Bakım & Onarım', 'Onarım', 'Tamir'] },
  { name: 'Reklam', label: 'Reklam & Pazarlama (Meta/Google)', type: 'OPEX', aliases: ['Pazarlama'] },
  { name: 'Akaryakıt', label: 'Akaryakıt & Ulaşım', type: 'OPEX', aliases: ['Yakıt', 'Ulaşım'] },
  { name: 'Fatura', label: 'Fatura (Elektrik, Su, İnternet)', type: 'OPEX', aliases: ['Elektrik', 'Su', 'İnternet', 'Doğalgaz'] },
  { name: 'Muhasebe', label: 'Muhasebe & Hukuk', type: 'OPEX', aliases: ['Hukuk'] },
  { name: 'Kredi Kartı / Komisyon', label: 'Kredi Kartı / Komisyon', type: 'OPEX', aliases: ['Kredi Kartı', 'K.Kartı', 'Komisyon'] },
  { name: 'Danışmanlık', label: 'Danışmanlık & Yazılım', type: 'OPEX', aliases: ['Yazılım'] },
  { name: 'Demirbaş', label: 'Demirbaş & Ekipman (klima, beyaz eşya, mobilya)', type: 'CAPEX', aliases: ['Ekipman', 'Demirbaş & Ekipman', 'Mobilya', 'Beyaz Eşya', 'Klima'] },
  { name: 'Tadilat', label: 'Tadilat & Yenileme', type: 'CAPEX', aliases: ['Renovasyon', 'Yenileme', 'Yatırım'] },
  { name: 'Diğer', label: 'Diğer Giderler', type: null, aliases: ['Diğer Gider'] }
];

// Turkce harf, buyuk-kucuk ve noktalama duyarsiz anahtar ("TEMİZLİK" = "temizlik").
function degerAnahtari(v) {
  return String(v == null ? '' : v).replace(/[İIı]/g, 'i').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

/** Serbest yazilmis gider kategorisi -> standart ad; taninmazsa null. */
function resolveExpenseCategory(ham, kategoriler = GIDER_KATEGORILERI) {
  const k = degerAnahtari(ham);
  if (!k) return null;
  const bulunan = kategoriler.find(c => [c.name, c.label, ...(c.aliases || [])].some(x => degerAnahtari(x) === k));
  return bulunan ? bulunan.name : null;
}

/** Kanal kodu ya da adi -> katalogdaki KOD (formun yazdigi); taninmazsa null. */
function resolveChannel(ham, kanallar = []) {
  const k = degerAnahtari(ham);
  if (!k) return null;
  const bulunan = (kanallar || []).find(c => c && (degerAnahtari(c.code) === k || degerAnahtari(c.displayName) === k));
  return bulunan ? bulunan.code : null;
}

/** Isletmenin defterinde zaten bulunan deger (birebir yazimiyla); yoksa null. */
function mevcutDeger(ham, mevcutlar) {
  const k = degerAnahtari(ham);
  if (!k || !Array.isArray(mevcutlar)) return null;
  return mevcutlar.find(x => degerAnahtari(x) === k) || null;
}

/** Mulk adi/slug/id -> mulk kimligi. Eslesme buyuk-kucuk harf duyarsizdir. */
function buildPropertyIndex(properties = []) {
  const idx = {};
  properties.forEach(p => {
    if (!p) return;
    const ekle = (k) => { if (k) idx[String(k).toLowerCase().trim()] = p; };
    ekle(p.id); ekle(p.slug); ekle(p.name); ekle(p.key);
  });
  return idx;
}

// -----------------------------------------------------------------------------
// Dogrulama
// -----------------------------------------------------------------------------

const GECERLI_DURUM = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];

/**
 * Gider satirlarini dogrular.
 * @returns {{totalRows,validCount,invalidCount,duplicateCount,totalAmount,validatedRows,errors}}
 */
function validateExpenseRows(rawRows = [], columnMap = {}, context = {}) {
  const mulkIdx = buildPropertyIndex(context.properties || []);
  const kapaliMi = typeof context.isPeriodClosed === 'function' ? context.isPeriodClosed : () => false;

  const validatedRows = [], errors = [];
  let validCount = 0, invalidCount = 0, duplicateCount = 0, existingDuplicateCount = 0, totalAmount = 0;
  const gorulen = new Set();
  // L-304: defterde zaten duran gider de mukerrerdir (duzeltilip yeniden
  // yuklenen dosya, disa aktarilip geri verilen defter).
  const mevcutGiderler = new Set((context.existingExpenses || []).map(expenseFingerprint));
  // Isletmenin Ayarlar'da ekledigi kategoriler (M66) standart listeye eklenir.
  const tumKategoriler = GIDER_KATEGORILERI.concat((context.customCategories || []).filter(c => c && c.name));

  const tarihSirasi = fileDateOrder(rawRows, [columnMap.date]);

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;               // 1. satir baslik
    const satirHata = [];

    const tarihHucre = parseDateCell(raw[columnMap.date], tarihSirasi.order);
    const tarih = tarihHucre.value;
    if (raw[columnMap.date] === undefined || raw[columnMap.date] === '') satirHata.push('Tarih boş.');
    else if (tarihHucre.ambiguous) satirHata.push(`${BELIRSIZ_TARIH}: "${raw[columnMap.date]}"`);
    else if (!tarih) satirHata.push(`Tarih anlaşılamadı: "${raw[columnMap.date]}"`);

    const kategoriHam = String(raw[columnMap.category] || '').trim();
    // Defterde zaten duran eski serbest kategori (dis aktarim -> geri yukleme
    // turu) oldugu gibi kabul edilir; yeni ve taninmayan deger reddedilir.
    const kategori = kategoriHam
      ? (mevcutDeger(kategoriHam, context.existingCategories) || resolveExpenseCategory(kategoriHam, tumKategoriler))
      : null;
    if (!kategoriHam) satirHata.push('Kategori boş.');
    else if (!kategori) satirHata.push(`Kategori tanınmadı: "${kategoriHam}". Geçerli: ${tumKategoriler.map(c => c.name).join(', ')}`);

    const tutar = normalizeAmount(raw[columnMap.amount]);
    if (tutar === null) satirHata.push(`Tutar anlaşılamadı: "${raw[columnMap.amount]}"`);
    else if (tutar <= 0) satirHata.push(`Tutar sıfır veya negatif: ${tutar}`);

    const aciklama = String(raw[columnMap.description] || '').trim();

    // Mulk istege bagli; verilmisse MUTLAKA eslesmeli.
    let mulk = null;
    const mulkHam = String(raw[columnMap.property] || '').trim();
    const portfoyMu = !mulkHam || ['all', 'genel', 'portföy', 'portfoy', 'tümü', 'tumu', '-'].includes(mulkHam.toLowerCase());
    if (!portfoyMu) {
      mulk = mulkIdx[mulkHam.toLowerCase()] || null;
      if (!mulk) satirHata.push(`Mülk bulunamadı: "${mulkHam}". İşletmenizdeki mülk adıyla birebir yazın veya boş bırakın (tüm portföy).`);
    }

    const turHam = String(raw[columnMap.expenseType] || '').toUpperCase().trim();
    const expenseType = (turHam === 'CAPEX' || turHam.includes('YATIRIM')) ? 'CAPEX' : 'OPEX';

    if (tarih && kapaliMi(tarih)) {
      satirHata.push(`Bu dönem (${tarih.slice(0, 7)}) kapatılmış; gider eklenemez.`);
    }

    // Dosya ici ve defterdeki mukerrer
    const fp = expenseFingerprint({ date: tarih, amount: tutar, category: kategori, description: aciklama, propertyId: mulk ? mulk.id : null });
    let mukerrer = false;
    if (satirHata.length === 0) {
      if (gorulen.has(fp)) { mukerrer = true; duplicateCount++; }
      else if (mevcutGiderler.has(fp)) { mukerrer = true; duplicateCount++; existingDuplicateCount++; gorulen.add(fp); }
      else gorulen.add(fp);
    }

    if (satirHata.length === 0) {
      validCount++; totalAmount += tutar;
      validatedRows.push({
        rowNum, date: tarih, category: kategori, amount: tutar, description: aciklama,
        propertyId: mulk ? mulk.id : null, propertyKey: mulk ? (mulk.slug || mulk.key || null) : null,
        expenseType, isPotentialDuplicate: mukerrer, raw
      });
    } else {
      invalidCount++;
      errors.push({ rowNum, errors: satirHata, raw });
    }
  });

  return {
    mode: 'EXPENSES',
    dateOrder: tarihSirasi.order, dateOrderAssumed: tarihSirasi.assumed,
    totalRows: rawRows.length,
    validCount, invalidCount, duplicateCount, existingDuplicateCount,
    totalAmount: Math.round(totalAmount * 100) / 100,
    validatedRows, errors
  };
}

/**
 * Rezervasyon satirlarini dogrular.
 * Eksik alan UYDURULMAZ; satir reddedilir.
 */
function validateBookingRows(rawRows = [], columnMap = {}, context = {}) {
  const mulkIdx = buildPropertyIndex(context.properties || []);
  const mulkVar = Object.keys(mulkIdx).length > 0;
  const kapaliMi = typeof context.isStayPeriodClosed === 'function' ? context.isStayPeriodClosed : () => false;

  const validatedRows = [], errors = [];
  let validCount = 0, invalidCount = 0, duplicateCount = 0, existingDuplicateCount = 0;
  let totalGross = 0, totalNights = 0;
  const gorulen = new Set();
  const mevcutRezervasyonlar = new Set(
    (context.existingBookings || []).map(bookingFingerprint)
  );
  const tarihSirasi = fileDateOrder(rawRows, [columnMap.checkIn, columnMap.checkOut]);

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const satirHata = [];

    // --- Mulk: ZORUNLU ---
    let mulk = null;
    const mulkHam = String(raw[columnMap.property] || '').trim();
    if (!mulkHam) {
      satirHata.push('Villa/mülk boş. Rezervasyon bir mülke ait olmalıdır.');
    } else if (!mulkVar) {
      satirHata.push('İşletmenizde kayıtlı mülk yok. Önce mülklerinizi ekleyin.');
    } else {
      mulk = mulkIdx[mulkHam.toLowerCase()] || null;
      if (!mulk) satirHata.push(`Mülk bulunamadı: "${mulkHam}". İşletmenizdeki mülk adıyla birebir yazın.`);
    }

    // --- Misafir: ZORUNLU (eskiden "Misafir 3" uyduruluyordu) ---
    const misafir = String(raw[columnMap.guest] || '').trim();
    if (!misafir) satirHata.push('Misafir adı boş.');

    // --- Tarihler: ZORUNLU (eskiden bugun yaziliyordu) ---
    const girisHucre = parseDateCell(raw[columnMap.checkIn], tarihSirasi.order);
    const cikisHucre = parseDateCell(raw[columnMap.checkOut], tarihSirasi.order);
    const giris = girisHucre.value;
    const cikis = cikisHucre.value;
    if (raw[columnMap.checkIn] === undefined || raw[columnMap.checkIn] === '') satirHata.push('Giriş tarihi boş.');
    else if (girisHucre.ambiguous) satirHata.push(`${BELIRSIZ_TARIH} (giriş): "${raw[columnMap.checkIn]}"`);
    else if (!giris) satirHata.push(`Giriş tarihi anlaşılamadı: "${raw[columnMap.checkIn]}"`);
    if (raw[columnMap.checkOut] === undefined || raw[columnMap.checkOut] === '') satirHata.push('Çıkış tarihi boş.');
    else if (cikisHucre.ambiguous) satirHata.push(`${BELIRSIZ_TARIH} (çıkış): "${raw[columnMap.checkOut]}"`);
    else if (!cikis) satirHata.push(`Çıkış tarihi anlaşılamadı: "${raw[columnMap.checkOut]}"`);

    let gece = null;
    if (giris && cikis) {
      gece = nightsBetween(giris, cikis);
      if (gece === null || gece <= 0) satirHata.push(`Çıkış tarihi girişten sonra olmalı (${giris} → ${cikis}).`);
    }

    // --- Tutar: ZORUNLU ---
    const brut = normalizeAmount(raw[columnMap.gross]);
    if (brut === null) satirHata.push(`Brüt tutar anlaşılamadı: "${raw[columnMap.gross]}"`);
    else if (brut < 0) satirHata.push(`Brüt tutar negatif: ${brut}`);

    // --- Istege bagli alanlar: bos ise 0/varsayilan, ama TAHMIN EDILMEZ ---
    const komisyonHam = raw[columnMap.otaCommission];
    const komisyon = (komisyonHam === undefined || komisyonHam === '') ? 0 : normalizeAmount(komisyonHam);
    if (komisyon === null) satirHata.push(`OTA komisyonu anlaşılamadı: "${komisyonHam}"`);
    else if (komisyon < 0) satirHata.push('OTA komisyonu negatif olamaz.');

    const temizlikHam = raw[columnMap.cleaningFee];
    const temizlik = (temizlikHam === undefined || temizlikHam === '') ? 0 : normalizeAmount(temizlikHam);
    if (temizlik === null) satirHata.push(`Temizlik ücreti anlaşılamadı: "${temizlikHam}"`);
    else if (temizlik < 0) satirHata.push('Temizlik ücreti negatif olamaz.');

    if (brut !== null && komisyon !== null && temizlik !== null && (komisyon + temizlik) > brut) {
      satirHata.push(`Komisyon + temizlik (${komisyon + temizlik}) brüt tutarı (${brut}) aşıyor.`);
    } else if (brut > 0 && komisyon !== null && komisyon > brut / 2) {
      // Rezervasyon formuyla ayni sinir (L-300): komisyon brutun en fazla %50'si.
      satirHata.push(`OTA komisyonu (${komisyon}) brüt tutarın %50'sinden (${brut / 2}) büyük olamaz.`);
    }

    // Indirim yalniz oda gelirinden duser (K-04); temizlik ucretini asamaz.
    const indirimHam = columnMap.discount ? raw[columnMap.discount] : undefined;
    const indirim = (indirimHam === undefined || indirimHam === '') ? 0 : normalizeAmount(indirimHam);
    if (indirim === null) satirHata.push(`İndirim anlaşılamadı: "${indirimHam}"`);
    else if (indirim < 0) satirHata.push('İndirim negatif olamaz.');
    else if (brut !== null && temizlik !== null && indirim > brut - temizlik) {
      satirHata.push(`İndirim (${indirim}) oda gelirini (${brut - temizlik}) aşıyor.`);
    }
    const telefon = columnMap.phone ? String(raw[columnMap.phone] || '').trim() : '';
    const not = columnMap.notes ? String(raw[columnMap.notes] || '').trim() : '';
    let financeInput;
    const financeJson = columnMap.financeDetails ? raw[columnMap.financeDetails] : '';
    if (financeJson) {
      try {
        const details = JSON.parse(financeJson);
        const engine = typeof BookingFinance !== 'undefined' ? BookingFinance : require('./booking_finance');
        if (details.version !== 1 || !details.input) throw new Error('Desteklenmeyen finans sürümü.');
        const p = details.input, r = engine.calculate(p);
        if (engine.money(r.gross + Number(p.discount || 0)) !== brut || r.commission !== komisyon ||
          engine.money(r.cleaningRevenue + r.cleaningTax) !== temizlik || Number(p.discount || 0) !== indirim ||
          p.checkIn !== giris || p.checkOut !== cikis || Number(p.nights) !== gece) {
          throw new Error('Finans ayrıntıları sütunlarla uyuşmuyor; tutar ve tarihleri rezervasyon formundan düzenleyin.');
        }
        financeInput = p;
      } catch (e) { satirHata.push('Finans ayrıntıları geçersiz: ' + e.message); }
    }

    // Kisi sayisi ZORUNLU (L-305): veritabani bos kabul etmez ve 2 varsaymak
    // uydurma olur (CLAUDE.md 3.6); onizleme yazmadan once soyler.
    const paxHam = columnMap.pax ? raw[columnMap.pax] : undefined;
    let pax = null;
    if (paxHam === undefined || paxHam === null || String(paxHam).trim() === '') {
      satirHata.push('Kişi sayısı boş.');
    } else {
      pax = Number(String(paxHam).replace(/[^\d]/g, ''));
      if (!isFinite(pax) || pax <= 0) { satirHata.push(`Kişi sayısı anlaşılamadı: "${paxHam}"`); pax = null; }
    }

    const kanalHam = String(raw[columnMap.channel] || '').trim();
    let kanal = kanalHam || 'Direct';
    if (kanalHam && Array.isArray(context.channels) && context.channels.length) {
      const kod = mevcutDeger(kanalHam, context.existingChannels) || resolveChannel(kanalHam, context.channels);
      if (kod) kanal = kod;
      // Kullanici kanal ADINI gorur, ic kodu degil (L-286).
      else satirHata.push(`Kanal tanınmadı: "${kanalHam}". Geçerli kanallar: ${context.channels.map(c => c.displayName || c.display_name || c.code).join(', ')}`);
    }

    let durum = String(raw[columnMap.status] || '').toUpperCase().trim() || 'CONFIRMED';
    if (durum === 'COMPLETED' || durum === 'TAMAMLANDI') durum = 'CHECKED_OUT';
    if (durum === 'IPTAL' || durum === 'İPTAL') durum = 'CANCELLED';
    if (!GECERLI_DURUM.includes(durum)) {
      satirHata.push(`Durum geçersiz: "${raw[columnMap.status]}". Geçerli: ${GECERLI_DURUM.join(', ')}`);
    }

    const kod = String(raw[columnMap.code] || '').trim();

    if (giris && cikis && gece > 0 && kapaliMi(giris, cikis)) {
      satirHata.push('Konaklama kapatılmış bir döneme denk geliyor; kayıt eklenemez.');
    }

    // Dosya ICI mukerrer / ayni mulkte cakisma
    const aday = {
      propertyId: mulk ? mulk.id : mulkHam,
      guest: misafir,
      checkIn: giris,
      checkOut: cikis,
      gross: brut,
      otaCommission: komisyon,
      cleaningFee: temizlik,
      pax,
      channel: kanal,
      status: durum
    };
    const fp = bookingFingerprint(aday);
    let mukerrer = false;
    if (satirHata.length === 0) {
      if (gorulen.has(fp)) {
        mukerrer = true;
        duplicateCount++;
      } else if (mevcutRezervasyonlar.has(fp)) {
        mukerrer = true;
        duplicateCount++;
        existingDuplicateCount++;
        gorulen.add(fp);
      } else {
        gorulen.add(fp);
      }
    }

    if (satirHata.length === 0) {
      validCount++; totalGross += brut; totalNights += gece;
      validatedRows.push({
        rowNum,
        propertyId: mulk.id, propertyKey: mulk.slug || mulk.key || null, propertyName: mulk.name || mulkHam,
        guest: misafir, checkIn: giris, checkOut: cikis, nights: gece,
        gross: brut, otaCommission: komisyon, cleaningFee: temizlik,
        discount: indirim || 0, phone: telefon, notes: not,
        ...(financeInput ? { financeInput } : {}),
        channel: kanal, pax, status: durum, code: kod || null,
        isPotentialDuplicate: mukerrer, raw
      });
    } else {
      invalidCount++;
      errors.push({ rowNum, errors: satirHata, raw });
    }
  });

  // Mulk takviminde duran rezervasyonla cakisma (L-305): veritabani
  // exclude_overlapping_bookings ile reddediyordu ama onizleme "eklenecek"
  // diyor, yazma ham Postgres hatasiyla dusuyordu.
  const cakisma = [];
  const takvim = (context.existingBookings || []).filter(b => b && String(b.status || '').toUpperCase() !== 'CANCELLED');
  validatedRows.filter(r => r.status !== 'CANCELLED' && !r.isPotentialDuplicate).forEach(r => {
    const mevcut = takvim.find(b => {
      const pid = b.propertyId || b.property_id;
      const bIn = normalizeDate(b.checkIn || b.check_in);
      const bOut = normalizeDate(b.checkOut || b.check_out);
      return pid === r.propertyId && bIn && bOut && r.checkIn < bOut && bIn < r.checkOut;
    });
    if (!mevcut) return;
    r.hasLedgerOverlap = true;
    cakisma.push({
      rowNum: r.rowNum,
      errors: [`Mülk takviminde mevcut rezervasyonla çakışıyor: ${mevcut.guest || mevcut.guest_name || 'kayıt'} (${normalizeDate(mevcut.checkIn || mevcut.check_in)} → ${normalizeDate(mevcut.checkOut || mevcut.check_out)}).`],
      raw: r.raw
    });
  });

  // Dosya ICINDE ayni mulkte tarih cakismasi (veritabani da reddeder,
  // ama kullaniciya yazmadan once soylemek daha iyi)
  const mulkeGore = {};
  validatedRows.filter(r => r.status !== 'CANCELLED' && !r.isPotentialDuplicate && !r.hasLedgerOverlap).forEach(r => {
    (mulkeGore[r.propertyId] = mulkeGore[r.propertyId] || []).push(r);
  });
  Object.values(mulkeGore).forEach(list => {
    list.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    for (let i = 1; i < list.length; i++) {
      if (list[i].checkIn < list[i - 1].checkOut) {
        cakisma.push({
          rowNum: list[i].rowNum,
          errors: [`Aynı mülkte tarih çakışması: satır ${list[i - 1].rowNum} (${list[i - 1].checkIn} → ${list[i - 1].checkOut}) ile örtüşüyor.`],
          raw: list[i].raw
        });
      }
    }
  });
  const cakisanSatirlar = new Set(cakisma.map(c => c.rowNum));
  validatedRows.forEach(r => { r.hasLedgerOverlap = !!r.hasLedgerOverlap; r.hasFileOverlap = !r.hasLedgerOverlap && cakisanSatirlar.has(r.rowNum); });

  return {
    mode: 'BOOKINGS',
    dateOrder: tarihSirasi.order, dateOrderAssumed: tarihSirasi.assumed,
    totalRows: rawRows.length,
    validCount, invalidCount, duplicateCount, existingDuplicateCount,
    totalGross: Math.round(totalGross * 100) / 100,
    totalNights,
    validatedRows, errors,
    overlaps: cakisma
  };
}

/** Geriye donuk ad (eski cagrilar icin). */
/**
 * Gecmis temizlik satirlarini dogrular (L-195, kullanici M25).
 *
 * Temizlik maliyetinin tek kaynagi cleaning_tasks'tir (CLAUDE.md 3.4); gecmis
 * rezervasyonlarin gorevi olmadigi icin gecmis aylarda maliyet 0 gorunuyor ve
 * kar oldugundan yuksek cikiyordu. Kurallar:
 *   - yalniz bugun ve oncesi: gelecekteki temizlik rezervasyondan planli acilir;
 *   - ayni mulkte ayni gun zaten temizlik gorevi varsa satir REDDEDILIR: ikinci
 *     kayit maliyeti iki kez sayar; var olani Operasyon'dan "yapildi" yapin;
 *   - kapanmis aya yazilmaz; tutar zorunlu ve sifirdan buyuk;
 *   - "Ödendi" bossa EVET: gecmis temizlik cogunlukla odenmistir. HAYIR ise
 *     temizlik yapilmis ama odenmemis sayilir, personel borcu olarak gorunur.
 */
function validateCleaningRows(rawRows = [], columnMap = {}, context = {}) {
  const mulkIdx = buildPropertyIndex(context.properties || []);
  const kapaliMi = typeof context.isPeriodClosed === 'function' ? context.isPeriodClosed : () => false;
  const bugun = String(context.today || '').slice(0, 10);
  const mevcut = new Set((context.existingCleaningTasks || [])
    .filter(t => t && t.propertyId && t.date && String(t.status || '').toUpperCase() !== 'SKIPPED')
    .map(t => `${t.propertyId}|${String(t.date).slice(0, 10)}`));
  const validatedRows = [], errors = [];
  let validCount = 0, invalidCount = 0, duplicateCount = 0, totalAmount = 0;
  const gorulen = new Set();
  const tarihSirasi = fileDateOrder(rawRows, [columnMap.date]);

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const satirHata = [];

    const tarihHucre = parseDateCell(raw[columnMap.date], tarihSirasi.order);
    const tarih = tarihHucre.value;
    if (raw[columnMap.date] === undefined || raw[columnMap.date] === '') satirHata.push('Tarih boş.');
    else if (tarihHucre.ambiguous) satirHata.push(`${BELIRSIZ_TARIH}: "${raw[columnMap.date]}"`);
    else if (!tarih) satirHata.push(`Tarih anlaşılamadı: "${raw[columnMap.date]}"`);
    else if (bugun && tarih > bugun) satirHata.push(`Gelecek tarih (${tarih}): yalnız yapılmış temizlik aktarılır; planlı temizlik rezervasyondan açılır.`);

    let mulk = null;
    const mulkHam = String(raw[columnMap.property] || '').trim();
    if (!mulkHam) satirHata.push('Villa/mülk boş. Temizlik bir mülke ait olmalıdır.');
    else {
      mulk = mulkIdx[mulkHam.toLowerCase()] || null;
      if (!mulk) satirHata.push(`Mülk bulunamadı: "${mulkHam}". GEÇERLİ DEĞERLER sayfasındaki mülk kodunu ya da adını yazın.`);
    }

    const tutar = normalizeAmount(raw[columnMap.amount]);
    if (tutar === null) satirHata.push(`Tutar anlaşılamadı: "${raw[columnMap.amount]}"`);
    else if (tutar <= 0) satirHata.push('Tutar sıfır ya da negatif: personele ödenen tutarı yazın.');

    const odendiHam = degerAnahtari(columnMap.paid ? raw[columnMap.paid] : '');
    let odendi = true;
    if (['hayir', 'h', 'no', 'n', '0', 'false', 'odenmedi', 'borc'].includes(odendiHam)) odendi = false;
    else if (odendiHam && !['evet', 'e', 'yes', 'y', '1', 'true', 'odendi'].includes(odendiHam)) {
      satirHata.push(`"Ödendi" anlaşılamadı: "${raw[columnMap.paid]}". EVET ya da HAYIR yazın (boş = EVET).`);
    }

    if (tarih && kapaliMi(tarih)) satirHata.push(`Bu dönem (${tarih.slice(0, 7)}) kapatılmış; temizlik eklenemez.`);
    const anahtar = mulk && tarih ? `${mulk.id}|${tarih}` : '';
    if (anahtar && mevcut.has(anahtar)) {
      satirHata.push(`Bu mülkte ${tarih} tarihinde zaten temizlik kaydı var; ikinci kayıt maliyeti iki kez sayar. Var olanı Operasyon › Temizlik'ten "yapıldı" işaretleyin.`);
    }

    let mukerrer = false;
    if (satirHata.length === 0) {
      if (gorulen.has(anahtar)) { mukerrer = true; duplicateCount++; } else gorulen.add(anahtar);
      validCount++;
      if (!mukerrer) totalAmount += tutar;
      validatedRows.push({
        rowNum, date: tarih, propertyId: mulk.id, propertyKey: mulk.slug || mulk.key || null, propertyName: mulk.name || null,
        amount: tutar, cleaner: String(raw[columnMap.cleaner] || '').trim(), paid: odendi,
        description: String(raw[columnMap.description] || '').trim(), isPotentialDuplicate: mukerrer, raw
      });
    } else {
      invalidCount++;
      errors.push({ rowNum, errors: satirHata, raw });
    }
  });

  return {
    mode: 'CLEANING',
    dateOrder: tarihSirasi.order, dateOrderAssumed: tarihSirasi.assumed,
    totalRows: rawRows.length,
    validCount, invalidCount, duplicateCount,
    totalAmount: Math.round(totalAmount * 100) / 100,
    validatedRows, errors
  };
}

const validateImportRows = validateExpenseRows;

// -----------------------------------------------------------------------------
// CSV / TSV — METIN DOSYASI YOLU  (phase33)
// -----------------------------------------------------------------------------
//
// BU YOL NEDEN VAR (2026-09-21 olcumu):
//
// Dosya secici `.csv, .tsv, .txt` kabul ediyordu ama app.js'te CSV yolu YOKTU:
// her dosya SheetJS'in BAYT yoluna (`XLSX.read(bytes)`) gidiyordu. Olculen
// sonuclar, ayni ornek satirla:
//
//   "72.500,50"  ->  72.5005      raw:true sayiyi ABD bicimi sanip parcaliyor
//   UTF-8 (BOM yok)  ->  "Misafir AdÄ±", "AyÅe Åahin"
//   windows-1254     ->  "Misafir Ad1", "Ay_e ^ahin"   (Turk Excel varsayilani)
//
// Ilki en tehlikelisi: 72.500,50 TL'lik bir rezervasyon 72,50 TL olarak
// SESSIZCE yaziliyor. Ekranda makul bir sayi duruyor, ciro bininci katina
// dusuyor ve hicbir yerde hata gorunmuyor. Digerleri gurultulu (sutun
// eslesmiyor) ama misafir adi eslesirse bozuk metin Postgres'e gidiyor.
//
// Cozum sayiyi "duzeltmek" degil, sayiyi hic bozmamaktir: metin dosyasi metin
// olarak okunur, hucreler STRING kalir ve yorumu `normalizeAmount` /
// `normalizeDate` yapar — onlar "1.234,56" ile "1,234.56" ayrimini zaten
// dogru biliyor. Bu yuzden bu ayristirici asla Number uretmez.
//
// Ayristiricinin kendisinde de iki eksik vardi ve ikisi de olculdu:
//   * Sekme ayirici taninmiyordu -> tum satir TEK sutun olup "zorunlu sutun
//     eksik" diyordu. Excel'in "Unicode Metin (.txt)" disa aktarimi tam olarak
//     budur (UTF-16LE + sekme).
//   * Satir bolme `split(/\r?\n/)` ile yapiliyordu, yani TIRNAK ICINDEKI satir
//     sonu dosyayi kaydiriyordu: iki satirlik bir gider aciklamasi 2 kaydi 3
//     kayda cevirip tutari bir sonraki satira ittiriyordu.

/** Kabul edilen ayiricilar. Esitlik halinde bu sira karar verir. */
const CSV_AYIRICILAR = [';', ',', '\t', '|'];

/**
 * Excel'in "bu hucre METIN" koruyucusunu soyar.
 *
 * `=`, `+`, `-`, `@` ile baslayan bir CSV hucresini Excel FORMUL sayar ve
 * dosyayi acanin makinesinde calistirir. Hem Excel hem bizim disa
 * aktarimimiz (`finance_export_engine.js`) bunu basa tek tirnak koyarak
 * engeller; Excel o tirnagi hucre degerine dahil etmez.
 *
 * Biz de etmeyelim — yoksa "disa aktar -> geri yukle" turunda misafir adi
 * her seferinde bir tirnak daha kazanirdi.
 *
 * SOYULAN YALNIZCA formul karakterinden ONCE gelen tirnaktir: `'Ali` oldugu
 * gibi kalir, `'=HYPERLINK(...)` ise `=HYPERLINK(...)` olur.
 */
function formulKoruyucusunuSoy(deger) {
  const s = String(deger === null || deger === undefined ? '' : deger);
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

/**
 * Baytlardan kaynagin turunu belirler: 'XLSX' | 'XLS' | 'TEXT'.
 *
 * UZANTIYA DEGIL IMZAYA bakar. OTA disa aktarimlari uzantiyi duzenli olarak
 * yanlis verir (Booking.com "xls" dosyasi HTML'dir, Airbnb "csv" dosyasini
 * musteri Excel'de acip .xlsx diye kaydeder). Imza sormak ikisini de dogru
 * yonlendirir.
 */
function detectImportSourceKind(bytes) {
  const b = bytes || [];
  if (b[0] === 0x50 && b[1] === 0x4B) return 'XLSX';                    // PK.. (zip)
  if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return 'XLS'; // OLE2
  return 'TEXT';
}

/**
 * Metin dosyasini dogru kod sayfasiyla cozer.
 *
 * Sira onemli: once BOM'lar (kesin bilgi), sonra "gecerli UTF-8 mu" sinavi,
 * en son windows-1254. Sinav `fatal: true` ile yapilir — UTF-8 olmayan bir
 * bayt dizisi cozulmek yerine hata firlatir, biz de 1254'e duseriz. Sessiz
 * degistirme (U+FFFD) ile cozseydik mojibake'yi "basarili" sayardik.
 *
 * windows-1254 son caredir cunku Turkce Windows'ta Excel'in "CSV (virgulle
 * ayrilmis)" disa aktarimi varsayilan olarak onu yazar ve musterinin en sik
 * urettigi dosya odur.
 */
function decodeImportText(bytes) {
  const b = (bytes && bytes.length !== undefined) ? bytes : new Uint8Array(0);
  const coz = (etiket, dilim) => new TextDecoder(etiket).decode(dilim);
  const kes = (n) => (b.subarray ? b.subarray(n) : b.slice(n));

  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return coz('utf-8', kes(3));
  if (b[0] === 0xFF && b[1] === 0xFE) return coz('utf-16le', kes(2));
  if (b[0] === 0xFE && b[1] === 0xFF) return coz('utf-16be', kes(2));

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch (_) {
    return coz('windows-1254', b);
  }
}

/**
 * Basliktaki ayiriciyi bulur. Sayim TIRNAK DISINDA yapilir: tirnak icindeki
 * "Villa Bella Vista, Kalkan" gibi bir baslik virgul oyunu kazanmasin.
 */
function detectDelimiter(headerLine) {
  const satir = String(headerLine || '');
  let enIyi = ',', enCok = -1;
  CSV_AYIRICILAR.forEach(ay => {
    let n = 0, tirnak = false;
    for (let i = 0; i < satir.length; i++) {
      const c = satir[i];
      if (c === '"') tirnak = !tirnak;
      else if (c === ay && !tirnak) n++;
    }
    if (n > enCok) { enCok = n; enIyi = ay; }
  });
  return enCok > 0 ? enIyi : ',';
}

/**
 * CSV/TSV metnini ayristirir. Donen her hucre STRING'tir — sayiya cevirmek
 * cagiranin degil, `normalizeAmount`/`normalizeDate`'in isidir (yukaridaki
 * gerekce).
 *
 * Metnin tamami tek geciste taranir; satir sonu yalnizca TIRNAK DISINDA
 * kayit bitirir.
 */
function parseCSV(text) {
  let metin = String(text === null || text === undefined ? '' : text);
  if (metin.charCodeAt(0) === 0xFEFF) metin = metin.slice(1);   // BOM metne de kacabilir
  if (!metin.trim()) return { headers: [], rows: [] };

  const ilkSatirSonu = (() => {
    let tirnak = false;
    for (let i = 0; i < metin.length; i++) {
      const c = metin[i];
      if (c === '"') tirnak = !tirnak;
      else if ((c === '\n' || c === '\r') && !tirnak) return i;
    }
    return metin.length;
  })();
  const ayirici = detectDelimiter(metin.slice(0, ilkSatirSonu));

  const kayitlar = [];
  let hucreler = [], cur = '', tirnak = false, hucreVar = false;
  const hucreBitir = () => { hucreler.push(cur.trim()); cur = ''; };
  const kayitBitir = () => {
    hucreBitir();
    // Tamamen bos satirlar atlanir; dosya sonundaki satir sonu kayit uretmez.
    if (hucreVar && hucreler.some(h => h !== '')) kayitlar.push(hucreler);
    hucreler = []; hucreVar = false;
  };

  for (let i = 0; i < metin.length; i++) {
    const c = metin[i];
    if (tirnak) {
      if (c === '"') {
        if (metin[i + 1] === '"') { cur += '"'; i++; }
        else tirnak = false;
      } else cur += c;
      hucreVar = true;
      continue;
    }
    if (c === '"') { tirnak = true; hucreVar = true; }
    else if (c === ayirici) { hucreBitir(); hucreVar = true; }
    else if (c === '\r') { if (metin[i + 1] === '\n') i++; kayitBitir(); }
    else if (c === '\n') { kayitBitir(); }
    else { cur += c; hucreVar = true; }
  }
  kayitBitir();

  if (kayitlar.length === 0) return { headers: [], rows: [] };

  const headers = kayitlar[0].map(formulKoruyucusunuSoy);
  const rows = [];
  for (let i = 1; i < kayitlar.length; i++) {
    const vals = kayitlar[i];
    const o = {};
    headers.forEach((h, idx) => {
      o[h] = vals[idx] !== undefined ? formulKoruyucusunuSoy(vals[idx]) : '';
    });
    rows.push(o);
  }
  return { headers, rows };
}

// -----------------------------------------------------------------------------

const FinanceImportEngine = {
  computeHash,
  bookingFingerprint,
  expenseFingerprint,
  parseCSV,
  formulKoruyucusunuSoy,
  detectDelimiter,
  detectImportSourceKind,
  decodeImportText,
  normalizeAmount,
  normalizeDate,
  detectDateOrder,
  nightsBetween,
  autoDetectColumnMap,
  buildPropertyIndex,
  resolveExpenseCategory,
  resolveChannel,
  GIDER_KATEGORILERI,
  validateExpenseRows,
  validateBookingRows,
  validateCleaningRows,
  validateImportRows,
  BASLIKLAR,
  SABLON_SUTUNLARI
};

if (typeof module !== 'undefined' && module.exports) module.exports = FinanceImportEngine;
if (typeof window !== 'undefined') window.FinanceImportEngine = FinanceImportEngine;
