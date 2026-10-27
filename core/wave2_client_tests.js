/**
 * LEXBNB DALGA 2 — ISTEMCI GUVENLIGI VE DURUSTLUK (CEVRIMDISI)
 *
 *   L-06  Uyelik okunamazsa ikinci isletme ACILMAZ.
 *   L-08  Icinde bulunulan ay icin "Kapat" pasif ve nedeni yazili.
 *   L-16  Ice aktarma dosya boyutu ve satir siniri.
 *   L-21  "Beni hatirla" gercekten calisir: isaretsizse oturum sekmede kalir,
 *         isaretliyse en fazla 30 gun.
 *   L-22  Ham sunucu mesaji kullaniciya gitmez; uygulamanin metni degismez.
 *   L-24  Yakalanmamis hata kapisi: eklenti ve zararsiz uyari elenir, tekrar
 *         seyreltilir.
 *
 * Dis sisteme baglanmaz.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
async function test(ad, fn) {
  try { await fn(); passed++; console.log(`[PASS] ${ad}`); }
  catch (e) { failed++; console.error(`[FAIL] ${ad}\n       ${e.message}`); }
}

function bellekDepo() {
  const d = {};
  return {
    _d: d,
    getItem: k => (Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); },
    removeItem: k => { delete d[k]; }
  };
}
global.localStorage = bellekDepo();
global.sessionStorage = bellekDepo();

const App = require('../app.js');
const U = require('./user_facing_errors.js');
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function eleman() {
  return { value: '', hidden: false, disabled: false, title: '', textContent: '', innerHTML: '', innerText: '',
    style: {}, classList: { add() {}, remove() {} } };
}

(async () => {
  // --- L-06 -------------------------------------------------------------------
  await test('L-06 Üyelik okunamazsa kurtarma yolu ikinci işletme AÇMAZ', async () => {
    const cagrilar = [];
    const sorgu = {
      select() { return sorgu; }, eq() { return sorgu; },
      order: async () => ({ data: null, error: { message: 'network timeout' } })
    };
    App.setSupabaseClient({
      rpc: async (ad) => { cagrilar.push(ad); return ad === 'accept_pending_invitations' ? { data: { joined: 0 }, error: null } : { data: { tenant_id: 'x' }, error: null }; },
      from: () => sorgu,
      auth: { getSession: async () => ({ data: {} }) }
    });
    const eski = console.error; console.error = () => {};
    const kutu = eleman();
    global.document = { getElementById: id => (id === 'authErrorMessage' ? kutu : null) };
    global.window = { showToast() {} };
    let sonuc;
    try {
      sonuc = await App.handleAuthenticatedSession({ id: 'u1', email: 'a@b.c', user_metadata: {} });
    } finally { console.error = eski; }
    assert.strictEqual(sonuc, false, 'giriş başarısız sayılmalı');
    assert.ok(!cagrilar.includes('create_tenant_and_owner'), 'ikinci işletme açma çağrısı yapıldı: ' + cagrilar.join(','));
    assert.match(kutu.innerText, /okunamadı/);
  });

  // --- L-08 -------------------------------------------------------------------
  await test('L-08 İçinde bulunulan ay için "Kapat" pasif ve nedeni yazılı', async () => {
    const els = {};
    ['monthCloseCard', 'monthCloseBadge', 'monthCloseDetail', 'monthCloseBtn', 'monthReopenBtn', 'monthCloseHistory']
      .forEach(id => { els[id] = eleman(); });
    global.document = { getElementById: id => els[id] || null };
    App.setActiveTenantForTests({ id: 't', role: 'owner' });
    App.setAppData({ villas: {}, bookings: [], expenses: [], cleaningTasks: [], closedPeriods: [] });
    const buAy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()).slice(0, 7);
    App.setCurrentFilter({ period: buAy, villa: 'ALL' });
    App.renderMonthCloseCard();
    assert.strictEqual(els.monthCloseBtn.disabled, true, 'düğme aktif');
    assert.match(els.monthCloseBtn.title, /bitmeden kapatılamaz/);
    assert.match(els.monthCloseDetail.textContent, /devam ediyor/);
    // Gecen ay kapatilabilir
    const [y, m] = buAy.split('-').map(Number);
    const gecen = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    App.setCurrentFilter({ period: gecen, villa: 'ALL' });
    App.renderMonthCloseCard();
    assert.strictEqual(els.monthCloseBtn.disabled, false, 'biten ay kapatılabilmeli');
  });

  // --- L-16 -------------------------------------------------------------------
  await test('L-16 10.000 satırı aşan CSV okunmadan reddedilir; sınır içindeki okunur', async () => {
    const satirlar = n => Buffer.from(['Misafir;Tutar'].concat(Array.from({ length: n }, (_, i) => `M${i};100`)).join('\n'), 'utf8');
    assert.throws(() => App.buildImportSource(new Uint8Array(satirlar(10001)), 'a.csv'), /en fazla 10\.000 satır/);
    const tamam = App.buildImportSource(new Uint8Array(satirlar(10000)), 'a.csv');
    assert.strictEqual(tamam.rows.length, 10000);
  });

  await test('L-16 10 MB\'ı aşan dosya ayrıştırılmadan reddedilir', async () => {
    const buyuk = new Uint8Array(10 * 1024 * 1024 + 1);
    assert.throws(() => App.buildImportSource(buyuk, 'b.xlsx'), /çok büyük/);
    const isci = fs.readFileSync(path.join(__dirname, 'xlsx_import_worker.js'), 'utf8');
    assert.match(isci, /sheetRows: maxRows \+ 2/, 'SheetJS ayrıştırması satır sınırıyla çağrılmalı');
    assert.match(APP, /\.parse\(XLSX, bytes, IMPORT_MAX_ROWS\)/, 'senkron yol aynı sınırı geçirmeli');
  });

  // --- L-162 ------------------------------------------------------------------
  await test('L-162 Excel ayrıştırması tek kaynakta; uygulama dosyayı arka planda (Worker) okur', async () => {
    const isciYolu = path.join(__dirname, 'xlsx_import_worker.js');
    assert.ok(fs.existsSync(isciYolu), 'core/xlsx_import_worker.js yok');
    assert.ok(!/XLSX\.read\(/.test(APP), 'app.js kendi XLSX.read çağrısını tutmamalı (tek kaynak)');
    const oku = APP.slice(APP.indexOf('function readImportFile('), APP.indexOf('function handleFileImport('));
    assert.match(oku, /buildImportSourceAsync\(/, 'dosya seçimi arka plan yolunu kullanmalı');
    assert.match(APP, /'core\/xlsx_import_worker\.js\?v=[0-9a-f]{8}'/, 'worker adresi damgalı olmalı');
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'stamp_assets.js'), 'utf8'), /SATELLITE_FILES = \[[^\]]*'app\.js'/, 'damgalayıcı app.js içindeki worker adresini görmeli');
  });

  await test('L-162 Worker, gerçek SheetJS ile senkron yolla birebir aynı sonucu verir', async () => {
    const XLSX = require(path.join(__dirname, '..', 'xlsx.full.min.js'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { 'Villa': 'M1', 'Misafir Adı': 'Ayşe Şahin', 'Brüt Tutar (TL)': 72500.5 },
      { 'Villa': 'M2', 'Misafir Adı': 'İlker Işık', 'Brüt Tutar (TL)': 1000 }
    ]), 'Rezervasyonlar');
    const bayt = () => new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    global.XLSX = XLSX;
    let senkron;
    try { senkron = App.buildImportSource(bayt(), 'd.xlsx'); } finally { delete global.XLSX; }
    // Worker kapsamı taklidi: kendi XLSX'ini importScripts ile yükler.
    const vm = require('vm');
    class WorkerGlobalScope {}
    const kapsam = new WorkerGlobalScope();
    const gonderilen = [];
    let yuklenen = null;
    Object.assign(kapsam, { postMessage: m => gonderilen.push(m), importScripts: url => { yuklenen = url; kapsam.XLSX = XLSX; } });
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'xlsx_import_worker.js'), 'utf8'), { self: kapsam, WorkerGlobalScope, globalThis: kapsam });
    kapsam.onmessage({ data: { xlsxUrl: 'https://x/xlsx.full.min.js?v=1', bytes: bayt(), maxRows: 10000 } });
    assert.strictEqual(yuklenen, 'https://x/xlsx.full.min.js?v=1');
    assert.strictEqual(gonderilen.length, 1);
    const g = gonderilen[0];
    assert.ok(g.ok, g.message);
    assert.deepStrictEqual({ sheetNames: g.sheetNames, headers: g.headers, rows: JSON.parse(JSON.stringify(g.rows)) },
      { sheetNames: senkron.sheetNames, headers: senkron.headers, rows: JSON.parse(JSON.stringify(senkron.rows)) });
    assert.strictEqual(g.rows[0]['Brüt Tutar (TL)'], 72500.5, 'sayı sayı kalmalı');
  });

  await test('L-162 Worker cevap vermezse sonlandırılır; sekme donmaz, kullanıcıya söylenir', async () => {
    assert.match(APP, /IMPORT_WORKER_TIMEOUT_MS = \d+/);
    const govde = APP.slice(APP.indexOf('function buildImportSourceAsync('), APP.indexOf('function buildImportSourceAsync(') + 2500);
    assert.match(govde, /setTimeout\([\s\S]*bitir\(\)[\s\S]*reject\(/, 'zaman aşımı worker\'ı bitirip hata vermeli');
    assert.match(govde, /const bitir = \(\) => \{ clearTimeout\(zamanlayici\); w\.terminate\(\); \}/);
    // Worker'ın hata cevabı ve satır sınırı ana tarafta aynı mesajla döner.
    const sahteDoc = { querySelector: () => ({ getAttribute: () => 'xlsx.full.min.js?v=1' }), baseURI: 'https://lexbnb.space/' };
    const eskiDoc = global.document; const eskiW = global.Worker;
    let sonlandi = 0;
    global.document = sahteDoc;
    global.Worker = class { constructor(u) { this.u = u; } postMessage(m) { setTimeout(() => this.onmessage({ data: { ok: true, rowCount: 10001, sheetNames: ['S'], headers: [], rows: [] } }), 0); } terminate() { sonlandi++; } };
    try {
      const pk = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0]);
      await assert.rejects(App.buildImportSourceAsync(pk, 'x.xlsx'), /en fazla 10\.000 satır/);
      assert.strictEqual(sonlandi, 1, 'cevaptan sonra worker sonlandırılmalı');
    } finally { global.document = eskiDoc; global.Worker = eskiW; }
  });

  // --- L-21 -------------------------------------------------------------------
  await test('L-21 "Beni hatırla" işaretsizse oturum yalnız sekmede (sessionStorage) durur', async () => {
    global.localStorage = bellekDepo(); global.sessionStorage = bellekDepo();
    App.setRememberDevicePreference(false);
    const depo = App.createAuthSessionStorage();
    depo.setItem('LEXBNB_SUPA_AUTH', 'tok');
    assert.strictEqual(global.sessionStorage.getItem('LEXBNB_SUPA_AUTH'), 'tok');
    assert.strictEqual(global.localStorage.getItem('LEXBNB_SUPA_AUTH'), null, 'kalıcı depoya yazıldı');
    assert.strictEqual(depo.getItem('LEXBNB_SUPA_AUTH'), 'tok');
  });

  await test('L-21 İşaretliyse kalıcı; süre dolunca oturum okunmaz ve silinir', async () => {
    global.localStorage = bellekDepo(); global.sessionStorage = bellekDepo();
    const t0 = Date.UTC(2026, 8, 1);
    App.setRememberDevicePreference(true, t0);
    let simdi = t0 + 86400000;
    const depo = App.createAuthSessionStorage(() => simdi);
    depo.setItem('LEXBNB_SUPA_AUTH', 'tok');
    assert.strictEqual(global.localStorage.getItem('LEXBNB_SUPA_AUTH'), 'tok');
    assert.strictEqual(depo.getItem('LEXBNB_SUPA_AUTH'), 'tok');
    simdi = t0 + 8 * 86400000;
    assert.strictEqual(depo.getItem('LEXBNB_SUPA_AUTH'), null, 'süre dolunca oturum dönmemeli');
    assert.strictEqual(global.localStorage.getItem('LEXBNB_SUPA_AUTH'), null, 'süresi dolan oturum silinmeli');
  });

  await test('L-161 "Beni hatırla" en fazla 7 gün ve varsayılan olarak işaretsiz', async () => {
    global.localStorage = bellekDepo(); global.sessionStorage = bellekDepo();
    const t0 = Date.UTC(2026, 9, 1);
    App.setRememberDevicePreference(true, t0);
    let simdi = t0 + 6 * 86400000;
    const depo = App.createAuthSessionStorage(() => simdi);
    depo.setItem('LEXBNB_SUPA_AUTH', 'tok');
    assert.strictEqual(depo.getItem('LEXBNB_SUPA_AUTH'), 'tok', '6. gün oturum durmalı');
    simdi = t0 + 8 * 86400000;
    assert.strictEqual(depo.getItem('LEXBNB_SUPA_AUTH'), null, '7 günden sonra oturum dönmemeli');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const kutu = (html.match(/<input[^>]*id="authRememberCheckbox"[^>]*>/) || [''])[0];
    assert.ok(kutu && !/\bchecked\b/.test(kutu), 'kutu varsayılan işaretli olmamalı');
    assert.match(html, /beni hatırla \(7 gün\)/);
  });

  await test('L-21 Tercih yokken eski sürümün kalıcı oturumu okunmaz ve temizlenir', async () => {
    global.localStorage = bellekDepo(); global.sessionStorage = bellekDepo();
    global.localStorage.setItem('LEXBNB_SUPA_AUTH', 'eski');
    const depo = App.createAuthSessionStorage();
    assert.strictEqual(depo.getItem('LEXBNB_SUPA_AUTH'), null);
    assert.strictEqual(global.localStorage.getItem('LEXBNB_SUPA_AUTH'), null);
  });

  await test('L-21 Tercih giriş isteğinden ÖNCE yazılır; oturum depoya bağdaştırıcıyla bağlanır', async () => {
    const i = APP.indexOf('setRememberDevicePreference(!!remember)');
    const j = APP.indexOf('signInWithPassword({', i);
    assert.ok(i > 0 && j > i, 'tercih signInWithPassword öncesinde yazılmalı');
    assert.match(APP, /storage: createAuthSessionStorage\(\)/);
  });

  // --- L-22 -------------------------------------------------------------------
  await test('L-22 Ham Postgres mesajı gizlenir; uygulamanın cümlesi ve başvuru kodu kalır', async () => {
    const loglar = [];
    const s = U.sanitizeUserMessage('Gider kaydedilemedi: new row violates row-level security policy for table "expenses"',
      { newCode: () => 'ABC123', log: (...a) => loglar.push(a.join(' ')) });
    assert.strictEqual(s, 'Gider kaydedilemedi: Bu işlem için yetkiniz yok. (Hata kodu: ABC123)');
    assert.ok(!/expenses|row-level/.test(s));
    assert.ok(loglar[0].includes('ABC123') && loglar[0].includes('row-level'), 'ayrıntı konsola kodla yazılmalı');
  });

  await test('L-22 Uygulamanın kendi Türkçe mesajı DEĞİŞMEZ', async () => {
    const m = 'Bu dönem (2026-08) kapatılmıştır (Closed Period). Gider eklenemez.';
    assert.strictEqual(U.sanitizeUserMessage(m), m);
    assert.strictEqual(U.sanitizeUserMessage('✅ Gider başarıyla kaydedildi.'), '✅ Gider başarıyla kaydedildi.');
  });

  await test('L-22 Tanınan sınıflar anlaşılır cümleye çevrilir', async () => {
    const k = { newCode: () => 'X', log: () => {} };
    assert.match(U.sanitizeUserMessage('x: duplicate key value violates unique constraint "uq_x"', k), /zaten var/);
    assert.match(U.sanitizeUserMessage('x: Could not find the table \'public.t\' in the schema cache', k), /güncellemesi/);
    assert.match(U.sanitizeUserMessage('x: null value in column "amount" violates not-null constraint', k), /geçersiz/);
  });

  await test('L-22 Tanınmayan giriş hatası ham gösterilmez', async () => {
    const eski = console.error; console.error = () => {};
    try {
      const m = App.getFriendlyAuthErrorMessage({ message: 'AuthApiError: unexpected_failure internal' });
      assert.ok(!/AuthApiError|unexpected_failure/.test(m), m);
    } finally { console.error = eski; }
    assert.strictEqual(App.getFriendlyAuthErrorMessage({ message: 'Invalid login credentials' }), 'E-posta veya şifre hatalı.');
  });

  await test('L-22 Bildirim ve uyarı kanalları ayıklayıcıdan geçer', async () => {
    assert.match(APP, /el\.textContent = String\(mesaj == null \? '' : kullaniciMesaji\(mesaj\)\)/);
    assert.match(APP, /window\.alert = m => asilAlert\(U\.sanitizeUserMessage\(m\)\)/);
  });

  // --- L-20 -------------------------------------------------------------------
  await test('L-20 Supabase hedefi kullanıcı deposundan ya da sayfa globalinden okunmaz', async () => {
    const kod = APP.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/getItem\('LEXBNB_SUPABASE_URL'\)/.test(kod), 'localStorage adresi okunuyor');
    assert.ok(!/window\.LEXBNB_SUPABASE_URL/.test(kod), 'sayfa globali adresi değiştirebiliyor');
    assert.match(kod, /const SUPABASE_URL = DEFAULT_SUPABASE_URL;/);
    assert.match(kod, /removeItem\('LEXBNB_SUPABASE_URL'\)/, 'eski kalıcı değer temizlenmeli');
  });

  // --- L-24 -------------------------------------------------------------------
  await test('L-24 Yakalanmamış hata kapısı: eklenti ve ResizeObserver elenir, tekrar seyreltilir', async () => {
    let t = 0;
    const kapi = U.createGlobalErrorGate(() => t, 'https://lexbnb.space');
    assert.strictEqual(kapi({ message: 'ResizeObserver loop limit exceeded' }), false);
    assert.strictEqual(kapi({ message: 'x', filename: 'chrome-extension://abc/c.js' }), false);
    assert.strictEqual(kapi({ message: 'x', filename: 'https://baska.site/a.js' }), false);
    assert.strictEqual(kapi({ message: 'TypeError', filename: 'https://lexbnb.space/app.js' }), true);
    t = 5000;
    assert.strictEqual(kapi({ message: 'TypeError' }), false, '10 sn içinde ikinci kez gösterilmemeli');
    t = 11000;
    assert.strictEqual(kapi({ reason: new Error('red') }), true);
  });

  await test('L-24 error ve unhandledrejection dinleyicileri kullanıcıya görünür mesaj verir', async () => {
    assert.match(APP, /addEventListener\('error'/);
    assert.match(APP, /addEventListener\('unhandledrejection'/);
    assert.match(APP, /Beklenmeyen bir hata oluştu/);
  });

  console.log(`\n${passed} geçti, ${failed} başarısız`);
  if (failed > 0) process.exit(1);
})();
