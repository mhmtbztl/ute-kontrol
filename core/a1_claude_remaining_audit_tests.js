const assert = require('assert');
const fs = require('fs');
const path = require('path');
const App = require('../app.js');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

test('A1-G1 menusu dokuz kararli kalemi dogru sirada tasir', () => {
  const tabs = [...html.matchAll(/<button class="tab-btn[^"]*" data-onclick="switchTab\('([^']+)'\)"/g)]
    .map(match => match[1]);
  assert.deepStrictEqual(tabs, [
    'executive', 'reservations', 'properties', 'operations', 'leads',
    'pricing', 'finance', 'marketing', 'settings'
  ]);
  assert.match(html, /Bugün[\s\S]*Rezervasyonlar[\s\S]*Mülkler[\s\S]*Operasyon[\s\S]*Misafirler ve Satış[\s\S]*Fiyatlandırma[\s\S]*Finans[\s\S]*Kanallar ve Pazarlama[\s\S]*Ayarlar/);
});

test('A1-G1 kaldirilan ekranlar ve eylemler geri gelmez', () => {
  assert.doesNotMatch(html, /id="tab-dashboard"|AI STRATEJİ DANIŞMANI|downloadAnalysisJson\(|data-marketing-view="gallery"|id="tgtBoxForecast"/i);
  assert.doesNotMatch(appSource, /function (renderOtaRadar|runWhatIfSimulation|renderTrajectoryRadar|askExecutiveAdvisor)\s*\(|forecastEndMonth/);
});

test('Ay kapatma ozeti brut tutari degil net konaklama cirosunu gosterir', () => {
  assert.strictEqual(typeof App.openMonthCloseModal, 'function');
  const elements = {
    monthCloseModal: { classList: { add() {} } },
    monthCloseError: { style: {} },
    monthCloseSummary: { innerHTML: '' },
    monthCloseSubmitBtn: { disabled: false, textContent: '' }
  };
  global.document = { getElementById: id => elements[id] || null };
  App.setCurrentFilter({ period: '2026-09', villa: 'ALL' });
  App.setAppData({
    villas: {}, expenses: [], cleaningTasks: [], bookingPaymentCommissions: [],
    bookings: [{ id: 'b1', guest: 'Denetim', checkIn: '2026-09-01', checkOut: '2026-09-03', nights: 2,
      gross: 10000, cleaningFee: 2000, discount: 1000, status: 'CONFIRMED' }]
  });
  App.openMonthCloseModal();
  assert.match(elements.monthCloseSummary.innerHTML, /7\.000 TL/);
  assert.doesNotMatch(elements.monthCloseSummary.innerHTML, /10\.000 TL/);
  delete global.document;
});

test('Finans icgorusu gider oranini ciroya degil toplam gelire boler', () => {
  assert.strictEqual(typeof App.computeFinanceInsightRatios, 'function');
  assert.deepStrictEqual(
    App.computeFinanceInsightRatios({ ciro: 7000, totalIncome: 10000, opex: 2000, capex: 1000 }),
    { expenseRatio: 30 }
  );
});

test('Finans sozlugu ciroyu brut gelir veya kar tabani diye tanimlamaz', () => {
  assert.doesNotMatch(html, /Fiili Ciro \(Brüt Gelir\)|Ciro - \(OPEX \+ CAPEX\)|Gerçekleşen Ciro − OPEX/);
  assert.match(html, /Ciro \(Net Konaklama Geliri\)/);
});

try {
  // Özet, başarısız bir blok sonraki blokları durdurmasa da her zaman yazılır.
} finally {
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  if (failed) process.exitCode = 1;
}
