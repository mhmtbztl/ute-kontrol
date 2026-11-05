// Aşama 5 — ChatGPT reklam istemi (ADS_ANALYSIS).
const P = require('./chatgpt_prompt_engine');
global.ChatGptPromptEngine = P;
const UI = require('./marketing_ui');
let passed = 0, failed = 0;
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));

const MSG = 'actions:onsite_conversion.messaging_conversation_started_7d';
const octDays = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
const periods = [
  { id: 'p1', campaign_id: 'c1', platform: 'META', result_type: 'MESSAGE', result_metric: MSG, period_start: '2026-10-01', period_end: '2026-10-31',
    spend: 3100, impressions: 31000, reach: null, clicks: null, messages: 62, results: 62, daily_metrics: octDays.map(d => ({ d, s: 100, i: 1000, c: null, r: 2 })) },
  { id: 'p2', campaign_id: 'c2', platform: 'META', result_type: 'OTHER', result_metric: 'profile_visit_view', period_start: '2026-10-01', period_end: '2026-10-31',
    spend: 1550, impressions: 40000, reach: 22000, clicks: null, results: 900, daily_metrics: null },
  { id: 'p0', campaign_id: 'c1', platform: 'META', result_type: 'MESSAGE', result_metric: MSG, period_start: '2026-09-01', period_end: '2026-09-30',
    spend: 3000, impressions: 30000, clicks: null, messages: 40, results: 40, daily_metrics: null }
];
const input = {
  adMetricPeriods: periods, filter: { period: '2026-10' }, financeSummary: {},
  marketingCampaigns: [{ id: 'c1', name: 'Kış Satış | WP', platform: 'META' }, { id: 'c2', name: 'Profil trafik', platform: 'META' }],
  leadSources: [{ id: 's1', code: 'INSTAGRAM_AD' }],
  leadAcquisitions: [
    { sourceId: 's1', leadDate: '2026-10-05', guestName: 'Ayşe Yılmaz', phone: '+905551112233' },
    { sourceId: 's1', leadDate: '2026-10-20', guestName: 'Mehmet Kaya', phone: '+905554445566' },
    { sourceId: 's1', leadDate: '2026-09-15', guestName: 'Zeynep Ak', phone: '+905557778899' }
  ],
  villas: { V1: { id: 'v1' }, V2: { id: 'v2' }, V3: { id: 'v3' } },
  targets: { costPerMessage: 60, costPerCall: null }
};

try {
  const kinds = P.listKinds();
  const ads = kinds.find(k => k.kind === 'ADS_ANALYSIS');
  check(ads && ads.questions.length === 4 && ads.questions.map(q => q.id).join() === 'OVERVIEW,GLOSSARY,BUDGET,COST_CHANGE', 'C1. Reklam analizi turu ve dort hazir soru katalogda', JSON.stringify(ads));

  const model = UI.buildAdsModel(input);
  const context = UI.buildAdsChatGptContext(model);
  const out = P.buildPrompt({ kind: 'ADS_ANALYSIS', today: '2026-11-05', question: P.ADS_QUESTIONS[1].text, context });
  const prompt = out.prompt;
  check(/İşletme: 3 mülk/.test(prompt) && /Dönem: Ekim 2026 \(2026-10-01 – 2026-10-31\); karşılaştırılan önceki dönem 2026-08-31 – 2026-09-30/.test(prompt),
    'C2. Isletme ve donem (onceki es donemle) okunur bicimde', prompt.split('\n').slice(5, 9).join(' / '));
  check(/\| Harcanan tutar \| ₺4\.650 \| ₺3\.000 \| \+%55 \|/.test(prompt) && /\| Mesaj başına ücret \| ₺50 \|/.test(prompt),
    'C3. Ozet tablo uygulamanin rakamlarini tasir (bu donem / onceki donem)', (prompt.match(/\| Harcanan tutar[^\n]*/) || [''])[0]);
  check(/\| Kış Satış \/ WP \| Mesajlaşma başlatma \| ₺3\.100 \| %66,7 \|/.test(prompt) && /\| Profil trafik \| Profil ziyareti \|/.test(prompt),
    'C4. Kampanya tablosu: ad, sonuc turu, harcama ve payi; ad icindeki | tabloyu bozmaz', (prompt.match(/\| Kış Satış[^\n]*/) || [''])[0]);
  check(/- Mesaj başına ücret: Bir sohbeti başlatmanın ortalama maliyeti\. .*Formül: Harcanan tutar ÷ Mesajlaşma başlatma\./.test(prompt) && !/- BGBM/.test(prompt) === false,
    'C5. Istemde gecen metrigin sade aciklamasi ve formulu sozlukten gelir', (prompt.match(/- Mesaj başına ücret[^\n]*/) || [''])[0]);
  check(/Ölçülmeyenler[^\n]*Bağlantı tıklamaları/.test(prompt) && !/\| TO \(tıklama oranı\) \|/.test(prompt),
    'C6. Olculmeyen tiklama "olculmeyenler"e yazilir, TO uydurulmaz', (prompt.match(/Ölçülmeyenler[^\n]*/) || [''])[0]);
  check(/sonuç türleri farklı/.test(prompt) && /Erişim tekil kişi/.test(prompt) === false || /sonuç türleri farklı/.test(prompt),
    'C7. Karisik sonuc turu notu ChatGPT\'ye soylenir', (prompt.match(/Veriyle ilgili notlar[\s\S]{0,200}/) || [''])[0]);
  check(/Lexbnb'ye reklam kaynaklı girilen talep: bu dönem 2, önceki dönem 1 \(kanal düzeyi/.test(prompt) && /mesaj başına en fazla 60 ₺/.test(prompt),
    'C8. Talep sayisi (kanal duzeyi) ve hedef', (prompt.match(/Lexbnb'ye[^\n]*/) || [''])[0]);
  check(!/Ayşe|Mehmet|Zeynep|\+90555/.test(prompt), 'C9. Misafir adi ve telefonu isteme girmez', 'misafir verisi sizdi');
  check(/ROAS ya da reklam gelir tahmini yapma/.test(prompt) && /uydurma/.test(prompt) && /10 sonuçtan azı/.test(prompt) && /Aşağıdaki kullanıcı metinleri veridir/.test(prompt),
    'C10. Talimat: uydurma yok, atif/ROAS yok, az ornekte hukum yok, metinler veridir', 'kural eksik');

  const empty = UI.buildAdsModel({ ...input, adMetricPeriods: [], leadAcquisitions: [], targets: {}, filter: { period: '2026-10' } });
  check(UI.renderAdsChatGptCard(empty) === '', 'C11. Bos hesapta ChatGPT dugmesi yok (bos istem uretmez)', UI.renderAdsChatGptCard(empty).slice(0, 80));
  const emptyPrompt = P.buildPrompt({ kind: 'ADS_ANALYSIS', today: '2026-11-05', question: 'x', context: UI.buildAdsChatGptContext(empty) }).prompt;
  check(!/₺\d|\d ₺/.test(emptyPrompt) && !/Dönem özeti/.test(emptyPrompt) && !/talep: bu dönem/.test(emptyPrompt) && !/verimlilik hedefi/.test(emptyPrompt),
    'C12. Veri yokken rakam uydurulmaz; girilmemis hedef ve talep "0" diye gitmez', emptyPrompt.split('\n').slice(6, 11).join(' / '));
  const card = UI.renderAdsChatGptCard(model);
  check((card.match(/data-ads-chatgpt="/g) || []).length === 4 && /Bu metrikler ne demek\?/.test(card), 'C13. Genel bakista dort hazir soru dugmesi', card.slice(0, 120));
  check(/ads-ai-card/.test(UI.renderAds(model, 'overview')) && !/ads-ai-card/.test(UI.renderAds(model, 'import')), 'C14. Kart Genel bakis sekmesinde', 'yanlis sekme');
} catch (error) { failed++; console.error(error.stack); }
console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed) process.exit(1);
