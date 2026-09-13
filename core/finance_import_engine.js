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
    pax:         ['kisi', 'kişi', 'kisi sayisi', 'kişi sayısı', 'pax', 'misafir sayisi'],
    status:      ['durum', 'status'],
    code:        ['kod', 'rezervasyon kodu', 'code', 'booking code', 'referans']
  }
};

/** Basliklardan sutun eslemesi cikarir. Eslesmeyen alan null kalir. */
function autoDetectColumnMap(headers = [], mode = 'EXPENSES') {
  const sozluk = BASLIKLAR[mode] || BASLIKLAR.EXPENSES;
  const map = {};
  Object.keys(sozluk).forEach(k => { map[k] = null; });

  const norm = h => String(h || '').toLowerCase().trim().replace(/\s+/g, ' ');
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
  let validCount = 0, invalidCount = 0, duplicateCount = 0;
  let totalGross = 0, totalNights = 0;
  const gorulen = new Set();

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
    const fp = `${mulk ? mulk.id : mulkHam}|${giris}|${cikis}|${misafir.toLowerCase()}`;
    let mukerrer = false;
    if (satirHata.length === 0) {
      if (gorulen.has(fp)) { mukerrer = true; duplicateCount++; } else gorulen.add(fp);
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
  validatedRows.filter(r => r.status !== 'CANCELLED').forEach(r => {
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

  return {
    mode: 'BOOKINGS',
    totalRows: rawRows.length,
    validCount, invalidCount, duplicateCount,
    totalGross: Math.round(totalGross * 100) / 100,
    totalNights,
    validatedRows, errors,
    overlaps: cakisma
  };
}

/** Geriye donuk ad (eski cagrilar icin). */
const validateImportRows = validateExpenseRows;

// -----------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------
function parseCSV(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const ilk = lines[0];
  const ayirici = (ilk.split(';').length > ilk.split(',').length) ? ';' : ',';

  function satirAyir(line) {
    const out = [];
    let cur = '', tirnak = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (tirnak && line[i + 1] === '"') { cur += '"'; i++; }
        else tirnak = !tirnak;
      } else if (c === ayirici && !tirnak) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  }

  const headers = satirAyir(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = satirAyir(lines[i]);
    if (vals.every(v => !v)) continue;
    const o = {};
    headers.forEach((h, idx) => { o[h] = vals[idx] !== undefined ? vals[idx] : ''; });
    rows.push(o);
  }
  return { headers, rows };
}

// -----------------------------------------------------------------------------

const FinanceImportEngine = {
  computeHash,
  parseCSV,
  normalizeAmount,
  normalizeDate,
  nightsBetween,
  autoDetectColumnMap,
  buildPropertyIndex,
  validateExpenseRows,
  validateBookingRows,
  validateImportRows,
  BASLIKLAR
};

if (typeof module !== 'undefined' && module.exports) module.exports = FinanceImportEngine;
if (typeof window !== 'undefined') window.FinanceImportEngine = FinanceImportEngine;
