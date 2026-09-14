'use strict';

/**
 * LEXBNB — CANLI (VERITABANINA YAZAN) SUIT KOSUCUSU
 *
 * `npm test` cevrimdisi suitleri kosar ve disariya hic baglanmaz.
 * Bu betik, ayri bir Supabase TEST projesine karsi tam paketi kosar.
 *
 * Eskiden `npm run test:live` dogrudan run_all_tests.js'i cagiriyordu; yetki
 * bayragi verilmediginde sessizce guvenli kosuya donuyordu. Yani "canli testleri
 * kostum" diyen komut aslinda canli suitlerin HICBIRINI kosmamis oluyordu.
 * Burasi bunu acikca soyler ve eksik yapilandirmayi tarif eder.
 */

const path = require('path');
const { spawnSync } = require('child_process');
const testEnv = require('../core/test_env.js');

const ROOT = path.join(__dirname, '..');

function fail(lines) {
  console.error('\n❌ ' + lines.join('\n   ') + '\n');
  process.exit(1);
}

if (!testEnv.destructiveTestsAllowed()) {
  fail([
    `Canli suitler ${testEnv.DESTRUCTIVE_FLAG}=1 olmadan kosulmaz.`,
    'Bu suitler gercek kullanici ve gercek kayit yaratir; ayri bir Supabase test',
    'projesi gerekir. Kurulum: docs/TEST_PROJECT_SETUP.md',
    '',
    'Ornek (PowerShell):',
    '  $env:LEXBNB_ALLOW_DESTRUCTIVE_TESTS = "1"',
    '  $env:LEXBNB_CONFIRM_REMOTE_TEST_PROJECT = "<ref>.supabase.co"',
    '  npm run test:live'
  ]);
}

// Hedefi burada dogrula: kosucuyu baslatmadan once net bir mesaj ver.
let env;
try {
  env = testEnv.loadTestEnv();
} catch (err) {
  fail([err.message]);
}

console.log('=============================================================================');
console.log('🌐 LEXBNB CANLI SUIT KOSUSU');
console.log(`   env dosyasi : ${testEnv.envFileName()}`);
console.log(`   hedef proje : ${env.SUPABASE_URL}`);
console.log('=============================================================================\n');

const result = spawnSync(process.execPath, [path.join(ROOT, 'run_all_tests.js')], {
  stdio: 'inherit',
  env: { ...process.env, ...env }
});
process.exit(result.status === null ? 1 : result.status);
