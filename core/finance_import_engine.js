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

const crypto = (typeof require !== 'undefined' && typeof window === 'undefined') ? require('crypto') : null;

/** Dosya parmak izi — ayni dosyanin iki kez yuklenmesini engellemek icin. */
function computeHash(content) {
  if (crypto) return crypto.createHash('sha256').update(content).digest('hex');
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
  const eksi = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[₺$€\s()]/g, '').replace(/^-/, '');
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
 * Cozulemezse null.
 */
function normalizeDate(v) {
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
  if (m) return bicim(m[3], m[2], m[1]);   // gun.ay.yil (TR)
  return null;
}

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
    cleaningFee: ['temizlik', 'temizlik ucreti', 'temizlik ücreti', 'temizlik ücreti (tl)', 'cleaning', 'cleanfee'],
    pax:         ['kisi', 'kişi', 'kisi sayisi', 'kişi sayısı', 'pax', 'misafir sayisi', 'misafir sayısı'],
    status:      ['durum', 'status'],
    code:        ['kod', 'rezervasyon kodu', 'code', 'booking code', 'referans']
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
    'Brüt Tutar (TL)', 'Kanal', 'OTA Komisyonu (TL)', 'Temizlik Ücreti (TL)',
    'Kişi Sayısı', 'Durum'],
  EXPENSES: ['Tarih', 'Kategori', 'Tutar (TL)', 'Açıklama', 'Tür', 'Villa']
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
  let validCount = 0, invalidCount = 0, duplicateCount = 0, totalAmount = 0;
  const gorulen = new Set();

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;               // 1. satir baslik
    const satirHata = [];

    const tarih = normalizeDate(raw[columnMap.date]);
    if (raw[columnMap.date] === undefined || raw[columnMap.date] === '') satirHata.push('Tarih boş.');
    else if (!tarih) satirHata.push(`Tarih anlaşılamadı: "${raw[columnMap.date]}"`);

    const kategori = String(raw[columnMap.category] || '').trim();
    if (!kategori) satirHata.push('Kategori boş.');

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

    // Dosya ICI mukerrer
    const fp = `${tarih}|${tutar}|${kategori.toLowerCase()}|${aciklama.toLowerCase()}|${mulk ? mulk.id : 'portfoy'}`;
    let mukerrer = false;
    if (satirHata.length === 0) {
      if (gorulen.has(fp)) { mukerrer = true; duplicateCount++; } else gorulen.add(fp);
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
    totalRows: rawRows.length,
    validCount, invalidCount, duplicateCount,
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
    const giris = normalizeDate(raw[columnMap.checkIn]);
    const cikis = normalizeDate(raw[columnMap.checkOut]);
    if (raw[columnMap.checkIn] === undefined || raw[columnMap.checkIn] === '') satirHata.push('Giriş tarihi boş.');
    else if (!giris) satirHata.push(`Giriş tarihi anlaşılamadı: "${raw[columnMap.checkIn]}"`);
    if (raw[columnMap.checkOut] === undefined || raw[columnMap.checkOut] === '') satirHata.push('Çıkış tarihi boş.');
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
    }

    const paxHam = raw[columnMap.pax];
    let pax = null;
    if (paxHam !== undefined && paxHam !== '') {
      pax = Number(String(paxHam).replace(/[^\d]/g, ''));
      if (!isFinite(pax) || pax <= 0) { satirHata.push(`Kişi sayısı anlaşılamadı: "${paxHam}"`); pax = null; }
    }

    const kanal = String(raw[columnMap.channel] || '').trim() || 'Direct';

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
        channel: kanal, pax, status: durum, code: kod || null,
        isPotentialDuplicate: mukerrer, raw
      });
    } else {
      invalidCount++;
      errors.push({ rowNum, errors: satirHata, raw });
    }
  });

  // Dosya ICINDE ayni mulkte tarih cakismasi (veritabani da reddeder,
  // ama kullaniciya yazmadan once soylemek daha iyi)
  const cakisma = [];
  const mulkeGore = {};
  validatedRows.filter(r => r.status !== 'CANCELLED' && !r.isPotentialDuplicate).forEach(r => {
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
  validatedRows.forEach(r => { r.hasFileOverlap = cakisanSatirlar.has(r.rowNum); });

  return {
    mode: 'BOOKINGS',
    totalRows: rawRows.length,
    validCount, invalidCount, duplicateCount, existingDuplicateCount,
    totalGross: Math.round(totalGross * 100) / 100,
    totalNights,
    validatedRows, errors,
    overlaps: cakisma
  };
}

/** Geriye donuk ad (eski cagrilar icin). */
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

  const headers = kayitlar[0];
  const rows = [];
  for (let i = 1; i < kayitlar.length; i++) {
    const vals = kayitlar[i];
    const o = {};
    headers.forEach((h, idx) => { o[h] = vals[idx] !== undefined ? vals[idx] : ''; });
    rows.push(o);
  }
  return { headers, rows };
}

// -----------------------------------------------------------------------------

const FinanceImportEngine = {
  computeHash,
  bookingFingerprint,
  parseCSV,
  detectDelimiter,
  detectImportSourceKind,
  decodeImportText,
  normalizeAmount,
  normalizeDate,
  nightsBetween,
  autoDetectColumnMap,
  buildPropertyIndex,
  validateExpenseRows,
  validateBookingRows,
  validateImportRows,
  BASLIKLAR,
  SABLON_SUTUNLARI
};

if (typeof module !== 'undefined' && module.exports) module.exports = FinanceImportEngine;
if (typeof window !== 'undefined') window.FinanceImportEngine = FinanceImportEngine;
