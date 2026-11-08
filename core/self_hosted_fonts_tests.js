/**
 * LEXBNB — YAZI TIPLERI KENDI SUNUCUMUZDAN (kullanici karari 08.11.2026)
 *
 * Google Fonts'a istek gitmez: tarayicinin IP adresi ucuncu tarafa aktarilmaz
 * (KVKK) ve acilisi engelleyen dis istek kalkar. Bu suit uc seyi olcer:
 * dis yazi tipi baglantisi yok, CSP yalniz 'self', ve style.css'in istedigi her
 * dosya diskte gercek bir woff2 olarak durur ve yayina (isAllowed) girer.
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
  const files = ['index.html', 'style.css', 'analytics.css', 'app.js']
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

const faces = [...CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => ({
  family: (m[1].match(/font-family:\s*'([^']+)'/) || [])[1],
  url: (m[1].match(/url\(([^)]+)\)/) || [])[1],
  range: (m[1].match(/unicode-range:\s*([^;]+);/) || [])[1] || ''
}));

test('F3. @font-face dosyalari diskte gercek woff2, yayina giriyor; lisanslar yaninda', () => {
  assert.ok(faces.length >= 4, 'Inter + JetBrains Mono, latin + latin-ext');
  for (const f of faces) {
    assert.ok(f.url && !/^https?:/.test(f.url), `yerel olmali: ${f.url}`);
    const buf = fs.readFileSync(path.join(ROOT, f.url));
    assert.strictEqual(buf.slice(0, 4).toString('latin1'), 'wOF2', `${f.url} woff2 degil`);
    assert.ok(isAllowed(f.url), `${f.url} yayina girmiyor (server.js isAllowed)`);
  }
  ['assets/fonts/inter-ofl.txt', 'assets/fonts/jetbrains-mono-ofl.txt'].forEach(rel => {
    assert.match(read(rel), /SIL Open Font License/);
    assert.ok(isAllowed(rel), rel);
  });
  assert.ok(!isAllowed('assets/fonts/../../.env') && !isAllowed('assets/fonts/x.ttf'));
});

test('F4. Turkce harfler ve TL isareti Inter dosyalarindan biriyle kapsanir', () => {
  const inRange = (cp, range) => range.split(',').some(part => {
    const [a, b] = part.trim().replace(/^U\+/i, '').split('-').map(h => parseInt(h, 16));
    return cp >= a && cp <= (Number.isFinite(b) ? b : a);
  });
  const inter = faces.filter(f => f.family === 'Inter');
  for (const ch of 'çÇğĞıİöÖşŞüÜ₺') {
    assert.ok(inter.some(f => inRange(ch.codePointAt(0), f.range)), `${ch} kapsanmiyor`);
  }
});

test('F5. Onden yuklenen (preload) yazi tipleri style.css ile ayni dosyalar; crossorigin var', () => {
  const pre = [...INDEX.matchAll(/<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin>/g)].map(m => m[1]);
  assert.ok(pre.length >= 1, 'en az Inter latin onden yuklenmeli');
  pre.forEach(u => assert.ok(faces.some(f => f.url === u), `${u} @font-face'te yok`));
});

console.log('-----------------------------------------------------------------------------');
console.log(`Sonuc: ${passed}/${passed + failed} gecti`);
if (failed > 0) process.exit(1);
