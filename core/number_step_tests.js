/**
 * LEXBNB SAYI ALANI ADIM (step) DENETIMI
 *
 * <input type="number"> tarayicida step degerinin katini zorunlu tutar.
 * Hedef kar marji step="1" iken "62,5" yazan kullanici kaydette
 * "Lutfen gecerli bir deger girin. En yakin iki gecerli deger: 62 ve 63"
 * duvarina carpiyordu (kullanici, 08.11.2026). Ayni kalip tutar alanlarinda
 * da vardi: temizlik tutari step="50" (1.275 TL gecersiz), hedef ciro
 * step="1000", fiyat basamaklari ve elle gunluk fiyat step="1".
 *
 * Kural: para ve yuzde tasiyan alan kurus/ondalik kabul eder. Adet, gece,
 * gun gibi gercekten tam sayi olan alanlar step="1" kalabilir; o yuzden
 * denetim acik bir listeye bakar ve her alan icin ornek ondalik degerin
 * gecerli oldugunu olcer.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES = ['index.html', 'app.js', 'core/marketing_ui.js', 'core/booking_finance_ui.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

let passed = 0;
let failed = 0;
const ok = msg => { passed++; console.log('  [PASS] ' + msg); };
const no = (msg, why) => { failed++; console.error('  [FAIL] ' + msg + '\n       ' + why); };

// Ondalik tasimasi gereken alan -> kabul edilmesi gereken ornek deger.
const DECIMAL_FIELDS = {
  goalMarginPct: 62.5,
  goalRevenue: 400000.5,
  goalADR: 17391.31,
  goalNetProfit: 250000.25,
  goalMaxExpense: 150000.75,
  pricingTargetInput: 412345.5,
  pricingExpectedOccupancy: 62.5,
  pricingRulePct: 7.5,
  pricingLongStayPct: 12.5,
  pricingSeasonPct: 12.5,
  pricingEventPct: 12.5,
  hkAmount: 1275.5,
  'ladder_${key}': 12500.5,
  'pricingLadder_${key}': 12500.5,
  pricingDayManualPrice: 12500.5,
  newBookingChannelRate: 15.5,
  resCommissionRate: 15.5,
  resDeposit: 1000.5,
  resDiscount: 1000.5,
  incAmount: 1000.5,
  bulkGross: 1000.5,
  quickBookingGross: 1000.5,
  propAnalysisRadius: 2.3,
};

function inputTagFor(id) {
  const re = /<input\b[^>]*>/g;
  let m;
  while ((m = re.exec(SOURCES))) {
    if (m[0].includes(`id="${id}"`) && /type="number"/.test(m[0])) return m[0];
  }
  return null;
}

// Tarayicinin step kurali: (deger - taban) step'in tam kati olmali.
// Taban min'dir, min yoksa 0. step="any" her degeri kabul eder.
function stepAccepts(tag, value) {
  const step = (tag.match(/\bstep="([^"]*)"/) || [])[1];
  if (step === 'any') return true;
  const s = step === undefined ? 1 : Number(step);
  const minRaw = (tag.match(/\bmin="([^"]*)"/) || [])[1];
  const base = minRaw !== undefined && Number.isFinite(Number(minRaw)) ? Number(minRaw) : 0;
  const q = (value - base) / s;
  return Math.abs(q - Math.round(q)) < 1e-9;
}

function run() {
  console.log('\n=== SAYI ALANI ADIM DENETIMI ===\n');
  for (const [id, sample] of Object.entries(DECIMAL_FIELDS)) {
    const tag = inputTagFor(id);
    if (!tag) { no(`${id} bulundu`, 'type="number" alan kaynakta yok; liste guncellenmeli'); continue; }
    if (stepAccepts(tag, sample)) ok(`${id} ${sample} degerini kabul ediyor`);
    else no(`${id} ${sample} degerini kabul ediyor`, 'step ondaligi reddediyor: ' + tag.slice(0, 160));
  }
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
