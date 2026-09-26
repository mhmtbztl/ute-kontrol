/**
 * LEXBNB KAPASITE / DOLULUK TUTARLILIGI AGI — CEVRIMDISI
 *
 * 26 Eylul 2026'da gercek bir hesapta olculdu:
 *   - Ana sayfa Eylul dolulugunu "2 / 85 Gece" gosterdi: bes mulkun hepsinin
 *     faaliyet baslangici (activated_on) sisteme eklendikleri gundu (14 Eylul),
 *     oysa Ekim 2025'ten beri 53 rezervasyonlari vardi. Onceki 11 ayin
 *     kapasitesi SIFIR, doluluk ve RevPAR "—", Agustos "79 / 0 Gece".
 *   - Ayni ay icin Finans'taki mulk tablosu %29 diyordu: paydayi secen
 *     regex ters bolusunu kaybetmisti (/^d{4}-d{2}$/) ve hic eslesmiyordu;
 *     tablo her zaman ayin gun sayisina dusuyordu.
 *   - Donem secicisi "Tum Zamanlar" yaziyordu, ekranlar Eylul'u hesapliyordu.
 *
 *  A. Donem secicisi uygulamanin GERCEK filtresini gosterir.
 *  B. Mulk tablosunun paydasi sunucuyla ayni kapasite kurali (aktivasyon +
 *     bakim kesintisi); kapasite yoksa doluluk "—", gun sayisina dusulmez.
 *  C. Kapasite yokken ekran "79 / 0 Gece" yazmaz, nedenini soyler.
 *  D. Istemci kapasitesi sunucuyla ayni: tarihsiz eski P1 bakim kaydi her
 *     ay kapasite dusmez (sunucu dusmuyor).
 *  E. Mulk formu faaliyet baslangicini yazar (activated_on).
 *  F. phase49 kaynak sozlesmesi (davranis: phase49_activation_live_tests).
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
let passed = 0, failed = 0;
const check = (c, n, d) => { if (c) { passed++; console.log(`[PASS] ${n}`); } else { failed++; console.error(`[FAIL] ${n}\n       ${d}`); } };

// --- Sahte DOM (render_pipeline_tests ile ayni ilke: her id bir eleman) -----
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
// Secici: tarayici gibi, innerHTML kurulunca secim ILK secenege duser.
function sahteSecici(id) {
  const el = sahteEleman(id);
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get: () => html,
    set: (v) => { html = String(v); const ilk = html.match(/<option value="([^"]*)"/); el.value = ilk ? ilk[1] : ''; }
  });
  el.querySelector = (q) => {
    const m = String(q).match(/option\[value="([^"]*)"\]/);
    return m && html.includes(`value="${m[1]}"`) ? {} : null;
  };
  return el;
}
const elemanlar = new Map();
global.document = {
  body: sahteEleman('body'), documentElement: sahteEleman('html'),
  getElementById(id) {
    if (!elemanlar.has(id)) elemanlar.set(id, /PeriodFilter$/.test(id) ? sahteSecici(id) : sahteEleman(id));
    return elemanlar.get(id);
  },
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
const FMS = global.FinancialMetricsService;

function veri() {
  return {
    tenantId: '00000000-0000-4000-8000-000000000001', companyName: 'Test İşletme',
    villas: {
      // Ay ortasinda faaliyete gecen mulk: Agustos kapasitesi 15..31 = 17 gece
      YENI: { id: 'pa', slug: 'YENI', name: 'Yeni Ev', basePrice: 10000, cleanCost: 0, activationDate: '2026-08-15' },
      // Tum ay acik, 1-10 Agustos bakimda (kapasiteyi kapatir): 31 - 10 = 21 gece
      ESKI: { id: 'pb', slug: 'ESKI', name: 'Eski Ev', basePrice: 10000, cleanCost: 0, activationDate: '2025-01-01' },
      // Eylulde eklenmis ama Agustos'ta rezervasyonu olan mulk: Agustos kapasitesi 0
      GEC: { id: 'pc', slug: 'GEC', name: 'Geç Eklenen', basePrice: 10000, cleanCost: 0, activationDate: '2026-09-14' }
    },
    bookings: [
      { id: 'b1', villa: 'YENI', propertyId: 'pa', code: 'R-1', guest: 'A', checkIn: '2026-08-20', checkOut: '2026-08-25',
        nights: 5, gross: 50000, net: 50000, otaCommission: 0, cleaningFee: 0, channel: 'DIRECT', status: 'CONFIRMED', pax: 2 },
      { id: 'b2', villa: 'ESKI', propertyId: 'pb', code: 'R-2', guest: 'B', checkIn: '2026-08-12', checkOut: '2026-08-17',
        nights: 5, gross: 50000, net: 50000, otaCommission: 0, cleaningFee: 0, channel: 'DIRECT', status: 'CONFIRMED', pax: 2 },
      { id: 'b3', villa: 'GEC', propertyId: 'pc', code: 'R-3', guest: 'C', checkIn: '2026-08-03', checkOut: '2026-08-10',
        nights: 7, gross: 70000, net: 70000, otaCommission: 0, cleaningFee: 0, channel: 'DIRECT', status: 'CONFIRMED', pax: 2 }
    ],
    maintenance: [
      { id: 'm1', villa: 'ESKI', property_id: 'pb', blocks_availability: true, downtime_start: '2026-08-01', downtime_end: '2026-08-10', priority: 'P2', status: 'OPEN' }
    ],
    expenses: [], cleaningTasks: [], leads: [], marketingCampaigns: [], influencerCollabs: [],
    closedPeriods: [], targets: [], isCleanState: false
  };
}

const APP_SRC = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');

try {
  // --- A. Donem secicisi --------------------------------------------------------
  app.setAppData(veri());
  app.setCurrentFilter({ period: '2026-09', villa: 'ALL' });
  const secici = global.document.getElementById('globalPeriodFilter');
  secici.innerHTML = '<option value="ALL">Tüm Zamanlar</option>'; // index.html'deki yedek liste
  if (typeof app.refreshPeriodSelectors === 'function') app.refreshPeriodSelectors();
  check(secici.value === '2026-09',
    'A1. Açılışta seçici uygulamanın gerçek filtresini (içinde bulunulan ay) gösterir, "Tüm Zamanlar" değil',
    `secici=${secici.value} filtre=2026-09`);

  app.setCurrentFilter({ period: 'ALL' });
  if (typeof app.refreshPeriodSelectors === 'function') app.refreshPeriodSelectors();
  check(secici.value === 'ALL', 'A2. Filtre "Tüm Zamanlar" iken liste yeniden kurulunca seçim korunur', `secici=${secici.value}`);

  // --- B. Mulk tablosunun paydasi --------------------------------------------
  app.setAppData(veri());
  app.setCurrentFilter({ period: '2026-08', villa: 'ALL', startDate: '2026-08-01', endDate: '2026-08-31' });
  let renderHatasi = null;
  try { app.renderFinanceModule(); } catch (e) { renderHatasi = e; }
  const govde = global.document.getElementById('propExecTableBody');
  // Satirlar appendChild ile eklenir; her satirin kendi innerHTML'i okunur.
  const tablo = govde.innerHTML + govde.children.map(c => c.innerHTML).join('');
  const satirDolulugu = (ad) => {
    const i = tablo.indexOf(ad);
    if (i < 0) return 'satir yok';
    const m = tablo.slice(i).match(/Doluluk: ([^<]*)</);
    return m ? m[1].trim() : 'etiket yok';
  };
  const beklenenYeni = (5 / FMS.calculateAvailableNights([veri().villas.YENI], 2026, 8, veri().maintenance) * 100).toFixed(1);
  const beklenenEski = (5 / FMS.calculateAvailableNights([veri().villas.ESKI], 2026, 8, veri().maintenance) * 100).toFixed(1);
  check(!renderHatasi && beklenenYeni === '29.4' && satirDolulugu('Yeni Ev') === `%${beklenenYeni}`,
    'B1. Ay ortasında faaliyete geçen mülkün paydası 17 gece (%29.4), ayın 31 günü değil',
    `tablo=${satirDolulugu('Yeni Ev')} beklenen=%${beklenenYeni} ${renderHatasi ? renderHatasi.message : ''}`);
  check(beklenenEski === '23.8' && satirDolulugu('Eski Ev') === `%${beklenenEski}`,
    'B2. Bakımda kapalı günler paydadan düşer (21 gece, %23.8)', `tablo=${satirDolulugu('Eski Ev')} beklenen=%${beklenenEski}`);
  check(satirDolulugu('Geç Eklenen') === '—',
    'B3. Kapasitesi olmayan ayda doluluk "—"; ayın gün sayısına düşülüp uydurulmaz', `tablo=${satirDolulugu('Geç Eklenen')}`);
  check(!/\/\^d\{4\}-d\{2\}\$\//.test(APP_SRC), 'B4. Ters bölüsünü kaybetmiş ay regex\'i kalmadı', '/^d{4}-d{2}$/ hâlâ app.js\'te');

  // --- C. Satilan gece etiketi --------------------------------------------------
  const etiket = app.formatSoldNightsLabel;
  check(typeof etiket === 'function' && etiket(2, 150) === '2 / 150 Gece',
    'C1. Kapasite varken "satılan / kapasite Gece"', typeof etiket === 'function' ? etiket(2, 150) : 'formatSoldNightsLabel yok');
  const sifir = typeof etiket === 'function' ? etiket(79, 0) : '';
  check(typeof etiket === 'function' && !/\/\s*0\b/.test(sifir) && /kapasite/i.test(sifir) && /79/.test(sifir),
    'C2. Kapasite 0 iken "79 / 0 Gece" yazılmaz; satılan gece ve nedeni yazılır', sifir);
  check(/setEl\('execSoldNightsLabel', formatSoldNightsLabel\(/.test(APP_SRC),
    'C3. Ana sayfa kartı etiketi bu yardımcıyla yazar', 'execSoldNightsLabel doğrudan şablonla yazılıyor');

  // --- D. Istemci kapasitesi sunucuyla ayni ------------------------------------
  const eskiKayit = [{ villa: 'ESKI', property_id: 'pb', priority: 'P1', status: 'OPEN', downtime: 3 }];
  const kap = FMS.calculateAvailableNights([veri().villas.ESKI], 2026, 8, eskiKayit);
  check(kap === 31, 'D1. Tarihsiz eski P1 bakım kaydı kapasiteyi her ay düşürmez (sunucu da düşürmüyor)', `kapasite=${kap}`);

  // --- E. Mulk formu faaliyet baslangicini yazar ------------------------------
  const dbSatiri = app.mapPropertyToDb({ name: 'X', slug: 'X', basePrice: 1, cleanCost: 0, activationDate: '2025-10-01' },
    '00000000-0000-4000-8000-000000000001');
  check(dbSatiri.activated_on === '2025-10-01', 'E1. Yeni mülk kaydı activated_on alanını yazar', JSON.stringify(dbSatiri));
  const bos = app.mapPropertyToDb({ name: 'X', slug: 'X', basePrice: 1, cleanCost: 0 }, '00000000-0000-4000-8000-000000000001');
  check(!('activated_on' in bos), 'E2. Tarih girilmediyse alan gönderilmez (sunucu varsayılanı geçerli)', JSON.stringify(bos));
  check(/id="propActivatedOn"[^>]*type="date"|type="date"[^>]*id="propActivatedOn"/.test(INDEX),
    'E3. Mülk formunda "Faaliyete başlama tarihi" alanı var', 'index.html propActivatedOn yok');
  check(/getElementById\('propActivatedOn'\)\.value/.test(APP_SRC) && /activated_on: /.test(APP_SRC.slice(APP_SRC.indexOf('async function updateProperty'), APP_SRC.indexOf('async function updateProperty') + 4000)),
    'E4. Kaydetme formu okur; güncelleme yolu da activated_on yazar', 'saveProperty/updateProperty alanı kullanmıyor');
  // --- F. phase49 kaynak sozlesmesi -------------------------------------------
  const dosya = path.join(KOK, 'supabase', 'migration_phase49_property_activation_floor.sql');
  const sql = fs.existsSync(dosya) ? fs.readFileSync(dosya, 'utf8') : '';
  // Sunucu mesaji teknik degilse kullaniciya oldugu gibi gider
  // (user_facing_errors); yani cumle Turkce ve anlasilir olmali.
  const UFE = require('./user_facing_errors.js');
  const red = (sql.match(/'ACTIVATION_AFTER_FIRST_BOOKING: [^']*'/) || [''])[0].slice(1, -1);
  check(red && UFE.sanitizeUserMessage(red, { log() {} }) === red && /rezervasyon/i.test(red),
    'E5. Sunucu reddi kullanıcıya anlaşılır Türkçe cümleyle ulaşır', red || 'mesaj yok');
  const manifest = fs.readFileSync(path.join(KOK, 'supabase', 'migration_manifest.txt'), 'utf8');
  check(sql && manifest.includes('migration_phase49_property_activation_floor.sql'), 'F1. phase49 dosyası var ve manifest\'te', 'yok');
  check(/UPDATE public\.properties[\s\S]*MIN\(b\.check_in\)/.test(sql) && /status <> 'CANCELLED'/.test(sql),
    'F2. Geriye dönük düzeltme: activated_on iptal olmayan en erken girişe çekilir', 'backfill yok');
  check(/AFTER INSERT OR UPDATE OF check_in, status, property_id ON public\.bookings/.test(sql) && /SECURITY DEFINER/.test(sql),
    'F3. Daha eski tarihli rezervasyon faaliyet başlangıcını kendiliğinden geri çeker (rol fark etmeksizin)', 'tetikleyici yok');
  check(/ACTIVATION_AFTER_FIRST_BOOKING/.test(sql) && /CLOSED_PERIOD_VIOLATION/.test(sql) && /fn_range_touches_closed_period/.test(sql),
    'F4. Koruma: ilk rezervasyondan sonraya ve kapanmış aya dokunan aktivasyon değişikliği reddedilir', 'koruma eksik');
  check(/REVOKE ALL ON FUNCTION[^;]*FROM anon/.test(sql) && /INSERT INTO public\.schema_migrations\(version, name\)\s*VALUES \(49,/.test(sql)
    && /RAISE NOTICE 'PHASE 49 OK/.test(sql), 'F5. anon geri alınır, schema_migrations kaydı ve doğrulama bloğu var', 'eksik');
} finally {
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
}
