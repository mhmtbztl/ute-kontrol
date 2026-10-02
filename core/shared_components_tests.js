/**
 * LEXBNB ORTAK BILESEN AGI — CEVRIMDISI (A1-G2, 30 Eylul 2026)
 *
 *  A. Tarih araligi secici mantigi (core/date_range_picker.js): konaklama ve
 *     filtre kipleri, gecersiz araligin sessizce uretilmemesi, ay izgarasi.
 *  B. Detay paneli (core/side_panel.js): tek panel, odak, Esc, arka plan,
 *     kapaninca odagin geri donmesi — kucuk bir sahte DOM ile gercekten acilir.
 *  C. Sayfa eylem yuvasi: kayitli eylemi olmayan sayfada gizli (olu dugme yok).
 *  D. Sayfa baglantisi: yukleme sirasi, Misafir rehberi ortak seciciyi kullanir.
 */
const fs = require('fs');
const path = require('path');

const KOK = process.env.LEXBNB_SHARED_TEST_ROOT || path.join(__dirname, '..');
let passed = 0, failed = 0;
const check = (c, n, d) => { if (c) { passed++; console.log(`[PASS] ${n}`); } else { failed++; console.error(`[FAIL] ${n}\n       ${d}`); } };
const dene = (n, fn) => { try { fn(); } catch (e) { failed++; console.error(`[FAIL] ${n}\n       ${e && e.stack}`); } };

// --- Kucuk sahte DOM (yalniz side_panel'in kullandigi API) ------------------
function sahteBelge() {
  const dinleyiciler = {};
  const doc = {
    activeElement: null,
    createElement(tag) { return eleman(doc, tag); },
    addEventListener(tur, fn) { (dinleyiciler[tur] = dinleyiciler[tur] || []).push(fn); },
    removeEventListener(tur, fn) { dinleyiciler[tur] = (dinleyiciler[tur] || []).filter(f => f !== fn); },
    tetikle(tur, olay) { (dinleyiciler[tur] || []).slice().forEach(f => f(Object.assign({ preventDefault() {} }, olay))); },
    dinleyiciSayisi(tur) { return (dinleyiciler[tur] || []).length; }
  };
  doc.body = eleman(doc, 'body');
  return doc;
}
function eleman(doc, tag) {
  const olaylar = {};
  const siniflar = new Set();
  const e = {
    tagName: String(tag).toUpperCase(), children: [], parentNode: null, attrs: {},
    textContent: '', innerHTML: '', hidden: false, id: '', type: '',
    get className() { return [...siniflar].join(' '); },
    set className(v) { siniflar.clear(); String(v).split(/\s+/).filter(Boolean).forEach(s => siniflar.add(s)); },
    classList: { add: s => siniflar.add(s), remove: s => siniflar.delete(s), contains: s => siniflar.has(s) },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; },
    addEventListener(t, fn) { (olaylar[t] = olaylar[t] || []).push(fn); },
    tikla() { (olaylar.click || []).forEach(f => f({})); },
    focus() { doc.activeElement = this; }
  };
  return e;
}

try {
  // --- A. Tarih araligi mantigi ---------------------------------------------
  const DRP = require(path.join(KOK, 'core', 'date_range_picker.js'));
  dene('A. mantik', () => {
    const bos = { start: null, end: null };
    let s = DRP.pick(bos, '2026-10-10', 'stay');
    check(s.start === '2026-10-10' && s.end === null, 'A1. İlk tıklama başlangıcı seçer', JSON.stringify(s));
    check(JSON.stringify(DRP.pick(s, '2026-10-10', 'stay')) === JSON.stringify({ start: '2026-10-10', end: null })
      && JSON.stringify(DRP.pick(s, '2026-10-10', 'range')) === JSON.stringify({ start: '2026-10-10', end: '2026-10-10' }),
      'A2. Aynı gün: konaklamada çıkış olamaz (0 gece), filtrede tek günlük aralıktır', '');
    check(JSON.stringify(DRP.pick(s, '2026-10-05', 'range')) === JSON.stringify({ start: '2026-10-05', end: null }),
      'A3. Başlangıçtan önceki gün yeni başlangıç olur; ters aralık sessizce üretilmez', '');
    const tam = DRP.pick(s, '2026-10-13', 'stay');
    check(DRP.isComplete(tam) && DRP.nightsBetween(tam.start, tam.end) === 3, 'A4. Tamamlanan aralık ve gece sayısı', JSON.stringify(tam));
    check(JSON.stringify(DRP.pick(tam, '2026-11-01', 'stay')) === JSON.stringify({ start: '2026-11-01', end: null }),
      'A5. Tam aralıktan sonra tıklama yeni aralık başlatır', '');
    check(DRP.parseKey('2026-02-30') === null && DRP.parseKey('2026-2-3') === null && DRP.nightsBetween('x', '2026-01-01') === 0,
      'A6. Geçersiz tarih ve biçim reddedilir, gece sayısı 0', '');
    check(JSON.stringify(DRP.pick({ start: null, end: null }, '2026-02-30', 'range')) === JSON.stringify({ start: null, end: null })
      && !DRP.isComplete({ start: '2026-10-10', end: '2026-10-01' }, 'range')
      && !DRP.isComplete({ start: '2026-10-10', end: '2026-10-10' }, 'stay')
      && DRP.isComplete({ start: '2026-10-10', end: '2026-10-10' }, 'range'),
      'A6b. Ortak API geçersiz takvim gününü ve ters/sıfır gecelik aralığı tamamlanmış saymaz', '');
    const ekim = DRP.buildMonth(new Date(2026, 9, 1), { start: '2026-10-10', end: '2026-10-13' }, '2026-10-01');
    const sinif = k => ekim.days.find(d => d.key === k).classes.join(' ');
    check(ekim.lead === 3 && ekim.days.length === 31 && ekim.title === 'Ekim 2026',
      'A7. Ekim 2026 Perşembe başlar (Pazartesi başlangıçlı ızgarada 3 boşluk), 31 gün', `lead=${ekim.lead}`);
    check(/is-today/.test(sinif('2026-10-01')) && /is-start/.test(sinif('2026-10-10')) && /in-range/.test(sinif('2026-10-11'))
      && /is-end/.test(sinif('2026-10-13')) && !/in-range/.test(sinif('2026-10-13')),
      'A8. Bugün, başlangıç, aralık içi ve bitiş işaretleri', sinif('2026-10-11'));
    check(DRP.summaryText({ start: '2026-10-10', end: '2026-10-10' }, 'range') === '1 gün seçildi'
      && DRP.summaryText({ start: '2026-10-10', end: '2026-10-13' }, 'stay') === '3 gece seçildi'
      && DRP.formatHuman('2026-10-10') === '10 Ekim 2026',
      'A9. Özet metni kipe göre: filtrede gün, konaklamada gece', '');
    const root = { contains: () => false };
    const detachedDay = {};
    check(typeof DRP.eventCameFromRoot === 'function'
      && DRP.eventCameFromRoot({ target: detachedDay, composedPath: () => [detachedDay, root] }, root),
      'A9b. Gün düğmesi yeniden çizilip DOM’dan ayrılsa da aynı tıklama dış tıklama sayılmaz', 'takvim ilk günde kapanır');
    // Sablonu kuramayan ortamda (HTML ayristirmayan sahte DOM) mount sayfayi
    // dusurmez: null doner, olay baglamaz (render_pipeline bu yolla calisir).
    const kok = { innerHTML: 'x', classList: { add() {} }, querySelector: () => null, addEventListener() { throw new Error('baglanmamali'); } };
    global.document = { addEventListener() { throw new Error('belgeye baglanmamali'); } };
    let sonuc;
    try { sonuc = DRP.mount(kok, { mode: 'range', today: '2026-10-01' }); } finally { delete global.document; }
    check(sonuc === null && kok.innerHTML === '',
      'A11. Şablon kurulamazsa mount null döner, hiçbir olay bağlamaz', kok.innerHTML);
    const html = DRP.monthHtml({ title: '<b>x</b>', lead: 0, days: [{ key: '2026-10-01', day: 1, classes: ['daterange-day'] }] });
    check(!/<b>x<\/b>/.test(html) && /data-drp-date="2026-10-01"/.test(html),
      'A10. Ay ızgarası HTML\'e giden metni kaçışlar', html.slice(0, 120));
  });

  // --- B. Detay paneli ------------------------------------------------------
  const SP = require(path.join(KOK, 'core', 'side_panel.js'));
  dene('B. panel', () => {
    const doc = sahteBelge();
    const acan = eleman(doc, 'button');
    acan.focus();
    let kapandi = 0;
    const h = SP.open({ title: 'Rezervasyon', subtitle: 'Villa Seyir', bodyHtml: '<p>içerik</p>', onClose: () => kapandi++ }, doc);
    const [arka, panel] = doc.body.children;
    check(SP.isOpen() && doc.body.children.length === 2 && arka.classList.contains('side-panel-backdrop')
      && panel.getAttribute('role') === 'dialog' && panel.getAttribute('aria-modal') === 'true',
      'B1. Açılınca arka plan + dialog paneli eklenir (role, aria-modal)', `${doc.body.children.length} çocuk`);
    const baslik = panel.children[0].children[0].children[0];
    check(baslik.textContent === 'Rezervasyon' && panel.getAttribute('aria-labelledby') === baslik.id && h.body.innerHTML === '<p>içerik</p>',
      'B2. Başlık metin olarak yazılır ve panelle aria-labelledby ile bağlı; gövde verilen HTML', baslik.id);
    check(doc.body.classList.contains('side-panel-open') && doc.activeElement && doc.activeElement.getAttribute('aria-label') === 'Kapat',
      'B3. Sayfa kaydırması kilitlenir, odak kapat düğmesine gelir', String(doc.activeElement && doc.activeElement.tagName));
    SP.open({ title: 'Başka', bodyHtml: '<p>2</p>' }, doc);
    check(doc.body.children.length === 2 && baslik.textContent === 'Başka' && doc.dinleyiciSayisi('keydown') === 1,
      'B4. İkinci açılış yeni panel açmaz, içeriği değiştirir (tek panel, tek dinleyici)', `${doc.body.children.length} çocuk`);
    doc.tetikle('keydown', { key: 'Escape' });
    check(!SP.isOpen() && doc.body.children.length === 0 && !doc.body.classList.contains('side-panel-open')
      && doc.activeElement === acan && doc.dinleyiciSayisi('keydown') === 0,
      'B5. Esc kapatır: DOM temizlenir, kilit kalkar, odak açan elemana döner, dinleyici kalmaz', `acik=${SP.isOpen()}`);
    check(kapandi === 0, 'B6. İkinci açılışta onClose değiştiyse eski geri çağrı çalışmaz', `kapandi=${kapandi}`);
    SP.open({ title: 'X', bodyHtml: '' }, doc);
    doc.body.children[0].tikla();
    check(!SP.isOpen() && doc.body.children.length === 0, 'B7. Arka plana tıklamak kapatır', '');
    check(SP.close() === false, 'B8. Kapalıyken kapatmak zararsızdır', '');
  });

  // --- C. Sayfa eylem yuvasi -------------------------------------------------
  dene('C. eylem yuvasi', () => {
    const cubuk = { hidden: false, innerHTML: 'eski' };
    // app.js yuklenirken belgeye olay dinleyicisi kurar; once yukle, sonra sahte belge.
    const app = require(path.join(KOK, 'app.js'));
    global.document = { getElementById: id => (id === 'pageActionBar' ? cubuk : null) };
    check(typeof app.renderPageActionBar === 'function' && typeof app.registerPageAction === 'function',
      'C1. Eylem yuvası dışa aktarılmış', 'yok');
    if (typeof app.renderPageActionBar === 'function') {
      app.renderPageActionBar('pricing');
      check(cubuk.hidden === true && cubuk.innerHTML === '', 'C2. Kayıtlı eylemi olmayan sayfada çubuk gizli, düğme yok', cubuk.innerHTML);
      let calisti = 0;
      app.registerPageAction('leads', { id: 'rapor', label: 'Rapor <al>', run: () => { calisti++; } });
      app.registerPageAction('leads', { id: 'kod', label: 'Kod', run: "alert(1)" });
      app.renderPageActionBar('guests');
      check(cubuk.hidden === false && /data-onclick="runPageAction\(decodeURIComponent\('rapor'\)\)"/.test(cubuk.innerHTML)
        && /Rapor &lt;al&gt;/.test(cubuk.innerHTML) && !/Kod</.test(cubuk.innerHTML),
        'C3. Alt sayfa (Misafirler) ait olduğu menü kaleminin eylemini gösterir; düğmede kod metni yok, etiket kaçışlanır; metin "iş" reddedilir',
        cubuk.innerHTML);
      global.document.querySelector = sel => (sel === '.tab-content.active' ? { id: 'tab-guests' } : null);
      check(app.runPageAction('rapor') === true && calisti === 1 && app.runPageAction('yok') === false,
        'C4. Düğme kayıttaki fonksiyonu çalıştırır; kayıtsız kimlik hiçbir şey yapmaz', `calisti=${calisti}`);
      delete app.PAGE_ACTIONS.leads;
    }
    delete global.document;
  });

  // --- D. Sayfa baglantisi ---------------------------------------------------
  dene('D. baglanti', () => {
    const INDEX = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
    const APP = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
    const yer = ad => INDEX.indexOf(`src="${ad}`);
    check(yer('core/date_range_picker.js') > 0 && yer('core/side_panel.js') > 0
      && yer('core/date_range_picker.js') < yer('app.js') && yer('core/side_panel.js') < yer('app.js'),
      'D1. Ortak bileşenler app.js\'ten önce yüklenir', `drp=${yer('core/date_range_picker.js')} sp=${yer('core/side_panel.js')} app=${yer('app.js')}`);
    check(/id="pageActionBar"[^>]*hidden/.test(INDEX), 'D2. Sayfa eylem yuvası sayfada ve başlangıçta gizli', 'yok');
    check(/id="guestDirectoryDateRange"/.test(INDEX) && !/id="guestDirectoryDateStart"/.test(INDEX)
      && /getDateRangePicker\(\)\.mount\([^)]*\{[\s\S]{0,80}mode: 'range'/.test(APP),
      'D3. Misafir rehberi tarih filtresi tek takvimli ortak seçici (filtre kipi)', 'eski iki tarih kutusu ya da mount yok');
    check(/function pickResDate[\s\S]{0,400}getDateRangePicker\(\)\.pick\(/.test(APP)
      && /function renderResCalendarMonth[\s\S]{0,200}getDateRangePicker\(\)/.test(APP),
      'D4. Rezervasyon formu seçim kuralını ve ay ızgarasını ortak seçiciden alır (tek kaynak)', 'kopya mantık duruyor');
  });
} catch (e) {
  // Modul yuklenemezse (eski agac, silinmis dosya) ozet "0/0" ile yesil gorunmemeli.
  failed++;
  console.error(`[FAIL] Beklenmeyen hata\n       ${e && e.message}`);
} finally {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
