const assert = require('assert');
const { createRepository } = require('./marketing_experiment_worker_repository');

let total = 0;
let passed = 0;
async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

function client() {
  const calls = [];
  return {
    calls,
    async rpc(name, args) { calls.push({ kind: 'rpc', name, args }); return { data: { ok: true }, error: null }; },
    from(table) {
      const call = { kind: 'select', table, filters: [], order: null, limit: null };
      calls.push(call);
      const builder = {
        select(columns) { call.columns = columns; return builder; },
        eq(column, value) { call.filters.push(['eq', column, value]); return builder; },
        in(column, value) { call.filters.push(['in', column, value]); return builder; },
        order(column, options) { call.order = [column, options]; return builder; },
        limit(value) { call.limit = value; return builder; },
        async maybeSingle() { return { data: null, error: null }; }
      };
      return builder;
    }
  };
}

(async () => {
  await test('Claim and terminal writes use only guarded worker RPCs', async () => {
    const db = client();
    const repo = createRepository(db);
    await repo.claimExperiment(null);
    await repo.completeExperiment({ experimentId: 'E', leaseToken: 'T', beforeSnapshotId: 'B', afterSnapshotId: 'A', resultPayload: {} });
    await repo.failExperiment('E', 'T', 'ERR', 'detail');
    assert.deepStrictEqual(db.calls.filter(call => call.kind === 'rpc').map(call => call.name), [
      'claim_listing_change_experiment', 'complete_listing_change_experiment', 'fail_listing_change_experiment'
    ]);
  });

  await test('Evidence lookup is tenant, listing and exact-window scoped', async () => {
    const db = client();
    const repo = createRepository(db);
    await repo.loadWindowSnapshot({ tenantId: 'TENANT', listingId: 'LISTING', startDate: '2026-08-01', endDateExclusive: '2026-08-15' });
    const call = db.calls.find(item => item.kind === 'select');
    assert.deepStrictEqual(call.filters, [
      ['eq', 'tenant_id', 'TENANT'], ['eq', 'channel_listing_id', 'LISTING'],
      ['eq', 'period_start', '2026-08-01'], ['eq', 'period_end_exclusive', '2026-08-15'],
      ['in', 'validation_status', ['VALID', 'PARTIAL']]
    ]);
    assert.strictEqual(call.limit, 1);
  });

  await test('Database errors are surfaced', async () => {
    const repo = createRepository({
      from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { error: new Error('denied') }; } }; },
      async rpc() { return { data: null }; }
    });
    await assert.rejects(() => repo.loadWindowSnapshot({}), /denied/);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
