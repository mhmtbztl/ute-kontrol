/**
 * LEXBNB — ANALIZ SEKMESI ENTEGRASYONU (gercek app.js)
 *
 * Analiz rakamlari Bugun ekrani ve Finans aylik KPI tablosuyla AYNI kaynaktan
 * gelmek zorunda (CLAUDE.md 3.4). booking_analytics_tests bunu sahte ay
 * performansiyla olcer; bu suit app.js'i calistirir ve raporu gercek
 * computeMonthPerformance ile karsilastirir. Ayrica hedef okuma, rol kapisi
 * ve bos isletmede sekmenin uydurma rakam yazmadigi olculur.
 *
 * Dis sisteme baglanmaz.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const App = require('../app.js');
const BookingAnalytics = require('./booking_analytics.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (err) {
    failed++; console.error(`[FAIL] ${name}\n       ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n       ') : err}`);
  }
}

const TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROP_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const PROP_B = 'aaaaaaaa-0000-4000-8000-00000000000b';

function bk(id, villa, checkIn, checkOut, gross, extra) {
  return Object.assign({
    id, dbId: id, villa, propertyId: villa === 'A' ? PROP_A : PROP_B, guest: 'Misafir ' + id,
    checkIn, checkOut, gross, cleanFee: 0, discount: 0, status: 'CONFIRMED', channel: 'Direct',
    createdAt: '2031-01-01T08:00:00Z'
  }, extra || {});
}

const VERI = {
  villas: {
    A: { id: PROP_A, slug: 'A', name: 'Villa A', activated_on: '2030-01-01', activatedOn: '2030-01-01' },
    B: { id: PROP_B, slug: 'B', name: 'Villa B', activated_on: '2030-01-01', activatedOn: '2030-01-01' }
  },
  bookings: [
    bk('a1', 'A', '2031-05-03', '2031-05-08', 50000, { cleanFee: 2000, discount: 1000, channel: 'AIRBNB' }),
    // Ay sinirini keser: Mayis'a 2 gece, Haziran'a 2 gece
    bk('a2', 'A', '2031-05-30', '2031-06-03', 40000),
    bk('b1', 'B', '2031-05-10', '2031-05-13', 21000),
    bk('bx', 'B', '2031-05-15', '2031-05-18', 99999, { status: 'CANCELLED' }),
    bk('ly', 'A', '2030-05-05', '2030-05-09', 20000, { createdAt: '2030-03-01T08:00:00Z' })
  ],
  expenses: [], cleaningTasks: [], closedPeriods: [], maintenance: [], leads: [],
  targets: [
    { year: 2031, month: 5, property_id: null, revenue_target: 100000, occupancy_target: 40, adr_target: 0, revpar_target: 0 },
    { year: 2031, month: 5, property_id: PROP_A, revenue_target: 60000, occupancy_target: 0, adr_target: 9000, revpar_target: 0 }
  ]
};

function ortamKur(veri, rol) {
  App.setActiveTenant({ id: TENANT, role: rol || 'owner' });
  App.setAppData(Object.assign({}, JSON.parse(JSON.stringify(VERI)), veri || {}));
}

function rapor(villa) {
  const villas = ['A', 'B'].map(k => ({ key: k, name: 'Villa ' + k, id: k === 'A' ? PROP_A : PROP_B }));
  return BookingAnalytics.buildReport({
    bookings: JSON.parse(JSON.stringify(VERI.bookings)), villas, today: '2031-06-10',
    period: { start: '2031-05', end: '2031-05' }, villa,
    deps: {
      monthPerformance: (m, v) => App.computeMonthPerformance(m, v),
      monthTarget: (m, v) => App.analyticsMonthTarget(m, v),
      isBulkSummary: App.isBulkSummaryBooking,
      channelName: App.getChannelDisplayName
    }
  });
}

console.log('=============================================================================');
console.log('LEXBNB — ANALIZ SEKMESI ENTEGRASYONU (gercek app.js)');
console.log('=============================================================================');

test('I1. Portfoy: ciro, gece, doluluk, ADR, RevPAR gercek computeMonthPerformance ile birebir', () => {
  ortamKur();
  const p = App.computeMonthPerformance('2031-05', 'ALL');
  const k = rapor('ALL').kpis.current;
  assert.strictEqual(k.revenue, Math.round(p.roomRevenue));
  assert.strictEqual(k.nights, p.nights);
  assert.strictEqual(k.available, p.available);
  assert.strictEqual(k.occupancy, p.occupancy);
  assert.strictEqual(k.adr, p.adr);
  assert.strictEqual(k.revpar, p.revpar);
  // Elle: a1 (50.000 - 2.000 temizlik - 1.000 indirim) + a2 yarisi 20.000 + b1 21.000
  assert.strictEqual(k.revenue, 47000 + 20000 + 21000);
});

test('I2. Tek mulk: ayni esitlik; mulk tablosu toplami portfoy kartiyla ayni', () => {
  ortamKur();
  ['A', 'B'].forEach(v => {
    const p = App.computeMonthPerformance('2031-05', v);
    const k = rapor(v).kpis.current;
    assert.strictEqual(k.revenue, Math.round(p.roomRevenue), v + ' ciro');
    assert.strictEqual(k.occupancy, p.occupancy, v + ' doluluk');
    assert.strictEqual(k.adr, p.adr, v + ' ADR');
  });
  const r = rapor('ALL');
  const toplam = r.properties.rows.reduce((s, x) => s + x.metrics.revenue, 0);
  assert.strictEqual(toplam, r.kpis.current.revenue);
  assert.strictEqual(r.properties.total.revenue, r.kpis.current.revenue);
});

test('I3. Hedef: portfoy ve mulk satiri ayri; 0 girilmis ADR/doluluk hedefi yok sayilir', () => {
  ortamKur();
  assert.deepStrictEqual(App.analyticsMonthTarget('2031-05', 'ALL'), { revenue: 100000, occupancy: 40, adr: null, revpar: null });
  assert.deepStrictEqual(App.analyticsMonthTarget('2031-05', 'A'), { revenue: 60000, occupancy: null, adr: 9000, revpar: null });
  assert.strictEqual(App.analyticsMonthTarget('2031-04', 'ALL'), null);
  assert.strictEqual(App.analyticsMonthTarget('2031-05', 'B'), null);
  const r = rapor('A');
  assert.strictEqual(r.kpis.compare.target.revenue, 60000);
  assert.strictEqual(r.kpis.compare.target.adr, 9000);
});

test('I4. Gecen yil kiyasi gercek ay performansindan', () => {
  ortamKur();
  const r = rapor('A');
  assert.strictEqual(r.kpis.compare.yoy1.revenue, Math.round(App.computeMonthPerformance('2030-05', 'A').roomRevenue));
  assert.strictEqual(r.kpis.compare.yoy1.revenue, 20000);
});

// ------------------------------------------------- sekme baglantisi ---
const KOK = path.join(__dirname, '..');
const INDEX = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
const APP = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');

test('I5. index.html: menu kalemi, sekme kabi, stil ve betik sirasi', () => {
  assert.match(INDEX, /data-onclick="switchTab\('analytics'\)">📊 Analiz</);
  assert.match(INDEX, /<div id="tab-analytics" class="tab-content">\s*<div id="analyticsRoot"><\/div>\s*<\/div>/);
  assert.match(INDEX, /<link rel="stylesheet" href="analytics\.css\?v=[0-9a-f]{8}">/);
  // Analiz modulleri acilista yuklenmez (acilis JS butcesi, L-163): <script> etiketi
  // yok; app.js calisma aninda damgali adresle ister (stamp_assets SATELLITE).
  assert.ok(!INDEX.includes('src="core/booking_analytics.js') && !INDEX.includes('src="core/analytics_ui.js'), 'analiz modulleri acilista yuklenmemeli');
  assert.match(APP, /const ANALYTICS_ENGINE_URL = 'core\/booking_analytics\.js\?v=[0-9a-f]{8}';/);
  assert.match(APP, /const ANALYTICS_UI_URL = 'core\/analytics_ui\.js\?v=[0-9a-f]{8}';/);
});

test('I6. app.js: switchTab, ACTIVE_RENDER_PLANS ve rol kapisi', () => {
  assert.match(APP, /if \(tabId === 'analytics'\) renderAnalyticsTab\(\);/);
  assert.match(APP, /'tab-analytics': \['renderAnalyticsTab'\]/);
  // Sekme ay performansini Bugun ekraninin fonksiyonundan alir (tek kaynak).
  // Onbellek araya girer ama deger computeMonthPerformance'in kendisidir.
  assert.match(APP, /monthPerformance: analyticsMonthPerformance,/);
  assert.match(APP, /degerler\.set\(k, computeMonthPerformance\(monthKey, villa\)\)/);
  assert.match(APP, /isBulkSummary: isBulkSummaryBooking,/);
  assert.match(APP, /leadChannelName: leadChannelLabel,/);
  assert.match(APP, /if \(!canReadSalesRole\(role\)\) hiddenTabs\.add\('analytics'\);/);
  assert.match(APP, /if \(tabId === 'analytics' && !canReadSalesRole\(activeTenant\?\.role\)\)/);
});

test('I7. server.js ve Pages izin listesi analytics.css ve iki modulu verir', () => {
  const server = require('../server.js');
  const isAllowed = server.isAllowed || (server.default && server.default.isAllowed);
  assert.strictEqual(typeof isAllowed, 'function', 'server.js isAllowed disa aktarmali');
  ['analytics.css', 'core/booking_analytics.js', 'core/analytics_ui.js'].forEach(f => assert.ok(isAllowed(f), f));
  assert.ok(!isAllowed('core/analytics_ui_tests.js'));
});

// ------------------------------------------- render (sahte DOM) -------
class N {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.children = []; this.parentNode = null; this._t = ''; this.listeners = {}; this.style = {}; this.hidden = false; this.dataset = {};
    const self = this; this.classList = { add: c => self.attrs.set('class', ((self.attrs.get('class') || '') + ' ' + c).trim()), toggle() {}, contains: c => String(self.attrs.get('class') || '').split(/\s+/).includes(c) }; }
  setAttribute(k, v) { if (k === 'style' || /^on/i.test(k)) throw new Error('YASAK ' + k); this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  get textContent() { return this.tagName === '#T' ? this._t : this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.children = []; if (this.tagName === '#T') this._t = String(v); else if (v !== '') { const t = new N('#t'); t._t = String(v); this.appendChild(t); } }
  set innerHTML(v) { throw new Error('innerHTML kullanildi'); }
  get clientWidth() { return 0; }
  get isConnected() { return false; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener() {}
  contains() { return false; }
  all() { const o = []; const w = n => n.children.forEach(c => { if (c.tagName !== '#T') { o.push(c); w(c); } }); w(this); return o; }
  querySelectorAll(sel) { const cls = sel.startsWith('.') ? sel.slice(1) : null; const m = sel.match(/^\[([\w-]+)\]$/); return this.all().filter(n => (cls && String(n.attrs.get('class') || '').split(/\s+/).includes(cls)) || (m && n.hasAttribute(m[1]))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function sahteDom() {
  const root = new N('div');
  global.document = {
    createElement: t => new N(t), createElementNS: (ns, t) => new N(t),
    createTextNode: v => { const t = new N('#t'); t._t = String(v); return t; },
    getElementById: id => (id === 'analyticsRoot' ? root : null)
  };
  global.AnalyticsUI = require('./analytics_ui.js');
  return root;
}

test('I8. renderAnalyticsTab: bos isletmede "Henuz rezervasyon yok", uydurma tutar/yuzde yok', () => {
  const root = sahteDom();
  try {
    ortamKur({ bookings: [], targets: [] });
    App.renderAnalyticsTab();
    const t = root.textContent;
    assert.ok(t.includes('Henüz rezervasyon yok'), t.slice(0, 200));
    assert.ok(!/₺\s?\d/.test(t));
    assert.ok(!/%\d/.test(t));
  } finally {
    delete global.document;
  }
});

test('I9. renderAnalyticsTab: verili isletmede KPI kartlari cizilir; NaN/undefined yok', () => {
  const root = sahteDom();
  try {
    ortamKur();
    App.renderAnalyticsTab();
    // Sekme kendi varsayilan donemini (son tamamlanan ay) secer; kartlar her durumda cizilir.
    assert.strictEqual(root.querySelectorAll('.ba-kpi').length, 8);
    assert.ok(!/NaN|undefined|Infinity/.test(root.textContent));
  } finally {
    delete global.document;
  }
});

// --------------------------------------------- ice aktarim bagi ------
async function testAsync(name, fn) {
  try { await fn(); passed++; console.log(`[PASS] ${name}`); } catch (err) {
    failed++; console.error(`[FAIL] ${name}\n       ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n       ') : err}`);
  }
}
function sahteIstemci(satirlar, sorgular) {
  const q = { filtreler: [] };
  const zincir = {
    select(c) { q.select = c; return zincir; },
    eq(k, v) { q.filtreler.push(['eq', k, v]); return zincir; },
    not(k, op, v) { q.filtreler.push(['not', k, op, v]); return zincir; },
    range() { sorgular.push(JSON.parse(JSON.stringify(q))); return Promise.resolve({ data: satirlar, error: null }); }
  };
  return { from(t) { q.tablo = t; q.filtreler = []; return zincir; } };
}

(async () => {
  await testAsync('I10. Ice aktarilan rezervasyon kimlikleri kiracinin kendi bagindan okunur; kiraci degisince kullanilmaz', async () => {
    const sorgular = [];
    App.setSupabaseClient(sahteIstemci([{ booking_id: 'a1' }], sorgular));
    ortamKur();
    await App.loadAnalyticsImportedBookingIds(TENANT);
    assert.strictEqual(sorgular[0].tablo, 'finance_import_batch_rows');
    assert.strictEqual(sorgular[0].select, 'booking_id');
    assert.deepStrictEqual(sorgular[0].filtreler[0], ['eq', 'tenant_id', TENANT]);
    assert.strictEqual(App.isAnalyticsImportedBooking({ id: 'a1', dbId: 'a1' }), true);
    assert.strictEqual(App.isAnalyticsImportedBooking({ id: 'b1', dbId: 'b1' }), false);
    App.setActiveTenant({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', role: 'owner' });
    assert.strictEqual(App.isAnalyticsImportedBooking({ id: 'a1', dbId: 'a1' }), false, 'baska kiracinin bagi kullanilmaz');
    App.setSupabaseClient(null);
  });

  await testAsync('I11. Ay performansi onbellegi: deger kaynakla ayni; veri degisince yenilenir (bayat deger yok)', async () => {
    const tur = () => new Promise(r => setImmediate(r));
    ortamKur();
    await tur();
    const ilk = App.analyticsMonthPerformance('2031-05', 'ALL');
    assert.deepStrictEqual(ilk, App.computeMonthPerformance('2031-05', 'ALL'));
    await tur();
    assert.strictEqual(App.analyticsMonthPerformance('2031-05', 'ALL'), ilk, 'ayni veride onbellekten (ayni nesne)');
    // Yerinde ekleme: dizi ayni, uzunluk degisir
    App.getAppData().bookings.push(bk('yeni', 'B', '2031-05-20', '2031-05-22', 8000, { createdAt: '2031-05-01T00:00:00Z' }));
    await tur();
    const eklendi = App.analyticsMonthPerformance('2031-05', 'ALL');
    assert.strictEqual(Math.round(eklendi.roomRevenue), Math.round(ilk.roomRevenue) + 8000, 'yeni rezervasyon yansimali');
    // Yerinde duzenleme: tutar degisir, updatedAt ilerler
    const b = App.getAppData().bookings.find(x => x.id === 'yeni');
    b.gross = 10000; b.updatedAt = '2031-06-01T00:00:00Z';
    await tur();
    assert.strictEqual(Math.round(App.analyticsMonthPerformance('2031-05', 'ALL').roomRevenue), Math.round(ilk.roomRevenue) + 10000, 'duzenleme yansimali');
    // Yeniden yukleme: yeni dizi
    ortamKur();
    await tur();
    assert.deepStrictEqual(App.analyticsMonthPerformance('2031-05', 'ALL'), App.computeMonthPerformance('2031-05', 'ALL'));
  });

  await testAsync('I12. Analiz modulleri gecikmeli yuklenir: once motor, sonra arayuz; hata olursa yeniden denenir', async () => {
    const tur = () => new Promise(r => setImmediate(r));
    const eskiUI = global.AnalyticsUI, eskiBA = global.BookingAnalytics;
    delete global.AnalyticsUI; delete global.BookingAnalytics;
    const eklenen = [];
    const kok = { textContent: '', firstChild: null };
    global.document = { createElement: () => ({}), head: { appendChild: tag => eklenen.push(tag) }, getElementById: id => (id === 'analyticsRoot' ? kok : null) };
    try {
      // Hata yolu: motor yuklenemez -> soz reddedilir, sonraki cagri yeniden ister
      const p1 = App.loadAnalyticsModules();
      assert.strictEqual(eklenen.length, 1);
      eklenen[0].onerror();
      await assert.rejects(p1);
      await tur();
      assert.match(kok.textContent, /Analiz yüklenemedi/);
      const p2 = App.loadAnalyticsModules();
      assert.strictEqual(eklenen.length, 2, 'hatadan sonra yeniden istenmeli');
      assert.match(eklenen[1].src, /^core\/booking_analytics\.js\?v=[0-9a-f]{8}$/);
      assert.strictEqual(App.loadAnalyticsModules(), p2, 'yuklenirken ikinci istek acilmaz');
      global.BookingAnalytics = BookingAnalytics; eklenen[1].onload();
      await tur();
      assert.strictEqual(eklenen.length, 3, 'motor gelince arayuz istenir');
      assert.match(eklenen[2].src, /^core\/analytics_ui\.js\?v=[0-9a-f]{8}$/);
      global.AnalyticsUI = require('./analytics_ui.js'); eklenen[2].onload();
      assert.strictEqual(await p2, true);
      assert.strictEqual(await App.loadAnalyticsModules(), true);
      assert.strictEqual(eklenen.length, 3, 'yuklendikten sonra yeni etiket yok');
    } finally {
      delete global.document;
      if (eskiUI) global.AnalyticsUI = eskiUI; else delete global.AnalyticsUI;
      if (eskiBA) global.BookingAnalytics = eskiBA; else delete global.BookingAnalytics;
    }
  });

  console.log('-----------------------------------------------------------------------------');
  console.log(`Sonuc: ${passed}/${passed + failed} gecti`);
  if (failed > 0) process.exit(1);
})();
