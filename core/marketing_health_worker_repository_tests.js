const assert = require('assert');
const { createRepository } = require('./marketing_health_worker_repository');
let total = 0; let passed = 0;
async function test(name, fn) { total += 1; try { await fn(); passed += 1; console.log(`[PASS] ${name}`); } catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); } }

function client() {
  const calls = [];
  return { calls,
    from(table) {
      const call = { table, filters: [] }; calls.push(call);
      const builder = {
        select(columns) { call.columns = columns; return builder; },
        eq(column, value) { call.filters.push(['eq', column, value]); return builder; },
        lte(column, value) { call.filters.push(['lte', column, value]); return builder; },
        or(value) { call.or = value; return builder; },
        order(column, options) { call.order = [column, options]; return builder; },
        limit(value) { call.limit = value; return Promise.resolve({ data: [], error: null }); }
      }; return builder;
    },
    async rpc(name, args) { calls.push({ rpc: name, args }); return { data: 'S1', error: null }; }
  };
}

(async () => {
  await test('Candidate discovery may be tenant-scoped and deduplicates properties', async () => {
    const db = client();
    db.from = function (table) {
      const call = { table, filters: [] }; db.calls.push(call);
      const builder = { select() { return builder; }, eq(c, v) { call.filters.push(['eq', c, v]); return builder; }, order() { return builder; }, async limit() { return { data: [{ tenant_id: 'T', property_id: 'P' }, { tenant_id: 'T', property_id: 'P' }] }; } };
      return builder;
    };
    const rows = await createRepository(db).loadCandidateProperties('T', 20);
    assert.deepStrictEqual(rows, [{ tenantId: 'T', propertyId: 'P' }]);
    assert.deepStrictEqual(db.calls[0].filters, [['eq', 'tenant_id', 'T']]);
  });
  await test('Current inputs are constrained by tenant, property, observation and expiry time', async () => {
    const db = client();
    await createRepository(db).loadCurrentInputs('T', 'P', '2026-09-20T00:00:00Z');
    const call = db.calls[0];
    assert.deepStrictEqual(call.filters, [['eq', 'tenant_id', 'T'], ['eq', 'property_id', 'P'], ['lte', 'as_of', '2026-09-20T00:00:00Z']]);
    assert.match(call.or, /expires_at\.is\.null,expires_at\.gt\./);
  });
  await test('Final scores persist only through the service-role RPC contract', async () => {
    const db = client();
    await createRepository(db).persistSnapshot({ tenantId: 'T', propertyId: 'P', inputFingerprint: 'f', scoringVersion: 'v', asOf: 'now', result: {}, sourceInputIds: ['I'] });
    assert.strictEqual(db.calls[0].rpc, 'persist_property_marketing_health_snapshot');
    assert.deepStrictEqual(db.calls[0].args.p_source_input_ids, ['I']);
  });
  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
