// Gorev 9 (MVP kabul turu) kullanici bulgulari agi — 14.10.2026'dan itibaren.
//
// L-175 (M6): Hizli Ekle -> "Yeni Lead" duzenleme modalini aciyordu; modal yeni
//   kaydi bilerek reddettigi icin kullanici her seferinde "Hata" goruyordu.
//   Yeni talep tek yerden, telefon + kaynak zorunlu hizli kayit formundan acilir.
// L-176 (M7): Saha personeli ve usta hicbir ekrandan tanimlanamiyordu;
//   operational_people tablosuna yazan arayuz yoktu, atama listeleri hep bostu.
// L-177 (M8): Operasyon "Temizlik borcu" karti kayittan sonra eski kaliyordu.
// L-178 (M9): Ana sayfa kritik eylem karti isi adlandirmiyor, Incele arizaya gitmiyordu.
// L-179 (M10): Acik arizali mulk "Satisa hazir" secilebiliyordu; cozulmus ariza mulku kapali tutuyordu.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
let failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

function functionBody(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return '';
}

const TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STAFF_USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function sahteDom(degerler) {
  const elemanlar = new Map();
  const eleman = id => ({
    id, value: Object.prototype.hasOwnProperty.call(degerler, id) ? degerler[id] : '',
    innerHTML: '', innerText: '', textContent: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, addEventListener() {}, appendChild(c) { return c; }, removeChild(c) { return c; }, remove() {},
    options: [], children: [], closest: () => null,
    querySelector: () => null, querySelectorAll: () => [], focus() {}, scrollIntoView() {}
  });
  global.document = {
    getElementById(id) { if (!elemanlar.has(id)) elemanlar.set(id, eleman(id)); return elemanlar.get(id); },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
    createElement: () => eleman(''), createElementNS: () => eleman(''), createDocumentFragment: () => eleman(''),
    createTextNode: x => ({ textContent: x }), body: eleman('body'), documentElement: eleman('html')
  };
  global.alert = msg => { global.__sonUyari = msg; };
  global.confirm = () => true;
  global.requestAnimationFrame = fn => { fn(); return 1; };
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  global.localStorage = global.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  global.window = global.window || {};
  global.window.showToast = () => {};
}

function kaydedenIstemci() {
  const yazmalar = [];
  const client = {
    yazmalar,
    rpc: async () => ({ data: [], error: null }),
    from(tablo) {
      const k = { tablo, islem: 'select', yuk: null, filtre: [] };
      const q = {
        insert(y) { k.islem = 'insert'; k.yuk = y; yazmalar.push(k); return q; },
        update(y) { k.islem = 'update'; k.yuk = y; yazmalar.push(k); return q; },
        upsert(y) { k.islem = 'upsert'; k.yuk = y; yazmalar.push(k); return q; },
        delete() { k.islem = 'delete'; yazmalar.push(k); return q; },
        select() { return q; }, eq(c, v) { k.filtre.push([c, v]); return q; }, in() { return q; },
        is() { return q; }, gte() { return q; }, lte() { return q; }, lt() { return q; }, gt() { return q; },
        or() { return q; }, not() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; },
        async single() { return { data: null, error: null }; },
        async maybeSingle() { return { data: null, error: null }; },
        then(res, rej) { return Promise.resolve({ data: k.islem === 'select' ? [] : null, error: null }).then(res, rej); }
      };
      return q;
    }
  };
  return client;
}

async function saahaEkibiDavranisi() {
  sahteDom({});
  const App = require('../app.js');
  const kur = (veri, rol = 'owner') => {
    App.setActiveTenant({ id: TENANT, role: rol });
    const ist = kaydedenIstemci();
    App.setSupabaseClient(ist);
    App.setAppData({ villas: {}, bookings: [], expenses: [], cleaningTasks: [], operationalPeople: [], salesMembers: [], ...veri });
    return ist;
  };
  const uyeler = [{ user_id: STAFF_USER, role: 'staff', full_name: 'TEST Ayşe', email: 'ayse@example.com' }];

  // Bos hesapta: yonetici ekleme formunu ve bagnalabilir Personel hesabini gorur.
  kur({ salesMembers: uyeler });
  let html = App.renderOperationsPeopleView();
  check(/id="opsPersonName"/.test(html) && /data-onclick="saveOperationalPerson\(\)"/.test(html), 'L-176b Yonetici saha ekibine kisi ekleme formunu gorur');
  check(html.includes(`value="${STAFF_USER}"`), 'L-176c Personel rolundeki hesap baglanabilir hesaplar arasinda');
  check(/Henüz temizlikçi veya usta eklenmedi/.test(html), 'L-176d Bos liste ne yapilacagini soyler');

  // Izleyici ekleyemez (RLS can_manage_tenant ile ayni sinir).
  kur({ salesMembers: uyeler }, 'viewer');
  check(!/opsPersonName/.test(App.renderOperationsPeopleView()), 'L-176e Izleyici ekleme formunu gormez');

  // Kayit: operational_people'a tenant ve hesap baglantisiyla yazar.
  let ist = kur({ salesMembers: uyeler });
  sahteDom({ opsPersonKind: 'CLEANER', opsPersonName: '  TEST Ayşe ', opsPersonPhone: '05320000000', opsPersonAccount: STAFF_USER });
  await App.saveOperationalPerson();
  const ekle = ist.yazmalar.find(k => k.tablo === 'operational_people' && k.islem === 'insert');
  check(!!ekle, 'L-176f Kaydet operational_people tablosuna yazar', global.__sonUyari);
  check(ekle && ekle.yuk.tenant_id === TENANT && ekle.yuk.user_id === STAFF_USER && ekle.yuk.full_name === 'TEST Ayşe' && ekle.yuk.kind === 'CLEANER',
    'L-176g Kayit kiraci, tur, kirpilmis ad ve hesap baglantisini tasir', JSON.stringify(ekle && ekle.yuk));

  // Ad bos: hicbir sey yazilmaz.
  ist = kur({});
  sahteDom({ opsPersonKind: 'TECHNICIAN', opsPersonName: '   ' });
  await App.saveOperationalPerson();
  check(!ist.yazmalar.some(k => k.tablo === 'operational_people'), 'L-176h Adsiz kisi yazilmaz');

  // Pasiflestirme silmez, is_active=false yazar.
  const KISI = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  ist = kur({ operationalPeople: [{ id: KISI, kind: 'TECHNICIAN', full_name: 'TEST Ünal Usta', is_active: true }] });
  sahteDom({});
  await App.toggleOperationalPersonActive(KISI);
  const pasif = ist.yazmalar.find(k => k.tablo === 'operational_people');
  check(pasif && pasif.islem === 'update' && pasif.yuk.is_active === false, 'L-176i Pasiflestirme silmez, is_active=false yazar', JSON.stringify(pasif));

  // Temizlik listesi: atanabilir temizlikci yoksa Saha ekibine yonlendirir.
  kur({});
  html = App.renderOperationsCleaningView([]);
  check(/setOperationsView\('people'\)/.test(html), 'L-176j Temizlikci yokken temizlik ekrani Saha ekibine yonlendirir');
  kur({ operationalPeople: [{ id: KISI, kind: 'CLEANER', full_name: 'TEST Ayşe', user_id: STAFF_USER, is_active: true }] });
  html = App.renderOperationsCleaningView([]);
  check(!/setOperationsView\('people'\)/.test(html), 'L-176k Atanabilir temizlikci varken yonlendirme gorunmez');

  // Temizlik formu: etkin temizlikciler oneri listesine girer.
  sahteDom({});
  kur({ operationalPeople: [
    { id: '1', kind: 'CLEANER', full_name: 'TEST Ayşe', is_active: true },
    { id: '2', kind: 'CLEANER', full_name: 'TEST Eski', is_active: false },
    { id: '3', kind: 'TECHNICIAN', full_name: 'TEST Usta', is_active: true }] });
  App.fillCleanerNameOptions();
  const liste = global.document.getElementById('hkCleanerOptions').innerHTML;
  check(/TEST Ayşe/.test(liste) && !/TEST Eski/.test(liste) && !/TEST Usta/.test(liste), 'L-176l Temizlik formu yalniz etkin temizlikcileri onerir', liste);
}

async function operasyonKartiDavranisi() {
  sahteDom({});
  const App = require('../app.js');
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.setSupabaseClient(kaydedenIstemci());
  App.setAppData({
    villas: { A: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', slug: 'A', name: 'Villa A' } },
    bookings: [], expenses: [], operationalPeople: [], salesMembers: [], maintenance: [], maintenanceTickets: [],
    cleaningTasks: [{ id: 't1', villa: 'A', date: '2031-05-01', status: 'DONE', paid: false, amount: 2500, cleaner: 'TEST Ayşe' }]
  });
  // Kayit/silme yollari yalniz listeyi (renderOperationsTab) ciziyor; kart da
  // ayni cagride guncellenmeli (L-177).
  global.document.getElementById('opsCombinedContainer');
  App.renderOperationsTab();
  const kart = global.document.getElementById('opsDebtVal').innerText;
  check(/2\.500/.test(kart), 'L-177 Operasyon listesi cizilince Temizlik borcu karti da guncellenir', kart);
}

async function kritikEylemKartiDavranisi() {
  const { collapseDuplicateActions } = require('./executive_priority_service.js');
  const birlesik = collapseDuplicateActions([
    { id: 'tk-1', domain: 'OPERATIONS', propertyId: 'p1', propertyName: 'DOĞUŞ', title: 'P1 Arıza: beton dökümü', priorityScore: 90,
      sourceMetrics: ['Öncelik: P1', 'Durum: Devam Ediyor'], deepLink: 'maintenance' },
    { id: 'tk-2', domain: 'OPERATIONS', propertyId: 'p1', propertyName: 'DOĞUŞ', title: 'Arıza: <b>musluk</b>', priorityScore: 60,
      sourceMetrics: ['Öncelik: P2', 'Durum: Açık'], deepLink: 'maintenance' }
  ])[0];
  check(birlesik.title === 'DOĞUŞ: 2 açık iş' && !/Zirve/.test(birlesik.title), 'L-178a Birlesik kart basligi isi adlandirir', birlesik.title);
  check(birlesik.focusId === 'tk-1', 'L-178b Birlesik kart en oncelikli kayda gider', birlesik.focusId);

  sahteDom({});
  const App = require('../app.js');
  App.renderTodayCommandCenter({ critical: [birlesik], operations: [], revenue: [] });
  const kart = global.document.getElementById('todayCriticalActionsList').innerHTML;
  check(/<li>P1 Arıza: beton dökümü<\/li>/.test(kart) && /<li>Arıza: &lt;b&gt;musluk&lt;\/b&gt;<\/li>/.test(kart),
    'L-178c Birlesik kart isleri tek tek (kacislanmis) listeler', kart);
  check(!/Durum: Devam Ediyor • Durum: Açık/.test(kart), 'L-178d Celiskili "Durum • Durum" satiri yok');
  check(/openTabFromDeepLink\(decodeURIComponent\('maintenance'\), decodeURIComponent\('tk-1'\)\)/.test(kart), 'L-178e Incele arizanin kendisine gider');
  check(global.document.getElementById('criticalActionsCountBadge').innerText === '1', 'L-178f Rozet yalniz is sayisini yazar',
    global.document.getElementById('criticalActionsCountBadge').innerText);

  // Incele: menude olmayan eski sayfa yerine Operasyon -> Ariza gorunumu.
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.setAppData({ villas: {}, bookings: [], cleaningTasks: [], operationalPeople: [], maintenance: [], maintenanceTickets: [] });
  App.openTabFromDeepLink('maintenance', 'tk-1');
  const ekran = global.document.getElementById('opsCombinedContainer').innerHTML;
  check(/Açık arıza veya bakım kaydı yok/.test(ekran), 'L-178g Incele Operasyon\'un Ariza gorunumunu acar', ekran.slice(0, 120));
}

async function satisaHazirlikDavranisi() {
  const Readiness = require('./property_sales_readiness.js');
  const mulk = { id: 'p1', key: 'DOGUS', name: 'DOĞUŞ' };
  // DB'deki RESOLVED bellekte COMPLETED'dir; cozulmus ariza mulku kapatmamali.
  const cozulmus = Readiness.buildPropertyReadiness(mulk, { overrideStatus: 'SALES_READY',
    maintenanceTickets: [{ id: 'tk-9', propertyId: 'p1', status: 'COMPLETED', severity: 'CRITICAL' }] });
  check(cozulmus.status === 'SALES_READY', 'L-179a Cozulmus (COMPLETED) ariza mulku satisa kapatmaz', cozulmus.status);
  const acik = Readiness.buildPropertyReadiness(mulk, { overrideStatus: 'SALES_READY',
    maintenanceTickets: [{ id: 'tk-1', propertyId: 'p1', status: 'IN_PROGRESS', severity: 'CRITICAL' }] });
  check(acik.status === 'BLOCKED_MAINTENANCE' && acik.blockingTicketIds[0] === 'tk-1', 'L-179b Acik kritik ariza satisi kapatir ve kaydini tasir');

  sahteDom({});
  const App = require('../app.js');
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.setAppData({ villas: { DOGUS: { id: 'p1', slug: 'DOGUS', name: 'DOĞUŞ' } }, bookings: [], cleaningTasks: [],
    operationalPeople: [], maintenance: [], maintenanceTickets: [{ id: 'tk-1', propertyId: 'p1', status: 'IN_PROGRESS', severity: 'CRITICAL' }],
    housekeepingOverrides: {} });
  App.renderPortfolioHealth([acik]);
  const kart = global.document.getElementById('portfolioHealthCardsGrid').innerHTML;
  check(/<option value="SALES_READY"[^>]*disabled/.test(kart) && /<option value="NON_BLOCKING_ISSUE"[^>]*disabled/.test(kart),
    'L-179c Acik arizada satilabilir durumlar secilemez');
  check(!/<option value="NEEDS_CLEANING"[^>]*disabled/.test(kart), 'L-179d Temizlik bekliyor secilebilir kalir');
  check(/openTabFromDeepLink\('maintenance', decodeURIComponent\('tk-1'\)\)/.test(kart), 'L-179e Kart arizaya goturen dugme gosterir');

  const ist = kaydedenIstemci();
  App.setSupabaseClient(ist);
  const sonuc = await App.setPropertySalesReadiness('DOGUS', 'SALES_READY');
  check(sonuc === false && !ist.yazmalar.length, 'L-179f Acik arizada satisa acma yazilmaz (arayuz disindan cagri da)', JSON.stringify(ist.yazmalar));
}

async function main() {
try {
  const html = read('index.html');
  const app = read('app.js');

  // L-175 — yeni talep yolu
  const argsizModal = html.match(/data-on\w+="[^"]*openLeadModal\(\s*\)[^"]*"/g) || [];
  check(argsizModal.length === 0, 'L-175a Hicbir dugme duzenleme modalini yeni kayit icin acmaz', argsizModal.join(' | '));
  check(/data-onclick="openQuickLeadCapture\(\);/.test(html), 'L-175b Hizli Ekle yeni talebi hizli kayit formuna goturur');
  const modal = functionBody(app, 'function openLeadModal(');
  check(/^\{\s*if \(!editId\) \{ openQuickLeadCapture\(\); return; \}/.test(modal),
    'L-175c openLeadModal kimliksiz cagrida modali acmadan hizli forma yonlendirir');
  const quick = functionBody(app, 'function openQuickLeadCapture(');
  check(/switchTab\('leads'\)/.test(quick) && /leadQuickPhone/.test(quick),
    'L-175d Hizli form acilisi Talepler sekmesine gecer ve telefona odaklanir');
  check(read('core/action_dispatch.js').includes("'openQuickLeadCapture'"), 'L-175e Eylem izin listesinde');

  // L-176 — saha ekibi (davranis: gercek render ve kayit fonksiyonlari)
  check(/data-operations-view="people"/.test(html), "L-176a Operasyon'da Saha ekibi gorunumu var");
  check(!/Follow-up/.test(html), 'L-186 Talep durumu Turkce ("Takip bekliyor")');
  await saahaEkibiDavranisi();
  await operasyonKartiDavranisi();
  await kritikEylemKartiDavranisi();
  await satisaHazirlikDavranisi();
} catch (error) {
  failed++;
  console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
} finally {
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
}
main();
