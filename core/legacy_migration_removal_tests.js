const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

test('Legacy local-to-cloud migration modal is removed', () => {
  assert.doesNotMatch(html, /id="migrationModal"|btnRunMigration|Yerel Verileri Buluta Aktar/);
});

test('Legacy migration entry points and stale-storage prompt are removed', () => {
  assert.doesNotMatch(app, /checkMigrationOpportunity|openMigrationModal|executeMigrationToCloud|pendingMigrationData/);
  assert.doesNotMatch(app, /localStorage\.getItem\(['"]LEXBNB_DATA_(?:usr_ute_master|V5)['"]\)/);
});

test('Client no longer upserts unverified local records into tenant tables', () => {
  assert.doesNotMatch(app, /source:\s*['"]localstorage['"]/);
  assert.doesNotMatch(app, /entity_type:\s*['"](?:property|booking|expense|cleaning)['"]/);
});

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
