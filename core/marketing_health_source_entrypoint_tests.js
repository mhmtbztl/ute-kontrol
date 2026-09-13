const assert = require('assert'); const fs = require('fs'); const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'run_marketing_health_source_collector.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
let total = 0; let passed = 0; function test(name, fn) { total += 1; try { fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.message}`); } }
test('Package exposes a one-shot health source collector', () => assert.strictEqual(pkg.scripts['marketing:health-source-collector'], 'node scripts/run_marketing_health_source_collector.js'));
test('Collector requires only Supabase service credentials', () => { assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/); assert.doesNotMatch(source, /GEMINI|OPENAI|ANTHROPIC/); });
test('Tenant scope and batch size remain operational controls', () => { assert.match(source, /MARKETING_TENANT_ID/); assert.match(source, /MARKETING_SOURCE_LIMIT/); });
console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`); if (passed !== total) process.exit(1);
