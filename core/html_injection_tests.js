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
  '<button onclick="fn(\'${escapeHtml(l.notes)}\')">x</button>`;');
check(ornek.length === 2 && ornek.some(x => x.isleyicide),
  '1b. Tarayıcı kaçışsız metni ve işleyicide escapeHtml kullanımını yakalıyor', JSON.stringify(ornek));

// --- 2. Uygulamanin kendi isleyicileri temizleyiciden geciyor mu -------------
const izinliFiil = (APP.match(/const allowedHandlerName = (\/.*\/);/) || [])[1];
const fiilRe = izinliFiil ? eval(izinliFiil) : null; // kaynaktaki regex'in kendisi
const olaylar = new Set(['onclick', 'ondblclick', 'onchange', 'oninput', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress']);
const sorunlu = [];
dosyalar.forEach(f => {
  const k = fs.readFileSync(path.join(KOK, f), 'utf8');
  const re = /\s(on[a-z]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(k))) {
    // Yalniz JS sablonlari (innerHTML ile gelen); index.html burada yok.
    const olay = m[1].toLowerCase();
    const govde = m[2].replace(/\$\{[^}]*\}/g, 'X').trim().replace(/;$/, '');
    const cagri = govde.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/s);
    const argumanlar = cagri ? cagri[2].replace(/(?:encode|decode)URIComponent\(\s*(['"])[^'"]*\1\s*\)/g, "''") : '';
    if (!olaylar.has(olay) || !cagri || !fiilRe || !fiilRe.test(cagri[1]) || govde.includes(';') || /[`(){};=<>]/.test(argumanlar)) {
      sorunlu.push(`${f}: ${m[0].trim().slice(0, 100)}`);
    }
  }
});
check(sorunlu.length === 0, '2. Şablonlardaki her satır içi işleyici sıkılaştırılmış temizleyiciden geçer',
  sorunlu.slice(0, 15).join('\n       '));

// --- 3. Temizleyici sozlesmesi -----------------------------------------------
check(/const allowedHandlerAttrs = new Set\(\['onclick'/.test(APP) && /!allowedHandlerAttrs\.has\(name\)/.test(APP),
  '3a. Yalnız etkileşim olayları; onerror/onload/onmouseover her koşulda silinir', 'allowedHandlerAttrs yok');
check(/return chunks\.length === 1 && chunks\.every/.test(APP),
  '3b. İşleyici tek çağrı; ";" ile zincir kabul edilmez', 'zincir hâlâ kabul ediliyor');

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
