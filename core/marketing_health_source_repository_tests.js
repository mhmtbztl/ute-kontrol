const assert = require('assert');
const { createRepository } = require('./marketing_health_source_repository');
let total = 0; let passed = 0;
async function test(name, fn) { total += 1; try { await fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); } }
(async () => {
  await test('Raw component persistence uses the service-role input RPC', async () => {
    const calls = []; const client = { from() {}, async rpc(name, args) { calls.push({ name, args }); return { data: 'I1' }; } };
    const repo = createRepository(client);
    const id = await repo.recordInput({ tenantId: 'T', propertyId: 'P', componentKey: 'PHOTO_QUALITY', measurementKind: 'DIRECT_SCORE', status: 'AVAILABLE', observedValue: 80, referenceValue: null, sampleSize: 10, minSampleSize: null, confidence: 0.8, reason: null, sourceKind: 'PHOTO_ANALYSIS', sourceRecordId: 'R', evidence: {}, inputFingerprint: 'f', asOf: 'A', expiresAt: 'E' });
    assert.strictEqual(id, 'I1'); assert.strictEqual(calls[0].name, 'record_property_marketing_health_input'); assert.strictEqual(calls[0].args.p_component_key, 'PHOTO_QUALITY');
  });
  await test('Property discovery is optionally tenant scoped', async () => {
    const call = { filters: [] }; const builder = { select() { return builder; }, eq(c, v) { call.filters.push([c, v]); return builder; }, order() { return builder; }, async limit() { return { data: [{ id: 'P', tenant_id: 'T' }] }; } };
    const repo = createRepository({ from(table) { call.table = table; return builder; }, async rpc() {} });
    assert.deepStrictEqual(await repo.loadPropertyScopes('T', 5), [{ tenantId: 'T', propertyId: 'P' }]);
    assert.deepStrictEqual(call.filters, [['tenant_id', 'T']]);
  });
  await test('Repository errors remain visible', async () => {
    const client = { from() { return {}; }, async rpc() { return { error: new Error('denied') }; } };
    await assert.rejects(() => createRepository(client).recordInput({}), /denied/);
  });
  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`); if (passed !== total) process.exit(1);
})();
