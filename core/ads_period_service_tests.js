const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Service = require('./ads_period_service');

function query(rows, log = []) {
  const q = {
    select(columns) { log.push(['select', columns]); return q; }, eq(...a) { log.push(['eq', ...a]); return q; },
    gte(...a) { log.push(['gte', ...a]); return q; }, lte(...a) { log.push(['lte', ...a]); return q; },
    in(...a) { log.push(['in', ...a]); return q; },
    order() { return Promise.resolve({ data: rows, error: null }); }
  };
  return q;
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
  await Service.savePeriodsAtomic(client, 'tenant-1', [{
    campaignId: 'campaign-1', platform: 'META', periodStart: '2026-10-01',
    periodEnd: '2026-10-07', resultType: 'MESSAGE', spend: 700, messages: 14, source: 'CSV'
  }]);
  const batchCall = calls.find(call => call.name === 'save_ad_metric_period_batch');
  assert(batchCall);
  assert.strictEqual(batchCall.args.p_tenant_id, 'tenant-1');
  assert.strictEqual(batchCall.args.p_rows[0].campaign_id, 'campaign-1');
  console.log('[PASS] Reklam dönem servisi hazır phase72 RPC sözleşmesine bağlanır');

  await Service.importBatch(client, 'tenant-1', [{ key: 'k1', name: 'Kış Satış', platform: 'META', budget: 180 }], [
    { campaignKey: 'k1', platform: 'META', periodStart: '2026-10-01', periodEnd: '2026-10-31', resultType: 'OTHER',
      resultMetric: 'profile_visit_view', spend: 2790, impressions: 65500, reach: 51000, clicks: null, results: 2050, extraMetrics: {} },
    { campaignId: 'campaign-1', platform: 'META', periodStart: '2026-10-01', periodEnd: '2026-10-31', resultType: 'MESSAGE',
      spend: 5090, messages: 640, results: 640, extraMetrics: { ThruPlay: 12 }, daily: [{ d: '2026-10-01', s: 5090, i: null, c: null, r: 640 }] }
  ]);
  const importCall = calls.find(call => call.name === 'import_ad_metric_batch');
  assert(importCall);
  assert.deepStrictEqual(importCall.args.p_new_campaigns, [{ key: 'k1', name: 'Kış Satış', platform: 'META', budget: 180 }]);
  assert.strictEqual(importCall.args.p_rows[0].campaign_key, 'k1');
  assert.strictEqual(importCall.args.p_rows[0].campaign_id, null);
  assert.strictEqual(importCall.args.p_rows[0].results, 2050);
  assert.strictEqual(importCall.args.p_rows[0].clicks, null, 'ölçülmeyen tıklama 0 gönderilmez');
  assert.strictEqual(importCall.args.p_rows[0].extra_metrics, null, 'boş ek metrik nesnesi gönderilmez');
  assert.deepStrictEqual(importCall.args.p_rows[1].extra_metrics, { ThruPlay: 12 });
  assert.strictEqual(importCall.args.p_rows[0].daily, null, 'günlük kırılımı olmayan satır boş dizi göndermez');
  assert.deepStrictEqual(importCall.args.p_rows[1].daily, [{ d: '2026-10-01', s: 5090, i: null, c: null, r: 640 }], 'phase113 günlük kırılım aynen gider');
  console.log('[PASS] importBatch phase111 sözleşmesine bağlanır (yeni kampanya anahtarı, sonuç, ek metrik, günlük kırılım)');

  // Backend maliyeti (kullanıcı, 05.11.2026): yalnız gereken sütun ve tarih aralığı.
  const log = [];
  await Service.loadPeriods({ from() { return query([], log); } }, 'tenant-1', { from: '2026-09-01', to: '2026-10-31', campaignIds: ['c1'] });
  const selected = (log.find(item => item[0] === 'select') || [])[1];
  assert(selected && selected !== '*' && /daily_metrics/.test(selected) && !/created_by|created_at|updated_at/.test(selected), 'yıldız değil, ekranın sütunları');
  assert(log.some(item => item[0] === 'gte' && item[1] === 'period_end' && item[2] === '2026-09-01'), 'aralığa değen dönem: period_end >= başlangıç');
  assert(log.some(item => item[0] === 'lte' && item[1] === 'period_start' && item[2] === '2026-10-31'), 'aralığa değen dönem: period_start <= bitiş');
  assert(log.some(item => item[0] === 'in' && item[1] === 'campaign_id'), 'kampanya süzgeci');
  const UI = require('./marketing_ui');
  assert.deepStrictEqual(UI.adsWindow({ period: '2026-10' }), { from: '2026-08-31', to: '2026-10-31' }, 'seçili ay + buildAdsModel ile aynı önceki eş dönem (31 gün)');
  assert.deepStrictEqual(UI.adsWindow({ period: 'ALL' }), {}, 'tüm dönem: aralıksız');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert(!/from('ad_metric_periods')/.test(appSource), 'app.js her yüklemede reklam dönemi çekmez (Pazarlama açılınca, seçili dönem için)');
  const uiSource = fs.readFileSync(path.join(__dirname, 'marketing_ui.js'), 'utf8');
  assert((uiSource.match(/await reloadAdPeriods()/g) || []).length >= 4, 'dönem yazan her işleyici önbelleği düşürür');
  console.log('[PASS] Reklam dönemleri tembel ve aralıklı yüklenir; yazmadan sonra yenilenir');

  const missingRpc = { async rpc() { return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.import_ad_metric_batch' } }; } };
  await assert.rejects(() => Service.importBatch(missingRpc, 'tenant-1', [], [{ campaignId: 'c', platform: 'META', periodStart: '2026-10-01', periodEnd: '2026-10-01', resultType: 'MESSAGE' }]),
    error => error.code === 'PHASE111_NOT_APPLIED');
  console.log('[PASS] Göç uygulanmadıysa kullanıcıya nedeni söylenir (PHASE111_NOT_APPLIED)');
})().catch(error => { console.error(error); process.exitCode = 1; });
