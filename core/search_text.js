// =============================================================================
// LEXBNB — ARAMA METNI KATLAMA (L-302)
// Rezervasyon, gider, temizlik, talep ve misafir aramalari ayni anahtari
// kullanir. Aranan metin ve kayit metni AYNI katlamadan gecer.
//
// Neden duz toLowerCase degil: 'İ'.toLowerCase() 'i' degil 'i' + U+0307 olur,
// 'I'.toLowerCase() ise 'ı' degil 'i'. "seyir" SEYİR'i, "ÇİFT" "çift"i
// bulmuyordu. Neden duz toLocaleLowerCase('tr') de degil: Ingilizce 'I'
// harfini 'ı' yapar; "invoice" aramasi "Invoice" kaydini bulmazdi.
// Katlama: Turkce kucuk harf, sonra ı/ç/ş/ğ/ö/ü sapkasiz karsiligina ve
// birlestirici isaretler atilir. "bozatli" "Bozatlı"yi, "cift" "Çift"i bulur.
// =============================================================================

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LexbnbSearchText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const HARF = { 'ı': 'i', 'ç': 'c', 'ş': 's', 'ğ': 'g', 'ö': 'o', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };

  function fold(value) {
    return String(value == null ? '' : value)
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[ıçşğöüâîû]/g, ch => HARF[ch] || ch)
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Aranan metin, verilen alanlardan birinde geciyor mu (iki taraf ayni katlamadan). */
  function matches(query, values) {
    const q = fold(query);
    if (!q) return true;
    return (values || []).some(v => fold(v).includes(q));
  }

  // Telefon aramasi (L-303): rakamlar karsilastirilir; Turkiye ulke kodu (90)
  // ve bastaki 0 iki taraftan da atilir. "0555 000 00 02", "+90 555 000 00 02"
  // ve "5550000002" ayni numaradir. En az 3 rakam gerekir.
  function phoneKey(value) {
    let d = String(value == null ? '' : value).replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d;
  }

  function phoneMatches(query, phone) {
    const qRaw = String(query == null ? '' : query).replace(/\D/g, '');
    if (qRaw.length < 3) return false;
    const p = phoneKey(phone);
    if (!p) return false;
    const q = phoneKey(qRaw);
    return p.includes(q) || p.includes(qRaw);
  }

  return { fold, matches, phoneKey, phoneMatches };
});
