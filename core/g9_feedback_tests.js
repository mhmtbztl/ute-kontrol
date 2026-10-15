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
// L-180 (9.0.2): E-posta baglantisi supabase.co yerine lexbnb.space'e token_hash ile gelir.
// L-181 (M11): Mulk raporunda mulk ve tarih araligi secilemiyordu.
// L-182 (M12): Mesaj ayristirici tarih, ad ve kaporayi okumuyordu; kapora odeme defterine yazilir.
// L-183 (M13): Temizlik planlaninca mulk kendiliginden "temizlik bekliyor", yapilinca hazir.
// L-191 (M21): Ara / Komut ilk 30 rezervasyonu tariyordu; misafir, talep, ekran, kanal yoktu.
// L-192 (M22): Bildirim merkezine satir ureten kod yoktu; olaylar gercek veriden turetilir (phase93).
// L-194 (M24): Sablonlar gecerli mulk/kanal/kategoriyi gostermiyordu; kategori sessizce Diger e, kanal serbest metin.
// L-195 (M25): Gecmis temizlik maliyetinin girilecek yolu yoktu; gecmis aylarda kar yuksek gorunuyordu (phase95).
// L-196 (M26): Gelir tablosu indirilemiyordu; ekrandaki defterden, rol kapili.
// L-197 (M27): Takvim, doluluk ve liste ayri tarih seciyordu; tek donem + mulk.
// L-198 (M28): Gecmis ay toplu girisi formdan; takvimde gece ve tutarli rozet.
// L-199 (M29): Talep formunda rol yuklenmeden yazilan "kaydedemez" mesaji rol gelince kalmiyordu.
// L-193 (M23): Defterdeki "Temizlik" sutunu maliyet saniliyordu; misafirden alinan gelir oldugu yazilir.
// L-184..L-190 (M14-M20): kapora, kar marji hedefi, talep tarihi, mulk net kari, reklam tablosu/metrik/gunluk butce, sablon ekrani, bosluk gecesi.
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

async function epostaBaglantisiDavranisi() {
  sahteDom({});
  const App = require('../app.js');
  check(App.readEmailTokenHashLink('?token_hash=abc&type=invite')?.type === 'invite', 'L-180a token_hash davet baglantisi okunur');
  check(App.readEmailTokenHashLink('?token_hash=abc&type=admin') === null && App.readEmailTokenHashLink('?type=invite') === null,
    'L-180b Bilinmeyen tur ya da belirtecsiz adres yok sayilir');

  const kos = async (search, hata) => {
    const cagrilar = [];
    const adresler = [];
    global.window.location = { search, pathname: '/', hash: '' };
    global.window.history = { replaceState: (_s, _t, url) => adresler.push(url) };
    App.setSupabaseClient({ auth: { verifyOtp: async args => { cagrilar.push(args); return { data: {}, error: hata || null }; } } });
    const sonuc = await App.consumeEmailTokenHashLink();
    return { sonuc, cagrilar, adresler };
  };
  let r = await kos('?token_hash=tok123&type=invite');
  check(r.cagrilar.length === 1 && r.cagrilar[0].token_hash === 'tok123' && r.cagrilar[0].type === 'invite',
    'L-180c Davet baglantisi verifyOtp ile dogrulanir', JSON.stringify(r.cagrilar));
  check(r.adresler[0] === '/?type=invite' && r.sonuc.ok, 'L-180d Belirtec adresten silinir, sifre formu icin tur kalir', JSON.stringify(r.adresler));
  r = await kos('?token_hash=eski&type=magiclink', { message: 'Token has expired or is invalid' });
  check(r.adresler[0] === '/' && r.sonuc.ok === false, 'L-180e Gecersiz baglantida belirtec silinir ve sonuc basarisiz doner', JSON.stringify(r));
  r = await kos('?gelen=1');
  check(r.sonuc === null && !r.cagrilar.length && !r.adresler.length, 'L-180f Normal acilista hicbir sey yapilmaz');
  // Sahte adres sonraki testlere tasinmaz (rapor onizlemesi new URL ile calisir).
  delete global.window.location;
  delete global.window.history;
}

async function mulkRaporuDavranisi() {
  const Engine = require('./property_profile_engine.js');
  const mulk = { id: 'pb', key: 'B', slug: 'B', name: 'TEST Zirve' };
  // 04-28 -> 05-03, 5 gece, 50.000: Mayis araliginda 2 gece -> 20.000 (CLAUDE.md 3.4 ornegi).
  const bookings = [{ id: 'b1', villa: 'B', propertyId: 'pb', checkIn: '2031-04-28', checkOut: '2031-05-03', gross: 50000, status: 'CONFIRMED' }];
  const expenses = [
    { id: 'e1', villa: 'B', date: '2031-05-10', amount: 1000, type: 'OPEX' },
    { id: 'e2', villa: 'B', date: '2031-04-10', amount: 7000, type: 'OPEX' }];
  const tum = Engine.buildPropertyReport({ property: mulk, bookings, expenses, cleaningTasks: [] });
  const mayis = Engine.buildPropertyReport({ property: mulk, bookings, expenses, cleaningTasks: [], range: { start: '2031-05-01', end: '2031-05-31' } });
  check(Math.round(tum.netRoomRevenue) === 50000 && tum.manualOpex === 8000, 'L-181a Aralik verilmezse tum zamanlar (eski davranis)', JSON.stringify([tum.netRoomRevenue, tum.manualOpex]));
  // Tarayicida global olan motor Node'da elle baglanir.
  global.PropertyProfileEngine = Engine;
  global.ReportEngine = require('./report_engine.js');
  check(Math.round(mayis.netRoomRevenue) === 20000 && mayis.soldNights === 2 && mayis.manualOpex === 1000,
    'L-181b Aralikta gelir gecelere tahakkukla bolunur, gider kendi tarihiyle girer', JSON.stringify([mayis.netRoomRevenue, mayis.soldNights, mayis.manualOpex]));

  sahteDom({});
  const App = require('../app.js');
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.setSupabaseClient(kaydedenIstemci());
  App.setAppData({ villas: { A: { id: 'pa', slug: 'A', name: 'TEST Seyir' }, B: { id: 'pb', slug: 'B', name: 'TEST Zirve' } },
    bookings, expenses, cleaningTasks: [], operationalPeople: [], maintenance: [], maintenanceTickets: [] });
  App.openPageReport('PROPERTY');
  const secici = global.document.getElementById('pageReportProperty').innerHTML;
  check(/value="A"/.test(secici) && /value="B"/.test(secici), 'L-181c Rapor penceresinde her mulk secilebilir');
  check(global.document.getElementById('pageReportPropertyControls').style.display === 'flex', 'L-181d Mulk raporunda secim alani gorunur');
  const dom = global.document;
  dom.getElementById('pageReportProperty').value = 'B';
  dom.getElementById('pageReportStart').value = '2031-05-01';
  dom.getElementById('pageReportEnd').value = '2031-05-31';
  const guncelSonuc = App.refreshPropertyReport();
  check(guncelSonuc === true, 'L-181e Raporu guncelle secimi uygular', String(guncelSonuc));
  const alt = dom.getElementById('pageReportSubtitle').innerText;
  check(/TEST Zirve/.test(alt) && /2031/.test(alt) && !/Tüm zamanlar/.test(alt), 'L-181f Rapor secilen mulk ve aralikla basliklanir', alt);
  dom.getElementById('pageReportStart').value = '2031-06-01';
  check(App.refreshPropertyReport() === false, 'L-181g Baslangic bitisten sonra olamaz');
  App.closePageReportModal();
  App.openPageReport('FINANCE');
  check(dom.getElementById('pageReportPropertyControls').style.display === 'none', 'L-181h Diger raporlarda mulk secimi gizli');
}

async function mesajAyristiriciDavranisi() {
  sahteDom({});
  const App = require('../app.js');
  const villas = { ZIRVE: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', slug: 'ZIRVE', name: 'ZİRVE' } };
  const p = App.parseWhatsAppMessageText('16 Ekim cuma giriş 17 Ekim cumartesi çıkış villa Zirve İlter bey 4000 TL alındı 11.000 TL girişte alınacak', villas, '2026-10-14');
  check(p.checkIn === '2026-10-16' && p.checkOut === '2026-10-17', 'L-182a Arada gun adi ve giris/cikis sozcugu olan tarihler okunur', JSON.stringify([p.checkIn, p.checkOut]));
  check(p.guest === 'İlter', 'L-182b "İlter bey" ad olarak okunur; villa adi ada karismaz', p.guest);
  check(p.deposit === 4000 && p.remaining === 11000 && p.amount === 15000, 'L-182c Kapora ve kalan ayrilir; toplam = kapora + kalan', JSON.stringify(p));
  const yalnizKapora = App.parseWhatsAppMessageText('Kapora 5.000 TL gönderdim, 20 Kasım 3 gece', villas, '2026-10-14');
  check(yalnizKapora.deposit === 5000 && yalnizKapora.amount === null, 'L-182d Yalniz kapora varsa toplam uydurulmaz', JSON.stringify(yalnizKapora));
  check(yalnizKapora.checkIn === '2026-11-20' && yalnizKapora.checkOut === '2026-11-23', 'L-182e Tek tarih + gece sayisindan cikis bulunur', JSON.stringify(yalnizKapora));
  const selam = App.parseWhatsAppMessageText('Örnek Misafir: Selamlar, 18-23 Eylül arası', villas, '2026-10-14');
  check(selam.guest !== 'Selamlar', 'L-182f Selamlasma ad sayilmaz', selam.guest);

  // Kayit: kapora rezervasyonun odeme defterine DEPOSIT olarak yazilir.
  sahteDom({ waParsedGuest: 'TEST İlter', waParsedVilla: 'ZIRVE', waParsedAmount: '15000', waParsedCheckIn: '2031-10-16',
    waParsedCheckOut: '2031-10-17', waParsedPax: '2', waParsedPhone: '', waParsedDeposit: '4000' });
  const BOOKING = 'bbbbbbbb-0000-4000-8000-000000000001';
  const ist = kaydedenIstemci();
  ist.rpc = async (ad, args) => ad === 'create_booking_atomic'
    ? { data: { id: BOOKING, tenant_id: TENANT, property_id: villas.ZIRVE.id, booking_code: 'X', guest_name: args.p_guest_name,
      check_in: args.p_check_in, check_out: args.p_check_out, pax: args.p_pax, gross_amount: args.p_gross_amount, status: 'CONFIRMED' }, error: null }
    : { data: [], error: null };
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.setSupabaseClient(ist);
  App.setAppData({ villas, bookings: [], expenses: [], cleaningTasks: [], operationalPeople: [], maintenance: [], maintenanceTickets: [], leads: [] });
  global.__sonUyari = null;
  await App.saveWaAsBooking();
  const odeme = ist.yazmalar.find(k => k.tablo === 'booking_payments' && k.islem === 'insert');
  check(odeme && odeme.yuk.booking_id === BOOKING && odeme.yuk.amount === 4000 && odeme.yuk.kind === 'DEPOSIT',
    'L-182g Kapora rezervasyonun odeme defterine DEPOSIT olarak yazilir', JSON.stringify({ odeme, uyari: global.__sonUyari }));
}

async function temizlikHazirlikDavranisi() {
  const R = require('./property_sales_readiness.js');
  const mulk = { id: 'p1', key: 'SEYIR', name: 'SEYİR' };
  const bugun = '2031-05-10';
  const kur = (tasks, manual) => R.buildPropertyReadiness(mulk, { overrideStatus: manual, maintenanceTickets: [], cleaningTasks: tasks, today: bugun });
  const planli = kur([{ id: 'c1', villa: 'SEYIR', date: bugun, status: 'PLANNED' }], 'SALES_READY');
  check(planli.status === 'NEEDS_CLEANING' && planli.pendingCleaningTaskIds[0] === 'c1', 'L-183a Bugun planli temizlik mulku "temizlik bekliyor" yapar (elle "hazir" ustune)', planli.status);
  check(kur([{ id: 'c0', villa: 'SEYIR', date: '2031-05-08', status: 'PLANNED' }]).status === 'NEEDS_CLEANING', 'L-183b Geciken temizlik de bekliyor sayilir');
  check(kur([{ id: 'c2', villa: 'SEYIR', date: '2031-05-20', status: 'PLANNED' }]).status === 'UNSET', 'L-183c Gelecek tarihli temizlik bugunu etkilemez');
  const yapildi = kur([{ id: 'c1', villa: 'SEYIR', date: bugun, status: 'DONE' }]);
  check(yapildi.status === 'SALES_READY' && yapildi.source === 'CLEANING', 'L-183d Temizlik yapilinca mulk hazir olur', JSON.stringify([yapildi.status, yapildi.reason]));
  check(kur([{ id: 'c1', villa: 'SEYIR', date: bugun, status: 'SKIPPED' }]).status === 'UNSET', 'L-183e "Yapilmadi" temizlik bekleyen is sayilmaz, hazir da yapmaz');
  const ariza = R.buildPropertyReadiness(mulk, { maintenanceTickets: [{ id: 't', propertyId: 'p1', status: 'OPEN', severity: 'CRITICAL' }],
    cleaningTasks: [{ id: 'c1', villa: 'SEYIR', date: bugun, status: 'PLANNED' }], today: bugun });
  check(ariza.status === 'BLOCKED_MAINTENANCE', 'L-183f Satisa engel ariza temizlikten once gelir');

  sahteDom({});
  const App = require('../app.js');
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.setAppData({ villas: { SEYIR: { id: 'p1', slug: 'SEYIR', name: 'SEYİR' } }, bookings: [], operationalPeople: [],
    maintenance: [], maintenanceTickets: [], housekeepingOverrides: {},
    cleaningTasks: [{ id: 'c1', villa: 'SEYIR', date: '2020-01-01', status: 'PLANNED', amount: 0 }] });
  const durum = App.getPropertySalesReadiness('SEYIR');
  check(durum && durum.status === 'NEEDS_CLEANING', 'L-183g Uygulama hazirlik hesabina temizlik gorevlerini verir', JSON.stringify(durum && durum.status));
  App.renderPortfolioHealth([durum]);
  const kart = global.document.getElementById('portfolioHealthCardsGrid').innerHTML;
  check(/<option value="SALES_READY"[^>]*disabled/.test(kart) && /Temizliğe git/.test(kart), 'L-183h Bekleyen temizlikte "hazir" secilemez; kart temizlige goturur');
  const ist = kaydedenIstemci();
  App.setSupabaseClient(ist);
  check(await App.setPropertySalesReadiness('SEYIR', 'SALES_READY') === false && !ist.yazmalar.length, 'L-183i Bekleyen temizlikte "hazir" yazilmaz');
}

function istanbulBugun(gunEkle = 0) {
  const d = new Date(Date.now() + gunEkle * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

async function asama4Davranisi() {
  sahteDom({});
  const App = require('../app.js');
  const html = read('index.html');
  App.setActiveTenant({ id: TENANT, role: 'owner' });

  // L-184 (M14) — kapora tek yoldan odeme defterine
  let ist = kaydedenIstemci();
  App.setSupabaseClient(ist);
  App.setAppData({ villas: {}, bookings: [], expenses: [], cleaningTasks: [], bookingPayments: [] });
  const not = await App.recordBookingDeposit('bbbbbbbb-0000-4000-8000-000000000009', 2500, 'BANK_TRANSFER', null);
  const dep = ist.yazmalar.find(k => k.tablo === 'booking_payments');
  check(dep && dep.yuk.kind === 'DEPOSIT' && dep.yuk.amount === 2500 && dep.yuk.method === 'BANK_TRANSFER' && /Kapora/.test(not),
    'L-184a Kapora odeme defterine DEPOSIT olarak yazilir', JSON.stringify(dep));
  check(await App.recordBookingDeposit('x', 0, null, null) === '' , 'L-184b Kapora yoksa yazma yapilmaz');
  check(/id="resDeposit"/.test(html) && /id="quickBookingDeposit"/.test(html), 'L-184c Rezervasyon ve hizli rezervasyon formunda kapora alani var');
  check(/if \(deposit > 0\) ekUyari \+= await recordBookingDeposit\(savedBooking\.id/.test(read('app.js')), 'L-184d Rezervasyon kaydi kaporayi yazar');

  // L-185 (M15) — kar hedefi oranla
  sahteDom({ goalRevenue: '300000', goalMarginPct: '35', goalNetProfit: '' });
  App.syncGoalProfitFromMargin();
  check(global.document.getElementById('goalNetProfit').value === 105000, 'L-185a Oran girilince net kar tutari hesaplanir', String(global.document.getElementById('goalNetProfit').value));
  sahteDom({ goalRevenue: '200000', goalMarginPct: '', goalNetProfit: '50000' });
  App.syncGoalMarginFromProfit();
  check(Number(global.document.getElementById('goalMarginPct').value) === 25, 'L-185b Tutar girilince oran hesaplanir');
  check(!/Cironun yaklaşık %35/.test(html), 'L-185c Sabit "%35" ipucu kalkti');

  // L-186 (M16) — talep duzenlemede ilgilenilen tarih
  check(/id="leadCheckIn"/.test(html) && /id="leadCheckOut"/.test(html), 'L-186a Talep formunda ilgilenilen tarihler var');
  check(/checkIn,\r?\n\s*checkOut\r?\n\s*\}\);/.test(read('app.js')), 'L-186b Talep kaydi tarihleri tasir');

  // L-187 (M17) — mulk bazinda net kar
  sahteDom({});
  App.setSupabaseClient(kaydedenIstemci());
  const ay = istanbulBugun().slice(0, 7);
  App.setCurrentFilter({ period: ay, villa: 'ALL' });
  App.setAppData({ villas: { A: { id: 'pa', slug: 'A', name: 'A' }, B: { id: 'pb', slug: 'B', name: 'B' } },
    bookings: [
      { id: 'a1', villa: 'A', propertyId: 'pa', checkIn: ay + '-02', checkOut: ay + '-04', gross: 20000, status: 'CONFIRMED' },
      { id: 'b1', villa: 'B', propertyId: 'pb', checkIn: ay + '-02', checkOut: ay + '-04', gross: 10000, status: 'CONFIRMED' }],
    expenses: [
      { id: 'e1', villa: 'A', date: ay + '-05', amount: 5000, type: 'OPEX' },
      { id: 'e2', villa: 'ALL', date: ay + '-05', amount: 9000, type: 'OPEX' }],
    cleaningTasks: [], closedPeriods: [] });
  const a = App.propertyProfitView('A');
  const b = App.propertyProfitView('B');
  check(/15\.000 TL/.test(a.valueHtml) && /ortak giderler hariç/.test(a.note), 'L-187a Mulk net kari: kendi geliri - kendi gideri; ortak gider bolunmez', JSON.stringify(a));
  check(b.valueHtml === '—' && /Gider kaydı yok/.test(b.note), 'L-187b Gideri olmayan mulkte kar olculemez ("—")', JSON.stringify(b));
  check(!/Gider dağılımı gerekli/.test(read('app.js')), 'L-187c "Gider dagilimi gerekli" sabiti kalkti');

  // L-188 (M18) — reklam tablosu, gunluk butce, ozel metrik
  const UI = require('./marketing_ui.js');
  const [metrik] = UI.normalizeCustomMetrics([{ id: 'm1', name: 'Mesaj maliyeti', num: 'spend', op: '/', den: 'messages' }, { id: 'x', name: 'kotu', num: 'eval', op: '/', den: 'spend' }]);
  check(metrik && UI.normalizeCustomMetrics([{ id: 'x', name: 'kotu', num: 'eval', op: '/', den: 'spend' }]).length === 0, 'L-188a Ozel metrik yalniz bilinen alanlari kabul eder');
  check(UI.evaluateCustomMetric(metrik, { spend: 1000, messages: 40 }) === 25, 'L-188b Ozel metrik hesaplanir (Harcama / Mesaj)');
  check(UI.evaluateCustomMetric(metrik, { spend: 1000, messages: 0 }) === null && UI.evaluateCustomMetric(metrik, { spend: 1000, messages: null }) === null,
    'L-188c Sifira bolum ya da olculmemis alan "—" (null)');
  const butce = UI.campaignBudgetView({ id: 'c1', budget: 500 }, [
    { campaignId: 'c1', periodStart: '2031-05-01', periodEnd: '2031-05-10', spend: 4000 },
    { campaignId: 'c2', periodStart: '2031-05-01', periodEnd: '2031-05-10', spend: 9999 }]);
  check(butce.limit === 500 && butce.avgDaily === 400 && butce.usagePct === 80 && !butce.overLimit, 'L-188d Gunluk sinir ortalama gunluk harcamayla karsilastirilir', JSON.stringify(butce));
  check(UI.campaignBudgetView({ id: 'c1', budget: 0 }, []).limit === null, 'L-188e Sinir girilmemisse karsilastirma yok');
  const reklamHtml = UI.renderAds({ metrics: [], channelLeadCost: [], campaigns: [{ id: 'c1', name: 'TEST Kamp', platform: 'META' }],
    allCampaigns: [{ id: 'c1', name: 'TEST Kamp', platform: 'META', budget: 500 }], canManage: true, targets: {},
    periods: [{ id: 'p1', campaignId: 'c1', platform: 'META', periodStart: '2031-05-01', periodEnd: '2031-05-10', spend: 4000, impressions: 10000, clicks: 200, messages: 40, calls: 2 }],
    allPeriods: [{ id: 'p1', campaignId: 'c1', periodStart: '2031-05-01', periodEnd: '2031-05-10', spend: 4000 }],
    customMetrics: [metrik], totalSpend: 4000, adShare: { pct: null } });
  check(/<table class="data-table"><thead><tr><th>Kampanya<\/th><th>Dönem<\/th>/.test(reklamHtml) && /<th[^>]*>Mesaj maliyeti<\/th>/.test(reklamHtml),
    'L-188f Donemler tablo olarak listelenir, ozel metrik sutun olur');
  check(/Günlük sınır/.test(reklamHtml) && /data-ads-custom-metric-form/.test(reklamHtml), 'L-188g Kampanya listesinde gunluk sinir, metrik ekleme formu var');

  // L-189 (M19) — sablon ekrani
  sahteDom({});
  App.setAppData({ settingsTaskTemplates: [{ id: 't', title: 'Havuz', task_type: 'CLEANING', priority: 'MEDIUM' }],
    settingsMessageTemplates: [{ id: 'm', name: 'Teklif', channel: 'WHATSAPP', lifecycle_stage: 'MANUAL' }], settingsChecklistTemplates: [] });
  App.renderSettingsTemplates();
  const sablon = global.document.getElementById('settingsTaskTemplatesList').innerHTML + global.document.getElementById('settingsMessageTemplatesList').innerHTML;
  check(/Temizlik · orta öncelik/.test(sablon) && /WhatsApp · elle gönderilir/.test(sablon) && !/CLEANING|MEDIUM|MANUAL/.test(sablon),
    'L-189a Sablon listelerinde ham kod yerine Turkce etiket', sablon.slice(0, 200));
  check((html.match(/settings-template-help/g) || []).length === 3, 'L-189b Her sablon bolmesi ne ise yaradigini soyler');

  // L-190 (M20) — bosluk gecesi yalniz gelecekte
  const dun = istanbulBugun(-1);
  App.setAppData({ villas: { A: { id: 'pa', slug: 'A', name: 'A', basePrice: 1000 } }, bookings: [
    { id: 'g1', villa: 'A', checkIn: istanbulBugun(-10), checkOut: istanbulBugun(-8), status: 'CONFIRMED' },
    { id: 'g2', villa: 'A', checkIn: istanbulBugun(-6), checkOut: dun, status: 'CONFIRMED' },
    { id: 'g3', villa: 'A', checkIn: istanbulBugun(2), checkOut: istanbulBugun(4), status: 'CONFIRMED' }], expenses: [], cleaningTasks: [] });
  const gaps = App.detectGapNights();
  check(gaps.length === 1 && gaps[0].checkIn === istanbulBugun() && gaps[0].nights === 2,
    'L-190a Gecmis bosluk firsat sayilmaz; bugun baslamis bosluk bugunden itibaren kirpilir', JSON.stringify(gaps));
  check(!/indirim oranını siz belirlersiniz/.test(html), 'L-190b Rehber olmayan bir ozelligi vaat etmez');
}

async function cokluMulkTalepDavranisi() {
  sahteDom({});
  const App = require('../app.js');
  const PA = 'aaaaaaaa-0000-4000-8000-00000000000a', PB = 'aaaaaaaa-0000-4000-8000-00000000000b', PC = 'aaaaaaaa-0000-4000-8000-00000000000c';
  const LEAD = 'cccccccc-0000-4000-8000-000000000001';
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.setAppData({ villas: { A: { id: PA, slug: 'A', name: 'TEST A' }, B: { id: PB, slug: 'B', name: 'TEST B' }, C: { id: PC, slug: 'C', name: 'TEST C' } },
    leads: [{ id: LEAD, villa: 'A', extraPropertyIds: [PC] }], bookings: [], expenses: [], cleaningTasks: [] });

  const bagli = App.attachLeadInterestProperties([{ id: LEAD }, { id: 'x' }], [{ lead_id: LEAD, property_id: PB }, { lead_id: LEAD, property_id: PC }]);
  check(bagli[0].extraPropertyIds.length === 2 && bagli[1].extraPropertyIds.length === 0, 'L-186c Ek mulkler talebe baglanir');
  check(App.attachLeadInterestProperties([{ id: LEAD }], null)[0].extraPropertyIds.length === 0, 'L-186d Tablo yokken (goc oncesi) talepler ek mulksuz yuklenir');

  App.renderLeadExtraPropertyPicker('leadExtraProperties', [PC], 'A');
  const secici = global.document.getElementById('leadExtraProperties').innerHTML;
  check(!secici.includes(PA) && secici.includes(PB) && new RegExp(PC + '" checked').test(secici), 'L-186e Secici asil mulku disarida birakir, kayitli ek mulku isaretli gosterir', secici);

  let ist = kaydedenIstemci();
  App.setSupabaseClient(ist);
  const uyari = await App.syncLeadInterestProperties(LEAD, [PA, PB, PB, 'gecersiz'], PA);
  const sil = ist.yazmalar.find(k => k.tablo === 'lead_interest_properties' && k.islem === 'delete');
  const ekle = ist.yazmalar.find(k => k.tablo === 'lead_interest_properties' && k.islem === 'insert');
  check(uyari === '' && sil && ekle && ekle.yuk.length === 1 && ekle.yuk[0].property_id === PB && ekle.yuk[0].tenant_id === TENANT,
    'L-186f Esitleme eskiyi siler, asil mulk ve tekrar disinda secileni yazar', JSON.stringify(ekle && ekle.yuk));

  ist = kaydedenIstemci();
  const eksikSema = { code: 'PGRST205', message: "Could not find the table 'public.lead_interest_properties' in the schema cache" };
  const hataliIstemci = { ...ist, from: tablo => { const q = ist.from(tablo); const orig = q.then; q.then = (res, rej) => Promise.resolve({ data: null, error: eksikSema }).then(res, rej); return q; } };
  App.setSupabaseClient(hataliIstemci);
  const gocYok = await App.syncLeadInterestProperties(LEAD, [PB], PA);
  check(/phase91/.test(gocYok), 'L-186g Goc uygulanmamissa talep kaydi bozulmaz, kullaniciya soylenir', gocYok);

  const html = read('index.html');
  check(/id="leadQuickExtraProperties"/.test(html) && /id="leadExtraProperties"/.test(html), 'L-186h Hizli kayit ve duzenleme formunda ek mulk secimi var');
  check(read('supabase/migration_manifest.txt').includes('migration_phase91_lead_interest_properties.sql'), 'L-186i phase91 manifestte');
}

// L-191 (M21) — Ara / Komut: misafir, talep, butun rezervasyonlar, ekran, kanal.
async function aramaDavranisi() {
  const CS = require('./command_search.js');
  const villas = { 'villa-a': { id: 'p-a', name: 'Villa Zeytin', capacity: 6 } };
  const bookings = Array.from({ length: 40 }, (_, i) => ({ id: 'b' + i, guest: 'Misafir ' + i, villa: 'villa-a', checkIn: '2026-07-01', checkOut: '2026-07-03', channel: 'Direct' }));
  bookings.push({ id: 'b-son', guest: 'İlter Kaya', villa: 'villa-a', checkIn: '2026-10-16', checkOut: '2026-10-18', channel: 'Airbnb', phone: '0532 111 22 33' });
  const veri = {
    role: 'owner', villas, bookings,
    guests: [{ id: 'g1', firstName: 'Onur', lastName: 'Bey', phone: '+90 555 000 11 22' }],
    leads: [{ id: 'l1', guestName: 'Şule Işık', phone: '05441234567', propertyId: 'p-a' }],
    channels: [{ code: 'AIRBNB', displayName: 'Airbnb', channelType: 'OTA', defaultCommissionRate: 15, isActive: true }]
  };
  const ara = (q, v = veri) => CS.search(CS.buildEntries(v), q);
  const grup = (sonuc, ad) => (sonuc.find(g => g.group === ad) || { items: [], more: 0 });

  check(grup(ara('onur'), 'Misafirler').items.some(k => k.target.id === 'g1'), 'L-191a Misafir defterindeki kisi adiyla bulunur ("onur")');
  check(grup(ara('sule'), 'Talepler').items.some(k => k.target.id === 'l1') && grup(ara('ŞULE IŞIK'), 'Talepler').items.length === 1,
    'L-191b Talep bulunur; Turkce harfler katlanir (Şule/sule, IŞIK)');
  check(grup(ara('ilter'), 'Rezervasyonlar').items.some(k => k.target.id === 'b-son'),
    'L-191c 41. rezervasyon da aranir (eski slice(0, 30) siniri yok)');
  const airbnb = ara('airbnb');
  check(grup(airbnb, 'Ekranlar').items.some(k => k.target.tab === 'marketing') && grup(airbnb, 'Kanallar').items.length === 1,
    'L-191d "airbnb" kanal ekranini ve kanal kaydini bulur');
  check(grup(ara('ota'), 'Ekranlar').items.some(k => k.target.tab === 'marketing'), 'L-191e "ota" kanal ekranina goturur');
  check(grup(ara('temizlik'), 'Ekranlar').items.some(k => k.target.opsView === 'cleaning'), 'L-191f Ekran adi alt gorunume goturur (Operasyon › Temizlik)');
  check(grup(ara('5550001122'), 'Misafirler').items.length === 1 && grup(ara('0532 111'), 'Rezervasyonlar').items.length === 1,
    'L-191g Telefon numarasi bosluklu ya da bosluksuz bulunur');
  const cok = grup(ara('misafir'), 'Rezervasyonlar');
  check(cok.items.length === 5 && cok.more === 35, 'L-191h Grup basina 5 sonuc, kalan sayi soylenir (gizlice kesilmez)', JSON.stringify({ n: cok.items.length, more: cok.more }));
  check(grup(ara('yeni talep'), 'Komutlar').items.some(k => k.target.name === 'newLead'), 'L-191i "yeni talep" hizli kayit komutunu bulur');

  const staff = ara('onur', { ...veri, role: 'staff' });
  check(staff.length === 0 && ara('saha', { ...veri, role: 'staff' }).length === 1, 'L-191j staff misafir/rezervasyon goremez, yalniz saha ekranini bulur');
  const viewer = ara('ayar', { ...veri, role: 'viewer' });
  check(!viewer.some(g => g.group === 'Ekranlar' && g.items.some(k => k.target.kind === 'settings'))
    && grup(ara('onur', { ...veri, role: 'viewer' }), 'Misafirler').items.length === 1
    && grup(ara('yeni rezervasyon', { ...veri, role: 'viewer' }), 'Komutlar').items.length === 0,
    'L-191k viewer ayarlari ve yazma komutlarini gormez, satis verisini okur (3.3.1)');
  check(grup(ara('finans', { ...veri, role: 'sales' }), 'Ekranlar').items.length === 0, 'L-191l sales finans ekranini bulmaz');

  const app = read('app.js');
  const govde = functionBody(app, 'function handleCommandPaletteSearch(');
  check(/CommandSearch\.search\(/.test(govde) && !/slice\(0,\s*30\)/.test(govde), 'L-191m Palet tek dizini kullanir');
  check(/command_search\.js\?v=/.test(read('index.html')), 'L-191n Modul sayfaya yuklenir');
}

// L-193 (M23) — Rezervasyon defterindeki temizlik sutunu gelir oldugunu soyler.
async function temizlikSutunuDavranisi() {
  const FIE = require('./finance_import_engine.js');
  const basliklar = FIE.SABLON_SUTUNLARI.BOOKINGS;
  check(basliklar.includes('Misafirden Temizlik Ücreti (TL)') && !basliklar.includes('Temizlik Ücreti (TL)'),
    'L-193a Defter/sablon basligi temizligin misafirden alinan gelir oldugunu soyler');
  const yeni = FIE.autoDetectColumnMap(basliklar, 'BOOKINGS');
  const eski = FIE.autoDetectColumnMap(['Villa', 'Misafir Adı', 'Giriş Tarihi', 'Çıkış Tarihi', 'Brüt Tutar (TL)', 'Temizlik Ücreti (TL)'], 'BOOKINGS');
  check(yeni.cleaningFee === 'Misafirden Temizlik Ücreti (TL)' && eski.cleaningFee === 'Temizlik Ücreti (TL)',
    'L-193b Yeni baslik eslesir; eski basligla indirilmis dosyalar da yuklenir');
  const csv = read('sablonlar/lexbnb-rezervasyon-sablonu.csv') + read('core/import_template_guide.js');
  check(/Misafirden Temizlik Ücreti/.test(csv) && /MALİYETİ bu dosyaya yazılmaz/.test(csv), 'L-193c Yayinlanan sablon yeni basligi tasir; aciklama sayfasi maliyetin bu dosyada olmadigini yazar');
}

// L-192 (M22) — Bildirim merkezinin kaynagi: gercek veriden, role gore.
async function bildirimDavranisi() {
  const NF = require('./notification_feed.js');
  const bugun = '2026-10-14';
  const temel = {
    today: bugun, currentUserId: 'u-sales',
    villas: { zeytin: { name: 'Villa Zeytin' } },
    members: [
      { user_id: 'u-yeni', full_name: 'Ayşe Yeni', email: 'ayse@x.test', role: 'manager', joined_at: '2026-10-10T08:00:00Z' },
      { user_id: 'u-eski', full_name: 'Eski Üye', role: 'sales', joined_at: '2026-08-01T08:00:00Z' },
      { user_id: 'u-ben', full_name: 'Ben', role: 'owner', joined_at: '2026-10-12T08:00:00Z', is_self: true }],
    cleaningTasks: [
      { id: 'c1', villa: 'zeytin', date: '2026-10-13', workflowState: 'AWAITING_INSPECTION' },
      { id: 'c2', villa: 'zeytin', date: '2026-10-13', status: 'DONE' }],
    maintenance: [
      { id: 'm1', title: 'Kombi', villa: 'zeytin', created_at: '2026-10-12T10:00:00Z', status: 'OPEN', priority: 'P1' },
      { id: 'm2', title: 'Eski', villa: 'zeytin', created_at: '2026-09-01T10:00:00Z', status: 'OPEN' },
      { id: 'm3', title: 'Kapali', villa: 'zeytin', created_at: '2026-10-13T10:00:00Z', status: 'COMPLETED' }],
    isTicketOpen: t => !['RESOLVED', 'COMPLETED', 'CANCELLED'].includes(t.status),
    closedPeriods: [], previousMonthHasRecords: true,
    followUps: [
      { id: 'l1', guestName: 'Onur', nextFollowUpAt: '2026-10-13T09:00:00Z', assignedTo: 'u-sales' },
      { id: 'l2', guestName: 'Başkası', nextFollowUpAt: '2026-10-14T09:00:00Z', assignedTo: 'u-diger' },
      { id: 'l3', guestName: 'Atanmamış', nextFollowUpAt: '2026-10-14T09:00:00Z' }],
    gapNights: [
      { villaKey: 'zeytin', villaName: 'Villa Zeytin', checkIn: '2026-10-20', checkOut: '2026-10-22', nights: 2, regularPrice: 30000 },
      { villaKey: 'zeytin', villaName: 'Villa Zeytin', checkIn: '2026-10-25', checkOut: '2026-10-26', nights: 1, regularPrice: null },
      { villaKey: 'zeytin', villaName: 'Villa Zeytin', checkIn: '2026-12-20', checkOut: '2026-12-22', nights: 2, regularPrice: 30000 }]
  };
  const tur = (liste, t) => liste.filter(e => e.event_key.startsWith(t + ':'));
  const sahip = NF.deriveNotifications({ ...temel, role: 'owner' });

  check(tur(sahip, 'member_joined').length === 1 && /Ayşe Yeni/.test(tur(sahip, 'member_joined')[0].title),
    'L-192a Son 14 gunde katilan uye bildirilir; eski uye ve kendisi bildirilmez');
  check(tur(sahip, 'cleaning_inspection').length === 1 && sahip.find(e => e.event_key === 'cleaning_inspection:c1'),
    'L-192b Yalniz M kontrolu bekleyen temizlik bildirilir');
  const ariza = tur(sahip, 'maintenance_open');
  check(ariza.length === 1 && ariza[0].event_key === 'maintenance_open:m1' && ariza[0].severity === 'CRITICAL',
    'L-192c Son 7 gunun acik arizasi bildirilir (P1 kritik); eski ve kapali ariza bildirilmez');
  check(tur(sahip, 'period_unclosed').length === 1 && tur(sahip, 'period_unclosed')[0].event_key === 'period_unclosed:2026-09',
    'L-192d Kayit olan ve kapanmamis gecen ay bildirilir');
  check(tur(NF.deriveNotifications({ ...temel, role: 'owner', closedPeriods: [{ year: 2026, month: 9, status: 'CLOSED' }] }), 'period_unclosed').length === 0
    && tur(NF.deriveNotifications({ ...temel, role: 'owner', previousMonthHasRecords: false }), 'period_unclosed').length === 0,
    'L-192e Kapanmis ya da kayitsiz ay bildirilmez');
  const firsat = tur(sahip, 'revenue_opportunity');
  check(firsat.length === 2 && /₺30\.000/.test(firsat.find(e => e.event_key.includes('2026-10-20')).message)
    && /Liste fiyatı girilmemiş/.test(firsat.find(e => e.event_key.includes('2026-10-25')).message),
    'L-192f Kazanc firsati: 30 gun icindeki gercek bosluk; fiyat yoksa tutar uydurulmaz');
  check(sahip[0].severity === 'CRITICAL', 'L-192g Kritik bildirim en ustte');

  const satis = NF.deriveNotifications({ ...temel, role: 'sales' });
  check(tur(satis, 'lead_followup').map(e => e.event_key).sort().join() === 'lead_followup:l1:2026-10-13,lead_followup:l3:2026-10-14'
    && tur(satis, 'lead_followup').find(e => e.event_key.includes('l1')).severity === 'WARNING',
    'L-192h Satis rolu kendine atanan ve atanmamis takipleri gorur; gecikmis takip uyari');
  check(!tur(satis, 'member_joined').length && !tur(satis, 'cleaning_inspection').length && !tur(satis, 'period_unclosed').length && tur(satis, 'revenue_opportunity').length === 2,
    'L-192i Satis rolu yonetim bildirimlerini almaz, kazanc firsatini alir');
  const izleyici = NF.deriveNotifications({ ...temel, role: 'viewer' });
  check(!tur(izleyici, 'revenue_opportunity').length && tur(izleyici, 'maintenance_open').length === 1 && tur(izleyici, 'lead_followup').length === 3,
    'L-192j Izleyici okur (ariza, takip) ama yazma gerektiren firsat bildirimini almaz');
  check(NF.deriveNotifications({ ...temel, role: 'staff' }).length === 0 && NF.typesForRole('staff').length === 0,
    'L-192k Personel (staff) bildirim almaz');
  check(sahip.every(e => /^[a-z_]{3,40}:[A-Za-z0-9_:.-]{1,200}$/.test(e.event_key) && ['TEAM', 'OPERATIONS', 'FINANCE', 'SALES', 'PRICING'].includes(e.domain)
    && (!e.deep_link || /^[a-z]+(:[A-Za-z0-9_.-]{1,80}){0,2}$/.test(e.deep_link))),
    'L-192l Uretilen her olay phase93 dogrulamasindan gecer');
  check(NF.typesForRole('owner').length === 6 && NF.typesForRole('sales').length === 3,
    'L-192m Bos merkezde rolun alacagi bildirim turleri aciklanir');

  const app = read('app.js');
  const sync = functionBody(app, 'async function syncNotificationFeed(');
  check(/sync_my_notifications/.test(sync) && /notificationFeedPersisted = false/.test(sync), 'L-192n Istemci phase93 ile esler; goc yoksa bunu soyler');
  const drawer = functionBody(app, 'function renderUserNotificationsDrawer(');
  check(/Bildirimler neye göre gelir/.test(drawer) && !/Yeni bildirim bulunmuyor/.test(drawer), 'L-192o Bos cekmece ne zaman bildirim gelecegini anlatir');
  check(/notification_feed\.js\?v=/.test(read('index.html')), 'L-192p Modul sayfaya yuklenir');
}

// L-199 (M29) — Talep formundaki rol mesaji: anlasilir ve rol gelince kalkar.
async function talepRolMesajiDavranisi() {
  sahteDom({});
  const App = require('../app.js');
  App.setSupabaseClient(kaydedenIstemci());
  App.setAppData({ villas: {}, bookings: [], leads: [], leadSources: [{ id: 's1', label: 'WhatsApp', is_active: true }] });
  const mesaj = () => document.getElementById('leadQuickMessage').textContent;
  App.setActiveTenant({ id: TENANT, role: undefined });
  App.renderLeadQuickCapture();
  const once = mesaj();
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.renderLeadQuickCapture();
  check(once === 'Yetkiniz yükleniyor…' && mesaj() === '', 'L-199a Rol sonradan sahip gelince "kaydedemez" mesaji kalkar', JSON.stringify({ once, sonra: mesaj() }));
  App.setActiveTenant({ id: TENANT, role: 'viewer' });
  App.renderLeadQuickCapture();
  check(/İzleyici rolündesiniz/.test(mesaj()) && /Satış/.test(mesaj()), 'L-199b Izleyiciye neden kaydedemedigi ve ne yapacagi soylenir', mesaj());
  App.setActiveTenant({ id: TENANT, role: 'sales' });
  document.getElementById('leadQuickMessage').textContent = 'Yeni talep kaydedildi.';
  document.getElementById('leadQuickMessage').dataset.roleMessage = 'false';
  App.renderLeadQuickCapture();
  check(mesaj() === 'Yeni talep kaydedildi.', 'L-199c Yazabilen rolde basari mesaji silinmez');
}

// L-194 (M24) — Sablonlar gecerli degerleri gosterir; ice aktarma kategori ve
// kanali dogrular, taninmayani sessizce "Diğer"e atmaz.
async function sablonGecerliDegerDavranisi() {
  const E = require('./finance_import_engine.js');
  const G = require('./import_template_guide.js');
  const app = read('app.js');
  const html = read('index.html');

  check(E.resolveExpenseCategory('TEMİZLİK') === 'Temizlik' && E.resolveExpenseCategory('Bakım, Onarım & Tesisat') === 'Bakım'
    && E.resolveExpenseCategory('fatura') === 'Fatura' && E.resolveExpenseCategory('Şömine & Yakacak') === null,
    'L-194a Kategori Turkce harf/buyuk-kucuk duyarsiz cozulur; taninmayan null');

  const gMap = { date: 'Tarih', category: 'Kategori', amount: 'Tutar', property: 'Villa' };
  const g = E.validateExpenseRows([
    { Tarih: '2026-09-03', Kategori: 'elektrik', Tutar: '500', Villa: '' },
    { Tarih: '2026-09-04', Kategori: 'Şömine & Yakacak', Tutar: '700', Villa: '' },
    { Tarih: '2026-09-05', Kategori: 'Eski Kategori', Tutar: '900', Villa: '' }
  ], gMap, { properties: [], existingCategories: ['Eski Kategori'] });
  check(g.validCount === 2 && g.validatedRows[0].category === 'Fatura' && g.validatedRows[1].category === 'Eski Kategori'
    && g.errors.length === 1 && /Kategori tanınmadı: "Şömine & Yakacak"\. Geçerli: Maaş, Temizlik/.test(g.errors[0].errors.join(' ')),
    'L-194b Taninmayan kategori gecerli listeyle reddedilir; defterdeki eski kategori aynen kabul edilir', JSON.stringify(g.errors));

  const kanallar = [{ code: 'AIRBNB', displayName: 'Airbnb' }, { code: 'BOOKING', displayName: 'Booking.com' }];
  const bMap = { property: 'Villa', guest: 'Misafir', checkIn: 'Giris', checkOut: 'Cikis', gross: 'Brut', channel: 'Kanal' };
  const satir = (kanal, i) => ({ Villa: 'zeytin', Misafir: 'Test ' + i, Giris: '2026-08-0' + (i + 1), Cikis: '2026-08-1' + i, Brut: '1000', Kanal: kanal });
  const ctx = { properties: [{ id: 'p1', key: 'zeytin', slug: 'zeytin', name: 'Villa Zeytin' }], existingBookings: [], channels: kanallar };
  const b = E.validateBookingRows([satir('airbnb ', 0), satir('Booking.com', 1), satir('Tripadvisor', 2), satir('', 3)], bMap, ctx);
  check(b.validCount === 3 && b.validatedRows[0].channel === 'AIRBNB' && b.validatedRows[1].channel === 'BOOKING'
    && b.errors.length === 1 && /Kanal tanınmadı: "Tripadvisor"\. Geçerli: AIRBNB, BOOKING/.test(b.errors[0].errors.join(' ')),
    'L-194c Kanal kod ya da adla formun koduna cevrilir; taninmayan reddedilir; bos kanal eskisi gibi', JSON.stringify(b.errors));

  const appKategoriler = (app.match(/const EXPENSE_CATEGORIES = \[([\s\S]*?)\];/) || ['', ''])[1].match(/name: '([^']+)'/g).map(x => x.slice(7, -1));
  const formKategoriler = ((html.match(/<select id="expCategory"[\s\S]*?<\/select>/) || [''])[0].match(/value="([^"]+)"/g) || []).map(x => x.slice(7, -1));
  const motor = E.GIDER_KATEGORILERI.map(c => c.name);
  check(JSON.stringify(appKategoriler) === JSON.stringify(motor) && JSON.stringify(formKategoriler) === JSON.stringify(motor),
    'L-194d Gider formu, raporlar ve ice aktarma ayni kategori listesini kullanir', JSON.stringify({ appKategoriler, formKategoriler, motor }));
  const appKanallar = (app.match(/const DEFAULT_BOOKING_CHANNELS = Object\.freeze\(\[([\s\S]*?)\]\);/) || ['', ''])[1].match(/code: '([A-Z_]+)'/g).map(x => x.slice(7, -1));
  check(JSON.stringify(G.SISTEM_KANALLARI.map(c => c.code)) === JSON.stringify(appKanallar), 'L-194e Statik sablonun kanal listesi sistem kanallariyla ayni');

  const ozel = G.buildGuide('BOOKINGS', { properties: [{ code: 'zeytin', name: 'Villa Zeytin' }], channels: [{ code: 'AIRBNB', displayName: 'Airbnb' }, { code: 'ESKI', displayName: 'Eski', isActive: false }] });
  const duz = ozel.validValues.map(r => r.join('|')).join('\n');
  check(/zeytin\|Villa Zeytin/.test(duz) && /AIRBNB\|Airbnb/.test(duz) && !/ESKI/.test(duz) && /CANCELLED/.test(duz)
    && ozel.steps.some(s => /^ADIM 3 .*GEÇERLİ DEĞERLER/.test(s)) && ozel.steps.filter(s => /^ADIM \d/.test(s)).length >= 8,
    'L-194f Uygulama ici sablon: adim adim talimat + isletmenin mulk/kanal/durum listesi (pasif kanal yok)');
  const genel = G.buildGuide('EXPENSES', { categories: E.GIDER_KATEGORILERI }).validValues.map(r => r.join('|')).join('\n');
  check(/MULK_KODU_1/.test(genel) && /Fatura\|Fatura \(Elektrik/.test(genel) && /CAPEX/.test(genel), 'L-194g Statik gider sablonu kategori ve tur listesini tasir');

  const XLSX = require('../xlsx.full.min.js');
  const wb = XLSX.read(require('fs').readFileSync(require('path').join(root, 'sablonlar', 'lexbnb-gider-sablonu.xlsx')), { type: 'buffer' });
  const gs = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
  const gr = E.validateExpenseRows(gs.slice(1).map(r => Object.fromEntries(gs[0].map((h, i) => [h, r[i]]))), E.autoDetectColumnMap(gs[0], 'EXPENSES'),
    { properties: [{ id: 'p9', key: 'CINAR', slug: 'CINAR', name: 'Villa Çınar' }] });
  check(wb.SheetNames.join() === 'Giderler,NASIL DOLDURULUR,GEÇERLİ DEĞERLER' && gr.validCount === 0 && gr.invalidCount === gs.length - 1,
    'L-194h Gider sablonu degistirilmeden yuklenirse HICBIR ornek gider yazilmaz (eskiden ALL satiri yaziliyordu)', JSON.stringify({ s: wb.SheetNames, v: gr.validCount }));

  const dl = functionBody(app, 'function downloadSampleTemplate(');
  check(/aoa_to_sheet\(\[headers\]\)/.test(dl) && /GEÇERLİ DEĞERLER/.test(dl) && !/Örnek Misafir/.test(dl) && /SABLON_SUTUNLARI\[mode\]/.test(dl),
    'L-194i Uygulama ici sablonun veri sayfasi yalniz baslik (ornek gercek kayit olarak yazilamaz), basliklar ortak sabitten');

  const PE = require('./chatgpt_prompt_engine.js');
  const istem = PE.buildPrompt({ kind: 'IMPORT_TEMPLATE_CONVERT', today: '2026-10-15', question: 'Çevir', context: { mode: 'BOOKINGS', columns: E.SABLON_SUTUNLARI.BOOKINGS, properties: [{ code: 'zeytin', name: 'Villa Zeytin' }], channels: kanallar, statuses: ['CONFIRMED'] } }).prompt;
  check(istem.includes(E.SABLON_SUTUNLARI.BOOKINGS.join(';')) && /zeytin/.test(istem) && /AIRBNB/.test(istem) && /Değer uydurma/.test(istem) && /EŞLEŞMEYENLER/.test(istem),
    'L-194j "Tablomu sablona cevir" istemi basliklari, gecerli kodlari ve uydurma yasagini tasir');
  check(/openImportConvertPrompt\('BOOKINGS'\)/.test(html) && /openImportConvertPrompt\('EXPENSES'\)/.test(html) && /id="importValidValues"/.test(html)
    && /import_template_guide\.js\?v=/.test(html) && /channels: getBookingChannelCatalog\(\)/.test(app),
    'L-194k Ice aktarma ekrani gecerli degerleri ve ChatGPT dugmelerini gosterir; dogrulama kanal katalogunu alir');
}

// L-195 (M25) — Gecmis temizlik maliyeti: ayri sablon, cleaning_tasks'a "yapildi",
// ayni gun ikinci kayit yok, geri alinabilir (phase95).
async function gecmisTemizlikDavranisi() {
  const E = require('./finance_import_engine.js');
  const h = E.SABLON_SUTUNLARI.CLEANING;
  const map = E.autoDetectColumnMap(h, 'CLEANING');
  const satir = r => Object.fromEntries(h.map((x, i) => [x, r[i]]));
  const ctx = {
    properties: [{ id: 'p1', key: 'zeytin', slug: 'zeytin', name: 'Villa Zeytin' }],
    today: '2026-10-15',
    isPeriodClosed: d => d.startsWith('2026-05'),
    existingCleaningTasks: [{ propertyId: 'p1', date: '2026-09-02', status: 'PLANNED' }, { propertyId: 'p1', date: '2026-09-09', status: 'SKIPPED' }]
  };
  const r = E.validateCleaningRows([
    ['2026-09-01', 'zeytin', '1.200', 'Ayşe', '', 'Çıkış'],
    ['2026-09-09', 'Villa Zeytin', '900', '', 'Hayır', ''],
    ['2026-09-02', 'zeytin', '900', '', '', ''],
    ['2026-11-01', 'zeytin', '900', '', '', ''],
    ['2026-05-10', 'zeytin', '900', '', '', ''],
    ['2026-09-03', 'zeytin', '0', '', '', ''],
    ['2026-09-04', 'zeytin', '700', '', 'Belki', ''],
    ['2026-09-05', 'Bilinmeyen', '700', '', '', ''],
    ['2026-09-01', 'zeytin', '1200', '', '', '']
  ].map(satir), map, ctx);
  const hata = n => (r.errors.find(e => e.rowNum === n) || { errors: [] }).errors.join(' ');
  check(Object.values(map).every(Boolean), 'L-195a Temizlik sablonunun her basligi taniniyor', JSON.stringify(map));
  check(r.validatedRows[0].amount === 1200 && r.validatedRows[0].paid === true && r.validatedRows[0].cleaner === 'Ayşe'
    && r.validatedRows[1].paid === false && r.validatedRows[1].propertyId === 'p1',
    'L-195b Gecerli satir: tutar, odendi (bos = evet, Hayir = borc), mulk adi ya da kodu');
  check(/zaten temizlik kaydı var/.test(hata(4)) && !hata(3), 'L-195c Ayni mulkte ayni gun var olan temizlik ikinci kez yazilmaz; "yapilmadi" gorev engellemez');
  check(/Gelecek tarih/.test(hata(5)) && /kapatılmış/.test(hata(6)) && /sıfır/.test(hata(7)) && /Ödendi" anlaşılamadı/.test(hata(8)) && /Mülk bulunamadı/.test(hata(9)),
    'L-195d Gelecek tarih, kapanmis ay, sifir tutar, anlasilmayan odendi ve bilinmeyen mulk reddedilir', JSON.stringify(r.errors.map(e => e.rowNum)));
  check(r.duplicateCount === 1 && r.validatedRows.filter(v => !v.isPotentialDuplicate).length === 2 && r.totalAmount === 2100,
    'L-195e Dosya icinde ayni mulk-gun ikinci kez sayilmaz; toplam yalniz yazilacaklar', JSON.stringify({ d: r.duplicateCount, t: r.totalAmount }));

  // Yayinlanan sablon kendi ice aktaricimizdan gecer; degistirilmeden yuklenirse hicbir sey yazmaz.
  const csv = E.parseCSV(read('sablonlar/lexbnb-temizlik-sablonu.csv').replace(/^﻿/, ''));
  const tmap = E.autoDetectColumnMap(csv.headers, 'CLEANING');
  const kendi = E.validateCleaningRows(csv.rows, tmap, { properties: [{ id: 'a', key: 'MULK_KODU_1', slug: 'MULK_KODU_1' }, { id: 'b', key: 'MULK_KODU_2', slug: 'MULK_KODU_2' }], today: '2026-10-15' });
  const yabanci = E.validateCleaningRows(csv.rows, tmap, { properties: [{ id: 'c', key: 'CINAR', slug: 'CINAR' }], today: '2026-10-15' });
  check(csv.rows.length === 2 && kendi.validCount === 2 && kendi.validatedRows[1].paid === false && yabanci.validCount === 0,
    'L-195f Yayinlanan temizlik sablonu ice aktaricimizdan gecer; degistirilmeden yuklenirse hicbir satir yazilmaz');

  // Bag satiri temizlik gorevini tasir; rezervasyon/gider bicimi degismedi.
  sahteDom({});
  const App = require('../app.js');
  const ist = kaydedenIstemci();
  App.setSupabaseClient(ist);
  await App.cloudLinkImportBatchRows(TENANT, 'batch-1', 'CLEANING', [{ id: 'ct-1', rowNum: 2 }]);
  await App.cloudLinkImportBatchRows(TENANT, 'batch-1', 'EXPENSES', [{ id: 'ex-1', rowNum: 3 }]);
  const [tem, gid] = ist.yazmalar.map(y => (Array.isArray(y.yuk) ? y.yuk[0] : y.yuk));
  check(tem && tem.cleaning_task_id === 'ct-1' && !('booking_id' in tem) && !('expense_id' in tem)
    && gid && gid.expense_id === 'ex-1' && gid.booking_id === null && !('cleaning_task_id' in gid),
    'L-195g Aktarim bagi temizlikte cleaning_task_id, giderde eski bicim (goc oncesi de calisir)', JSON.stringify(ist.yazmalar.map(y => y.yuk)));

  const app = read('app.js');
  const yaz = functionBody(app, 'async function applyImportedData(');
  check(/temizlikMi \? 'cleaning_tasks'/.test(yaz) && /status: 'DONE'/.test(yaz) && /is_paid: !!v\.paid/.test(yaz)
    && /select\('cleaning_task_id'\)\.limit\(0\)/.test(yaz) && yaz.indexOf("select('cleaning_task_id')") < yaz.indexOf('computeImportContentFingerprint('),
    'L-195h Temizlik cleaning_tasks a "yapildi" yazilir; phase95 yoksa aktarim hic baslamaz');
  check(/validateCleaningRows/.test(functionBody(app, 'function parseSourceWithMode(')) && /'CLEANING'/.test(functionBody(app, 'function analyzeAndPreviewSource('))
    && /deleted_cleaning_tasks/.test(functionBody(app, 'async function undoImportBatch(')),
    'L-195i Tur secimi, otomatik algilama ve geri alma ozeti temizligi tanir');
  const html = read('index.html');
  check(/<option value="CLEANING">/.test(html) && /downloadSampleTemplate\('CLEANING'\)/.test(html) && /lexbnb-temizlik-sablonu\.xlsx/.test(html),
    'L-195j Ice aktarma ekraninda gecmis temizlik turu ve sablonlari var');
  const G = require('./import_template_guide.js');
  check(G.buildGuide('EXPENSES', { categories: [] }).steps.some(s => /Geçmiş Temizlik şablonu/.test(s))
    && G.buildGuide('CLEANING', {}).steps.some(s => /MALİYETİ/.test(s) && /ücreti DEĞİL/.test(s)),
    'L-195k Gider talimati gecmis temizligi yeni sablona yonlendirir; temizlik talimati maliyet ile ucreti ayirir');
}

// L-196 (M26) — Gelir tablosu: ekrandaki defterle ayni rakam, rol kapili.
async function gelirTablosuDavranisi() {
  sahteDom({});
  const App = require('../app.js');
  App.setSupabaseClient(kaydedenIstemci());
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.setAppData({
    villas: { a: { id: 'pa', name: 'Villa A' }, b: { id: 'pb', name: 'Villa B' } },
    bookings: [
      // Ay sinirini kesen rezervasyon: 2 gece Agustos, 3 gece Eylul.
      { id: 'b1', villa: 'a', propertyId: 'pa', checkIn: '2026-08-30', checkOut: '2026-09-04', gross: 50000, cleanFee: 1500, otaComm: 5000, discount: 1000, status: 'CONFIRMED' },
      { id: 'b2', villa: 'b', propertyId: 'pb', checkIn: '2026-09-10', checkOut: '2026-09-12', gross: 20000, cleanFee: 0, otaComm: 0, discount: 0, status: 'CONFIRMED' },
      { id: 'b3', villa: 'b', propertyId: 'pb', checkIn: '2026-10-10', checkOut: '2026-10-12', gross: 9000, cleanFee: 0, otaComm: 0, discount: 0, status: 'CONFIRMED' }
    ],
    expenses: [
      { id: 'e1', villa: 'a', date: '2026-09-05', amount: 3000, type: 'OPEX', category: 'Bakım' },
      { id: 'e2', villa: 'ALL', date: '2026-09-07', amount: 2000, type: 'OPEX', category: 'Fatura' },
      { id: 'e3', villa: 'b', date: '2026-08-20', amount: 10000, type: 'CAPEX', category: 'Diğer' }
    ],
    cleaningTasks: [{ id: 'c1', villa: 'a', propertyId: 'pa', date: '2026-09-04', amount: 1200, status: 'DONE', paid: true }],
    closedPeriods: []
  });

  const ekran = () => App.computeFilterLedger();
  App.setCurrentFilter({ period: '2026-09', villa: 'ALL' });
  let t = App.buildIncomeStatementForFilter();
  let e = ekran();
  check(t.monthly.length === 1 && t.total.netProfit === Math.round(e.netProfit * 100) / 100 && t.total.totalRevenue === Math.round(e.totalRevenue * 100) / 100
    && t.total.soldNights === e.soldNights && t.total.cleaningCost === e.cleaningCost,
    'L-196a Tek ay: gelir tablosu TOPLAM satiri Finans ekranindaki defterle birebir ayni', JSON.stringify({ t: t.total, e }));
  const ortak = t.byProperty.find(r => /ortak/.test(r.label));
  const mulkA = t.byProperty.find(r => r.label === 'Villa A');
  check(ortak && ortak.manualOpex === 2000 && mulkA.manualOpex === 3000 && t.byProperty[t.byProperty.length - 1].label === 'TOPLAM',
    'L-196b Mulk bazinda: ortak gider mulke bolunmez, ayri satirda; toplam en altta');

  App.setCurrentFilter({ period: 'CUSTOM', startDate: '2026-08-15', endDate: '2026-10-11', villa: 'ALL' });
  t = App.buildIncomeStatementForFilter();
  e = ekran();
  const toplamAy = t.monthly.reduce((s, r) => s + r.totalRevenue, 0);
  check(t.monthly.map(r => r.label).join() === 'Ağustos 2026,Eylül 2026,Ekim 2026' && /Kısmi ay/.test(t.monthly[0].note)
    && Math.abs(toplamAy - t.total.totalRevenue) < 0.05 && Math.abs(t.total.totalRevenue - e.totalRevenue) < 0.05,
    'L-196c Ozel aralik: aylara bolunur (uclar kismi), aylar toplami = TOPLAM = ekran', JSON.stringify({ toplamAy, t: t.total.totalRevenue, e: e.totalRevenue }));
  check(t.monthly[0].totalRevenue > 0 && Math.abs(t.monthly[0].netRoomRevenue - (50000 - 1500 - 1000) * 2 / 5) < 0.05,
    'L-196d Ay sinirini kesen rezervasyonun geliri gecelere bolunur (Agustos 2/5 pay)');

  App.setCurrentFilter({ period: '2026-10', villa: 'b' });
  t = App.buildIncomeStatementForFilter();
  check(t.total.netProfit === null && t.total.margin === null && /kâr ölçülemedi/.test(t.total.note) && t.byProperty === null,
    'L-196e Gider yoksa kar ve marj "—" (uydurulmaz); tek mulk gorunumunde mulk sayfasi yok');
  const IS = require('./income_statement.js');
  const sayfa = IS.toSheets(t, {}).find(x => x.name === 'Gelir Tablosu').aoa;
  check(sayfa[sayfa.length - 1].includes('—') && sayfa[0][0] === 'Dönem / Mülk', 'L-196f Excel satirinda olculemeyen kar "—" yazilir');

  App.setCurrentFilter({ period: '2026-09', villa: 'ALL' });
  App.setActiveTenant({ id: TENANT, role: 'sales' });
  check(App.exportIncomeStatement() === false, 'L-196g Satis rolu gelir tablosunu indiremez (can_read_ledger)');
  const app = read('app.js');
  const html = read('index.html');
  check(/data-ledger-only data-onclick="exportIncomeStatement\(\)/.test(html) && /data-ledger-only data-onclick="exportLedger\('EXPENSES'/.test(html)
    && /\[data-ledger-only\][\s\S]{0,80}canReadLedgerRole\(role\)/.test(app) && /income_statement\.js\?v=/.test(html),
    'L-196h Menude "Gelir Tablosunu Indir"; gelir tablosu ve gider defteri finans defteri okuyabilen rollere gorunur (izleyici dahil)');
}

// L-197 (M27) — Rezervasyonlar: takvim ve liste tek donem + mulk secicisi.
async function rezervasyonKapsamDavranisi() {
  const html = read('index.html');
  const app = read('app.js');
  const sekme = (html.match(/<div id="tab-reservations"[\s\S]*?<div id="tab-expenses"/) || [''])[0];
  const cubuk = (sekme.match(/<section class="card reservation-scope-bar"[\s\S]*?<\/section>/) || [''])[0];
  check(!/tapeChartMonthSelect/.test(html) && (sekme.match(/id="rezVillaFilter"/g) || []).length === 1 && (sekme.match(/id="reservationRangeTrigger"/g) || []).length === 1,
    'L-197a Takvimin ayri ay secicisi yok; ekranda tek donem ve tek mulk secicisi var');
  check(/reservationRangeTrigger/.test(cubuk) && /rezVillaFilter/.test(cubuk) && /stepReservationPeriod\(-1\)/.test(cubuk) && /setTapeChartView\('WEEK_1'\)/.test(cubuk)
    && sekme.indexOf('reservation-scope-bar') < sekme.indexOf('tape-chart-card'),
    'L-197b Ortak cubuk takvimin ustunde: onceki/sonraki, donem, mulk, gorunum');
  const ciz = functionBody(app, 'function renderTapeChart(');
  check(/reservationListRange\.start/.test(ciz) && /rezVillaFilter/.test(ciz) && /onReservationScopeChange\(\)/.test(html),
    'L-197c Takvim donemi ve mulku listeyle ayni kaynaktan okur');
}

// L-198 (M28) — Gecmis ay toplu girisi: bitmis ay, iki kez sayma yok, kanal zorunlu.
async function topluGirisDavranisi() {
  const BS = require('./bulk_summary.js');
  const kanallar = [{ code: 'AIRBNB', displayName: 'Airbnb' }, { code: 'WHATSAPP', displayName: 'WhatsApp' }];
  const temel = { propertyId: 'pa', villaKey: 'a', month: '2026-01', nights: 20, gross: '180000', cleaningFee: '', otaCommission: '27000', channel: 'AIRBNB', channels: kanallar, bookings: [], today: '2026-10-15', isMonthClosed: () => false };
  const p = BS.planBulkSummary(temel);
  check(p.ok && p.booking.guest === 'TOPLU AKTARIM — Ocak 2026 (Airbnb)' && p.booking.checkIn === '2026-01-01' && p.booking.checkOut === '2026-01-21'
    && p.booking.gross === 180000 && p.booking.otaCommission === 27000 && p.booking.cleaningFee === 0 && p.booking.channel === 'AIRBNB' && p.booking.status === 'CHECKED_OUT'
    && !('pax' in p.booking),
    'L-198a Toplu ozet: ay basindan gece kadar, kanal kodu, tamamlandi; istemci kisi sayisi gondermez (DB varsayilani L-200)', JSON.stringify(p));
  check(BS.isBulkSummary(p.booking) && require('./guest_crm_engine.js').isBulkSummaryBooking(p.booking),
    'L-198b Uretilen satir tek tanima (isBulkSummaryBooking) uyar: kayit basi metriklere girmez');
  const ikinci = BS.planBulkSummary({ ...temel, nights: 11, channel: 'WHATSAPP', bookings: [{ ...p.booking, id: 'x' }] });
  const fazla = BS.planBulkSummary({ ...temel, nights: 12, channel: 'WHATSAPP', bookings: [{ ...p.booking, id: 'x' }] });
  check(ikinci.ok && ikinci.booking.checkIn === '2026-01-21' && ikinci.booking.checkOut === '2026-02-01' && !fazla.ok && /en çok 11 gece/.test(fazla.error),
    'L-198c Ayni aya ikinci kanal ozeti oncekinden sonra yerlesir; ayin gun sayisi asilamaz', JSON.stringify({ ikinci, fazla }));
  const tekTek = BS.planBulkSummary({ ...temel, bookings: [{ id: 'r1', villa: 'a', propertyId: 'pa', guest: 'Ali', checkIn: '2026-01-10', checkOut: '2026-01-12', status: 'CHECKED_OUT' }] });
  const baskaMulk = BS.planBulkSummary({ ...temel, bookings: [{ id: 'r2', villa: 'b', propertyId: 'pb', guest: 'Ali', checkIn: '2026-01-10', checkOut: '2026-01-12', status: 'CHECKED_OUT' }] });
  check(!tekTek.ok && /iki kez sayılırdı/.test(tekTek.error) && baskaMulk.ok, 'L-198d Tek tek rezervasyonu olan ayda toplu giris reddedilir (yalniz ayni mulk)');
  check(!BS.planBulkSummary({ ...temel, month: '2026-10' }).ok && !BS.planBulkSummary({ ...temel, isMonthClosed: () => true }).ok
    && !BS.planBulkSummary({ ...temel, channel: '' }).ok && !BS.planBulkSummary({ ...temel, gross: '' }).ok
    && !BS.planBulkSummary({ ...temel, cleaningFee: '200000' }).ok && !BS.planBulkSummary({ ...temel, nights: '2.5' }).ok,
    'L-198e Icinde bulunulan ay, kapanmis ay, kanalsiz, tutarsiz, temizlik > brut ve kesirli gece reddedilir');
  check(BS.planBulkSummary({ ...temel, gross: '72500.5' }).booking.gross === 72500.5 && BS.planBulkSummary({ ...temel, gross: '72.500,50' }).booking.gross === 72500.5,
    'L-198f Tutar sayi alani (72500.5) ve Turkce bicim (72.500,50) dogru okunur');

  const app = read('app.js');
  const kaydet = functionBody(app, 'async function saveBulkSummary(');
  check(/planBulkSummary/.test(kaydet) && /from\('bookings'\)\.insert/.test(kaydet) && !/syncBookingCleaningTask/.test(kaydet) && /invalidateExecutiveSnapshotCache/.test(kaydet),
    'L-198g Kayit kurallardan gecer, temizlik gorevi acmaz, ana sayfa onbellegini tazeler');
  const html = read('index.html');
  check(/openBulkSummaryModal\(\)/.test(html) && /id="bulkSummaryModal"/.test(html) && /bulk_summary\.js\?v=/.test(html) && /'bulkVilla'/.test(app),
    'L-198h Rezervasyonlar ekraninda "Gecmis ay toplu girisi"; mulk listesi ortak kaynaktan');
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
  await epostaBaglantisiDavranisi();
  await mulkRaporuDavranisi();
  await mesajAyristiriciDavranisi();
  await temizlikHazirlikDavranisi();
  await asama4Davranisi();
  await cokluMulkTalepDavranisi();
  await aramaDavranisi();
  await temizlikSutunuDavranisi();
  await bildirimDavranisi();
  await talepRolMesajiDavranisi();
  await sablonGecerliDegerDavranisi();
  await gecmisTemizlikDavranisi();
  await gelirTablosuDavranisi();
  await rezervasyonKapsamDavranisi();
  await topluGirisDavranisi();
} catch (error) {
  failed++;
  console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
} finally {
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
}
main();
