/**
 * LEXBNB USALI GELİR/GİDER SINIFLANDIRMA TEST SUITE
 *
 * USALI (Uniform System of Accounts for the Lodging Industry):
 *   - Ciro, misafirin odedigi BRUT tutardir.
 *   - OTA komisyonu bir DAGITIM GIDERIDIR, gelirden dusulmez.
 *   - Misafirden alinan temizlik ucreti gelirdir; yalnız kaydedilmiş temizlikçi ödemesi giderdir.
 *
 * 2026-09-12'de uretimde su tutarsizlik bulundu: ayni ay icin yonetici paneli
 * 44.000 TL, finans ekrani 43.100 TL net kar raporluyordu.
 *   - Yonetici paneli ciroyu brut aliyor ama komisyon/temizligi HIC saymiyordu
 *     -> kari sisirıyordu.
 *   - Finans ekrani ayni tutarlari GELIRDEN dusuyordu -> ciroyu eksik
 *     gosteriyordu (ve "Brüt Oda & Hizmet Geliri" diye etiketliyordu).
 *
 * Ikisi de USALI'ye aykiriydi. Bu suit dogru sinifllandirmayi kilitler.
 *
 * Kapsam:
 *  1. Ciro brut tutardir (komisyon/temizlik dusulmez)
 *  2. OTA komisyonu gider tarafinda sayilir
 *  3. Misafir temizlik ücreti gider sayılmaz
 *  4. Net kar = brut ciro - (komisyon + kaydedilmiş giderler)
 *  5. Iptal edilen rezervasyonun komisyonu gider sayilmaz
 *  6. ADR oda geliri uzerinden hesaplanir
 *  7. app.js finans modulu de brut ciro kullanir (kaynak denetimi)
 *  8. app.js finans modulu dagitim maliyetini gidere ekler (kaynak denetimi)
 */

const fs = require('fs');
const path = require('path');
const Svc = require('./executive_dashboard_service.js');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB USALI REVENUE / EXPENSE TREATMENT TESTS');
  console.log('=============================================================================\n');

  // Senaryo: brut 49.000, komisyon 3.750, temizlik 900, ayrica 5.000 reklam gideri
  const kpis = Svc.computeExecutiveTopKpis({
    bookings: [
      { gross_amount: 49000, ota_commission: 3750, cleaning_fee: 900, nights: 7, status: 'CONFIRMED' }
    ],
    expenses: [{ amount: 5000, category: 'Reklam' }],
    propertiesCount: 2,
    daysInMonth: 30
  });

  const ciro = kpis.revenue.current;
  const kar = kpis.netProfit.current;
  const adr = kpis.adr.current;

  check(ciro === 49000, '1. Ciro brüt tutardır (49.000)', `donen: ${ciro}`);

  // Beklenen gider: 3750 + 5000 = 8750 -> net kar 40.250. Misafirden tahsil
  // edilen 900 TL temizlik bedeli ayrıca maliyet değildir.
  check(kar === 49000 - (3750 + 5000),
    '4. Net kâr = brüt ciro − (komisyon + kaydedilmiş gider)',
    `beklenen ${49000 - 8750}, donen ${kar}`);
  check(kpis.opex.current === 8750 && kpis.capex.current === 0
      && kpis.operatingProfit.current === 40250,
    '4b. OPEX komisyonu içerir, CAPEX ve faaliyet kârı ayrı kalır',
    JSON.stringify({ opex: kpis.opex.current, capex: kpis.capex.current, operatingProfit: kpis.operatingProfit.current }));

  const yatirimli = Svc.computeExecutiveTopKpis({
    bookings: [{ gross_amount: 49000, ota_commission: 3750, cleaning_fee: 900, nights: 7, status: 'CONFIRMED' }],
    expenses: [{ amount: 5000, expense_type: 'OPEX' }, { amount: 10000, expense_type: 'CAPEX' }],
    availableNights: 14
  });
  check(yatirimli.opex.current === 8750 && yatirimli.capex.current === 10000
      && yatirimli.operatingProfit.current === 40250 && yatirimli.netProfit.current === 30250,
    '4c. CAPEX faaliyet kârından sonra net nakit kârından düşer',
    JSON.stringify(yatirimli));
  check(yatirimli.occupancy.current === 50 && yatirimli.adr.current === 6871.43
      && yatirimli.revpar.current === 3435.71,
    '4d. Doluluk, ADR ve RevPAR gerçek gece ve oda geliriyle birlikte hesaplanır',
    JSON.stringify({ occupancy: yatirimli.occupancy, adr: yatirimli.adr, revpar: yatirimli.revpar }));

  // Komisyon ve temizligin AYRI AYRI sayildigini dogrula
  const komisyonsuz = Svc.computeExecutiveTopKpis({
    bookings: [{ gross_amount: 49000, ota_commission: 0, cleaning_fee: 900, nights: 7, status: 'CONFIRMED' }],
    expenses: [{ amount: 5000 }], propertiesCount: 2, daysInMonth: 30
  });
  const karKomisyonsuz = komisyonsuz.netProfit.current;
  check(karKomisyonsuz - kar === 3750, '2. OTA komisyonu gider olarak sayılır',
    `fark ${karKomisyonsuz - kar}, 3750 bekleniyordu`);

  const temizliksiz = Svc.computeExecutiveTopKpis({
    bookings: [{ gross_amount: 49000, ota_commission: 3750, cleaning_fee: 0, nights: 7, status: 'CONFIRMED' }],
    expenses: [{ amount: 5000 }], propertiesCount: 2, daysInMonth: 30
  });
  const karTemizliksiz = temizliksiz.netProfit.current;
  check(karTemizliksiz - kar === 0, '3. Misafir temizlik ücreti gider olarak sayılmaz',
    `fark ${karTemizliksiz - kar}, 0 bekleniyordu`);

  // Iptal edilen rezervasyon hicbir sey katmamali
  const iptalli = Svc.computeExecutiveTopKpis({
    bookings: [
      { gross_amount: 49000, ota_commission: 3750, cleaning_fee: 900, nights: 7, status: 'CONFIRMED' },
      { gross_amount: 30000, ota_commission: 9000, cleaning_fee: 500, nights: 3, status: 'CANCELLED' }
    ],
    expenses: [{ amount: 5000 }], propertiesCount: 2, daysInMonth: 30
  });
  const karIptalli = iptalli.netProfit.current;
  check(karIptalli === kar, '5. İptal edilen rezervasyonun komisyonu gider sayılmaz',
    `iptalli ${karIptalli}, normal ${kar}`);

  check(adr === Math.round((49000 - 900) / 7 * 100) / 100, '6. ADR oda geliri üzerinden hesaplanır',
    `donen ${adr}, ${Math.round((49000 - 900) / 7 * 100) / 100} bekleniyordu`);

  // --- Kaynak denetimi: app.js finans modulu ---------------------------------
  const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const i = APP.indexOf('let manualBookingRev = 0;');
  const blok = i === -1 ? '' : APP.slice(i, i + 1600);

  // Brut once, net yedek. (Tutar ayrica doneme dusen gece oraniyla carpilir;
  // bkz. getBookingFilterShare — orani buraya sokmak cironun brut olmasini
  // degistirmez.)
  check(/Number\(b\.gross !== undefined \? b\.gross : b\.net\)/.test(blok),
    '7. Finans modülü brüt ciro kullanır',
    'hala b.net (brut - komisyon - temizlik) kullaniliyor olabilir');

  check(/bookingDistributionCost \+=/.test(blok) && /totalOpex \+= bookingDistributionCost/.test(APP),
    '8. Finans modülü dağıtım maliyetini gidere ekler',
    'bookingDistributionCost gider toplamina eklenmiyor');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
