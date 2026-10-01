/** A3-G4 — rezervasyon tahsilat UI ve motor sozlesmesi. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/\r\n?/g, '\n');
let engine = null;
try { engine = require('./booking_payment_engine'); } catch (_) {}
let passed = 0, failed = 0;
const check = (condition, name, detail) => condition
  ? (passed++, console.log(`[PASS] ${name}`))
  : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));

try {
  check(!!engine, 'A1. Tahsilat motoru var', 'core/booking_payment_engine.js yuklenemedi');
  if (engine) {
    const rows = [
      { paid_on: '2026-09-30', amount: 1000 },
      { paid_on: '2026-10-01', amount: 2500 },
      { paid_on: '2026-10-31', amount: 500 },
      { paid_on: '2026-11-01', amount: 9000 }
    ];
    check(engine.totalCollections(rows, '2026-10-01', '2026-10-31') === 3000,
      'A2. Toplam tahsilat odeme tarihine gore hesaplanir', engine.totalCollections(rows, '2026-10-01', '2026-10-31'));
    check(engine.kindLabel('DEPOSIT') === 'Kapora' && engine.kindLabel('INTERIM') === 'Ara ödeme' && engine.kindLabel('BALANCE') === 'Kalan',
      'A3. Odeme turleri kullanici dilindedir', 'tur etiketleri eksik');
  }
  check(/bookingPayments/.test(APP) && /bookingPaymentBalances/.test(APP),
    'B1. Odeme ve sunucu bakiye gorunumu istemci verisine yuklenir', 'appData koleksiyonlari yok');
  check(/function saveBookingPayment/.test(APP) && /from\('booking_payments'\)\.insert/.test(APP),
    'B2. SidePanel odeme ekleme yolu vardir', 'saveBookingPayment yok');
  check(/booking_payment_balances/.test(APP) && /\.remaining/.test(APP),
    'B3. Kalan sunucu gorunumundeki remaining alanindan okunur', 'remaining gorunumu kullanilmiyor');
  check(/canManageTenantRole/.test(APP) && /deleteBookingPayment/.test(APP),
    'B4. Odeme silme arayuzu yonetim rolune kapilidir', 'silme rol kapisi yok');
  check(/BOOKING_HAS_PAYMENTS/.test(APP) && /Ödemesi bulunan rezervasyon/.test(APP),
    'B5. Rezervasyon silme korumasi anlasilir mesaja cevrilir', 'dost hata mesaji yok');
} catch (error) {
  failed++;
  console.error(`[FAIL] Beklenmeyen hata\n       ${error && error.stack}`);
} finally {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
