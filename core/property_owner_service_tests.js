const assert = require('assert');
const Service = require('./property_owner_service');

(async () => {
  const calls = [];
  const client = {
    from(table) {
      return {
        insert(payload) {
          calls.push(['insert', table, payload]);
          if (table === 'property_owners') return { select() { return { async single() { return { data: { id: 'owner-1' }, error: null }; } }; } };
          return Promise.resolve({ error: null });
        },
        delete() {
          calls.push(['delete', table]);
          return { eq() { return this; }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); } };
        }
      };
    }
  };
  const result = await Service.saveOwnerAndLink(client, { tenantId: 't1', propertyId: 'p1', fullName: 'Ayşe Hanım', phone: '555' });
  assert.strictEqual(result.ownerId, 'owner-1');
  assert(calls.some(call => call[0] === 'delete' && call[1] === 'property_owner_links'));
  assert(calls.some(call => call[1] === 'property_owner_links' && call[2] && call[2].owner_id === 'owner-1'));
  console.log('[PASS] Mülk sahibi kaydı ve mülk bağlantısı kiracı kapsamında birlikte yürütülür');
})().catch(error => { console.error(error); process.exit(1); });
