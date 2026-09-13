#!/usr/bin/env node
/**
 * LEXBNB ASSET CACHE STAMPER
 *
 * SORUN:
 *   index.html yerel dosyalari surum damgasi olmadan cagiriyordu
 *   (<script src="core/pricing_engine.js">). GitHub Pages bu dosyalara
 *   Cache-Control: max-age=600 veriyor, yani bir duzeltme yayinlandiktan
 *   sonra kullanicilar 10 dakika boyunca ESKI kodu calistirmaya devam ediyor.
 *   app.js'te bir ?v=5.5.2 vardi ama elle yazilmisti ve hic guncellenmiyordu,
 *   dolayisiyla hicbir ise yaramiyordu.
 *
 * COZUM:
 *   Her yerel varligin src/href'ine, DOSYA ICERIGININ hash'inden turetilen bir
 *   ?v=... ekle. Dosya degismediyse damga da degismez (gereksiz indirme yok);
 *   degistiginde URL degisir ve tarayici yeni surumu hemen alir.
 *
 * KULLANIM:
 *   node stamp_assets.js          -> index.html'i guncelle
 *   node stamp_assets.js --check  -> guncel mi diye bak, degilse 1 ile cik (CI)
 *
 * Commit etmeden ONCE calistirin.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const HTML = path.join(ROOT, 'index.html');
const checkOnly = process.argv.includes('--check');

// Yalnizca yerel varliklar damgalanir; CDN adresleri (https://...) atlanir.
const ATTR_RE = /\b(src|href)="(?!https?:|\/\/|data:|#|mailto:)([^"?#]+)(\?[^"#]*)?(#[^"]*)?"/g;

function hashFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex').slice(0, 8);
}

// -----------------------------------------------------------------------------
// 1. ADIM: index.html disindaki damgalar
//
// core/marketing_ui.js bagimliliklarini <script> etiketiyle degil, kendi
// icindeki bir tabloyla ('core/marketing_engine.js?v=xxxxxxxx') calisma aninda
// yukluyor. Bu damgalar elle yazilmisti ve 15'inin 15'i de dosya icerigiyle
// uyusmuyordu; yani bu dosyalar icin onbellek kirma hic calismiyordu.
// Burada index.html'den ONCE damgalanmalari sart: kendi icerigi degistigi icin
// marketing_ui.js'in index.html'deki damgasi da yeniden hesaplanmali.
const SATELLITE_FILES = ['core/marketing_ui.js'];
const SATELLITE_RE = /(['"])(core\/[A-Za-z0-9_.-]+\.(?:js|css))\?v=([0-9a-f]{8})\1/g;

const missing = [];
let satelliteStamped = 0;
const satelliteStale = [];

SATELLITE_FILES.forEach(rel => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const src = fs.readFileSync(abs, 'utf8');
  const next = src.replace(SATELLITE_RE, (match, quote, file, oldHash) => {
    const h = hashFile(file);
    if (!h) { missing.push(file); return match; }
    satelliteStamped++;
    if (h !== oldHash) satelliteStale.push(`${rel}: ${file} ${oldHash} -> ${h}`);
    return `${quote}${file}?v=${h}${quote}`;
  });
  if (next === src) return;
  if (!checkOnly) fs.writeFileSync(abs, next);
});

let html = fs.readFileSync(HTML, 'utf8');
const original = html;

let stamped = 0, skipped = 0;

html = html.replace(ATTR_RE, (match, attr, file, query, hash) => {
  // Sadece tarayicinin onbelleklemesi sorun yaratan tipler
  if (!/\.(js|css)$/i.test(file)) { skipped++; return match; }

  const h = hashFile(file);
  if (!h) { missing.push(file); return match; }

  stamped++;
  return `${attr}="${file}?v=${h}${hash || ''}"`;
});

if (missing.length) {
  console.error('UYARI: diskte bulunamayan varliklar (damgalanmadi):');
  [...new Set(missing)].forEach(f => console.error('  - ' + f));
}

if (checkOnly) {
  if (satelliteStale.length) {
    console.error('X calisma aninda yuklenen bagimlilik damgalari guncel DEGIL:');
    satelliteStale.forEach(line => console.error('  - ' + line));
  }
  if (html !== original || satelliteStale.length) {
    console.error('X damgalar guncel DEGIL. Commit etmeden once calistirin: node stamp_assets.js');
    process.exit(1);
  }
  console.log(`OK damgalar guncel (${stamped} index.html + ${satelliteStamped} calisma ani varligi).`);
  process.exit(0);
}

if (html === original && !satelliteStale.length) {
  console.log(`Degisiklik yok — ${stamped + satelliteStamped} varlik zaten guncel damgali.`);
} else {
  if (html !== original) fs.writeFileSync(HTML, html);
  console.log(`Damgalandi: index.html ${stamped} varlik (${skipped} atlandi, js/css degil), calisma ani ${satelliteStamped} varlik (${satelliteStale.length} guncellendi).`);
}
