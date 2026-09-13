const assert = require('assert');
const { createRepository } = require('./seasonal_marketing_worker_repository');

let total = 0;
let passed = 0;
async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

function mockClient() {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, filters: [], order: null, limit: null };
      calls.push(call);
      const builder = {
        select(columns) { call.columns = columns; return builder; },
        eq(column, value) { call.filters.push(['eq', column, value]); return builder; },
        not(column, operator, value) { call.filters.push(['not', column, operator, value]); return builder; },
        order(column, options) { call.order = [column, options]; return builder; },
        limit(value) { call.limit = value; return Promise.resolve({ data: [], error: null }); },
        then(resolve) { resolve({ data: [], error: null }); }
      };
      return builder;
    },
    async rpc(name, args) { calls.push({ rpc: name, args }); return { data: 'F1', error: null }; }
  };
}

(async () => {
  await test('Analysis candidates require succeeded and schema-validated runs in newest-first order', async () => {
    const db = mockClient();
    await createRepository(db).loadLatestAnalysisRuns(null, 50);
    const call = db.calls[0];
    assert.deepStrictEqual(call.filters, [
      ['eq', 'status', 'SUCCEEDED'], ['not', 'result_schema_validated_at', 'is', null]
    ]);
    assert.deepStrictEqual(call.order, ['completed_at', { ascending: false }]);
    assert.strictEqual(call.limit, 50);
  });

  await test('Media and listing reads are tenant and property scoped', async () => {
    const db = mockClient();
    const repo = createRepository(db);
    await repo.loadActiveMedia('T', 'P');
    await repo.loadActiveListings('T', 'P');
    db.calls.forEach(call => {
      assert.ok(call.filters.some(filter => filter[1] === 'tenant_id' && filter[2] === 'T'));
      assert.ok(call.filters.some(filter => filter[1] === 'property_id' && filter[2] === 'P'));
      assert.ok(call.filters.some(filter => filter[1] === 'status' || filter[1] === 'media_status'));
    });
  });

  await test('Findings persist only through the guarded idempotent RPC', async () => {
    const db = mockClient();
    const draft = {
      tenantId: 'T', propertyId: 'P', channelListingId: 'L', findingFingerprint: 'f'.repeat(64),
      sourceDomain: 'LISTING_AUDIT', findingCode: 'SEASONAL_COVER_REVIEW', metric: 'COVER_SUITABILITY_SCORE',
      title: 'Review', evidenceText: 'Evidence', observation: {}, hypotheses: [], recommendedChecks: [],
      recommendedAction: 'Review', actionKind: 'DIGITAL_REVIEW', confidenceTier: 'MEDIUM', impactScore: 5,
      urgencyScore: 4, revenueOpportunityAmount: null, currency: 'TRY'
    };
    await createRepository(db).persistFinding(draft);
    assert.strictEqual(db.calls.find(call => call.rpc).rpc, 'upsert_marketing_finding');
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
