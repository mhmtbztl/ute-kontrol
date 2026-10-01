const assert = require('assert');
const Service = require('./pricing_research_service');

function query(result, calls) {
  return {
    upsert(payload, options) { calls.push(['upsert', payload, options]); return this; },
    insert(payload) { calls.push(['insert', payload]); return this; },
    select() { return this; },
    single() { return Promise.resolve(result); }
  };
}

(async () => {
  const merged = Service.mergeRules({ weekend: { enabled: true, pct: 25, nights: [5, 6] }, demand: { enabled: true, pct: 10 } }, [
    { property_id: 'p1', rule_key: 'weekend', enabled: true, pct: 30, parameters: {} },
    { property_id: 'p2', rule_key: 'demand', enabled: false, pct: 5, parameters: {} }
  ], 'p1');
  assert.deepStrictEqual(merged.weekend.nights, [5, 6]);
  assert.strictEqual(merged.weekend.pct, 30);
  assert.strictEqual(merged.weekend.isPropertyOverride, true);
  assert.strictEqual(merged.demand.pct, 10);

  const calls = [];
  const client = { from(table) { calls.push(['from', table]); return query({ data: { id: 'x' }, error: null }, calls); } };
  await Service.saveRule(client, { tenantId: 't1', propertyId: 'p1', ruleKey: 'gapNight', enabled: true, pct: -12, parameters: { maxGap: 2 } });
  assert(calls.some(call => call[0] === 'upsert' && call[2].onConflict === 'property_id,rule_key'));
  await Service.saveResearch(client, { tenantId: 't1', propertyId: 'p1', researchedOn: '2026-10-02', sourceKind: 'OTA', sourceUrl: 'https://example.com/a', values: { WEEKDAY: 9000, WEEKEND: '' }, rawNote: 'Kullanici onayli' });
  assert(calls.some(call => call[0] === 'insert' && call[1].prices[0].amount === 9000));
  assert.throws(() => Service.buildPricePoints({ WEEKDAY: 0 }), /INVALID/);
  console.log('[PASS] Ev kurali birlestirme ve kaynakli rakip arastirmasi sozlesmesi');
})().catch(error => { console.error(error); process.exit(1); });
