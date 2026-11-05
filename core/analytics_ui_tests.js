// =============================================================================
// LEXBNB — ANALIZ SEKMESI ARAYUZU (core/analytics_ui.js) — cevrimdisi, sahte DOM
// =============================================================================

const assert = require('assert');
const LedgerContract = require('./ledger_contract.js');

// ------------------------------------------------------------- sahte DOM --
// Yalniz modulun kullandigi yuzey. innerHTML BILEREK yok: modul onu
// kullanirsa test TypeError ile kirilir (CSP/SVG siniri, analytics_ui.js basligi).
class FakeNode {
  constructor(tag, ns) {
    this.tagName = String(tag).toUpperCase();
    this.namespaceURI = ns || 'http://www.w3.org/1999/xhtml';
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this._text = '';
    this.listeners = {};
    this.style = {};
    this.hidden = false;
    this.dataset = {};
    this.value = '';
    const self = this;
    this.classList = {
      add: (...c) => { const s = new Set(self._classes()); c.forEach(x => s.add(x)); self.setAttribute('class', [...s].join(' ')); },
      toggle: (c, on) => { const s = new Set(self._classes()); (on === undefined ? !s.has(c) : on) ? s.add(c) : s.delete(c); self.setAttribute('class', [...s].join(' ')); },
      contains: c => self._classes().includes(c)
    };
  }
  _classes() { return String(this.attributes.get('class') || '').split(/\s+/).filter(Boolean); }
  setAttribute(k, v) {
    if (k === 'style' || /^on/i.test(k)) throw new Error('YASAK_OZNITELIK: ' + k);
    this.attributes.set(k, String(v));
    if (k === 'value') this.value = String(v);
  }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === global.document.body; }
  get clientWidth() { return 0; }
  get textContent() { return this.tagName === '#TEXT' ? this._text : this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.children = []; if (this.tagName === '#TEXT') this._text = String(v); else if (v !== '') this.appendChild(textNode(v)); }
  set innerHTML(v) { throw new Error('innerHTML kullanildi'); }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  matches(sel) {
    return sel.split(',').some(part => {
      const m = part.trim().match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if (m) return this.hasAttribute(m[1]) && (m[2] === undefined || this.getAttribute(m[1]) === m[2]);
      if (part.trim().startsWith('.')) return this._classes().includes(part.trim().slice(1));
      return this.tagName === part.trim().toUpperCase();
    });
  }
  closest(sel) { let n = this; while (n && n.tagName !== '#TEXT') { if (n.matches(sel)) return n; n = n.parentNode; } return null; }
  all() { const out = []; const walk = n => n.children.forEach(c => { if (c.tagName !== '#TEXT') { out.push(c); walk(c); } }); walk(this); return out; }
  querySelectorAll(sel) { return this.all().filter(n => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function textNode(v) { const n = new FakeNode('#text'); n._text = String(v); return n; }

global.document = {
  createElement: t => new FakeNode(t),
  createElementNS: (ns, t) => new FakeNode(t, ns),
  createTextNode: textNode,
  body: new FakeNode('body')
};

function click(root, el) {
  (root.listeners.click || []).forEach(fn => fn({ target: el }));
}
function change(root, el, value) {
  el.value = value;
  (root.listeners.change || []).forEach(fn => fn({ target: el }));
}

const AnalyticsUI = require('./analytics_ui.js');

// -------------------------------------------------------------- veri ---
const VILLAS = [
  { key: 'deniz', name: '<img src=x onerror=alert(1)>', id: 'p1' },
  { key: 'orman', name: 'Orman Evi', id: 'p2' }
];
function bk(id, villa, ci, co, gross, extra) {
  return Object.assign({ id, villa, propertyId: villa === 'deniz' ? 'p1' : 'p2', guest: 'G' + id, checkIn: ci, checkOut: co,
    gross, cleanFee: 0, discount: 0, status: 'CONFIRMED', channel: 'Direct', createdAt: '2026-01-01T00:00:00Z' }, extra || {});
}
const BOOKINGS = [
  bk('a', 'deniz', '2026-10-03', '2026-10-08', 50000, { channel: 'AIRBNB', createdAt: '2026-09-03T00:00:00Z' }),
  bk('b', 'orman', '2026-10-10', '2026-10-12', 20000),
  bk('c', 'orman', '2026-10-14', '2026-10-16', 10000, { channel: 'BOOKING' }),
  bk('d', 'deniz', '2026-10-20', '2026-10-21', 4000, { channel: 'WhatsApp' }),
  bk('e', 'orman', '2026-10-22', '2026-10-23', 3000, { channel: '<b>Kanal</b>' }),
  bk('ly', 'deniz', '2025-10-05', '2025-10-10', 25000, { createdAt: '2025-08-01T00:00:00Z' })
];
function deps(bookings) {
  return {
    monthPerformance(mk, villa) {
      const r = LedgerContract.monthRange(mk);
      const l = LedgerContract.computePeriodLedger({ bookings, bookingInScope: b => villa === 'ALL' || b.villa === villa,
        bookingShare: b => LedgerContract.nightShareInRange(b, r.start, r.end) });
      const n = Number(r.end.slice(8));
      return { roomRevenue: l.netRoomRevenue, nights: l.soldNights, available: villa === 'ALL' ? n * 2 : n };
    },
    channelName: c => ({ AIRBNB: 'Airbnb', Direct: 'Doğrudan' }[c] || c)
  };
}
function mountWith(bookings, extra) {
  const root = new FakeNode('div');
  global.document.body.appendChild(root);
  const ui = AnalyticsUI.mount(root, Object.assign({
    getData: () => ({ bookings, leads: [], villas: VILLAS, today: '2026-11-05' }),
    deps: deps(bookings),
    monthOptions: () => ['2025-10', '2026-09', '2026-10', '2026-11']
  }, extra || {}));
  ui.render();
  return { root, ui };
}
const texts = root => root.all().filter(n => n.children.some(c => c.tagName === '#TEXT')).map(n => n.textContent);

let passed = 0; let total = 0; let failed = 0;
function test(name, fn) {
  total++;
  try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (err) {
    failed++; console.error(`[FAIL] ${name}`); console.error('       ' + (err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n       ') : err));
  }
}

console.log('=============================================================================');
console.log('LEXBNB — ANALIZ SEKMESI ARAYUZU');
console.log('=============================================================================');

test('U1. Bos isletme: bos durum yazilir, hicbir tutar ya da yuzde uydurulmaz', () => {
  const { root } = mountWith([]);
  const t = root.textContent;
  assert.ok(t.includes('Henüz rezervasyon yok'));
  assert.ok(!/₺\s?\d/.test(t), 'tutar yazilmamali: ' + t.slice(0, 200));
  assert.ok(!/%\d/.test(t), 'yuzde yazilmamali');
  assert.strictEqual(root.querySelectorAll('.ba-kpi').length, 0);
});

test('U2. Varsayilan donem son tamamlanan ay (Kasim surerken Ekim)', () => {
  const { ui, root } = mountWith(BOOKINGS);
  assert.strictEqual(ui.getState().anchor, '2026-10');
  assert.ok(root.querySelector('.ba-subtitle').textContent.startsWith('Ekim 2026'));
  assert.strictEqual(root.querySelector('.ba-running'), null, 'tamamlanmis ayda "suruyor" notu yok');
});

test('U3. KPI degerleri raporla ayni; NaN/undefined/Infinity yazilmaz', () => {
  const { ui, root } = mountWith(BOOKINGS);
  const r = ui.getReport();
  const kpi = root.querySelectorAll('.ba-kpi')[0];
  assert.strictEqual(kpi.querySelector('.ba-kpi-value').textContent, '₺' + new Intl.NumberFormat('tr-TR').format(r.kpis.current.revenue));
  texts(root).forEach(t => assert.ok(!/NaN|undefined|Infinity|null/.test(t), 'bozuk metin: ' + t));
});

test('U4. Kullanici verisi metin olarak yazilir; HTML elemani olusmaz', () => {
  const { root } = mountWith(BOOKINGS);
  assert.strictEqual(root.querySelectorAll('img').length, 0);
  assert.strictEqual(root.querySelectorAll('b').length, 0);
  assert.ok(root.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.ok(root.textContent.includes('<b>Kanal</b>'));
});

test('U5. Satir ici style ve on* ozniteligi kullanilmaz (sahte DOM ikisinde de firlatir)', () => {
  // setAttribute('style'|'on*') FakeNode'da hata atar; render buraya kadar geldiyse kullanilmadi.
  const { root } = mountWith(BOOKINGS);
  root.all().forEach(n => n.attributes.forEach((v, k) => assert.ok(k !== 'style' && !/^on/i.test(k))));
  // Cubuk genisligi CSSOM ile
  const fill = root.querySelector('.ba-pace-fill');
  assert.ok(fill && /%$/.test(fill.style.width));
});

test('U6. Kontroller: donem, karsilastirma, siralama, mulk', () => {
  const { ui, root } = mountWith(BOOKINGS);
  click(root, root.querySelector('[data-ba-value="6m"]'));
  assert.strictEqual(ui.getState().preset, '6m');
  assert.ok(root.querySelector('.ba-subtitle').textContent.startsWith('Mayıs – Ekim 2026'));
  click(root, root.querySelector('[data-ba-toggle="yoy2"]'));
  assert.strictEqual(ui.getState().compare.yoy2, true);
  click(root, root.querySelector('[data-ba-sort="name"]'));
  assert.deepStrictEqual(ui.getState().sort, { key: 'name', dir: 'asc' });
  const once = root.querySelector('[data-ba-sort="name"]').parentNode.getAttribute('aria-sort');
  assert.strictEqual(once, 'ascending');
  let bildirilen = null;
  const m = mountWith(BOOKINGS, { onVillaChange: v => { bildirilen = v; } });
  click(m.root, m.root.querySelector('[data-ba-villa="orman"]'));
  assert.strictEqual(m.ui.getState().villa, 'orman');
  assert.strictEqual(bildirilen, 'orman');
  change(m.root, m.root.querySelector('[data-ba-select="villa"]'), 'ALL');
  assert.strictEqual(m.ui.getState().villa, 'ALL');
});

test('U7. Portfoy ortalamasi tum mulklerde kapali; 12 aylik trendde onceki donem cizilmez', () => {
  const { root } = mountWith(BOOKINGS);
  assert.strictEqual(root.querySelector('[data-ba-toggle="portfolio"]'), null, 'tum mulklerde portfoy cipi gosterilmez');
  const legend = root.querySelector('.ba-legend').querySelectorAll('li').map(li => li.textContent);
  assert.ok(legend.includes('Geçen yıl'));
  assert.ok(!legend.includes('Önceki dönem'));
  assert.ok(root.textContent.includes('Önceki dönem 12 aylık pencerede geçen yılla aynıdır'));
});

test('U8. Kanal halkasi en fazla 3 renk; fazlasi Diger (gri)', () => {
  const { root } = mountWith(BOOKINGS);
  const slices = root.querySelectorAll('.ba-slice').concat(root.querySelectorAll('.ba-donut-ring'));
  const renkler = new Set(slices.map(s => s._classes().find(c => /^ba-s([0-9]|-other)$/.test(c))));
  assert.ok(renkler.has('ba-s-other'));
  assert.ok([...renkler].filter(c => c !== 'ba-s-other').length <= 3);
  [...renkler].forEach(c => assert.ok(['ba-s1', 'ba-s2', 'ba-s3', 'ba-s-other'].includes(c), c));
});

test('U9. Olculemeyen deger "—" ve nedeni yazilir', () => {
  const { root } = mountWith([bk('z', 'orman', '2026-10-10', '2026-10-12', 8000, { createdAt: '2026-10-20T00:00:00Z' })]);
  const kpis = root.querySelectorAll('.ba-kpi');
  const lead = kpis.find(k => k.querySelector('.ba-kpi-label').textContent === 'Rezervasyon öncesi süre');
  assert.strictEqual(lead.querySelector('.ba-kpi-value').textContent, '—');
  assert.ok(/sonradan/.test(lead.querySelector('.ba-kpi-note').textContent));
});

test('U10. Talep bolumu yetki yoksa cizilmez; destroy dinleyicileri kaldirir', () => {
  const { root, ui } = mountWith(BOOKINGS, { canReadLeads: () => false });
  assert.ok(!root.textContent.includes('Talep → rezervasyon dönüşümü'));
  ui.destroy();
  assert.strictEqual((root.listeners.click || []).length, 0);
  assert.strictEqual(root.children.length, 0);
});

test('U11. Yeniden cizimden sonra klavye odagi ayni kontrole doner (WCAG 2.4.3)', () => {
  const { root, ui } = mountWith(BOOKINGS);
  FakeNode.prototype.focus = function () { global.document.activeElement = this; };
  const btn = root.querySelector('[data-ba-value="3m"]');
  btn.focus();
  click(root, btn);
  assert.strictEqual(ui.getState().preset, '3m');
  const odak = global.document.activeElement;
  assert.notStrictEqual(odak, btn, 'eski dugum yerinden kalkti');
  assert.strictEqual(odak.getAttribute('data-ba-value'), '3m');
  assert.ok(root.contains(odak));
  assert.strictEqual(odak.getAttribute('aria-pressed'), 'true');
  delete global.document.activeElement;
});

console.log('-----------------------------------------------------------------------------');
console.log(`Sonuc: ${passed}/${total} gecti`);
if (failed > 0) process.exit(1);
