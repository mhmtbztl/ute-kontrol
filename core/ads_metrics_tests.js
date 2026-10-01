const M = require('./ads_metrics_engine');
const P = require('./ads_import_parser');
let passed = 0, failed = 0;
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
try {
  const rows = [
    { campaignId: 'm', platform: 'META', resultType: 'MESSAGE', spend: 1000, impressions: 10000, clicks: 200, messages: 20, calls: null },
    { campaignId: 'o', platform: 'META', resultType: 'OTHER', spend: 500, impressions: 5000, clicks: 100, messages: null, calls: null }
  ];
  const metrics = M.campaignMetrics(rows, { targets: { costPerMessage: 60, costPerCall: 100 }, minResults: 10 });
  check(metrics[0].status === 'VERIMLI' && metrics[0].costPerMessage === 50, 'A1. Mesaj kampanyasi hedefle olculur', JSON.stringify(metrics[0]));
  check(metrics[1].status === null && metrics[1].statusReason.code === 'OTHER_RESULT', 'A2. OTHER mesaj/arama diye okunmaz', JSON.stringify(metrics[1]));
  check(!('revenue' in metrics[0]) && !('roas' in metrics[0]) && !('bookings' in metrics[0]), 'A3. Kampanya bazinda uydurma atif yok', JSON.stringify(metrics[0]));
  const alloc = M.allocatePeriodToMonths({ periodStart: '2026-09-29', periodEnd: '2026-10-05', spend: 700 });
  check(alloc.length === 2 && alloc[0].days === 2 && alloc[0].spend === 200 && alloc[1].spend === 500, 'A4. Ay siniri gunlere esit bolunur', JSON.stringify(alloc));
  check(M.adShare({ adSpend: 500, netRoomRevenue: 0 }).pct === null, 'A5. Pay sifirsa reklam payi uydurulmaz', JSON.stringify(M.adShare({ adSpend: 500, netRoomRevenue: 0 })));
  const emptyChannels = M.channelLeadCost({});
  check(emptyChannels.every(row => row.spend === null && row.leads === null && row.costPerLead === null && row.reason), 'A6. Bos isletmede kanal rakami uydurulmaz', JSON.stringify(emptyChannels));

  const pasted = P.parsePasted('LEXBNB_REKLAM_V2\nplatform;kampanya;baslangic;bitis;sonuc_turu;harcama;gosterim;tiklama;mesaj;arama\nMETA;Kış;2026-10-05;2026-10-11;MESAJ;1.234,50;38000;912;41;');
  check(pasted.errors.length === 0 && pasted.rows[0].spend === 1234.5 && pasted.rows[0].messages === 41, 'B1. Yapistirma bicimi ortak sayi motorunu kullanir', JSON.stringify(pasted));
  const tooLong = P.parsePasted('LEXBNB_REKLAM_V2\nplatform;kampanya;baslangic;bitis;sonuc_turu;harcama;gosterim;tiklama;mesaj;arama\nMETA;Uzun;2026-01-01;2026-02-15;MESAJ;100;;;;');
  check(tooLong.errors.some(e => e.code === 'PERIOD_TOO_LONG'), 'B2. 31 gunden uzun donem reddedilir', JSON.stringify(tooLong));
  const invalidDate = P.parsePasted('LEXBNB_REKLAM_V2\nplatform;kampanya;baslangic;bitis;sonuc_turu;harcama;gosterim;tiklama;mesaj;arama\nMETA;;2026-02-31;2026-03-02;MESAJ;100;;;;');
  check(invalidDate.errors.some(e => e.code === 'INVALID_PERIOD') && invalidDate.errors.some(e => e.code === 'CAMPAIGN_REQUIRED'), 'B3. Takvimde olmayan tarih ve bos kampanya reddedilir', JSON.stringify(invalidDate));
  const meta = P.parseCsv('\uFEFF"Rapor Başlangıcı","Rapor Sonu","Kampanya Adı",Sonuçlar,"Sonuç Göstergesi",Erişim,"Harcanan Tutar (TRY)",Gösterim,"Bağlantı Tıklamaları"\n2026-10-01,2026-10-07,"Mesaj",12,actions:onsite_conversion.messaging_conversation_started_7d,1000,600.50,2000,80', 'META');
  check(meta.errors.length === 0 && meta.rows[0].resultType === 'MESSAGE' && meta.rows[0].messages === 12, 'B4. Meta gercek sutunlari ve makine gostergesi okunur', JSON.stringify(meta));
  const google = P.parseCsv('Day,Impressions,Cost\n2026-10-01,10,2', 'GOOGLE');
  check(google.errors.some(e => e.code === 'GOOGLE_SAMPLE_REQUIRED'), 'B5. Google ornegi gelmeden sessiz tahmin yok', JSON.stringify(google));
} catch (error) { failed++; console.error(error.stack); }
console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed) process.exit(1);
