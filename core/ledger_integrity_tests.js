/**
 * LEXBNB PARA DEFTERI BUTUNLUGU (Dalga 3 — gider ve temizlik defteri)
 *
 * Kaynak taramasi degil, DAVRANIS olcumu: app.js gercekten calistirilir,
 * Supabase istemcisi her yazmayi kaydeden bir taklitle degistirilir ve
 * veritabanina KAC satir, HANGI tutarla gittigi sayilir. "Kaydedildi"
 * mesajinin dogru olup olmadigini ancak boyle gorebiliriz.
 *
 * Dis sisteme baglanmaz.
 */

const assert = require('assert');
const App = require('../app.js');

let passed = 0;
let failed = 0;

// Akisin ortasinda yakalanip console.error'a yazilan bir hata, testi yanlis
// sebeple yesil yapar (yazma hic tamamlanmadigi icin "tek yazma" tutar).
// Bu yuzden her senaryo hata gunlugu yazmadan bitmek zorundadir.
const konsolHatalari = [];
const asilHata = console.error;
async function test(name, fn) {
  konsolHatalari.length = 0;
  console.error = (...a) => { konsolHatalari.push(a.map(x => (x && x.stack) || String(x)).join(' ')); };
  try {
    await fn();
    await new Promise(r => setImmediate(r));
    console.error = asilHata;
    if (konsolHatalari.length) throw new Error('Akış hata günlüğü yazdı: ' + konsolHatalari[0]);
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error = asilHata;
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

const TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let sayac = 0;
const yeniUuid = () => `11111111-1111-4111-8111-${String(++sayac).padStart(12, '0')}`;

/**
 * Her cagriyi `kayitlar`a yazan Supabase taklidi. Donen satir, gonderilen
 * yukun kendisi + bir UUID'dir (insert/upsert), yani cagiran taraf gercek
 * istemcideki gibi `data.id` okuyabilir.
 */
function kaydedenIstemci(secenek = {}) {
  const kayitlar = [];
  const client = {
    kayitlar,
    rpc: async (ad, args) => { kayitlar.push({ tablo: null, islem: 'rpc', ad, args }); return { data: null, error: null }; },
    from(tablo) {
      const k = { tablo, islem: 'select', yuk: null, filtre: [] };
      const sonuc = () => {
        if (secenek.hata && secenek.hata(k)) return { data: null, error: secenek.hata(k) };
        if (k.islem === 'insert' || k.islem === 'upsert' || k.islem === 'update') {
          const tek = Array.isArray(k.yuk) ? k.yuk[0] : k.yuk;
          return { data: { id: (tek && tek.id) || yeniUuid(), ...tek }, error: null };
        }
        if (k.islem === 'select' && secenek.okuma) return { data: secenek.okuma(k), error: null };
        return { data: k.islem === 'select' ? [] : null, error: null };
      };
      const q = {
        insert(y) { k.islem = 'insert'; k.yuk = y; kayitlar.push(k); return q; },
        upsert(y, o) { k.islem = 'upsert'; k.yuk = y; k.secenek = o; kayitlar.push(k); return q; },
        update(y) { k.islem = 'update'; k.yuk = y; kayitlar.push(k); return q; },
        delete() { k.islem = 'delete'; kayitlar.push(k); return q; },
        select() { return q; },
        eq(c, v) { k.filtre.push([c, v]); return q; },
        in(c, v) { k.filtre.push([c, v]); return q; },
        match(m) { Object.entries(m).forEach(e => k.filtre.push(e)); return q; },
        order() { return q; },
        limit() { return q; },
        range() { return q; },
        async single() { return sonuc(); },
        async maybeSingle() { return sonuc(); },
        then(res, rej) { return Promise.resolve(sonuc()).then(res, rej); }
      };
      return q;
    }
  };
  return client;
}

/** Form alanlarini okuyan fonksiyonlar icin en kucuk DOM. */
function formKur(degerler) {
  const eleman = id => ({
    id,
    value: Object.prototype.hasOwnProperty.call(degerler, id) ? degerler[id] : '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {}, dataset: {}, innerHTML: '', innerText: '', textContent: '',
    options: [], children: [],
    appendChild(c) { return c; }, removeChild(c) { return c; },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, focus() {}
  });
  const onbellek = new Map();
  global.document = {
    getElementById(id) { if (!onbellek.has(id)) onbellek.set(id, eleman(id)); return onbellek.get(id); },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => eleman(''),
    createElementNS: () => eleman(''),
    body: eleman('body'),
    documentElement: eleman('html'),
    addEventListener() {},
    createDocumentFragment: () => eleman(''),
    createTextNode: t => ({ textContent: t })
  };
  global.window = global.window || {};
  global.window.showToast = () => {};
  global.alert = () => {};
  global.requestAnimationFrame = fn => { fn(); return 1; };
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  global.localStorage = global.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  global.confirm = () => true;
}

function ortamKur(veri, istemci) {
  App.setActiveTenant({ id: TENANT });
  App.setSupabaseClient(istemci);
  App.setAppData({
    villas: { A: { id: PROP_A, slug: 'A', name: 'Villa A' } },
    bookings: [], expenses: [], cleaningTasks: [], closedPeriods: [],
    ...veri
  });
}

const yazmalar = (istemci, tablo) =>
  istemci.kayitlar.filter(k => k.tablo === tablo && k.islem !== 'select');

(async () => {
  console.log('=============================================================================');
  console.log('LEXBNB PARA DEFTERI BUTUNLUGU');
  console.log('=============================================================================\n');

  // --- L-26: gider tek kez yazilir -------------------------------------------
  await test('L-26a Yeni gider veritabanına TEK satır olarak yazılır', async () => {
    const istemci = kaydedenIstemci();
    ortamKur({}, istemci);
    formKur({ expEditId: '', expType: 'OPEX', expCategory: 'Bakım', expVilla: 'A', expDate: '2026-09-10', expAmount: '2500', expDesc: 'Musluk' });
    await App.saveExpense();
    // Arka planda baslatilmis bir ikinci yazma varsa once bitsin.
    await new Promise(r => setImmediate(r));
    const ekler = yazmalar(istemci, 'expenses').filter(k => k.islem === 'insert' || k.islem === 'upsert');
    assert.strictEqual(ekler.length, 1, `expenses tablosuna ${ekler.length} ekleme gitti; bir gider bir satırdır`);
    assert.strictEqual(App.getAppData().expenses.length, 1, 'bellekte de tek gider olmalı');
  });

  await test('L-26b Gider düzenlemesi veritabanına TEK güncelleme gönderir', async () => {
    const istemci = kaydedenIstemci();
    const id = yeniUuid();
    ortamKur({ expenses: [{ id, dbId: id, villa: 'A', propertyId: PROP_A, date: '2026-09-10', month: '2026-09', category: 'Bakım', type: 'OPEX', amount: 2500 }] }, istemci);
    formKur({ expEditId: id, expType: 'OPEX', expCategory: 'Bakım', expVilla: 'A', expDate: '2026-09-10', expAmount: '3000', expDesc: '' });
    await App.saveExpense();
    await new Promise(r => setImmediate(r));
    const w = yazmalar(istemci, 'expenses');
    assert.strictEqual(w.length, 1, `expenses tablosuna ${w.length} yazma gitti (${w.map(x => x.islem).join(', ')})`);
    assert.strictEqual(w[0].islem, 'update');
  });

  await test('L-26c Gider silme veritabanına TEK silme gönderir', async () => {
    const istemci = kaydedenIstemci();
    const id = yeniUuid();
    ortamKur({ expenses: [{ id, dbId: id, villa: 'A', date: '2026-09-10', month: '2026-09', category: 'Bakım', type: 'OPEX', amount: 2500 }] }, istemci);
    formKur({});
    await App.deleteExpenseUI(id);
    await new Promise(r => setImmediate(r));
    const w = yazmalar(istemci, 'expenses').filter(k => k.islem === 'delete');
    assert.strictEqual(w.length, 1, `expenses tablosuna ${w.length} silme gitti`);
  });

  console.log(`\n${passed} geçti, ${failed} başarısız`);
  if (failed > 0) process.exit(1);
})();
