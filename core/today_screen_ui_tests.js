/**
 * BUGUN EKRANI — Lex Tasarimi (Otomasyon #1, kullanici karari 21.11.2026).
 * Sayfa 1 karar: villa sekmeleri, ekip suzgeci, ozet cumlesi, ekip gorevleri,
 * alt satir (renk aciklamasi + PDF/Excel). Sayfa 2 detay: bu hafta, satis
 * hazirligi, bu ayin performansi. Rol sinirlari ve tek kaynaklar.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/\r\n?/g, '\n');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n?/g, '\n');
let passed = 0, failed = 0;
const check = (condition, name, detail) => condition
  ? (passed++, console.log(`[PASS] ${name}`))
  : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const body = sig => { const i = APP.indexOf(sig); return i < 0 ? '' : APP.slice(i, APP.indexOf('\nfunction ', i + 10)); };

// Sahte DOM: yalniz Bugun'un yazdigi kutular.
function sahteDom() {
  const els = {};
  const el = id => els[id] || (els[id] = { id, hidden: false, innerHTML: '', textContent: '', innerText: '', style: {},
    setAttribute() {}, getAttribute() { return null; }, hasAttribute() { return false }, removeAttribute() {}, querySelectorAll() { return []; }, classList: { add() {}, remove() {}, contains() { return false; } } });
  global.window = undefined;
  global.document = { getElementById: el, querySelectorAll: () => [], querySelector: () => null, documentElement: null, addEventListener() {}, createElement: () => el('x' + Math.random()) };
  return el;
}

try {
  check(/id="todayVillaTabs"/.test(INDEX) && /id="todayTeamTabs"/.test(INDEX) && /id="todaySummary"/.test(INDEX)
    && /id="todayTaskTable"/.test(INDEX) && /id="todayFooter"/.test(INDEX),
  'A1. Sayfa 1: villa sekmeleri, ekip suzgeci, ozet, gorev tablosu, alt satir', 'eksik kutu');
  check(/id="todayWeek"/.test(INDEX) && /id="todayReadiness"/.test(INDEX) && /id="todayPerformance"/.test(INDEX),
    'A2. Sayfa 2: bu hafta, satis hazirligi, bu ayin performansi', 'eksik bolum');
  check(!/id="todayCriticalActionsList"|id="todayTodoList"|id="todayMonthSummary"|id="todayShiftSummary"/.test(INDEX),
    'A3. Eski komuta merkezi, yapilacaklar, ay ozeti ve sayac seridi kalkti', 'eski kutu duruyor');
  check(!/executive-kpi-grid/.test(INDEX), 'A4. Gizli KPI seridi kalkti (sadelik 21.11.2026)', 'KPI seridi duruyor');
  check(/<h1 class="lex-title" id="todayTitle">Bugün<\/h1>/.test(INDEX) && /data-theme-toggle/.test(INDEX),
    'A5. Baslik satiri: ad + Gece/Gunduz dugmesi', 'baslik/dugme yok');

  const render = body('function renderExecutiveControlCenter(');
  check(/renderTodayLex\(\)/.test(render), 'B1. Bugun Lex cizici ana render planina bagli', render.slice(0, 400));
  const tasks = body('function buildTodayTeamTasks(');
  check(/detectGapNights\(\)/.test(tasks) && /isProfitUnmeasured\(/.test(tasks) && /cleanerDebtSummary\(/.test(tasks) && /attachExecutions\(/.test(tasks),
    'B2. Gorevler tek tanimlardan (bos gece, olculemeyen kar, temizlik borcu, kontrol bekleyen)', tasks.slice(0, 600));
  check(/if \(can\.ledger\)/.test(tasks) && /if \(can\.sales\)/.test(tasks),
    'B3. Finans ve satis gorevleri yalniz o veriyi okuyan rolde hesaplanir (3.3.1)', 'kapi yok');
  const perms = body('function teamTaskPermissions(');
  check(/canManageOperationsRole\(role\)/.test(perms) && /canReadSalesRole\(role\)/.test(perms) && /canReadLedgerRole\(role\)/.test(perms) && /canManageTenantRole\(role\)/.test(perms)
    && !/\['owner'/.test(perms), 'B4. Rol kapisi 3.3.1 fonksiyonlarindan; ayri rol listesi yok', perms);

  // Davranis: bos isletme -> uydurma yok; rol gizler.
  sahteDom();
  const App = require('../app.js');
  App.setActiveTenant({ id: '00000000-0000-4000-8000-0000000000aa', role: 'owner' });
  App.setAppData({ villas: {}, bookings: [], cleaningTasks: [], maintenance: [], maintenanceTickets: [], leads: [], expenses: [], targets: [], closedPeriods: [], marketingCampaigns: [], propertyDailyPrices: [] });
  App.renderTodayLex();
  const d = global.document.getElementById;
  check(/açık iş yok/.test(d('todaySummary').innerHTML) && /Bugüne ait açık iş yok/.test(d('todayTaskTable').innerHTML),
    'C1. Bos isletmede gorev uydurulmaz; ozet durumu soyler', d('todaySummary').innerHTML);
  check(/printTodayPdf\(\)/.test(d('todayFooter').innerHTML) && /downloadTodayExcel\(\)/.test(d('todayFooter').innerHTML) && /Acil/.test(d('todayFooter').innerHTML),
    'C2. Alt satir: renk aciklamasi + PDF + Excel', d('todayFooter').innerHTML);

  App.setActiveTenant({ id: '00000000-0000-4000-8000-0000000000aa', role: 'staff' });
  App.setAppData({ villas: { A: { id: 'p1', name: 'Seyir' }, B: { id: 'p2', name: 'Doğuş' } }, bookings: [], cleaningTasks: [], maintenance: [], maintenanceTickets: [], leads: [], expenses: [], targets: [], closedPeriods: [], marketingCampaigns: [], propertyDailyPrices: [] });
  App.renderTodayLex();
  check(d('todayPerformance').hidden === true && d('todayWeek').hidden === true && !/giriş/.test(d('todaySummary').innerHTML),
    'C3. Saha personeli finans/rezervasyon gormez; ozet giris/cikis yazmaz', d('todaySummary').innerHTML);
  check(/Seyir/.test(d('todayVillaTabs').innerHTML) && /Doğuş/.test(d('todayVillaTabs').innerHTML) && !/Zirve|Nefes/.test(d('todayVillaTabs').innerHTML),
    'C4. Villa sekmeleri isletmenin kendi mulklerinden (sabit villa adi yok, 3.6)', d('todayVillaTabs').innerHTML.slice(0, 300));
} catch (error) {
  failed++;
  console.error(`[FAIL] Beklenmeyen hata\n       ${error && error.stack}`);
} finally {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
