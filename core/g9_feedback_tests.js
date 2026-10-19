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
// L-212..L-216 (M41-M45, 9.3): mulk sahibi kaydi, profilin tazelenmesi, kanal ilani listesi, koordinat, fiyat adlari.
// L-217 (M46): Bugun ekraninda doluluk/ADR/RevPAR kartlari, ev ev secilebilir; Finans ile ayni hesap.
// L-226..L-231 (M51-M56, 9.4): kesirli tutar, liste donem payi ve kesintiler, takvim buyutme, kanal bazli kapora, formdan vergi profili, POS komisyonu bellegi.
// L-233..L-240 (M58-M65, 9.5): acilista panel titremesi, saha giris bilgileri, kagit liste duzenleyici, bos/eski kontrol listesi, kapanan temizligin personelden dusmesi, "gerek kalmadi", Operasyon rozeti.
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
  // Kontrol listeleri M60 ile kendi bolumune tasindi; aciklamasi bolum basliginda.
  check((html.match(/settings-template-help/g) || []).length === 2 && /data-settings-section="checklists"[\s\S]{0,900}Bir kâğıt liste gibi yazın/.test(html),
    'L-189b Her sablon bolmesi ve kontrol listesi bolumu ne ise yaradigini soyler');

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

// L-212..L-216 (M41-M45, 9.3) — Mulkler: sahip kaydi, profilin tazelenmesi,
// kanal ilanlarinin listesi, koordinat hassasiyeti, fiyat adlari.
function kanalIstemcisi() {
  const yazmalar = [];
  const rpcler = [];
  const secimler = [];
  const client = {
    yazmalar, rpcler, secimler, guncelSatir: 1,
    rpc: async (ad, args) => { rpcler.push({ ad, args }); return { data: { listingId: 'yeni', reused: false }, error: null }; },
    from(tablo) {
      const k = { tablo, islem: 'select', yuk: null, filtre: [] };
      const q = {
        insert(y) { k.islem = 'insert'; k.yuk = y; yazmalar.push(k); return q; },
        update(y) { k.islem = 'update'; k.yuk = y; yazmalar.push(k); return q; },
        delete() { k.islem = 'delete'; yazmalar.push(k); return q; },
        select(c) { if (k.islem === 'select') secimler.push(tablo); k.kolon = c; return q; },
        eq(c, v) { k.filtre.push([c, v]); return q; }, neq() { return q; }, in() { return q; },
        order() { return q; }, limit() { return q; }, range() { return q; },
        async single() { return { data: { id: 'sahip-yeni' }, error: null }; },
        then(res, rej) {
          const data = k.islem === 'select' ? [] : (k.islem === 'update' ? Array.from({ length: client.guncelSatir }, () => ({ id: 'l1' })) : null);
          return Promise.resolve({ data, error: null }).then(res, rej);
        }
      };
      return q;
    }
  };
  return client;
}

async function mulklerAsama11Davranisi() {
  const PID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const LID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const html = read('index.html');
  const app = read('app.js');

  // L-215 — koordinat: Google Haritalar 15 ondalik verir, alan 6 ondalik kabul eder.
  const PPE = require('./property_profile_engine.js');
  const konum = PPE.readLocationInput('36.794852353716564, 28.24900388719855');
  check(konum.latitude === 36.794852 && konum.longitude === 28.249004,
    'L-215a Yapistirilan uzun koordinat 6 ondaliga yuvarlanir (DB NUMERIC(9,6))', JSON.stringify(konum));
  check(/id="propAnalysisLatitude"[^>]*step="any"/.test(html) && /id="propAnalysisLongitude"[^>]*step="any"/.test(html),
    'L-215b Enlem/boylam alani fazla ondalikta formu durdurmaz (step="any")');

  // L-214 — kanal ilani servisi: ID baglantidan okunur, arsiv olculur, liste ChatGPT icin.
  const KS = require('./marketing_channel_listing_service.js');
  check(KS.deriveListingId('AIRBNB', 'https://www.airbnb.com.tr/rooms/12345678?adults=2') === '12345678'
    && KS.deriveListingId('BOOKING_COM', 'https://www.booking.com/hotel/tr/villa-deniz.tr.html?aid=1') === 'villa-deniz'
    && KS.deriveListingId('VRBO', 'https://www.vrbo.com/1234567ha') === '1234567'
    && KS.deriveListingId('EXPEDIA', 'https://www.expedia.com/Kas-Hotels-Villa.h12345678.Hotel-Information') === '12345678'
    && KS.deriveListingId('DIRECT', 'https://www.villam.com/villa-deniz/') === 'villam.com/villa-deniz'
    && KS.deriveListingId('AIRBNB', 'http://www.airbnb.com/rooms/1') === null,
    'L-214a Ilan ID baglantidan okunur (Airbnb, Booking, Vrbo, Expedia); okunamazsa adres sabit referans olur');
  let gecerli = null;
  try { gecerli = KS.validateInput({ tenantId: TENANT, propertyId: PID, channelCode: 'AIRBNB', externalUrl: 'https://www.airbnb.com.tr/rooms/12345678', payoutCurrency: 'eur' }); } catch (e) { gecerli = e.message; }
  let bos = null;
  try { KS.validateInput({ tenantId: TENANT, propertyId: PID, channelCode: 'AIRBNB' }); } catch (e) { bos = e.message; }
  check(gecerli && gecerli.externalListingId === '12345678' && gecerli.payoutCurrency === 'EUR' && bos === 'CHANNEL_LISTING_REFERENCE_REQUIRED'
    && /bağlantısını ya da ilan ID/.test(KS.errorMessage(new Error(bos))) && KS.CURRENCIES.includes('EUR'),
    'L-214b ID girmeden baglantiyla kaydedilir; ikisi de yoksa anlasilir Turkce hata', JSON.stringify(gecerli));
  const satirlar = [
    { id: LID, property_id: PID, channel_code: 'BOOKING_COM', external_listing_id: 'villa-deniz', display_name: null, external_url: 'https://www.booking.com/hotel/tr/villa-deniz.html', payout_currency: 'EUR', status: 'ACTIVE' },
    { id: 'l2', property_id: PID, channel_code: 'AIRBNB', external_listing_id: '123', display_name: 'Deniz Evi', external_url: 'https://www.airbnb.com/rooms/123', payout_currency: 'TRY', status: 'ACTIVE' },
    { id: 'l3', property_id: PID, channel_code: 'VRBO', external_listing_id: '99', status: 'ARCHIVED' },
    { id: 'l4', property_id: 'baska', channel_code: 'AIRBNB', external_listing_id: '5', status: 'ACTIVE' }
  ];
  const liste = KS.listingsForProperty(satirlar, PID);
  check(liste.map(r => r.id).join(',') === `l2,${LID}`, 'L-214c Mulkun listesi arsivi ve baska mulku dislar, kanal sirasiyla');
  const metin = KS.linkListText('Deniz Evi', liste);
  check(/Airbnb — Deniz Evi: https:\/\/www\.airbnb\.com\/rooms\/123/.test(metin) && /Booking\.com: https:\/\/www\.booking\.com/.test(metin),
    'L-214d ChatGPT icin baglanti listesi kanal ve ad tasir', metin);
  const arsivIst = kanalIstemcisi();
  await KS.archiveChannelListing(arsivIst, { tenantId: TENANT, listingId: LID });
  const arsiv = arsivIst.yazmalar.find(k => k.tablo === 'property_channel_listings' && k.islem === 'update');
  arsivIst.guncelSatir = 0;
  let reddedildi = false;
  try { await KS.archiveChannelListing(arsivIst, { tenantId: TENANT, listingId: LID }); } catch (_) { reddedildi = true; }
  check(arsiv && arsiv.yuk.status === 'ARCHIVED' && arsiv.filtre.some(([c, v]) => c === 'tenant_id' && v === TENANT) && reddedildi,
    'L-214e Arsiv silmez, ARCHIVED yazar; RLS reddi (0 satir) "arsivlendi" sayilmaz');

  // L-214 — mulk profili: Kanallar sekmesi ilanlari listeler, yonetir.
  sahteDom({});
  global.MarketingChannelListingService = KS;
  global.PropertyProfileEngine = PPE;
  global.PropertyAnalysisContextService = require('./property_analysis_context_service.js');
  global.PropertyOwnerService = require('./property_owner_service.js');
  const App = require('../app.js');
  const villa = { id: PID, slug: 'DENIZ', name: 'Deniz Evi', capacity: '6', basePrice: 23000, floor: null, target: 25000, isActive: true, activationDate: '2026-09-01' };
  const kur = (rol = 'owner', ek = {}) => {
    App.setActiveTenant({ id: TENANT, role: rol });
    const ist = kanalIstemcisi();
    App.setSupabaseClient(ist);
    App.setAppData({ villas: { DENIZ: { ...villa } }, bookings: [], expenses: [], cleaningTasks: [], channelListings: satirlar, propertyAnalysisContexts: [], propertyOwners: [], propertyOwnerLinks: [], ...ek });
    return ist;
  };
  kur();
  App.setPropertyProfileTab('CHANNELS');
  let profil = App.renderPropertyProfile('DENIZ');
  check(/Deniz Evi/.test(profil) && /Booking\.com/.test(profil) && /Ödeme: EUR/.test(profil) && /ID: villa-deniz/.test(profil)
    && !/ID: 99/.test(profil) && /İlanı aç/.test(profil) && /archivePropertyChannelListing/.test(profil) && /Bağlantıları kopyala/.test(profil),
    'L-214f Profil Kanallar sekmesi kayitli ilanlari listeler (kanal, ad, ID, para birimi, baglanti)');
  kur('viewer');
  profil = App.renderPropertyProfile('DENIZ');
  check(/Booking\.com/.test(profil) && !/archivePropertyChannelListing|openPropertyChannelForm/.test(profil),
    'L-214g Izleyici ilanlari gorur, ekleyemez/arsivleyemez');
  let ist = kur();
  App.openPropertyChannelForm('DENIZ');
  profil = App.renderPropertyProfile('DENIZ');
  check(/id="channelListingUrl"/.test(profil) && /<select id="channelListingCurrency">/.test(profil) && /Booking\.com EUR ödüyorsa/.test(profil) && /\/rooms\/ sonrası sayı/.test(profil),
    'L-214h Form ID ve para birimini aciklar; para birimi secimli (TRY/EUR/USD/GBP)');
  sahteDom({ channelListingCode: 'BOOKING_COM', channelListingUrl: 'https://www.booking.com/hotel/tr/villa-deniz.html', channelListingId: '', channelListingName: '', channelListingCurrency: 'EUR' });
  const kaydedildi = await App.savePropertyChannelListing('DENIZ');
  const rpc = ist.rpcler.find(r => r.ad === 'save_property_channel_listing');
  check(kaydedildi === true && rpc && rpc.args.p_property_id === PID && rpc.args.p_external_listing_id === 'villa-deniz' && rpc.args.p_payout_currency === 'EUR'
    && ist.secimler.includes('property_channel_listings'),
    'L-214i Profilden kayit korumali RPC ile yazar ve listeyi yeniden okur', JSON.stringify(rpc));
  check(/'property_channel_listings'\)\.select\(CHANNEL_LISTING_COLUMNS\)/.test(functionBody(app, 'async function loadTenantAppData(')) || /from\('property_channel_listings'\)\.select\(CHANNEL_LISTING_COLUMNS\)\.eq\('tenant_id', tenantId\)/.test(app),
    'L-214j Kiraci yuklemesi kanal ilanlarini okur (can_read_sales)');
  const otaUi = read('core/property_analysis_context_ui.js');
  check(!/openMarketingListingManager\(/.test(functionBody(otaUi, 'function openPropertyOtaManager(')) && /openPropertyChannelForm\(villaKey\)/.test(otaUi)
    && /id="propOtaSummary"/.test(html) && /marketing_channel_listing_service\.js\?v=/.test(html),
    'L-214k Mulk formundaki "OTA baglantilarini yonet" profilin Kanallar sekmesini acar; formda kayitli ilanlar yazar');

  // L-212 — mulk sahibi kaydi (form vardi, yazan kod yoktu).
  ist = kur();
  sahteDom({ propOwnerId: '', propOwnerName: 'TEST Mehmet', propOwnerPhone: '05320000000', propOwnerEmail: '' });
  await App.savePropertyOwnerFromForm(PID);
  const sahip = ist.yazmalar.find(k => k.tablo === 'property_owners' && k.islem === 'insert');
  const bag = ist.yazmalar.find(k => k.tablo === 'property_owner_links' && k.islem === 'insert');
  check(sahip && sahip.yuk.full_name === 'TEST Mehmet' && sahip.yuk.tenant_id === TENANT && bag && bag.yuk.property_id === PID && bag.yuk.owner_id === 'sahip-yeni',
    'L-212a Yeni sahip adi property_owners + property_owner_links tablolarina yazilir');
  ist = kur('owner', { propertyOwnerLinks: [{ property_id: PID, owner_id: 'o1' }] });
  sahteDom({ propOwnerId: 'o1', propOwnerName: '' });
  await App.savePropertyOwnerFromForm(PID);
  const degismedi = ist.yazmalar.length === 0;
  sahteDom({ propOwnerId: '', propOwnerName: '' });
  await App.savePropertyOwnerFromForm(PID);
  const kaldir = ist.yazmalar.find(k => k.tablo === 'property_owner_links' && k.islem === 'delete');
  check(degismedi && kaldir && kaldir.filtre.some(([c, v]) => c === 'property_id' && v === PID),
    'L-212b Degismeyen secim yazmaz; "belirtilmedi" secilirse bag kaldirilir');
  ist = kur('viewer');
  sahteDom({ propOwnerId: '', propOwnerName: 'TEST Mehmet' });
  await App.savePropertyOwnerFromForm(PID);
  check(ist.yazmalar.length === 0, 'L-212c Yonetim yetkisi olmayan rol sahip yazmaz');

  // L-213 — kayittan sonra profil bellekteki eski kopyayi gostermez.
  const kaydet = functionBody(app, 'async function saveProperty(');
  check(/savePropertyOwnerFromForm\(savedProperty\.id\)/.test(kaydet) && /refreshPropertyProfileRows\(\)/.test(kaydet)
    && kaydet.indexOf('refreshPropertyProfileRows') < kaydet.indexOf('renderAll()'),
    'L-213a Mulk kaydi sahibi yazar ve profil satirlarini ekrani cizmeden once yeniden okur');
  kur('owner', { propertyAnalysisContexts: [{ property_id: PID, city: 'Fethiye', district_region: 'Ölüdeniz', country_code: 'TR', latitude: 36.794852, longitude: 28.249004 }] });
  App.setPropertyProfileTab('GENERAL');
  profil = App.renderPropertyProfile('DENIZ');
  check(/Ölüdeniz, Fethiye/.test(profil) && /36\.794852, 28\.249004/.test(profil), 'L-213b Profil Genel sekmesi konumu (ilce, sehir, ulke) ve koordinati gosterir');

  // L-216 — fiyat adlari: formdaki "taban" baz fiyata yaziliyordu.
  check(!/Gecelik Taban Fiyat/.test(html) && (html.match(/Gecelik Baz Fiyat/g) || []).length === 2,
    'L-216a Mulk ve ilk mulk formu baz fiyati "Baz fiyat" diye sorar');
  kur();
  App.renderPropertiesTab();
  const kart = global.document.getElementById('propertiesManagementGrid').innerHTML;
  check(/Baz fiyat/.test(kart) && /₺23\.000/.test(kart) && /Taban fiyat/.test(kart) && /Hedef fiyat/.test(kart) && /₺25\.000/.test(kart),
    'L-216b Mulk karti baz, taban ve hedef fiyati yan yana gosterir', kart.slice(0, 400));
  App.setPropertyProfileTab('PRICES');
  profil = App.renderPropertyProfile('DENIZ');
  check(/asla altına inmeyeceğiniz/.test(profil) && /Hiçbiri sabit değildir/.test(profil), 'L-216c Fiyatlar sekmesi baz/taban/hedef farkini ve sabit olmadiklarini aciklar');
}

// L-217 (M46) — Bugun ekraninda Finans'in doluluk / ADR / RevPAR kartlari, ev ev.
// M47–M49 (L-218…L-220) — talep ekrani: ek mulk secimi okunur, kanban karti
// kompakt, duzenleme penceresi hizli formdan gelen talebi kaydedebilir, liste yerinde acilir.
async function talepEkraniDavranisi() {
  sahteDom({});
  const App = require('../app.js');
  const PA = 'aaaaaaaa-0000-4000-8000-0000000000a1', PB = 'aaaaaaaa-0000-4000-8000-0000000000b1';
  const LEAD = 'cccccccc-0000-4000-8000-0000000000a1';
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  const ist = kaydedenIstemci();
  App.setSupabaseClient(ist);
  // Hizli formdan gelen talep: ad yok, teklif yok, mulk yok, durum Yeni.
  const talep = { id: LEAD, dbId: LEAD, villa: 'ALL', propertyId: null, guest: 'Ad girilmedi (05339294514)', guestName: '', phone: '05339294514',
    channel: 'WhatsApp', quote: 0, status: 'NEW', stage: 'NEW', notes: '', extraPropertyIds: [] };
  App.setAppData({ villas: { A: { id: PA, slug: 'A', name: 'TEST A' }, B: { id: PB, slug: 'B', name: 'TEST B' } },
    leads: [talep], leadSources: [], leadAcquisitions: [], leadWorkflows: [], salesMembers: [], bookings: [], expenses: [], cleaningTasks: [] });

  const kart = App.renderLeadCard({ ...talep, sourceLabel: 'TEST Kaynak' });
  check(/lead-card-name[^>]*>05339294514</.test(kart) && !/Ad girilmedi \(/.test(kart) && /lead-card-quote[^>]*>—</.test(kart),
    'L-219a Kart adsiz talepte telefonu ad yerine yazar, teklif yoksa "—"', kart);

  App.openLeadModal(LEAD);
  const d = id => global.document.getElementById(id).value;
  check(d('leadStatus') === 'NEW' && d('leadQuote') === '' && d('leadGuest') === '' && d('leadVilla') === 'ALL',
    'L-219b Pencere Yeni durumu, bos teklifi, bos adi ve "belli degil" mulku dogru acar',
    JSON.stringify({ s: d('leadStatus'), q: d('leadQuote'), g: d('leadGuest'), v: d('leadVilla') }));

  global.document.getElementById('leadVilla').value = 'B';
  global.document.getElementById('leadStatus').value = 'CONTACTED';
  await App.saveLead({ preventDefault() {} });
  const yazma = ist.yazmalar.find(k => k.tablo === 'leads' && k.islem === 'update');
  check(yazma && yazma.yuk.property_id === PB && yazma.yuk.status === 'CONTACTED' && yazma.yuk.guest_name === null
    && yazma.yuk.guest_phone === '05339294514' && yazma.yuk.quote_amount === 0,
    'L-219c Kaydet secilen mulku ve durumu yazar; "Ad girilmedi" isim olarak yazilmaz', JSON.stringify(yazma && yazma.yuk));

  const html = read('index.html');
  const css = read('style.css');
  const app = read('app.js');
  const durum = (html.match(/<select id="leadStatus">[\s\S]*?<\/select>/) || [''])[0];
  check(/value="NEW"/.test(durum) && /value="CONTACTED"/.test(durum), 'L-219d Durum listesinde Yeni ve Gorusuldu var');
  check(!/id="leadQuote"[^>]*required/.test(html) && !/id="leadVilla"[^>]*required/.test(html) && !/id="leadGuest"[^>]*required/.test(html),
    'L-219e Teklif, mulk ve ad hizli talepte bos olabilir; kaydi engellemez');
  check(/selectId === 'leadVilla'[\s\S]{0,120}optUnknown\.value = 'ALL'/.test(functionBody(app, 'function updateAllVillaDropdowns(')),
    'L-219f Mulk listesinde "Henuz belli degil" secenegi var');
  check(/\.lead-extra-properties input\[type="checkbox"\][^}]*min-height: 0/.test(css) && /\.lead-extra-properties \.lead-extra-property \{[^}]*margin: 0/.test(css),
    'L-218 Ek mulk onay kutusu hizli formun 40px tam genislik kuralindan cikar, ad okunur');
  const calisma = html.slice(html.indexOf('id="leadWorkspaceTitle"'), html.indexOf('</section>', html.indexOf('id="leadKanbanContainer"')));
  check(/id="leadLegacyListSection"/.test(calisma) && /id="manageLeadsTableBody"/.test(calisma),
    'L-220a Liste gorunumu kanbanin yerinde (satis hunisi kartinin icinde) acilir');
  const liste = functionBody(app, 'function renderManageLeadsTable(');
  check(/getLeadSalesView\(\)\.rows/.test(liste) && /leadQuoteLabel\(l\)/.test(liste) && /LEAD_STATUS_LABELS\[/.test(liste),
    'L-220b Liste kanbanla ayni satirlar; Turkce durum, teklif yoksa "—"');
  check(/renderLeadSalesWorkspace\(\)/.test(functionBody(app, 'async function deleteLeadUI(')) && /renderLeadSalesWorkspace\(\)/.test(functionBody(app, 'async function saveLead(')),
    'L-220c Silme ve kaydetme kanbani da yeniler');
}

// M50 (L-221) — rezervasyondaki kisi misafir defterine eklenebilir.
async function rezervasyondanMisafirDavranisi() {
  Object.assign(global, require('./guest_contact_utils.js'));
  sahteDom({});
  const App = require('../app.js');
  const P = 'aaaaaaaa-0000-4000-8000-0000000000c1';
  const B1 = 'dddddddd-0000-4000-8000-000000000001', B2 = 'dddddddd-0000-4000-8000-000000000002';
  const B3 = 'dddddddd-0000-4000-8000-000000000003', B4 = 'dddddddd-0000-4000-8000-000000000004', B5 = 'dddddddd-0000-4000-8000-000000000005';
  const rpcCagrilari = [];
  const ist = kaydedenIstemci();
  ist.rpc = async (ad, arg) => {
    rpcCagrilari.push({ ad, arg });
    return { data: { id: 'eeeeeeee-0000-4000-8000-000000000001', tenant_id: TENANT, first_name: arg.p_first_name, last_name: arg.p_last_name, phone: arg.p_phone, email: arg.p_email }, error: null };
  };
  const kur = rol => {
    App.setActiveTenant({ id: TENANT, role: rol });
    App.setSupabaseClient(ist);
    App.setAppData({ villas: { V: { id: P, slug: 'V', name: 'TEST Ev' } }, guests: [], leads: [], expenses: [], cleaningTasks: [],
      bookings: [
        { id: B1, villa: 'V', guest: 'Onur Bey', phone: '0532 111 22 33', checkIn: '2026-10-10', checkOut: '2026-10-12', status: 'CONFIRMED' },
        { id: B2, villa: 'V', guest: 'Bağlı Misafir', phone: '05320000000', primaryGuestId: 'eeeeeeee-0000-4000-8000-000000000009', checkIn: '2026-10-09', checkOut: '2026-10-10', status: 'CONFIRMED' },
        { id: B3, villa: 'V', guest: 'TOPLU AKTARIM — Ocak 2026', checkIn: '2026-01-01', checkOut: '2026-01-20', status: 'CONFIRMED' },
        { id: B4, villa: 'V', guest: 'İptal Misafir', phone: '05321112233', checkIn: '2026-10-05', checkOut: '2026-10-06', status: 'CANCELLED' },
        { id: B5, villa: 'V', guest: 'Telefonsuz Misafir', phone: '', checkIn: '2026-10-01', checkOut: '2026-10-03', status: 'CONFIRMED' }
      ] });
  };

  kur('owner');
  App.toggleGuestUnlinkedPanel();
  const panel = global.document.getElementById('guestUnlinkedPanel');
  check(panel.hidden === false && /Onur Bey/.test(panel.innerHTML) && /Telefonsuz Misafir/.test(panel.innerHTML)
    && !/Bağlı Misafir|TOPLU AKTARIM|İptal Misafir/.test(panel.innerHTML) && /Telefonu olan 1 rezervasyonu ekle/.test(panel.innerHTML),
    'L-221a Panel yalniz bagsiz, iptal olmayan, gercek rezervasyonlari listeler; telefonu olanlari sayar', panel.innerHTML.slice(0, 300));
  check(/Rezervasyonlardan misafir ekle|Paneli kapat/.test(global.document.getElementById('guestDataNotice').innerHTML),
    'L-221b Misafirler uyarisi paneli acan dugmeyi tasir');

  const d = (id, v) => { global.document.getElementById(id).value = v; };
  d('guestLinkName_0', 'Onur Bey'); d('guestLinkPhone_0', '0532 111 22 33'); d('guestLinkEmail_0', '');
  check(await App.linkUnlinkedBookingGuest(0) === true, 'L-221c Ekle basarili doner', global.__sonUyari);
  const cagri = rpcCagrilari.find(c => c.ad === 'upsert_booking_guest_atomic');
  check(cagri && cagri.arg.p_booking_id === B1 && cagri.arg.p_phone === '+905321112233' && cagri.arg.p_first_name === 'Onur' && cagri.arg.p_last_name === 'Bey',
    'L-221d Ekle rezervasyonu telefonla misafir defterine baglar (sunucu ayni telefonu tekrar acmaz)', JSON.stringify(cagri && cagri.arg));
  check(App.getAppData().bookings.find(b => b.id === B1).primaryGuestId === 'eeeeeeee-0000-4000-8000-000000000001',
    'L-221e Baglanan rezervasyon panelden duser');

  rpcCagrilari.length = 0;
  global.__sonUyari = '';
  App.toggleGuestUnlinkedPanel(); App.toggleGuestUnlinkedPanel();
  d('guestLinkName_0', 'Telefonsuz Misafir'); d('guestLinkPhone_0', ''); d('guestLinkEmail_0', '');
  check(await App.linkUnlinkedBookingGuest(0) === false && rpcCagrilari.length === 0 && /telefon veya e-posta/.test(global.__sonUyari),
    'L-221f Telefon ve e-posta yoksa sunucuya gidilmez, ne gerektigi soylenir', global.__sonUyari);

  kur('viewer');
  App.renderGuestsTab();
  check(global.document.getElementById('guestUnlinkedPanel').hidden === true, 'L-221g Izleyici paneli gormez (satis yazma rolu yok)');

  const html = read('index.html');
  const ayrinti = (html.match(/<details class="booking-optional-details">[\s\S]*?<\/details>/) || [''])[0];
  check(/id="resGuestPhone"/.test(html) && !/id="resGuestPhone"/.test(ayrinti) && !/id="resGuestEmail"/.test(ayrinti),
    'L-221h Rezervasyon formunda telefon/e-posta "Istege bagli ayrintilar" icinde saklanmaz');
  const eylem = read('core/action_dispatch.js');
  check(['toggleGuestUnlinkedPanel', 'linkUnlinkedBookingGuest', 'linkAllUnlinkedBookingsWithPhone'].every(ad => eylem.includes(`'${ad}'`)),
    'L-221i Panel eylemleri izin listesinde');
}

async function bugunPerformansDavranisi() {
  sahteDom({});
  global.FinancialMetricsService = require('./financial_metrics_service.js');
  const App = require('../app.js');
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-00000000000a';
  const B = 'aaaaaaaa-aaaa-4aaa-8aaa-00000000000b';
  const kur = (rol, ekRezervasyon = []) => {
    App.setActiveTenant({ id: TENANT, role: rol });
    App.setAppData({
      villas: {
        DENIZ: { id: A, slug: 'DENIZ', name: 'Deniz Evi', isActive: true, activationDate: '2026-01-01' },
        ORMAN: { id: B, slug: 'ORMAN', name: 'Orman Evi', isActive: true, activationDate: '2026-03-17' }
      },
      bookings: [
        // 10 gece, 55.000 brut, 5.000 temizlik ucreti -> 50.000 net konaklama.
        { id: 'r1', villa: 'DENIZ', propertyId: A, guest: 'Ali', checkIn: '2026-03-10', checkOut: '2026-03-20', gross: 55000, cleanFee: 5000, otaComm: 0, discount: 0, status: 'CHECKED_OUT' },
        // Ay sinirini kesiyor: 5 gecenin 4'u Mart'ta -> 8.000 (tahakkuk).
        { id: 'r2', villa: 'ORMAN', propertyId: B, guest: 'Ayse', checkIn: '2026-03-28', checkOut: '2026-04-02', gross: 10000, cleanFee: 0, otaComm: 0, discount: 0, status: 'CHECKED_OUT' },
        { id: 'r3', villa: 'DENIZ', propertyId: A, guest: 'Iptal', checkIn: '2026-03-01', checkOut: '2026-03-05', gross: 99000, cleanFee: 0, otaComm: 0, discount: 0, status: 'CANCELLED' },
        ...ekRezervasyon
      ],
      expenses: [], cleaningTasks: [], maintenance: []
    });
  };
  kur('owner');
  const deniz = App.computeMonthPerformance('2026-03', 'DENIZ');
  const orman = App.computeMonthPerformance('2026-03', 'ORMAN');
  const tumu = App.computeMonthPerformance('2026-03', 'ALL');
  check(deniz.nights === 10 && deniz.available === 31 && deniz.occupancy === 32.3 && deniz.adr === 5000 && deniz.revpar === 1613,
    'L-217a Tek mulk: doluluk 10/31, ADR = net konaklama / gece, RevPAR = net konaklama / satilabilir gece', JSON.stringify(deniz));
  check(orman.nights === 4 && orman.available === 15 && orman.occupancy === 26.7 && orman.adr === 2000 && orman.revpar === 533,
    'L-217b Ay ortasinda faaliyete baslayan mulk: kapasite baslama gununden, ay sinirini kesen rezervasyonun payi', JSON.stringify(orman));
  check(tumu.nights === 14 && tumu.available === 46 && tumu.occupancy === 30.4 && tumu.adr === 4143 && tumu.revpar === 1261,
    'L-217c Portfoy toplami ev ev toplamdan (iptal haric)', JSON.stringify(tumu));
  const bos = App.computeMonthPerformance('2025-12', 'ORMAN');
  check(bos.available === 0 && bos.occupancy === null && bos.revpar === null && bos.adr === null,
    'L-217d Faaliyette olmayan ayda doluluk/ADR/RevPAR uydurulmaz (null -> "—")', JSON.stringify(bos));

  // Ekran: Bugun, bu ay; secici ev ev degistirir; Finans defterini okumayan rolde gizli.
  const buAy = App.getCurrentMonthKey();
  kur('owner', [{ id: 'r4', villa: 'DENIZ', propertyId: A, guest: 'Bu ay', checkIn: `${buAy}-02`, checkOut: `${buAy}-05`, gross: 30000, cleanFee: 0, otaComm: 0, discount: 0, status: 'CONFIRMED' }]);
  App.setTodayPerformanceVilla('ALL');
  const kartlar = () => global.document.getElementById('todayPerformanceCards').innerHTML;
  const liste = () => global.document.getElementById('todayPerformanceList').innerHTML;
  const portfoy = App.computeMonthPerformance(buAy, 'ALL');
  check(global.document.getElementById('todayPerformance').hidden === false && /Doluluk/.test(kartlar()) && /ADR/.test(kartlar()) && /RevPAR/.test(kartlar())
    && kartlar().includes(`%${portfoy.occupancy.toLocaleString('tr-TR')}`) && /Deniz Evi/.test(liste()) && /Orman Evi/.test(liste()),
    'L-217e Bugun: "Tum mulkler" portfoy kartlari ve ev ev liste', kartlar().slice(0, 300));
  App.setTodayPerformanceVilla('DENIZ');
  const tek = App.computeMonthPerformance(buAy, 'DENIZ');
  check(kartlar().includes('₺10.000') && kartlar().includes(`%${tek.occupancy.toLocaleString('tr-TR')}`) && liste() === ''
    && /Deniz Evi/.test(global.document.getElementById('todayPerformancePeriod').textContent || global.document.getElementById('todayPerformancePeriod').innerText || ''),
    'L-217f Ev secilince kartlar o evin rakamlarini gosterir (ADR 30.000 / 3 gece)', kartlar().slice(0, 300));
  for (const rol of ['sales', 'staff']) {
    kur(rol);
    App.renderTodayPerformance();
    check(global.document.getElementById('todayPerformance').hidden === true, `L-217g ${rol} rolunde finans kartlari gizli (§3.3.1)`);
  }
  const app = read('app.js');
  const html = read('index.html');
  check(/computeMonthPerformance\(m, secili\)/.test(functionBody(app, 'function getMonthlyKpiDataset(')) && /'todayPerfVilla'/.test(functionBody(app, 'function updateAllVillaDropdowns('))
    && /renderTodayPerformance\(\)/.test(functionBody(app, 'function renderExecutiveControlCenter(')) && /id="todayPerfVilla"[^>]*setTodayPerformanceVilla/.test(html),
    'L-217h Finans aylik tablosu ve Bugun ayni fonksiyondan; mulk listesi ortak doldurucudan');
  // Finans ust seridindeki Portfoy etiketi secilebilir olmali (kullanici, 19.10.2026)
  check(/<select id="finTopVillaFilter" data-onchange="filterByVilla\(this\.value\)"/.test(html)
    && /'finTopVillaFilter'/.test(functionBody(app, 'function updateAllVillaDropdowns('))
    && /finTopVillaFilter[\s\S]{0,80}currentFilter\.villa/.test(functionBody(app, 'function updateStepperLabels(')),
    'L-223 Finans Portfoy secicisi ortak filtreye bagli; listesi ortak doldurucudan, degeri filtreyle esit');
  // "Diger > Detay" bos liste aciyordu: grafik eslemeyle topluyor, arama ham metne bakiyordu
  check(/eslesenGiderKategorisi\(exp\.category\)\.toLowerCase\(\)\.includes\(search\)/.test(functionBody(app, 'function renderExpensesTable(')),
    'L-224a Gider defteri aramasi grafikle ayni kategori eslemesini kullanir');
  const satirlar = functionBody(app, 'function expenseCategoryRowsHtml(');
  check(/eslesenGiderKategorisi\(exp\.category\) === catName/.test(satirlar) && /isExpenseInFilter\(exp\)/.test(satirlar)
    && /editExpense\(/.test(satirlar) && /deleteExpenseUI\(/.test(satirlar) && /canManageTenantRole/.test(satirlar)
    && /toggleExpenseCategoryRows\(cat\.name\)/.test(functionBody(app, 'function renderExpenseDonutAndTable(')),
    'L-224b Gider analizi kategorisi yerinde acilir; kayit oradan duzenlenir/silinir (yalniz yonetim rolu)');
  // Gelir ekleme (phase97, kullanici 19.10.2026): iki secenek, rezervasyon dogrudan rezervasyon formu
  check(/startIncomeEntry\('BOOKING'\)[^<]*Rezervasyon/.test(html) && /startIncomeEntry\('OTHER'\)/.test(html)
    && /if \(kind === 'BOOKING'\) return openBookingModal\(\);/.test(functionBody(app, 'function startIncomeEntry(')),
    'L-225a "+ Gelir Ekle" iki secenek sunar; Rezervasyon dogrudan rezervasyon formunu acar');
  check(/<input type="text" id="incDesc"[^>]*required/.test(html) && /value="CAPITAL"/.test(html) && /value="OTHER_INCOME"/.test(html)
    && /Açıklama zorunludur/.test(functionBody(app, 'async function saveIncomeEntry(')),
    'L-225b Gelir formu diger gelir / sermaye turu ve zorunlu aciklama tasir');
  check((app.match(/incomes: appData\.incomeEntries \|\| \[\],/g) || []).length === 3
    && /renderIncomeSection\(ledger\)/.test(functionBody(app, 'function renderFinanceModule(')),
    'L-225c Finans, aylik ve aralik defterleri gelir kayitlarini ayni sozlesmeden okur');
  const kaydet = functionBody(app, 'async function saveIncomeEntry(');
  check(/requireCloudForWrite\('Gelir'/.test(kaydet) && /canManageTenantRole/.test(kaydet) && /isPeriodClosed/.test(kaydet)
    && /PHASE97_SEMA_YOK/.test(kaydet),
    'L-225d Gelir yazmasi bulut zorunlu, yalniz yonetim, kapali donemde durur, goc yoksa soyler');
}

// L-226..L-231 (M51-M56, Gorev 9.4 Rezervasyon ve odeme, 19.10).
async function rezervasyonOdemeDavranisi() {
  const html = read('index.html');
  const app = read('app.js');
  const fin = read('core/booking_finance_ui.js');

  // L-226 (M51): kesirli tutar tarayici dogrulamasina takiliyordu (5812,5 "gecersiz").
  const adimsiz = (html.match(/<input[^>]*type="number"[^>]*>/g) || []).filter(t => !/step=/.test(t))
    .map(t => (t.match(/id="([^"]+)"/) || [])[1]).filter(id => !['goalOccupancyNights', 'waParsedPax'].includes(id));
  const komisyon = (html.match(/<input[^>]*id="resCommission"[^>]*>/) || [''])[0];
  check(adimsiz.length === 0 && /step="0\.01"/.test(komisyon) && /min="0"/.test(komisyon)
    && (app.match(/type="number" step="0\.01" min="0" class="tbl-input" id="set_/g) || []).length === 7,
    'L-226 Tutar alanlari kurus kabul eder (step 0.01); yalniz gece/kisi sayisi tam sayi', adimsiz.join(', '));

  sahteDom({});
  const App = require('../app.js');
  App.setAppData({ villas: {}, bookings: [], cleaningTasks: [], expenses: [], bookingChannels: [] });

  // L-227 (M52): liste brutu tam tutarla yaziyordu; kesintiler gorunmuyordu.
  const ayse = { id: 'ayse', checkIn: '2026-10-10', checkOut: '2026-10-13', gross: 40000, discount: 2500, cleanFee: 0, otaComm: 5812.5, status: 'CONFIRMED' };
  const ayseGorev = { bookingId: 'ayse', status: 'PLANNED', amount: 2500, date: '2026-10-13' };
  const murtaza = { id: 'murtaza', checkIn: '2026-10-30', checkOut: '2026-11-03', gross: 40000, discount: 0, cleanFee: 0, otaComm: 0, status: 'CONFIRMED' };
  const murtazaGorev = { bookingId: 'murtaza', status: 'PLANNED', amount: 2500, date: '2026-11-03' };
  const a = App.computeReservationRowEconomics(ayse, ayseGorev, '2026-10-01', '2026-10-31');
  check(a.gross === 40000 && a.netRoomRevenue === 37500 && a.discount === 2500 && a.commission === 5812.5 && a.cleaningCost === 2500 && a.remaining === 29187.5,
    'L-227a Satir: brut, indirim, komisyon, temizlik ve kalan onizlemeyle ayni (29.187,50)', JSON.stringify(a));
  const ekim = App.computeReservationRowEconomics(murtaza, murtazaGorev, '2026-10-01', '2026-10-31');
  const kasim = App.computeReservationRowEconomics(murtaza, murtazaGorev, '2026-11-01', '2026-11-30');
  check(ekim.gross === 20000 && kasim.gross === 20000 && ekim.nights === 2 && ekim.totalNights === 4 && ekim.netRoomRevenue === 20000,
    'L-227b Ay sinirini kesen rezervasyon her ayda yalniz kendi gecelerinin brutunu gosterir (20.000 + 20.000)', JSON.stringify({ ekim, kasim }));
  check(ekim.cleaningCost === 0 && ekim.cleaning.inRange === false && kasim.cleaningCost === 2500 && ekim.remaining === 20000 && kasim.remaining === 17500,
    'L-227c Temizlik maliyeti defterdeki gibi gorev gununun ayindan dusulur, iki kez dusulmez');
  const iptal = App.computeReservationRowEconomics({ ...ayse, status: 'CANCELLED' }, ayseGorev, '2026-10-01', '2026-10-31');
  check(iptal.cancelled && iptal.gross === 0 && iptal.remaining === 0 && iptal.cleaningCost === 0, 'L-227d Iptal satiri hesaba girmez');
  const ozet = App.computeReservationListSummary({ rows: [{ booking: ayse, cleaningTask: ayseGorev }, { booking: murtaza, cleaningTask: murtazaGorev }], rangeStart: '2026-10-01', rangeEnd: '2026-10-31' });
  check(ozet.netRoomRevenue === 57500 && ozet.gross === 60000 && ozet.deductions === 2500 + 5812.5 + 2500 && ozet.remaining === 49187.5,
    'L-227e Liste ozeti: brut 60.000, ciro 57.500, kesintiler, kalan satirlarin toplami', JSON.stringify(ozet));
  // Gercek render: satirda donem payi, ciro, kesintiler ve kalan yazilir.
  const ay = App.getCurrentMonthKey();
  App.setAppData({ villas: { V: { id: 'p1', name: 'TEST Villa' } }, expenses: [], bookingChannels: [], bookingPayments: [], bookingPaymentBalances: [],
    bookings: [{ ...ayse, villa: 'V', guest: 'TEST Ayşe', channel: 'AIRBNB', checkIn: ay + '-10', checkOut: ay + '-13' }],
    cleaningTasks: [{ ...ayseGorev, date: ay + '-13' }] });
  const satirlar = [];
  global.document.getElementById('manageBookingsTableBody').appendChild = c => { satirlar.push(c.innerHTML); return c; };
  App.resetReservationRange();
  const satir = satirlar.join('');
  const pill = global.document.getElementById('rezTableSummaryPill').innerHTML;
  check(/data-label="Ciro"/.test(satir) && /data-label="Kesintiler"/.test(satir) && /İndirim −2\.500 ₺/.test(satir) && /Komisyon −5\.812,5 ₺/.test(satir)
    && /Temizlik −2\.500 ₺ \(planlı\)/.test(satir) && /29\.187,5 ₺/.test(satir),
    'L-227f Liste satiri ciro, indirim, komisyon, planli temizlik ve kalani gosterir', satir.slice(0, 600));
  check(/Ciro \(oda geliri, indirim sonrası\): <strong>37\.500 TL<\/strong>/.test(pill) && /Brüt \(bu döneme düşen\): 40\.000 TL/.test(pill) && /Kalan \(tahmini\)/.test(pill),
    'L-227g Ozet cubugu brut, ciro (indirim sonrasi), kesinti ve kalani ayri yazar', pill);
  check((html.match(/<th[^>]*>(BRÜT \(₺\)|CİRO \(₺\)|KESİNTİLER|KALAN \(₺\))<\/th>/g) || []).length === 4 && /colspan="9"/.test(app),
    'L-227h Tablo basliklari ve bos durum yeni sutun sayisiyla uyumlu');
  const panel = functionBody(app, 'function openBookingDetailsPanel(');
  check(/computeReservationRowEconomics\(booking, cleaning/.test(panel) && /'İndirim'/.test(panel) && /Kalan \(tahmini\)/.test(panel) && !/'Net oda geliri'/.test(panel),
    'L-227i Rezervasyon ayrintisi ayni hesapla indirim, komisyon, temizlik maliyeti ve kalani gosterir');

  // L-228 (M53): takvim kucuk kaliyordu.
  const ciz = functionBody(app, 'function renderTapeChart(');
  check(/id="tapeZoomBtn"[^>]*data-onclick="toggleTapeChartZoom\(\)"/.test(html) && /classList\.toggle\('tape-zoom', tapeChartZoom\)/.test(ciz)
    && /\.tape-zoom \.tape-cell \{ height: 58px; \}/.test(read('style.css')) && read('core/action_dispatch.js').includes("'toggleTapeChartZoom'"),
    'L-228 Takvim "Büyüt" dugmesiyle yakinlasir; tercih tarayicida kalir');

  // L-229 (M54): OTA'da kapora sorulmamali; kanal bazli ayar.
  App.setAppData({ villas: {}, bookings: [], bookingChannels: [], tenantSettings: {} });
  const varsayilan = [App.channelTakesDeposit('AIRBNB'), App.channelTakesDeposit('BOOKING'), App.channelTakesDeposit('WHATSAPP')];
  App.setAppData({ villas: {}, bookings: [], bookingChannels: [], tenantSettings: { booking_deposit_channels: { AIRBNB: true, WHATSAPP: false } } });
  const ayarli = [App.channelTakesDeposit('AIRBNB'), App.channelTakesDeposit('WHATSAPP'), App.channelTakesDeposit('BOOKING')];
  check(JSON.stringify(varsayilan) === '[false,false,true]' && JSON.stringify(ayarli) === '[true,false,false]',
    'L-229a Kapora: ayar yoksa dogrudan kanal alir, OTA almaz; isletme ayari kanal bazinda bunu degistirir', JSON.stringify({ varsayilan, ayarli }));
  check(/const kaporaAlinir = channelTakesDeposit\(booking\.channel\)/.test(panel) && /kaporaAlinir \? '<option value="DEPOSIT">Kapora<\/option>' : ''/.test(panel),
    'L-229b Odeme takibi kapora almayan kanalda "Kapora" secenegi sunmaz');
  const kanalDegisti = functionBody(app, 'function handleBookingChannelChange(');
  check(/syncBookingDepositVisibility\(\)/.test(kanalDegisti) && /saveBookingDepositChannels\(event\)/.test(fin) && /cloudSaveTenantSetting\('booking_deposit_channels'/.test(fin)
    && /data-onchange="syncQuickBookingDepositVisibility\(\)"/.test(html),
    'L-229c Yeni rezervasyon ve hizli formda kapora alani kanala gore; ayar Ayarlar → Kanallar → Kapora');

  // L-230 (M55): vergi profili formdan cikmadan tanimlanir.
  const vm = require('vm');
  const ctx = { crypto: require('crypto'), escapeHtml: s => String(s), document: { getElementById: () => null }, appData: { tenantSettings: {} }, activeTenant: { role: 'owner' }, canManageTenantRole: () => true };
  vm.runInNewContext(fin, ctx);
  const satirIci = ctx.bookingTaxProfileFieldsHtml('resNewProfile', false);
  const ayarlar = ctx.bookingTaxProfileFieldsHtml('profile', true);
  check(!/required/.test(satirIci) && /id="resNewProfileRate_vat"/.test(satirIci) && /id="profileName" maxlength="100" required/.test(ayarlar) && /id="profileOther_accommodation" required/.test(ayarlar),
    'L-230a Satir ici profil alanlari zorunlu isareti tasimaz (gizli zorunlu alan rezervasyon kaydini kilitlerdi); Ayarlar formu ayni');
  check(/data-onclick="openBookingTaxProfileCreator\(\)"/.test(html) && /id="resTaxProfileCreator" hidden/.test(html)
    && /readBookingTaxProfileForm\('resNewProfile'\)/.test(fin) && /readBookingTaxProfileForm\('profile'\)/.test(fin)
    && /handleBookingTaxProfileCreatorKey/.test(fin) && /financeSet\('resTaxProfile', String\(profiles\.length - 1\)\)/.test(fin),
    'L-230b "+ Yeni profil" formun icinde acilir, ayni dogrulamadan gecer, kaydedilen profil secilir; Enter rezervasyonu gondermez');
  let hata = '';
  try { ctx.readBookingTaxProfileForm('x'); } catch (e) { hata = e.message; }
  check(/tamamlayın/.test(hata), 'L-230c Eksik profil kaydedilmez', hata);

  // L-232 (kullanici 19.10): vergi profili duzenlenip silinebilir; kayitli
  // rezervasyonun kopyasi degismez (degisiklik yalniz sonraki secimleri etkiler).
  const elemanlar = new Map();
  const el = id => { if (!elemanlar.has(id)) elemanlar.set(id, { id, value: '', textContent: '', innerHTML: '', hidden: false, focus() {} }); return elemanlar.get(id); };
  const yazilan = [];
  const eskiProfil = { id: 'p-1', name: 'Bodrum', dateBasis: 'checkIn', validFrom: '2026-01-01', validTo: '2026-12-31',
    vat: { rate: '1', room: true, cleaning: true, includesOther: false }, accommodation: { rate: '2', room: true, cleaning: false, includesOther: false } };
  const kayitliRezervasyonKopyasi = JSON.parse(JSON.stringify(eskiProfil));
  const ctx2 = { crypto: require('crypto'), escapeHtml: s => String(s), document: { getElementById: el, querySelectorAll: () => [] },
    appData: { tenantSettings: { booking_tax_profiles: [eskiProfil, { ...eskiProfil, id: 'p-2', name: 'İkinci' }] } },
    activeTenant: { role: 'owner' }, canManageTenantRole: () => true, getBookingChannelCatalog: () => [], channelTakesDeposit: () => false,
    cloudSaveTenantSetting: async (k, v) => { yazilan.push([k, JSON.parse(JSON.stringify(v))]); }, alert() {}, confirm: () => true };
  vm.runInNewContext(read('core/booking_finance_ui.js'), ctx2);
  vm.runInNewContext("this.BookingFinance = { validateProfile: p => p };", ctx2);
  ctx2.renderBookingFinanceSettings();
  check(/data-onclick="editBookingTaxProfile\(0\)"/.test(el('bookingFinanceSettings').innerHTML) && /data-onclick="deleteBookingTaxProfile\(1\)"/.test(el('bookingFinanceSettings').innerHTML)
    && /yalnız bundan sonra seçilen rezervasyonları etkiler/.test(el('bookingFinanceSettings').innerHTML),
    'L-232a Ayarlar profil listesinde Duzenle / Sil var ve etkisi acikca yazili');
  ctx2.editBookingTaxProfile(0);
  check(el('profileName').value === 'Bodrum' && el('profileRate_vat').value === '1' && el('profileBase_vat').value === 'both' && el('profileBase_accommodation').value === 'room'
    && el('profileOther_vat').value === 'no' && el('profileSubmitBtn').textContent === 'Değişiklikleri kaydet',
    'L-232b Duzenle profili forma doldurur (matrah ve "diger vergi" secimleri dahil)');
  el('profileRate_vat').value = '10';
  await ctx2.saveBookingTaxProfile({ preventDefault() {} });
  const sonra = ctx2.appData.tenantSettings.booking_tax_profiles;
  check(yazilan.length === 1 && sonra.length === 2 && sonra[0].id === 'p-1' && sonra[0].vat.rate === '10' && sonra[1].id === 'p-2'
    && eskiProfil.vat.rate === '1' && JSON.stringify(eskiProfil) === JSON.stringify(kayitliRezervasyonKopyasi),
    'L-232c Duzenleme ayni kimlikle yerinde kaydeder, yeni profil eklemez; eski profil nesnesi (rezervasyon kopyasi) degismez', JSON.stringify(sonra));
  await ctx2.deleteBookingTaxProfile(1);
  check(yazilan.length === 2 && ctx2.appData.tenantSettings.booking_tax_profiles.length === 1 && ctx2.appData.tenantSettings.booking_tax_profiles[0].id === 'p-1',
    'L-232d Sil yalniz secilen profili kaldirir');
  check(read('core/action_dispatch.js').includes("'editBookingTaxProfile'") && read('core/action_dispatch.js').includes("'deleteBookingTaxProfile'"),
    'L-232e Eylemler izin listesinde');

  // L-231 (M56): finans yolu POS komisyonunu yaziyor, bellek eskisini tutuyordu.
  check(App.bookingPaymentCommissionFromFinance({ financialDetails: { result: { paymentCommission: 450 } } }) === 450
    && App.bookingPaymentCommissionFromFinance({ financialDetails: null }) === null,
    'L-231a Kaydedilen finans sonucundaki odeme komisyonu okunur');
  check(/bookingPaymentCommissionFromFinance\(updatedBooking\)/.test(functionBody(app, 'async function updateBooking('))
    && /bookingPaymentCommissionFromFinance\(createdBooking\)/.test(functionBody(app, 'async function createBooking(')),
    'L-231b Olusturma ve guncelleme sonrasi bellek sunucunun yazdigi komisyonu alir');
}

async function temizlikIkiImzaDavranisi() {
  // 9.5 Temizlik (kullanici PDF'i, 19.10): M58-M65 = L-233...L-240.
  sahteDom({});
  const App = require('../app.js');
  const html = read('index.html');
  const app = read('app.js');
  const css = read('style.css');
  const eylemler = read('core/action_dispatch.js');

  // L-233 (M58): oturum cozulene kadar panel cizilmez; oturum yoksa giris ekrani beklemeden acilir.
  const acilis = app.slice(app.indexOf("document.addEventListener('DOMContentLoaded'"), app.indexOf("document.addEventListener('DOMContentLoaded'") + 1200);
  check(/<body class="auth-pending">/.test(html) && /body\.auth-pending > :not\(#securityLockOverlay\) \{ visibility: hidden/.test(css)
    && /if \(!hasStoredAuthSession\(\) && !readEmailTokenHashLink\(window\.location\.search\) && !isPasswordRecoveryRedirect\(\)\) \{\s*showLockOverlay\(\);/.test(acilis)
    && /finally \{\s*endAuthPending\(\);/.test(acilis) && /endAuthPending\(\);/.test(functionBody(app, 'function showLockOverlay('))
    && /endAuthPending\(\);/.test(functionBody(app, 'function hideLockOverlay(')),
    'L-233a Acilista bos panel gorunmez; saklanmis oturum yoksa giris ekrani hemen, varsa oturum dogrulaninca panel');
  check(App.hasStoredAuthSession() === false, 'L-233b Saklanmis oturum yokken "oturum var" denmez');

  // L-234 (M59): temizlikci kartindaki giris bilgileri yazilabilir ve kartta gorunur.
  const bos = App.staffAccessHtml(null);
  const dolu = App.staffAccessHtml({ address: 'Kalkan Mah. 5', map_url: 'https://maps.example/x', door_code: '4321', wifi_name: 'EvNet', wifi_password: 'sifre1', check_out_time: '11:00', check_in_time: '15:00', parking: '', emergency_contact: 'Ali 0532' });
  const kotu = App.staffAccessHtml({ address: 'X', map_url: 'javascript:alert(1)' });
  check(/Saha ve giriş bilgileri/.test(bos) && !/—<\/span>/.test(bos), 'L-234a Bilgi yokken dort "—" yerine nereden girilecegi yazar', bos);
  check(/4321/.test(dolu) && /şifre: sifre1/.test(dolu) && /href="https:\/\/maps\.example\/x"/.test(dolu) && /Ali 0532/.test(dolu) && !/Otopark/.test(dolu),
    'L-234b Kapi kodu, Wi-Fi sifresi, harita ve acil iletisim gorunur; bos alan kutusu cizilmez', dolu);
  check(!/javascript:/.test(kotu), 'L-234c Harita baglantisi yalniz http(s)', kotu);
  check(['propAccessAddress', 'propAccessDoorCode', 'propAccessWifiName', 'propAccessWifiPassword', 'propAccessCheckIn', 'propAccessCheckOut', 'propAccessArrival', 'propAccessEmergency']
    .every(id => html.includes(`id="${id}"`)), 'L-234d Mulk formunda "Saha ve giris bilgileri" alanlari var');
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  let ist = kaydedenIstemci();
  App.setSupabaseClient(ist);
  sahteDom({ propAccessDoorCode: ' 4321 ', propAnalysisLatitude: '36.2', propAnalysisLongitude: '29.6' });
  check(App.readPropertyAccessForm().map_url === 'https://www.google.com/maps?q=36.2,29.6', 'L-234e Harita bossa girilen koordinattan uretilir');
  await App.savePropertyAccessFromForm('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  const giris = ist.yazmalar.find(k => k.tablo === 'property_guest_settings');
  check(giris && giris.islem === 'upsert' && giris.yuk.tenant_id === TENANT && giris.yuk.door_code === '4321' && !('check_in_time' in giris.yuk),
    'L-234f Kayit property_guest_settings tablosuna kiraci ve mulkle yazar; bos saat varsayilani ezmez', JSON.stringify(giris));
  ist = kaydedenIstemci();
  App.setSupabaseClient(ist);
  sahteDom({});
  await App.savePropertyAccessFromForm('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
  check(!ist.yazmalar.length, 'L-234g Bos form ve kayitsiz mulkte hicbir sey yazilmaz');

  // L-235 (M60): kontrol listesi kendi bolumunde, kagit liste gibi; metinden yapistirilir.
  const sablonKarti = (html.match(/data-settings-section="templates"[\s\S]*?<\/section>\s*<!-- Kontrol listeleri/) || [''])[0];
  check(/data-settings-section="checklists"[\s\S]*id="settingsChecklistTemplateForm"/.test(html) && !/settingsChecklistTemplateForm/.test(sablonKarti) && sablonKarti.length > 0,
    'L-235a Kontrol listesi duzenleyicisi Sablonlar kartindan cikti, kendi bolumunde');
  const bolum = App.settingsChecklistSectionHtml({ title: 'Mutfak', items: [{ text: 'Bulaşık', important: true, subChecks: ['Kireç'] }] }, 0);
  check(/class="sr-only">Bölüm adı/.test(bolum) && /class="sr-only">Kontrol maddesi/.test(bolum) && /checklistBuilderKeydown\(event, 'item', 0, 0, -1\)/.test(bolum)
    && /checklist-doc-box/.test(bolum) && !/>Bölüm adı <input/.test(bolum),
    'L-235b Satirlar etiketli kutu yerine kutucuklu liste satiri; etiket ekran okuyucuda, Enter yeni satir');
  const yapistir = App.checklistIndentedTextToItems('Mutfak\n    ☐ Bulaşıklar yıkandı mı\n        Kireç kontrol edildi mi\n    süpürüldü mü\nYatak odası\n\t!Çarşaf yıkandı mı?\nMalzeme listesi\n    çay\n    kahve\n    bulaşık deterjanı');
  check(JSON.stringify(yapistir) === JSON.stringify({ sections: [
    { title: 'Mutfak', items: [{ text: 'Bulaşıklar yıkandı mı', important: false, subChecks: ['Kireç kontrol edildi mi'] }, { text: 'süpürüldü mü', important: false, subChecks: [] }] },
    { title: 'Yatak odası', items: [{ text: 'Çarşaf yıkandı mı?', important: true, subChecks: [] }] }],
    supplies: [{ area: '', item: 'çay' }, { area: '', item: 'kahve' }, { area: '', item: 'bulaşık deterjanı' }] }),
    'L-235c Kullanicinin Word listesi girintiye gore bolum / madde / alt kontrol / malzeme olur', JSON.stringify(yapistir));
  check(['checklistBuilderKeydown', 'importChecklistFromText', 'refreshCleaningExecutionChecklist'].every(ad => eylemler.includes(`'${ad}'`)),
    'L-235d Yeni eylemler izin listesinde');

  // L-236 (M61): bos liste Z imzasini kilitlemez; sonradan eklenen liste baslanmamis goreve gider.
  check(App.staffCleaningCompletionState({ checklist: { sections: [], supplies: [] } }).canComplete === true,
    'L-236a Kontrol listesi bos is "en az bir bolum olmali" ile kilitlenmez');
  const zorunlu = { checklist: { sections: [{ title: 'M', items: [{ text: 'a', important: true, subChecks: [] }] }], supplies: [] }, checklist_result: {} };
  check(App.staffCleaningCompletionState(zorunlu).canComplete === false
    && App.staffCleaningCompletionState({ ...zorunlu, checklist_result: { 's0.i0': { z: true } } }).canComplete === true,
    'L-236b Liste varsa zorunlu madde kurali aynen gecerli');
  const rpcler = [];
  ist = kaydedenIstemci();
  ist.rpc = async (ad, arg) => { rpcler.push([ad, arg]); return { data: {}, error: null }; };
  App.setSupabaseClient(ist);
  App.setAppData({ villas: {}, bookings: [], expenses: [], operationalPeople: [], cleaningTasks: [
    { id: 'ct1', dbId: 'ct1', status: 'PLANNED' }, { id: 'ct2', dbId: 'ct2', status: 'PLANNED' },
    { id: 'ct3', dbId: 'ct3', status: 'DONE' }, { id: 'ct4', dbId: 'ct4', status: 'PLANNED' }],
  cleaningExecutions: [
    { id: 'e1', cleaning_task_id: 'ct1', person_id: 'p', status: 'ASSIGNED', checklist_snapshot: { sections: [] }, checklist_result: {}, supplies_result: {} },
    { id: 'e2', cleaning_task_id: 'ct2', person_id: 'p', status: 'IN_PROGRESS', checklist_snapshot: { sections: [] }, checklist_result: { 's0.i0': { z: true } }, supplies_result: {} },
    { id: 'e3', cleaning_task_id: 'ct3', person_id: 'p', status: 'ASSIGNED', checklist_snapshot: { sections: [] }, checklist_result: {}, supplies_result: {} },
    { id: 'e4', cleaning_task_id: 'ct4', person_id: 'p', status: 'CLEANED', checklist_snapshot: { sections: [] }, checklist_result: {}, supplies_result: {} }] });
  const yenile = await App.refreshUnstartedCleaningChecklists();
  const atamalar = rpcler.filter(([ad]) => ad === 'assign_cleaning_task');
  check(atamalar.length === 1 && atamalar[0][1].p_cleaning_task_id === 'ct1' && atamalar[0][1].p_template_id === null && yenile.refreshed === 1,
    'L-236c Liste yenileme yalniz imzasiz, isaretlenmemis, acik goreve gider (ayni kisiye yeniden atama)', JSON.stringify(rpcler));
  check(/createSettingsChecklistTemplate[\s\S]*/.test(app) && /refreshUnstartedCleaningChecklists\(\)/.test(functionBody(app, 'async function createSettingsChecklistTemplate('))
    && /Listeyi güncelle/.test(App.cleaningExecutionChecklistHintHtml({ id: 'e1', cleaning_task_id: 'ct1', status: 'ASSIGNED', checklist_snapshot: { sections: [] }, checklist_result: {}, supplies_result: {} })),
    'L-236d Liste kaydedilince baslanmamis gorevler yenilenir; bos listeli atamada yonetici "Listeyi guncelle" gorur');

  // L-237 (M62): onaylanan / kapatilan temizlik personel ekranindan duser.
  check(App.isStaffCleaningVisible({ status: 'ASSIGNED', task_status: 'PLANNED' }) && App.isStaffCleaningVisible({ status: 'CLEANED' })
    && !App.isStaffCleaningVisible({ status: 'INSPECTED' }) && !App.isStaffCleaningVisible({ status: 'ASSIGNED', task_status: 'DONE' })
    && !App.isStaffCleaningVisible({ status: 'ASSIGNED', task_status: 'SKIPPED' }),
    'L-237a Personel ekraninda yalniz acik ya da denetim bekleyen temizlik kalir');
  ist = kaydedenIstemci();
  ist.rpc = async () => ({ data: { cleanings: [
    { execution_id: 'x1', status: 'INSPECTED', property: { name: 'ONAYLI-EV' }, checklist: { sections: [] } },
    { execution_id: 'x2', status: 'ASSIGNED', task_status: 'DONE', property: { name: 'KAPALI-EV' }, checklist: { sections: [] } },
    { execution_id: 'x3', status: 'REOPENED', inspector_note: 'Banyo eksik', property: { name: 'ACIK-EV' }, checklist: { sections: [] } }], tasks: [], tickets: [] }, error: null });
  App.setSupabaseClient(ist);
  sahteDom({});
  await App.loadStaffFieldWork();
  const saha = global.document.getElementById('staffFieldWorkContainer').innerHTML;
  check(/ACIK-EV/.test(saha) && !/ONAYLI-EV/.test(saha) && !/KAPALI-EV/.test(saha) && /Banyo eksik/.test(saha) && /Yeniden açıldı/.test(saha),
    'L-237b Onayli ve kapatilmis is kartta yok; yeniden acilan is yoneticinin notuyla gorunur', saha.slice(0, 300));
  const goc = read('supabase/migration_phase99_field_work_closed_cleanings.sql');
  check(/e\.status <> 'INSPECTED'/.test(goc) && /COALESCE\(ct\.status, ''\) NOT IN \('DONE', 'SKIPPED'\)/.test(goc) && /'task_status', ct\.status/.test(goc)
    && /REVOKE ALL ON FUNCTION public\.get_my_field_work\(UUID, DATE, DATE\) FROM anon/.test(goc) && /VALUES \(99, 'phase99_field_work_closed_cleanings'\)/.test(goc),
    'L-237c phase99 sunucuda da kapanan isi dondurmez; anon kapali, schema_migrations kaydi');

  // L-238 (M63): "Yapilmadi" etiketi "Gerek kalmadi".
  check(!/Yapılmadı/.test(app) && !/Yapılmadı/.test(html) && /✖ Gerek kalmadı/.test(app),
    'L-238 Temizlik "Yapilmadi" yerine "Gerek kalmadi" (durum kodu SKIPPED ayni)');

  // L-240 (M65): menudeki Operasyon sayisi bugunun acik isi.
  const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  App.setAppData({ villas: {}, bookings: [], expenses: [], operationalPeople: [], cleaningExecutions: [],
    cleaningTasks: [{ id: 'a', date: bugun, status: 'PLANNED' }, { id: 'b', date: bugun, status: 'DONE', paid: false }, { id: 'c', date: '2999-01-01', status: 'PLANNED' }],
    maintenanceTickets: [{ id: 't', status: 'OPEN' }, { id: 'u', status: 'RESOLVED' }] });
  const sayi = App.getOperationsAttentionCount();
  check(sayi.cleanings === 1 && sayi.tickets === 1 && sayi.total === 2, 'L-240a Bugunku acik temizlik + acik ariza sayilir; yapilmis ve gelecek is sayilmaz', JSON.stringify(sayi));
  check(/renderOperationsTabBadge\(\);\s*\}/.test(functionBody(app, 'function renderAll(')), 'L-240b Rozet her cizimde guncellenir, yalniz Operasyon sekmesinde degil');
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
  await mulklerAsama11Davranisi();
  await bugunPerformansDavranisi();
  await talepEkraniDavranisi();
  await rezervasyondanMisafirDavranisi();
  await rezervasyonOdemeDavranisi();
  await temizlikIkiImzaDavranisi();
} catch (error) {
  failed++;
  console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
} finally {
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
}
main();
