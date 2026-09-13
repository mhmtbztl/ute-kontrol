const assert = require('assert');
const service = require('./photo_analysis_supabase_repository');

let total = 0;
let passed = 0;
async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

function clientWith(rows = {}) {
  const calls = [];
  return {
    calls,
    storage: {
      from(bucket) {
        return { async download(storagePath, options) {
          calls.push({ kind: 'storage', bucket, storagePath, options });
          return rows.storageDownload || { data: { type: 'image/webp', arrayBuffer: async () => new ArrayBuffer(8) }, error: null };
        } };
      }
    },
    async rpc(name, args) { calls.push({ kind: 'rpc', name, args }); return rows[name] || { data: null, error: null }; },
    from(table) {
      const call = { kind: 'table', table, select: null, filters: [] };
      calls.push(call);
      const builder = {
        select(value) { call.select = value; return builder; },
        eq(column, value) { call.filters.push({ op: 'eq', column, value }); return builder; },
        in(column, value) { call.filters.push({ op: 'in', column, value }); return builder; },
        gte(column, value) { call.filters.push({ op: 'gte', column, value }); return builder; },
        order(column, value) { call.order = { column, value }; return builder; },
        limit(value) { call.limit = value; return builder; },
        async maybeSingle() { return { data: (rows[table] || [])[0] || null, error: null }; },
        then(resolve) { resolve({ data: rows[table] || [], error: null }); }
      };
      return builder;
    }
  };
}

(async () => {
  await test('Claiming delegates only to the service-role claim RPC', async () => {
    const client = clientWith({ claim_photo_analysis_run: { data: { id: 'R1' } } });
    const repository = service.createRepository(client);
    assert.deepStrictEqual(await repository.claimRun(null), { id: 'R1' });
    assert.deepStrictEqual(client.calls[0], { kind: 'rpc', name: 'claim_photo_analysis_run', args: { p_run_id: null } });
  });

  await test('Property and media reads are explicitly tenant and property scoped', async () => {
    const client = clientWith();
    const repository = service.createRepository(client);
    await repository.loadProperty('T1', 'P1');
    await repository.loadActiveMedia('T1', 'P1');
    client.calls.filter(call => call.kind === 'table').forEach(call => {
      assert(call.filters.some(item => item.column === 'tenant_id' && item.value === 'T1'));
      assert(call.filters.some(item => ['id', 'property_id'].includes(item.column) && item.value === 'P1'));
    });
  });

  await test('Cached item lookup is TTL bounded and deduplicates newest cache keys', async () => {
    const client = clientWith({ photo_analysis_items: [
      { id: 'NEW', cache_key: 'a', created_at: '2026-09-10T00:00:00Z' },
      { id: 'OLD', cache_key: 'a', created_at: '2026-09-01T00:00:00Z' },
      { id: 'B', cache_key: 'b', created_at: '2026-09-02T00:00:00Z' }
    ] });
    const repository = service.createRepository(client);
    const result = await repository.loadCachedItems('T1', ['a', 'b'], '2026-09-12T00:00:00Z');
    assert.deepStrictEqual(result.map(item => item.id), ['NEW', 'B']);
    const call = client.calls.find(item => item.table === 'photo_analysis_items');
    assert(call.filters.some(item => item.op === 'gte' && item.column === 'created_at'));
  });

  await test('Analysis images are privately downloaded as bounded transforms', async () => {
    const client = clientWith();
    const repository = service.createRepository(client);
    const result = await repository.loadAnalysisImage({ original_storage_path: 'T/P/M/original.jpg' });
    assert.strictEqual(result.mimeType, 'image/webp');
    const call = client.calls.find(item => item.kind === 'storage');
    assert.strictEqual(call.bucket, 'property-media');
    assert.deepStrictEqual(call.options.transform, { width: 1024, height: 1024, resize: 'contain', quality: 82 });
  });

  await test('Aggregate cache identity includes every version boundary', async () => {
    const client = clientWith({ photo_analysis_runs: [{ id: 'OLD', result_payload: { score: 80 } }] });
    const repository = service.createRepository(client);
    const result = await repository.findAggregateCache({
      tenantId: 'T1', propertyId: 'P1', propertyContextHash: 'h',
      promptVersion: 'p1', schemaVersion: 's1', now: '2026-09-12T00:00:00Z'
    });
    assert.deepStrictEqual(result.resultPayload, { score: 80 });
    const filters = client.calls.find(item => item.table === 'photo_analysis_runs').filters;
    ['tenant_id', 'property_id', 'property_context_hash', 'prompt_version', 'schema_version', 'status'].forEach(column => {
      assert(filters.some(item => item.column === column));
    });
  });

  await test('Completion and failure use only their guarded atomic RPCs', async () => {
    const client = clientWith({
      complete_photo_analysis_run: { data: { status: 'SUCCEEDED' } },
      fail_photo_analysis_run: { data: { status: 'FAILED' } }
    });
    const repository = service.createRepository(client);
    await repository.completeRun({ runId: 'R1', leaseToken: 'LEASE1', provider: 'P', modelVersion: 'M', providerRequestId: null, usageMetadata: {}, resultPayload: {}, items: [] });
    await repository.failRun('R2', 'LEASE2', 'BAD', 'detail');
    assert.deepStrictEqual(client.calls.filter(call => call.kind === 'rpc').map(call => call.name), ['complete_photo_analysis_run', 'fail_photo_analysis_run']);
    assert.strictEqual(client.calls[0].args.p_lease_token, 'LEASE1');
    assert.strictEqual(client.calls[1].args.p_lease_token, 'LEASE2');
  });

  await test('Backend errors remain visible to the scheduler', async () => {
    const client = clientWith({ claim_photo_analysis_run: { data: null, error: new Error('database unavailable') } });
    await assert.rejects(() => service.createRepository(client).claimRun(null), /database unavailable/);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
