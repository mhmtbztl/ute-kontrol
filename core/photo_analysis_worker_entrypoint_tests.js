const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'run_photo_analysis_worker.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

test('Worker requires server-only service role and Gemini secrets', () => {
  assert.match(source, /requiredEnvironment\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  assert.match(source, /requiredEnvironment\('GEMINI_API_KEY'\)/);
  assert.doesNotMatch(source, /SUPABASE_ANON_KEY/);
});

test('Supabase auth persistence and token refresh are disabled', () => {
  assert.match(source, /persistSession: false/);
  assert.match(source, /autoRefreshToken: false/);
});

test('One invocation processes at most one claimed analysis run', () => {
  assert.strictEqual((source.match(/runNextAnalysis\(/g) || []).length, 1);
  assert.match(source, /PHOTO_ANALYSIS_RUN_ID/);
});

test('Logs contain a bounded summary rather than provider payloads or secrets', () => {
  assert.match(source, /JSON\.stringify\(summary\)/);
  const logStatements = source.split('\n').filter(line => /process\.(?:stdout|stderr)\.write/.test(line)).join('\n');
  assert.doesNotMatch(logStatements, /resultPayload|serviceRoleKey|geminiApiKey|apiKey/);
});

test('Package exposes an explicit one-shot worker command', () => {
  assert.strictEqual(pkg.scripts['marketing:photo-worker'], 'node scripts/run_photo_analysis_worker.js');
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
