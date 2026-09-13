/**
 * LEXBNB RENDER HATTI TESTLERI
 *
 * BU SUIT NEDEN VAR:
 *
 * 2026-09-13'te uretimde bulundu:
 *
 *   ReferenceError: setEl is not defined
 *     at renderExecutiveControlCenter (app.js:12835)
 *     at renderAll (app.js:3071)
 *     at loadTenantAppData (app.js:11441)   <-- catch blogu
 *
 * setEl IKI fonksiyonun ICINDE yerel tanimliydi; renderExecutiveControlCenter
 * onu kendi kapsaminda bulamiyordu. Oturum acan HER kullanicida veri yukleme
 * catch'e dusuyor, appData bos duruma cekiliyordu. Uygulama girisden sonra
 * bostu ve bu gun boyunca canlida kaldi.
 *
 * O ZAMANKI 54 SUITTEN HICBIRI YAKALAYAMADI: hicbiri renderAll'i
 * calistirmiyordu. Node tarafinda `document` olmadigi icin render hatti
 * tamamen test disiydi.
 *
 * Bu suit o boslugu kapatir: minimal ama "her zaman eleman doner" bir DOM
 * taklidi kurar ve renderAll()'i GERCEKTEN calistirir. Boylece render
 * fonksiyonlarindaki tanimsiz referanslar, null erisimler ve tip hatalari
 * calisma aninda yakalanir.
 *
 * Statik tarama denendi ve BIRAKILDI: regex literalleri (/['\"]/ gibi) dize
 * ayristiricisini bozuyor, 40'tan fazla yanlis pozitif uretiyordu.
 */

// --- Sahte DOM ---------------------------------------------------------------
// Her getElementById CAGRISI bir eleman doner. Bu bilincli: null donseydi
// render fonksiyonlari `if (!el) return;` ile erken cikar ve asil kod hic
// calismazdi — yani hatalar yine gizlenirdi.
function sahteEleman(id) {
  const el = {
    id: id || '',
    tagName: 'DIV',
    innerHTML: '',
    innerText: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    title: '',
    className: '',
    dataset: {},
    style: new Proxy({}, { get: (t, k) => t[k] || '', set: (t, k, v) => { t[k] = v; return true; } }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    options: [],
    children: [],
    parentNode: null,
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.dataset[k] = v; },
    getAttribute(k) { return this.dataset[k] !== undefined ? this.dataset[k] : null; },
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    focus() {}, blur() {}, click() {}, scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    getContext: () => null
  };
  return el;
}

function domKur() {
  const onbellek = new Map();
  const doc = {
    body: sahteEleman('body'),
    documentElement: sahteEleman('html'),
    getElementById(id) {
      if (!onbellek.has(id)) onbellek.set(id, sahteEleman(id));
      return onbellek.get(id);
    },
    createElement: (tag) => { const e = sahteEleman(''); e.tagName = String(tag || 'div').toUpperCase(); return e; },
    // SVG grafikleri (gider donutu) createElementNS kullaniyor.
    createElementNS: (ns, tag) => { const e = sahteEleman(''); e.tagName = String(tag || 'svg').toUpperCase(); return e; },
    createTextNode: (t) => ({ textContent: t }),
    createDocumentFragment: () => sahteEleman(''),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    getElementsByClassName: () => [],
    getElementsByTagName: () => []
  };
  global.document = doc;
  global.window = global.window || {};
  global.window.document = doc;
  global.requestAnimationFrame = (fn) => { try { fn(); } catch (e) {} return 1; };
  global.cancelAnimationFrame = () => {};
  global.alert = () => {};
  global.confirm = () => false;
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  global.localStorage = {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  };
  return doc;
}

domKur();

const app = require('../app.js');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

function hataOzeti(e) {
  const yig = (e && e.stack ? e.stack : String(e)).split('\n').slice(0, 4).join('\n         ');
  return (e && e.message ? e.message : String(e)) + '\n         ' + yig;
}

// --- Senaryolar ---------------------------------------------------------------
function bosVeri() {
  return {
    tenantId: '00000000-0000-4000-8000-000000000001',
    companyName: 'Test İşletme',
    villas: {}, bookings: [], expenses: [], cleaningTasks: [], leads: [],
    maintenance: [], marketingCampaigns: [], influencerCollabs: [],
    closedPeriods: [], targets: [], isCleanState: true
  };
}

function doluVeri() {
  return {
    tenantId: '00000000-0000-4000-8000-000000000001',
    companyName: 'Test İşletme',
    villas: {
      V1: { id: 'p1', slug: 'V1', name: 'Deniz Evi', capacity: '6', basePrice: 12000, cleanCost: 1500, url: 'https://ornek/1' },
      V2: { id: 'p2', slug: 'V2', name: 'Bahçe Evi', capacity: '8', basePrice: 9000, cleanCost: 1200 }
    },
    bookings: [
      // Aylari KESEN rezervasyon: tahakkuk yolunu da calistirir
      { id: 'b1', villa: 'V1', propertyId: 'p1', code: 'R-1', guest: 'Ali', checkIn: '2026-08-28',
        checkOut: '2026-09-03', nights: 6, gross: 60000, net: 52000, otaCommission: 5000,
        cleaningFee: 3000, channel: 'AIRBNB', status: 'CONFIRMED', pax: 6 },
      { id: 'b2', villa: 'V2', propertyId: 'p2', code: 'R-2', guest: 'Ayşe', checkIn: '2026-09-10',
        checkOut: '2026-09-14', nights: 4, gross: 20000, net: 20000, otaCommission: 0,
        cleaningFee: 1000, channel: 'WHATSAPP', status: 'CONFIRMED', pax: 4 },
      { id: 'b3', villa: 'V1', propertyId: 'p1', code: 'R-3', guest: 'İptal', checkIn: '2026-09-20',
        checkOut: '2026-09-22', nights: 2, gross: 15000, net: 15000, otaCommission: 0,
        cleaningFee: 0, channel: 'DIRECT', status: 'CANCELLED', pax: 2 }
    ],
    expenses: [
      { id: 'e1', date: '2026-09-05', category: 'Bakım & Onarım', amount: 8000, type: 'OPEX', villa: 'ALL', description: 'kombi' },
      { id: 'e2', date: '2026-09-08', category: 'Yatırım & Demirbaş', amount: 25000, type: 'CAPEX', villa: 'V1', description: 'mobilya' }
    ],
    cleaningTasks: [
      { id: 'c1', bookingId: 'b1', villa: 'V1', date: '2026-09-03', cleaner: 'Zeynep', amount: 500, desc: '', paid: false }
    ],
    leads: [
      { id: 'l1', name: 'Talep', villa: 'V1', status: 'NEW', channel: 'WHATSAPP', value: 30000, createdAt: '2026-09-01' }
    ],
    maintenance: [
      { id: 'm1', villa: 'V1', priority: 'P1', title: 'Arıza', assignee: 'X', downtime: 0, cost: 0, status: 'OPEN' }
    ],
    marketingCampaigns: [], influencerCollabs: [],
    closedPeriods: [], targets: [], isCleanState: false
  };
}

function renderCalistir(etiket, veri, donem) {
  domKur();                       // her senaryo temiz DOM ile
  app.setAppData(veri);
  if (app.setActiveTenantForTests) {
    app.setActiveTenantForTests({ id: veri.tenantId, name: veri.companyName, slug: 't', role: 'owner' });
  }
  app.setCurrentFilter({ period: donem, villa: 'ALL', startDate: null, endDate: null });
  try {
    app.renderAll();
    ok(etiket);
    return true;
  } catch (e) {
    no(etiket, hataOzeti(e));
    return false;
  }
}

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB RENDER HATTI TESTLERI');
  console.log('=============================================================================\n');

  check(typeof app.renderAll === 'function', '1. renderAll test edilebilir şekilde dışa aktarılmış',
    'renderAll export edilmemiş; render hattı test edilemez');

  if (typeof app.renderAll !== 'function') {
    console.log('\nrenderAll yok, kalan testler atlanıyor.');
  } else {
    renderCalistir('2. renderAll boş işletmede hata vermeden çalışır', bosVeri(), '2026-09');
    renderCalistir('3. renderAll dolu veriyle hata vermeden çalışır', doluVeri(), '2026-09');
    renderCalistir('4. renderAll ayları kesen rezervasyonun ÖNCEKİ ayında çalışır', doluVeri(), '2026-08');
    renderCalistir('5. renderAll veri olmayan bir dönemde çalışır', doluVeri(), '2027-03');
    renderCalistir('6. renderAll "Tüm Zamanlar" filtresinde çalışır', doluVeri(), 'ALL');

    // Kapatilmis donem: ay kapanisi karti ve kapali donem yollari
    const kapali = doluVeri();
    kapali.closedPeriods = [{ id: 'k1', tenant_id: kapali.tenantId, year: 2026, month: 9,
      status: 'CLOSED', closed_at: '2026-09-30T12:00:00Z', snapshot_json: {},
      history_json: [{ action: 'CLOSED', at: '2026-09-30T12:00:00Z' }] }];
    renderCalistir('7. renderAll kapatılmış dönemde çalışır (ay kapanışı kartı)', kapali, '2026-09');
  }

  // --- Uretimde patlayan iki isim -----------------------------------------------
  check(typeof app.setEl === 'function',
    '8. setEl genel kapsamda tanımlı',
    'renderExecutiveControlCenter onu kullanıyor; yerel tanım yetmez — bu tam olarak ' +
    'üretimde patlayan hataydı.');

  check(typeof app.showToast === 'function',
    '9. showToast genel kapsamda tanımlı',
    '34 çağrı var; tanım yoksa hepsi "typeof" koruması yüzünden SESSİZCE yutulur ve ' +
    'kullanıcı hiçbir onay görmez.');

  // showToast gercekten bir sey yaziyor mu?
  try {
    domKur();
    app.showToast('deneme mesajı', 'success');
    const kap = global.document.getElementById('lexToastWrap');
    check(kap && kap.children.length === 1 && kap.children[0].textContent === 'deneme mesajı',
      '10. showToast ekrana gerçekten bir bildirim ekler',
      'kapsayıcı: ' + (kap ? kap.children.length + ' çocuk' : 'yok'));
  } catch (e) {
    no('10. showToast ekrana gerçekten bir bildirim ekler', hataOzeti(e));
  }

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
