/**
 * LEXBNB HTML ENJEKSIYONU AGI (L-15) — CEVRIMDISI
 *
 *  1. Kaynak tarama: HTML sablonuna giren her kullanici/misafir verisi
 *     kacislanmis (core/html_injection_scan.js) — app.js ve tum core/ modulleri.
 *  2. Uygulamanin KENDI satir ici isleyicileri, sikilastirilmis temizleyiciden
 *     gecer: yalniz etkilesim olayi, tek cagri, izinli fiil, duz arguman.
 *     (Temizleyici bir isleyiciyi silerse dugme sessizce calismaz olur; bu
 *     yuzden kendi sablonlarimiz da ayni kurala karsi olculur.)
 *  3. Temizleyicinin sozlesmesi: otomatik tetiklenen olaylar ve zincir yasak.
 *
 * Tarayici davranisi ayrica gercek tarayicida olculdu (L-15 kaydi).
 */
const fs = require('fs');
const path = require('path');
const S = require('./html_injection_scan.js');

const KOK = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');

let passed = 0, failed = 0;
const check = (c, n, d) => { if (c) { passed++; console.log(`[PASS] ${n}`); } else { failed++; console.error(`[FAIL] ${n}\n       ${d}`); } };

// --- 1. Kaynak tarama --------------------------------------------------------
const dosyalar = ['app.js'].concat(fs.readdirSync(path.join(KOK, 'core'))
  .filter(f => f.endsWith('.js') && !f.endsWith('_tests.js') && f !== 'html_injection_scan.js')
  .map(f => 'core/' + f));
const bulgular = [];
dosyalar.forEach(f => S.scanFile(path.join(KOK, f)).forEach(b => bulgular.push(`${f}:${b.satir} ${b.ifade.slice(0, 80)}`)));
check(bulgular.length === 0, `1. ${dosyalar.length} dosyada kaçışsız kullanıcı verisi yok`,
  bulgular.slice(0, 20).join('\n       '));

// Tarayicinin kendisi gercekten yakaliyor mu (bos tarama her zaman gecer):
const ornek = S.scan('el.innerHTML = `<td>${b.guest}</td><td>${escapeHtml(b.guest)}</td>' +
  '<button data-onclick="fn(decodeURIComponent(\'${escapeHtml(l.notes)}\'))">x</button>' +
  '<button data-onclick="fn(decodeURIComponent(\'${encodeURIComponent(l.notes)}\'))">x</button>' +
  '<button data-onclick="fn(decodeURIComponent(\'${encodeActionArg(l.notes)}\'))">x</button>`;');
check(ornek.length === 3 && ornek.filter(x => x.isleyicide).length === 2,
  '1b. Tarayıcı kaçışsız metni, data-on* içinde escapeHtml ve encodeURIComponent (tek tırnağı kodlamaz) kullanımını yakalıyor',
  JSON.stringify(ornek));

// --- 2. Satir ici isleyici yok (L-15 adim 3) ---------------------------------
// Isleyicilerin tamami data-on* + core/action_dispatch.js'e tasindi; ayrintili
// ag action_dispatch_tests. Burada yalniz sablonlarin kurala uydugu olculur.
const satirIci = [];
dosyalar.forEach(f => {
  const k = fs.readFileSync(path.join(KOK, f), 'utf8');
  const re = /(?:^|[\s"'`<])(on[a-z]+)\s*=\s*["'\\]/gm;
  let m;
  while ((m = re.exec(k))) satirIci.push(`${f}:${k.slice(0, m.index).split('\n').length} ${m[1]}`);
});
check(satirIci.length === 0, '2. Şablonlarda satır içi on* işleyicisi yok', satirIci.slice(0, 15).join('\n       '));

// --- 3. Temizleyici sozlesmesi -----------------------------------------------
check(/if \(name\.startsWith\('on'\)\) \{\s*node\.removeAttribute\(attr\.name\);/.test(APP)
  && !/allowedHandlerName|handlerIsTrusted/.test(APP),
  '3. Temizleyici her on* özniteliğini koşulsuz siler (izinli fiil istisnası kalmadı)', 'on* hâlâ koşullu');

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
