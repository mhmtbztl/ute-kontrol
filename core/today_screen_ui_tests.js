/** A3-G3 — Bugün ekranı rol sınırları ve tek kaynaklar. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/\r\n?/g, '\n');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n?/g, '\n');
let passed = 0, failed = 0;
const check = (condition, name, detail) => condition
  ? (passed++, console.log(`[PASS] ${name}`))
  : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const between = (start, end) => APP.slice(APP.indexOf(start), APP.indexOf(end, APP.indexOf(start)));

try {
  check(/id="todayDateStrip"/.test(INDEX), 'A1. Bugün tarih seridi var', 'todayDateStrip yok');
  check(/id="todayTodoList"/.test(INDEX), 'A2. Yapilacaklar alani var', 'todayTodoList yok');
  check(/id="todayMonthSummary"/.test(INDEX), 'A3. Aylik ozet tek satir alani var', 'todayMonthSummary yok');
  check(/class="executive-kpi-grid"[^>]*hidden/.test(INDEX), 'A4. Eski sekiz KPI seridi ekrandan kaldirildi', 'KPI seridi hidden degil');

  const render = between('function renderExecutiveControlCenter()', 'function renderTodayCommandCenter');
  check(/canReadLedgerRole\(activeTenant\?\.role\)/.test(render),
    'B1. Finans hesabi role gore kapili', render.slice(0, 1500));
  check(/detectGapNights\(\)/.test(render) && !/appData\.gapNights\[0\]/.test(render),
    'B2. Bos gece eylemi fiyatlandirma ile ayni kaynaktan gelir', 'detectGapNights tek kaynak degil');
  check(/renderTodayDateStrip/.test(render) && /renderTodayTodoList/.test(render) && /renderTodayMonthSummary/.test(render),
    'B3. Yeni Bugün bolumleri ana render planina bagli', 'yeni bolum renderlari eksik');
  const monthSummary = between('function renderTodayMonthSummary', 'function renderExecutiveControlCenter');
  check(/computeMonthActuals\(month/.test(monthSummary) && !/executiveSnapshotState/.test(monthSummary),
    'B4. Bu ay satiri secili filtre snapshotindan degil gercek takvim ayindan beslenir', monthSummary);

  const cards = between('function renderTodayCommandCenter', 'function renderPortfolioHealth');
  check(!/Puan:/.test(cards) && !/action-score-pill/.test(cards),
    'C1. Eylem kartlarinda puan rozeti yok', cards.match(/Puan:|action-score-pill/g));
} catch (error) {
  failed++;
  console.error(`[FAIL] Beklenmeyen hata\n       ${error && error.stack}`);
} finally {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
