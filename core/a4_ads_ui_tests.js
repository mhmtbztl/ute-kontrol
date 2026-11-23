const assert = require('assert');
const UI = require('./marketing_ui');
const App = require('../app.js');

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
// Aşama 3: formlar iç sekmelerde; her sekme ayrı çizilir.
const html = ['overview', 'import', 'campaigns', 'records'].map(view => UI.renderAds(model, view)).join('');
assert(html.includes('hangi reklamın rezervasyon getirdiği ölçülemez'));
assert(html.includes('data-ads-quick-form')); // elle giris kampanya acmadan ayni onizlemeden gecer
assert(html.includes('data-ads-import-form'));
assert(html.includes('data-ads-campaign-form'));
assert(html.includes('data-ads-target-form'));
assert(html.includes('data-ads-delete-campaign'));
assert(html.includes('data-ads-delete-period'));
assert(html.includes('LEXBNB_REKLAM_V2'));
assert(html.includes('Kış kampanyası'));

const pasted = require('./ads_import_parser').parsePasted(
  'LEXBNB_REKLAM_V2\nplatform;kampanya;baslangic;bitis;sonuc_turu;harcama;gosterim;tiklama;mesaj;arama\nMETA;Kış kampanyası;2026-10-01;2026-10-07;MESAJ;700;10000;200;14;'
);
const kampanyalar = [{ id: 'c1', name: 'Kış kampanyası', platform: 'META' }];
const importState = { mode: 'CHATGPT', fileName: 'ChatGPT çıktısı', rows: pasted.rows, parseErrors: [], parseWarnings: [], existing: [], mapping: {}, status: 'READY' };
const preview = UI.adsImportPlan(importState, kampanyalar, []);
assert.strictEqual(preview.errors.length, 0);
assert.strictEqual(preview.rows[0].campaignId, 'c1');
const disabledConfirm = /type="submit" class="btn btn-primary btn-sm" disabled/;
const importHtml = UI.renderAdsImportView(importState, kampanyalar, []);
assert(importHtml.includes('data-ads-import-confirm') && !disabledConfirm.test(importHtml), 'hazır plan onaylanabilir');
const emptyImport = UI.renderAdsImportView(null, [], []);
assert(emptyImport.includes('data-ads-dropzone') && emptyImport.includes('Döküm → Zaman → Gün'), 'boş ekran: bırakma alanı + Meta tarifi');
const blocked = UI.renderAdsImportView(importState, kampanyalar, ['2026-10']);
assert(/kapatılmış/.test(blocked) && disabledConfirm.test(blocked), 'kapalı ay: onay kapalı ve nedeni yazılı');
const loading = UI.renderAdsImportView({ ...importState, status: 'LOADING' }, [], []);
assert(disabledConfirm.test(loading), 'kayıtlı veri kontrol edilirken onay kapalı');
assert(/Bu adla yeni kampanya açılacak/.test(loading) && /value="__new__" selected>\+ Yeni kampanya: Kış kampanyası</.test(loading), 'eşleşmeyen ad: varsayılan yeni kampanya, dosyadaki adla');
const saveFailed = UI.renderAdsImportView({ ...importState, saveError: 'Bağlantı koptu' }, kampanyalar, []);
assert(/Kaydedilemedi/.test(saveFailed) && !disabledConfirm.test(saveFailed), 'kayıt hatası gösterilir, yeniden deneme açık kalır');
const viewerHtml = UI.renderAds({ ...model, canManage: false }, 'import');
assert(!/data-ads-view="import"/.test(viewerHtml) && !/data-ads-dropzone/.test(viewerHtml), 'yönetemeyen kullanıcıya içe aktarma sekmesi yok');

const october = UI.buildAdsModel({
  filter: { period: '2026-10' },
  adMetricPeriods: [
    { campaign_id: 'c1', platform: 'META', result_type: 'MESSAGE', period_start: '2026-09-01', period_end: '2026-09-30', spend: 900, messages: 9 },
    { campaign_id: 'c1', platform: 'META', result_type: 'MESSAGE', period_start: '2026-09-30', period_end: '2026-10-01', spend: 200, messages: 20 }
  ],
  marketingCampaigns: [{ id: 'c1', name: 'Dönem testi', platform: 'META' }],
  leadSources: [{ id: 's1', code: 'INSTAGRAM_AD' }],
  leadAcquisitions: [
    { lead_id: 'old', source_id: 's1', lead_date: '2026-09-15' },
    { lead_id: 'current', source_id: 's1', lead_date: '2026-10-01' }
  ],
  financeSummary: { netRoomRevenue: 10000 },
  targets: { costPerMessage: 20 }
});
assert.strictEqual(october.totalSpend, 100);
assert.strictEqual(october.priorSpend, 1000);
assert.strictEqual(october.spendTrendPct, -90);
assert.strictEqual(october.metrics[0].messages, 10);
assert.strictEqual(october.channelLeadCost.find(row => row.platform === 'META').leads, 1);
assert.strictEqual(october.adShare.pct, 1);
assert.strictEqual(App.isAdsPeriodExpense({ legacyId: 'ADS_PERIOD:abc:2026-10' }), true);
assert.strictEqual(App.isAdsPeriodExpense({ legacyId: 'IMPORT:abc' }), false);
// Aşama 6: harcama ve önceki eş dönem farkı KPI şeridinde, analiz motorundan.
const octoberHtml = UI.renderAds(october);
assert(octoberHtml.includes('<span class="ba-delta ba-delta-flat"><span class="ba-delta-val"><span aria-hidden="true" class="ba-delta-arrow">▼</span><span class="ba-sr-only">azaldı </span>%90</span><span class="ba-delta-ctx">önceki eş döneme göre</span>'),
  'KPI şeridi önceki döneme göre değişimi Analiz biçiminde gösterir (harcamada yön nötr)');
console.log('[PASS] Reklamlar görünümü ölçülebilir metrikleri atıf iddiası olmadan sunar');

// Fox (22.11.2026): ana sayfa ozet seridi renkli; farkli sonuc turleri toplanmaz (mesaj ve arama
// ayri kart); olculmeyen talep karti gosterilmez; iki kampanyadan azsa grafik yok.
const karisik = UI.buildAdsModel({
  filter: { period: '2026-10' },
  adMetricPeriods: [
    { campaign_id: 'c1', platform: 'META', result_type: 'MESSAGE', period_start: '2026-10-01', period_end: '2026-10-20', spend: 8400, messages: 70 },
    { campaign_id: 'c2', platform: 'GOOGLE', result_type: 'CALL', period_start: '2026-10-01', period_end: '2026-10-20', spend: 3840, calls: 30 }
  ],
  marketingCampaigns: [{ id: 'c1', name: 'Villa Instagram', platform: 'META' }, { id: 'c2', name: 'Google arama', platform: 'GOOGLE' }],
  leadSources: [], leadAcquisitions: [], financeSummary: { netRoomRevenue: 100000 }, targets: { costPerMessage: 120 }
});
const evHtml = UI.renderMarketingHome(karisik);
assert(/fox-card--expense[^"]*mk-fox"><p class="mk-fox__label">Harcama/.test(evHtml) && />Mesaj<\/p>/.test(evHtml) && />Arama<\/p>/.test(evHtml),
  'Fox şeridi: harcama kırmızı, karışık sonuçta mesaj ve arama ayrı kart');
assert(!/>Sonuç<\/p>/.test(evHtml) && !/Talep \(Lexbnb\)/.test(evHtml), 'Karışıkta toplanmış "Sonuç" ve ölçülmeyen talep kartı yok');
assert(/Kampanyaya göre harcama/.test(evHtml) && (evHtml.match(/class="mk-bar"/g) || []).length === 2, 'Kampanya harcama grafiği iki kampanyayı çizer');
assert(!/mk-fox-grid/.test(UI.renderMarketingHome(UI.buildAdsModel({ filter: { period: '2026-10' }, adMetricPeriods: [] }))), 'Reklam kaydı yoksa Fox şeridi yok');
console.log('[PASS] Pazarlama ana sayfası Fox renkli özet ve harcama grafiği gösterir (uydurma yok)');
