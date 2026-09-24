/**
 * LEXBNB — CERCEVE KORUMASI TESTI (CEVRIMDISI)
 *
 * L-18: uygulama baska bir sitenin iframe'ine gomulebiliyordu. frame_guard.js
 * yabanci cercevede belgeyi gizlemeli; ust duzeyde ve ayni koken
 * cercevesinde hicbir sey yapmamali. index.html onu ilk betik olarak
 * yuklemeli.
 */

const fs = require('fs');
const path = require('path');
const { isForeignFrame, apply } = require('./frame_guard.js');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

function pencere({ framed, sameOrigin, topWritable = true }) {
  const style = {};
  const win = { location: { origin: 'https://lexbnb.space', href: 'https://lexbnb.space/' }, document: { documentElement: { style } } };
  win.self = win;
  if (!framed) { win.top = win; return { win, style, redirected: () => false }; }
  let redirected = false;
  const top = {};
  Object.defineProperty(top, 'location', {
    get() { if (!sameOrigin) throw new Error('SecurityError'); return { origin: 'https://lexbnb.space' }; },
    set() { if (!topWritable) throw new Error('sandbox'); redirected = true; }
  });
  win.top = top;
  return { win, style, redirected: () => redirected };
}

let p = pencere({ framed: false });
check(!isForeignFrame(p.win) && !apply(p.win) && p.style.display === undefined, '1. Ust duzey sayfada hicbir sey yapilmaz', JSON.stringify(p.style));

p = pencere({ framed: true, sameOrigin: true });
check(!apply(p.win) && p.style.display === undefined, '2. Ayni koken cercevesi serbest', JSON.stringify(p.style));

p = pencere({ framed: true, sameOrigin: false });
check(apply(p.win) && p.style.display === 'none' && p.redirected(), '3. Yabanci cercevede belge gizlenir ve ust pencere uygulamaya yonlendirilir', JSON.stringify(p.style));

p = pencere({ framed: true, sameOrigin: false, topWritable: false });
let hata = null;
try { apply(p.win); } catch (e) { hata = e; }
check(!hata && p.style.display === 'none', '4. Yonlendirme engellense (sandbox) bile belge GIZLI kalir', hata ? hata.message : JSON.stringify(p.style));

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ilkBetik = (html.match(/<script[^>]*src="([^"]+)"/) || [])[1] || '';
check(/^core\/frame_guard\.js\?v=[0-9a-f]{8}$/.test(ilkBetik), '5. index.html cerceve korumasini ILK betik olarak yukluyor', `ilk betik: ${ilkBetik}`);
const { isAllowed } = require(path.join(__dirname, '..', 'server.js'));
check(isAllowed('core/frame_guard.js'), '6. Yerel sunucu betigi veriyor', 'izin listesinde yok');

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
