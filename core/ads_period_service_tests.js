const assert = require('assert');
const Service = require('./ads_period_service');

function query(rows) {
  return { select() { return this; }, eq() { return this; }, order() { return Promise.resolve({ data: rows, error: null }); } };
}

(async () => {
  const calls = [];
  const client = {
    from(table) { calls.push({ type: 'from', table }); return query([{ id: 'period-1' }]); },
    async rpc(name, args) { calls.push({ type: 'rpc', name, args }); return { data: 'period-1', error: null }; }
  };

  assert.deepStrictEqual(await Service.loadPeriods(client, 'tenant-1'), [{ id: 'period-1' }]);
  assert.strictEqual(await Service.savePeriod(client, {
    tenantId: 'tenant-1', campaignId: 'campaign-1', platform: 'META',
    periodStart: '2026-10-01', periodEnd: '2026-10-07', resultType: 'MESSAGE',
    spend: 700, messages: 14, source: 'MANUAL'
  }), 'period-1');
  const saveCall = calls.find(call => call.name === 'save_ad_metric_period');
  assert(saveCall);
  assert.strictEqual(saveCall.args.p_tenant_id, 'tenant-1');
  assert.strictEqual(saveCall.args.p_spend, 700);
  await Service.deletePeriod(client, 'period-1');
  assert(calls.some(call => call.name === 'delete_ad_metric_period' && call.args.p_id === 'period-1'));
  console.log('[PASS] Reklam dönem servisi hazır phase72 RPC sözleşmesine bağlanır');
})().catch(error => { console.error(error); process.exitCode = 1; });
