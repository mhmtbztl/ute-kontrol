/**
 * LEXBNB — ICE AKTARMA: TARIH SIRASI VE PARA BIRIMI (L-40, CEVRIMDISI)
 *
 * 1. "09/10/2026" hucresi GG/AA diye okunuyordu. Ingilizce yerel ayarla
 *    alinmis bir OTA dosyasinda (AA/GG/YYYY) gunu 12'den kucuk her tarih
 *    SESSIZCE yanlis aya yaziliyor, digerleri reddediliyordu: yarisi yanlis,
 *    yarisi eksik bir aktarim. Duzeltme: sira hucre hucre degil, dosyanin
 *    tum tarih sutunlarina bakilarak belirlenir.
 * 2. "1.500 TL" ve "TRY 1500" reddediliyordu (Turkce disa aktarimlarda
 *    yaygin). Buna karsilik "$100" ve "€100" sembolu sessizce silinip 100 TL
 *    yaziliyordu — baska para birimindeki tutar TL sayiliyordu (§3.6).
 */

const E = require('./finance_import_engine.js');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

const MAP = { property: 'Villa', guest: 'Misafir', checkIn: 'Giris', checkOut: 'Cikis', gross: 'Tutar' };
const PROPS = [{ id: 'p1', name: 'Villa Deniz', slug: 'deniz' }];
const satir = (gi, ci, tutar = '10000') => ({ Villa: 'Villa Deniz', Misafir: 'Ali', Giris: gi, Cikis: ci, Tutar: tutar });

// --- 1. Tarih sirasi dosyadan belirlenir ---
{
  // ABD biciminde dosya: 10/13 kaniti AA/GG oldugunu soyler.
  const r = E.validateBookingRows([satir('09/10/2026', '09/13/2026'), satir('10/02/2026', '10/05/2026')], MAP, { properties: PROPS });
  const t = r.validatedRows.map(x => `${x.checkIn}>${x.checkOut}`);
  check(r.validCount === 2 && t[0] === '2026-09-10>2026-09-13' && t[1] === '2026-10-02>2026-10-05',
    '1. AA/GG/YYYY dosyada "09/10/2026" 10 EYLUL okunur (dosyadaki 09/13 kaniti)', JSON.stringify({ t, e: r.errors.map(x => x.errors) }));
  check(r.dateOrder === 'MDY', '2. Sonuc hangi siranin kullanildigini soyler', `dateOrder=${r.dateOrder}`);
}
{
  const r = E.validateBookingRows([satir('09/10/2026', '13/10/2026')], MAP, { properties: PROPS });
  check(r.validCount === 1 && r.validatedRows[0].checkIn === '2026-10-09' && r.dateOrder === 'DMY',
    '3. GG/AA/YYYY dosyada "09/10/2026" 9 EKIM okunur (dosyadaki 13/10 kaniti)', JSON.stringify(r.validatedRows.map(x => x.checkIn)));
}
{
  const r = E.validateBookingRows([satir('09.10.2026', '12.10.2026')], MAP, { properties: PROPS });
  check(r.validCount === 1 && r.validatedRows[0].checkIn === '2026-10-09' && r.dateOrder === 'DMY' && !r.dateOrderAssumed,
    '4. Nokta ayiricili tarih Turk bicimidir (kanit sayilir)', JSON.stringify(r));
}
{
  const r = E.validateBookingRows([satir('09/10/2026', '11/10/2026')], MAP, { properties: PROPS });
  check(r.dateOrder === 'DMY' && r.dateOrderAssumed === true,
    '5. Hicbir kanit yoksa GG/AA VARSAYILIR ve bu acikca isaretlenir (arayuz sorabilsin)', `dateOrder=${r.dateOrder}, assumed=${r.dateOrderAssumed}`);
}
{
  // Karisik dosya: 13/10 (GG/AA) ve 10/13 (AA/GG) birlikte -> belirsiz hucreler REDDEDILIR.
  const r = E.validateBookingRows([satir('13/10/2026', '14/10/2026'), satir('10/13/2026', '10/15/2026'), satir('05/06/2026', '07/06/2026')], MAP, { properties: PROPS });
  const belirsiz = r.errors.find(x => x.rowNum === 4);
  check(r.dateOrder === 'MIXED' && !!belirsiz && /belirsiz/i.test(belirsiz.errors.join(' ')),
    '6. Iki bicim karisiksa belirsiz tarih (05/06) sessizce yorumlanmaz, satir reddedilir', JSON.stringify({ o: r.dateOrder, e: r.errors }));
  check(r.validatedRows.some(x => x.rowNum === 3 && x.checkIn === '2026-10-13' && x.checkOut === '2026-10-15'),
    '7. Karisik dosyada tek anlamli tarihler yine okunur (10/13 -> 13 Ekim)', JSON.stringify(r.validatedRows.map(x => x.checkIn)));
}
{
  const r = E.validateExpenseRows([{ T: '10/31/2026', K: 'Bakim', A: '500' }, { T: '11/02/2026', K: 'Bakim', A: '600' }], { date: 'T', category: 'K', amount: 'A' }, {});
  check(r.validCount === 2 && r.validatedRows[1].date === '2026-11-02' && r.dateOrder === 'MDY',
    '8. Gider dosyasinda da ayni kural (10/31 kaniti -> 11/02 = 2 Kasim)', JSON.stringify(r.validatedRows.map(x => x.date)));
}
check(E.normalizeDate('2026-10-09') === '2026-10-09' && E.normalizeDate('15.03.2026') === '2026-03-15',
  '9. ISO ve Turk tarihleri tek hucrede eskisi gibi okunur', '');

// --- 2. Para birimi ---
const tl = [['1.500 TL', 1500], ['TRY 1500', 1500], ['1.500,50 TL', 1500.5], ['₺1.500', 1500], ['1500 try', 1500], ['TL 72.500,50', 72500.5]];
const tlHata = tl.filter(([g, b]) => E.normalizeAmount(g) !== b).map(([g, b]) => `"${g}" -> ${E.normalizeAmount(g)} (beklenen ${b})`);
check(tlHata.length === 0, '10. "1.500 TL", "TRY 1500" gibi TL hucreleri okunur', tlHata.join('; '));

const yabanci = ['$100', '€100', '100 USD', 'EUR 100', '£50', '100 GBP'];
const yHata = yabanci.filter(g => E.normalizeAmount(g) !== null).map(g => `"${g}" -> ${E.normalizeAmount(g)}`);
check(yHata.length === 0, '11. Yabanci para birimli tutar TL SAYILMAZ (null -> satir reddedilir)', yHata.join('; '));
check(E.normalizeAmount('1500 TLX') === null && E.normalizeAmount('12 adet') === null, '12. Bilinmeyen ek sessizce silinmez', `${E.normalizeAmount('1500 TLX')}`);

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
