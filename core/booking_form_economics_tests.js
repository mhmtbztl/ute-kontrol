/**
 * REZERVASYON EKRANI — TEMIZLIK GELIR/GIDER AYRIMI VE KOMISYON SEFFAFLIGI
 *
 * BULUNAN HATA (2026-09-14):
 *   Rezervasyon formunda tek bir "Temizlik Ucreti" alani vardi ve bu sayi
 *   AYNI ANDA iki farkli seyi temsil ediyordu:
 *     - bookings.cleaning_fee olarak kaydediliyordu (misafirden alinan ucret,
 *       yani GELIR bileseni), ve
 *     - syncBookingCleaningTasks() icinde temizlik gorevinin "personele
 *       odenecek tutar" alanina yaziliyordu (yani GIDER).
 *
 *   Misafirden 1.500 TL alip personele 1.200 TL odeyen bir isletmede aradaki
 *   300 TL yok sayiliyordu: hem kar marji hem temizlik borcu yanlisti.
 *
 * AYRICA:
 *   - Komisyon yalnizca tutar olarak giriliyordu; oran gorunmuyordu ve
 *     "komisyondan sonra bize ne kaliyor" hicbir yerde yazmiyordu.
 *   - Giris ve cikis ayri iki <input type="date"> idi; kullanici cikisin
 *     girisden sonra oldugunu kendi kontrol etmek zorundaydi.
 *
 * Bu suit ucunu birden olcer.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const { computeBookingEconomics, getChannelCommissionRate } = require(path.join(ROOT, 'app.js'));

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(`  ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. TEMIZLIK: GELIR AYRI, GIDER AYRI
// ---------------------------------------------------------------------------

runTest('Guest cleaning fee is revenue and stays inside the gross total', () => {
  const e = computeBookingEconomics({
    gross: 40000, cleanFee: 1500, cleanCost: 1200,
    channel: 'AIRBNB', commission: '', nights: 4
  });
  assert.strictEqual(e.gross, 40000, 'brut tutar degismemeli');
  assert.strictEqual(e.cleanFee, 1500, 'temizlik geliri ayri raporlanmali');
  assert.strictEqual(e.roomRevenue, 38500, 'oda geliri = brut - temizlik geliri');
});

runTest('Cleaning cost is an expense and never touches revenue', () => {
  const ucuz = computeBookingEconomics({
    gross: 40000, cleanFee: 1500, cleanCost: 0, channel: 'WHATSAPP', commission: '', nights: 4
  });
  const pahali = computeBookingEconomics({
    gross: 40000, cleanFee: 1500, cleanCost: 5000, channel: 'WHATSAPP', commission: '', nights: 4
  });
  assert.strictEqual(ucuz.roomRevenue, pahali.roomRevenue, 'maliyet oda gelirini degistirmemeli');
  assert.strictEqual(ucuz.gross, pahali.gross, 'maliyet brut tutari degistirmemeli');
  assert.strictEqual(ucuz.netToUs - pahali.netToUs, 5000, 'maliyet yalnizca bize kalani dusurmeli');
});

runTest('Cleaning revenue and cleaning cost are independent numbers', () => {
  const e = computeBookingEconomics({
    gross: 40000, cleanFee: 1500, cleanCost: 1200,
    channel: 'WHATSAPP', commission: '', nights: 4
  });
  assert.notStrictEqual(e.cleanFee, e.cleanCost, 'ikisi ayni sayi olmak zorunda degil');
  assert.strictEqual(e.cleanFee - e.cleanCost, 300, 'aradaki fark kaybolmamali');
});

// ---------------------------------------------------------------------------
// 2. KOMISYON: ORAN VE KOMISYON SONRASI NET
// ---------------------------------------------------------------------------

runTest('Channel default commission rate is applied when no amount is typed', () => {
  const airbnb = computeBookingEconomics({ gross: 40000, channel: 'AIRBNB', commission: '', nights: 4 });
  assert.strictEqual(airbnb.otaComm, 6000, 'Airbnb %15');
  assert.strictEqual(Math.round(airbnb.commissionRate), 15);

  const direkt = computeBookingEconomics({ gross: 40000, channel: 'WHATSAPP', commission: '', nights: 4 });
  assert.strictEqual(direkt.otaComm, 0, 'direkt kanalda komisyon yok');
  assert.strictEqual(getChannelCommissionRate('WHATSAPP'), 0);
});

runTest('Manually typed commission overrides the channel default', () => {
  const e = computeBookingEconomics({ gross: 40000, channel: 'AIRBNB', commission: 2000, nights: 4 });
  assert.strictEqual(e.otaComm, 2000, 'elle girilen tutar kazanmali');
  assert.strictEqual(Number(e.commissionRate.toFixed(2)), 5, 'oran tutardan turetilmeli');
});

runTest('Net after commission is exposed and excludes the cleaning payout', () => {
  const e = computeBookingEconomics({
    gross: 40000, cleanFee: 1500, cleanCost: 1200,
    channel: 'AIRBNB', commission: '', nights: 4
  });
  assert.strictEqual(e.netAfterCommission, 34000, 'komisyon sonrasi bize gecen tutar');
  assert.strictEqual(e.netToUs, 32800, 'temizlik odendikten sonra kalan');
  assert.strictEqual(e.netRoomRevenue, 32500, 'ADR tabani: oda geliri - komisyon');
});

runTest('Commission can never exceed the gross amount', () => {
  const e = computeBookingEconomics({ gross: 1000, channel: 'AIRBNB', commission: 99999, nights: 1 });
  assert.strictEqual(e.otaComm, 1000, 'komisyon brutu asamaz');
  assert.ok(e.netAfterCommission >= 0, 'komisyon sonrasi net negatif olamaz');
});

runTest('Negative inputs are clamped instead of silently inverting the math', () => {
  const e = computeBookingEconomics({
    gross: -5000, cleanFee: -100, cleanCost: -100, channel: 'WHATSAPP', commission: '', nights: -3
  });
  assert.strictEqual(e.gross, 0);
  assert.strictEqual(e.cleanFee, 0);
  assert.strictEqual(e.cleanCost, 0);
  assert.strictEqual(e.nights, 0);
  assert.strictEqual(e.nightlyNet, 0, 'sifir gecede bolme yapilmamali');
});

// ---------------------------------------------------------------------------
// 3. BORC DEFTERI MALIYETTEN TURETILIR
// ---------------------------------------------------------------------------

// K-04 (25 Eylul 2026): rezervasyonun temizlik gorevi rezervasyon KAYDEDILIRKEN
// veritabanina yazilir (syncBookingCleaningTaskToCloud); bellekte uydurulmaz.
const GOREV_YAZ = (() => {
  const i = APP.indexOf('async function syncBookingCleaningTaskToCloud(');
  // Satir sonu normalize: Windows checkout'u CRLF verir (CLAUDE.md kabuk tuzaklari).
  const f = APP.slice(i).replace(/\r\n/g, '\n');
  return i < 0 ? '' : f.slice(0, f.indexOf('\n}\n') + 2);
})();

runTest('Cleaning debt ledger is driven by the cost, not the guest fee', () => {
  assert.ok(GOREV_YAZ.includes('amount: maliyet || 0'),
    'yeni temizlik gorevi personele odenecek MALIYETLE acilmali');
  assert.ok(GOREV_YAZ.includes('mevcut.amount = maliyet'),
    'mevcut gorev guncellenirken de maliyet kullanilmali');
  assert.ok(!/cleanFee/.test(GOREV_YAZ),
    'misafirden alinan ucret borc defterine yazilmamali');
  assert.ok(/await syncBookingCleaningTaskToCloud\(savedBooking, cleanCost\)/.test(APP),
    'rezervasyon formu kayittan sonra gorevi veritabanina yazmali (L-27)');
});

runTest('Cleaning cost is reloaded from the debt ledger, not duplicated on bookings', () => {
  const fn = APP.slice(APP.indexOf('function syncBookingCleaningTasks'));
  const body = fn.slice(0, fn.indexOf('\nfunction '));
  assert.ok(/findBookingCleaningTask\(b\)/.test(body) && /b\.cleanCost = bagli/.test(body),
    'buluttan yuklenen rezervasyonda maliyet mevcut temizlik gorevinden okunmali');
  assert.ok(!APP.includes('cleaning_cost'),
    'ayni sayi bookings tablosunda ikinci kez tutulmamali');
});

// Eskiden gorevi olmayan rezervasyonda maliyet = ucret varsayiliyordu ("eski
// davranis"). K-04 bunu kaldirdi: bilinmeyen maliyet uydurulmaz (3.6), ve
// bellekte uydurulan gorev hic veritabanina yazilmadigi icin korunacak
// "mevcut borc" zaten yoktu.
runTest('Unknown cleaning cost is never copied from the guest fee', () => {
  const fn = APP.slice(APP.indexOf('function syncBookingCleaningTasks'));
  const body = fn.slice(0, fn.indexOf('\nfunction '));
  assert.ok(!/b\.cleanFee/.test(body) && !/cleanFee/.test(body),
    'gorevi olmayan rezervasyonda maliyet ucretten KOPYALANMAMALI');
  assert.ok(!/cleaningTasks\.push\(/.test(body),
    'syncBookingCleaningTasks bellekte gorev uydurmamali');
  const form = APP.slice(APP.indexOf("const ccEl = document.getElementById('resCleanCost');"));
  assert.ok(!/ccEl\.value = [^;]*cleanFee/.test(form.slice(0, 400)),
    'duzenleme formu maliyeti ucretten doldurmamali');
});

runTest('Cleaner name is not invented', () => {
  assert.ok(!APP.includes('Fatma Hanım'),
    'Uydurma personel adi (CLAUDE.md 3.6) temizlik gorevine yazilmamali');
});

// ---------------------------------------------------------------------------
// 4. ARAYUZ: ALANLAR VE TEK TAKVIMLI TARIH ARALIGI
// ---------------------------------------------------------------------------

runTest('Booking form exposes cleaning revenue and cleaning cost separately', () => {
  assert.match(HTML, /id="resCleanFee"/, 'temizlik geliri alani');
  assert.match(HTML, /id="resCleanCost"/, 'temizlik maliyeti alani');
  assert.match(HTML, /Misafirden Alınan/, 'gelir alani acikca etiketlenmeli');
  assert.match(HTML, /Personele Ödenen/, 'gider alani acikca etiketlenmeli');
});

runTest('Booking form shows commission rate and post-commission net', () => {
  assert.match(HTML, /id="resCommissionRate"/, 'komisyon orani alani');
  assert.match(HTML, /id="prevCommissionRate"/, 'onizlemede oran');
  assert.match(HTML, /id="prevNetAfterCommission"/, 'komisyon sonrasi net');
  assert.match(HTML, /id="prevNetToUs"/, 'bize kalan net');
  assert.match(HTML, /id="prevCleanRevenue"/, 'temizlik geliri satiri');
  assert.match(HTML, /id="prevCleanCost"/, 'temizlik gideri satiri');
});

runTest('Check-in and check-out are chosen in one range calendar', () => {
  assert.match(HTML, /id="resDatePicker"/, 'tek takvim paneli olmali');
  assert.match(HTML, /id="resCalMonths"/, 'iki ayli izgara olmali');
  assert.ok(!/<input type="date" id="resCheckIn"/.test(HTML),
    'giris tarihi ayri bir date kutusu olarak kalmamali');
  assert.ok(!/<input type="date" id="resCheckOut"/.test(HTML),
    'cikis tarihi ayri bir date kutusu olarak kalmamali');
  assert.match(HTML, /<input type="hidden" id="resCheckIn">/,
    'resCheckIn gizli input olarak korunmali (mevcut mantik onu okuyor)');
  assert.match(HTML, /<input type="hidden" id="resCheckOut">/,
    'resCheckOut gizli input olarak korunmali');
});

runTest('Range picker refuses an end date before the start date', () => {
  const fn = APP.slice(APP.indexOf('function pickResDate'));
  const body = fn.slice(0, fn.indexOf('\nfunction '));
  assert.ok(body.includes('key <= resRangeStart'),
    'girisden onceki gun secilince gecersiz aralik uretilmemeli');
});

runTest('Hidden date inputs are validated in code, not by the browser', () => {
  const fn = APP.slice(APP.indexOf('async function saveBooking('));
  const body = fn.slice(0, fn.indexOf('\nasync function ') > 0 ? fn.indexOf('\nasync function ') : 4000);
  assert.ok(/!checkIn \|\| !checkOut/.test(body),
    'gizli inputlara tarayici "required" uygulamaz; kod kontrol etmeli');
  assert.ok(/calculateNightsBetween\(checkIn, checkOut\) <= 0/.test(body),
    'cikis girisden sonra olmali kontrolu kodda olmali');
});

// ---------------------------------------------------------------------------
// 5. KALICILIK
// ---------------------------------------------------------------------------

runTest('Cleaning cost persists without any schema migration', () => {
  // Bu projede gocler Supabase panelinden ELLE uygulanir ama GitHub Pages
  // push ile ANINDA yayina alir. Yeni bir sutuna bagli kod, goc uygulanana
  // kadar rezervasyon kaydini tamamen kirar. Maliyet zaten kalici olan
  // cleaning_tasks.amount alaninda durdugu icin boyle bir pencere olusmaz.
  assert.ok(!APP.includes('cleaning_cost'),
    'bookings tablosuna yeni sutun eklenmemeli');
  assert.ok(APP.includes("from('cleaning_tasks')"),
    'temizlik borc defteri zaten Supabase’e yaziliyor olmali');
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
