const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', 'supabase');
const manifestPath = path.join(root, 'migration_manifest.txt');
const entries = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/)
  .map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  .map(line => {
    const [file, sha256] = line.split(/\s+/);
    return { file, sha256 };
  });

const listed = new Set(entries.map(e => e.file));
const actual = fs.readdirSync(root).filter(f => /^migration_.*\.sql$/.test(f));
const missing = actual.filter(f => !listed.has(f));
if (missing.length) throw new Error(`Unlisted migrations: ${missing.join(', ')}`);

for (const entry of entries) {
  const filePath = path.join(root, entry.file);
  if (!fs.existsSync(filePath)) throw new Error(`Missing migration: ${entry.file}`);
  // Git may materialize the same SQL with LF or CRLF depending on platform.
  // Hash canonical LF text so Windows and CI verify identical content.
  const canonicalSql = fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
  const digest = crypto.createHash('sha256').update(canonicalSql, 'utf8').digest('hex');
  if (digest !== entry.sha256) {
    throw new Error(`Immutable migration changed: ${entry.file}. Add a forward-fix migration instead.`);
  }
}

// -----------------------------------------------------------------------------
// SIRA DENETIMI
//
// Manifest yalnizca "hangi dosyalar" degil, "hangi sirayla" sozlesmesidir:
// basindaki yorum "Canonical order" der. Sira bagimlilik sirasi degilse dosyalar
// tek tek dogru gorunur ama veritabani SIFIRDAN KURULAMAZ.
//
// 2026-09-14'te tam olarak bu oldu: migration_phase17_change_impact.sql,
// property_media tablosuna ve property_channel_listings uzerindeki
// (tenant_id, property_id, id) unique indeksine dayaniyor; ikisini de
// migration_phase17_media_ai.sql yaratiyor ama manifest onu SONRA listeliyordu.
// Bos bir projede 16. dosyada "there is no unique constraint matching given keys"
// ile duruyordu. Uretimde gorunmemisti, cunku gocler orada elle ve calisan bir
// sirayla uygulanmisti — kimse sifirdan kurmayi denememisti.
//
// Bu denetim tablo duzeyinde calisir: bir goc, kendisinden SONRA yaratilan bir
// tabloya REFERENCES veremez. Kisit/indeks duzeyindeki bagimliliklari yakalamaz;
// onlarin hakemi bos bir projeye karsi `npm run test:bootstrap`.
// -----------------------------------------------------------------------------
const orderedFiles = ['schema.sql', ...entries.map(e => e.file)];
const sqlOf = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/^﻿/, '');

const createdAt = new Map();
const sources = orderedFiles.map(file => {
  const sql = sqlOf(file);
  for (const match of sql.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\.(\w+)/gi)) {
    if (!createdAt.has(match[1])) createdAt.set(match[1], orderedFiles.indexOf(file));
  }
  return sql;
});

const forwardReferences = [];
orderedFiles.forEach((file, index) => {
  const seen = new Set();
  for (const match of sources[index].matchAll(/REFERENCES\s+public\.(\w+)/gi)) {
    const table = match[1];
    if (createdAt.has(table) && createdAt.get(table) > index && !seen.has(table)) {
      seen.add(table);
      forwardReferences.push(`${file} -> public.${table} (${orderedFiles[createdAt.get(table)]} icinde yaratiliyor)`);
    }
  }
});

if (forwardReferences.length) {
  throw new Error(
    'Migration order is not dependency order — a fresh database cannot be built:\n  ' +
    forwardReferences.join('\n  ') +
    '\n  Fix: reorder the manifest so dependencies come first. File contents and ' +
    'hashes stay untouched, so immutability (AGENTS.md Kural 3) is preserved.'
  );
}

console.log(`Migration chain verified: schema.sql + ${entries.length} immutable migrations, dependency order OK.`);
