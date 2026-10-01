const assert = require('assert');
const UI = require('./marketing_ui');

const model = UI.buildAdsModel({
  adMetricPeriods: [{ campaign_id: 'c1', platform: 'META', result_type: 'MESSAGE', spend: 700, impressions: 10000, clicks: 200, messages: 14, calls: null }],
  marketingCampaigns: [{ id: 'c1', name: 'Kış kampanyası', platform: 'META' }],
  leadSources: [{ id: 's1', code: 'INSTAGRAM_AD' }],
  leadAcquisitions: [{ lead_id: 'l1', source_id: 's1' }],
  financeSummary: { netRoomRevenue: 70000 },
  targets: { costPerMessage: 60, costPerCall: null }
});

assert.strictEqual(model.metrics[0].status, 'VERIMLI');
assert.strictEqual(model.metrics[0].campaignName, 'Kış kampanyası');
assert.strictEqual(model.channelLeadCost.find(row => row.platform === 'META').leads, 1);
assert.strictEqual(model.adShare.pct, 1);
const html = UI.renderAds(model);
assert(html.includes('hangi reklamın rezervasyon getirdiği ölçülemez'));
assert(html.includes('data-ads-manual-form'));
assert(html.includes('data-ads-import-form'));
assert(html.includes('LEXBNB_REKLAM_V2'));
assert(html.includes('Kış kampanyası'));

const preview = UI.buildAdsImportPreview(
  'LEXBNB_REKLAM_V2\nplatform;kampanya;baslangic;bitis;sonuc_turu;harcama;gosterim;tiklama;mesaj;arama\nMETA;Kış kampanyası;2026-10-01;2026-10-07;MESAJ;700;10000;200;14;',
  'CHATGPT',
  [{ id: 'c1', name: 'Kış kampanyası', platform: 'META' }]
);
assert.strictEqual(preview.errors.length, 0);
assert.strictEqual(preview.rows[0].campaignId, 'c1');
assert(UI.renderAdsImportPreview(preview).includes('data-ads-import-confirm'));
console.log('[PASS] Reklamlar görünümü ölçülebilir metrikleri atıf iddiası olmadan sunar');
