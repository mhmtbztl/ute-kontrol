// Aşama 6 — Reklamlar Genel bakış: KPI şeridi, kampanya tablosu ve metrik seçici.
const G = require('./ads_metric_glossary');
const P = require('./chatgpt_prompt_engine');
global.ChatGptPromptEngine = P;
const UI = require('./marketing_ui');
let passed = 0, failed = 0;
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));

const MSG = 'actions:onsite_conversion.messaging_conversation_started_7d';
const octDays = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
const periods = [
  // Dosyada bağlantı tıklaması yok (c: null): TO ve TBM ölçülmez.
  { id: 'p1', campaign_id: 'c1', platform: 'META', result_type: 'MESSAGE', result_metric: MSG, period_start: '2026-10-01', period_end: '2026-10-31',
    spend: 3100, impressions: 31000, reach: null, clicks: null, messages: 62, results: 62, daily_metrics: octDays.map(d => ({ d, s: 100, i: 1000, c: null, r: 2 })) },
  { id: 'p2', campaign_id: 'c2', platform: 'META', result_type: 'OTHER', result_metric: 'profile_visit_view', period_start: '2026-10-01', period_end: '2026-10-10',
    spend: 1550, impressions: 40000, reach: 22000, clicks: null, results: 900, daily_metrics: null }
];
const base = {
  adMetricPeriods: periods, filter: { period: '2026-10' }, financeSummary: {},
  marketingCampaigns: [{ id: 'c1', name: 'Kış <b>Satış</b>', platform: 'META' }, { id: 'c2', name: 'Profil trafik', platform: 'META' }],
  leadSources: [{ id: 's1', code: 'INSTAGRAM_AD' }],
  leadAcquisitions: [{ sourceId: 's1', leadDate: '2026-10-05' }, { sourceId: 's1', leadDate: '2026-10-20' }],
  targets: { costPerMessage: 60 }, canManageAds: true
};
const cellsOf = (html, label) => {
  const row = (html.match(new RegExp(`<tr[^>]*><th scope="row">(?:<strong>)?${label}[\\s\\S]*?</tr>`)) || [''])[0];
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
};
const headersOf = html => [...(html.match(/<thead>[\s\S]*?<\/thead>/) || [''])[0].matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(m => m[1]);

try {
  // Sözlük yardımcıları
  check(G.normalizeVisible(null).join() === G.DEFAULT_VISIBLE.join() && G.normalizeVisible(['bilinmeyen']).join() === G.DEFAULT_VISIBLE.join(),
    'G1. Kayıtlı seçim yoksa ya da geçersizse varsayılan', G.normalizeVisible(['bilinmeyen']).join());
  check(G.normalizeVisible(['cpm', 'spend', 'cpm', 'm1', 'm9'], ['m1']).join() === 'cpm,spend,m1',
    'G2. Sıra korunur, tekrar ve bilinmeyen özel kimlik atılır', G.normalizeVisible(['cpm', 'spend', 'cpm', 'm1', 'm9'], ['m1']).join());
  check(G.normalizeVisible(G.METRICS.map(m => m.key)).length === G.MAX_VISIBLE, 'G3. En fazla MAX_VISIBLE sütun', String(G.normalizeVisible(G.METRICS.map(m => m.key)).length));
  check(G.missingInputs('ctr', { clicks: null, impressions: 5 }).map(m => m.metaColumn).join() === 'Bağlantı Tıklamaları' && G.missingInputs('spend', { spend: 3 }).length === 0,
    'G4. Ölçülmeyen türetilen metriğin eksik Meta sütunu', JSON.stringify(G.missingInputs('ctr', { clicks: null, impressions: 5 })));

  const model = UI.buildAdsModel(base);
  const cols = UI.adsColumns(model);
  const table = UI.renderAdsCampaignTable(model, cols);
  check(cols.map(c => c.key).join() === G.DEFAULT_VISIBLE.join() && headersOf(table).slice(3).join('|') === cols.map(c => c.label).join('|').replace(/</g, '&lt;'),
    'T1. Kayıt yoksa varsayılan 6 metrik, tablo başlıkları sözlükten', headersOf(table).join('|'));

  const chosen = UI.buildAdsModel({ ...base, visibleMetrics: ['costPerMessage', 'spend', 'messages'] });
  const chosenTable = UI.renderAdsCampaignTable(chosen, UI.adsColumns(chosen));
  check(headersOf(chosenTable).slice(3).join('|') === 'Mesaj başına ücret|Harcanan tutar|Mesajlaşma başlatma'
    && cellsOf(chosenTable, 'Kış &lt;b&gt;Satış&lt;/b&gt;').slice(2).join('|') === '₺50|₺3.100|62',
    'T2. Kayıtlı seçim sırasıyla uygulanır, rakamlar analiz motorundan', cellsOf(chosenTable, 'Kış &lt;b&gt;Satış&lt;/b&gt;').join('|'));

  const ctrHead = (table.match(/<th class="num is-unmeasured" title="([^"]*)">TO \(tıklama oranı\)<\/th>/) || [])[1] || '';
  check(/Bağlantı Tıklamaları/.test(ctrHead) && cellsOf(table, 'Profil trafik')[2 + cols.findIndex(c => c.key === 'ctr')] === '—',
    'T3. Hiçbir kampanyada ölçülmeyen TO soluk, "—" ve eksik Meta sütununu söyler', ctrHead);

  const reach = UI.buildAdsModel({ ...base, visibleMetrics: ['reach', 'results', 'costPerResult'] });
  const reachTable = UI.renderAdsCampaignTable(reach, UI.adsColumns(reach));
  const totals = cellsOf(reachTable, 'Toplam');
  check(totals.slice(2).every(cell => cell === '—') && /sonuç türleri farklı/.test(reachTable) && cellsOf(reachTable, 'Profil trafik')[3] === '900',
    'T4. Karışık sonuç türünde Toplam sonuç ve sonuç başına ücret "—", nedeni yazılı; kampanya satırında değer', totals.join('|'));

  const leads = UI.buildAdsModel({ ...base, visibleMetrics: ['leads', 'costPerLead'] });
  const leadTable = UI.renderAdsCampaignTable(leads, UI.adsColumns(leads));
  check(cellsOf(leadTable, 'Profil trafik').slice(2).join('|') === '—|—' && cellsOf(leadTable, 'Toplam').slice(2).join('|') === '2|₺2.325'
    && /Kanal düzeyi; kampanyaya atfedilmez/.test(leadTable),
    'T5. Talep metrikleri kampanya satırında "—" (atıf yok), Toplam satırında değer', cellsOf(leadTable, 'Toplam').join('|'));

  const custom = { id: 'm1', name: 'Günlük harcama', num: 'spend', op: '/', den: 'days', percent: false };
  const withCustom = UI.buildAdsModel({ ...base, customMetrics: [custom], visibleMetrics: ['spend', 'm1'] });
  const customTable = UI.renderAdsCampaignTable(withCustom, UI.adsColumns(withCustom));
  check(cellsOf(customTable, 'Profil trafik').slice(2).join('|') === '₺1.550|₺155' && cellsOf(customTable, 'Toplam').slice(2).join('|') === '₺4.650|₺150',
    'T6. Özel metrik kampanya toplamından ve kayıtlı gün sayısından hesaplanır', cellsOf(customTable, 'Profil trafik').join('|') + ' / ' + cellsOf(customTable, 'Toplam').join('|'));
  const prompt = UI.buildAdsChatGptContext(withCustom);
  check(prompt.campaignColumns.some(c => c.label === 'Günlük harcama') && prompt.glossary.some(g => g.formula === 'Harcama ÷ Gün') && prompt.campaignColumns.length <= 12,
    'T6b. Seçili özel metrik ChatGPT istemine ad ve formülüyle girer, 12 sütun sınırı korunur', JSON.stringify(prompt.campaignColumns.map(c => c.label)));

  check(/data-ads-metrics-toggle/.test(UI.renderAds(model, 'overview')) && !/data-ads-metrics-toggle/.test(UI.renderAds({ ...model, canManage: false }, 'overview')),
    'T7. Sütun seçici düğmesi yalnız yönetebilen kullanıcıda', 'rol kapısı yok');

  const picker = UI.renderAdsMetricPicker(withCustom);
  const groups = (picker.match(/<legend>([^<]*)<\/legend>/g) || []).length;
  check(groups === G.GROUPS.length && /value="m1" checked/.test(picker) && /value="spend" checked/.test(picker) && !/value="ctr" checked/.test(picker)
    && /ads-metric-option is-unmeasured"><input type="checkbox" name="metric" value="ctr"/.test(picker) && /data-ads-custom-metric-form/.test(picker),
    'T7b. Seçici gruplu; seçili kutular işaretli, ölçülmeyen soluk, özel metrik formu Özel grubunda', picker.slice(0, 200));

  const empty = UI.buildAdsModel({ ...base, adMetricPeriods: [], leadAcquisitions: [] });
  const emptyHtml = UI.renderAds(empty, 'overview');
  check(!/ads-table/.test(emptyHtml) && !/ads-kpi-tile/.test(emptyHtml) && /Henüz reklam dönemi yok/.test(emptyHtml) && !/₺\d/.test(emptyHtml.replace(/Toplam reklam harcaması[^<]*/, '')),
    'T8. Boş hesapta tablo/şerit yok, boş durum yazılır, uydurma rakam yok', emptyHtml.slice(0, 200));

  check(/Kış &lt;b&gt;Satış&lt;\/b&gt;/.test(table) && !/Kış <b>Satış<\/b>/.test(table), 'T9. Kampanya adı kaçışlanır', 'kaçışsız ad');

  const strip = UI.renderAdsKpiStrip(model, cols);
  check((strip.match(/ads-kpi-tile/g) || []).length === cols.length && /ads-kpi-tile is-unmeasured"[^>]*><div class="ads-kpi-label">TO/.test(strip) && /₺4\.650/.test(strip),
    'T10. KPI şeridi seçili metrik başına bir kutu; ölçülmeyen soluk', strip.slice(0, 200));
} catch (error) { failed++; console.error(error.stack); }
console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed) process.exit(1);
