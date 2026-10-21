// Mulk rengi agi (kullanici istegi 21.10.2026): her mulkun secilebilir rengi,
// ad gecen her yerde ayni nokta.
//
// Renk tenant_settings 'property_colors' = { <mulk UUID>: '#RRGGBB' } anahtarinda
// durur (goc yok; pricing_rules ile ayni defter). UUID'ye bagli oldugu icin ad ya
// da sira degisince kaymaz. Eskiden takvimdeki nokta sira numarasindan geliyordu:
// mulk sirasi degisince her evin rengi degisiyordu ve secilemiyordu.
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

const TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ID_A = '00000000-0000-4000-8000-0000000000a1';
const ID_B = '00000000-0000-4000-8000-0000000000b2';

function sahteDom() {
  const elemanlar = new Map();
  const eleman = id => ({
    id, value: '', innerHTML: '', innerText: '', textContent: '', style: {}, dataset: {}, hidden: false,
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
  global.alert = () => {};
  global.confirm = () => true;
  global.requestAnimationFrame = fn => { fn(); return 1; };
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  global.localStorage = global.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  global.window = global.window || {};
  global.window.showToast = () => {};
}

function kaydedenIstemci(hata) {
  const yazmalar = [];
  return {
    yazmalar,
    rpc: async () => ({ data: [], error: null }),
    from(tablo) {
      const k = { tablo, islem: 'select', yuk: null };
      const q = {
        upsert(y) { k.islem = 'upsert'; k.yuk = y; yazmalar.push(k); return q; },
        insert(y) { k.islem = 'insert'; k.yuk = y; yazmalar.push(k); return q; },
        update(y) { k.islem = 'update'; k.yuk = y; yazmalar.push(k); return q; },
        delete() { k.islem = 'delete'; yazmalar.push(k); return q; },
        select() { return q; }, eq() { return q; }, in() { return q; }, is() { return q; }, order() { return q; }, limit() { return q; },
        range() { return q; }, gte() { return q; }, lte() { return q; }, gt() { return q; }, lt() { return q; }, or() { return q; }, not() { return q; },
        async single() { return { data: null, error: null }; }, async maybeSingle() { return { data: null, error: null }; },
        then(res, rej) { return Promise.resolve({ data: k.islem === 'select' ? [] : null, error: k.islem === 'select' ? null : (hata || null) }).then(res, rej); }
      };
      return q;
    }
  };
}

async function main() {
  sahteDom();
  const App = require('../app.js');
  const villalar = () => ({
    a: { id: ID_A, name: 'Zirve', slug: 'a', isActive: true },
    b: { id: ID_B, name: 'Şirin', slug: 'b', isActive: true }
  });
  const kur = (tenantSettings, rol = 'owner', hata) => {
    App.setActiveTenant({ id: TENANT, role: rol });
    const ist = kaydedenIstemci(hata);
    App.setSupabaseClient(ist);
    App.setAppData({ villas: villalar(), bookings: [], expenses: [], cleaningTasks: [], tenantSettings });
    return ist;
  };

  // --- A. Renk kaynagi -------------------------------------------------------
  kur({});
  const varsayilanA = App.getPropertyColor('a');
  const varsayilanB = App.getPropertyColor('b');
  check(/^#[0-9A-F]{6}$/.test(varsayilanA) && varsayilanA !== varsayilanB,
    'A1. Renk secilmemis iki mulk paletten farkli renk alir', `${varsayilanA} ${varsayilanB}`);

  kur({ property_colors: { [ID_A]: '#ff453a' } });
  check(App.getPropertyColor('a') === '#FF453A', 'A2. Kayitli renk mulk UUID ile okunur', App.getPropertyColor('a'));

  // Veritabanindaki deger style ozniteligine girer: #RRGGBB disi her sey reddedilir.
  kur({ property_colors: { [ID_A]: 'red;background:url(https://x.test)' } });
  check(App.getPropertyColor('a') === varsayilanA, 'A3. Gecersiz renk degeri style icine yazilmaz, varsayilana duser', App.getPropertyColor('a'));

  // Sira degisince kayitli renk kaymaz.
  App.setActiveTenant({ id: TENANT, role: 'owner' });
  App.setAppData({ villas: { b: villalar().b, a: villalar().a }, tenantSettings: { property_colors: { [ID_A]: '#BF5AF2' } } });
  check(App.getPropertyColor('a') === '#BF5AF2', 'A4. Mulk sirasi degisince secilen renk ayni kalir');

  // --- B. Ad gecen her yerde ayni nokta ----------------------------------------
  kur({ property_colors: { [ID_A]: '#30D158' } });
  const ad = App.propertyNameHtml('a', '<b>Zirve</b>');
  check(/property-color-dot" style="background:#30D158"/.test(ad) && ad.includes('&lt;b&gt;Zirve&lt;/b&gt;'),
    'B1. Ad noktasi kayitli rengi tasir, ad kacislanir', ad);
  const app = read('app.js');
  for (const [yer, kalip] of [
    ['takvim', /tape-villa-td"><strong>\$\{propertyNameHtml\(vKey, vName\)\}/],
    ['rezervasyon listesi', /data-label="Mülk"[^\n]*propertyNameHtml\(b\.villa, vName\)/],
    ['Bugün performans listesi', /today-performance__row"><strong>\$\{propertyNameHtml\(row\.key, row\.name\)\}/],
    ['satış hazırlığı kartı', /health-card-name">\$\{propertyNameHtml\(c\.propertyKey, c\.propertyName\)\}/],
    ['Finans mülk tablosu', /<h4>\$\{propertyNameHtml\(item\.key, item\.conf\.name\)\}<\/h4>/]
  ]) check(kalip.test(app), `B2. ${yer} mülk adını renkli noktayla yazar`);
  check(!/\['#38BDF8', '#A78BFA', '#30D158', '#FFB340', '#FB7185'\]\[villaIndex % 5\]/.test(app),
    'B3. Takvim rengi artik sira numarasindan uretilmez');

  // --- C. Secim Postgres'e yazilir -------------------------------------------------
  let ist = kur({ property_colors: { [ID_B]: '#FFD60A' } });
  const html = App.propertyColorPickerHtml('a');
  check((html.match(/class="property-color-swatch/g) || []).length === App.PROPERTY_COLOR_PALETTE.length
    && /data-onclick="setPropertyColor\(/.test(html), 'C1. Renk secici paletin her rengini sunar', html.slice(0, 300));
  check(await App.setPropertyColor('a', '#5e5cE6') === true, 'C2. Yonetici renk secebilir');
  const yazma = ist.yazmalar.find(k => k.tablo === 'tenant_settings');
  check(yazma && yazma.islem === 'upsert' && yazma.yuk.key === 'property_colors'
    && yazma.yuk.value[ID_A] === '#5E5CE6' && yazma.yuk.value[ID_B] === '#FFD60A',
  'C3. Renk tenant_settings property_colors anahtarina UUID ile yazilir; diger mulklerin rengi korunur', JSON.stringify(yazma && yazma.yuk));
  check(App.getAppData().tenantSettings.property_colors[ID_A] === '#5E5CE6', 'C4. Bellek yazmadan sonra guncellenir');

  ist = kur({});
  check(await App.setPropertyColor('a', 'url(javascript:1)') === false && ist.yazmalar.length === 0,
    'C5. Palet disi deger yazilmaz');

  ist = kur({}, 'sales');
  check(await App.setPropertyColor('a', '#0A84FF') === false && ist.yazmalar.length === 0,
    'C6. Yonetim rolu olmayan renk degistiremez (tenant_settings yazma siniri)');

  ist = kur({}, 'owner', { message: 'permission denied' });
  check(await App.setPropertyColor('a', '#0A84FF') === false && !App.getAppData().tenantSettings.property_colors,
    'C7. Yazma duserse bellekteki renk degismez (kaydedildi gibi gorunmez)');

  check(read('core/action_dispatch.js').includes("'setPropertyColor'"), 'C8. Renk dugmesi eylem izin listesinde');
}

main().catch(error => {
  failed++;
  console.error(`[FAIL] Beklenmeyen hata — ${error && error.stack}`);
}).finally(() => {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
});
