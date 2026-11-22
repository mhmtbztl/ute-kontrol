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
const MarketingUI = require('./marketing_ui.js');
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
  try { app.renderOperationsTab(); } catch (e) { hata = e; }
  const borcPaneli = g('opsCombinedContainer').innerHTML;
  check(!hata && /Bekleyen Temizlik Borçları \(1\)/.test(borcPaneli) && /₺1\.000/.test(borcPaneli),
    'A1. Operasyon borç paneli yalnız YAPILMIŞ ve ödenmemiş temizliği sayar (planlı/yapılmadı borç değil)',
    hata ? hata.message : borcPaneli.slice(0, 300));
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
  // F (anlik goruntu onbellegi) kalkti: Bugun artik sunucu anlik goruntusu tutmuyor (sadelik 21.11.2026).
  check(!/invalidateExecutiveSnapshotCache/.test(APP2), 'F1. Önbelleği olmayan ana sayfa için temizleme çağrısı kalmadı', 'çağrı duruyor');

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
    check(!hata && sonuc === true && l.convertedBookingId === null && l.converted_booking_id === null && l.status === 'QUOTE_SENT',
      'H1. Rezervasyon silinince bellekteki talep de veritabanıyla aynı: bağ boş, durum QUOTE_SENT (phase51)',
      hata ? hata.message : `sonuc=${sonuc} status=${l.status} convertedBookingId=${l.convertedBookingId} converted_booking_id=${l.converted_booking_id}`);
  })();

  // --- I. Acik ariza sayisi -----------------------------------------------------
  // Arizayi "Cozuldu" yapmak karttaki "Acik Arizalar (P1)" sayisini dusurmuyordu:
  // DB'deki RESOLVED bellekte COMPLETED'e cevriliyor, kart ise yalniz
  // DONE/CLOSED/TAMAMLANDI'yi kapali sayiyordu. Iptal (CANCELLED) de acikti.
  app.setAppData(veri({ cleaningTasks: [], maintenance: [
    { id: 'm1', villa: 'V1', priority: 'P1', status: 'OPEN', statusRaw: 'OPEN' },
    { id: 'm2', villa: 'V1', priority: 'P1', status: 'COMPLETED', statusRaw: 'RESOLVED' },
    { id: 'm3', villa: 'V1', priority: 'P1', status: 'CANCELLED', statusRaw: 'CANCELLED' },
    { id: 'm4', villa: 'V1', priority: 'P2', status: 'OPEN', statusRaw: 'OPEN' },
    { id: 'm5', villa: 'V1', priority: 'P1', status: 'IN_PROGRESS', statusRaw: 'IN_PROGRESS' }
  ] }));
  const acikP1 = app.getAppData().maintenance.filter(t => t.priority === 'P1' && app.isMaintenanceTicketOpen(t)).length;
  check(acikP1 === 2,
    'I1. Çözülen ve iptal edilen P1 arıza "açık" sayılmaz (açık + işlemde = 2)', `sayi=${acikP1}`);
  const bakim = govde('saveMaint') || '';
  check(/resolved_at:/.test(bakim), 'I2. Arıza çözülünce çözülme zamanı (resolved_at) yazılır', 'saveMaint resolved_at yazmıyor');

  // --- J. Ariza maliyeti etiketi ------------------------------------------------
  // Formda "Maliyet (₺)" yaziyordu; deger estimated_cost olarak saklaniyor ve
  // hicbir zaman gider defterine yazilmiyordu (L-97). Kullanici tamir bedelini
  // girip Finans'ta hic goremiyordu. Karar: otomatik gider ACILMAZ (ayni para
  // gider olarak da girilirse iki kez sayilirdi); alan durustce etiketlenir.
  const INDEX2 = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
  const formEtiket = (INDEX2.match(/<label[^>]*>([^<]*)<\/label>\s*<input[^>]*id="maintCost"/) || [])[1] || '';
  check(/Tahmini/i.test(formEtiket) && /gider defterine yazılmaz/i.test(INDEX2),
    'J1. Arıza maliyeti "Tahmini" diye etiketli ve gider olmadığı formda söyleniyor', `etiket="${formEtiket}"`);
  // J2: eski gizli ariza tablosu (tab-maintenance) sadelikte kalkti (21.11.2026).
  check(!/<th>(MALİYET|Maliyet) \(₺\)<\/th>/.test(INDEX2),
    'J2. Arıza maliyeti hiçbir tabloda "Maliyet" diye (tahmini olduğunu söylemeden) yazılmaz', 'tablo başlığı hâlâ MALİYET');

  // --- D. Kanal tablosu (Kanallar gorunumu) sadelikte kalkti (21.11.2026) -----

  // =========================================================================
  // 27.09 guven turu — 26.09'da kullanicinin gercek hesabinda tarayicida
  // gorulen celiskiler (HATALAR.md L-98..L-106).
  // =========================================================================
  const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const gunKaydir = (n) => { const d = new Date(bugun + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const buAy = bugun.slice(0, 7);
  const PROP_UUID = '7c1e2d3f-4a5b-4c6d-8e7f-901234567890';
  const ayFiltresi = () => {
    const [y, m] = buAy.split('-').map(Number);
    const son = new Date(Date.UTC(y, m, 0)).getUTCDate();
    app.setCurrentFilter({ period: buAy, villa: 'ALL', startDate: `${buAy}-01`, endDate: `${buAy}-${String(son).padStart(2, '0')}` });
  };
  global.ExecutivePriorityService = require('./executive_priority_service.js');
  const komutaHtml = () => g('todayTaskTable').innerHTML;

  // --- K. Ana sayfa oncelik motoru (L-98) ------------------------------------
  // Canlida: iptal edilmis "DEMO Claude arıza" ana sayfada "Durum: Açık" +
  // "Uygula"; Operasyon "0 turnover" derken ana sayfa turnover gorevi.
  app.setAppData(veri({
    villas: { V1: { id: PROP_UUID, slug: 'V1', name: 'Deniz Evi', basePrice: 10000, cleanCost: 0, activationDate: '2025-01-01' } },
    maintenanceTickets: [
      { id: 'mt-iptal', property_id: PROP_UUID, title: 'Iptal edilen ariza', severity: 'CRITICAL', status: 'CANCELLED' },
      { id: 'mt-cozuldu', property_id: PROP_UUID, title: 'Cozulen ariza', severity: 'CRITICAL', status: 'RESOLVED' },
      { id: 'mt-dusuk', property_id: PROP_UUID, title: 'Musluk damlatiyor', severity: 'LOW', status: 'OPEN' }
    ],
    cleaningTasks: [
      { id: 'ct-dun', villa: 'V1', date: gunKaydir(-1), amount: 500, paid: false, status: 'PLANNED' },
      { id: 'ct-yarin', villa: 'V1', date: gunKaydir(1), amount: 500, paid: false, status: 'PLANNED' },
      { id: 'ct-yapilmadi', villa: 'V1', date: bugun, amount: 500, paid: false, status: 'SKIPPED' }
    ]
  }));
  ayFiltresi();
  // K1 yalniz kapali arizalarla ayri olculur: ayni mulkteki kartlar
  // birlestirildigi icin acik bir arizanin yaninda kapali olan gizlenebilir.
  const acikOlanlar = app.getAppData().maintenanceTickets;
  app.getAppData().maintenanceTickets = acikOlanlar.filter(t => t.status !== 'OPEN');
  app.getAppData().cleaningTasks = [];
  hata = null;
  try { app.renderExecutiveControlCenter(); } catch (e) { hata = e; }
  let html = komutaHtml();
  check(!hata && !/Iptal edilen ariza|Cozulen ariza/.test(html) && !/Açık arıza/.test(html),
    'K1. İptal edilen ve çözülen arıza ana sayfada kritik eylem olarak görünmez',
    hata ? hata.stack.split('\n').slice(0, 3).join(' | ') : html.slice(0, 300));
  app.setAppData(veri({
    villas: { V1: { id: PROP_UUID, slug: 'V1', name: 'Deniz Evi', basePrice: 10000, cleanCost: 0, activationDate: '2025-01-01' } },
    maintenanceTickets: acikOlanlar,
    cleaningTasks: [
      { id: 'ct-dun', villa: 'V1', date: gunKaydir(-1), amount: 500, paid: false, status: 'PLANNED' },
      { id: 'ct-yarin', villa: 'V1', date: gunKaydir(1), amount: 500, paid: false, status: 'PLANNED' },
      { id: 'ct-yapilmadi', villa: 'V1', date: bugun, amount: 500, paid: false, status: 'SKIPPED' }
    ]
  }));
  app.renderExecutiveControlCenter();
  html = komutaHtml();
  // Dusuk onemli acik ariza "Yap"tir; sabit "Acil"/P1 yazilmaz.
  const muslukSatiri = html.slice(html.lastIndexOf('<tr', html.indexOf('Musluk damlatiyor')), html.indexOf('</tr>', html.indexOf('Musluk damlatiyor')));
  check(/Musluk damlatiyor/.test(html) && /lex-tag--up">Yap</.test(muslukSatiri) && !/Acil|P1/.test(muslukSatiri),
    'K2. Açık arıza satırı GERÇEK önceliği yansıtır (düşük önem → Yap; sabit "Acil/P1" yok)', muslukSatiri.slice(0, 400));
  check(!/Turnover Temizlik Görevi|Bugünkü temizlik/.test(html),
    'K3. Dünkü/yarınki planlı ve "yapılmadı" temizlik ana sayfada "bugün" diye sunulmaz', html.slice(0, 300));
  check(!html.includes(PROP_UUID) && /Deniz Evi/.test(html),
    'K4. Kartta mülkün ham kimliği (UUID) değil adı yazar (L-104)', 'UUID kartta görünüyor');
  const appData0 = app.getAppData();
  appData0.cleaningTasks.push({ id: 'ct-bugun', villa: 'V1', date: bugun, amount: 500, paid: false, status: 'PLANNED' });
  app.renderExecutiveControlCenter();
  html = komutaHtml();
  check((html.match(/Bugünkü temizlik/g) || []).length === 1,
    'K6. Bugün planlı temizlik ana sayfada tek kart olarak görünür', html.slice(0, 300));

  // --- L. CRM kayip nedeni tavsiyesi (L-99): Satis'taki radar sadelikte kalkti
  // (21.11.2026); kayip nedenleri Analiz'de (analytics_ui, ayni veri).
  check(typeof app.renderLeadAnalytics === 'undefined', 'L1. Satış radarı (Analiz kopyası) yok', 'duruyor');

  // --- M. Gidisat radari, projeksiyon ve simulator KALDIRILDI (A1-G1) ------------
  // L-100: radar Finans'ta hic cizilmiyordu, sabit hukum yaziyordu. Kullanici
  // karari (ENVANTER Finans 28.09.2026): radar ana ekrandan cikar, projeksiyon
  // ve simulator kalkar. Ag artik geri gelmediklerini olcer.
  const finPlan = app.getActiveRenderPlan('tab-finance');
  check(JSON.stringify(finPlan) === JSON.stringify(['renderFinanceModule']),
    'M1. Finans sekmesi yalnız kendi modülünü çizer; radar/simülatör planında yok', 'plan=' + finPlan.join(','));
  check(!/function (renderTrajectoryRadar|renderTrajectoryInsights|runWhatIfSimulation)\(/.test(APP2)
    && !/id="(trajectoryStatusBadge|simAdrSlider|trajDangerText)"/.test(INDEX2),
    'M2. Gidişat radarı, içgörüler ve simülatör kaynakta ve sayfada yok', 'kalıntı var');
  check(!/id="tab-dashboard"/.test(INDEX2) && !/'tab-dashboard'/.test(APP2),
    'M3. Hiçbir yoldan açılmayan ölü "Kokpit" sekmesi silindi', 'tab-dashboard kalıntısı');

  // --- N. Gider kaydi olmayan ayda kar "olculemedi" (L-101) --------------------
  check(app.isProfitUnmeasured(12000, 0, 0, '2099-01') === true
    && app.isProfitUnmeasured(12000, 500, 0, '2099-01') === false
    && app.isProfitUnmeasured(0, 0, 0, '2099-01') === false,
    'N1. Ciro var + hiç gider yok → kâr ölçülemedi; gider varsa ya da ciro yoksa değil', 'kural yanlış');
  const rezB = (id, gross, extra) => Object.assign({ id, villa: 'V1', propertyId: 'p1', code: id, guest: 'Ali Veli',
    checkIn: `${buAy}-03`, checkOut: `${buAy}-05`, nights: 2, gross, net: gross, otaCommission: 0, cleaningFee: 0,
    channel: 'WHATSAPP', status: 'CONFIRMED', pax: 2 }, extra || {});
  app.setAppData(veri({ bookings: [rezB('r1', 12000)], cleaningTasks: [] }));
  ayFiltresi();
  app.renderFinanceModule();
  check(g('finNetProfit').innerText === '—' && /ölçülemedi/.test(g('finNetMarginLabel').innerText)
    && !/%100/.test(g('finNetMarginLabel').innerText),
    'N2. Gider kaydı olmayan açık ayda Finans "%100 marj" göstermez; "ölçülemedi" der',
    `net=${g('finNetProfit').innerText} marj=${g('finNetMarginLabel').innerText}`);
  const [ky, km] = buAy.split('-').map(Number);
  app.setAppData(veri({ bookings: [rezB('r1', 12000)], cleaningTasks: [], closedPeriods: [{ year: ky, month: km, status: 'CLOSED' }] }));
  ayFiltresi();
  app.renderFinanceModule();
  check(g('finNetProfit').innerText === '12.000 TL',
    'N4. Kapatılmış ay defteri onaylı sayar: 0 gider gerçek 0\'dır, kâr gösterilir', `net=${g('finNetProfit').innerText}`);
  app.setAppData(veri({ bookings: [rezB('r1', 12000)], cleaningTasks: [],
    expenses: [{ id: 'e1', villa: 'V1', date: `${buAy}-04`, amount: 2000, category: 'Bakım', type: 'OPEX' }] }));
  ayFiltresi();
  app.renderFinanceModule();
  check(g('finNetProfit').innerText === '10.000 TL' && /%83[.,]3/.test(g('finNetMarginLabel').innerText),
    'N5. Gider varsa kâr ve marj normal hesaplanır', `net=${g('finNetProfit').innerText} marj=${g('finNetMarginLabel').innerText}`);

  // --- O. Satisi olmayan mulk "Dengeli" degil (L-102) -------------------------
  app.setAppData(veri({
    villas: {
      V1: { id: 'p1', slug: 'V1', name: 'Deniz Evi', basePrice: 10000, cleanCost: 0, activationDate: '2025-01-01' },
      V2: { id: 'p2', slug: 'V2', name: 'Orman Evi', basePrice: 10000, cleanCost: 0, activationDate: '2025-01-01' }
    },
    bookings: [rezB('r1', 12000)], cleaningTasks: []
  }));
  ayFiltresi();
  g('propExecTableBody').children = [];
  app.renderFinanceModule();
  const satirlar = g('propExecTableBody').children.map(tr => tr.innerHTML);
  const orman = satirlar.find(h => /Orman Evi/.test(h)) || '';
  check(orman && !/Dengeli|Şampiyon|Boşluk Riski/.test(orman),
    'O1. Mülk tablosu hüküm etiketi yazmaz (Dengeli/Şampiyon); yalnız ölçülen rakam', orman.slice(0, 200) || 'satır yok');

  // --- P. Toplu aktarim ozeti kayit basi metriklere girmez (L-103) ------------
  const ozet = rezB('toplu', 90000, { guest: 'TOPLU AKTARIM — Ocak 2026', checkIn: `${buAy}-01`, checkOut: `${buAy}-10`, nights: 9, channel: 'DIRECT' });
  check(app.isBulkSummaryBooking(ozet) && !app.isBulkSummaryBooking(rezB('r1', 1)),
    'P1. Toplu aktarım özeti tek tanımdan tanınır (CRM ile aynı)', 'tanım tutmuyor');
  app.setAppData(veri({ bookings: [rezB('r1', 12000), ozet], cleaningTasks: [],
    expenses: [{ id: 'e1', villa: 'V1', date: `${buAy}-04`, amount: 2000, category: 'Bakım', type: 'OPEX' }] }));
  ayFiltresi();
  ['rezSearchInput', 'rezVillaFilter', 'rezStatusFilter'].forEach(id => { g(id).value = id === 'rezSearchInput' ? '' : 'ALL'; });
  app.renderManageBookingsTable();
  check(/Rezervasyon<\/dt><dd class="lex-kpi__value"><strong>1<\/strong><\/dd><dd class="lex-kpi__sub">\+ 1 toplu aktarım özeti/.test(g('rezTableSummaryPill').innerHTML),
    'P2. Rezervasyon listesi özeti rezervasyon saymaz, ayrı yazar', g('rezTableSummaryPill').innerHTML);
  app.renderTapeChart();
  const takvim = g('tapeChartContainer').innerHTML;
  // L-198: not, ozetin gecesini ve tutarini rozetle soyler; hucrelere yine cizilmez.
  check(!/>TOPLU/.test(takvim) && takvim.includes('Toplu aktarım (günlere dağılmamış)') && /gece · ₺/.test(takvim),
    'P4. Takvim özeti günlere yaymaz; altında gece ve tutarıyla not olarak söyler', takvim.slice(-300));
  const raporModel = MarketingUI.buildWorkspaceModel({
    filter: { period: buAy, villa: 'ALL' }, bookings: app.getAppData().bookings,
    villas: app.getAppData().villas, financeSummary: app.computeFilterLedger()
  });
  check(raporModel.economics.totals.reservationCount === 1,
    'P5. Kanal ekonomisi modeli toplu aktarım özetini rezervasyon saymaz (L-105)', JSON.stringify(raporModel.economics.totals));

  // --- Q. Etiketler (L-104, L-105) -----------------------------------------
  check(app.formatDeductionTl(0) === '0 TL' && app.formatDeductionTl(-0) === '0 TL' && app.formatDeductionTl(1500) === '−1.500 TL',
    'Q1. Düşülen tutar biçimi: 0 → "0 TL", 1500 → "−1.500 TL"', app.formatDeductionTl(0));
  check(app.getChannelDisplayName('WHATSAPP') === 'WhatsApp' && app.getChannelDisplayName('Direct') === 'Doğrudan'
    && app.getChannelDisplayName('') === 'Kanal belirtilmedi',
    'Q2. Kanal kodu müşteriye görünen adla yazılır', app.getChannelDisplayName('Direct'));
  check(!/KONTROL MERKEZİ V5/.test(INDEX2), 'Q3. Başlıkta müşteriye sürüm numarası ("V5") gösterilmez', 'V5 hâlâ başlıkta');

  // --- R. Veri esitleme dugmesi sadelikte kalkti (21.11.2026) ---------------
  check(!/id="dataSyncBtn"/.test(INDEX2), 'R1. Üst çubukta ayrı "Verileri eşitle" düğmesi yok', 'duruyor');

  // --- S. Ciro = net konaklama geliri (ENVANTER Finans 1, A1-G3) --------------
  // Temizlik ucreti ciroya girmez; ayri gelir kalemi olarak karin icinde kalir.
  // Hedef, MoM ve mulk payi ciroyu; kar, marj ve gider orani toplam geliri kullanir.
  app.setAppData(veri({ bookings: [rezB('r1', 11500, { cleaningFee: 1500 })], cleaningTasks: [],
    targets: { [buAy]: { revenue_target: 10000 } },
    expenses: [{ id: 'e1', villa: 'V1', date: `${buAy}-04`, amount: 1000, category: 'Bakım', type: 'OPEX' }] }));
  ayFiltresi();
  app.renderFinanceModule();
  check(g('finActualRevenue').innerText === '10.000 TL',
    'S1. Ciro kartı temizlik ücreti hariç net konaklama geliri', `kart=${g('finActualRevenue').innerText}`);
  const defterS = app.computeFilterLedger();
  check(Math.round(defterS.cleaningRevenue) === 1500 && Math.round(defterS.totalRevenue) === 11500,
    'S2. Temizlik geliri ayrı kalem: ciro + temizlik geliri = toplam gelir', JSON.stringify({ t: defterS.cleaningRevenue, g: defterS.totalRevenue }));
  check(g('finNetProfit').innerText === '10.500 TL' && /%91[.,]3/.test(g('finNetMarginLabel').innerText),
    'S3. Kâr ve marj toplam gelirden: 11.500 − 1.000 = 10.500, marj %91,3 (temizlik geliri kârda kalır)',
    `net=${g('finNetProfit').innerText} marj=${g('finNetMarginLabel').innerText}`);
  check(/%0 üzerinde/.test(g('finRevTargetDelta').innerText),
    'S4. Hedef ciroyla karşılaştırılır (10.000 / 10.000), toplam gelirle değil (%115)', g('finRevTargetDelta').innerText);
  app.setAppData(veri({ bookings: [rezB('r1', 12000)], cleaningTasks: [] }));
  ayFiltresi();
  app.renderFinanceModule();
  check(g('finActualRevenue').innerText === '12.000 TL',
    'S5. Temizlik ücreti alınmıyorsa ciro brüt tutara eşit', g('finActualRevenue').innerText);
  check(/<span class="kpi-label">Ciro \(net konaklama geliri\)<\/span>[\s\S]{0,200}id="finActualRevenue"/.test(INDEX2)
    && !/(TOPLAM GELİR|Toplam gelir) \((NET ODA|net oda) \+ (TEMİZLİK|temizlik)\)/.test(INDEX2),
    'S6. Finans kartının etiketi "Ciro (net konaklama geliri)"', 'etiket eski ya da farklı');
} finally {
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
}
})();
