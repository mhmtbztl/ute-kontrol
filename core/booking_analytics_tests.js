// =============================================================================
// LEXBNB — REZERVASYON ANALIZI (Analiz sekmesi) HESAP KATMANI
// core/booking_analytics.js — cevrimdisi
// =============================================================================

const assert = require('assert');
const LedgerContract = require('./ledger_contract.js');
const BookingAnalytics = require('./booking_analytics.js');

let passed = 0;
let total = 0;
let failed = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n       ') : err}`);
  }
}

// --- Sahte uygulama: ay performansi app.js computeMonthPerformance ile ayni
// sozlesme (ciro LedgerContract'tan, kapasite = ayin gunleri x faal mulk).
const VILLAS = [
  { key: 'deniz', name: 'Deniz Evi', id: '00000000-0000-4000-8000-000000000001', activeFrom: '2024-01-01' },
  { key: 'orman', name: 'Orman Evi', id: '00000000-0000-4000-8000-000000000002', activeFrom: '2024-01-01' },
  { key: 'yeni', name: 'Yeni Ev', id: '00000000-0000-4000-8000-000000000003', activeFrom: '2026-10-01' }
];

function makeApp(bookings, targets) {
  const daysIn = mk => Number(LedgerContract.monthRange(mk).end.slice(8));
  const villaMatch = (b, v) => v === 'ALL' || b.villa === v;
  function monthPerformance(mk, villa) {
    const r = LedgerContract.monthRange(mk);
    const l = LedgerContract.computePeriodLedger({
      bookings,
      bookingInScope: b => villaMatch(b, villa),
      bookingShare: b => LedgerContract.nightShareInRange(b, r.start, r.end)
    });
    const props = VILLAS.filter(v => villa === 'ALL' || v.key === villa);
    const available = props.reduce((s, v) => s + (v.activeFrom <= r.end ? daysIn(mk) : 0), 0);
    return { roomRevenue: l.netRoomRevenue, ciro: l.netRoomRevenue, nights: l.soldNights, available };
  }
  function monthTarget(mk, villa) {
    return (targets || []).find(t => t.month === mk && t.villa === villa) || null;
  }
  return {
    bookings,
    villas: VILLAS.map(({ key, name, id }) => ({ key, name, id })),
    today: '2026-11-05',
    deps: {
      monthPerformance,
      monthTarget,
      isBulkSummary: b => /^TOPLU AKTARIM/.test(b.guest || ''),
      channelName: c => ({ Direct: 'Doğrudan', AIRBNB: 'Airbnb' }[c] || c)
    }
  };
}

function bk(id, villa, checkIn, checkOut, gross, extra) {
  return Object.assign({
    id, villa, propertyId: VILLAS.find(v => v.key === villa).id, guest: 'Misafir ' + id,
    checkIn, checkOut, gross, cleanFee: 0, discount: 0, status: 'CONFIRMED',
    channel: 'Direct', createdAt: '2026-01-01T10:00:00Z'
  }, extra || {});
}

const BOOKINGS = [
  // Ekim 2026
  bk('a', 'deniz', '2026-10-03', '2026-10-08', 50000, { channel: 'AIRBNB', createdAt: '2026-09-03T08:00:00Z' }), // 5 gece, 30 gun once, Cumartesi
  bk('b', 'orman', '2026-10-10', '2026-10-12', 20000, { createdAt: '2026-10-08T08:00:00Z' }),                     // 2 gece, 2 gun once
  // Ay sinirini kesen: 10-29 -> 11-03, 4 gece, Ekim'e 3 gece (30.000), Kasim'a 1 gece (10.000)
  bk('c', 'deniz', '2026-10-29', '2026-11-02', 40000, { createdAt: '2026-06-01T08:00:00Z' }),
  // Iptal (Ekim girisli) — ciroya ve adede girmez, iptal oranina girer
  bk('x', 'orman', '2026-10-20', '2026-10-25', 99999, { status: 'CANCELLED' }),
  // Toplu aktarim ozeti — ciroya girer, adede girmez (L-103)
  bk('t', 'orman', '2026-10-01', '2026-10-31', 60000, { guest: 'TOPLU AKTARIM — Ekim 2026', createdAt: '2026-11-01T00:00:00Z' }),
  // Gecen yil Ekim 2025
  bk('ly', 'deniz', '2025-10-05', '2025-10-10', 25000, { createdAt: '2025-08-01T08:00:00Z' }),
  // 2 yil once Ekim 2024
  bk('ly2', 'deniz', '2024-10-05', '2024-10-07', 8000, { createdAt: '2024-09-01T08:00:00Z' }),
  // Onceki donem Eylul 2026
  bk('p', 'orman', '2026-09-10', '2026-09-14', 16000, { createdAt: '2026-08-01T08:00:00Z' }),
  // Sonradan girilmis kayit (olusma > giris) — rezervasyon oncesi sureye girmez
  bk('late', 'orman', '2026-10-15', '2026-10-16', 5000, { createdAt: '2026-10-20T08:00:00Z' }),
  // Ileriye dolu: Aralik 2026, bugunden once girilmis
  bk('f', 'deniz', '2026-12-20', '2026-12-25', 60000, { createdAt: '2026-10-01T08:00:00Z' })
];

const TARGETS = [
  { month: '2026-10', villa: 'ALL', revenue: 200000, occupancy: 60, adr: 0, revpar: 0 }
];

function report(over) {
  const app = makeApp(BOOKINGS, TARGETS);
  return BookingAnalytics.buildReport(Object.assign({
    bookings: app.bookings,
    villas: app.villas,
    today: app.today,
    period: { start: '2026-10', end: '2026-10' },
    villa: 'ALL',
    deps: app.deps
  }, over || {}));
}

console.log('=============================================================================');
console.log('LEXBNB — REZERVASYON ANALIZI HESAP KATMANI');
console.log('=============================================================================');

// ------------------------------------------------------------ donem --
test('D1. Karsilastirma donemleri: onceki ayni uzunlukta, gecen yil, 2 yil once', () => {
  const c = BookingAnalytics.comparisonPeriods({ start: '2026-08', end: '2026-10' });
  assert.deepStrictEqual(c.prev, { start: '2026-05', end: '2026-07' });
  assert.deepStrictEqual(c.yoy1, { start: '2025-08', end: '2025-10' });
  assert.deepStrictEqual(c.yoy2, { start: '2024-08', end: '2024-10' });
  const j = BookingAnalytics.comparisonPeriods({ start: '2026-01', end: '2026-01' });
  assert.deepStrictEqual(j.prev, { start: '2025-12', end: '2025-12' });
});

test('D2. Gecersiz donem reddedilir; bugun ve ay performansi zorunlu', () => {
  assert.throws(() => report({ period: { start: '2026-11', end: '2026-10' } }), /INVALID_ANALYTICS_PERIOD/);
  assert.throws(() => report({ today: '' }), /ANALYTICS_TODAY_REQUIRED/);
  assert.throws(() => report({ deps: {} }), /ANALYTICS_MONTH_PERFORMANCE_REQUIRED/);
});

// -------------------------------------------------- tek kaynak (3.4) --
test('K1. Ekim cirosu ay performansiyla birebir ayni (tahakkuk: c yalniz 3 gece payi)', () => {
  const r = report();
  const app = makeApp(BOOKINGS, TARGETS);
  const p = app.deps.monthPerformance('2026-10', 'ALL');
  assert.strictEqual(r.kpis.current.revenue, Math.round(p.roomRevenue));
  // a 50.000 + b 20.000 + c 30.000 (3/4) + toplu 60.000 + late 5.000 = 165.000
  assert.strictEqual(r.kpis.current.revenue, 165000);
  assert.strictEqual(r.kpis.current.nights, 5 + 2 + 3 + 30 + 1);
});

test('K2. Cok aylik donem: ciro/gece/kapasite toplanir, doluluk toplamdan hesaplanir', () => {
  const r = report({ period: { start: '2026-09', end: '2026-10' } });
  const app = makeApp(BOOKINGS, TARGETS);
  const e = app.deps.monthPerformance('2026-09', 'ALL');
  const k = app.deps.monthPerformance('2026-10', 'ALL');
  assert.strictEqual(r.kpis.current.nights, e.nights + k.nights);
  assert.strictEqual(r.kpis.current.available, e.available + k.available);
  const beklenen = Math.round((e.nights + k.nights) / (e.available + k.available) * 1000) / 10;
  assert.strictEqual(r.kpis.current.occupancy, beklenen);
  // Ay oranlarinin ortalamasi DEGIL
  const ortalama = Math.round(((e.nights / e.available + k.nights / k.available) / 2) * 1000) / 10;
  assert.notStrictEqual(beklenen, ortalama);
});

test('K3. Kapasite 0 ise doluluk ve RevPAR null; gece 0 ise ADR null', () => {
  const agg = BookingAnalytics.aggregateMonths([{ roomRevenue: 0, nights: 0, available: 0 }]);
  assert.strictEqual(agg.occupancy, null);
  assert.strictEqual(agg.revpar, null);
  assert.strictEqual(agg.adr, null);
  const yok = BookingAnalytics.aggregateMonths([{ roomRevenue: 0, nights: 0, available: null }]);
  assert.strictEqual(yok.available, null);
});

// ------------------------------------------------------ kayit basi --
test('B1. Rezervasyon adedi: iptal ve toplu aktarim ozeti sayilmaz; iptal orani ayri', () => {
  const r = report();
  // Ekim girisli: a, b, c, late (+ x iptal, t toplu)
  assert.strictEqual(r.kpis.current.bookings, 4);
  assert.strictEqual(r.kpis.current.cancelled, 1);
  assert.strictEqual(r.kpis.current.cancelRate, 20);
});

test('B2. Ortalama konaklama ve giris gunu dagilimi', () => {
  const r = report();
  // a 5, b 2, c 4, late 1 -> 3
  assert.strictEqual(r.kpis.current.avgStay, 3);
  assert.strictEqual(r.behavior.stayBuckets.find(b => b.key === '1-2').count, 2);
  assert.strictEqual(r.behavior.stayBuckets.find(b => b.key === '3-4').count, 1);
  assert.strictEqual(r.behavior.stayBuckets.find(b => b.key === '5-7').count, 1);
  // 2026-10-03 Cumartesi -> indeks 5
  assert.strictEqual(r.behavior.weekday[5], 2); // a (10-03) ve b (10-10) Cumartesi
  assert.strictEqual(r.behavior.weekday.reduce((s, v) => s + v, 0), 4);
});

test('B3. Rezervasyon oncesi sure: sonradan girilen ve ice aktarilan kayit orneklenmez', () => {
  const r = report();
  // a 30, b 2, c 150 -> ortalama 61; late dislanir
  assert.strictEqual(r.kpis.current.avgLeadTime, 61);
  assert.strictEqual(r.behavior.leadTimeSample, 3);
  assert.strictEqual(r.behavior.leadTimeExcluded, 1);
  const app = makeApp(BOOKINGS, TARGETS);
  const r2 = BookingAnalytics.buildReport({
    bookings: app.bookings, villas: app.villas, today: app.today,
    period: { start: '2026-10', end: '2026-10' },
    deps: Object.assign({}, app.deps, { isImported: b => b.id === 'c' })
  });
  assert.strictEqual(r2.kpis.current.avgLeadTime, 16);
  assert.strictEqual(r2.behavior.leadTimeExcluded, 2);
});

// --------------------------------------------------------- kiyaslar --
test('C1. Gecen yil ve 2 yil once ayni ay; degisim tutarda yuzde, dolulukta puan', () => {
  const r = report({ villa: 'deniz' });
  assert.strictEqual(r.kpis.compare.yoy1.revenue, 25000);
  assert.strictEqual(r.kpis.compare.yoy2.revenue, 8000);
  // deniz Ekim 2026: a 50.000 + c 30.000 = 80.000 -> gecen yila gore +%220
  assert.strictEqual(r.kpis.current.revenue, 80000);
  assert.deepStrictEqual(r.kpis.deltas.revenue.yoy1, { kind: 'pct', value: 220 });
  assert.strictEqual(r.kpis.deltas.occupancy.yoy1.kind, 'pp');
});

test('C2. Kayit olmayan kiyas donemi null + neden (0 sayilmaz)', () => {
  const r = report({ villa: 'orman' });
  assert.strictEqual(r.kpis.compare.yoy1, null);
  assert.strictEqual(r.kpis.deltas.revenue.yoy1, null);
  assert.ok(/kayıt yok/.test(r.kpis.reasons.yoy1));
});

test('C3. Portfoy ortalamasi yalniz tek mulkte; ciro mulk basina, doluluk portfoyun', () => {
  const tum = report();
  assert.strictEqual(tum.kpis.compare.portfolio, null);
  assert.ok(tum.kpis.reasons.portfolio);
  const r = report({ villa: 'deniz' });
  // Ekim 2026'da kapasitesi olan 3 mulk (yeni ev 10-01'de basliyor)
  assert.strictEqual(r.kpis.compare.portfolio.propertyCount, 3);
  assert.strictEqual(r.kpis.compare.portfolio.revenue, Math.round(165000 / 3));
  assert.strictEqual(r.kpis.compare.portfolio.occupancy, tum.kpis.current.occupancy);
});

test('C4. Hedef: girilmis alanlar; 0 girilmis ADR hedefi yok sayilir; eksik ayda hedef yok', () => {
  const r = report();
  assert.strictEqual(r.kpis.compare.target.revenue, 200000);
  assert.strictEqual(r.kpis.compare.target.occupancy, 60);
  assert.strictEqual(r.kpis.compare.target.adr, null);
  assert.deepStrictEqual(r.kpis.deltas.revenue.target, { kind: 'pct', value: -17.5 });
  const iki = report({ period: { start: '2026-09', end: '2026-10' } });
  assert.strictEqual(iki.kpis.compare.target.revenue, null, 'Eylul hedefi yok: toplam hedef uydurulmaz');
});

// ------------------------------------------------------------ trend --
test('T1. Kisa donemde trend 12 ay; gecen yil serisi ayni aya hizali, bos ay null', () => {
  const r = report({ villa: 'deniz' });
  assert.strictEqual(r.trend.months.length, 12);
  assert.strictEqual(r.trend.months[11], '2026-10');
  const s = r.trend.series.revenue;
  assert.strictEqual(s.current[11], 80000);
  assert.strictEqual(s.yoy1[11], 25000);
  assert.strictEqual(s.yoy1[10], null, 'Eylul 2025 kayitsiz: null, 0 degil');
  assert.strictEqual(s.yoy2[11], 8000);
  assert.ok(Array.isArray(s.portfolio));
});

test('T2. Hedef serisi yalniz hedefi olan metrikte; portfoyde portfoy serisi yok', () => {
  const r = report();
  assert.strictEqual(r.trend.series.revenue.target[11], 200000);
  assert.strictEqual(r.trend.series.adr.target, null);
  assert.strictEqual(r.trend.series.nights.target, null);
  assert.strictEqual(r.trend.series.revenue.portfolio, null);
});

// ----------------------------------------------------- mulk tablosu --
test('M1. Mulk satirlari, ciro payi ve gecen yila gore degisim', () => {
  const r = report();
  const deniz = r.properties.rows.find(x => x.key === 'deniz');
  const orman = r.properties.rows.find(x => x.key === 'orman');
  assert.strictEqual(deniz.metrics.revenue, 80000);
  assert.strictEqual(orman.metrics.revenue, 85000);
  assert.strictEqual(deniz.revenueShare, Math.round(80000 / 165000 * 1000) / 10);
  assert.deepStrictEqual(deniz.yoyRevenue, { kind: 'pct', value: 220 });
  assert.strictEqual(orman.yoyRevenue, null);
  assert.strictEqual(r.properties.total.revenue, 165000);
  assert.strictEqual(r.properties.average.revenue, Math.round((80000 + 85000 + 0) / r.properties.rows.length));
});

// ------------------------------------------------------------ kanal --
test('K-1. Kanal cirosu tahakkuklu; toplu aktarim ciroda var, adette yok', () => {
  const r = report();
  const airbnb = r.channels.rows.find(x => x.key === 'AIRBNB');
  const direct = r.channels.rows.find(x => x.key === 'Direct');
  assert.strictEqual(airbnb.label, 'Airbnb');
  assert.strictEqual(airbnb.revenue, 50000);
  assert.strictEqual(direct.revenue, 115000);
  assert.strictEqual(direct.bookings, 3); // b, c, late
  assert.strictEqual(r.channels.totalRevenue, r.kpis.current.revenue);
  assert.strictEqual(r.channels.rows[0].key, 'Direct', 'ciroya gore sirali');
});

// ------------------------------------------------------------ talep --
test('L1. Talep hunisi ve kanal donusumu', () => {
  const leads = [
    { id: 1, date: '2026-10-02', status: 'WON', channel: 'Instagram', villa: 'deniz' },
    { id: 2, date: '2026-10-05', status: 'LOST', channel: 'Instagram', lostReason: 'Fiyat Yüksek', villa: 'deniz' },
    { id: 3, date: '2026-10-06', status: 'QUOTE_SENT', channel: 'WhatsApp', quoteAmount: 30000, villa: 'orman' },
    { id: 4, date: '2026-10-07', status: 'NEW', channel: 'WhatsApp', villa: 'orman' },
    { id: 5, date: '2026-09-07', status: 'WON', channel: 'WhatsApp', villa: 'orman' }
  ];
  const r = report({ leads });
  assert.strictEqual(r.leads.total, 4);
  assert.strictEqual(r.leads.contacted, 3);
  assert.strictEqual(r.leads.quoted, 2);
  assert.strictEqual(r.leads.won, 1);
  assert.strictEqual(r.leads.conversion, 25);
  assert.strictEqual(r.leads.closeRate, 50);
  assert.deepStrictEqual(r.leads.lossReasons, [{ reason: 'Fiyat Yüksek', count: 1 }]);
  assert.strictEqual(r.leads.byChannel.find(c => c.key === 'Instagram').conversion, 50);
  const d = report({ leads, villa: 'deniz' });
  assert.strictEqual(d.leads.total, 2);
});

// ----------------------------------------------------- ileriye dolu --
test('P1. Ileriye dolu: Kasim yalniz bugunden sonraki geceler; gecen yil kaydi yoksa null + neden', () => {
  const r = report();
  assert.deepStrictEqual(r.pace.rows.map(x => x.month), ['2026-11', '2026-12', '2027-01']);
  const kas = r.pace.rows[0];
  assert.strictEqual(kas.nights, 0, 'c rezervasyonunun Kasim gecesi 11-01, bugunden once');
  const ara = r.pace.rows[1];
  assert.strictEqual(ara.nights, 5);
  assert.strictEqual(ara.revenue, 60000);
  assert.strictEqual(ara.lastYear, null);
  assert.ok(ara.lastYearReason);
});

test('P2. Gecen yilin kaydi sonradan girildiyse kiyas yapilmaz', () => {
  const extra = BOOKINGS.concat([
    bk('lyd', 'deniz', '2025-12-10', '2025-12-12', 9000, { createdAt: '2026-02-01T00:00:00Z' })
  ]);
  const app = makeApp(extra, TARGETS);
  const r = BookingAnalytics.buildReport({
    bookings: app.bookings, villas: app.villas, today: app.today,
    period: { start: '2026-10', end: '2026-10' }, deps: app.deps
  });
  const ara = r.pace.rows[1];
  assert.strictEqual(ara.lastYear, null);
  assert.ok(/sonradan/.test(ara.lastYearReason));
});

test('P3. Gecen yil ayni tarihte elde olan sayilir (sonra yapilan rezervasyon degil)', () => {
  const extra = BOOKINGS.concat([
    bk('ly-erken', 'deniz', '2025-12-01', '2025-12-05', 20000, { createdAt: '2025-10-01T00:00:00Z' }),
    bk('ly-gec', 'deniz', '2025-12-20', '2025-12-22', 10000, { createdAt: '2025-11-20T00:00:00Z' })
  ]);
  const app = makeApp(extra, TARGETS);
  const r = BookingAnalytics.buildReport({
    bookings: app.bookings, villas: app.villas, today: app.today,
    period: { start: '2026-10', end: '2026-10' }, deps: app.deps
  });
  const ara = r.pace.rows[1];
  assert.deepStrictEqual(ara.lastYear, { revenue: 20000, nights: 4 });
  assert.deepStrictEqual(ara.revenueDelta, { kind: 'pct', value: 200 });
});

// ---------------------------------------------------- bos isletme (3.6) --
test('E1. Bos isletmede hicbir rakam uydurulmaz', () => {
  const app = makeApp([], []);
  const r = BookingAnalytics.buildReport({
    bookings: [], villas: app.villas, today: app.today,
    period: { start: '2026-10', end: '2026-10' }, deps: app.deps
  });
  assert.strictEqual(r.empty, true);
  assert.strictEqual(r.kpis.current.revenue, 0);
  assert.strictEqual(r.kpis.current.adr, null);
  assert.strictEqual(r.kpis.current.avgStay, null);
  assert.strictEqual(r.kpis.current.avgLeadTime, null);
  assert.strictEqual(r.kpis.current.cancelRate, null);
  assert.strictEqual(r.kpis.compare.prev, null);
  assert.strictEqual(r.kpis.compare.yoy1, null);
  assert.strictEqual(r.channels.rows.length, 0);
  assert.strictEqual(r.leads.conversion, null);
  r.pace.rows.forEach(x => assert.strictEqual(x.lastYear, null));
  Object.values(r.kpis.deltas).forEach(d => Object.values(d).forEach(v => assert.strictEqual(v, null)));
});

console.log('-----------------------------------------------------------------------------');
console.log(`Sonuc: ${passed}/${total} gecti`);
if (failed > 0) process.exit(1);
