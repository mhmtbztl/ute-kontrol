// Gorev 9 canli kullanici incelemesi (25-26.10.2026) bulgulari agi.
//
// L-304: gider aktarimi yalniz dosya icinde kopya ariyordu; defterdeki
//   giderle ayni satir (duzeltilip yeniden yuklenen dosya, disa aktarilip
//   geri verilen defter) "eklenecek" gorunuyor ve gideri ikiliyordu.
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
const PROP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const PROP_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

function sahteDom(degerler = {}) {
  const elemanlar = new Map();
  const eleman = id => ({
    id, value: Object.prototype.hasOwnProperty.call(degerler, id) ? degerler[id] : '',
    checked: false, disabled: false,
    innerHTML: '', innerText: '', textContent: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, addEventListener() {}, removeEventListener() {},
    appendChild(c) { return c; }, removeChild(c) { return c; }, remove() {}, reset() {},
    options: [], children: [], closest: () => null,
    querySelector: () => null, querySelectorAll: () => [], focus() {}, blur() {}, scrollIntoView() {}
  });
  global.document = {
    getElementById(id) { if (!elemanlar.has(id)) elemanlar.set(id, eleman(id)); return elemanlar.get(id); },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
    createElement: () => eleman(''), createElementNS: () => eleman(''), createDocumentFragment: () => eleman(''),
    createTextNode: x => ({ textContent: x }), body: eleman('body'), documentElement: eleman('html')
  };
  global.__uyarilar = [];
  global.alert = msg => { global.__sonUyari = msg; global.__uyarilar.push(msg); };
  global.confirm = () => true;
  global.requestAnimationFrame = fn => { fn(); return 1; };
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  global.localStorage = global.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  global.window = global.window || {};
  global.window.showToast = () => {};
  return global.document;
}

function kaydedenIstemci(secimler = {}) {
  const yazmalar = [];
  const client = {
    yazmalar,
    rpc: async (ad, arg) => { yazmalar.push({ tablo: 'rpc:' + ad, islem: 'rpc', yuk: arg, filtre: [] }); return { data: secimler.rpc ? secimler.rpc(ad, arg) : [], error: null }; },
    from(tablo) {
      const k = { tablo, islem: 'select', yuk: null, filtre: [] };
      const cevap = () => {
        if (secimler.cevap) { const c = secimler.cevap(k); if (c) return c; }
        if (k.islem === 'insert' || k.islem === 'update' || k.islem === 'upsert') {
          const y = Array.isArray(k.yuk) ? k.yuk[0] : k.yuk;
          return { data: { id: 'eeeeeeee-eeee-4eee-8eee-' + String(yazmalar.length).padStart(12, '0'), ...y }, error: null };
        }
        return { data: k.islem === 'select' ? [] : null, error: null };
      };
      const q = {
        insert(y) { k.islem = 'insert'; k.yuk = y; yazmalar.push(k); return q; },
        update(y) { k.islem = 'update'; k.yuk = y; yazmalar.push(k); return q; },
        upsert(y) { k.islem = 'upsert'; k.yuk = y; yazmalar.push(k); return q; },
        delete() { k.islem = 'delete'; yazmalar.push(k); return q; },
        select() { return q; }, eq(c, v) { k.filtre.push([c, v]); return q; }, in() { return q; },
        is() { return q; }, gte() { return q; }, lte() { return q; }, lt() { return q; }, gt() { return q; },
        or() { return q; }, not() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; },
        async single() { return cevap(); },
        async maybeSingle() { return cevap(); },
        then(res, rej) { return Promise.resolve(cevap()).then(res, rej); }
      };
      return q;
    }
  };
  return client;
}

function kur(App, veri = {}, rol = 'owner', secimler) {
  App.setActiveTenant({ id: TENANT, role: rol });
  const ist = kaydedenIstemci(secimler);
  App.setSupabaseClient(ist);
  App.setAppData({
    villas: {
      DENE: { id: PROP_A, name: 'Deneme Evi', capacity: 6 },
      SEYIR: { id: PROP_B, name: 'SEYİR', capacity: 8 }
    },
    bookings: [], expenses: [], cleaningTasks: [], leads: [], operationalPeople: [], salesMembers: [],
    ...veri
  });
  return ist;
}

// ---------------------------------------------------------------------------
// L-304 gider aktarimi defterdeki kayitlara karsi kopya denetler
// ---------------------------------------------------------------------------
async function L304() {
  const E = require('./finance_import_engine.js');
  const harita = { date: 'Tarih', category: 'Kategori', amount: 'Tutar', description: 'Açıklama', property: 'Villa' };
  const satirlar = [
    { Tarih: '01.10.2026', Kategori: 'Elektrik', Tutar: '1.234,56', Açıklama: 'Ekim faturası', Villa: 'Deneme Evi' },
    { Tarih: '02.10.2026', Kategori: 'Bakım', Tutar: '500', Açıklama: 'Musluk', Villa: '' },
    { Tarih: '03.10.2026', Kategori: 'Bakım', Tutar: '750', Açıklama: 'Yeni kalem', Villa: '' }
  ];
  const props = [{ id: PROP_A, slug: 'DENE', key: 'DENE', name: 'Deneme Evi' }];
  const defter = [
    { date: '2026-10-01', category: 'Fatura', amount: 1234.56, description: 'EKİM FATURASI', propertyId: PROP_A, villa: 'DENE' },
    { date: '2026-10-02', category: 'Bakım', amount: 500, description: 'Musluk', propertyId: null, villa: 'ALL' }
  ];
  const r = E.validateExpenseRows(satirlar, harita, { properties: props, existingExpenses: defter });
  check(r.duplicateCount === 2 && r.existingDuplicateCount === 2,
    'L-304a Defterde duran iki gider mukerrer sayilir', JSON.stringify({ d: r.duplicateCount, e: r.existingDuplicateCount }));
  const yeni = r.validatedRows.filter(v => !v.isPotentialDuplicate).map(v => v.description);
  check(yeni.length === 1 && yeni[0] === 'Yeni kalem', 'L-304b Yalniz yeni satir eklenecek kalir', JSON.stringify(yeni));
  // Ayni gun, ayni tutar ama farkli aciklama ya da mulk: ayri gider, mukerrer degil.
  const r2 = E.validateExpenseRows([
    { Tarih: '02.10.2026', Kategori: 'Bakım', Tutar: '500', Açıklama: 'Musluk', Villa: 'Deneme Evi' },
    { Tarih: '02.10.2026', Kategori: 'Bakım', Tutar: '500', Açıklama: 'Kapı kolu', Villa: '' }
  ], harita, { properties: props, existingExpenses: defter });
  check(r2.duplicateCount === 0, 'L-304c Farkli mulk ya da aciklama mukerrer sayilmaz', String(r2.duplicateCount));

  // Uygulama defteri motora verir: disa aktarilip geri verilen gider defteri.
  sahteDom();
  const App = require('../app.js');
  kur(App, { expenses: defter.map((e, i) => ({ id: 'x' + i, ...e })) });
  App.parseSourceWithMode({ fileName: 'gider.csv', headers: Object.keys(satirlar[0]), rows: satirlar, sheetNames: [] }, 'EXPENSES');
  const p = App.getPendingImportData();
  const sonuc = p && p.result;
  check(sonuc && sonuc.existingDuplicateCount === 2,
    'L-304d Onizleme defterdeki giderleri mukerrer gosterir', JSON.stringify(sonuc && { d: sonuc.duplicateCount, e: sonuc.existingDuplicateCount }));
}

async function main() {
  try {
    await L304();
  } catch (error) {
    failed++;
    console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
  } finally {
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed) process.exit(1);
  }
}
main();
