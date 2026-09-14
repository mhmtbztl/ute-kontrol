'use strict';

/**
 * LEXBNB — CANLI TEST ORTAMI YUKLEYICISI
 *
 * Bu dosya, veritabanina dokunan suitlerin kimlik bilgilerini okudugu TEK
 * yerdir. Daha once 22 suit .env dosyasini kendi basina, uc ayri bicimde
 * okuyordu (path.join, path.resolve ve calisma dizinine bagimli
 * fs.readFileSync('.env')). Ortak bir kapi olmadigi icin:
 *
 *   - Hedefi test projesine cevirmenin tek yolu .env dosyasini elle takas
 *     etmekti; yani suitler varsayilan olarak URETIME yaziyordu.
 *   - CLAUDE.md 5.4'teki 525 artik test hesabi tam olarak bu yuzden birikti.
 *
 * Buradaki kapi uc sey yapar:
 *   1. Canli suit, LEXBNB_ALLOW_DESTRUCTIVE_TESTS=1 olmadan HIC calismaz.
 *   2. Hedef URL, ayrica beyan edilen TEST_SUPABASE_URL ile birebir esit olmali.
 *   3. Uretim projesi KARA LISTEDE. Onay degiskeni doldurulsa bile reddedilir.
 *
 * Kural 3 bir beyaz liste degil kara liste gibi gorunuyor olabilir; degil.
 * Ikisi birden var: (2) beyaz liste (yalnizca acikca beyan edilen hedef),
 * (3) ustune kapatilamaz bir uretim reddi.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

// Uretim projesinin referansi. app.js icindeki DEFAULT_SUPABASE_URL ile ayni
// olmak zorunda; core/test_gate_tests.js bu esitligi olcer, yani istemci baska
// bir projeye tasinirsa kara liste sessizce eskimez.
const PRODUCTION_PROJECT_REFS = Object.freeze(['kirpcqklyjlrhvdbgdrq']);

const DESTRUCTIVE_FLAG = 'LEXBNB_ALLOW_DESTRUCTIVE_TESTS';
const CONFIRM_FLAG = 'LEXBNB_CONFIRM_REMOTE_TEST_PROJECT';

/** Canli (veritabanina yazan) suitler acikca yetkilendirildi mi? */
function destructiveTestsAllowed() {
  return process.env[DESTRUCTIVE_FLAG] === '1';
}

/**
 * Hangi env dosyasi okunacak?
 * Canli kapi acikken varsayilan .env.test — uretim .env'i kazara hedeflemek
 * icin ayrica LEXBNB_ENV_FILE ile ustune yazmak gerekir, ki o da kara listeye
 * takilir.
 */
function envFileName() {
  if (process.env.LEXBNB_ENV_FILE) return process.env.LEXBNB_ENV_FILE;
  return destructiveTestsAllowed() ? '.env.test' : '.env';
}

function envFilePath() {
  return path.isAbsolute(envFileName())
    ? envFileName()
    : path.join(REPO_ROOT, envFileName());
}

/** KEY=value ayristirici. Yorum satirlarini atlar, tirnaklari soyar. */
function parseEnvFile(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function projectRefOf(hostname) {
  return String(hostname || '').toLowerCase().split('.')[0];
}

function isProductionTarget(rawUrl) {
  let host;
  try {
    host = new URL(String(rawUrl)).hostname.toLowerCase();
  } catch (err) {
    return false;
  }
  return PRODUCTION_PROJECT_REFS.includes(projectRefOf(host));
}

/**
 * Canli suitin hedefini dogrular. Sirasiyla:
 *   - kapi acik mi,
 *   - hedef beyan edilen test hedefiyle ayni mi,
 *   - hedef uretim mi (kapatilamaz red),
 *   - uzak bir proje ise hostname acikca onaylandi mi.
 */
function assertSafeLiveTarget(env) {
  if (!destructiveTestsAllowed()) {
    throw new Error(
      `LIVE_TEST_GUARD: bu suit veritabanina yazar ve ${DESTRUCTIVE_FLAG}=1 olmadan calismaz.\n` +
      '  Ayri bir Supabase test projesi gerekir — kurulum: docs/TEST_PROJECT_SETUP.md'
    );
  }

  const target = String(env.SUPABASE_URL || '');
  const declared = String(env.TEST_SUPABASE_URL || '');

  if (!target) {
    throw new Error(`LIVE_TEST_GUARD: ${envFileName()} icinde SUPABASE_URL yok.`);
  }
  if (!declared || target !== declared) {
    throw new Error(
      'LIVE_TEST_GUARD: SUPABASE_URL, acikca beyan edilen TEST_SUPABASE_URL ile birebir esit olmali.\n' +
      `  okunan dosya: ${envFileName()}`
    );
  }

  // Kapatilamaz red. Onay degiskeni bunu gecemez — gecebilseydi koruma,
  // korumasi gereken tek durumda (yanlis dosyayla kosma) ise yaramazdi.
  if (isProductionTarget(target)) {
    throw new Error(
      'LIVE_TEST_GUARD: uretim projesi hedeflenemez. Canli suitler gercek kullanici\n' +
      '  ve gercek kayit yaratir; musteri verisinin yanina test hesabi birakmazlar.\n' +
      `  reddedilen hedef: ${target}`
    );
  }

  const host = new URL(target).hostname.toLowerCase();
  const clearlyNonProduction =
    host === 'localhost' || host === '127.0.0.1' || /(?:test|staging|dev)/.test(host);
  if (!clearlyNonProduction && process.env[CONFIRM_FLAG] !== host) {
    throw new Error(
      `LIVE_TEST_GUARD: uzak test projesinin hostname'ini ${CONFIRM_FLAG} ile onaylayin.\n` +
      `  beklenen deger: ${host}`
    );
  }

  return env;
}

/**
 * Canli suitlerin cagirdigi tek fonksiyon.
 * Dosya degerleri okunur, process.env ustune yazar (CI icin), sonra kapi.
 */
function loadTestEnv() {
  const env = { ...parseEnvFile(envFilePath()), ...process.env };
  assertSafeLiveTarget(env);
  return env;
}

/**
 * Kapi uygulanmadan okuma. Yalnizca suit OLMAYAN araclar icindir
 * (sizinti denetimi, bootstrap betigi) — bunlar kendi korumasini kendi koyar.
 */
function readEnvFileUnguarded(fileName) {
  const file = fileName || envFileName();
  return parseEnvFile(path.isAbsolute(file) ? file : path.join(REPO_ROOT, file));
}

module.exports = {
  loadTestEnv,
  assertSafeLiveTarget,
  readEnvFileUnguarded,
  destructiveTestsAllowed,
  envFileName,
  envFilePath,
  parseEnvFile,
  isProductionTarget,
  projectRefOf,
  PRODUCTION_PROJECT_REFS,
  DESTRUCTIVE_FLAG,
  CONFIRM_FLAG
};
