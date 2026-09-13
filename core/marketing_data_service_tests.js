const assert = require('assert');
const MarketingDataService = require('./marketing_data_service');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests += 1;
  try {
    await fn();
    passedTests += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${error.stack || error.message}`);
  }
}

const TENANT = '11111111-1111-4111-8111-111111111111';
const PROPERTY = '22222222-2222-4222-8222-222222222222';

function mockClient(rowsByTable = {}, errorsByTable = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, filters: [], selected: null, order: null, limit: null };
      calls.push(call);
      const builder = {
        select(columns) { call.selected = columns; return builder; },
        eq(column, value) { call.filters.push({ kind: 'eq', column, value }); return builder; },
        in(column, value) { call.filters.push({ kind: 'in', column, value }); return builder; },
        order(column, options) { call.order = { column, ...options }; return builder; },
        limit(value) { call.limit = value; return builder; },
        then(resolve) {
          resolve({ data: rowsByTable[table] || [], error: errorsByTable[table] || null });
        }
      };
      return builder;
    }
  };
}

(async () => {
  await runTest('A valid tenant UUID is mandatory for every read', async () => {
    await assert.rejects(() => MarketingDataService.loadMarketingWorkspaceData(mockClient(), { tenantId: 'local-demo' }), /VALID_TENANT_ID_REQUIRED/);
  });

  await runTest('Every table read is explicitly tenant scoped', async () => {
    const client = mockClient();
    await MarketingDataService.loadMarketingWorkspaceData(client, { tenantId: TENANT });
    assert.ok(client.calls.length >= 5);
    client.calls.forEach(call => assert.ok(call.filters.some(filter => filter.kind === 'eq' && filter.column === 'tenant_id' && filter.value === TENANT)));
  });

  await runTest('Property scope is applied to every property-owned dataset', async () => {
    const client = mockClient();
    await MarketingDataService.loadMarketingWorkspaceData(client, { tenantId: TENANT, propertyId: PROPERTY });
    client.calls.filter(call => call.table !== 'channel_performance_snapshots').forEach(call => {
      assert.ok(call.filters.some(filter => filter.kind === 'eq' && filter.column === 'property_id' && filter.value === PROPERTY));
    });
  });

  await runTest('Snapshots are constrained to listing ids discovered inside scope', async () => {
    const client = mockClient({ property_channel_listings: [{ id: 'listing-a' }, { id: 'listing-b' }] });
    await MarketingDataService.loadMarketingWorkspaceData(client, { tenantId: TENANT, propertyId: PROPERTY });
    const snapshotCall = client.calls.find(call => call.table === 'channel_performance_snapshots');
    assert.deepStrictEqual(snapshotCall.filters.find(filter => filter.kind === 'in'), {
      kind: 'in', column: 'channel_listing_id', value: ['listing-a', 'listing-b']
    });
  });

  await runTest('No listing means no unscoped snapshot query', async () => {
    const client = mockClient();
    const result = await MarketingDataService.loadMarketingWorkspaceData(client, { tenantId: TENANT, propertyId: PROPERTY });
    assert.strictEqual(client.calls.some(call => call.table === 'channel_performance_snapshots'), false);
    assert.deepStrictEqual(result.snapshots, []);
  });

  await runTest('Media reads include the content hash required for deterministic analysis requests', async () => {
    const client = mockClient();
    await MarketingDataService.loadMarketingWorkspaceData(client, { tenantId: TENANT, propertyId: PROPERTY });
    const mediaCall = client.calls.find(call => call.table === 'property_media');
    assert.match(mediaCall.selected, /content_sha256/);
  });

  await runTest('Channel placement reads expose the recorded cover without crossing property scope', async () => {
    const client = mockClient({ channel_media_placements: [{ id: 'placement', is_cover: true }] });
    const result = await MarketingDataService.loadMarketingWorkspaceData(client, { tenantId: TENANT, propertyId: PROPERTY });
    const call = client.calls.find(item => item.table === 'channel_media_placements');
    assert.ok(call.filters.some(filter => filter.column === 'property_id' && filter.value === PROPERTY));
    assert.match(call.selected, /is_cover/);
    assert.strictEqual(result.placements.length, 1);
  });

  await runTest('Benchmark history is read-only and property scoped', async () => {
    const client = mockClient({ property_marketing_benchmarks: [{ id: 'benchmark' }] });
    const result = await MarketingDataService.loadMarketingWorkspaceData(client, { tenantId: TENANT, propertyId: PROPERTY });
    const call = client.calls.find(item => item.table === 'property_marketing_benchmarks');
    assert.ok(call.filters.some(filter => filter.column === 'property_id' && filter.value === PROPERTY));
    assert.strictEqual(result.benchmarks.length, 1);
  });

  await runTest('Health snapshots are read by property and newest evidence time', async () => {
    const client = mockClient();
    const result = await MarketingDataService.loadMarketingWorkspaceData(client, { tenantId: TENANT, propertyId: PROPERTY });
    const call = client.calls.find(item => item.table === 'property_marketing_health_snapshots');
    assert.deepStrictEqual(call.filters.find(filter => filter.column === 'property_id'), {
      kind: 'eq', column: 'property_id', value: PROPERTY
    });
    assert.deepStrictEqual(call.order, { column: 'as_of', ascending: false });
    assert.deepStrictEqual(result.healthSnapshots, []);
  });

  await runTest('One unavailable Phase 17 table degrades to partial data', async () => {
    const client = mockClient({}, { marketing_findings: { code: '42P01', message: 'relation missing' } });
    const result = await MarketingDataService.loadMarketingWorkspaceData(client, { tenantId: TENANT });
    assert.strictEqual(result.status, 'PARTIAL');
    assert.deepStrictEqual(result.findings, []);
    assert.deepStrictEqual(result.errors[0], { dataset: 'findings', code: '42P01', message: 'relation missing' });
  });

  await runTest('The adapter performs no insert, update, delete or RPC calls', async () => {
    const client = mockClient();
    await MarketingDataService.loadMarketingWorkspaceData(client, { tenantId: TENANT });
    assert.ok(client.calls.every(call => call.selected !== null));
    assert.strictEqual(typeof client.rpc, 'undefined');
  });

  console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (passedTests !== totalTests) process.exit(1);
})();
