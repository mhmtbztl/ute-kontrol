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

console.log(`Migration chain verified: schema.sql + ${entries.length} immutable migrations.`);
