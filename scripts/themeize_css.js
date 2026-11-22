#!/usr/bin/env node
/**
 * Koyu tema icin yazilmis sabit renkleri tema degiskenlerine cevirir
 * (core/theme.js themeizeCss ile AYNI esleme). Tek seferlik donusumdur; yeniden
 * kosmak zararsizdir (degisken zaten donusmus degeri degistirmez).
 *
 *   node scripts/themeize_css.js style.css analytics.css      # yazar
 *   node scripts/themeize_css.js --check style.css            # donusmemis renk varsa 1
 *
 * :root, [data-theme] ve @font-face bloklarina dokunulmaz: tema degiskenleri orada tanimlidir.
 */
const fs = require('fs');
const path = require('path');
const { themeizeCss } = require('../core/theme.js');

function transform(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) { out += css.slice(i); break; }
    const close = css.indexOf('}', open);
    const nextOpen = css.indexOf('{', open + 1);
    if (close < 0) { out += css.slice(i); break; }
    if (nextOpen >= 0 && nextOpen < close) {
      // @media / @supports gibi kapsayici: basligi aynen yaz, ice gir.
      out += css.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    const lastBoundary = Math.max(css.lastIndexOf('}', open - 1), css.lastIndexOf('{', open - 1), css.lastIndexOf('*/', open - 1));
    const selector = css.slice(lastBoundary + 1, open);
    const body = css.slice(open + 1, close);
    const skip = /:root|\[data-theme|@font-face|@keyframes/.test(selector) || /^\s*(from|to|\d+%)/.test(selector.trim());
    out += css.slice(i, open + 1) + (skip ? body : themeizeCss(body)) + '}';
    i = close + 1;
  }
  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const files = args.filter(a => a !== '--check');
  let changed = 0;
  for (const rel of files) {
    const file = path.resolve(rel);
    const src = fs.readFileSync(file, 'utf8');
    const next = transform(src);
    if (next !== src) {
      changed++;
      if (check) console.error(`${rel}: donusmemis sabit renk var (node scripts/themeize_css.js ${rel})`);
      else { fs.writeFileSync(file, next); console.log(`${rel}: donusturuldu`); }
    } else console.log(`${rel}: guncel`);
  }
  if (check && changed) process.exit(1);
}

module.exports = { transform };
