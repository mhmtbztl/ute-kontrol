// Meta Reklam Yöneticisi CSV'si — gerçek dışa aktarımın biçimine karşı ağ.
// Fikstür, kullanıcının 1–31 Eki 2026 "Kampanyalar" dışa aktarımının
// anonimleştirilmiş kopyasıdır: sütunlar ve sonuç göstergeleri birebir aynı,
// kampanya adları ve tutarlar değiştirildi. O dosyada "Bağlantı Tıklamaları"
// sütunu YOKTU ve eski ayrıştırıcı dosyayı tümüyle reddediyordu.
const fs = require('fs');
const path = require('path');
const P = require('./ads_import_parser');
let passed = 0, failed = 0;
const check = (ok, name, detail) => ok ? (passed++, console.log(`[PASS] ${name}`)) : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const codes = list => (list || []).map(item => item.code);

try {
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'meta_ads_kampanyalar_aylik_tr.csv'), 'utf8');
  const real = P.parseCsv(fixture, 'META');
  check(real.errors.length === 0 && real.rows.length === 6, 'M1. Gercek Meta dosyasi (tiklama sutunu yok) hatasiz okunur', JSON.stringify(real.errors));
  const kis = real.rows.find(row => row.campaignName === 'Kış Satış WP-IG') || {};
  check(kis.spend === 5090 && kis.impressions === 58100 && kis.reach === 39400 && kis.results === 640 && kis.messages === 640 && kis.periodStart === '2026-10-01' && kis.periodEnd === '2026-10-31',
    'M2. Mesaj kampanyasinin rakamlari birebir', JSON.stringify(kis));
  check(kis.clicks === null, 'M3. Dosyada olmayan tiklama 0 degil olculmedi (null)', JSON.stringify(kis.clicks));
  check(kis.dailyBudget === 180 && kis.resultLabel === 'Mesajlaşma başlatma', 'M4. Gunluk butce ve sonuc etiketi okunur', JSON.stringify(kis));
  const profil = real.rows.find(row => row.campaignName === 'Profil trafik') || {};
  check(profil.resultType === 'OTHER' && profil.results === 2050 && profil.messages === null && profil.resultLabel === 'Profil ziyareti',
    'M5. Profil ziyareti OTHER kalir, sonuc sayisi kaybolmaz, mesaj sayilmaz', JSON.stringify(profil));
  const web = real.rows.find(row => row.campaignName === 'Web site trafik') || {};
  check(web.resultLabel === 'Açılış sayfası görüntüleme' && web.dailyBudget === null, 'M6. "Reklam seti butcesi kullaniliyor" butce uydurmaz', JSON.stringify(web));
  check(codes(real.warnings).includes('CLICKS_COLUMN_MISSING'), 'M7. Eksik tiklama sutunu kullaniciya soylenir', JSON.stringify(real.warnings));

  const english = P.parseCsv('"Reporting starts","Reporting ends","Campaign name",Results,"Result indicator","Amount spent (TRY)",Impressions,Reach,"Link clicks"\n2026-10-01,2026-10-07,"Winter",12,actions:onsite_conversion.messaging_conversation_started_7d,600.50,2000,1000,80', 'META');
  check(english.errors.length === 0 && english.rows[0].spend === 600.5 && english.rows[0].clicks === 80 && english.rows[0].messages === 12, 'M8. Ingilizce arayuz basliklari okunur', JSON.stringify(english));

  const machine = P.parseCsv('"Rapor Başlangıcı","Rapor Sonu","Kampanya Adı","Harcanan Tutar (TRY)"\n2026-10-01,2026-10-07,"A",12.500', 'META');
  check(machine.rows[0] && machine.rows[0].spend === 12.5, 'M9. Meta makine bicimi: "12.500" 12,5 TL dir, 12.500 TL degil', JSON.stringify(machine.rows[0]));
  const excelTr = P.parseCsv('﻿Rapor Başlangıcı;Rapor Sonu;Kampanya Adı;Harcanan Tutar (TRY);Gösterim\n01.10.2026;07.10.2026;A;1.234,56;2000', 'META');
  check(excelTr.errors.length === 0 && excelTr.rows[0].spend === 1234.56 && excelTr.rows[0].periodStart === '2026-10-01', 'M10. Excel-TR ile yeniden kaydedilen dosya (;, 1.234,56, GG.AA.YYYY) okunur', JSON.stringify(excelTr));

  const daily = P.parseCsv('"Gün","Kampanya Adı",Sonuçlar,"Sonuç Göstergesi","Harcanan Tutar (TRY)",Gösterim\n2026-10-01,"A",3,actions:onsite_conversion.messaging_conversation_started_7d,100,900\n2026-10-02,"A",5,actions:onsite_conversion.messaging_conversation_started_7d,120,1100', 'META');
  check(daily.errors.length === 0 && daily.rows.length === 2 && daily.rows[1].periodStart === '2026-10-02' && daily.rows[1].periodEnd === '2026-10-02', 'M11. Gunluk dokum: her satir tek gunluk donem', JSON.stringify(daily));

  const adSets = P.parseCsv('"Rapor Başlangıcı","Rapor Sonu","Kampanya Adı",Sonuçlar,"Sonuç Göstergesi","Harcanan Tutar (TRY)",Gösterim,Erişim\n2026-10-01,2026-10-07,"A",3,actions:onsite_conversion.messaging_conversation_started_7d,100.10,900,500\n2026-10-01,2026-10-07,"A",5,actions:onsite_conversion.messaging_conversation_started_7d,120.20,1100,700', 'META');
  const set = adSets.rows[0] || {};
  check(adSets.rows.length === 1 && set.spend === 220.3 && set.impressions === 2000 && set.messages === 8 && set.reach === null && codes(adSets.warnings).includes('ROWS_MERGED'),
    'M12. Reklam seti satirlari toplanir; tekil erisim toplanmaz', JSON.stringify(adSets));

  const mixed = P.parseCsv('"Rapor Başlangıcı","Rapor Sonu","Kampanya Adı",Sonuçlar,"Sonuç Göstergesi","Harcanan Tutar (TRY)"\n2026-10-01,2026-10-07,"A",3,actions:onsite_conversion.messaging_conversation_started_7d,100\n2026-10-01,2026-10-07,"A",9,profile_visit_view,50', 'META');
  check(codes(mixed.errors).includes('DUPLICATE_CAMPAIGN_PERIOD'), 'M13. Ayni kampanya-donemde iki farkli gosterge toplanmaz, durur', JSON.stringify(mixed.errors));
  const overlap = P.parseCsv('"Rapor Başlangıcı","Rapor Sonu","Kampanya Adı","Harcanan Tutar (TRY)"\n2026-10-01,2026-10-31,"A",100\n2026-10-05,2026-10-05,"A",10', 'META');
  check(codes(overlap.errors).includes('PERIOD_OVERLAP_IN_FILE'), 'M14. Dosya icinde ayni gunu iki kez sayan donem reddedilir', JSON.stringify(overlap.errors));

  const usd = P.parseCsv('"Rapor Başlangıcı","Rapor Sonu","Kampanya Adı","Harcanan Tutar (USD)"\n2026-10-01,2026-10-07,"A",100', 'META');
  check(codes(usd.errors).includes('CURRENCY_NOT_TRY') && usd.rows.length === 0, 'M15. Dolar harcama TL diye deftere yazilmaz', JSON.stringify(usd));
  const noSpend = P.parseCsv('"Rapor Başlangıcı","Rapor Sonu","Kampanya Adı",Gösterim\n2026-10-01,2026-10-07,"A",100', 'META');
  check(codes(noSpend.errors).includes('INVALID_HEADER') && /Harcanan Tutar/.test(noSpend.errors[0].text), 'M16. Harcama sutunu yoksa adiyla soylenir', JSON.stringify(noSpend));
  const lifetime = P.parseCsv('"Rapor Başlangıcı","Rapor Sonu","Kampanya Adı","Harcanan Tutar (TRY)"\n2026-08-01,2026-10-31,"A",900', 'META');
  check(codes(lifetime.errors).includes('PERIOD_TOO_LONG') && /Döküm → Zaman → Gün/.test(lifetime.errors[0].text), 'M17. 31 gunden uzun donem gunlere bolunmez; dogru Meta ayari soylenir', JSON.stringify(lifetime.errors));

  const blank = P.parseCsv('"Rapor Başlangıcı","Rapor Sonu","Kampanya Adı",Sonuçlar,"Sonuç Göstergesi","Harcanan Tutar (TRY)"\n2026-10-01,2026-10-07,"A",,actions:onsite_conversion.messaging_conversation_started_7d,250\n2026-10-01,2026-10-07,,,,250', 'META');
  check(blank.errors.length === 0 && blank.rows.length === 1 && blank.rows[0].results === null && codes(blank.warnings).includes('RESULTS_BLANK') && codes(blank.warnings).includes('BLANK_CAMPAIGN_SKIPPED'),
    'M18. Bos sonuc 0 yazilmaz ve soylenir; adsiz (toplam) satir atlanir', JSON.stringify(blank));
  const fractional = P.parseCsv('"Rapor Başlangıcı","Rapor Sonu","Kampanya Adı","Harcanan Tutar (TRY)",Gösterim\n2026-10-01,2026-10-07,"A",10,12.5', 'META');
  check(codes(fractional.errors).includes('INVALID_NUMBER'), 'M19. Kesirli gosterim reddedilir (sayac tam sayidir)', JSON.stringify(fractional.errors));

  // phase113: gunluk dokum kampanya x ay basina tek satir (az satir = az backend maliyeti).
  const MSG = 'actions:onsite_conversion.messaging_conversation_started_7d';
  const dailyCsv = lines => '"Gün","Kampanya Adı","Sonuçlar","Sonuç Göstergesi","Harcanan Tutar (TRY)","Gösterim","Bağlantı Tıklamaları"\n' + lines.join('\n');
  const octDays = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
  const dailyFile = P.parseCsv(dailyCsv([
    ...octDays.map(d => `${d},"A",2,${MSG},100.10,1000,10`),
    ...['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map(d => `${d},"B",1,${MSG},50,500,5`)
  ]), 'META');
  const compact = P.compactDaily(dailyFile.rows);
  const a = compact.rows.find(row => row.campaignName === 'A') || {};
  const daySum = (a.daily || []).reduce((total, day) => total + day.s, 0);
  check(dailyFile.rows.length === 35 && compact.rows.length === 3, 'M20. 35 gunluk satir 3 donem satirina iner (kampanya x ay)', `${dailyFile.rows.length} -> ${compact.rows.length}`);
  check(a.periodStart === '2026-10-01' && a.periodEnd === '2026-10-31' && a.spend === 3103.1 && a.daily.length === 31 && Math.abs(daySum - a.spend) < 0.005
    && a.impressions === 31000 && a.clicks === 310 && a.messages === 62 && a.reach === null,
    'M21. Toplam gunlerin toplamidir; gunluk dizi 31 gun; gunluk erisim toplanmaz', JSON.stringify({ ...a, daily: a.daily && a.daily.length }));
  const b = compact.rows.filter(row => row.campaignName === 'B').map(row => `${row.periodStart}..${row.periodEnd}:${row.spend}`).sort();
  check(JSON.stringify(b) === JSON.stringify(['2026-10-30..2026-10-31:100', '2026-11-01..2026-11-02:100']), 'M22. Ay sinirini kesen kampanya her ayda ayri satir (gider ayina dogru duser)', JSON.stringify(b));
  check(compact.errors.length === 0 && JSON.stringify(Object.keys(a.daily[0])) === JSON.stringify(['d', 's', 'i', 'c', 'r']), 'M23. Gun kaydi yalniz kisa anahtarlar tasir (d, s, i, c, r)', JSON.stringify(a.daily && a.daily[0]));

  const existingHalf = { campaign_id: 'c1', period_start: '2026-10-01', period_end: '2026-10-15', spend: 150,
    daily_metrics: octDays.slice(0, 15).map(d => ({ d, s: 10, i: 100, c: 1, r: 1 })) };
  const second = P.compactDaily(P.parseCsv(dailyCsv(octDays.slice(9, 20).map(d => `${d},"A",3,${MSG},20,200,2`)), 'META').rows
    .map(row => ({ ...row, campaignId: 'c1' })), [existingHalf]);
  const merged = second.rows[0] || {};
  check(second.rows.length === 1 && merged.periodStart === '2026-10-01' && merged.periodEnd === '2026-10-20' && merged.spend === 310 && merged.daily.length === 20
    && merged.daily[9].s === 20 && merged.daily[8].s === 10 && merged.keptDays === 9 && codes(second.warnings).includes('DAILY_MERGED_WITH_EXISTING'),
    'M24. Ay ortasi yuklemesi ayni ayin kayitli gunleriyle birlesir; dosyadaki gun eskisinin yerine gecer', JSON.stringify({ ...merged, daily: undefined }));
  const legacy = P.compactDaily([{ ...dailyFile.rows[0], campaignId: 'c1' }], [{ campaign_id: 'c1', period_start: '2026-10-05', period_end: '2026-10-05', spend: 40, impressions: 400, clicks: null, results: 4, daily_metrics: null }]);
  check(legacy.rows[0].daily.length === 2 && legacy.rows[0].spend === 140.1 && legacy.rows[0].periodEnd === '2026-10-05',
    'M25. phase113 oncesi tek gunluk kayit da ayni aya katlanir (eski satirlar kuculur)', JSON.stringify(legacy.rows[0]));
  const monthlyOld = P.compactDaily([{ ...dailyFile.rows[0], campaignId: 'c1' }], [{ campaign_id: 'c1', period_start: '2026-10-01', period_end: '2026-10-31', spend: 999, daily_metrics: null }]);
  check(monthlyOld.rows[0].daily.length === 1 && monthlyOld.rows[0].spend === 100.1, 'M26. Gunluk kirilimi olmayan aylik kayit uydurma gunlere bolunmez (karar sunucunun kismi kapsama kapisinda)', JSON.stringify(monthlyOld.rows[0]));
  check(JSON.stringify(P.compactDaily(real.rows).rows) === JSON.stringify(real.rows), 'M27. Aylik dosyanin satirlari dokunulmadan gecer', 'aylik satirlar degisti');
  const mixedDaily = P.compactDaily([dailyFile.rows[0], { ...dailyFile.rows[1], resultMetric: 'profile_visit_view', resultType: 'OTHER' }]);
  check(codes(mixedDaily.errors).includes('DAILY_RESULT_MIXED'), 'M28. Ay icinde degisen sonuc gostergesi tek satira karistirilmaz', JSON.stringify(mixedDaily.errors));

  // Aşama 3: içe aktarma planı (eşleştirme, değişecek kayıtlar, kapalı ay).
  const kampanyalar = [{ id: 'c-kis', name: 'Kış Satış WP-IG', platform: 'META' }, { id: 'c-web', name: 'web site trafik', platform: 'META' }, { id: 'c-g', name: 'Profil trafik', platform: 'GOOGLE' }];
  const plan = P.planImport({ rows: real.rows, campaigns: kampanyalar });
  const choice = name => (plan.names.find(item => item.name === name) || {}).choice;
  check(plan.errors.length === 0 && choice('Kış Satış WP-IG') === 'c-kis' && choice('Web site trafik') === 'c-web' && choice('Profil trafik') === P.NEW_CAMPAIGN,
    'P1. Ad eslesen kampanya secili gelir, benzer ad (buyuk/kucuk) eslesir, baska platformdaki ayni ad eslesmez', JSON.stringify(plan.names.map(item => [item.name, item.choice])));
  check(plan.newCampaigns.length === 4 && plan.summary.newCampaignCount === 4 && plan.newCampaigns.find(item => item.name === 'Kış Satış WP-IG') === undefined
    && plan.rows.filter(row => row.campaignKey).length === 4 && plan.rows.find(row => row.campaignName === 'Kış Satış WP-IG').campaignId === 'c-kis',
    'P2. Eslesmeyen ad varsayilan olarak yeni kampanya olur (gecici anahtarla)', JSON.stringify(plan.newCampaigns));
  check(plan.summary.campaignCount === 6 && plan.summary.dayCount === 31 && plan.summary.rangeStart === '2026-10-01' && plan.summary.rangeEnd === '2026-10-31'
    && plan.summary.totalSpend === Math.round(real.rows.reduce((t, r) => t + r.spend, 0) * 100) / 100,
    'P3. Ozet: donem, gun, kampanya sayisi ve toplam harcama dosyadan', JSON.stringify(plan.summary));
  const elle = P.planImport({ rows: real.rows, campaigns: kampanyalar, mapping: { 'META|Profil trafik': 'c-web', 'META|Kış Satış WP-IG': P.NEW_CAMPAIGN } });
  check(elle.names.find(item => item.name === 'Profil trafik').choice === 'c-web' && elle.names.find(item => item.name === 'Kış Satış WP-IG').choice === P.NEW_CAMPAIGN,
    'P4. Kullanicinin elle secimi otomatik eslesmenin onune gecer', JSON.stringify(elle.names.map(item => [item.name, item.choice])));
  check(elle.errors.some(item => item.code === 'DUPLICATE_MAPPING'), 'P5. Iki dosya kampanyasi ayni kampanyaya eslenirse onay kapanir', JSON.stringify(elle.errors));
  check(P.planImport({ rows: real.rows, campaigns: kampanyalar, mapping: { 'META|Profil trafik': 'c-g' } }).names.find(item => item.name === 'Profil trafik').choice === P.NEW_CAMPAIGN,
    'P6. Baska platformun kampanyasi secilemez', 'GOOGLE kampanyasi META satirina eslendi');
  const degisen = P.planImport({ rows: real.rows, campaigns: kampanyalar, existingPeriods: [
    { id: 'old', campaign_id: 'c-kis', period_start: '2026-10-01', period_end: '2026-10-31', spend: 10, daily_metrics: null }] });
  check(degisen.errors.length === 0 && degisen.summary.replacedCount === 1, 'P7. Dosyanin tamamen kapsadigi kayit "degisecek" olarak sayilir', JSON.stringify(degisen.summary));
  const kismi = P.planImport({ rows: real.rows, campaigns: kampanyalar, existingPeriods: [
    { id: 'old', campaign_id: 'c-kis', period_start: '2026-09-20', period_end: '2026-10-10', spend: 10, daily_metrics: null }] });
  check(kismi.errors.some(item => item.code === 'PARTIAL_OVERLAP' && /2026-09-20/.test(item.text)), 'P8. Kismen kapsanan eski kayit onceden soylenir (sunucu da durdurur)', JSON.stringify(kismi.errors));
  const kapali = P.planImport({ rows: real.rows, campaigns: kampanyalar, closedMonths: ['2026-10'] });
  check(kapali.errors.some(item => item.code === 'CLOSED_MONTH' && /2026-10/.test(item.text)), 'P9. Kapatilmis aya dusen aktarim onceden durdurulur', JSON.stringify(kapali.errors));
  const gunluk = P.planImport({ rows: dailyFile.rows, campaigns: [] });
  check(gunluk.summary.fileRowCount === 35 && gunluk.summary.periodCount === 3 && gunluk.rows.every(row => row.campaignKey),
    'P10. Gunluk dosya planda kampanya x ay satirina iner (phase113)', JSON.stringify(gunluk.summary));
} catch (error) { failed++; console.error(error.stack); }
console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed) process.exit(1);
