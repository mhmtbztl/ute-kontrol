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

let html = fs.readFileSync(HTML, 'utf8');
const original = html;

let stamped = 0, skipped = 0;
const missing = [];

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
  if (html !== original) {
    console.error('X index.html guncel DEGIL. Commit etmeden once calistirin: node stamp_assets.js');
    process.exit(1);
  }
  console.log(`OK index.html guncel (${stamped} varlik damgali).`);
  process.exit(0);
}

if (html === original) {
  console.log(`Degisiklik yok — ${stamped} varlik zaten guncel damgali.`);
} else {
  fs.writeFileSync(HTML, html);
  console.log(`index.html guncellendi: ${stamped} varlik damgalandi, ${skipped} atlandi (js/css degil).`);
}
