'use strict';

// Telefon kabuğu ağı (mobil uyum PR 1). core/mobile_shell.js yalnız rol
// kapısının bıraktığını eşler; alt çubuk ikinci bir rol listesi olamaz.

const fs = require('fs');
const path = require('path');
const KOK = path.join(__dirname, '..');
const Shell = require('./mobile_shell.js');
const Actions = require('./action_dispatch.js');

let gecen = 0;
let kalan = 0;
function check(kosul, ad, ayrinti) {
  if (kosul) { gecen++; console.log(`[PASS] ${ad}`); }
  else { kalan++; console.error(`[FAIL] ${ad}${ayrinti ? `\n       ${ayrinti}` : ''}`); }
}

// --- Küçük sahte DOM: yalnız modülün kullandığı seçiciler ---------------
class El {
  constructor(tag, attrs = {}, text = '') {
    this.tagName = tag.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this.ownText = text;
    this.hidden = 'hidden' in attrs;
    delete this.attrs.hidden;
    const sinif = new Set(String(attrs.class || '').split(/\s+/).filter(Boolean));
    this.classList = {
      contains: c => sinif.has(c),
      add: c => sinif.add(c),
      remove: c => sinif.delete(c),
      toggle: (c, zorla) => { const ac = zorla === undefined ? !sinif.has(c) : !!zorla; if (ac) sinif.add(c); else sinif.delete(c); return ac; },
      values: () => [...sinif]
    };
    this.options = [];
    this.selectedIndex = -1;
  }
  get id() { return this.attrs.id || ''; }
  get className() { return this.classList.values().join(' '); }
  set className(v) { this.classList.values().forEach(c => this.classList.remove(c)); String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c)); }
  getAttribute(a) { return a in this.attrs ? this.attrs[a] : null; }
  setAttribute(a, v) { this.attrs[a] = String(v); }
  removeAttribute(a) { delete this.attrs[a]; }
  hasAttribute(a) { return a in this.attrs; }
  appendChild(c) { c.parentElement = this; this.children.push(c); if (c.tagName === 'OPTION') this.options.push(c); return c; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentElement = null; return c; }
  get firstChild() { return this.children[0] || null; }
  get textContent() { return this.ownText + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.children = []; this.ownText = String(v); }
  matches(sel) { return eslesir(this, sel.trim()); }
  querySelectorAll(sel) {
    const out = [];
    const gez = el => el.children.forEach(c => { if (seciciEsler(c, sel)) out.push(c); gez(c); });
    gez(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function eslesir(el, basit) {
  const parcalar = basit.match(/^([a-z]+)?((?:[.#][\w-]+|\[[^\]]+\])*)$/i);
  if (!parcalar) throw new Error('desteklenmeyen seçici: ' + basit);
  if (parcalar[1] && el.tagName !== parcalar[1].toUpperCase()) return false;
  const ekler = parcalar[2].match(/[.#][\w-]+|\[[^\]]+\]/g) || [];
  return ekler.every(ek => {
    if (ek[0] === '.') return el.classList.contains(ek.slice(1));
    if (ek[0] === '#') return el.id === ek.slice(1);
    const m = ek.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    return m[2] === undefined ? el.hasAttribute(m[1]) : el.getAttribute(m[1]) === m[2];
  });
}

function seciciEsler(el, sel) {
  const zincir = sel.trim().split(/\s+/);
  if (!eslesir(el, zincir[zincir.length - 1])) return false;
  let i = zincir.length - 2;
  for (let p = el.parentElement; p && i >= 0; p = p.parentElement) if (eslesir(p, zincir[i])) i--;
  return i < 0;
}

const MENU = [
  ['executive', '📍 Bugün'], ['reservations', '📅 Rezervasyonlar (2)'], ['properties', '🏡 Mülkler (1)'],
  ['operations', '🧹 Operasyon (0)'], ['leads', '🤝 Misafirler ve Satış (3)'], ['pricing', '🏷️ Fiyatlandırma'],
  ['finance', '💰 Finans'], ['analytics', '📊 Analiz'], ['marketing', '📈 Kanallar ve Pazarlama'], ['settings', '⚙️ Ayarlar']
];

// index.html'deki alt çubuğun düğmeleri birebir buradan okunur.
const INDEX = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
const CUBUK_HTML = (INDEX.match(/<nav id="mobileTabbar"[\s\S]*?<\/nav>/) || [''])[0];
const CUBUK_SEKMELER = [...CUBUK_HTML.matchAll(/data-mobile-tab="([^"]+)"/g)].map(m => m[1]);

function belgeKur({ gizli = [], navGizli = false, aktif = 'executive', filtreGizli = false } = {}) {
  const body = new El('body');
  const nav = body.appendChild(new El('nav', { class: 'nav-tabs', ...(navGizli ? { hidden: '' } : {}) }));
  MENU.forEach(([sekme, metin]) => {
    const b = nav.appendChild(new El('button', { class: 'tab-btn' + (sekme === aktif ? ' active' : ''), 'data-onclick': `switchTab('${sekme}')` }, metin));
    b.hidden = gizli.includes(sekme);
  });
  const bar = body.appendChild(new El('div', { id: 'globalFilterBar', class: 'header-filters' }));
  bar.hidden = filtreGizli;
  const donem = bar.appendChild(new El('select', { id: 'globalPeriodFilter' }));
  donem.appendChild(new El('option', {}, 'Ekim 2026')); donem.appendChild(new El('option', {}, 'Kasım 2026')); donem.selectedIndex = 1;
  const mulk = bar.appendChild(new El('select', { id: 'globalVillaFilter' }));
  mulk.appendChild(new El('option', {}, 'Tüm Villalar / Portföy')); mulk.selectedIndex = 0;
  const cip = body.appendChild(new El('button', { id: 'mobileFilterChip', hidden: '' }));
  cip.appendChild(new El('span', { id: 'mobileFilterChipText' }, '—'));
  const cubuk = body.appendChild(new El('nav', { id: 'mobileTabbar', class: 'mobile-tabbar', hidden: '' }));
  CUBUK_SEKMELER.forEach(s => cubuk.appendChild(new El('button', { class: 'mobile-tabbar__btn', 'data-mobile-tab': s })));
  body.appendChild(new El('div', { id: 'mobileMoreList' }));
  const belge = {
    body,
    getElementById: id => (body.id === id ? body : body.querySelectorAll(`#${id}`)[0] || null),
    querySelector: s => body.querySelector(s),
    querySelectorAll: s => body.querySelectorAll(s),
    createElement: t => new El(t)
  };
  return belge;
}

const cubukDugmesi = (b, s) => b.getElementById('mobileTabbar').querySelector(`[data-mobile-tab="${s}"]`);

// --- K: kaynak sözleşmesi -------------------------------------------------
const navSekmeleri = new Set([...(INDEX.match(/<nav class="nav-tabs">[\s\S]*?<\/nav>/) || [''])[0].matchAll(/switchTab\('([^']+)'\)/g)].map(m => m[1]));
check(CUBUK_SEKMELER.length === 5 && CUBUK_SEKMELER[4] === 'more', 'K1. Alt çubuk 4 sekme + "Daha fazla"', CUBUK_SEKMELER.join(','));
check(CUBUK_SEKMELER.filter(s => s !== 'more').every(s => navSekmeleri.has(s)), 'K2. Alt çubuk menüde olmayan sekme açmaz');
check(JSON.stringify(CUBUK_SEKMELER.slice(0, 4)) === JSON.stringify(Shell.CUBUK_SEKMELERI), 'K3. index.html çubuğu ile modülün sabit listesi aynı');
const SHELL_SRC = fs.readFileSync(path.join(__dirname, 'mobile_shell.js'), 'utf8');
check(!/'(owner|admin|manager|sales|staff|viewer)'/.test(SHELL_SRC), 'K4. Kabuk modülünde rol adı yok (tek kaynak rol kapısı, §3.3.1)');
const APP = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
const govde = ad => { const i = APP.indexOf(`function ${ad}(`); return i < 0 ? '' : APP.slice(i, APP.indexOf('\n}\n', i)); };
['switchTab', 'applyRoleNavigationVisibility', 'handleFilterChange'].forEach((ad, i) =>
  check(govde(ad).includes('syncMobileShell()'), `K${5 + i}. ${ad} telefon kabuğunu eşler`));
check(/<script src="core\/mobile_shell\.js\?v=[0-9a-f]{8}"><\/script>/.test(INDEX) && INDEX.indexOf('core/mobile_shell.js') < INDEX.indexOf('src="app.js'), 'K8. Modül damgalı ve app.js\'ten önce yüklenir');
['openMobileMoreSheet', 'closeMobileMoreSheet', 'toggleMobileFilters'].forEach((ad, i) =>
  check(Actions.EYLEMLER.has(ad), `K${9 + i}. ${ad} eylem izin listesinde`));

const CSS = fs.readFileSync(path.join(KOK, 'style.css'), 'utf8');
const katman = CSS.slice(CSS.indexOf('MOBIL KATMAN'));
const kirilimlar = [...new Set([...katman.matchAll(/@media \(max-width: (\d+)px\)/g)].map(m => m[1]))];
check(CSS.includes('MOBIL KATMAN') && JSON.stringify(kirilimlar) === '["640"]', 'K12. Mobil katmanın tek telefon kırılımı 640 px', kirilimlar.join(','));
check(/textarea \{ font-size: 16px !important; \}/.test(katman), 'K13. Telefonda form alanları 16 px (iOS yakınlaştırmaz)');
check(/body:has\(#mobileTabbar:not\(\[hidden\]\)\) \.nav-tabs \{ display: none !important; \}/.test(katman), 'K14. Alt çubuk varken üst şerit gizli; çubuk gizliyse şerit kalır');

// --- D: davranış ----------------------------------------------------------
{
  const b = belgeKur({ aktif: 'executive' });
  Shell.syncMobileShell(b);
  const cubuk = b.getElementById('mobileTabbar');
  check(cubuk.hidden === false, 'D1. Sahip: çubuk görünür');
  check(cubukDugmesi(b, 'executive').classList.contains('active') && cubukDugmesi(b, 'executive').getAttribute('aria-current') === 'page', 'D2. Aktif sekme çubukta işaretli (aria-current)');
  const liste = b.getElementById('mobileMoreList').children;
  const listeSekme = liste.map(x => (x.getAttribute('data-onclick').match(/switchTab\('([^']+)'\)/) || [])[1]);
  check(JSON.stringify(listeSekme) === JSON.stringify(['properties', 'leads', 'pricing', 'analytics', 'marketing', 'settings']), 'D3. "Daha fazla" çubukta olmayan görünen sekmeleri listeler', listeSekme.join(','));
  check(liste[1].textContent === '🤝 Misafirler ve Satış (3)', 'D4. Liste menü metnini (sayaç dahil) taşır');
  const ayrisma = liste.map(x => Actions.parseAction(x.getAttribute('data-onclick')));
  check(ayrisma.every(r => !r.hata && r.adimlar.map(a => a.ad).join(',') === 'switchTab,closeMobileMoreSheet'), 'D5. Liste düğmeleri eylem ayrıştırıcısından geçer ve sayfayı kapatır');
}
{
  const b = belgeKur({ aktif: 'pricing' });
  Shell.syncMobileShell(b);
  check(cubukDugmesi(b, 'more').classList.contains('active') && !cubukDugmesi(b, 'executive').classList.contains('active'), 'D6. Çubukta olmayan sekmede "Daha fazla" işaretli');
  check(b.getElementById('mobileMoreList').children.find(x => x.classList.contains('active')).textContent === '🏷️ Fiyatlandırma', 'D7. Listede açık sayfa işaretli');
}
{
  // Satış: rol kapısı finans/ayarlar/pazarlamayı gizledi.
  const b = belgeKur({ gizli: ['finance', 'settings', 'marketing'], aktif: 'reservations' });
  Shell.syncMobileShell(b);
  check(cubukDugmesi(b, 'finance').hidden === true && cubukDugmesi(b, 'reservations').hidden === false, 'D8. Rol kapısının gizlediği sekme çubukta da gizli');
  const metinler = b.getElementById('mobileMoreList').children.map(x => x.textContent);
  check(!metinler.some(t => /Ayarlar|Pazarlama|Finans/.test(t)), 'D9. Gizli sekme "Daha fazla" listesinde yok', metinler.join(' | '));
}
{
  // Saha personeli: menü şeridi tümden gizli.
  const b = belgeKur({ navGizli: true, aktif: null });
  Shell.syncMobileShell(b);
  check(b.getElementById('mobileTabbar').hidden === true && b.getElementById('mobileMoreList').children.length === 0, 'D10. Menüsü gizli rolde çubuk ve liste yok');
}
{
  const b = belgeKur({ aktif: 'finance' });
  Shell.syncMobileShell(b);
  check(b.getElementById('mobileFilterChip').hidden === false && b.getElementById('mobileFilterChipText').textContent === 'Kasım 2026 · Tüm Villalar / Portföy', 'D11. Dönem düğmesi seçili dönem ve mülkü yazar');
  const g = belgeKur({ aktif: 'executive', filtreGizli: true });
  Shell.syncMobileShell(g);
  check(g.getElementById('mobileFilterChip').hidden === true, 'D12. Filtreyi okumayan sayfada dönem düğmesi yok');
  b.body.classList.add('mobile-filters-open');
  Shell.syncMobileShell(b);
  check(b.getElementById('mobileFilterChip').getAttribute('aria-expanded') === 'true', 'D13. Açık panel aria-expanded ile söylenir');
}

{
  // Kart modu etiketleri (Finans PR 6): sütun adı başlıktan, colspan sütunu kaydırır,
  // var olan etiket ezilmez, boş satır (colspan) etiketlenmez.
  const hucre = (metin, ozn = {}) => ({ textContent: metin, ozn: { ...ozn },
    getAttribute(a) { return this.ozn[a] === undefined ? null : this.ozn[a]; },
    setAttribute(a, v) { this.ozn[a] = String(v); } });
  const ths = ['Tarih', 'Tür', 'Tutar', 'İşlem'].map(t => hucre(t));
  const s1 = [hucre('01.11'), hucre('Gelir'), hucre('500'), hucre('Sil')];
  const s2 = [hucre('02.11', { colspan: '2' }), hucre('900', { 'data-label': 'Özel' }), hucre('Sil')];
  const bos = [hucre('Kayıt yok', { colspan: '4' })];
  const tr = cells => ({ children: cells });
  const tablo = { querySelectorAll(s) { return s === ':scope > thead > tr > th' ? ths : s === ':scope > tbody > tr' ? [tr(s1), tr(s2), tr(bos)] : []; } };
  const sayi = Shell.tabloyuEtiketle(tablo);
  check(s1.map(c => c.getAttribute('data-label')).join(',') === 'Tarih,Tür,Tutar,İşlem', 'D14. Hücre sütun adını başlıktan alır');
  check(s2[0].getAttribute('data-label') === null && s2[1].getAttribute('data-label') === 'Özel' && s2[2].getAttribute('data-label') === 'İşlem',
    'D15. colspan sütunu kaydırır, var olan etiket korunur', JSON.stringify(s2.map(c => c.ozn)));
  check(bos[0].getAttribute('data-label') === null && sayi === 5, 'D16. Boş satır etiketlenmez; yalnız eksikler yazılır', String(sayi));
}

console.log(`\nmobile_shell_tests: ${gecen} geçti, ${kalan} kaldı`);
if (kalan) process.exit(1);
