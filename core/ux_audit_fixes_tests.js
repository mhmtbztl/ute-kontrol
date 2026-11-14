/**
 * LEXBNB — UX INCELEMESI DUZELTMELERI (docs/ux-audit-2026-11-14.md)
 *
 * U-01  Tekrarlayan gider silmede "Vazgec" kaydi siliyordu.
 * U-02  Silme/iptal onaylari mavi "Tamam" ile soruluyordu; sonuc yazmiyordu.
 * U-04  Rezervasyon formu ilk villa secili aciliyordu.
 * U-06  Esc / × / Vazgec dolu formu uyarisiz kapatiyordu.
 * U-07  Bos formda onizleme "−₺2.500 kalan" gosteriyordu.
 * U-10  "SEYİR (8)" sayisinin ne oldugu yazmiyordu.
 * U-11  Iptal gizli bolumdeydi, Sil gorunurdu.
 *
 * Dis sisteme baglanmaz.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const APP = read('app.js');
const INDEX = read('index.html');
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`[PASS] ${name}`); } catch (err) {
    failed++; console.error(`[FAIL] ${name}\n       ${err && err.message}`);
  }
}
function functionBody(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return '';
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  return '';
}

// ui_dialog.js'in kullandigi kadar DOM.
function fakeDom() {
  class Node {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.style = {}; this.textContent = ''; this.className = ''; this.parentNode = null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    click() { (this.listeners.click || []).forEach(f => f({ preventDefault() {} })); }
    focus() { doc.activeElement = this; }
    get classList() { const n = this; return { add: c => { n.className = (n.className + ' ' + c).trim(); }, remove: c => { n.className = n.className.split(/\s+/).filter(x => x !== c).join(' '); }, contains: c => n.className.split(/\s+/).includes(c) }; }
    all() { return this.children.flatMap(c => [c, ...c.all()]); }
  }
  const doc = { body: new Node('body'), activeElement: null, createElement: t => new Node(t), createTextNode: t => Object.assign(new Node('#text'), { textContent: t }) };
  doc.body.all = Node.prototype.all;
  return { doc, HTMLElement: Node };
}

(async () => {
  const Dialog = require('./ui_dialog.js');

  await test('U-01a askChoice: DOM yoksa yikici olmayan yedek (null) doner', async () => {
    assert.strictEqual(await Dialog.askChoice({ choices: [{ value: 'one', text: 'Sil' }] }), null);
  });

  await test('U-01b askChoice penceresi: Vazgec ayri dugme, null doner; odak Vazgec\'te; secenek kendi degerini doner', async () => {
    const { doc, HTMLElement } = fakeDom();
    const g = globalThis;
    const eski = { document: g.document, HTMLElement: g.HTMLElement, setTimeout: g.setTimeout };
    g.document = doc; g.HTMLElement = HTMLElement;
    g.setTimeout = f => f();
    try {
      const buttons = () => doc.body.all().filter(n => n.tagName === 'BUTTON');
      let p = Dialog.askChoice({ title: 'Tekrarlayan gideri sil', choices: [{ value: 'one', text: 'Yalnız bunu sil', danger: true }, { value: 'all', text: 'Bu ve sonraki 2 tekrarı sil', danger: true }] });
      const etiketler = buttons().map(b => b.textContent);
      assert.deepStrictEqual(etiketler, ['×', 'Vazgeç', 'Yalnız bunu sil', 'Bu ve sonraki 2 tekrarı sil']);
      assert.strictEqual(doc.activeElement && doc.activeElement.textContent, 'Vazgeç', 'odak Vazgec');
      assert.ok(buttons()[2].className.includes('btn-danger'));
      buttons().find(b => b.textContent === 'Vazgeç').click();
      assert.strictEqual(await p, null);
      p = Dialog.askChoice({ choices: [{ value: 'one', text: 'Yalnız bunu sil' }, { value: 'all', text: 'Hepsini sil' }] });
      buttons().find(b => b.textContent === 'Hepsini sil').click();
      assert.strictEqual(await p, 'all');
      p = Dialog.askChoice({ choices: [{ value: 'one', text: 'Yalnız bunu sil' }] });
      buttons().find(b => b.textContent === '×').click();
      assert.strictEqual(await p, null, '× vazgecmektir');
      assert.strictEqual(doc.body.children.length, 0, 'pencere kapanir');
    } finally { Object.assign(g, eski); }
  });

  await test('U-01c deleteExpenseUI tekrarli seride tek secenekli pencere sorar; eski "Iptal: yalniz bu kayit silinir" metni yok', () => {
    const govde = functionBody(APP, 'async function deleteExpenseUI(');
    assert.match(govde, /uiAskChoice\(/);
    assert.match(govde, /if \(secim !== 'one' && secim !== 'all'\) return false;/);
    assert.doesNotMatch(APP, /İptal: yalnız bu kayıt silinir/);
  });

  await test('U-02 Silme ve iptal onaylari kirmizi fiil dugmesiyle sorulur; genel "emin misiniz" silme metni kalmadi', () => {
    const cagrilar = APP.split('uiAskConfirm(').slice(1).map(s => s.slice(0, 400));
    const silme = cagrilar.filter(c => /sil(in|mek)|kaldır|arşivle|iptal et|ekipten çıkar|pasifleştir/i.test(c.split('\n').slice(0, 6).join(' ')));
    assert.ok(silme.length >= 15, 'silme onayi sayisi ' + silme.length);
    const eksik = silme.filter(c => !/danger: (true|!isActive)/.test(c.split('}))')[0]) && !/^\{\s*\n\s*title: 'Rezervasyonu iptal et'/.test(c));
    assert.deepStrictEqual(eksik.map(c => c.slice(0, 90)), []);
    assert.doesNotMatch(APP, /rezervasyonunu silmek istediğinize emin misiniz/);
    const rez = functionBody(APP, 'async function deleteBooking(');
    assert.match(rez, /okText: 'Kalıcı olarak sil'/);
    assert.match(rez, /geri alınamaz/);
    assert.match(rez, /iptal edin/);
  });

  await test('U-04 Rezervasyon villa secicileri bos, secilemez "Villa seçin" ile baslar ve required kalir', () => {
    assert.match(APP, /const BOOKING_VILLA_SELECTS = \['resVilla', 'quickBookingVilla'\];/);
    const yer = functionBody(APP, 'function bookingVillaPlaceholderOption(');
    assert.match(yer, /opt\.value = '';/);
    assert.match(yer, /opt\.disabled = true;/);
    assert.match(yer, /opt\.defaultSelected = true;/);
    assert.match(functionBody(APP, 'function updateAllVillaDropdowns('), /BOOKING_VILLA_SELECTS\.includes\(selectId\)\) el\.appendChild\(bookingVillaPlaceholderOption\(\)\)/);
    assert.match(functionBody(APP, 'function openQuickBookingModal('), /<option value="" disabled selected>Villa seçin<\/option>/);
    assert.match(INDEX, /<select id="resVilla" required/);
    assert.match(INDEX, /<select id="quickBookingVilla" required>/);
  });

  await test('U-10 Kapasite "kişi" olarak yazilir, yalniz misafir sayisi girilen formlarda', () => {
    const App = require('../app.js');
    assert.strictEqual(App.villaOptionLabel({ name: 'SEYİR', capacity: 8 }, 'seyir'), 'SEYİR · 8 kişi');
    assert.strictEqual(App.villaOptionLabel({ name: 'SEYİR' }, 'seyir'), 'SEYİR');
    assert.strictEqual(App.villaOptionLabel(null, 'seyir'), 'seyir');
    assert.doesNotMatch(APP, /' \(' \+ v\.capacity \+ '\)'/);
  });

  await test('U-06 Kirli pencerede kapatma dugmesi once sorar; "Forma don" kapatmaz, "Kapat" isareti silip kapatir', async () => {
    const App = require('../app.js');
    const g = globalThis;
    const eskiConfirm = g.confirm;
    const kur = (dirty, sinif = 'close-btn') => {
      const modal = { dataset: dirty ? { dirty: '1' } : {}, classList: { contains: c => c === 'active' || c === 'modal-backdrop' } };
      const btn = { kapandi: 0, classList: { contains: c => c === sinif }, getAttribute: () => (sinif === 'close-btn' ? null : 'closeBookingModal()'),
        closest: sel => (sel === 'button' ? btn : modal), click() { btn.kapandi++; } };
      const ev = { target: btn, durdu: 0, preventDefault() { ev.durdu++; }, stopImmediatePropagation() { ev.durdu++; } };
      return { modal, btn, ev };
    };
    try {
      let soru = 0;
      g.confirm = () => { soru++; return false; };
      let k = kur(true);
      assert.strictEqual(await App.guardUnsavedModalClose(k.ev), false);
      assert.ok(soru === 1 && k.ev.durdu === 2 && k.btn.kapandi === 0 && k.modal.dataset.dirty === '1', 'forma don');
      g.confirm = () => true;
      k = kur(true, 'vazgec');
      assert.strictEqual(await App.guardUnsavedModalClose(k.ev), true);
      assert.ok(k.btn.kapandi === 1 && !k.modal.dataset.dirty, 'kapat, kaydetme');
      soru = 0; g.confirm = () => { soru++; return false; };
      k = kur(false);
      assert.strictEqual(await App.guardUnsavedModalClose(k.ev), false);
      assert.ok(soru === 0 && k.ev.durdu === 0, 'temiz pencere sormadan kapanir');
    } finally { g.confirm = eskiConfirm; }
    assert.match(functionBody(APP, 'function installUnsavedFormGuard('), /addEventListener\('click', guardUnsavedModalClose, true\)/);
    assert.match(functionBody(APP, 'function openQuickBookingModal('), /modal\.classList\.add\('active'\)/);
    assert.match(functionBody(APP, 'function closeQuickBookingModal('), /modal\.classList\.remove\('active'\)/);
  });

  await test('U-07 Tutar girilmeden onizleme kalan hesaplamaz', () => {
    const src = read('core/booking_finance_ui.js');
    const govde = functionBody(src, 'function renderBookingFinancePreview(');
    const bos = govde.indexOf("String(financeValue('resGross')).trim() === ''");
    assert.ok(bos > 0 && bos < govde.indexOf('readExtendedBookingEconomics()'), 'bos tutar kontrolu hesaptan once');
    assert.match(govde, /Rezervasyon tutarını girince kalan tutar hesaplanır\./);
  });

  await test('U-11 Duzenlemede gorunur "Rezervasyonu iptal et" dugmesi; iptal normal kayit yolundan gecer', () => {
    assert.match(INDEX, /<button type="button" id="resCancelBtn" class="btn btn-secondary" hidden data-onclick="cancelBookingFromModal\(\)">Rezervasyonu iptal et<\/button>/);
    assert.match(read('core/action_dispatch.js'), /'cancelBookingFromModal'/);
    const govde = functionBody(APP, 'async function cancelBookingFromModal(');
    assert.match(govde, /statusEl\.value = 'CANCELLED';/);
    assert.match(govde, /form\.requestSubmit\(\)/);
    assert.ok(govde.indexOf('uiAskConfirm(') < govde.indexOf("statusEl.value = 'CANCELLED'"), 'once sorulur');
    assert.match(functionBody(APP, 'function applyBookingFormAccess('), /cancelButton\.hidden = !\(editId && canWrite && durum !== 'CANCELLED'\);/);
  });

  await test('U-03a Secici dolu geceyi isaretler, tam tarihli ekran okuyucu adi yazar (U-21); dugme kapanmaz', () => {
    const DRP = require('./date_range_picker.js');
    const ay = DRP.buildMonth(new Date(2026, 10, 1), { start: null, end: null }, '2026-11-14', { booked: ['2026-11-05', '2026-11-06'] });
    const gun = k => ay.days.find(d => d.key === k);
    assert.ok(gun('2026-11-05').classes.includes('is-booked') && !gun('2026-11-07').classes.includes('is-booked'));
    assert.strictEqual(gun('2026-11-05').label, '5 Kasım 2026, dolu');
    assert.strictEqual(gun('2026-11-14').label, '14 Kasım 2026, bugün');
    const html = DRP.monthHtml(ay, 'data-res-date');
    assert.match(html, /data-res-date="2026-11-05" aria-label="5 Kasım 2026, dolu">5<\/button>/);
    assert.doesNotMatch(html, /disabled/);
    assert.strictEqual(DRP.firstBookedNight('2026-11-03', '2026-11-05', ['2026-11-05']), null, 'dolu gece cikis gunu olabilir');
    assert.strictEqual(DRP.firstBookedNight('2026-11-03', '2026-11-07', ['2026-11-05']), '2026-11-05');
    assert.strictEqual(DRP.firstBookedNight('2026-11-03', '2026-11-03', ['2026-11-03']), null);
  });

  await test('U-03b Dolu geceler kayittaki cakisma kuraliyla ayni: iptal ve duzenlenen kayit haric, baska villa haric', () => {
    const App = require('../app.js');
    const A = '00000000-0000-4000-8000-0000000000a1', B = '00000000-0000-4000-8000-0000000000b2';
    App.setAppData({ ...App.getAppData(), villas: { seyir: { id: A, name: 'SEYİR' }, deniz: { id: B, name: 'Deniz' } }, bookings: [
      { id: 'r1', villa: 'seyir', propertyId: A, checkIn: '2026-11-05', checkOut: '2026-11-07', status: 'CONFIRMED' },
      { id: 'r2', villa: 'seyir', propertyId: A, checkIn: '2026-11-10', checkOut: '2026-11-12', status: 'CANCELLED' },
      { id: 'r3', villa: 'deniz', propertyId: B, checkIn: '2026-11-20', checkOut: '2026-11-21', status: 'CONFIRMED' },
      { id: 'r4', villa: 'seyir', propertyId: A, checkIn: '2026-11-28', checkOut: '2026-12-02', status: 'CONFIRMED' }
    ] });
    const alanlar = { resVilla: 'seyir', resEditId: '' };
    const g = globalThis, eski = g.document;
    g.document = { getElementById: id => (id in alanlar ? { value: alanlar[id] } : null) };
    try {
      const geceler = [...App.resBookedNights()].sort();
      assert.deepStrictEqual(geceler, ['2026-11-05', '2026-11-06', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01']);
      // Secicide bos gorunen her gece kayitta da bos: ayni kurali olc.
      for (const [gir, cik] of [['2026-11-07', '2026-11-10'], ['2026-11-03', '2026-11-05'], ['2026-11-10', '2026-11-12']]) {
        assert.strictEqual(App.checkBookingOverlap(A, gir, cik), null, `${gir}→${cik} bos olmali`);
        assert.strictEqual(require('./date_range_picker.js').firstBookedNight(gir, cik, geceler), null);
      }
      alanlar.resEditId = 'r1';
      assert.ok(!App.resBookedNights().has('2026-11-05'), 'duzenlenen kayit kendi gecesini kapatmaz');
      alanlar.resVilla = '';
      assert.strictEqual(App.resBookedNights(), null, 'villa secilmeden dolu gece cizilmez');
    } finally { g.document = eski; }
    assert.match(App.bookingOverlapMessage({ guest: 'Ali', checkIn: '2026-11-05', checkOut: '2026-11-07' }), /^Bu mülk seçilen tarihlerde başka bir rezervasyonla çakışıyor \(Ali: 05\.11\.2026 – 07\.11\.2026\)\.$/);
  });

  console.log(`\n${passed} geçti, ${failed} başarısız`);
  if (failed) process.exit(1);
})();
