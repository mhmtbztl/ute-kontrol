/**
 * LEXBNB OLAY YETKILENDIRICISI AGI (L-15 adim 3) — CEVRIMDISI
 *
 *  A. Ayristirici: uygulamanin kullandigi dil kabul edilir, geri kalan her sey
 *     (ozellik erisimi, birlestirme, ic ice cagri, izinsiz ad) reddedilir.
 *  B. Yetkilendirici satir ici isleyicinin anlamini korur: this, event,
 *     currentTarget, stopPropagation, return false, zincir, hata yalitimi.
 *  C. Kaynak: arayuzde satir ici isleyici kalmadi; her data-on* govdesi
 *     ayristirilir; izin listesi kullanilanla birebir ayni; CSP'de
 *     script-src 'unsafe-inline' yok; yetkilendirici app.js'ten once yuklenir.
 */
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
let passed = 0, failed = 0;
const check = (c, n, d) => { if (c) { passed++; console.log(`[PASS] ${n}`); } else { failed++; console.error(`[FAIL] ${n}\n       ${d}`); } };

let A;
try {
  A = require('./action_dispatch.js');
} catch (e) {
  check(false, '0. core/action_dispatch.js yuklenir', e.message);
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  process.exit(1);
}

try {
  // --- A. Ayristirici --------------------------------------------------------
  const izinli = [...A.EYLEMLER];
  const ornekAd = izinli.includes('switchTab') ? 'switchTab' : izinli[0];
  const kabul = (govde) => { const r = A.parseAction(govde); return !r.hata; };

  check(kabul(`${ornekAd}('finance')`), 'A1. Tek cagri + dize kabul', JSON.stringify(A.parseAction(`${ornekAd}('finance')`)));
  const zincir = A.parseAction(`event.stopPropagation(); ${ornekAd}(-1, 2.5, true, null, this.value, this.checked, this, event); return false;`);
  check(!zincir.hata && zincir.adimlar.length === 3 && zincir.adimlar[1].argumanlar.length === 8,
    'A2. Zincir, sayi, mantiksal, this.value/checked, event, return false kabul', JSON.stringify(zincir));
  const kod = A.parseAction(`${ornekAd}(decodeURIComponent('${A.encodeActionArg("O'Brien (VIP) %; x=1")}'))`);
  check(!kod.hata && kod.adimlar[0].argumanlar[0].deger === "O'Brien (VIP) %; x=1",
    'A3. encodeActionArg → decodeURIComponent turu tirnak, parantez, ; ve % ile bozulmaz', JSON.stringify(kod));
  check(/^[A-Za-z0-9_.~%-]*$/.test(A.encodeActionArg(`'"()!*<>;\\\` çğİ`)),
    'A4. encodeActionArg ciktisinda tirnak/parantez/ters bolu yok', A.encodeActionArg(`'"()!*<>;\\\``));

  const ret = [
    'alert(1)', 'open(\'https://x/\')', 'fetch(\'x\')', 'eval(\'1\')',
    `${ornekAd}(document.cookie)`, `${ornekAd}(window.location)`, `${ornekAd}('a' + document.body.innerText)`,
    `${ornekAd}(alert(1))`, `${ornekAd}(decodeURIComponent(document.cookie))`, `${ornekAd}('a\\')`,
    `${ornekAd}('x'`, `${ornekAd}`, `window.${ornekAd}()`, `${ornekAd}.call(null)`,
    `${ornekAd}()()`, `${ornekAd}(thisx)`, `${ornekAd}(this.innerHTML)`, `${ornekAd}(event.target)`,
    `${ornekAd}(x=1)`, `${ornekAd}(\`t\`)`, `constructor('return 1')()`, `__proto__()`, '', ';',
    `${ornekAd}(1a)`
  ];
  const kacan = ret.filter(kabul);
  check(kacan.length === 0, `A5. ${ret.length} kotu govde reddedilir (izinsiz ad, ozellik erisimi, birlestirme, ic ice cagri)`,
    kacan.join('  |  '));

  // --- B. Yetkilendirici ------------------------------------------------------
  function sahteOlay(tip, hedef) {
    const proto = {};
    Object.defineProperty(proto, 'currentTarget', { configurable: true, get: () => 'BELGE' });
    const o = Object.assign(Object.create(proto), {
      type: tip, target: hedef, cancelBubble: false, defaultPrevented: false, anlik: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.cancelBubble = true; },
      stopImmediatePropagation() { this.cancelBubble = true; this.anlik = true; }
    });
    return o;
  }
  function oge(oznitelikler, ebeveyn, ekstra) {
    return Object.assign({
      nodeType: 1, parentElement: ebeveyn || null,
      hasAttribute: k => Object.prototype.hasOwnProperty.call(oznitelikler, k),
      getAttribute: k => oznitelikler[k]
    }, ekstra || {});
  }

  const kayit = [];
  const eski = {};
  const sahteFn = (ad, fn) => { eski[ad] = globalThis[ad]; globalThis[ad] = fn; };
  const iki = izinli.slice(0, 2);
  const [f1, f2] = iki;
  try {
    sahteFn(f1, function (...a) { kayit.push({ ad: f1, a, this: this, ct: a[1] && a[1].currentTarget }); });
    sahteFn(f2, function (...a) { kayit.push({ ad: f2, a }); });

    const belge = { nodeType: 9 };
    const ust = oge({ 'data-onclick': `${f2}('ust')` }, belge);
    const dugme = oge({ 'data-onclick': `${f1}(this, event, this.value); return false` }, ust, { value: 'V' });
    const o1 = sahteOlay('click', dugme);
    A.dispatch(o1, belge);
    check(kayit.length === 2 && kayit[0].a[0] === dugme && kayit[0].a[1] === o1 && kayit[0].a[2] === 'V' && kayit[0].this !== dugme,
      'B1. this = oge, event = olay, this.value okunur; fonksiyonun this\'i oge degil (satir ici f() gibi)', JSON.stringify(kayit.map(k => k.ad)));
    check(kayit[0].ct === dugme && o1.currentTarget === 'BELGE',
      'B2. Isleyici calisirken currentTarget ogedir; sonra geri alinir', `${kayit[0].ct === dugme} ${o1.currentTarget}`);
    check(o1.defaultPrevented && kayit[1].ad === f2, 'B3. return false varsayilani engeller; olay ust ogeye kabarir', JSON.stringify(kayit.map(k => k.ad)));

    kayit.length = 0;
    const durduran = oge({ 'data-onclick': `event.stopPropagation(); ${f1}()` }, ust);
    const o2 = sahteOlay('click', durduran);
    A.dispatch(o2, belge);
    check(kayit.length === 1 && kayit[0].ad === f1 && o2.anlik,
      'B4. stopPropagation ust ogeyi ve sonraki belge dinleyicilerini durdurur', JSON.stringify(kayit.map(k => k.ad)));

    kayit.length = 0;
    const metin = { nodeType: 3, parentElement: dugme };
    A.dispatch(sahteOlay('click', metin), belge);
    check(kayit.length === 2, 'B5. Metin dugumune tiklama ogeye yukselir', String(kayit.length));

    kayit.length = 0;
    const kotuForm = oge({ 'data-onsubmit': 'alert(document.cookie)' }, belge);
    const o3 = sahteOlay('submit', kotuForm);
    A.dispatch(o3, belge);
    check(kayit.length === 0 && o3.defaultPrevented, 'B6. Ayristirilamayan gonderim isleyicisi calismaz ve form gonderilmez',
      `kayit=${kayit.length} engellendi=${o3.defaultPrevented}`);

    kayit.length = 0;
    const tanimsiz = [...A.EYLEMLER].find(ad => typeof globalThis[ad] !== 'function');
    if (tanimsiz) {
      const o4 = sahteOlay('submit', oge({ 'data-onsubmit': `${tanimsiz}(event)` }, belge));
      A.dispatch(o4, belge);
      check(o4.defaultPrevented, 'B7. Fonksiyonu yuklenmemis gonderim formu sayfayi URL\'ye gondermez', String(o4.defaultPrevented));
    }

    kayit.length = 0;
    globalThis[f1] = () => { throw new Error('beklenen'); };
    const hatalar = [];
    const eskiRapor = globalThis.reportError;
    globalThis.reportError = h => hatalar.push(h.message);
    try {
      A.dispatch(sahteOlay('click', oge({ 'data-onclick': `${f1}(); ${f2}('sonra')` }, ust)), belge);
    } finally {
      globalThis.reportError = eskiRapor;
    }
    check(hatalar[0] === 'beklenen' && kayit.length === 1 && kayit[0].a[0] === 'ust',
      'B8. Hata zinciri durdurur ama ust ogenin isleyicisini ve yetkilendiriciyi dusurmez', JSON.stringify({ hatalar, kayit: kayit.map(k => k.a) }));
  } finally {
    iki.forEach(ad => { if (eski[ad] === undefined) delete globalThis[ad]; else globalThis[ad] = eski[ad]; });
  }

  // --- C. Kaynak --------------------------------------------------------------
  const INDEX = fs.readFileSync(path.join(KOK, 'index.html'), 'utf8');
  const APP = fs.readFileSync(path.join(KOK, 'app.js'), 'utf8');
  const dosyalar = ['index.html', 'app.js'].concat(fs.readdirSync(path.join(KOK, 'core'))
    .filter(f => f.endsWith('.js') && !f.endsWith('_tests.js') && f !== 'action_dispatch.js' && f !== 'html_injection_scan.js')
    .map(f => 'core/' + f));
  const kaynak = {};
  dosyalar.forEach(f => { kaynak[f] = fs.readFileSync(path.join(KOK, f), 'utf8'); });

  const satirIci = [];
  dosyalar.forEach(f => {
    const re = /(?:^|[\s"'`<])(on[a-z]+)\s*=\s*["'\\]/gm;
    let m;
    while ((m = re.exec(kaynak[f]))) {
      const satir = kaynak[f].slice(0, m.index).split('\n').length;
      satirIci.push(`${f}:${satir} ${m[1]}`);
    }
  });
  check(satirIci.length === 0, '9. Arayuzde ve sablonlarda satir ici on* isleyicisi kalmadi', satirIci.slice(0, 15).join('\n       '));

  const kullanilan = new Set();
  const bozuk = [];
  let govdeSayisi = 0;
  dosyalar.forEach(f => {
    const re = /data-on([a-z]+)=(["'])([\s\S]*?)\2/g;
    let m;
    while ((m = re.exec(kaynak[f]))) {
      govdeSayisi++;
      const satir = kaynak[f].slice(0, m.index).split('\n').length;
      if (!A.OLAYLAR.includes(m[1])) { bozuk.push(`${f}:${satir} desteklenmeyen olay data-on${m[1]}`); continue; }
      // Sablon ifadeleri calisma aninda deger olur; ayristirici icin temsilci koy.
      const govde = m[3].replace(/decodeURIComponent\('\$\{[^}]*\}'\)/g, "decodeURIComponent('x')")
        .replace(/'\$\{[^}]*\}'/g, "'x'").replace(/\$\{[^}]*\}/g, '0');
      const r = A.parseAction(govde);
      if (r.hata) bozuk.push(`${f}:${satir} ${r.hata} — ${m[3].slice(0, 90)}`);
      else r.adimlar.filter(a => a.tur === 'cagri').forEach(a => kullanilan.add(a.ad));
      // Isleyiciye giren veri encodeActionArg ile kodlanir (encodeURIComponent tirnak kodlamaz).
      if (/decodeURIComponent\('\$\{(?!encodeActionArg\()/.test(m[3])) bozuk.push(`${f}:${satir} decodeURIComponent argumani encodeActionArg ile kodlanmali`);
    }
  });
  check(govdeSayisi > 250 && bozuk.length === 0, `10. ${govdeSayisi} data-on* govdesinin hepsi ayristirilir`, bozuk.slice(0, 15).join('\n       '));

  const fazla = [...A.EYLEMLER].filter(ad => !kullanilan.has(ad));
  check(fazla.length === 0, '11. Izin listesinde kullanilmayan eylem yok (liste yalniz gerektigi kadar genis)', fazla.join(', '));

  const tumKaynak = Object.values(kaynak).join('\n');
  const tanimsiz = [...A.EYLEMLER].filter(ad =>
    !new RegExp(`^\\s*(?:async\\s+)?function\\s+${ad.replace('$', '\\$')}\\s*\\(|window\\.${ad.replace('$', '\\$')}\\s*=`, 'm').test(tumKaynak));
  check(tanimsiz.length === 0, '12. Her izinli eylem genel bir fonksiyon olarak tanimli', tanimsiz.join(', '));

  const csp = (INDEX.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
  const scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || '';
  check(scriptSrc && !/unsafe-inline|unsafe-eval/.test(scriptSrc), "13. CSP script-src 'unsafe-inline' icermez", scriptSrc || 'CSP yok');

  const sira = (ad) => INDEX.search(new RegExp(`<script src="${ad.replace('.', '\\.')}\\?`));
  check(sira('core/action_dispatch.js') > 0 && sira('core/action_dispatch.js') < sira('app.js'),
    '14. Yetkilendirici app.js\'ten once yuklenir (belge dinleyicisi ilk kaydolur)', `${sira('core/action_dispatch.js')} / ${sira('app.js')}`);

  check(!/\[onclick\*=|\[onchange\*=/.test(APP), '15. Kod satir ici ozniteligi secici olarak aramiyor', 'app.js [onclick*= seciciyi kullaniyor');

  const inlineScript = (INDEX.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g) || []).filter(s => !/type="application\/(?:ld\+)?json"/.test(s));
  check(inlineScript.length === 0, '16. index.html satir ici <script> blogu icermez', inlineScript.map(s => s.slice(0, 60)).join(' | '));
} finally {
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
}
