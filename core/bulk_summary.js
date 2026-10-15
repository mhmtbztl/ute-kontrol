/**
 * LEXBNB — GECMIS AY TOPLU GIRISI (L-198, kullanici M28)
 *
 * Toplu aktarim ozeti (L-103) bir ayin toplamini tek satirda tasir: ciro ve
 * gece toplam metriklere girer; rezervasyon adedi, takvim gunu ve bosluk
 * gecesi gibi KAYIT basi metriklere girmez (`isBulkSummaryBooking`, tek tanim
 * guest_crm_engine). Bu tur satir eskiden yalniz dosyadan gelebiliyordu;
 * gecmisini girmek isteyen isletme her rezervasyonu tek tek yazmak zorundaydi.
 *
 * Kurallar (uydurma yok, iki kez sayma yok):
 *   - yalniz BITMIS ay; kapatilmis ay degil;
 *   - o ayda o mulke tek tek rezervasyon varsa REDDEDILIR: ayni ciro iki kez
 *     sayilir, ayrica veritabani ayni mulkte tarih cakismasini yasaklar;
 *   - ayni aya birden fazla kanal icin ozet girilebilir: yeni ozet oncekilerin
 *     gecelerinden SONRA yerlesir; toplam gece ayin gun sayisini asamaz;
 *   - kanal secilir (kanal raporu tutari kanala yazar); kisi sayisi bilinmez,
 *     sorulmaz.
 *
 * Saf modul: DOM ve ag yok.
 */
(function (kok, fabrika) {
  const modul = fabrika();
  if (typeof module === 'object' && module.exports) module.exports = modul;
  else kok.BulkSummary = modul;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const OZET_ONEKI = 'TOPLU AKTARIM — ';

  function isBulkSummary(b) {
    return /^TOPLU\s+AKTARIM(?:\s*[—–-]|\s|$)/i.test(String((b && (b.guest || b.guest_name)) || '').trim());
  }

  function gunEkle(gun, n) {
    const d = new Date(gun + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  const sayi = v => {
    if (v === '' || v === null || v === undefined) return 0;
    // Virgul varsa Turkce bicim (72.500,50); yoksa sayi alani degeri (72500.5).
    const s = String(v).trim();
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) ? n : NaN;
  };

  /**
   * girdi: { propertyId, villaKey, propertyName, month: 'YYYY-MM', nights, gross,
   *          cleaningFee, otaCommission, channel, channels: [{code, displayName}],
   *          bookings, today: 'YYYY-MM-DD', isMonthClosed: fn(monthKey) }
   * Donus: { ok: true, booking } | { ok: false, error }
   */
  function planBulkSummary(girdi) {
    const g = girdi || {};
    const hata = error => ({ ok: false, error });
    if (!g.propertyId) return hata('Mülk seçin.');
    if (!/^\d{4}-\d{2}$/.test(String(g.month || ''))) return hata('Ay seçin.');
    const today = String(g.today || '').slice(0, 10);
    if (!(g.month < today.slice(0, 7))) return hata('Toplu giriş yalnız bitmiş aylar içindir. İçinde bulunulan ve gelecek aylar için rezervasyonları tek tek girin.');
    if (typeof g.isMonthClosed === 'function' && g.isMonthClosed(g.month)) return hata('Bu ay kapatılmış; kayıt eklenemez. Önce dönemi yeniden açın.');

    const y = Number(g.month.slice(0, 4)), m = Number(g.month.slice(5, 7));
    const ayGun = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const ayBas = `${g.month}-01`, aySonu = gunEkle(ayBas, ayGun);
    const ayIcinde = b => b && String(b.status || '').toUpperCase() !== 'CANCELLED'
      && (b.propertyId === g.propertyId || (g.villaKey && b.villa === g.villaKey))
      && String(b.checkIn || '') < aySonu && String(b.checkOut || '') > ayBas;
    const ayKayitlari = (g.bookings || []).filter(ayIcinde);
    const tekTek = ayKayitlari.filter(b => !isBulkSummary(b));
    if (tekTek.length) {
      return hata(`Bu mülkte ${AYLAR[m - 1]} ${y} için ${tekTek.length} rezervasyon zaten girilmiş. Toplu giriş yalnız rezervasyonu girilmemiş aylar içindir; aynı ciro iki kez sayılırdı.`);
    }

    const geceler = Number(g.nights);
    if (!Number.isInteger(geceler) || geceler < 1) return hata('Satılan gece sayısını tam sayı olarak girin.');
    const ozetler = ayKayitlari.filter(isBulkSummary);
    // Onceki ozetlerin kapladigi son gun: yeni ozet onun ertesinden baslar.
    const dolu = ozetler.reduce((son, b) => (String(b.checkOut) > son ? String(b.checkOut) : son), ayBas);
    const kalan = Math.round((Date.parse(aySonu + 'T00:00:00Z') - Date.parse(dolu + 'T00:00:00Z')) / 86400000);
    if (geceler > kalan) {
      return hata(kalan <= 0
        ? `${AYLAR[m - 1]} ${y} için girilmiş toplu özetler ayın tüm gecelerini dolduruyor.`
        : `Bu ayda en çok ${kalan} gece girilebilir (ay ${ayGun} gün${ozetler.length ? `; ${ayGun - kalan} gece önceki özetlerde` : ''}).`);
    }

    const brut = sayi(g.gross), temizlik = sayi(g.cleaningFee), ota = sayi(g.otaCommission);
    if (!(brut > 0)) return hata('Toplam brüt tutarı girin.');
    if (!(temizlik >= 0) || !(ota >= 0)) return hata('Temizlik ücreti ve komisyon negatif olamaz.');
    if (temizlik > brut) return hata('Misafirden alınan temizlik ücreti brüt tutarı aşamaz.');

    const kanal = (g.channels || []).find(c => c && c.code === g.channel);
    if (!kanal) return hata('Kanalı seçin. Ay birden fazla kanaldan geldiyse her kanal için ayrı toplu giriş yapın.');

    return {
      ok: true,
      booking: {
        propertyId: g.propertyId,
        villa: g.villaKey,
        guest: `${OZET_ONEKI}${AYLAR[m - 1]} ${y} (${kanal.displayName || kanal.code})`,
        checkIn: dolu,
        checkOut: gunEkle(dolu, geceler),
        nights: geceler,
        gross: brut,
        cleaningFee: temizlik,
        otaCommission: ota,
        discount: 0,
        channel: kanal.code,
        status: 'CHECKED_OUT',
        notes: 'Aylık toplam (toplu giriş); günlere dağılmamış. Ciro ve gece toplamlarına girer, rezervasyon adedine ve takvime girmez.'
      }
    };
  }

  /** Takvimde gosterilen gunlerle kesisen ozetler: [{name, nights, gross}] */
  function summariesInWindow(bookings, firstDay, lastDay) {
    return (bookings || []).filter(b => isBulkSummary(b) && String(b.status || '').toUpperCase() !== 'CANCELLED'
      && String(b.checkIn || '') <= lastDay && String(b.checkOut || '') > firstDay);
  }

  return { planBulkSummary, summariesInWindow, isBulkSummary, OZET_ONEKI };
});
