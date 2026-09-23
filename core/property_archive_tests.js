const assert = require('assert');
const App = require('../app.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

function propertyClient(result = { data: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', slug: 'A' }, error: null }) {
  const state = { updates: [], filters: [], select: null };
  const query = {
    eq(column, value) {
      state.filters.push([column, value]);
      return this;
    },
    select(columns) {
      state.select = columns;
      return this;
    },
    async maybeSingle() {
      return result;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    }
  };
  return {
    state,
    client: {
      from(table) {
        assert.strictEqual(table, 'properties');
        return {
          update(payload) {
            state.updates.push(payload);
            return query;
          }
        };
      }
    }
  };
}

(async () => {
  const tenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  await test('Unknown non-UUID property fails closed before any tenant-wide update', async () => {
    const mock = propertyClient();
    App.setActiveTenant({ id: tenantId });
    App.setSupabaseClient(mock.client);
    App.setAppData({
      villas: {
        A: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', slug: 'A', name: 'A' },
        B: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', slug: 'B', name: 'B' }
      }
    });

    await assert.rejects(App.deleteProperty('MISSING'), /bulunamadı|kimliği/i);
    assert.strictEqual(mock.state.updates.length, 0);
    assert.strictEqual(App.getAppData().villas.A.isActive, undefined);
    assert.strictEqual(App.getAppData().villas.B.isActive, undefined);
  });

  await test('Archiving one property always filters by tenant and property id', async () => {
    const mock = propertyClient();
    App.setActiveTenant({ id: tenantId });
    App.setSupabaseClient(mock.client);
    App.setAppData({
      villas: {
        A: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', slug: 'A', name: 'A' },
        B: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', slug: 'B', name: 'B' }
      }
    });

    assert.strictEqual(await App.deleteProperty('A'), true);
    assert.deepStrictEqual(mock.state.filters, [
      ['tenant_id', tenantId],
      ['id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']
    ]);
    assert.strictEqual(mock.state.select, 'id, slug');
    assert.strictEqual(App.getAppData().villas.A.isActive, false);
    assert.strictEqual(App.getAppData().villas.B.isActive, undefined);
  });

  await test('A zero-row archive response is reported as not found', async () => {
    const mock = propertyClient({ data: null, error: null });
    App.setActiveTenant({ id: tenantId });
    App.setSupabaseClient(mock.client);
    App.setAppData({ villas: {} });

    await assert.rejects(
      App.deleteProperty('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
      /bulunamadı/
    );
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
