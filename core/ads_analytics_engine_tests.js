// Aşama 4 — reklam metrik sözlüğü ve analiz motoru.
const G = require('./ads_metric_glossary');
const E = require('./ads_analytics_engine');
let passed = 0, failed = 0;
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));

const MSG = 'actions:onsite_conversion.messaging_conversation_started_7d';
const octDays = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
const dailyPeriod = (id, campaign, spendEach, extra = {}) => ({
  id, campaign_id: campaign, platform: 'META', result_type: 'MESSAGE', result_metric: MSG,
  period_start: '2026-10-01', period_end: '2026-10-31', spend: spendEach * 31, impressions: 31000, reach: 9000, clicks: 310, messages: 62, results: 62,
  daily_metrics: octDays.map(d => ({ d, s: spendEach, i: 1000, c: 10, r: 2 })), ...extra
});

try {
  // Sözlük
  const groups = new Set(G.GROUPS.map(g => g.id));
  check(G.METRICS.every(m => m.label && m.short && groups.has(m.group) && (m.base || (m.formula && typeof m.compute === 'function'))),
    'G1. Her metrigin adi, sade aciklamasi, grubu ve (turetilense) formulu var', JSON.stringify(G.METRICS.filter(m => !m.short).map(m => m.key)));
  check(G.DEFAULT_VISIBLE.every(key => G.get(key)) && new Set(G.METRICS.map(m => m.key)).size === G.METRICS.length, 'G2. Varsayilan secim sozlukte var, anahtarlar tekil');
  const verdict = /^(kritik|uçurum|şampiyon|dengeli|harika|kötü|mükemmel)/i;
  check(!G.METRICS.some(m => verdict.test(m.short)), 'G3. Aciklamalar hukum kelimesiyle baslamaz (§3.5 kural 6)');
  const d = G.derive({ spend: 1000, impressions: 50000, clicks: 500, results: 0, messages: null, reach: null });
  check(d.ctr === 1 && d.cpc === 2 && d.cpm === 20 && d.costPerResult === null && d.costPerMessage === null && d.frequency === null,
    'G4. Turetilen metrikler; sifir ya da olculmeyen payda "—" (null)', JSON.stringify(d));
  check(G.compare('costPerMessage', 80, 100).tone === 'GOOD' && G.compare('ctr', 0.8, 1).tone === 'BAD' && G.compare('spend', 120, 100).tone === 'NEUTRAL'
    && G.compare('spend', 10, 0).pct === null, 'G5. Degisimin yonu metrige gore: maliyet dususu iyi, harcama notr, onceki 0 ise yuzde yok');
  check(G.format('spend', null) === '—' && G.format('ctr', 1.5) === '%1,5' && G.format('spend', 12500) === '₺12.500', 'G6. Bicim: olculmeyen "—", Turkce sayi', [G.format('ctr', 1.5), G.format('spend', 12500)].join(' '));

  // Motor
  const oct = { start: '2026-10-01', endExclusive: '2026-11-01' };
  const daily = E.analyze({ periods: [dailyPeriod('p1', 'c1', 100)], campaigns: [{ id: 'c1', name: 'Kış' }], range: { start: '2026-10-10', endExclusive: '2026-10-20' } });
  check(daily.metrics.spend === 1000 && daily.metrics.results === 20 && daily.metrics.reach === null && !daily.notes.includes('PRORATED') && daily.series.coverage === 'DAILY' && daily.series.days.length === 10,
    'E1. Gunluk kirilimli donem secili araliga gun gun kirpilir; kirpilan donemde erisim bilinmez', JSON.stringify({ m: daily.metrics.spend, n: daily.notes, c: daily.series.coverage }));

  const monthly = { id: 'p2', campaign_id: 'c2', platform: 'META', result_type: 'OTHER', result_metric: 'profile_visit_view', period_start: '2026-10-01', period_end: '2026-10-31', spend: 3100, impressions: 62000, reach: 40000, clicks: null, results: 2050, daily_metrics: null };
  const half = E.analyze({ periods: [monthly], range: { start: '2026-10-01', endExclusive: '2026-10-16' } });
  check(half.metrics.spend === 1500 && half.notes.includes('PRORATED') && half.series.coverage === 'PERIODS' && half.metrics.results === 992 && half.series.blocks.length === 1
    && half.series.days.every(day => day.spend === null), 'E2. Gunluk kirilimsiz aylik donem oranla kirpilir (Finans ile ayni) ama grafikte gunlere yayilmaz', JSON.stringify({ s: half.metrics.spend, b: half.series.blocks }));

  const mixed = E.analyze({ periods: [dailyPeriod('p1', 'c1', 100), monthly], range: oct });
  check(mixed.metrics.results === null && mixed.notes.includes('RESULT_TYPES_MIXED') && mixed.metrics.costPerMessage === 50 && mixed.metrics.costPerResult === null,
    'E3. Farkli sonuc turleri toplanmaz; mesaj basina ucret yalniz mesaj kampanyasinin harcamasiyla', JSON.stringify({ r: mixed.metrics.results, cpm: mixed.metrics.costPerMessage }));
  check(mixed.metrics.reach === null && mixed.notes.includes('REACH_NOT_ADDITIVE'), 'E4. Iki donemin erisimi toplanmaz', JSON.stringify(mixed.metrics.reach));
  const whole = E.analyze({ periods: [dailyPeriod('p1', 'c1', 100)], range: oct });
  check(whole.metrics.reach === 9000 && whole.metrics.frequency === 3.44, 'E5. Tek ve tam donemde erisim ve siklik olculur', JSON.stringify({ r: whole.metrics.reach, f: whole.metrics.frequency }));

  check(JSON.stringify(E.priorRangeOf(oct)) === JSON.stringify({ start: '2026-08-31', endExclusive: '2026-10-01' }), 'E6. Onceki es donem buildAdsModel ile ayni (31 gun geri)', JSON.stringify(E.priorRangeOf(oct)));
  const sept = { ...dailyPeriod('p0', 'c1', 125), period_start: '2026-09-01', period_end: '2026-09-30', spend: 3750,
    daily_metrics: Array.from({ length: 30 }, (_, i) => ({ d: `2026-09-${String(i + 1).padStart(2, '0')}`, s: 125, i: 1000, c: 10, r: 2 })) };
  const trend = E.analyze({ periods: [sept, dailyPeriod('p1', 'c1', 100)], range: oct });
  check(trend.changes.costPerMessage.tone === 'GOOD' && trend.changes.costPerMessage.pct < 0 && trend.priorMetrics.spend === 3750,
    'E7. Onceki doneme gore degisim ve yonu (mesaj maliyeti dustu = iyi)', JSON.stringify(trend.changes.costPerMessage));

  const two = E.analyze({ periods: [dailyPeriod('p1', 'c1', 100), dailyPeriod('p3', 'c3', 300)], campaigns: [{ id: 'c1', name: 'Kış' }, { id: 'c3', name: 'Yaz' }], range: oct });
  check(two.campaigns[0].name === 'Yaz' && two.campaigns[0].spendShare === 75 && two.campaigns[1].spendShare === 25, 'E8. Kampanyalar harcamaya gore siralanir, harcama payi', JSON.stringify(two.campaigns.map(c => [c.name, c.spendShare])));

  const funnel = E.analyze({ periods: [dailyPeriod('p1', 'c1', 100)], range: oct, leads: { current: 31 } });
  const step = key => funnel.funnel.find(s => s.key === key);
  check(step('clicks').rateFromPrevious === 1 && step('conversations').value === 62 && step('conversations').rateFromPrevious === 20 && step('leads').rateFromPrevious === 50
    && funnel.metrics.messageToLead === 50 && funnel.metrics.costPerLead === 100, 'E9. Huni: gosterim -> tiklama -> mesaj -> talep, adim oranlari', JSON.stringify(funnel.funnel));
  const noClicks = E.analyze({ periods: [monthly], range: oct });
  check(noClicks.funnel.find(s => s.key === 'clicks').value === null && noClicks.funnel.find(s => s.key === 'conversations').rateFromPrevious === null,
    'E10. Olculmeyen adim "—"; sonraki adimin orani uydurulmaz', JSON.stringify(noClicks.funnel));

  const empty = E.analyze({ periods: [], range: oct });
  check(empty.metrics.spend === null && empty.series.coverage === 'NONE' && empty.series.days.every(day => day.spend === null) && empty.unmeasured.includes('spend'),
    'E11. Bos hesap: hicbir rakam uydurulmaz, gunler 0 degil bos', JSON.stringify(empty.metrics.spend));

  // Mevcut ekranla ayni toplam (§3.4 dersi: iki ekran ayni ay icin farkli sayi vermesin).
  const UI = require('./marketing_ui');
  const rows = [monthly, { ...monthly, id: 'p9', campaign_id: 'c9', period_start: '2026-09-20', period_end: '2026-10-10', spend: 2100, result_type: 'MESSAGE', messages: 30, results: 30 }];
  const model = UI.buildAdsModel({ adMetricPeriods: rows, marketingCampaigns: [], filter: { period: '2026-10' }, financeSummary: {} });
  const engine = E.analyze({ periods: rows, range: oct });
  check(Math.abs(model.totalSpend - engine.metrics.spend) < 0.01 && Math.abs(model.priorSpend - engine.priorMetrics.spend) < 0.01,
    'E12. Toplam ve onceki donem harcamasi mevcut Reklamlar modeliyle birebir ayni', `${model.totalSpend}/${engine.metrics.spend} ${model.priorSpend}/${engine.priorMetrics.spend}`);
} catch (error) { failed++; console.error(error.stack); }
console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed) process.exit(1);
