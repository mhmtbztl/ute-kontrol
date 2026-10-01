const assert = require('assert');
const Service = require('./sales_workflow_service');

function query(result, calls) {
  return {
    upsert(payload, options) { calls.push(['upsert', payload, options]); return this; },
    insert(payload) { calls.push(['insert', payload]); return this; },
    delete() { calls.push(['delete']); return this; },
    eq(key, value) { calls.push(['eq', key, value]); return this; },
    select() { return this; },
    single() { return Promise.resolve(result); },
    then(resolve) { return Promise.resolve(result).then(resolve); }
  };
}

(async () => {
  const calls = [];
  const client = {
    from(table) { calls.push(['from', table]); return query({ data: { id: 'x' }, error: null }, calls); },
    async rpc(name, args) { calls.push(['rpc', name, args]); return { data: { count: 2 }, error: null }; }
  };
  await Service.saveWorkflow(client, { tenantId: 't1', leadId: 'l1', assignedTo: 'u1', nextFollowUpAt: '2026-10-04T09:00:00Z' });
  assert(calls.some(call => call[0] === 'upsert' && call[2].onConflict === 'lead_id'));
  assert.deepStrictEqual(await Service.bumpInterest(client, { tenantId: 't1', day: '2026-10-02', sourceId: 's1', channel: 'WHATSAPP', delta: 1 }), { count: 2 });
  assert(calls.some(call => call[1] === 'bump_lead_interest'));

  const marketingDenied = Service.buildWhatsAppLink({ phone: '+905551112233', body: 'Tekrar bekleriz', messageType: 'MARKETING', marketingOptIn: false, allowWhatsapp: true });
  assert.strictEqual(marketingDenied.allowed, false);
  const transactional = Service.buildWhatsAppLink({ phone: '+905551112233', body: 'Teklifiniz hazır', messageType: 'TRANSACTIONAL', marketingOptIn: false, allowWhatsapp: true });
  assert(transactional.allowed && transactional.url.startsWith('https://wa.me/905551112233'));
  console.log('[PASS] Satış iş akışı takip, ilgi ve izinli WhatsApp sözleşmelerini uygular');
})().catch(error => { console.error(error); process.exit(1); });
