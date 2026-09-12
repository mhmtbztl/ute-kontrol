const assert = require('assert');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'run_marketing_experiment_worker.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.message}`); }
}

test('Package exposes a one-shot experiment worker command', () => {
  assert.strictEqual(pkg.scripts['marketing:experiment-worker'], 'node scripts/run_marketing_experiment_worker.js');
});
test('Entrypoint requires service-role credentials and no AI provider secret', () => {
  assert.match(script, /requiredEnvironment\('SUPABASE_URL'\)/);
  assert.match(script, /requiredEnvironment\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  assert.doesNotMatch(script, /GEMINI|OPENAI|ANTHROPIC/);
});
test('Optional targeted execution uses a dedicated experiment id', () => {
  assert.match(script, /process\.env\.MARKETING_EXPERIMENT_ID/);
});
test('Only idle and evaluated outcomes exit successfully', () => {
  assert.match(script, /\['IDLE', 'EVALUATED'\]\.includes\(result\.status\)/);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
