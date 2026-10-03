#!/usr/bin/env node
// GitHub Pages yayin klasorunu uretir (L-19, A6-G3).
//
// Eskiden Pages deponun KOKUNU yayinliyordu: CLAUDE.md, supabase/schema.sql,
// gocler, testler ve core/test_env.js herkese aciktı. Artik yalniz uygulamanin
// tarayicida kullandigi dosyalar yayinlanir. Liste yerel sunucunun izin
// listesiyle (server.js isAllowed) AYNI kaynaktir: biri genisleyip digeri
// genislemezse yerelde calisan sayfa canlida 404 verirdi.
//
// Yalniz git'in izledigi dosyalar yayinlanir; calisma klasorundeki takipsiz
// bir dosya (.env kopyasi, gecici cikti) yanlislikla yayina giremez.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { isAllowed } = require('../server.js');

const ROOT = path.join(__dirname, '..');
// Pages'e ozel, uygulamanin yuklemedigi dosyalar.
const PAGES_ONLY = new Set(['CNAME']);

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function listPublishFiles(files = trackedFiles()) {
  return files.filter(rel => PAGES_ONLY.has(rel) || isAllowed(rel)).sort();
}

// Cikti klasoru silinip yeniden kurulur; yanlis bir argumanin baska bir
// klasoru silmemesi icin hedef kilitlidir (Codex H3-01): adi `_site` olmali,
// depo koku / ev klasoru / disk koku olamaz ve icinde proje dosyasi bulunamaz.
function assertSafeOutDir(outDir) {
  const target = path.resolve(outDir);
  const forbidden = [ROOT, path.parse(target).root, require('os').homedir()].map(p => path.resolve(p).toLowerCase());
  if (path.basename(target) !== '_site') throw new Error(`Pages cikti klasorunun adi _site olmali: ${target}`);
  if (forbidden.includes(target.toLowerCase())) throw new Error(`Pages cikti klasoru korunan bir yol: ${target}`);
  if (fs.existsSync(target)) {
    if (!fs.statSync(target).isDirectory()) throw new Error(`Pages cikti yolu bir klasor degil: ${target}`);
    const guard = ['.git', 'package.json', '.env'].find(name => fs.existsSync(path.join(target, name)));
    if (guard) throw new Error(`Pages cikti klasorunde ${guard} var; silinmedi: ${target}`);
  }
  return target;
}

function buildPages(outDir = path.join(ROOT, '_site')) {
  outDir = assertSafeOutDir(outDir);
  fs.rmSync(outDir, { recursive: true, force: true });
  const files = listPublishFiles();
  for (const rel of files) {
    const target = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), target);
  }
  return files;
}

if (require.main === module) {
  const outDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, '_site');
  const files = buildPages(outDir);
  console.log(`Pages: ${files.length} dosya -> ${path.relative(ROOT, outDir) || outDir}`);
}

module.exports = { listPublishFiles, buildPages, trackedFiles, assertSafeOutDir };
