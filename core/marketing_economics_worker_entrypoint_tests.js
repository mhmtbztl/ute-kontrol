const assert = require('assert'); const fs = require('fs'); const path = require('path');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'))); const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'run_marketing_economics_worker.js'), 'utf8');
let total = 0; let passed = 0; function test(name, fn) { total += 1; try { fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.message}`); } }
test('Package exposes economics worker', () => assert.strictEqual(pkg.scripts['marketing:economics-worker'], 'node scripts/run_marketing_economics_worker.js'));
test('Worker requires service role', () => assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/));
test('Worker has tenant, batch and period controls', () => { assert.match(source, /MARKETING_TENANT_ID/); assert.match(source, /MARKETING_ECONOMICS_LIMIT/); assert.match(source, /MARKETING_ECONOMICS_PERIOD_DAYS/); });
console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`); if (passed !== total) process.exit(1);
