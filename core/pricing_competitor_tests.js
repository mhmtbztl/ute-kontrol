'use strict';
// Rakip adi (phase115), rakip bazinda gecmis ve rakip ortalamasi (kullanici 08.11.2026).
// Ortalama yalniz gosterimdir; oneri motoruna girmez.
const fs = require('fs');
const path = require('path');
const S = require('./pricing_research_service.js');

let passed = 0, failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}

const P = 'p-1';
const row = (id, name, date, wd, we) => ({ id, property_id: P, researched_on: date, created_at: `${date}T10:00:00Z`, competitor_name: name, source_kind: 'OTA', source_url: 'https://x.test/' + id,
  prices: [...(wd ? [{ type: 'WEEKDAY', amount: wd }] : []), ...(we ? [{ type: 'WEEKEND', amount: we }] : [])] });

async function main() {
  // Ortalama: en fazla 5 farkli rakip, her rakibin son kaydi, 90 gun.
  const rows = [
    row('a1', 'Villa Mavi', '2026-09-01', 9000), row('a2', ' villa   MAVİ ', '2026-11-01', 10000),
    row('b', 'Ev B', '2026-10-30', 11000), row('c', 'Ev C', '2026-10-29', 12000), row('d', 'Ev D', '2026-10-28', 8000),
    row('e', 'Ev E', '2026-10-27', 9000), row('f', 'Ev F', '2026-10-01', 40000), row('old', 'Eski', '2026-07-01', 50000),
    row('anon', null, '2026-11-05', 70000), row('other', 'Ev B', '2026-11-02', 1), { ...row('x', 'Baska Mulk', '2026-11-01', 1), property_id: 'p-2' }
  ];
  rows[9].property_id = 'p-3';
  const avg = S.competitorAverage(rows, P, 'WEEKDAY', '2026-11-08');
  check(avg && avg.count === 5 && avg.amount === 10000 && !avg.names.includes('Ev F') && !avg.names.includes('Eski') && avg.oldest === '2026-10-27',
    'C1 En yeni 5 farkli rakibin son fiyati; ayni rakip (harf/bosluk farki) bir kez; 90 gun disi ve adsiz kayit girmez', JSON.stringify(avg));
  check(S.competitorAverage(rows, P, 'WEEKEND', '2026-11-08') === null && S.competitorAverage([], P, 'WEEKDAY', '2026-11-08') === null,
    'C2 Gun turu icin fiyat yoksa ortalama null (uydurulmaz)');
  check(S.competitorAverage(rows, P, 'WEEKDAY', '2026-11-08', { maxRivals: 2 }).count === 2 && S.competitorAverage(rows, P, 'WEEKDAY', '2026-09-02').names.join() === 'Villa Mavi,Eski',
    'C3 Sinirlar parametrelidir; gelecek tarihli kayit bugune sayilmaz');

  // Gecmis: rakip basina son fiyat ve onceki kayda gore degisim.
  const h = S.competitorHistory(rows, P);
  const mavi = h.groups.find(g => g.key === 'villa mavi');
  check(mavi && mavi.count === 2 && mavi.latest.WEEKDAY === 10000 && mavi.change.WEEKDAY.diff === 1000 && mavi.change.WEEKDAY.pct === 11.1 && h.unnamed === 1 && h.groups[0].last >= h.groups[h.groups.length - 1].last,
    'C4 Rakip bazinda gecmis: son fiyat, onceki kayda gore degisim; adsiz kayit yalniz sayilir', JSON.stringify(mavi));
  check(S.normalizeCompetitorName('  Ev   B ') === 'Ev B' && S.normalizeCompetitorName('   ') === null && S.competitorKey('İSTANBUL Evi') === S.competitorKey('istanbul evi'),
    'C5 Ad bosluklari sadelesir; bos ad null; Turkce buyuk/kucuk harf ayni rakip');

  // saveResearch: competitor_name yalniz cagiran gonderirse (phase115 sonrasi) payload'a girer.
  const payloads = [];
  const client = { from: () => ({ insert: p => { payloads.push(p); return { select: () => ({ single: async () => ({ data: p, error: null }) }) }; } }) };
  const base = { tenantId: 't', propertyId: P, researchedOn: '2026-11-08', sourceKind: 'OTA', sourceUrl: 'https://x.test', values: { WEEKDAY: 100 } };
  await S.saveResearch(client, base);
  await S.saveResearch(client, { ...base, competitorName: '  Villa  Mavi ' });
  await S.saveResearch(client, { ...base, competitorName: '' });
  let uzun = null;
  try { await S.saveResearch(client, { ...base, competitorName: 'x'.repeat(121) }); } catch (e) { uzun = e.message; }
  check(!Object.prototype.hasOwnProperty.call(payloads[0], 'competitor_name') && payloads[1].competitor_name === 'Villa Mavi' && payloads[2].competitor_name === null && uzun === 'COMPETITOR_NAME_TOO_LONG',
    'C6 Goc oncesi sutun gonderilmez (dagitim sirasi tuzagi); ad sadelesir, bos ad null, 120 karakter siniri', JSON.stringify(payloads));

  // Goc: tek sutun, kisit, dogrulama, defter; motor rakip ortalamasini okumaz.
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase115_competitor_name.sql'), 'utf8');
  check(/ADD COLUMN IF NOT EXISTS competitor_name TEXT NULL/.test(sql) && /BETWEEN 1 AND 120/.test(sql) && /PHASE115_COMPETITOR_NAME_COLUMN_MISSING/.test(sql)
    && /INSERT INTO public\.schema_migrations\(version, name\)\s*VALUES \(115, 'phase115_competitor_name'\)/.test(sql) && /REVOKE ALL ON public\.competitor_price_research FROM anon/.test(sql),
    'C7 phase115: tek bos birakilabilir sutun, 1-120 kisiti, dogrulama blogu, anon kapali, defter kaydi');
  const motor = fs.readFileSync(path.join(__dirname, 'suggested_price_engine.js'), 'utf8');
  check(!/competitor|rakip/i.test(motor), 'C8 Oneri motoru rakip verisini okumaz (yalniz gosterim, kullanici karari)');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const kaydet = app.slice(app.indexOf('async function saveCompetitorResearch('), app.indexOf('function askPricingChatGpt('));
  check(/appData\.phase115SchemaReady !== false && \(name \|\| appData\.phase115SchemaReady === true\)/.test(kaydet)
    && /saved = await svc\.saveResearch\(supabaseClient, input\)/.test(kaydet) && /rakip adı kaydedilemedi: phase115/.test(kaydet),
    'C9 Sutunun olmadigi biliniyorsa ad gonderilmez; bilinmiyorsa denenir, sutun yoksa kayit adsiz tekrarlanir ve kullaniciya soylenir');
  check(!/competitor_name['"]\)\.(eq|limit)|select\('competitor_name'\)/.test(app),
    'C10 phase115 icin ayri yoklama istegi yok (goc oncesi her acilista konsola 400 dusurdu)');
}

main().catch(error => { failed++; console.error(`[FAIL] beklenmeyen hata — ${error.stack || error}`); })
  .finally(() => {
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed) process.exit(1);
  });
