/**
 * LEXBNB GELIR DONEMLENDIRME TESTLERI
 *
 * 2026-09-13'te bulunan hata: isBookingInFilter() bir rezervasyonu yalnizca
 * GIRIS ve CIKIS ayina gore suzuyordu, Finans ekrani da o rezervasyonun TAM
 * tutarini o aya yaziyordu. Sonuc iki ayri bozukluk:
 *
 *   1. AYNI PARA IKI KEZ SAYILIYORDU.
 *      04-28 -> 05-03 arasi 50.000 TL'lik rezervasyon Nisan'da da 50.000,
 *      Mayis'ta da 50.000 gorunuyordu. Aylik cirolarin toplami gercek cironun
 *      uzerine cikiyordu.
 *
 *   2. ORTADAKI AY TAMAMEN KAYBOLUYORDU.
 *      04-28 -> 06-02 rezervasyonu Mayis filtresinde hic gorunmuyordu; oysa
 *      Mayis'in 31 gecesinin tamami bu rezervasyona aitti.
 *
 * core/financial_metrics_service.js (yonetici paneli) bastan beri gece bazinda
 * dagitiyordu. Bu yuzden Finans ekrani ile yonetici paneli ayni ay icin farkli
 * ciro veriyordu — CLAUDE.md 3.4'teki sinifin tekrari.
 *
 * Dogru kural (USALI tahakkuk): gelir gecelere esit bolunur, her donem
 * yalnizca kendi gecelerinin payini alir. Sunucudaki
 * compute_month_close_snapshot() de aynisini yapar.
 */

const {
  setCurrentFilter,
  getFilterDateRange,
  getBookingFilterShare,
  isBookingInFilter
} = require('../app.js');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const yakin = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

// 04-28, 04-29, 04-30 (Nisan 3 gece) + 05-01, 05-02 (Mayis 2 gece) = 5 gece
const KESEN = { checkIn: '2026-04-28', checkOut: '2026-05-03', gross: 50000, nights: 5 };
// Tamami Mayis icinde
const ICERDE = { checkIn: '2026-05-10', checkOut: '2026-05-14', gross: 40000, nights: 4 };
// Nisan sonundan Haziran basina: Mayis'in 31 gecesinin tamami bu rezervasyonda
const UZUN = { checkIn: '2026-04-28', checkOut: '2026-06-02', gross: 350000, nights: 35 };

function ay(p) {
  setCurrentFilter({ period: p, villa: 'ALL', startDate: null, endDate: null });
}

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB GELIR DONEMLENDIRME TESTLERI');
  console.log('=============================================================================\n');

  // --- 1. Donem araligi ------------------------------------------------------
  ay('2026-04');
  const nisan = getFilterDateRange();
  check(nisan && nisan.start === '2026-04-01' && nisan.end === '2026-04-30',
    '1. Nisan araligi 30 gun (ayin gercek son gunu)', JSON.stringify(nisan));

  ay('2026-02');
  const subat = getFilterDateRange();
  check(subat && subat.end === '2026-02-28',
    '2. Şubat araligi ayin gercek son gunuyle biter', JSON.stringify(subat));

  // --- 2. Kesen rezervasyonun bolunmesi --------------------------------------
  ay('2026-04');
  const pNisan = getBookingFilterShare(KESEN);
  check(pNisan.nights === 3 && yakin(pNisan.ratio, 3 / 5),
    '3. Ayları kesen rezervasyonun Nisan payı 3/5 gece',
    JSON.stringify(pNisan));

  ay('2026-05');
  const pMayis = getBookingFilterShare(KESEN);
  check(pMayis.nights === 2 && yakin(pMayis.ratio, 2 / 5),
    '4. Aynı rezervasyonun Mayıs payı 2/5 gece',
    JSON.stringify(pMayis));

  const nisanCiro = 50000 * pNisan.ratio;
  const mayisCiro = 50000 * pMayis.ratio;
  check(yakin(nisanCiro + mayisCiro, 50000),
    '5. İki ayın payı toplamı tam olarak brüt tutarı verir (çift sayım yok)',
    `Nisan ${nisanCiro} + Mayıs ${mayisCiro} = ${nisanCiro + mayisCiro}, 50000 bekleniyordu`);

  check(yakin(nisanCiro, 30000) && yakin(mayisCiro, 20000),
    '6. Dağılım gece başına eşit: Nisan 30.000 TL, Mayıs 20.000 TL',
    `Nisan ${nisanCiro}, Mayıs ${mayisCiro}`);

  // --- 3. Tamamen ay icindeki rezervasyon degismemeli -------------------------
  ay('2026-05');
  const pIcerde = getBookingFilterShare(ICERDE);
  check(pIcerde.nights === 4 && yakin(pIcerde.ratio, 1),
    '7. Ay içinde kalan rezervasyon bölünmez, tamamı o aya yazılır',
    JSON.stringify(pIcerde));

  // --- 4. Ortadaki ay kaybolmamali -------------------------------------------
  ay('2026-05');
  check(isBookingInFilter(UZUN) === true,
    '8. Nisan→Haziran rezervasyonu Mayıs filtresinde GÖRÜNÜR',
    'ortadaki ay tamamen kayboluyor — eski hal yalnızca giriş/çıkış ayına bakıyordu');

  const pUzunMayis = getBookingFilterShare(UZUN);
  check(pUzunMayis.nights === 31,
    '9. Mayıs’ın 31 gecesinin tamamı bu rezervasyona sayılır',
    'nights=' + pUzunMayis.nights);

  // Uc ayin payi toplami yine tam tutar olmali
  ay('2026-04'); const u4 = getBookingFilterShare(UZUN).ratio;
  ay('2026-05'); const u5 = getBookingFilterShare(UZUN).ratio;
  ay('2026-06'); const u6 = getBookingFilterShare(UZUN).ratio;
  check(yakin((u4 + u5 + u6) * 350000, 350000),
    '10. Üç aya yayılan rezervasyonun payları da tam tutarı verir',
    `oranlar ${u4}+${u5}+${u6} = ${u4 + u5 + u6}`);

  // --- 5. Sinir kosullari -----------------------------------------------------
  ay('2026-04');
  // Cikis gunu gece degildir: 05-01'de cikan rezervasyon Mayis'a gece dusurmez
  const cikisMayis = { checkIn: '2026-04-29', checkOut: '2026-05-01', gross: 20000 };
  ay('2026-05');
  check(getBookingFilterShare(cikisMayis).nights === 0,
    '11. Çıkış günü gece sayılmaz (05-01 çıkış Mayıs’a gece düşürmez)',
    JSON.stringify(getBookingFilterShare(cikisMayis)));
  check(isBookingInFilter(cikisMayis) === false,
    '12. Sadece çıkış günü o aya denk gelen rezervasyon o ayda görünmez',
    'gecesi olmayan rezervasyon aya dahil ediliyor');

  ay('ALL');
  const pAll = getBookingFilterShare(KESEN);
  check(pAll.nights === 5 && yakin(pAll.ratio, 1),
    '13. "Tüm dönemler" filtresinde rezervasyonun tamamı sayılır',
    JSON.stringify(pAll));

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
