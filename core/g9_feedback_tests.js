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
// L-241..L-244 (M66-M69, 9.6): isletmenin gider kategorileri ve OPEX/CAPEX turu, tekrarlayan gider, Bugun'de net kar, tahsilat bildirimi.
// L-246 (M70, 9.7): tarihli bakim yalniz kendi araligini kapatir; fiyat takvimi ve hazirlik ayni tanimi kullanir.
// L-247..L-254 (M71-M76, 9.7): talep kurali, 3 aylik takvim, ozel etkinlik, kural kaynagi, fiyat tablosu, bos gece, yillik hedef, fiyat tablosu karti.
// L-255 (M76, 9.7 F.2.9): gunluk fiyat onaylanir / elle yazilir (phase101); rezervasyon formunda referans.
// L-267 (M88, KF-1): uzun konaklama indirimi (tenant_settings pricing_long_stay), konaklama toplamina, taban gece basina.
// L-266 (M87, KF-1): sezon kurali (tenant_settings pricing_seasons), her yil secenegi, mulk > portfoy, taban korumasi en son.
// L-265 (M86, KF-1): minimum gece satis kisiti (tenant_settings pricing_min_stay), takvimde satilamaz bosluk, formda uyari + onay.
// L-263..L-264 (M84-M85, urun kararlari KF-2/KF-3 20.10): ChatGPT 30 gun eylem sorusu; satisciya onayli fiyat esas, oneri etiketli.
// L-256..L-262 (M77-M83, 9.7 kontrol turu): hesaplayici kapsami, hedef doluluk/odak, baz fiyatsiz mulk, rakip arastirmasi duzenle/sil + kartta bilgi, ChatGPT baglami, satis rolune kapali tarihler (phase103).
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
  check(NF.typesForRole('owner').length === 7 && NF.typesForRole('sales').length === 4,
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

async function giderAsamasiDavranisi() {
  // 9.6 Gider (kullanici PDF'i, 19.10): M66-M69 = L-241...L-244.
  sahteDom({});
  global.FinancialMetricsService = require('./financial_metrics_service.js');
  const App = require('../app.js');
  const E = require('./finance_import_engine.js');
  const NF = require('./notification_feed.js');
  const html = read('index.html');
  const app = read('app.js');
  const eylemler = read('core/action_dispatch.js');
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-00000000000a';
  App.setActiveTenant({ id: TENANT, role: 'owner' });

  // L-241 (M66): kategoriler isletmece eklenir; her kategori OPEX ya da CAPEX'tir.
  check(E.GIDER_KATEGORILERI.filter(c => c.name !== 'Diğer').every(c => c.type === 'OPEX' || c.type === 'CAPEX')
    && E.GIDER_KATEGORILERI.find(c => c.name === 'Demirbaş').type === 'CAPEX' && E.GIDER_KATEGORILERI.find(c => c.name === 'Tadilat').type === 'CAPEX'
    && E.GIDER_KATEGORILERI.find(c => c.name === 'Fatura').type === 'OPEX',
    'L-241a Standart her kategorinin turu var; klima/mobilya icin CAPEX kategorisi (Demirbas, Tadilat) eklendi');
  App.setAppData({ villas: {}, bookings: [], expenses: [], closedPeriods: [], tenantSettings: { expense_categories: [
    { name: 'Havuz Bakımı', type: 'OPEX' }, { name: 'Jakuzi', type: 'CAPEX' }, { name: 'FATURA', type: 'CAPEX' }, { name: '  ', type: 'OPEX' }, { name: 'havuz  bakımı', type: 'OPEX' }] } });
  const adlar = App.getExpenseCategories().map(c => c.name);
  check(adlar.slice(-3).join('|') === 'Havuz Bakımı|Jakuzi|Diğer' && adlar.filter(a => /fatura/i.test(a)).length === 1,
    'L-241b Ozel kategoriler "Diğer"den once listeye girer; standartla ayni ad, bos ve mukerrer ad alinmaz', adlar.join('|'));
  check(App.getExpenseCategoryType('Jakuzi') === 'CAPEX' && App.getExpenseCategoryType('fatura') === 'OPEX' && App.getExpenseCategoryType('Diğer') === null
    && App.eslesenGiderKategorisi('HAVUZ BAKIMI') === 'Havuz Bakımı',
    'L-241c Tur kategoriden okunur; ozel kategori grafikte kendi dilimine duser ("Diğer"e degil)');
  let ist = kaydedenIstemci();
  App.setSupabaseClient(ist);
  const eklenen = await App.addCustomExpenseCategory('Bahçe ', 'CAPEX');
  const ayar = ist.yazmalar.find(k => k.tablo === 'tenant_settings');
  check(eklenen && ayar && ayar.islem === 'upsert' && ayar.yuk.key === 'expense_categories' && ayar.yuk.tenant_id === TENANT
    && JSON.stringify(ayar.yuk.value.slice(-1)) === JSON.stringify([{ name: 'Bahçe', type: 'CAPEX' }])
    && App.getExpenseCategoryType('Bahçe') === 'CAPEX',
    'L-241d Yeni kategori isletme ayarina (tenant_settings) turuyle yazilir; bellek yazmadan sonra degisir', JSON.stringify(ayar && ayar.yuk));
  ist = kaydedenIstemci();
  App.setSupabaseClient(ist);
  check(await App.addCustomExpenseCategory('fatura', 'OPEX') === null && !ist.yazmalar.length,
    'L-241e Standart kategoriyle ayni ad eklenmez, hicbir sey yazilmaz');
  const giderMap = { date: 'Tarih', category: 'Kategori', amount: 'Tutar', description: 'Aciklama', property: 'Mulk' };
  const satir = [{ Tarih: '2026-09-01', Kategori: 'jakuzi', Tutar: '5000', Aciklama: 'x', Mulk: '' }];
  const ozelle = E.validateExpenseRows(satir, giderMap, { properties: [], customCategories: [{ name: 'Jakuzi', type: 'CAPEX' }] });
  const ozelsiz = E.validateExpenseRows(satir, giderMap, { properties: [] });
  check(ozelle.validCount === 1 && ozelle.validatedRows[0].category === 'Jakuzi' && ozelsiz.validCount === 0,
    'L-241f Ice aktarma isletmenin ekledigi kategoriyi tanir', JSON.stringify(ozelle.errors));
  const kategoriSecici = (html.match(/<select id="expCategory"[\s\S]*?<\/select>/) || [''])[0];
  check(/<optgroup label="Operasyonel gider \(OPEX\)" data-expense-group="OPEX">/.test(kategoriSecici) && /<optgroup label="Yatırım \(CAPEX\)" data-expense-group="CAPEX">/.test(kategoriSecici)
    && /id="expTypeHint"/.test(html) && /data-settings-section="expense-categories"/.test(html) && /onExpenseCategoryChange\(this\.value\)/.test(kategoriSecici)
    && /renderSettingsExpenseCategories\(\)/.test(functionBody(app, 'async function renderSettingsWorkspace(')),
    'L-241g Formda kategoriler OPEX / CAPEX gruplu, tur aciklamasi var; Ayarlar\'da Gider kategorileri bolumu');

  let arizaArg = null;
  App.setAppData({ villas: {}, bookings: [], expenses: [], closedPeriods: [], maintenanceTickets: [{ id: 't-9', title: 'Klima arızası' }] });
  await App.runCommandCenterAction('RESOLVE_TICKET', 't-9', { actualCost: 11000, resolveMaintenanceTicket: async (...a) => { arizaArg = a; return { success: true }; } });
  check(App.eslesenGiderKategorisi('Elektrik') === 'Fatura' && App.eslesenGiderKategorisi('Bakım & Onarım') === 'Bakım'
    && JSON.stringify(arizaArg) === JSON.stringify(['t-9', 11000, 'Bakım', 'Arıza onarımı: Klima arızası']),
    'L-241h Es anlamli kategori grafikte de eslesir; ariza onarimi "Bakım" (OPEX) olarak, arizanin adiyla yazilir', JSON.stringify(arizaArg));

  // L-242 (M67): gider formunda tekrar — her ay / hafta / gun, kac kez.
  check(JSON.stringify(App.buildRecurringExpenseDates('2026-01-31', 'MONTHLY', 4)) === JSON.stringify(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    && JSON.stringify(App.buildRecurringExpenseDates('2026-12-28', 'WEEKLY', 2)) === JSON.stringify(['2026-12-28', '2027-01-04'])
    && JSON.stringify(App.buildRecurringExpenseDates('2026-02-27', 'DAILY', 3)) === JSON.stringify(['2026-02-27', '2026-02-28', '2026-03-01'])
    && App.buildRecurringExpenseDates('2026-01-01', 'MONTHLY', 1).length === 0 && App.buildRecurringExpenseDates('2026-01-01', 'MONTHLY', 61).length === 0
    && App.buildRecurringExpenseDates('2026-01-01', 'YEARLY', 3).length === 0,
    'L-242a Tekrar tarihleri: ayin 31\'i kisa ayda son gune kayar ve geri doner; hafta/gun; 2..sinir disi reddedilir');
  const eklenenler = [];
  const silinenler = [];
  const yazanIstemci = {
    rpc: async () => ({ data: [], error: null }),
    from(tablo) {
      const q = {
        _sil: false,
        insert(rows) { const liste = Array.isArray(rows) ? rows : [rows]; eklenenler.push({ tablo, liste }); q._veri = liste.map((r, i) => ({ ...r, id: `eeeeeeee-eeee-4eee-8eee-00000000000${i}` })); return q; },
        delete() { q._sil = true; return q; },
        eq() { return q; }, in(_, ids) { if (q._sil) silinenler.push({ tablo, ids }); q._ids = ids; return q; },
        select() { return q; }, order() { return q; },
        async single() { return { data: q._veri ? q._veri[0] : null, error: null }; },
        then(res, rej) { const data = q._sil ? (q._ids || []).map(id => ({ id })) : (q._veri || []); return Promise.resolve({ data, error: null }).then(res, rej); }
      };
      return q;
    }
  };
  App.setSupabaseClient(yazanIstemci);
  App.setAppData({ villas: {}, bookings: [], expenses: [], closedPeriods: [], tenantSettings: {} });
  sahteDom({ expEditId: '', expType: 'OPEX', expCategory: 'Fatura', expVilla: 'ALL', expDate: '2026-01-31', expAmount: '800', expDesc: 'TEST internet', expRecurFreq: 'MONTHLY', expRecurCount: '3' });
  await App.saveExpense({ preventDefault() {} });
  const toplu = eklenenler.filter(k => k.tablo === 'expenses');
  const seriler = toplu[0] ? toplu[0].liste.map(r => r.legacy_id) : [];
  check(toplu.length === 1 && toplu[0].liste.length === 3 && toplu[0].liste.map(r => r.expense_date).join(',') === '2026-01-31,2026-02-28,2026-03-31'
    && toplu[0].liste.every(r => r.amount === 800 && r.category === 'Fatura' && r.expense_type === 'OPEX' && r.description === 'TEST internet')
    && /^RECUR:[A-Za-z0-9]+:1\/3$/.test(seriler[0]) && seriler[2].endsWith(':3/3') && new Set(seriler.map(s => s.split(':')[1])).size === 1,
    'L-242b "Her ay x3" tek ifadeyle (hep ya da hic) 3 ayri gider yazar; seri legacy_id\'de', JSON.stringify(toplu.map(k => k.liste)));
  const kayitlar = App.getAppData().expenses;
  check(kayitlar.length === 3 && App.expenseSeriesInfo(kayitlar[1]).index === 2 && App.expenseSeriesInfo(kayitlar[1]).total === 3
    && App.expenseSeriesInfo({ legacyId: 'EXP-CLEAN-1' }) === null,
    'L-242c Seri bilgisi kayittan okunur (rozet "🔁 2/3"); diger legacy_id seri sayilmaz');
  eklenenler.length = 0;
  sahteDom({ expEditId: '', expType: 'OPEX', expCategory: 'Fatura', expVilla: 'ALL', expDate: '2026-01-31', expAmount: '800', expDesc: 'tek', expRecurFreq: 'NONE', expRecurCount: '12' });
  await App.saveExpense({ preventDefault() {} });
  check(eklenenler.length === 1 && !Array.isArray(eklenenler[0].liste[0].legacy_id) && eklenenler[0].liste.length === 1 && !eklenenler[0].liste[0].legacy_id,
    'L-242d "Tekrarlamaz" eskisi gibi tek kayit, seri izi yok');
  sahteDom({});
  global.confirm = () => true;
  const ilk = App.getAppData().expenses.find(e => App.expenseSeriesInfo(e) && App.expenseSeriesInfo(e).index === 1);
  await App.deleteExpenseUI(ilk.id);
  check(silinenler.length === 1 && silinenler[0].ids.length === 3 && App.getAppData().expenses.filter(e => App.expenseSeriesInfo(e)).length === 0,
    'L-242e Tekrarin ilk kaydi silinirken "sonrakiler de" secilirse seri tek ifadeyle silinir', JSON.stringify(silinenler));
  check(/id="expRecurFreq"/.test(html) && /<option value="MONTHLY">Her ay<\/option>/.test(html) && /<option value="WEEKLY">Her hafta<\/option>/.test(html)
    && /<option value="DAILY">Her gün<\/option>/.test(html) && /id="expRecurCount"/.test(html)
    && ['updateExpenseRecurrencePreview', 'onExpenseCategoryChange', 'createExpenseCategoryFromForm', 'createSettingsExpenseCategory', 'deleteCustomExpenseCategory', 'setCustomExpenseCategoryType'].every(ad => eylemler.includes(`'${ad}'`))
    && /invalidateExecutiveSnapshotCache\(\)/.test(functionBody(app, 'async function deleteExpensesByIds(')),
    'L-242f Formda Tekrar secenekleri; yeni eylemler izin listesinde; toplu silme ana sayfa onbellegini temizler');

  // L-243 (M68): Bugun kartinda net kar, Finans ile ayni defterden.
  const buAy = App.getCurrentMonthKey();
  App.setAppData({ villas: { DENIZ: { id: A, slug: 'DENIZ', name: 'Deniz Evi', isActive: true, activationDate: '2026-01-01' } },
    bookings: [{ id: 'r1', villa: 'DENIZ', propertyId: A, guest: 'Ali', checkIn: `${buAy}-02`, checkOut: `${buAy}-05`, gross: 30000, cleanFee: 0, otaComm: 0, discount: 0, status: 'CONFIRMED', channel: 'WHATSAPP' }],
    expenses: [], cleaningTasks: [], maintenance: [], closedPeriods: [] });
  let perf = App.computeMonthPerformance(buAy, 'ALL');
  check(/Net kâr<\/span><strong>—<\/strong><small>Gider kaydı yok; kâr ölçülemedi/.test(App.todayPerformanceProfitCardHtml(perf, buAy)),
    'L-243a Gider yokken net kar uydurulmaz ("—", L-101)');
  App.setAppData({ ...App.getAppData(), expenses: [
    { id: 'x1', villa: 'ALL', date: `${buAy}-03`, month: buAy, category: 'Fatura', type: 'OPEX', amount: 2500, description: 'e' },
    { id: 'x2', villa: 'ALL', date: `${buAy}-03`, month: buAy, category: 'Demirbaş', type: 'CAPEX', amount: 20000, description: 'k' }] });
  perf = App.computeMonthPerformance(buAy, 'ALL');
  check(perf.netProfit === 30000 - 2500 - 20000 && App.todayPerformanceProfitCardHtml(perf, buAy).includes('₺7.500'),
    'L-243b Net kar = toplam gelir − OPEX − CAPEX (Finans defteri, computeMonthLedger)', JSON.stringify(perf));
  App.setAppData({ ...App.getAppData(), expenses: [{ id: 'x3', villa: 'ALL', date: `${buAy}-03`, month: buAy, category: 'Demirbaş', type: 'CAPEX', amount: 40000, description: 'k' }] });
  check(App.todayPerformanceProfitCardHtml(App.computeMonthPerformance(buAy, 'ALL'), buAy).includes('−₺10.000'),
    'L-243c Zarar eksi isaretiyle yazilir');
  check(/todayPerformanceProfitCardHtml\(perf, month\)/.test(functionBody(app, 'function renderTodayPerformance(')),
    'L-243d Bugun kartlari net kari cizer (finans rolune kapili blok icinde)');

  // L-244 (M69): OTA disi rezervasyonda cikis gunu gecti, tahsilat eksik -> bildirim.
  const bugun = '2026-10-19';
  const rez = [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', villa: 'DENIZ', guest: 'Ali', checkOut: '2026-10-10', channel: 'WHATSAPP', status: 'CHECKED_OUT' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', villa: 'DENIZ', guest: 'Ota', checkOut: '2026-10-10', channel: 'AIRBNB', status: 'CHECKED_OUT' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000003', villa: 'DENIZ', guest: 'Odedi', checkOut: '2026-10-10', channel: 'PHONE', status: 'CHECKED_OUT' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000004', villa: 'DENIZ', guest: 'Gelecek', checkOut: '2026-11-10', channel: 'PHONE', status: 'CONFIRMED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000005', villa: 'DENIZ', guest: 'Iptal', checkOut: '2026-10-10', channel: 'PHONE', status: 'CANCELLED' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000006', villa: 'DENIZ', guest: 'Bakiyesiz', checkOut: '2026-10-10', channel: 'PHONE', status: 'CHECKED_OUT' },
    { id: 'aaaaaaaa-0000-4000-8000-000000000007', villa: 'DENIZ', guest: 'Bugun', checkOut: bugun, channel: 'INSTAGRAM', status: 'CHECKED_OUT' }];
  const bakiye = (n, kalan) => ({ booking_id: `aaaaaaaa-0000-4000-8000-00000000000${n}`, amount_due: 20000, paid_total: 20000 - kalan, remaining: kalan });
  const acik = App.getUnpaidDirectBookings({ bookings: rez, bookingChannels: [], bookingPaymentBalances: [bakiye(1, 5000), bakiye(2, 20000), bakiye(3, 0), bakiye(4, 20000), bakiye(5, 20000), bakiye(7, 1000)] });
  check(acik.map(b => b.guest).join(',') === 'Ali,Gelecek,Bugun',
    'L-244a Aday: OTA disi, iptal degil, bakiye satiri yuklu ve kalan > 0 (OTA, odenmis, iptal, bakiyesiz haric)', JSON.stringify(acik));
  const olaylar = NF.deriveNotifications({ role: 'owner', today: bugun, unpaidBookings: acik }).filter(e => e.event_key.startsWith('collection_due:'));
  check(olaylar.length === 2 && olaylar.some(e => /Tahsilat bekliyor: Ali/.test(e.title) && /9 gün geçti/.test(e.message) && /₺5\.000 tahsil edilmedi/.test(e.message) && e.severity === 'CRITICAL')
    && olaylar.some(e => /Çıkış bugün/.test(e.message) && e.severity === 'WARNING')
    && olaylar.every(e => e.domain === 'FINANCE' && /^booking:[A-Za-z0-9_.-]+$/.test(e.deep_link) && /^[a-z_]{3,40}:[A-Za-z0-9_:.-]{1,200}$/.test(e.event_key)),
    'L-244b Vadesi (cikis) gelen eksik tahsilat bildirim olur; gelecek cikis olmaz; 7 gunu gecen kritik; phase93 dogrulamasina uyar', JSON.stringify(olaylar));
  check(NF.deriveNotifications({ role: 'staff', today: bugun, unpaidBookings: acik }).length === 0
    && NF.deriveNotifications({ role: 'sales', today: bugun, unpaidBookings: acik }).some(e => e.event_key.startsWith('collection_due:')),
    'L-244c Satis rolu tahsilati gorur, personel gormez');
  check(/kind === 'booking'\) \{ switchTab\('reservations'\); openBookingDetailsPanel\(arg\); \}/.test(functionBody(app, 'async function openUserNotification('))
    && /syncNotificationFeed\(\)/.test(functionBody(app, 'async function refreshBookingPaymentData(')),
    'L-244d "Git" rezervasyon detayini (odeme takibi) acar; odeme girilince bildirim yeniden eslenir');

  // L-245 (kullanici, 19.10): Booking ve Etstur parayi ay basinda belli gunde
  // aktarir -> kanal bazinda tahsilat gunu. Ayrica sablon karti kaldirildi.
  App.setAppData({ villas: {}, bookings: [], expenses: [], bookingChannels: [], closedPeriods: [], tenantSettings: {} });
  check(App.channelCollectionRule('WHATSAPP').mode === 'CHECKOUT' && App.channelCollectionRule('AIRBNB').mode === 'NONE'
    && App.getBookingCollectionDueDate({ channel: 'AIRBNB', checkOut: '2026-09-28' }) === null,
    'L-245a Ayar yokken dogrudan kanal cikis gunu, OTA takip edilmez (eskisi gibi)');
  App.setAppData({ villas: {}, bookings: [], expenses: [], bookingChannels: [], closedPeriods: [], tenantSettings: { booking_collection_schedule: {
    BOOKING: { mode: 'NEXT_MONTH', day: 5 }, ETSTUR: { mode: 'NEXT_MONTH', day: 31 }, WHATSAPP: { mode: 'NONE' }, AIRBNB: { mode: 'NEXT_MONTH', day: 0 } } } });
  check(App.getBookingCollectionDueDate({ channel: 'BOOKING', checkOut: '2026-09-28' }) === '2026-10-05'
    && App.getBookingCollectionDueDate({ channel: 'etstur', checkOut: '2026-01-15' }) === '2026-02-28'
    && App.getBookingCollectionDueDate({ channel: 'BOOKING', checkOut: '2026-12-31' }) === '2027-01-05'
    && App.getBookingCollectionDueDate({ channel: 'WHATSAPP', checkOut: '2026-09-28' }) === null
    && App.channelCollectionRule('AIRBNB').mode === 'NONE',
    'L-245b "Izleyen ayin N. gunu": ay sonuna kirpilir, yil donumu; "takip etme" bildirim uretmez; gecersiz gun uydurulmaz');
  const otaRez = [
    { id: 'aaaaaaaa-0000-4000-8000-000000000011', villa: 'DENIZ', guest: 'Booking Ödedi', checkOut: '2026-09-20', channel: 'BOOKING', status: 'CHECKED_OUT', otaComm: 3000 },
    { id: 'aaaaaaaa-0000-4000-8000-000000000012', villa: 'DENIZ', guest: 'Booking Bekliyor', checkOut: '2026-09-20', channel: 'BOOKING', status: 'CHECKED_OUT', otaComm: 3000 }];
  const otaAcik = App.getUnpaidDirectBookings({ bookings: otaRez, bookingChannels: [], bookingPaymentBalances: [
    { booking_id: otaRez[0].id, amount_due: 20000, remaining: 3000 }, { booking_id: otaRez[1].id, amount_due: 20000, remaining: 20000 }] });
  const otaOlay = NF.deriveNotifications({ role: 'owner', today: '2026-10-19', unpaidBookings: otaAcik }).filter(e => e.event_key.startsWith('collection_due:'));
  check(otaAcik.length === 1 && otaAcik[0].remaining === 17000 && otaAcik[0].dueDate === '2026-10-05'
    && otaOlay.length === 1 && /Booking\.com ödemesi 5 Ekim bekleniyordu \(14 gün geçti\)/.test(otaOlay[0].message) && /₺17\.000 tahsil edilmedi/.test(otaOlay[0].message),
    'L-245c Platform odemesi gunu gecince bildirim; platformun kestigi komisyon acik sayilmaz', JSON.stringify({ otaAcik, otaOlay }));
  const fin = read('core/booking_finance_ui.js');
  check(/saveBookingCollectionSchedule\(event\)/.test(fin) && /cloudSaveTenantSetting\('booking_collection_schedule'/.test(fin) && /Çıkış ayını izleyen ayın … günü/.test(fin)
    && eylemler.includes("'saveBookingCollectionSchedule'"),
    'L-245d Ayarlar → Kanallar → Tahsilat gunu formu isletme ayarina yazar');
  check(!/GİDER ŞABLONLARI|id="expenseTemplateForm"/.test(html) && !/from\('expense_templates'\)/.test(app),
    'L-245e Gider sablonu karti kaldirildi (kullanici karari); sabit gider formdaki "Tekrar" ile');
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

async function fiyatBakimDavranisi() {
  // 9.7 Fiyatlandirma (kullanici PDF'i, 19.10): M70 = L-246.
  sahteDom({});
  const App = require('../app.js');
  const R = require('./property_sales_readiness.js');
  const P = require('./suggested_price_engine.js');
  const app = read('app.js');
  const BUGUN = '2026-10-19';
  const ileri = { id: 't1', status: 'OPEN', priority: 'P1', property_id: 'p1', blocks_availability: true, downtime_start: '2026-10-22', downtime_end: '2026-10-24', title: 'Boya' };
  const tarihsiz = { id: 't2', status: 'OPEN', priority: 'P1', property_id: 'p1', title: 'Su kaçağı' };
  const cozulmus = { ...ileri, id: 't3', status: 'RESOLVED' };
  check(!R.isTicketBlockingOn(ileri, BUGUN, BUGUN) && R.isTicketBlockingOn(ileri, '2026-10-22', BUGUN) && R.isTicketBlockingOn(ileri, '2026-10-24', BUGUN) && !R.isTicketBlockingOn(ileri, '2026-10-25', BUGUN),
    'L-246a Tarihli bakim yalniz kendi araligini kapatir; P1 olsa da bugunu kapatmaz');
  check(R.isTicketBlockingOn(tarihsiz, BUGUN, BUGUN) && !R.isTicketBlockingOn(tarihsiz, '2026-10-25', BUGUN) && !R.isTicketBlockingOn(cozulmus, '2026-10-22', BUGUN),
    'L-246b Tarihsiz kritik ariza yalniz bugunu kapatir (gelecegi tahmin etmez); cozulmus ariza kapatmaz');
  const hazirlik = R.buildPropertyReadiness({ id: 'p1', key: 'P1' }, { maintenanceTickets: [ileri], today: BUGUN });
  check(hazirlik.status !== 'BLOCKED_MAINTENANCE' && hazirlik.upcomingBlocks.length === 1 && /Planlı kapatma: 2026-10-22/.test(hazirlik.reason),
    'L-246c Ileri tarihli bakimli mulk bugun satisa kapali sayilmaz; planli kapatma gerekcede yazar', JSON.stringify(hazirlik));
  check(R.buildPropertyReadiness({ id: 'p1', key: 'P1' }, { maintenanceTickets: [ileri], today: '2026-10-23' }).status === 'BLOCKED_MAINTENANCE',
    'L-246d Aralik icindeki gun mulk satisa kapalidir');
  App.setAppData({ villas: { P1: { id: 'p1', name: 'Seyir' } }, maintenanceTickets: [ileri, tarihsiz, cozulmus], bookings: [] });
  const bloklar = App.pricingMaintenanceBlocks({ id: 'p1' }, BUGUN);
  const gunler = P.suggest({ property: { id: 'p1', basePrice: 10000, floorPrice: 8000 }, blocks: bloklar, today: BUGUN, days: 10 }).days;
  const durum = tarih => gunler.find(d => d.date === tarih)?.status;
  check(durum('2026-10-22') === 'BLOCKED' && durum('2026-10-24') === 'BLOCKED' && durum(BUGUN) === 'BLOCKED' && durum('2026-10-21') === 'OPEN' && durum('2026-10-25') === 'OPEN',
    'L-246e Fiyat takvimi bakim araligini ve bugunku tarihsiz kritik arizayi "Kapali" gosterir; "Takvimi kapatir" isaretine bagli degil', JSON.stringify(gunler.map(d => d.date + ':' + d.status)));
  check(/Planlı kapatma: 22\.10\.2026 – 24\.10\.2026/.test(App.maintenanceClosureText(ileri, BUGUN)) && /bugün satışa kapalı/.test(App.maintenanceClosureText(tarihsiz, BUGUN)),
    'L-246f Operasyon ariza kartinda kapali tarih araligi yazar', App.maintenanceClosureText(ileri, BUGUN));
  const kaydet = functionBody(app, 'async function saveMaint(');
  check(/const blocksAvailability = document\.getElementById\('maintBlocksAvailability'\)\.checked \|\| !!\(downtimeStart \|\| downtimeEnd\)/.test(kaydet),
    'L-246g Kapali tarih girilen bakim kutu isaretsiz olsa da takvimi kapatir; tarih sessizce silinmez');
}

async function fiyatEkraniDavranisi() {
  // 9.7 Fiyatlandirma (kullanici PDF'i, 19.10): M71-M76 = L-247...L-254.
  sahteDom({});
  global.FinancialMetricsService = require('./financial_metrics_service.js');
  const App = require('../app.js');
  const app = read('app.js');
  const html = read('index.html');
  const el = id => global.document.getElementById(id);
  const BUGUN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const gun = n => new Date(Date.parse(BUGUN + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const P = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000071';
  const P2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000072';
  const yil = Number(BUGUN.slice(0, 4));
  const kur = (ek = {}) => {
    App.setActiveTenant({ id: TENANT, role: 'owner' });
    App.setAppData({
      villas: {
        SEYIR: { id: P, slug: 'SEYIR', name: 'Seyir', basePrice: 13000, floor: 8000, peak: 17000, isActive: true, activationDate: '2025-01-01' },
        KOY: { id: P2, slug: 'KOY', name: 'Koy Evi', basePrice: 9000, isActive: true, activationDate: '2025-01-01' }
      },
      bookings: [
        { id: 'b1', villa: 'SEYIR', propertyId: P, checkIn: gun(2), checkOut: gun(5), gross: 30000, status: 'CONFIRMED', channel: 'DIRECT' },
        { id: 'b2', villa: 'SEYIR', propertyId: P, checkIn: gun(6), checkOut: gun(9), gross: 30000, status: 'CONFIRMED', channel: 'DIRECT' }
      ],
      expenses: [], maintenanceTickets: [], propertyPricingRules: [], competitorPriceResearch: [], tenantSettings: {},
      targets: [{ year: yil, month: 1, revenue_target: 68000, property_id: null }, { year: yil, month: 2, revenue_target: 32000, property_id: null }, { year: yil, month: 3, revenue_target: 50000, property_id: P }],
      phase78SchemaReady: true, ...ek
    });
  };
  kur();
  App.setPricingProperty(P);
  App.renderPricingKpiStrip();

  // L-248 (M72): takvim kendi 3 aylik ufkunu tasir; ay sekmesi gosterimi secer.
  const ufuk = App.pricingHorizon(BUGUN);
  check(ufuk.months.length === 3 && ufuk.start === BUGUN && ufuk.end.slice(0, 7) === ufuk.months[2] && (el('pricingMonthTabs').innerHTML.match(/setPricingMonth\(/g) || []).length === 3,
    'L-248a Fiyat takvimi bugunden 3 takvim ayi; ay sekmeleri ekranin icinde (donem filtresi gerekmez)', el('pricingMonthTabs').innerHTML.slice(0, 300));
  const bosAy = gun(5).slice(0, 7);
  App.setPricingMonth(bosAy);
  const takvim = el('pricingManagerContainer').innerHTML;
  check(new RegExp(`pricing-day is-gap"><strong>${App.formatTrDate ? '' : ''}`).test(takvim) && /Açık · boş gece/.test(takvim) && /boş gece aralığı/.test(takvim),
    'L-252a Iki rezervasyon arasindaki tek gece takvimde "boş gece" olarak isaretlenir ve indirim gerekcesi yazar', takvim.slice(0, 600));
  check(/Baz ₺13\.000/.test(takvim) && !/Kural uygulanmadı/.test(takvim),
    'L-250a Gun karti fiyatin nasil olustugunu yazar: baz fiyat + uygulanan kurallar');
  check(!/_PRICING_START|currentFilter/.test(functionBody(app, 'function renderPricingTab(').replace(/currentFilter, period: monthKey/, '')),
    'L-248b Fiyat takvimi ustteki donem filtresinden bagimsiz (hedef kaydini bulmak disinda)');
  const sonDakika = App.computePricingCalendar({ key: 'SEYIR', property: App.getAppData ? App.getAppData().villas.SEYIR : { id: P, basePrice: 13000, floor: 8000 } }, BUGUN, null).suggestions.days;
  const otuzuncu = sonDakika.find(d => d.date === gun(30));
  check(otuzuncu && !otuzuncu.reasons.some(r => r.code === 'LAST_MINUTE'),
    'L-248c Son dakika indirimi gercek bugune gore olculur; gelecek ayin ilk gunlerine yanlislikla uygulanmaz');

  // L-252 (M70 F.1.3): bos gece karti ayni takvim hesabindan; eskiden hep 0.
  check(el('pricingGapCountVal').innerText === '1 Gece' && /Seyir \(1\)/.test(el('pricingGapCountMeta').innerText),
    'L-252b Bos gece karti birakilan bosluklari sayar ve mulku adlandirir', el('pricingGapCountVal').innerText + ' | ' + el('pricingGapCountMeta').innerText);

  // L-253 (F.1.1): yillik hedef = aylik portfoy hedeflerinin toplami.
  check(el('pricingAnnualTargetVal').innerText === '₺100.000' && new RegExp(`${yil}: 2/12 ayda hedef`).test(el('pricingAnnualTargetMeta').innerText),
    'L-253a Yillik hedef aylik portfoy hedeflerinin toplamidir; mulk hedefi karismaz, hedefli ay sayisi yazar', el('pricingAnnualTargetVal').innerText + ' | ' + el('pricingAnnualTargetMeta').innerText);

  // L-254 (F.1.4/F.1.5): koruma limitleri yerine fiyat tablosu durumu; uzatma karti kalkti.
  check(el('pricingLadderReadyVal').innerText === '1 / 2' && /Koy Evi/.test(el('pricingLadderReadyMeta').innerText),
    'L-254a "Fiyat tablosu" karti baz ve tabani girili mulkleri sayar, eksik mulku adlandirir');
  check(!/pricingExtensionConversion|pricingGuardrail|UZATMA DÖNÜŞÜMÜ|KORUMA LİMİTLERİ/.test(html) && !/pricingExtensionConversion|pricingGuardrail|pricingProfiles/.test(app),
    'L-254b Uzatma donusumu ve yuklenmeyen fiyat profili kartlari kaldirildi (kullanici karari 19.10)');
  check(el('pricingSelectedPropertyVal').innerText === '₺13.000' && /taban ₺8\.000 · yoğun ₺17\.000/.test(el('pricingSelectedPropertyMeta').innerText),
    'L-254c Secili mulk karti baz, taban ve yogun donem fiyatini gosterir', el('pricingSelectedPropertyMeta').innerText);

  // L-251 (M71/M73): mulk secilince fiyat tablosu ayni ekranda duzenlenir.
  const kart = el('pricingLadderCard').innerHTML;
  check(/id="pricingLadder_base"[^>]*value="13000"/.test(kart) && /id="pricingLadder_floor"[^>]*value="8000"/.test(kart) && /savePricingPriceTable\(/.test(kart),
    'L-251a Fiyatlandirmada baz + taban + basamaklar mulk secilince ayni kartta duzenlenir');
  let ist = kaydedenIstemci();
  const ilkFrom = ist.from.bind(ist);
  ist.from = tablo => {
    const q = ilkFrom(tablo);
    if (tablo === 'properties') q.single = async () => ({ data: { id: P, tenant_id: TENANT, slug: 'SEYIR', name: 'Seyir', base_price: 14000, clean_cost: 0 }, error: null });
    return q;
  };
  App.setSupabaseClient(ist);
  el('pricingLadder_base').value = '14000'; el('pricingLadder_floor').value = '9000'; el('pricingLadder_target').value = ''; el('pricingLadder_premium').value = ''; el('pricingLadder_peak').value = '17000'; el('pricingLadder_heatCost').value = '';
  const fiyatKaydi = await App.savePricingPriceTable('SEYIR');
  const merdiven = ist.yazmalar.find(k => k.tablo === 'property_pricing_ladder');
  const mulkYazma = ist.yazmalar.find(k => k.tablo === 'properties' && k.islem === 'update');
  check(fiyatKaydi === true && mulkYazma && mulkYazma.yuk.base_price === 14000 && merdiven && merdiven.yuk.floor_price === 9000 && merdiven.yuk.peak_price === 17000,
    'L-251b "Fiyat tablosunu kaydet" baz fiyati mulke, basamaklari fiyat merdivenine yazar', JSON.stringify(ist.yazmalar.map(k => k.tablo + ':' + k.islem)));
  el('pricingLadder_base').value = '7000'; el('pricingLadder_floor').value = '9000';
  check(await App.savePricingPriceTable('SEYIR') === false, 'L-251c Taban baz fiyattan yuksekse kayit reddedilir');

  // L-250 (M74, Ş-2/Ş-3): kural tablosu etkin degeri ve kaynagi gosterir; portfoy kurali girilir.
  kur({ tenantSettings: { pricing_rules: { weekend: { enabled: true, pct: 20 } } }, propertyPricingRules: [{ property_id: P, rule_key: 'lastMinute', enabled: true, pct: -5, parameters: { withinDays: 3 } }] });
  const kurallar = App.pricingEffectiveRules(P);
  const kural = k => kurallar.find(r => r.key === k);
  check(kural('weekend').source === 'PORTFOLIO' && kural('weekend').pct === 20 && kural('lastMinute').source === 'PROPERTY' && kural('lastMinute').withinDays === 3 && kural('gapNight').source === 'DEFAULT' && kural('gapNight').pct === -15,
    'L-250b Her kuralin gecerli yuzdesi ve kaynagi: bu mulk > portfoy > sistem varsayilani', JSON.stringify(kurallar));
  App.setPricingProperty(P);
  const tablo = el('pricingRulesTable').innerHTML;
  check(/Sistem varsayılanı/.test(tablo) && /Portföy/.test(tablo) && /Bu mülk/.test(tablo) && /\+%20/.test(tablo),
    'L-250c Kural tablosu varsayilan yuzdeyi gizlemez; "Sistem varsayılanı" diye yazar');
  ist = kaydedenIstemci(); App.setSupabaseClient(ist);
  el('pricingRuleScope').value = 'PORTFOLIO'; el('pricingRuleKey').value = 'specialDay'; el('pricingRulePct').value = '35'; el('pricingRuleEnabled').checked = true; el('pricingRuleParameter').value = '';
  await App.savePricingRuleSettings();
  const portfoy = ist.yazmalar.find(k => k.tablo === 'tenant_settings');
  check(portfoy && portfoy.yuk.key === 'pricing_rules' && portfoy.yuk.value.specialDay.pct === 35 && portfoy.yuk.value.weekend.pct === 20,
    'L-250d Portfoy kurali tenant_settings pricing_rules anahtarina yazilir; diger portfoy kurallari korunur', JSON.stringify(portfoy && portfoy.yuk));
  ist = kaydedenIstemci(); App.setSupabaseClient(ist);
  el('pricingRuleScope').value = 'PROPERTY'; el('pricingRuleKey').value = 'lastMinute';
  await App.resetPricingRuleSetting();
  const silme = ist.yazmalar.find(k => k.tablo === 'property_pricing_rule_settings' && k.islem === 'delete');
  check(silme && silme.filtre.some(([c, v]) => c === 'property_id' && v === P) && silme.filtre.some(([c, v]) => c === 'rule_key' && v === 'lastMinute') && silme.filtre.some(([c, v]) => c === 'tenant_id' && v === TENANT),
    'L-250e "Mülk istisnasını kaldır" kiraci + mulk + kural kapsamli siler; mulk portfoy kuralina doner');

  // L-247 (Ş-1): talep kurali hedef dolulukla calisir, ayin dolulugunu olcer.
  kur();
  const entry = { key: 'SEYIR', property: { id: P, basePrice: 13000, floor: 8000 } };
  const talep = App.computePricingCalendar(entry, BUGUN, 0.05).suggestions;
  const talepAyi = gun(2).slice(0, 7);
  check(talep.days.some(d => d.date.startsWith(talepAyi) && d.status === 'OPEN' && d.reasons.some(r => r.code === 'DEMAND'))
    && !talep.warnings.some(w => w.code === 'OCCUPANCY_TARGET_MISSING')
    && !App.computePricingCalendar(entry, BUGUN, null).suggestions.days.some(d => d.reasons.some(r => r.code === 'DEMAND')),
    'L-247a Hedef doluluk girilince talep kurali calisir; girilmeyince uygulanmaz (eskiden hic gonderilmiyordu)');
  check(app.includes('function computePricingCalendar(entry, today = getTodayStr(), occupancyTarget = pricingExpectedOccupancyDraft)'),
    'L-247b Hesaplayicidaki hedef doluluk fiyat motorunun talep kuralina gider');

  // L-249 (M75): isletme kendi etkinligini ekler; tatil kapatilabilir.
  ist = kaydedenIstemci(); App.setSupabaseClient(ist);
  App.setPricingProperty(P);
  el('pricingEventName').value = 'Caz festivali'; el('pricingEventStart').value = gun(20); el('pricingEventEnd').value = gun(21); el('pricingEventPct').value = '30'; el('pricingEventScope').value = 'PROPERTY';
  await App.savePricingSpecialEvent();
  const etkinlik = ist.yazmalar.find(k => k.tablo === 'tenant_settings');
  const ev = etkinlik && etkinlik.yuk.value.events[0];
  check(etkinlik && etkinlik.yuk.key === 'pricing_special_days' && ev && ev.name === 'Caz festivali' && ev.propertyId === P && ev.pct === 30,
    'L-249a Etkinlik tenant_settings pricing_special_days anahtarina mulk kapsamli ve kendi yuzdesiyle yazilir', JSON.stringify(etkinlik && etkinlik.yuk));
  const etkinlikGunu = App.computePricingCalendar(entry, BUGUN, null).suggestions.days.find(d => d.date === gun(20));
  check(etkinlikGunu && etkinlikGunu.reasons.some(r => r.code === 'SPECIAL_DAY' && r.pct === 30 && r.label === 'Caz festivali')
    && !App.pricingSpecialDaysFor(P2, gun(0), gun(40)).some(d => d.name === 'Caz festivali'),
    'L-249b Etkinlik gunu takvimde kendi yuzdesiyle ozel gun olur; baska mulke tasmaz');
  check(/Caz festivali/.test(el('pricingSpecialDaysList').innerHTML) && /removePricingSpecialEvent\(/.test(el('pricingSpecialDaysList').innerHTML),
    'L-249c Etkinlik ozel gun listesinde gorunur ve silinebilir');
  const tatil = '2026-10-29';
  App.setAppData({ ...App.getAppData(), tenantSettings: { pricing_special_days: { events: [], disabledHolidays: [tatil] } } });
  check(!App.pricingSpecialDaysFor(P, '2026-10-01', '2026-10-31').some(d => d.date === tatil) && App.pricingSpecialDaysFor(P, '2026-10-01', '2026-10-31').some(d => d.date === '2026-10-28'),
    'L-249d Isletme bir resmi tatili ozel gun saymayabilir; digerleri kalir');

  // Gecmis yil ipucu ve hedef hesaplayici metni anlasilir (F.2.1, F.2.8).
  kur();
  App.setPricingProperty(P);
  check(/Geçen yıl .*satılmış gece/.test(el('pricingManagerContainer').innerHTML) && !/— \(en az 8 gece\)/.test(el('pricingManagerContainer').innerHTML),
    'L-253b Gecen yil ipucu kac satilmis gece oldugunu ve kac gerektigini yazar');
  global.document.getElementById('pricingTargetInput').value = '68000';
  global.document.getElementById('pricingExpectedOccupancy').value = '';
  App.recalculatePricingTarget();
  const hedef = el('pricingTargetResult').innerHTML;
  check(/Ay hedefi: ₺68\.000/.test(hedef) && /Kalan:/.test(hedef) && /açık gece satılmalı|mümkün değil/.test(hedef) && /önerinin %80/.test(hedef),
    'L-253c Hedef hesaplayici her satirda gece fiyatini, kac acik gecenin satilmasi gerektigini ve oranini yazar', hedef.slice(0, 600));
  App.setPricingMonth(App.pricingHorizon(BUGUN).months[1]);
  check(el('pricingTargetInput').value === '' || el('pricingTargetInput').value === undefined || el('pricingTargetInput').value === null,
    'L-248d Taslak hedef ay ve mulke ozgudur; baska aya gecince o ayin kaydi gelir', String(el('pricingTargetInput').value));
  App.setPricingMonth(App.pricingHorizon(BUGUN).months[0]);
  check(String(el('pricingTargetInput').value) === '68000', 'L-248e Ay degisip geri gelince girilen hedef kaybolmaz', String(el('pricingTargetInput').value));
}

async function gunlukFiyatDavranisi() {
  // 9.7 F.2.9 (kullanici M76, karar 19.10): gunluk fiyat onaylanir / elle yazilir (phase101) = L-255.
  sahteDom({});
  global.FinancialMetricsService = require('./financial_metrics_service.js');
  const App = require('../app.js');
  const app = read('app.js');
  const sql = read('supabase/migration_phase101_property_daily_prices.sql');
  const el = id => global.document.getElementById(id);
  const BUGUN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const gun = n => new Date(Date.parse(BUGUN + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const P = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000101';
  const kur = (ek = {}, rol = 'owner') => {
    App.setActiveTenant({ id: TENANT, role: rol });
    App.setAppData({
      villas: { SEYIR: { id: P, slug: 'SEYIR', name: 'Seyir', basePrice: 10000, floor: 8000, isActive: true, activationDate: '2025-01-01' } },
      bookings: [], expenses: [], maintenanceTickets: [], propertyPricingRules: [], competitorPriceResearch: [], tenantSettings: {}, targets: [],
      propertyDailyPrices: [], phase78SchemaReady: true, phase101SchemaReady: true, ...ek
    });
    App.clearPricingDaySelection();
    App.setPricingProperty(P);
    App.setPricingMonth(gun(20).slice(0, 7));
  };
  const istemci = () => {
    const ist = kaydedenIstemci();
    const ilk = ist.from.bind(ist);
    ist.from = tablo => {
      const q = ilk(tablo);
      const sonThen = q.then;
      q.then = (res, rej) => {
        const son = ist.yazmalar[ist.yazmalar.length - 1];
        if (son && son.tablo === 'property_daily_prices' && son.islem === 'upsert') return Promise.resolve({ data: son.yuk.map((r, i) => ({ id: 'dp' + i, ...r })), error: null }).then(res, rej);
        return sonThen(res, rej);
      };
      return q;
    };
    App.setSupabaseClient(ist);
    return ist;
  };

  check(/CONSTRAINT property_daily_prices_property_date_key UNIQUE \(property_id, price_date\)/.test(sql) && !/CREATE UNIQUE INDEX[^;]*WHERE/i.test(sql)
    && app.includes(".upsert(rows.map(row => ({ ...row, tenant_id: tenantId })), { onConflict: 'property_id,price_date' })"),
    'L-255a Benzersizlik tam kisit; istemcinin upsert onConflict sutunlari kisitla ayni (CLAUDE.md 5.15)');
  check(/can_read_sales\(tenant_id\)/.test(sql) && (sql.match(/can_manage_tenant\(tenant_id\)/g) || []).length >= 3 && /'property_daily_prices'/.test(sql.slice(sql.indexOf('reset_tenant_data'))),
    'L-255b Okuma satis verisi, yazma yonetim; sifirlama listesinde');

  kur();
  let takvim = el('pricingManagerContainer').innerHTML;
  check(takvim.includes(`togglePricingDay(decodeURIComponent('${encodeURIComponent(gun(20))}'))`) && /Fiyatı onaylamak ya da değiştirmek için açık günlere tıklayın/.test(el('pricingDayEditor').innerHTML),
    'L-255c Yonetici acik gune tiklayarak secer; duzenleyici ne yapilacagini soyler');
  App.togglePricingDay(gun(20)); App.togglePricingDay(gun(21));
  check(/2 gün seçili/.test(el('pricingDayEditor').innerHTML) && /applyPricingDayPrices\('APPROVE'\)/.test(el('pricingDayEditor').innerHTML) && /is-selected/.test(el('pricingManagerContainer').innerHTML),
    'L-255d Secilen gunler isaretlenir; "Öneriyi onayla" ve elle fiyat secenekleri cikar');
  let ist = istemci();
  const oneri20 = App.computePricingCalendar({ key: 'SEYIR', property: App.getAppData().villas.SEYIR }, BUGUN, null).suggestions.days.find(d => d.date === gun(20)).price;
  await App.applyPricingDayPrices('APPROVE');
  let yazma = ist.yazmalar.find(k => k.tablo === 'property_daily_prices' && k.islem === 'upsert');
  check(yazma && yazma.yuk.length === 2 && yazma.yuk.every(r => r.source === 'APPROVED' && r.tenant_id === TENANT && r.property_id === P && r.price === r.suggested_price)
    && yazma.yuk.find(r => r.price_date === gun(20)).price === oneri20,
    'L-255e "Öneriyi onayla" her gune kendi onerisini APPROVED olarak yazar', JSON.stringify(yazma && yazma.yuk));
  check(App.getAppData().propertyDailyPrices.length === 2 && /Onaylı/.test(el('pricingManagerContainer').innerHTML) && /0 gün seçili|Fiyatı onaylamak/.test(el('pricingDayEditor').innerHTML),
    'L-255f Kayittan sonra kart "Onaylı" der, secim temizlenir');

  ist = istemci();
  App.togglePricingDay(gun(22));
  el('pricingDayManualPrice').value = '7000'; el('pricingDayNote').value = 'Son dakika anlasmasi';
  global.confirm = () => false;
  check(await App.applyPricingDayPrices('MANUAL') === false && !ist.yazmalar.some(k => k.tablo === 'property_daily_prices'),
    'L-255g Taban altindaki elle fiyat onay ister; vazgecilirse yazilmaz');
  global.confirm = () => true;
  await App.applyPricingDayPrices('MANUAL');
  yazma = ist.yazmalar.find(k => k.tablo === 'property_daily_prices' && k.islem === 'upsert');
  check(yazma && yazma.yuk[0].price === 7000 && yazma.yuk[0].source === 'MANUAL' && yazma.yuk[0].suggested_price > 0 && yazma.yuk[0].note === 'Son dakika anlasmasi',
    'L-255h Elle fiyat MANUAL yazilir; oneri ve not yaninda saklanir', JSON.stringify(yazma && yazma.yuk));
  check(/₺7\.000/.test(el('pricingManagerContainer').innerHTML) && /Elle fiyat · öneri ₺/.test(el('pricingManagerContainer').innerHTML),
    'L-255i Kart kayitli fiyati gosterir ve oneriyi yanina yazar');

  ist = istemci();
  App.togglePricingDay(gun(22));
  await App.applyPricingDayPrices('REMOVE');
  check(ist.yazmalar.some(k => k.tablo === 'property_daily_prices' && k.islem === 'delete' && k.filtre.some(([c, v]) => c === 'tenant_id' && v === TENANT) && k.filtre.some(([c, v]) => c === 'property_id' && v === P))
    && !App.getAppData().propertyDailyPrices.some(r => r.price_date === gun(22)),
    'L-255j "Kaydı kaldır" kiraci + mulk kapsamli siler; gun yeniden oneriyi gosterir');

  // Rezervasyon formu referansi
  el('resVilla').value = 'SEYIR'; el('resCheckIn').value = gun(20); el('resCheckOut').value = gun(23);
  App.renderBookingPriceCalendarHint();
  check(/Fiyat takvimi: 3 gece/.test(el('resPriceCalendarHint').innerText) && /2 onaylı, 1 öneri/.test(el('resPriceCalendarHint').innerText) && /kendiliğinden değişmez/.test(el('resPriceCalendarHint').innerText),
    'L-255k Rezervasyon formu secilen geceler icin onayli fiyat + oneri toplamini referans olarak gosterir', el('resPriceCalendarHint').innerText);

  // Goc yokken ve rol siniri
  kur({ phase101SchemaReady: false });
  ist = istemci();
  check(!/togglePricingDay\(/.test(el('pricingManagerContainer').innerHTML) && /phase101 göçü bekleniyor/.test(el('pricingDayEditor').innerHTML),
    'L-255l Goc uygulanmadan takvim yalniz oneriyi gosterir ve bunu soyler');
  kur({}, 'sales');
  check(!/togglePricingDay\(/.test(el('pricingManagerContainer').innerHTML) && el('pricingDayEditor').innerHTML === '',
    'L-255m Satis rolu fiyati gorur ama secemez / yazamaz');
}

async function fiyatKontrolTuruDavranisi() {
  // 9.7 kontrol turu (Claude tarayici turu + kullanici kararlari, 19.10): M77-M83 = L-256...L-262.
  sahteDom({});
  global.FinancialMetricsService = require('./financial_metrics_service.js');
  const App = require('../app.js');
  const Svc = require('./pricing_research_service.js');
  const Prompt = require('./chatgpt_prompt_engine.js');
  const el = id => global.document.getElementById(id);
  const BUGUN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const gun = n => new Date(Date.parse(BUGUN + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const para = n => `₺${Math.round(n).toLocaleString('tr-TR')}`;
  const AY = BUGUN.slice(0, 7);
  const P = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000081';
  const P2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000082';
  const P3 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000083';
  const ARASTIRMA = { id: 'r1', tenant_id: TENANT, property_id: P, researched_on: BUGUN, source_kind: 'WEBSITE', source_url: 'https://ornek.example/villa', prices: [{ type: 'WEEKDAY', amount: 9000 }, { type: 'WEEKEND', amount: 14000 }], raw_note: 'not' };
  const kur = (ek = {}, rol = 'owner') => {
    App.setActiveTenant({ id: TENANT, role: rol });
    App.setAppData({
      villas: {
        SEYIR: { id: P, slug: 'SEYIR', name: 'Seyir', basePrice: 13000, floor: 8000, isActive: true, activationDate: '2025-01-01' },
        KOY: { id: P2, slug: 'KOY', name: 'Koy Evi', basePrice: 9000, floor: 6000, isActive: true, activationDate: '2025-01-01' }
      },
      bookings: [
        { id: 'k1', villa: 'SEYIR', propertyId: P, checkIn: `${AY}-01`, checkOut: `${AY}-03`, gross: 26000, status: 'CONFIRMED', channel: 'DIRECT' },
        { id: 'k2', villa: 'KOY', propertyId: P2, checkIn: `${AY}-01`, checkOut: `${AY}-02`, gross: 9000, status: 'CONFIRMED', channel: 'DIRECT' }
      ],
      expenses: [], maintenanceTickets: [], propertyPricingRules: [], competitorPriceResearch: [], tenantSettings: {},
      targets: [{ year: Number(AY.slice(0, 4)), month: Number(AY.slice(5, 7)), revenue_target: 400000, property_id: null }],
      phase78SchemaReady: true, ...ek
    });
  };

  // L-256 (M77, F.3.1/F.3.3): "Tüm mülkler" isletme hedefini ve Finans cirosunu kullanir.
  kur();
  App.setPricingTargetScope('ALL');
  App.setPricingProperty(P);
  App.setPricingMonth(AY);
  // Bos kutu + Hesapla taslagi siler, kayitli hedefe doner.
  el('pricingTargetInput').value = ''; App.recalculatePricingTarget();
  const portfoyCiro = App.computeMonthLedger(AY, 'ALL').netRoomRevenue;
  const seyirCiro = App.computeMonthLedger(AY, 'SEYIR').netRoomRevenue;
  let sonuc = el('pricingTargetResult').innerHTML;
  check(String(el('pricingTargetInput').value) === '400000' && sonuc.includes(`Gerçekleşen: ${para(portfoyCiro)}`) && portfoyCiro !== seyirCiro,
    'L-256a Tum mulkler kapsami Hedefleri Yonet\'teki isletme hedefiyle dolu gelir; gerceklesen Finans cirosudur (tek mulkun cirosu degil)', el('pricingTargetInput').value + ' | ' + portfoyCiro + '/' + seyirCiro + ' | ' + sonuc.slice(0, 300));
  App.setPricingTargetScope('PROPERTY');
  sonuc = el('pricingTargetResult').innerHTML;
  check(String(el('pricingTargetInput').value) === '' && /İşletme hedefi ₺400\.000; bu mülk için hedefi elle girin/.test(sonuc),
    'L-256b Secili mulk kapsaminda isletme hedefi mulke yazilmaz; kutu bos gelir ve neden yazilir', sonuc.slice(0, 300));
  kur({ villas: {
    SEYIR: { id: P, slug: 'SEYIR', name: 'Seyir', basePrice: 13000, floor: 8000, isActive: true, activationDate: '2025-01-01' },
    BAZSIZ: { id: P3, slug: 'BAZSIZ', name: 'Bazsız Ev', basePrice: 0, isActive: true, activationDate: '2025-01-01' }
  } });
  App.setPricingTargetScope('ALL');
  App.setPricingProperty(P);
  check(/Baz fiyatı olmayan 1 mülk hesaba katılmadı: Bazsız Ev/.test(el('pricingTargetResult').innerHTML),
    'L-256c Tum mulklerde baz fiyati olmayan mulk acik gece sayilmaz ve adi yazilir', el('pricingTargetResult').innerHTML.slice(0, 300));

  // L-257 (M78, F.3.2/F.3.5): hedef doluluk ve odak sonucu gorunur degistirir.
  kur();
  App.setPricingTargetScope('ALL');
  App.setPricingProperty(P);
  el('pricingTargetInput').value = String(Math.round(portfoyCiro + 30000));
  el('pricingExpectedOccupancy').value = '50';
  el('pricingFocusSelect').value = 'REVENUE';
  App.recalculatePricingTarget();
  const gelir = el('pricingTargetResult').innerHTML;
  el('pricingFocusSelect').value = 'OCCUPANCY';
  App.recalculatePricingTarget();
  const doluluk = el('pricingTargetResult').innerHTML;
  check(/%50 dolulukla gereken ortalama: ₺[\d.]+ \/ gece/.test(gelir),
    'L-257a Hedef doluluk girilince gereken ortalama fiyat yazilir (hesaplaniyordu, gosterilmiyordu)', gelir.slice(0, 400));
  check(/Seçilen \(Gelir\)/.test(gelir) && /Seçilen \(Doluluk\)/.test(doluluk) && gelir.match(/Seçilen \(Gelir\): ortalama (₺[\d.]+)/)[1] !== doluluk.match(/Seçilen \(Doluluk\): ortalama (₺[\d.]+)/)[1] && /pricing-target-badge/.test(gelir),
    'L-257b Odak degisince secilen secenek basta yazilir ve degisir; satirda "Seçilen" rozeti var');
  App.setPricingTargetScope('ALL');
  el('pricingExpectedOccupancy').value = ''; el('pricingFocusSelect').value = 'BALANCED'; App.recalculatePricingTarget();

  // L-258 (M79, F.2.6): baz fiyati girilmemis mulkte fiyat ₺0 degil "—".
  check(App.pricingBasePriceOf({ basePrice: 0 }) === null && App.pricingBasePriceOf({ basePrice: null }) === null && App.pricingBasePriceOf({ basePrice: 12500 }) === 12500,
    'L-258a Girilmemis baz fiyat (0/null) bilinmiyor sayilir');
  kur({ villas: { BAZSIZ: { id: P3, slug: 'BAZSIZ', name: 'Bazsız Ev', basePrice: 0, isActive: true, activationDate: '2025-01-01' } } });
  const bazsiz = App.computePricingCalendar({ key: 'BAZSIZ', property: { id: P3, basePrice: 0 } }, BUGUN, null).suggestions;
  App.setPricingProperty(P3);
  check(bazsiz.days.filter(d => d.status === 'OPEN').every(d => d.price === null) && bazsiz.warnings.some(w => w.code === 'BASE_PRICE_MISSING')
    && !/<b>₺0<\/b>/.test(el('pricingManagerContainer').innerHTML) && /Baz fiyat girilmemiş/.test(el('pricingManagerContainer').innerHTML),
    'L-258b Baz fiyatsiz mulkte gun kartlari fiyat uydurmaz (eskiden her gun ₺0)', el('pricingManagerContainer').innerHTML.slice(0, 300));

  // L-259 (M80, F.5.1/F.5.2/F.5.4): Turkce etiket ve hata, duzenle/sil.
  check(Svc.errorText(new Error('COMPETITOR_URL_INVALID')) === 'Geçerli bir kaynak bağlantısı girin (https://…).' && Svc.errorText(new Error('COMPETITOR_RESEARCH_SCOPE_REQUIRED')).startsWith('Araştırma tarihi'),
    'L-259a Rakip arastirmasi hatalari ham kod yerine Turkce yazilir');
  kur({ competitorPriceResearch: [ARASTIRMA] });
  App.setPricingProperty(P);
  const liste = el('pricingResearchList').innerHTML;
  check(/Web sitesi/.test(liste) && /Hafta içi: ₺9\.000 · Hafta sonu: ₺14\.000/.test(liste) && !/WEEKEND|WEEKDAY/.test(liste)
    && /editCompetitorResearch\(/.test(liste) && /deleteCompetitorResearch\(/.test(liste),
    'L-259b Liste Turkce etiketlidir; yonetim her kayitta Duzenle / Sil gorur', liste.slice(0, 400));
  kur({ competitorPriceResearch: [ARASTIRMA] }, 'sales');
  App.setPricingProperty(P);
  check(!/editCompetitorResearch\(|deleteCompetitorResearch\(/.test(el('pricingResearchList').innerHTML) && /Hafta sonu: ₺14\.000/.test(el('pricingResearchList').innerHTML),
    'L-259c Satis rolu arastirmayi okur, duzenleyemez / silemez');
  kur({ competitorPriceResearch: [ARASTIRMA] });
  App.setPricingProperty(P);
  const cagrilar = [];
  const arastirmaIstemcisi = {
    from(tablo) {
      const k = { tablo, islem: 'select', filtre: [], yuk: null };
      cagrilar.push(k);
      const q = {
        insert(y) { k.islem = 'insert'; k.yuk = y; return q; }, update(y) { k.islem = 'update'; k.yuk = y; return q; },
        delete() { k.islem = 'delete'; return q; }, eq(c, v) { k.filtre.push([c, v]); return q; }, select() { return q; },
        async single() { return { data: { ...ARASTIRMA, ...k.yuk, id: 'r1' }, error: null }; },
        then(res, rej) { return Promise.resolve({ data: k.islem === 'delete' ? [{ id: 'r1' }] : [], error: null }).then(res, rej); }
      };
      return q;
    }
  };
  App.setSupabaseClient(arastirmaIstemcisi);
  App.editCompetitorResearch('r1');
  check(el('pricingResearchUrl').value === 'https://ornek.example/villa' && String(el('pricingResearchWeekend').value) === '14000' && el('pricingResearchSaveBtn').textContent === 'Değişikliği kaydet',
    'L-259d Duzenle formu kaydin degerleriyle doldurur');
  el('pricingResearchWeekend').value = '15000';
  await App.saveCompetitorResearch();
  const guncelleme = cagrilar.find(k => k.tablo === 'competitor_price_research' && k.islem === 'update');
  check(guncelleme && guncelleme.filtre.some(([c, v]) => c === 'id' && v === 'r1') && guncelleme.filtre.some(([c, v]) => c === 'tenant_id' && v === TENANT)
    && guncelleme.yuk.prices.some(p => p.type === 'WEEKEND' && p.amount === 15000) && !cagrilar.some(k => k.islem === 'insert'),
    'L-259e Duzenlenen arastirma yeni satir acmaz; ayni kaydi kiraci kapsamli gunceller', JSON.stringify(cagrilar.map(k => k.islem)));
  global.confirm = () => true;
  const silindi = await App.deleteCompetitorResearch('r1');
  const silme = cagrilar.find(k => k.tablo === 'competitor_price_research' && k.islem === 'delete');
  check(silindi === true && silme && silme.filtre.some(([c, v]) => c === 'id' && v === 'r1') && silme.filtre.some(([c, v]) => c === 'tenant_id' && v === TENANT)
    && !(App.getAppData ? App.getAppData() : global.appData || { competitorPriceResearch: [] }).competitorPriceResearch?.some?.(r => r.id === 'r1'),
    'L-259f Yanlis girilen arastirma silinir (kiraci + kayit kapsamli)');
  global.__sonUyari = '';
  el('pricingResearchUrl').value = 'adres-degil'; el('pricingResearchWeekday').value = '9000';
  await App.saveCompetitorResearch();
  check(/Geçerli bir kaynak bağlantısı/.test(global.__sonUyari || '') && !/COMPETITOR_/.test(global.__sonUyari || ''),
    'L-259g Gecersiz baglantida kullanici Turkce sebep gorur', global.__sonUyari);

  // L-260 (M81, F.5.3): rakip fiyati kartta bilgi olarak, oneriyi degistirmeden.
  kur();
  const onerisiz = App.computePricingCalendar({ key: 'SEYIR', property: { id: P, basePrice: 13000, floor: 8000 } }, BUGUN, null).suggestions.days.map(d => d.price);
  kur({ competitorPriceResearch: [ARASTIRMA] });
  const onerili = App.computePricingCalendar({ key: 'SEYIR', property: { id: P, basePrice: 13000, floor: 8000 } }, BUGUN, null).suggestions.days.map(d => d.price);
  App.setPricingProperty(P);
  const kartlar = el('pricingManagerContainer').innerHTML;
  check(/Rakip ₺14\.000 \([\d.]+\) · öneri %\d+ (düşük|yüksek)|Rakip ₺14\.000 \([\d.]+\) · öneri aynı/.test(kartlar) && /Rakip ₺9\.000/.test(kartlar),
    'L-260a Gun karti gunun turune gore rakip fiyatini, tarihini ve farki yazar', kartlar.slice(0, 500));
  check(JSON.stringify(onerisiz) === JSON.stringify(onerili),
    'L-260b Rakip arastirmasi onerilen fiyati degistirmez (kullanici karari)');
  const eski = Svc.latestResearchPrice([{ ...ARASTIRMA, researched_on: '2020-01-01' }], P, 'WEEKEND');
  kur({ competitorPriceResearch: [{ ...ARASTIRMA, researched_on: '2020-01-01' }] });
  App.setPricingProperty(P);
  check(eski && eski.amount === 14000 && /, eski\)/.test(el('pricingManagerContainer').innerHTML),
    'L-260c 60 gunden eski arastirma "eski" diye isaretlenir');

  // L-261 (M82, F.6.1): ChatGPT baglami mulkun verisini tasir.
  kur({ competitorPriceResearch: [ARASTIRMA] });
  App.setPricingProperty(P);
  const baglam = App.pricingChatGptContext();
  const komut = Prompt.buildPrompt({ kind: 'PRICE_RULE_QUESTION', context: baglam, question: 'Soru', today: BUGUN }).prompt;
  check(baglam.competitorResearch && baglam.competitorResearch.weekend === 14000 && baglam.competitorResearch.weekday === 9000 && /Rakip araştırması \(kullanıcının girdiği/.test(komut) && /14000/.test(komut),
    'L-261a Kaydedilen rakip arastirmasi ChatGPT sorusuna gider (eskiden olmayan alandan okunuyordu)', komut);
  check(baglam.next30 && baglam.next30.sellableNights > 0 && Number.isFinite(baglam.next30.avgSuggestedWeekday) && /Sonraki 30 gün:/.test(komut),
    'L-261b Onumuzdeki 30 gunun satilan/satilabilir gecesi ve onerilen fiyat ortalamasi gider');
  check(/Kurallar:\n- Hafta sonu: \+%25 \(sistem varsayılanı\)/.test(komut) && !/weekendPct/.test(komut) && !('questionId' in baglam) && !/Kural: WEEKEND/.test(komut),
    'L-261c Kurallar kaynaklariyla Turkce satir; sabit "Kural: WEEKEND" yok', komut);

  // L-262 (M83, F.7.1): satis rolu bakimla kapali gunu "Acik" gormez.
  kur({ maintenanceTickets: [], propertyClosures: [{ property_id: P, start_date: gun(3), end_date: gun(4) }], propertyClosuresReady: true }, 'sales');
  const kapali = App.computePricingCalendar({ key: 'SEYIR', property: { id: P, basePrice: 13000, floor: 8000 } }, BUGUN, null).suggestions.days;
  check(kapali.find(d => d.date === gun(3))?.status === 'BLOCKED' && kapali.find(d => d.date === gun(4))?.status === 'BLOCKED' && kapali.find(d => d.date === gun(5))?.status !== 'BLOCKED',
    'L-262a Ariza okuyamayan rol sunucunun kapali tarihleriyle gunu "Kapali" gorur', JSON.stringify(kapali.slice(0, 6).map(d => d.date + ':' + d.status)));
  kur({ maintenanceTickets: [], propertyClosures: [], propertyClosuresReady: false }, 'sales');
  App.setPricingProperty(P);
  check(/Bakımla kapalı günler bu rolde okunamadı/.test(el('pricingManagerContainer').innerHTML),
    'L-262b Kapali tarihler okunamazsa takvim bunu soyler; gunu sessizce acik gostermez');
  const rpcler = [];
  const rpcIstemci = hata => ({ rpc: async (ad, args) => { rpcler.push([ad, args]); return hata ? { data: null, error: { code: 'PGRST202', message: 'yok' } } : { data: [{ property_id: P, start_date: gun(1), end_date: gun(1) }], error: null }; } });
  App.setSupabaseClient(rpcIstemci(false));
  const defter = await App.loadPropertyClosures(TENANT, { mayReadLedger: true, mayReadSales: true });
  const satis = await App.loadPropertyClosures(TENANT, { mayReadLedger: false, mayReadSales: true });
  App.setSupabaseClient(rpcIstemci(true));
  const gocsuz = await App.loadPropertyClosures(TENANT, { mayReadLedger: false, mayReadSales: true });
  check(Array.isArray(defter) && defter.length === 0 && rpcler.length === 2 && rpcler[0][0] === 'get_property_closures' && rpcler[0][1].p_tenant_id === TENANT && satis.length === 1 && gocsuz === null,
    'L-262c Defter okuyucusu arizanin kendisini kullanir; satis/izleyici yalniz kapali tarih RPC\'sini cagirir; goc yoksa null', JSON.stringify({ defter, satis, gocsuz, rpcler }));
  const sql = read('supabase/migration_phase103_property_closures_for_sales.sql');
  const govde = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_property_closures'), sql.indexOf('REVOKE ALL ON FUNCTION public.get_property_closures'));
  check(govde.indexOf('can_read_sales') > 0 && govde.indexOf('can_read_sales') < govde.indexOf('FROM public.maintenance_tickets')
    && govde.indexOf('auth.uid()') < govde.indexOf('FROM public.maintenance_tickets')
    && !/mt\.(title|description|estimated_cost|actual_cost|assigned_to)/.test(govde)
    && /REVOKE ALL ON FUNCTION public\.get_property_closures\(UUID, DATE, DATE\) FROM anon/.test(sql)
    && /VALUES \(103, 'phase103_property_closures_for_sales'\)/.test(sql)
    && read('supabase/migration_manifest.txt').includes('migration_phase103_property_closures_for_sales.sql'),
    'L-262d phase103: yetki kayit aramadan once, ariza ayrintisi donmez, anon kapali, schema_migrations 103, manifestte');
}

async function fiyatKararlariDavranisi() {
  // Urun kararlari 20.10 (KF-2, KF-3): M84-M85 = L-263, L-264.
  sahteDom({});
  global.FinancialMetricsService = require('./financial_metrics_service.js');
  const App = require('../app.js');
  const el = id => global.document.getElementById(id);
  const BUGUN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const gun = n => new Date(Date.parse(BUGUN + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const P = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000091';
  const kur = (rol, ek = {}) => {
    App.setActiveTenant({ id: TENANT, role: rol });
    App.setAppData({
      villas: { SEYIR: { id: P, slug: 'SEYIR', name: 'Seyir', basePrice: 13000, floor: 8000, isActive: true, activationDate: '2025-01-01' } },
      bookings: [], expenses: [], maintenanceTickets: [], propertyPricingRules: [], competitorPriceResearch: [], tenantSettings: {}, targets: [],
      propertyDailyPrices: [{ property_id: P, price_date: gun(1), price: 15000, source: 'APPROVED', suggested_price: 13000 }],
      phase78SchemaReady: true, phase101SchemaReady: true, propertyClosuresReady: true, ...ek
    });
    App.setPricingProperty(P);
    App.setPricingMonth(gun(1).slice(0, 7));
    return el('pricingManagerContainer').innerHTML;
  };
  check(read('index.html').includes('Önümüzdeki 30 günde hangi tarihlerde fiyatı değiştirmeliyim? Her tarih için önerilen fiyatı, gerekçeyi ve riski sırala.'),
    'L-263a ChatGPT hazir sorularinda 30 gunluk eylem sorusu var (KF-2)');
  const satis = kur('sales');
  check(satis.includes('Onaylı fiyat · öneri ₺') && satis.includes('<b>₺15.000</b>') && satis.includes('pricing-day-proposal">Öneri · yönetici onayı bekleniyor') && !satis.includes('togglePricingDay('),
    'L-264a Satisci onayli fiyati esas gorur; onaysiz gunde "Öneri · yönetici onayı bekleniyor"; secemez/onaylayamaz', satis.slice(0, 500));
  const sahip = kur('owner');
  check(sahip.includes('pricing-day-proposal">Öneri · onaylanmadı') && !sahip.includes('yönetici onayı bekleniyor'),
    'L-264b Yonetim onaysiz oneriyi "onaylanmadı" diye gorur (kendisi onaylayabilir)');
  const gocsuz = kur('sales', { phase101SchemaReady: false, propertyDailyPrices: [] });
  check(gocsuz.includes('pricing-day-proposal">Öneri<') && !gocsuz.includes('onay bekleniyor') && !gocsuz.includes('onaylanmadı'),
    'L-264c Gunluk fiyat defteri yokken yalniz "Öneri" yazar; olmayan bir onay surecini vaat etmez');
  kur('sales');
  el('resVilla').value = 'SEYIR'; el('resCheckIn').value = gun(1); el('resCheckOut').value = gun(4);
  App.renderBookingPriceCalendarHint();
  check(String(el('resPriceCalendarHint').innerText).includes('1 onaylı, 2 öneri (yönetici onayı bekleniyor)'),
    'L-264d Rezervasyon formu satisciya onaysiz gecelerin yonetici onayi bekledigini soyler', el('resPriceCalendarHint').innerText);
}

async function minimumGeceDavranisi() {
  // Urun karari KF-1 (20.10): minimum gece satis kisitidir, varsayilan kapali. M86 = L-265.
  sahteDom({});
  global.FinancialMetricsService = require('./financial_metrics_service.js');
  const App = require('../app.js');
  const el = id => global.document.getElementById(id);
  const BUGUN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const gun = n => new Date(Date.parse(BUGUN + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const P = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000086';
  const P2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000087';
  // Rezervasyonlar gun(10)-gun(12) ve gun(14)-gun(20): aralarinda 2 gecelik bosluk (12, 13).
  const kur = (rol, minStay, ek = {}) => {
    App.setActiveTenant({ id: TENANT, role: rol });
    App.setAppData({
      villas: {
        SEYIR: { id: P, slug: 'SEYIR', name: 'Seyir', basePrice: 13000, floor: 8000, isActive: true, activationDate: '2025-01-01' },
        KOY: { id: P2, slug: 'KOY', name: 'Koy', basePrice: 9000, floor: 6000, isActive: true, activationDate: '2025-01-01' }
      },
      bookings: [
        { id: 'm1', villa: 'SEYIR', propertyId: P, checkIn: gun(10), checkOut: gun(12), gross: 26000, status: 'CONFIRMED', channel: 'DIRECT' },
        { id: 'm2', villa: 'SEYIR', propertyId: P, checkIn: gun(14), checkOut: gun(20), gross: 78000, status: 'CONFIRMED', channel: 'DIRECT' }
      ],
      expenses: [], maintenanceTickets: [], propertyPricingRules: [], competitorPriceResearch: [], targets: [], propertyDailyPrices: [],
      tenantSettings: minStay ? { pricing_min_stay: minStay } : {}, phase78SchemaReady: true, phase101SchemaReady: true, propertyClosuresReady: true, ...ek
    });
  };
  const gunler = () => App.computePricingCalendar({ key: 'SEYIR', property: { id: P, basePrice: 13000, floor: 8000 } }, BUGUN, null).suggestions.days;

  kur('owner', null);
  const bos = App.pricingMinStayMap(P, gunler());
  check(bos.size === 0 && App.bookingMinStayViolation('SEYIR', gun(30), gun(31)) === null,
    'L-265a Kural yokken kisit yok: her uzunlukta konaklama satilabilir (varsayilan kapali)');

  const kural3 = { rules: [{ id: 'k3', name: 'Yaz', propertyId: P, start: null, end: null, minNights: 3, enabled: true }] };
  kur('owner', kural3);
  const harita = App.pricingMinStayMap(P, gunler());
  check(harita.get(gun(12))?.sellable === false && harita.get(gun(13))?.sellable === false && harita.get(gun(25))?.sellable === true && harita.get(gun(25))?.minNights === 3,
    'L-265b En az 3 gece kurali: iki rezervasyon arasindaki 2 gecelik bosluk satilamaz; uzun bosluk satilir', JSON.stringify([...harita].slice(0, 16)));
  check(App.pricingMinStayMap(P2, App.computePricingCalendar({ key: 'KOY', property: { id: P2, basePrice: 9000, floor: 6000 } }, BUGUN, null).suggestions.days).size === 0,
    'L-265c Mulk kurali baska mulke uygulanmaz');
  App.setPricingProperty(P);
  App.setPricingMonth(gun(12).slice(0, 7));
  const takvim = el('pricingManagerContainer').innerHTML;
  check(takvim.includes('Açık · satılamaz boşluk') && takvim.includes('Minimum gece kuralı yüzünden bu boşluk satılamaz') && takvim.includes('is-unsellable')
    && takvim.includes('minimum gece kuralı yüzünden satılamaz'),
    'L-265d Takvim kisa boslugu "satilamaz" isaretler ve ust uyarida sayar', takvim.slice(0, 400));
  check(el('pricingMinStayList').innerHTML.includes('En az 3 gece') && el('pricingMinStayList').innerHTML.includes('removePricingMinStayRule('),
    'L-265e Kural listesi yonetime kaldirma dugmesiyle gorunur');

  const coklu = { rules: [
    { id: 'p', name: 'Portfoy', propertyId: null, start: null, end: null, minNights: 2, enabled: true },
    { id: 't', name: 'Temmuz', propertyId: P, start: gun(40), end: gun(50), minNights: 5, enabled: true },
    { id: 'x', name: 'Kapali', propertyId: P, start: null, end: null, minNights: 9, enabled: false }] };
  kur('owner', coklu);
  check(App.pricingMinNightsFor(P, gun(45)).minNights === 5 && App.pricingMinNightsFor(P, gun(30)).minNights === 2 && App.pricingMinNightsFor(P2, gun(45)).minNights === 2,
    'L-265f Ayni gune dusen kurallarin en buyugu gecerli; tarih araligi ve kapsam uygulanir; kapali kural sayilmaz');
  const ihlal = App.bookingMinStayViolation('SEYIR', gun(45), gun(48));
  check(ihlal && ihlal.minNights === 5 && ihlal.nights === 3 && App.bookingMinStayViolation('SEYIR', gun(45), gun(50)) === null,
    'L-265g Kisit giris gunune gore olculur; kisa konaklama ihlal sayilir');

  kur('sales', coklu);
  el('resVilla').value = 'SEYIR'; el('resCheckIn').value = gun(45); el('resCheckOut').value = gun(47);
  App.renderBookingPriceCalendarHint();
  check(String(el('resPriceCalendarHint').innerText).includes('Minimum gece kuralı: bu girişte en az 5 gece (Temmuz); seçilen 2 gece.'),
    'L-265h Rezervasyon formu kisa konaklamada kurali ve secilen geceyi yazar', el('resPriceCalendarHint').innerText);
  const kaydet = functionBody(read('app.js'), 'async function saveBooking(');
  check(kaydet.includes('bookingMinStayViolation(villa, checkIn, checkOut)') && kaydet.includes('confirm(') && kaydet.includes('vazgecildi.userCancelled = true') && kaydet.includes('if (err && err.userCancelled) return false;'),
    'L-265i Rezervasyon kaydi kisa konaklamayi sessizce kaydetmez; onay ister (tarihi degismeyen eski kayit haric)');
  App.setPricingProperty(P);
  check(el('pricingMinStayForm').style.display === 'none' && el('pricingMinStayList').innerHTML.includes('En az 5 gece') && !el('pricingMinStayList').innerHTML.includes('removePricingMinStayRule('),
    'L-265j Satisci kurali gorur, ekleyemez / kaldiramaz');
  check(await App.savePricingMinStayRule() === false, 'L-265k Satis rolu kural kaydedemez');

  kur('owner', null);
  const ist = kaydedenIstemci(); App.setSupabaseClient(ist);
  App.setPricingProperty(P);
  el('pricingMinStayNights').value = '1';
  check(await App.savePricingMinStayRule() === false, 'L-265l En az gece 2-60 arasi tam sayi olmali');
  el('pricingMinStayNights').value = '4'; el('pricingMinStayStart').value = gun(40); el('pricingMinStayEnd').value = gun(70); el('pricingMinStayName').value = 'Yaz'; el('pricingMinStayScope').value = 'PORTFOLIO';
  await App.savePricingMinStayRule();
  const yazma = ist.yazmalar.find(k => k.tablo === 'tenant_settings');
  const yeni = yazma && yazma.yuk.value.rules[0];
  check(yazma && yazma.yuk.key === 'pricing_min_stay' && yeni && yeni.minNights === 4 && yeni.propertyId === null && yeni.start === gun(40) && yeni.end === gun(70) && yeni.enabled === true,
    'L-265m Kural tenant_settings pricing_min_stay anahtarina yazilir (goc gerekmez)', JSON.stringify(yazma && yazma.yuk));
  const baglam = App.pricingChatGptContext();
  check(baglam.ruleLines.some(line => line.startsWith('Minimum gece (satış kısıtı): en az 4 gece')),
    'L-265n ChatGPT baglami minimum gece kisitini tasir');
}

async function sezonDavranisi() {
  // Urun karari KF-1 (20.10): sezon kurali, varsayilan yok, taban korumasi en son. M87 = L-266.
  sahteDom({});
  global.FinancialMetricsService = require('./financial_metrics_service.js');
  const App = require('../app.js');
  const E = require('./suggested_price_engine.js');
  const el = id => global.document.getElementById(id);
  const BUGUN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const gun = n => new Date(Date.parse(BUGUN + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const P = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000088';
  const P2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000089';
  const sakin = { weekend: { enabled: false }, specialDay: { enabled: false }, lastMinute: { enabled: false }, gapNight: { enabled: false }, demand: { enabled: false } };
  const fiyat = (seasons, today = '2026-12-28', floorPrice = 9000) => E.suggest({ property: { id: 'p', basePrice: 10000, floorPrice }, today, days: 10, seasons, rules: sakin }).days;

  check(fiyat([]).every(d => d.price === 10000 && !d.reasons.length), 'L-266a Sezon tanimi yokken fiyat degismez (varsayilan yok)');
  const kis = fiyat([{ name: 'Kis', start: '2025-12-20', end: '2026-01-05', pct: -20, repeatYearly: true }]);
  check(kis.find(d => d.date === '2026-12-31').floorApplied && kis.find(d => d.date === '2026-12-31').price === 9000 && kis.find(d => d.date === '2027-01-05').reasons[0].code === 'SEASON' && !kis.find(d => d.date === '2027-01-06').reasons.length,
    'L-266b Her yil sezonu yil sonunu asar; indirim tabanin altina inmez (taban korumasi en son)', JSON.stringify(kis.map(d => d.date + ':' + d.price)));
  const yaz = fiyat([{ name: 'Yaz', start: '2026-07-01', end: '2026-08-31', pct: 30, repeatYearly: false }], '2026-08-30');
  check(yaz.find(d => d.date === '2026-08-31').price === 13000 && yaz.find(d => d.date === '2026-09-01').price === 10000 && yaz.find(d => d.date === '2026-08-31').reasons[0].text === 'sezon (Yaz)',
    'L-266c Tek seferlik sezon yalniz kendi araliginda uygulanir; gerekce sezon adini yazar');
  const ust = E.suggest({ property: { id: 'p', basePrice: 10000, floorPrice: 5000 }, today: '2026-08-28', days: 3, rules: { ...sakin, weekend: { enabled: true, pct: 25, nights: [5, 6] } },
    seasons: [{ name: 'Yaz', start: '2026-07-01', end: '2026-08-31', pct: 30 }] }).days.find(d => d.date === '2026-08-28');
  check(ust.price === 15500 && ust.reasons.map(r => r.code).join('+') === 'SEASON+WEEKEND', 'L-266d Sezon yuzdesi diger kurallarla toplanir (yaz +30 ve hafta sonu +25 = +55)', JSON.stringify(ust));

  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.setAppData({
    villas: { SEYIR: { id: P, slug: 'SEYIR', name: 'Seyir', basePrice: 13000, floor: 8000, isActive: true }, KOY: { id: P2, slug: 'KOY', name: 'Koy', basePrice: 9000, floor: 6000, isActive: true } },
    bookings: [], expenses: [], maintenanceTickets: [], propertyPricingRules: [], competitorPriceResearch: [], targets: [], propertyDailyPrices: [],
    tenantSettings: { pricing_seasons: { seasons: [
      { id: 'a', name: 'Portfoy kis', start: gun(0), end: gun(60), pct: -10, propertyId: null, enabled: true },
      { id: 'b', name: 'Seyir ozel', start: gun(0), end: gun(60), pct: 15, propertyId: P, enabled: true },
      { id: 'c', name: 'Kapali', start: gun(0), end: gun(60), pct: 90, propertyId: P, enabled: false }] } },
    phase78SchemaReady: true, phase101SchemaReady: true, propertyClosuresReady: true
  });
  check(App.pricingSeasonsFor(P)[0].id === 'b' && App.pricingSeasonsFor(P).length === 2 && App.pricingSeasonsFor(P2).map(x => x.id).join() === 'a',
    'L-266e Mulk sezonu portfoy sezonundan once gelir; kapali sezon sayilmaz; baska mulke mulk sezonu uygulanmaz');
  const takvim = App.computePricingCalendar({ key: 'SEYIR', property: App.getAppData().villas.SEYIR }, BUGUN, null).suggestions.days;
  check(takvim.filter(d => d.status === 'OPEN' && d.date <= gun(60)).every(d => d.reasons.some(r => r.code === 'SEASON' && r.pct === 15)),
    'L-266f Fiyat takvimi isletmenin sezonunu uygular');
  check(!takvim.find(d => d.date === gun(61))?.reasons.some(r => r.code === 'SEASON'), 'L-266f2 Sezon bitince takvimde uygulanmaz');
  App.setPricingProperty(P);
  check(el('pricingSeasonList').innerHTML.includes('Seyir ozel') && el('pricingSeasonList').innerHTML.includes('removePricingSeason('),
    'L-266g Sezon listesi yonetime kaldirma dugmesiyle gorunur');
  check(App.pricingChatGptContext().ruleLines.some(line => line.startsWith('Sezon Seyir ozel: +%15')),
    'L-266h ChatGPT baglami sezonlari tasir');

  const ist = kaydedenIstemci(); App.setSupabaseClient(ist);
  el('pricingSeasonName').value = 'Yeni yil'; el('pricingSeasonStart').value = '2026-12-20'; el('pricingSeasonEnd').value = '2026-01-05'; el('pricingSeasonPct').value = '40'; el('pricingSeasonScope').value = 'PORTFOLIO'; el('pricingSeasonRepeat').checked = false;
  check(await App.savePricingSeason() === false, 'L-266i Bitis baslangictan once ise ("Her yil" degilse) reddedilir');
  el('pricingSeasonRepeat').checked = true;
  await App.savePricingSeason();
  const yazma = ist.yazmalar.find(k => k.tablo === 'tenant_settings');
  const yeni = yazma && yazma.yuk.value.seasons.find(x => x.name === 'Yeni yil');
  check(yazma && yazma.yuk.key === 'pricing_seasons' && yeni && yeni.pct === 40 && yeni.repeatYearly === true && yeni.propertyId === null,
    'L-266j Sezon tenant_settings pricing_seasons anahtarina yazilir (goc gerekmez)', JSON.stringify(yazma && yazma.yuk));
  App.setActiveTenant({ id: TENANT, role: 'sales' });
  App.setPricingProperty(P);
  check(el('pricingSeasonForm').style.display === 'none' && !el('pricingSeasonList').innerHTML.includes('removePricingSeason(') && await App.savePricingSeason() === false,
    'L-266k Satisci sezonu gorur, ekleyemez / kaldiramaz');
}

async function uzunKonaklamaDavranisi() {
  // Urun karari KF-1 (20.10): uzun konaklama indirimi, varsayilan yok, konaklama toplamina, taban gece basina. M88 = L-267.
  sahteDom({});
  global.FinancialMetricsService = require('./financial_metrics_service.js');
  const App = require('../app.js');
  const el = id => global.document.getElementById(id);
  const BUGUN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const gun = n => new Date(Date.parse(BUGUN + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const P = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000090';
  const P2 = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000092';
  const kur = (rol, longStay) => {
    App.setActiveTenant({ id: TENANT, role: rol });
    App.setAppData({
      villas: { SEYIR: { id: P, slug: 'SEYIR', name: 'Seyir', basePrice: 10000, floor: 9500, isActive: true }, KOY: { id: P2, slug: 'KOY', name: 'Koy', basePrice: 9000, floor: 6000, isActive: true } },
      bookings: [], expenses: [], maintenanceTickets: [], propertyPricingRules: [], competitorPriceResearch: [], targets: [], propertyDailyPrices: [],
      tenantSettings: { pricing_rules: { weekend: { enabled: false }, lastMinute: { enabled: false }, gapNight: { enabled: false }, specialDay: { enabled: false }, demand: { enabled: false } }, ...(longStay ? { pricing_long_stay: longStay } : {}) },
      phase78SchemaReady: true, phase101SchemaReady: true, propertyClosuresReady: true
    });
  };
  const ipucu = (giris, cikis, villa = 'SEYIR') => { el('resVilla').value = villa; el('resCheckIn').value = giris; el('resCheckOut').value = cikis; App.renderBookingPriceCalendarHint(); return String(el('resPriceCalendarHint').innerText); };

  kur('owner', null);
  check(App.pricingLongStayFor(P, 30) === null && !ipucu(gun(40), gun(70)).includes('Uzun konaklama'), 'L-267a Kademe yokken indirim yok (varsayilan yok)');
  const kademeler = { tiers: [
    { id: 't7', minNights: 7, pct: 10, propertyId: null, enabled: true },
    { id: 't28', minNights: 28, pct: 20, propertyId: null, enabled: true },
    { id: 'm7', minNights: 7, pct: 4, propertyId: P2, enabled: true },
    { id: 'off', minNights: 3, pct: 50, propertyId: null, enabled: false }] };
  kur('owner', kademeler);
  check(App.pricingLongStayFor(P, 6) === null && App.pricingLongStayFor(P, 7).pct === 10 && App.pricingLongStayFor(P, 30).pct === 20 && App.pricingLongStayFor(P2, 7).pct === 4,
    'L-267b Ulasilan en yuksek kademe gecerli; ayni kademede mulk kurali portfoyden once; kapali kademe sayilmaz');
  const taban = App.applyLongStayDiscount([10000, 10000, 9000], { pct: 10 }, 9500);
  check(taban.total === 9500 + 9500 + 9000 && taban.floorNights === 3,
    'L-267c Indirim geceyi tabanin altina indirmez; zaten tabanin altindaki onayli fiyati yukseltmez', JSON.stringify(taban));
  const yedi = ipucu(gun(40), gun(47), 'KOY');
  check(yedi.includes('Uzun konaklama −%4 (7+ gece): ₺63.000 → ₺60.480'),
    'L-267d Rezervasyon formu kademeyi toplam uzerinde gosterir (tutar kendiliginden degismez)', yedi);
  const tabanli = ipucu(gun(40), gun(47));
  check(tabanli.includes('Uzun konaklama −%10 (7+ gece): ₺70.000 → ₺66.500; 7 gece tabanda durdu'),
    'L-267e Taban korumasi gece basina; kac gecenin tabanda durdugunu yazar', tabanli);
  App.setPricingProperty(P);
  check(el('pricingLongStayList').innerHTML.includes('28+ gece') && el('pricingLongStayList').innerHTML.includes('removePricingLongStayTier('),
    'L-267f Kademe listesi yonetime kaldirma dugmesiyle gorunur');
  check(App.pricingChatGptContext().ruleLines.some(line => line.startsWith('Uzun konaklama: 7+ gece −%10')),
    'L-267g ChatGPT baglami uzun konaklama kademelerini tasir');
  const ist = kaydedenIstemci(); App.setSupabaseClient(ist);
  el('pricingLongStayNights').value = '14'; el('pricingLongStayPct').value = '95';
  check(await App.savePricingLongStayTier() === false, 'L-267h Indirim 0-90 arasinda olmali');
  el('pricingLongStayPct').value = '15'; el('pricingLongStayScope').value = 'PROPERTY';
  await App.savePricingLongStayTier();
  const yazma = ist.yazmalar.find(k => k.tablo === 'tenant_settings');
  const yeni = yazma && yazma.yuk.value.tiers.find(t => t.minNights === 14);
  check(yazma && yazma.yuk.key === 'pricing_long_stay' && yeni && yeni.pct === 15 && yeni.propertyId === P,
    'L-267i Kademe tenant_settings pricing_long_stay anahtarina yazilir (goc gerekmez)', JSON.stringify(yazma && yazma.yuk));
  kur('sales', kademeler);
  App.setPricingProperty(P);
  check(el('pricingLongStayForm').style.display === 'none' && !el('pricingLongStayList').innerHTML.includes('removePricingLongStayTier(') && await App.savePricingLongStayTier() === false,
    'L-267j Satisci kademeleri gorur, ekleyemez / kaldiramaz');
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
  await giderAsamasiDavranisi();
  await fiyatBakimDavranisi();
  await fiyatEkraniDavranisi();
  await gunlukFiyatDavranisi();
  await fiyatKontrolTuruDavranisi();
  await fiyatKararlariDavranisi();
  await minimumGeceDavranisi();
  await sezonDavranisi();
  await uzunKonaklamaDavranisi();
} catch (error) {
  failed++;
  console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
} finally {
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
}
main();
