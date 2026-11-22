/**
 * LEXBNB — LEX TASARIMI BILESENLERI (core/lex_ui.js) ve TEMA ESLEMESI (core/theme.js)
 * Dis sisteme baglanmaz.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require('./lex_ui.js');
const Theme = require('./theme.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (err) {
    failed++; console.error(`[FAIL] ${name}\n       ${err && err.stack}`);
  }
}

test('X1. Gun etiketi Turkce: "18 Ara" + gun adi; bozuk tarih "—"', () => {
  assert.deepStrictEqual(L.dayLabel('2026-12-18'), { day: '18 Ara', weekday: 'Cuma' });
  assert.deepStrictEqual(L.dayLabel('x'), { day: '—', weekday: '' });
});

test('X2. Hafta sonu Cuma+Cumartesi gecesi; Pazartesi kalin cizgi yalniz yeni haftada', () => {
  assert.ok(L.isWeekendNight('2026-11-20') && L.isWeekendNight('2026-11-21'));
  assert.ok(!L.isWeekendNight('2026-11-22'), 'Pazar gecesi hafta ici');
  const html = L.tableHtml({ rows: ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'].map(d => ({ date: d, c1: d, c2: 'x', tone: 'keep', tag: 'Koru' })) });
  assert.strictEqual((html.match(/is-weekend/g) || []).length, 2);
  assert.strictEqual((html.match(/is-new-week/g) || []).length, 1);
  const ilk = L.tableHtml({ rows: [{ date: '2026-11-23', c1: 'a', c2: 'b', tone: 'up', tag: 'Yap' }] });
  assert.ok(!/is-new-week/.test(ilk), 'tablonun ilk satiri cizgi almaz');
});

test('X3. Marker: %5–15 sari, %15+ kirmizi, alti ve kiyas yoksa vurgu yok', () => {
  assert.strictEqual(L.markLevel(4900, 4500), 'yellow');
  assert.strictEqual(L.markLevel(5200, 4500), 'red');
  assert.strictEqual(L.markLevel(4600, 4500), null);
  assert.strictEqual(L.markLevel(4000, 4500), null);
  assert.strictEqual(L.markLevel(4900, null), null);
  assert.strictEqual(L.markLevel(4900, 0), null);
  assert.ok(!/lex-mark/.test(L.markHtml('4.900', null)));
});

test('X4. Tablo kacisi: misafir adindaki HTML calismaz; 3 sutun', () => {
  const html = L.tableHtml({ rows: [{ c1: '<img src=x onerror=1>', c2: '"a"', tone: 'down', tag: 'Acil', reason: "O'Brien" }] });
  assert.ok(!/<img/.test(html));
  assert.ok(/&lt;img/.test(html) && /&#39;/.test(html));
  assert.strictEqual((html.match(/<th /g) || []).length, 3);
  assert.ok(/lex-tag--down/.test(html));
  assert.ok(/Kayıt yok/.test(L.tableHtml({ rows: [] })));
});

test('X5. Fiyat 50 TL yuvarlanir; TL bicimi Turkce', () => {
  assert.strictEqual(L.roundPrice50(4525), 4550);
  assert.strictEqual(L.roundPrice50(4524), 4500);
  assert.strictEqual(L.formatTl(4500), '4.500 TL');
  assert.strictEqual(L.formatTl(-1200), '−1.200 TL');
  assert.strictEqual(L.formatTl(null), '—');
});

test('X6. PDF belgesi: A4 yatay, villa basina sayfa, gunduz renkleri', () => {
  const html = L.printDocumentHtml({ title: 'Bugün', pages: [{ title: 'Seyir', summary: [{ text: 'a ' }, { strong: '2 iş' }], rows: [{ c1: 'x', c2: 'y', tone: 'keep', tag: 'Tamam' }] }, { title: 'Doğuş', rows: [] }] });
  assert.strictEqual((html.match(/<section>/g) || []).length, 2);
  assert.ok(/size:A4 landscape/.test(L.PRINT_CSS));
  assert.ok(/#FFFFFF|#fff/i.test(L.PRINT_CSS) && /#EAF3DE/.test(L.PRINT_CSS));
  assert.ok(/<strong>2 iş<\/strong>/.test(html));
});

test('X7. Tema esleme: koyu yazi rengi degiskene, mavi zemindeki beyaz yazi beyaz kalir', () => {
  assert.strictEqual(Theme.themeizeCss('color: #F5F5F7; font-size: 12px'), 'color: var(--text-main); font-size: 12px');
  assert.strictEqual(Theme.themeizeCss('background:#0A84FF; color:#fff'), 'background:var(--accent-blue); color:#fff');
  assert.strictEqual(Theme.themeizeCss('color:#fff'), 'color:var(--text-main)');
  assert.strictEqual(Theme.themeizeCss('border: 1px solid rgba(255,255,255,0.08)'), 'border: 1px solid rgb(var(--rgb-ink) / 0.08)');
  assert.strictEqual(Theme.themeizeCss('color: #30D158'), 'color: var(--accent-emerald-text)');
  assert.strictEqual(Theme.themeizeCss('background: #1C1C1E'), 'background: var(--bg-surface)');
  assert.strictEqual(Theme.themeizeCss('font-weight: 800'), 'font-weight: 500');
  assert.strictEqual(Theme.themeizeCss('font-weight:400'), 'font-weight:400');
  assert.strictEqual(Theme.themeizeCss('font: 600 11px/1.2 var(--font-sans)'), 'font: 500 11px/1.2 var(--font-sans)');
  assert.strictEqual(Theme.themeizeCss('background: rgba(22, 22, 24, 0.92)'), 'background: rgb(var(--rgb-surface) / 0.92)');
  // Siyah golge zemin gunduzde hafifler; yazi rengi ve golge degismez.
  assert.strictEqual(Theme.themeizeCss('background: rgba(0,0,0,0.25)'), 'background: rgb(var(--rgb-shade) / calc(0.25 * var(--shade-k)))');
  assert.strictEqual(Theme.themeizeCss('color: rgba(0,0,0,0.5)'), 'color: rgba(0,0,0,0.5)');
  assert.strictEqual(Theme.themeizeCss('color: #123456'), 'color: #123456', 'bilinmeyen renk aynen');
  assert.strictEqual(Theme.themeizeCss(''), '');
});

test('X8. style.css ve analytics.css donusmus; yalniz iki kalinlik; golge yok', () => {
  const { transform } = require('../scripts/themeize_css.js');
  ['style.css', 'analytics.css'].forEach(f => {
    const css = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.strictEqual(transform(css), css, `${f}: node scripts/themeize_css.js ${f}`);
    assert.ok(!/font-weight:\s*(?:[6-9]00|bold)/i.test(css), `${f}: 500 ustu kalinlik`);
  });
  const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  assert.ok(/--shadow-md:\s*none/.test(css));
  assert.ok(/:root\[data-theme="dark"\]/.test(css) && /--lx-bg:\s*#2C2C2A/.test(css) && /--lx-bg:\s*#FFFFFF/.test(css));
});

test('X9. Tema secimi: depolama yoksa cihaz ayari; gecersiz deger yok sayilir', () => {
  assert.ok(['light', 'dark'].includes(Theme.current()));
  assert.strictEqual(Theme.set('mavi'), Theme.current());
});

test('X10. theme.js stil sayfasindan once, app.js kapisi temayi kullanir', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const t = html.indexOf('core/theme.js'); const s = html.indexOf('style.css');
  assert.ok(t > 0 && t < s, 'theme.js <head> icinde, style.css once');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(/el\.style\.cssText = el\.hasAttribute\('data-lx-literal-color'\) \? css : themeizeInlineCss\(css\)/.test(app));
  assert.ok(/property-color-dot" data-lx-literal-color style=/.test(app), 'mulk rengi temaya cevrilmez');
  assert.ok(/data-theme-toggle/.test(html));
});

console.log('-----------------------------------------------------------------------------');
console.log(`Sonuc: ${passed}/${passed + failed} gecti`);
if (failed > 0) process.exit(1);
