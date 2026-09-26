/**
 * LEXBNB EKRAN TUTARLILIGI AGI — CEVRIMDISI
 *
 * 26 Eylul 2026'da kullanicinin gercek hesabinda, tarayicida olculdu:
 *
 *  A. Operasyon ekrani "Temizlik Borcu ₺2.500" diyordu; hemen altindaki liste
 *     "Bekleyen temizlik borcu yok". Kart, henuz YAPILMAMIS (planli) gorevi de
 *     borc sayiyordu. K-04: borc temizlik "yapildi" isaretlenince dogar
 *     (CLAUDE.md 3.4). Kural kodda alti yerde dogru, iki yerde yanlisti.
 *  B. "Donemi Yeniden Ac" dugmesi AcIK donemde gorunuyordu: kod `hidden`
 *     veriyordu, `.btn { display }` kurali onu eziyordu.
 *  C. Finans'taki ilerleme cubugunda "Hedef Noktasi (%100)" isareti HTML'de
 *     sabit left: 62% yaziliydi ve hic guncellenmiyordu (3.5'in kacirdigi
 *     sabit deger: elemanin id'si yoktu).
 *  D. Kanal ekonomisi tablosunda basliklar ortali, degerler sola dayaliydi.
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
const INDEX = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(KOK, 'style.css'), 'utf8');
const MKT = fs.readFileSync(path.join(KOK, 'core', 'marketing_ui.js'), 'utf8');
const g = id => global.document.getElementById(id);

function veri(extra) {
  return Object.assign({
    tenantId: '00000000-0000-4000-8000-000000000001', companyName: 'Test İşletme',
    villas: { V1: { id: 'p1', slug: 'V1', name: 'Deniz Evi', basePrice: 10000, cleanCost: 0, activationDate: '2025-01-01' } },
    bookings: [], expenses: [], leads: [], maintenance: [], marketingCampaigns: [], influencerCollabs: [],
    closedPeriods: [], targets: [], isCleanState: false,
    cleaningTasks: [
      // Planli: ne gider ne borc
      { id: 't1', villa: 'V1', date: '2026-09-21', amount: 2500, paid: false, status: 'PLANNED', cleaner: 'A' },
      // Yapildi, odenmedi: BORC
      { id: 't2', villa: 'V1', date: '2026-09-10', amount: 1000, paid: false, status: 'DONE', cleaner: 'B' },
      // Yapildi, odendi: borc degil
      { id: 't3', villa: 'V1', date: '2026-09-05', amount: 700, paid: true, status: 'DONE', cleaner: 'C' },
      // Yapilmadi: ne gider ne borc
      { id: 't4', villa: 'V1', date: '2026-09-02', amount: 900, paid: false, status: 'SKIPPED', cleaner: 'D' }
    ]
  }, extra || {});
}

(async () => {
try {
  // --- A. Temizlik borcu ------------------------------------------------------
  app.setAppData(veri());
  app.setCurrentFilter({ period: '2026-09', villa: 'ALL', startDate: '2026-09-01', endDate: '2026-09-30' });
  let hata = null;
  try { app.renderOperationsKpiStrip(); } catch (e) { hata = e; }
  check(!hata && g('opsDebtVal').innerText === '₺1.000',
    'A1. Operasyon borç kartı yalnız YAPILMIŞ ve ödenmemiş temizliği sayar (planlı/yapılmadı borç değil)',
    hata ? hata.message : `kart=${g('opsDebtVal').innerText} beklenen=₺1.000`);
  hata = null;
  try { app.renderDailyOps(); } catch (e) { hata = e; }
  check(!hata && /^1 Ödenecek/.test(g('todayHousekeepingBadge').innerText),
    'A2. Temizlik rozetindeki "Ödenecek" sayısı aynı kural: 1',
    hata ? hata.message : `rozet=${g('todayHousekeepingBadge').innerText}`);
  const APP_SRC = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
  check(!/cleaningTasks[^\n;]*\.filter\(t => !t\.paid\)|tasks\.filter\(t => !t\.paid\)/.test(APP_SRC),
    'A3. "Ödenmemiş = borç" kalıbı kaynakta kalmadı', 'filter(t => !t.paid) hâlâ var');

  // --- B. hidden ozniteligi ---------------------------------------------------
  // Genel kural olmali (.daterange-panel[hidden] gibi tek tek korumalar yetmez).
  check(/(^|\n)\s*\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(CSS),
    'B1. [hidden] her zaman gizler (.btn gibi display kuralları ezemez)', 'style.css kuralı yok');

  // --- C. Hedef isareti -------------------------------------------------------
  check(!/target-threshold-marker"[^>]*style="left:\s*\d+%/.test(INDEX) && /id="targetBarMarker"/.test(INDEX),
    'C1. İşaretin konumu HTML\'de sabit değil; JS\'in yazdığı bir id taşıyor', 'sabit left:% hâlâ index.html\'de');
  const rez = (brut) => ({ id: 'b' + brut, villa: 'V1', propertyId: 'p1', code: 'R', guest: 'X', checkIn: '2026-09-03', checkOut: '2026-09-05',
    nights: 2, gross: brut, net: brut, otaCommission: 0, cleaningFee: 0, channel: 'DIRECT', status: 'CONFIRMED', pax: 2 });
  const olc = (brut, hedef) => {
    app.setAppData(veri({ bookings: [rez(brut)], cleaningTasks: [], targets: hedef ? [{ year: 2026, month: 9, revenue_target: hedef }] : [] }));
    app.setCurrentFilter({ period: '2026-09', villa: 'ALL', startDate: '2026-09-01', endDate: '2026-09-30' });
    app.renderFinanceModule();
    return { dolgu: g('targetBarFill').style.width, isaret: g('targetBarMarker').style.left, gizli: g('targetBarMarker').hidden };
  };
  let r = olc(50000, 100000);
  check(r.dolgu === '50%' && r.isaret === '100%' && !r.gizli, 'C2. Hedefin yarısı: dolgu %50, hedef işareti sonda', JSON.stringify(r));
  r = olc(125000, 100000);
  check(r.dolgu === '100%' && r.isaret === '80%' && !r.gizli, 'C3. Hedef aşıldı (%125): dolgu tam, hedef işareti %80 — aşım görünür', JSON.stringify(r));
  r = olc(50000, null);
  check(r.gizli === true && r.dolgu === '0%', 'C4. Hedef yoksa işaret gizli (anlamsız konum gösterilmez)', JSON.stringify(r));

  // --- E. Ilk yuklemede temizlik maliyeti ---------------------------------------
  // Duzenleme formu maliyeti b.cleanCost'tan doldurur; o deger bagli gorevden
  // syncBookingCleaningTasks() ile okunur. Fonksiyon kaydetme yolunda
  // cagriliyordu ama ILK YUKLEMEDE cagrilmiyordu: sayfa acildiginda her
  // rezervasyonun maliyeti "bilinmiyor" gorunuyordu (26.09, tarayicida).
  await (async () => {
    const TID = '11111111-2222-4333-8444-555555555555';
    const PID = '99999999-8888-4777-8666-555555555555';
    const BID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const tablolar = {
      properties: [{ id: PID, tenant_id: TID, slug: 'V1', name: 'Deniz Evi', base_price: 10000, clean_cost: 0, activated_on: '2025-01-01', is_active: true }],
      bookings: [{ id: BID, tenant_id: TID, property_id: PID, booking_code: 'R-1', guest_name: 'Ali', channel: 'AIRBNB',
        check_in: '2026-09-01', check_out: '2026-09-03', gross_amount: 30000, ota_commission: 4500, cleaning_fee: 1500, discount: 0, status: 'CONFIRMED', pax: 2 }],
      cleaning_tasks: [{ id: 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee', tenant_id: TID, property_id: PID, booking_id: BID,
        task_date: '2026-09-03', amount: 1000, is_paid: false, status: 'PLANNED', cleaner_name: 'Ayşe' }]
    };
    // Her zinciri kabul eden, await edilebilen sahte sorgu (Supabase JS gibi
    // hata firlatmaz, { data, error } doner — CLAUDE.md 5.1).
    const sorgu = (tablo) => {
      const sonuc = { data: tablolar[tablo] || [], error: null, count: (tablolar[tablo] || []).length };
      const p = new Proxy(function () {}, {
        get(_, k) {
          if (k === 'then') return (res, rej) => Promise.resolve(sonuc).then(res, rej);
          if (k === 'single' || k === 'maybeSingle') return () => Promise.resolve({ data: (tablolar[tablo] || [])[0] || null, error: null });
          return () => p;
        }
      });
      return p;
    };
    const istemci = {
      from: sorgu, rpc: () => sorgu('__rpc'),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }), getSession: async () => ({ data: { session: null }, error: null }) }
    };
    let hata = null;
    try {
      app.setSupabaseClient(istemci);
      app.setActiveTenant({ id: TID, name: 'Test', role: 'owner' });
      await app.loadTenantAppData(TID);
    } catch (e) { hata = e; }
    // Istemci yerinde kalir: yuklemenin baslattigi asenkron cizimler
    // (ekip listesi vb.) test bittikten sonra da ona erisir.
    const b = ((app.getAppData() || {}).bookings || [])[0] || {};
    check(!hata && b.guest === 'Ali' && b.cleanCost === 1000,
      'E1. Sayfa ilk açıldığında rezervasyonun temizlik maliyeti bağlı görevden okunur (düzenleme formu boş gelmez)',
      hata ? hata.stack.split('\n').slice(0, 3).join(' | ') : `rezervasyon=${b.guest || "YUKLENMEDI"} cleanCost=${b.cleanCost}`);
  })();

  // --- F. Defter yazildiktan sonra ana sayfa bayat kalmaz ------------------------
  // Ana sayfa sunucu anlik goruntusunu onbellekte tutar. Temizlik "yapildi",
  // gider kaydi, tutar duzeltme ... onbellegi temizlemiyordu: sunucu dogru
  // hesapliyor, ekran sayfa yenilenene kadar eski kari gosteriyordu
  // (26.09, tarayicida: Eylul OPEX 4.800 / sunucu 5.800).
  // Kural arayuz dugmesinde degil, TABLOYA YAZAN fonksiyonda: yeni bir dugme
  // eklendiginde de gecerli kalir.
  const APP2 = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  const govde = (ad) => {
    const m = APP2.match(new RegExp(`(?:^|\\n)(?:async )?function ${ad}\\(`));
    if (!m) return null;
    const bas = m.index;
    const son = APP2.indexOf('\n}\n', bas);
    return APP2.slice(bas, son > 0 ? son : bas + 4000);
  };
  const yazicilar = ['createExpense', 'updateExpense', 'deleteExpense', 'cloudUpsertCleaningTask',
    'cloudDeleteCleaningTask', 'cloudDeleteCleaningExpense', 'saveBookingPaymentCommission'];
  const eksik = yazicilar.filter(ad => { const g = govde(ad); return !g || !g.includes('invalidateExecutiveSnapshotCache()'); });
  check(eksik.length === 0, `F1. Ana sayfa rakamını etkileyen ${yazicilar.length} yazıcı, başarılı yazmadan sonra anlık görüntü önbelleğini temizler`,
    'temizlemeyenler: ' + eksik.join(', '));

  // --- G. Her kesin rezervasyon yolu cikis temizligini planlar ---------------
  // Gorev yalniz rezervasyon formunda (saveBooking) aciliyordu. Talebi
  // rezervasyona donusturme ve WhatsApp'tan aktarma ayni kesin rezervasyonu
  // gorevsiz birakiyordu: operasyon cikis temizligini hic gormuyordu (26.09,
  // tarayicida). Ice aktarma BILEREK disarida: gecmis konaklamalar icin
  // "yapildi mi?" gorevi acmak uydurma is yuku olur.
  const cagiranlar = ['saveBooking', 'convertLeadToBooking', 'saveWaAsBooking'];
  const gorevsiz = cagiranlar.filter(ad => { const g = govde(ad); return !g || !g.includes('syncBookingCleaningTaskToCloud('); });
  check(gorevsiz.length === 0, 'G1. Form, talep dönüştürme ve WhatsApp aktarımı çıkış temizliğini planlar', 'planlamayanlar: ' + gorevsiz.join(', '));
  const ice = govde('cloudUpsertBooking') || '';
  check(!ice.includes('syncBookingCleaningTaskToCloud('), 'G2. İçe aktarma geçmiş konaklamalar için temizlik görevi açmaz', 'cloudUpsertBooking görev açıyor');

  // --- H. Rezervasyon silinince talebin bagi bellekte de bosalir ---------------
  // Veritabani leads.converted_booking_id'yi ON DELETE SET NULL ile bosaltir.
  // Istemci bellekteki talepte silinmis kimligi tutuyordu: sayfa yenilenene
  // kadar talep duzenlenemiyor, sunucu yaniltici "CROSS_TENANT_BOOKING_VIOLATION
  // ... aktif isletmeye ait degildir" donuyordu (26.09, tarayicida).
  await (async () => {
    const TID = '11111111-2222-4333-8444-555555555555';
    const BID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    app.setSupabaseClient({
      rpc: async (ad) => ({ data: ad === 'delete_booking_atomic' ? { deleted: true } : [], error: null }),
      from: () => { const p = new Proxy(function () {}, { get: (_, k) => k === 'then' ? (res) => Promise.resolve({ data: [], error: null }).then(res) : () => p }); return p; },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}
    });
    app.setActiveTenant({ id: TID, name: 'Test', role: 'owner' });
    app.setAppData(veri({
      tenantId: TID, cleaningTasks: [],
      bookings: [{ id: BID, villa: 'V1', propertyId: 'p1', code: 'R-9', guest: 'X', checkIn: '2026-11-05', checkOut: '2026-11-08',
        nights: 3, gross: 25000, net: 25000, otaCommission: 0, cleaningFee: 0, channel: 'WHATSAPP', status: 'CONFIRMED', pax: 2 }],
      leads: [{ id: 'lead-1', dbId: 'lead-1', guest: 'X', status: 'WON', convertedBookingId: BID, converted_booking_id: BID }]
    }));
    let hata = null, sonuc = null;
    const eskiOnay = global.confirm; global.confirm = () => true;
    try { sonuc = await app.deleteBooking(BID); } catch (e) { hata = e; } finally { global.confirm = eskiOnay; }
    const l = (app.getAppData().leads || [])[0] || {};
    check(!hata && sonuc === true && l.convertedBookingId === null && l.converted_booking_id === null,
      'H1. Rezervasyon silinince bellekteki talebin rezervasyon bağı da boşalır (veritabanıyla aynı)',
      hata ? hata.message : `sonuc=${sonuc} convertedBookingId=${l.convertedBookingId} converted_booking_id=${l.converted_booking_id}`);
  })();

  // --- D. Kanal tablosu hizasi ------------------------------------------------
  check(/class="mkt-channel-table"/.test(MKT) && /\.mkt-channel-table th,\s*\.mkt-channel-table td\s*\{[^}]*text-align/.test(CSS),
    'D1. Kanal ekonomisi tablosunda başlık ve değer aynı hizada', 'mkt-channel-table kuralı yok');
} finally {
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
}
})();
