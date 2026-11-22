/**
 * LEXBNB — YAZI TIPI: SISTEM SANS-SERIF (Lex Tasarimi, kullanici karari 21.11.2026)
 *
 * 08.11.2026'da Inter kendi sunucumuzdan veriliyordu (Google Fonts KVKK ve hiz
 * nedeniyle kalkmisti). Lex "sistem yazi tipi, yalniz iki kalinlik" dedigi icin
 * dosyalar da kalkti: acilista yazi tipi indirilmez. Bu suit sunlari olcer:
 * dis yazi tipi baglantisi yok, CSP yalniz 'self', @font-face/preload yok,
 * yazi yigini sistem yazisiyla baslar ve yalniz 400/500 kalinlik kullanilir.
 *
 * Dis sisteme baglanmaz.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { isAllowed } = require('../server.js');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); } catch (err) {
    failed++; console.error(`[FAIL] ${name}\n       ${err && err.message}`);
  }
}

const INDEX = read('index.html');
const CSS = read('style.css');

test('F1. Yayindaki hicbir dosya Google Fonts (ya da baska bir yazi tipi sunucusu) istemez', () => {
  const files = ['index.html', 'style.css', 'analytics.css', 'app.js', 'sw.js']
    .concat(fs.readdirSync(path.join(ROOT, 'core')).filter(f => f.endsWith('.js') && isAllowed('core/' + f)).map(f => 'core/' + f))
    .concat(fs.readdirSync(path.join(ROOT, 'yasal')).filter(f => f.endsWith('.html')).map(f => 'yasal/' + f));
  const bad = files.filter(f => /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net/.test(read(f)));
  assert.deepStrictEqual(bad, []);
});

test("F2. CSP: style-src ve font-src yalniz 'self'", () => {
  const csp = (INDEX.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
  assert.ok(csp, 'CSP yok');
  assert.match(csp, /(^|; )style-src 'self';/);
  assert.match(csp, /(^|; )font-src 'self';/);
});

test('F3. Yazi tipi dosyasi indirilmez: @font-face ve font preload yok', () => {
  assert.ok(!/@font-face/.test(CSS) && !/@font-face/.test(read('analytics.css')), '@font-face kaldi');
  assert.ok(!/rel="preload"[^>]*as="font"/.test(INDEX), 'yazi tipi preload kaldi');
  assert.ok(!fs.existsSync(path.join(ROOT, 'assets', 'fonts')) || fs.readdirSync(path.join(ROOT, 'assets', 'fonts')).length === 0, 'assets/fonts dosyalari kaldi');
});

test('F4. Yazi yigini sistem sans-serif ile baslar; Inter adi yok', () => {
  const sans = (CSS.match(/--font-sans:\s*([^;]+);/) || [])[1] || '';
  assert.match(sans, /^system-ui,/);
  assert.match(sans, /sans-serif$/);
  assert.ok(!/['"](?:Inter|JetBrains Mono)['"]/.test(CSS), 'eski aile adi kaldi');
});

test('F5. Yalniz iki kalinlik (400/500): stil dosyalarinda 500 ustu yok', () => {
  ['style.css', 'analytics.css'].forEach(f => {
    const kalin = read(f).match(/font-weight:\s*(?:[6-9]00|bold|bolder)/gi) || [];
    assert.deepStrictEqual(kalin, [], f);
  });
  assert.match(CSS, /b, strong, th, h1, h2, h3, h4, h5, h6, dt, legend, optgroup \{ font-weight: 500; \}/);
});

console.log('-----------------------------------------------------------------------------');
console.log(`Sonuc: ${passed}/${passed + failed} gecti`);
if (failed > 0) process.exit(1);
