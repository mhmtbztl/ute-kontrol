'use strict';

/**
 * LEXBNB — AYRI SUPABASE TEST PROJESINE SEMA KURULUMU
 *
 * schema.sql + migration_manifest.txt'teki her gocu, manifest sirasiyla ve her
 * dosyayi kendi transaction'inda uygular. Kendi defterini tutar
 * (public.lexbnb_bootstrap_log), dolayisiyla tekrar kosulabilir: uygulanmis
 * dosyalar atlanir.
 *
 * Bu betik URETIM SEMASINA DOKUNMAZ ve dokunamaz — hedefin uretim referansi
 * olmasi kapatilamaz bir hatadir (AGENTS.md Kural 5 / CLAUDE.md 4.2: uretim
 * gocleri yalnizca Supabase panelinden, elle ve ayri onayla uygulanir).
 *
 * Kullanim:
 *   node scripts/bootstrap_test_project.js --check   # yalnizca rapor, yazma yok
 *   node scripts/bootstrap_test_project.js           # eksikleri uygula
 *
 * Gereken degiskenler (.env.test):
 *   TEST_SUPABASE_URL=https://<ref>.supabase.co
 *   TEST_DATABASE_URL=postgresql://postgres.<ref>:<parola>@<pooler-host>:5432/postgres
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const testEnv = require('../core/test_env.js');

const SUPABASE_DIR = path.join(__dirname, '..', 'supabase');
const MANIFEST = path.join(SUPABASE_DIR, 'migration_manifest.txt');
const LEDGER_TABLE = 'public.lexbnb_bootstrap_log';

const checkOnly = process.argv.includes('--check');

function readEnvironment() {
  return { ...testEnv.readEnvFileUnguarded('.env.test'), ...process.env };
}

/**
 * Supabase proje referansini baglanti dizesinden cikarir.
 * Dogrudan baglanti  : db.<ref>.supabase.co
 * Pooler baglantisi  : kullanici adi postgres.<ref>
 */
function projectRefFromDatabaseUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const hostMatch = parsed.hostname.toLowerCase().match(/^db\.([a-z0-9]+)\.supabase\./);
  if (hostMatch) return hostMatch[1];
  const userMatch = decodeURIComponent(parsed.username || '').match(/^postgres\.([a-z0-9]+)$/i);
  if (userMatch) return userMatch[1].toLowerCase();
  return null;
}

function assertSafeBootstrapTarget(env) {
  const supabaseUrl = String(env.TEST_SUPABASE_URL || '');
  const databaseUrl = String(env.TEST_DATABASE_URL || '');

  if (!supabaseUrl) throw new Error('BOOTSTRAP_GUARD: .env.test icinde TEST_SUPABASE_URL yok.');
  if (!databaseUrl) throw new Error('BOOTSTRAP_GUARD: .env.test icinde TEST_DATABASE_URL yok.');

  if (testEnv.isProductionTarget(supabaseUrl)) {
    throw new Error(`BOOTSTRAP_GUARD: uretim projesi hedeflenemez — ${supabaseUrl}`);
  }

  const dbRef = projectRefFromDatabaseUrl(databaseUrl);
  if (!dbRef) {
    throw new Error(
      'BOOTSTRAP_GUARD: TEST_DATABASE_URL icinden proje referansi cikarilamadi.\n' +
      '  Beklenen bicimler: db.<ref>.supabase.co  ya da  kullanici adi postgres.<ref>'
    );
  }
  if (testEnv.PRODUCTION_PROJECT_REFS.includes(dbRef)) {
    throw new Error(`BOOTSTRAP_GUARD: veritabani baglantisi uretim projesini gosteriyor — ${dbRef}`);
  }

  const supabaseRef = testEnv.projectRefOf(new URL(supabaseUrl).hostname);
  if (dbRef !== supabaseRef) {
    throw new Error(
      'BOOTSTRAP_GUARD: TEST_DATABASE_URL ile TEST_SUPABASE_URL farkli projeleri gosteriyor.\n' +
      `  veritabani: ${dbRef}\n  supabase  : ${supabaseRef}`
    );
  }

  return { databaseUrl, projectRef: dbRef };
}

/**
 * Dosyayi calistirilabilir SQL'e cevirir.
 *
 * schema.sql ve uc goc dosyasi UTF-8 BOM ile basliyor. BOM bir karakterdir ve
 * Postgres'e oldugu gibi gonderilirse ilk ifade sozdizimi hatasi verir. Yine de
 * HASH'ten cikarilmaz: manifest degerleri BOM dahil metin uzerinden uretildi ve
 * goc dosyalari degismezdir (AGENTS.md Kural 3) — dosyadan BOM'u silmek zincirin
 * tamamini gecersiz kilardi.
 */
function executableSql(text) {
  return text.replace(/^﻿/, '');
}

/** Manifest sirasi: once schema.sql, sonra her goc. */
function plannedFiles() {
  const entries = fs.readFileSync(MANIFEST, 'utf8').split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const [file, sha256] = line.split(/\s+/);
      return { file, sha256 };
    });
  // schema.sql manifeste yazili degil (temel anlik goruntu); hash'i dosyadan.
  return [{ file: 'schema.sql', sha256: null }, ...entries];
}

function canonicalSql(file) {
  return fs.readFileSync(path.join(SUPABASE_DIR, file), 'utf8').replace(/\r\n?/g, '\n');
}

function digestOf(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function main() {
  const env = readEnvironment();
  const { databaseUrl, projectRef } = assertSafeBootstrapTarget(env);

  const files = plannedFiles();
  // Manifest hash'i tutmuyorsa hic baglanma: degismez bir goc degismis demektir.
  const prepared = files.map(entry => {
    const sql = canonicalSql(entry.file);
    const digest = digestOf(sql);
    if (entry.sha256 && entry.sha256 !== digest) {
      throw new Error(
        `BOOTSTRAP_GUARD: degismez goc degismis — ${entry.file}\n` +
        '  Duzeltme yeni bir phase<N+1> gocu olarak eklenir (AGENTS.md Kural 3).'
      );
    }
    return { file: entry.file, sql: executableSql(sql), digest };
  });

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    application_name: 'lexbnb-test-bootstrap'
  });
  await client.connect();

  console.log('=============================================================================');
  console.log(`🏗️  LEXBNB TEST PROJESI BOOTSTRAP — hedef proje: ${projectRef}`);
  console.log(`   ${prepared.length} dosya (schema.sql + ${prepared.length - 1} goc)`);
  if (checkOnly) console.log('   --check: yalnizca rapor, hicbir sey yazilmayacak');
  console.log('=============================================================================\n');

  try {
    await client.query(`CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
      filename    TEXT PRIMARY KEY,
      sha256      TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const applied = new Map();
    const { rows } = await client.query(`SELECT filename, sha256 FROM ${LEDGER_TABLE}`);
    rows.forEach(row => applied.set(row.filename, row.sha256));

    let appliedCount = 0;
    let skippedCount = 0;

    for (const entry of prepared) {
      const previous = applied.get(entry.file);
      if (previous === entry.digest) {
        skippedCount++;
        console.log(`  =  ${entry.file.padEnd(56)} zaten uygulanmis`);
        continue;
      }
      if (previous && previous !== entry.digest) {
        throw new Error(
          `BOOTSTRAP_GUARD: ${entry.file} bu projeye baska bir icerikle uygulanmis.\n` +
          '  Test projesini sifirdan kurun ya da duzeltmeyi yeni bir goc olarak ekleyin.'
        );
      }
      if (checkOnly) {
        console.log(`  +  ${entry.file.padEnd(56)} UYGULANACAK`);
        appliedCount++;
        continue;
      }

      process.stdout.write(`  →  ${entry.file.padEnd(56)} `);
      await client.query('BEGIN');
      try {
        await client.query(entry.sql);
        await client.query(
          `INSERT INTO ${LEDGER_TABLE}(filename, sha256) VALUES ($1, $2)`,
          [entry.file, entry.digest]
        );
        await client.query('COMMIT');
        appliedCount++;
        console.log('uygulandi');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('HATA');
        throw new Error(`${entry.file} uygulanamadi: ${err.message}`);
      }
    }

    console.log('\n=============================================================================');
    console.log(checkOnly
      ? `Rapor: ${appliedCount} dosya eksik, ${skippedCount} dosya uygulanmis.`
      : `Tamam: ${appliedCount} dosya uygulandi, ${skippedCount} dosya atlandi.`);
    console.log('=============================================================================');
    if (checkOnly && appliedCount > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

// Dogrudan calistirildiginda kosar; require edildiginde yalnizca yardimcilarini
// verir — core/test_gate_tests.js korumalari boyle olcer.
if (require.main === module) {
  main().catch(err => {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  assertSafeBootstrapTarget,
  projectRefFromDatabaseUrl,
  executableSql,
  plannedFiles,
  canonicalSql,
  digestOf
};
