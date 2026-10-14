/**
 * LEXBNB UST FILTRE KAPSAMI AGI — CEVRIMDISI
 *
 * 13 Ekim 2026, kullanici test listesi 9.0.1: ustteki DONEM / PORTFOY
 * filtresi her sayfada duruyordu ama "secmek bir seyi etkilemiyor".
 * Kodda olculdu:
 *  - Bugun: KPI seridi gizli, "Bu ay" satiri takvim ayini kullanir; donemi
 *    degistirmek ekranda hicbir seyi degistirmiyordu. Portfoy secimi ise
 *    gorunmeden "Bu ay" satirini daraltiyordu.
 *  - Rezervasyonlar: liste kendi filtresine bakar; yalniz menudeki sayi
 *    ustteki doneme bagliydi.
 *  - Mulkler, Misafirler ve Satis, Ayarlar: filtreyi okumuyor.
 *  - Ozel aralik bitis kutusunda '2026-09-30' sabiti (CLAUDE.md 3.5).
 * Kural: filtre yalniz onu okuyan sayfada gorunur ve orada neyi etkiledigini
 * yazar (GLOBAL_FILTER_SCOPE).
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
let passed = 0, failed = 0;
const check = (c, n, d) => { if (c) { passed++; console.log(`[PASS] ${n}`); } else { failed++; console.error(`[FAIL] ${n}\n       ${d}`); } };

function sahteEleman(id) {
  return {
    id: id || '', tagName: 'DIV', innerHTML: '', innerText: '', textContent: '', value: '',
    checked: false, disabled: false, hidden: false, title: '', className: '', dataset: {},
    style: new Proxy({}, { get: (t, k) => t[k] || '', set: (t, k, v) => { t[k] = v; return true; } }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    options: [], children: [], parentNode: null,
    appendChild(c) { this.children.push(c); return c; }, removeChild(c) { return c; }, insertBefore(c) { return c; },
    setAttribute(k, v) { this.dataset[k] = v; }, getAttribute(k) { return this.dataset[k] ?? null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, focus() {}, blur() {}, click() {}, scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    getContext: () => null
  };
}
const elemanlar = new Map();
global.document = {
  body: sahteEleman('body'), documentElement: sahteEleman('html'),
  getElementById(id) { if (!elemanlar.has(id)) elemanlar.set(id, sahteEleman(id)); return elemanlar.get(id); },
  createElement: () => sahteEleman(''), createElementNS: () => sahteEleman(''),
  createTextNode: (t) => ({ textContent: t }), createDocumentFragment: () => sahteEleman(''),
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  getElementsByClassName: () => [], getElementsByTagName: () => []
};
global.window = global.window || {};
global.window.document = global.document;
global.requestAnimationFrame = (fn) => { try { fn(); } catch (e) {} return 1; };
global.cancelAnimationFrame = () => {};
global.alert = () => {};
global.confirm = () => false;
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
global.FinancialMetricsService = require('./financial_metrics_service.js');
global.ExecutiveDashboardService = require('./executive_dashboard_service.js');

const app = require('../app.js');
const INDEX = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8').replace(/\r\n?/g, '\n');
const APP = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8').replace(/\r\n?/g, '\n');
const g = id => global.document.getElementById(id);

try {
  // --- A. Isaretleme ----------------------------------------------------------
  check(/<div class="header-filters" id="globalFilterBar">/.test(INDEX),
    'A1. Ust filtre cubugunun gorunurlugu JS ile yonetilebilir (id)', 'globalFilterBar yok');
  check(/<p id="globalFilterScopeHint" class="filter-scope-hint"><\/p>/.test(INDEX),
    'A2. Filtrenin neyi etkiledigini yazan bos baslangicli satir var', 'globalFilterScopeHint yok');
  const bitis = (INDEX.match(/<input[^>]*id="customFilterEnd"[^>]*>/) || [''])[0];
  check(bitis && !/value="/.test(bitis),
    'A3. Ozel aralik bitis kutusunda sabit tarih yok (CLAUDE.md 3.5)', bitis);
  check(/<div id="execSnapshotStatus" hidden/.test(INDEX),
    'A4. Gizli KPI seridinin durum satiri da gizli (Bugun filtre metni gostermez)', 'execSnapshotStatus gorunur');

  // --- B. Kapsam tablosu -------------------------------------------------------
  const kapsam = app.GLOBAL_FILTER_SCOPE;
  ['executive', 'reservations', 'properties', 'leads', 'guests', 'settings', 'maintenance', 'staff-field', 'analysis']
    .forEach(tab => {
      app.applyGlobalFilterScope(tab);
      check(g('globalFilterBar').hidden === true && g('globalFilterScopeHint').innerText === '',
        `B1. Filtreyi okumayan "${tab}" sayfasinda ust filtre gizli`, `hidden=${g('globalFilterBar').hidden}`);
    });
  Object.keys(kapsam).forEach(tab => {
    app.applyGlobalFilterScope(tab);
    check(g('globalFilterBar').hidden === false && g('globalFilterScopeHint').innerText === kapsam[tab]
      && kapsam[tab].length > 20,
      `B2. "${tab}" sayfasinda filtre gorunur ve neyi etkiledigini yazar`, g('globalFilterScopeHint').innerText);
  });

  // Kapsamdaki her sayfanin render plani filtreyi gercekten okumali: yoksa
  // aciklama yalan olur. Okuyucu = currentFilter / isBookingInFilter / ...
  const okur = /currentFilter|isBookingInFilter|isExpenseInFilter|computeFilterLedger|isCampaignInFilter|isDateInFilter/;
  const govde = ad => {
    const bas = APP.indexOf(`\nfunction ${ad}(`);
    if (bas < 0) return '';
    const son = APP.indexOf('\nfunction ', bas + 1);
    return APP.slice(bas, son);
  };
  const plan = { finance: ['renderFinanceModule'], expenses: ['renderExpensesTable'], pricing: ['renderPricingTab', 'renderPricingKpiStrip'],
    operations: ['renderOperationsCleaningView'], housekeeping: ['renderHousekeepingTab'], marketing: ['collectMarketingFacts', 'isCampaignInFilter'] };
  Object.keys(kapsam).forEach(tab => {
    const adlar = plan[tab] || [];
    check(adlar.length && adlar.some(ad => okur.test(govde(ad))),
      `B3. "${tab}" sayfasi ust filtreyi gercekten okuyor`, adlar.join(', ') || 'plan yok');
  });

  check(/applyGlobalFilterScope\(tabId\)/.test(govde('switchTab')),
    'B4. Sekme degisince filtre kapsami guncellenir', 'switchTab cagirmiyor');
  check(/applyGlobalFilterScope\(/.test(govde('renderAll')),
    'B5. Ilk acilista (renderAll) aktif sekmenin kapsami uygulanir', 'renderAll cagirmiyor');

  // --- C. Davranis -------------------------------------------------------------
  const buAy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()).slice(0, 7);
  const rez = (id, villa, ci, co, extra) => Object.assign({ id, villa, propertyId: villa === 'V1' ? 'p1' : 'p2', guest: 'Misafir ' + id,
    checkIn: ci, checkOut: co, nights: 2, gross: 10000, status: 'CONFIRMED', channel: 'DIRECT' }, extra || {});
  app.setAppData({
    tenantId: '00000000-0000-4000-8000-000000000001', companyName: 'Test İşletme',
    villas: {
      V1: { id: 'p1', slug: 'V1', name: 'Deniz Evi', basePrice: 10000, cleanCost: 0, activationDate: '2025-01-01' },
      V2: { id: 'p2', slug: 'V2', name: 'Orman Evi', basePrice: 10000, cleanCost: 0, activationDate: '2025-01-01' }
    },
    bookings: [
      rez('b1', 'V1', `${buAy}-03`, `${buAy}-05`),
      rez('b2', 'V1', '2025-02-03', '2025-02-05'),
      rez('b3', 'V2', '2025-03-03', '2025-03-05', { status: 'CANCELLED' })
    ],
    expenses: [], leads: [], maintenance: [], marketingCampaigns: [], influencerCollabs: [],
    closedPeriods: [], targets: [], cleaningTasks: [], isCleanState: false
  });

  // Ustteki filtre baska bir sayfada V2 + 2025-03'e ayarlanmis olsun.
  app.setCurrentFilter({ period: '2025-03', villa: 'V2', startDate: '2025-03-01', endDate: '2025-03-31' });
  app.renderAll();
  check(String(g('rezCountBadge').innerText) === '2',
    'C1. Menudeki rezervasyon sayisi gorunmeyen donem/mulk secimine bagli degil (iptal haric tumu)',
    `sayac=${g('rezCountBadge').innerText}`);

  g('todayMonthSummary').textContent = '';
  app.renderTodayMonthSummary(app.getAppData().bookings);
  check(/^Bu ay · 1 rezervasyon/.test(g('todayMonthSummary').textContent),
    'C2. Bugun "Bu ay" satiri baska sayfada secilen mulke gore daralmaz', g('todayMonthSummary').textContent);

  app.setCurrentFilter({ period: buAy, villa: 'ALL' });
} catch (error) {
  failed++;
  console.error(`[FAIL] Beklenmeyen hata\n       ${error && error.stack}`);
} finally {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
