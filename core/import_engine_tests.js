/**
 * LEXBNB İÇE AKTARMA MOTORU TESTLERI
 *
 * Eski ice aktarici (app.js) su davranislari gosteriyordu ve hicbiri test
 * edilmiyordu:
 *   * Villa eslemesi bes uydurma villaya sabitti, varsayilan 'AZURE' —
 *     olmayan bir mulk. Musterinin dosyasindaki HER satir tanimsiz bir mulke
 *     atanirdi.
 *   * Eksik alanlar SESSIZCE uyduruluyordu: gece yoksa 2, tarih yoksa bugun,
 *     kisi yoksa 6, misafir adi yoksa "Misafir 3".
 *   * OTA komisyonu bos ise brutun %15'i olarak TAHMIN EDILIYORDU.
 *   * Hatali satir raporu yoktu.
 *
 * Bu suit yeni motorun bunlarin hicbirini yapmadigini dogrular.
 */

const E = require('./finance_import_engine');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

const MULKLER = [
  { id: 'p1', slug: 'SEYIR', name: 'SEYİR' },
  { id: 'p2', slug: 'NEFES', name: 'NEFES' }
];

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB İÇE AKTARMA MOTORU TESTLERI');
  console.log('=============================================================================\n');

  // --- 1. Tutar normalizasyonu -------------------------------------------------
  console.log('--- 1. TUTAR ---');
  const tutarlar = [
    ['₺76.322', 76322], ['₺76.322,50', 76322.5], ['76,322.50', 76322.5],
    ['1.234.567,89', 1234567.89], ['5000', 5000], [5000, 5000],
    ['₺1,500', 1500], ['0', 0], ['-250', -250], ['(250)', -250]
  ];
  const tutarHata = tutarlar.filter(([g, b]) => E.normalizeAmount(g) !== b)
    .map(([g, b]) => `"${g}" -> ${E.normalizeAmount(g)} (beklenen ${b})`);
  check(tutarHata.length === 0, '1. Türkçe ve İngilizce para biçimleri doğru okunur', tutarHata.join('; '));

  check(E.normalizeAmount('') === null && E.normalizeAmount('abc') === null && E.normalizeAmount(null) === null,
    '2. Okunamayan tutar null döner (0 DEĞİL — "boş" ile "sıfır" karışmamalı)',
    `"" -> ${E.normalizeAmount('')}, "abc" -> ${E.normalizeAmount('abc')}`);

  // --- 2. Tarih normalizasyonu -------------------------------------------------
  console.log('\n--- 2. TARİH ---');
  const tarihler = [
    ['2026-03-15', '2026-03-15'], ['15.03.2026', '2026-03-15'], ['15/03/2026', '2026-03-15'],
    ['2026/3/5', '2026-03-05'], [new Date(2026, 2, 15), '2026-03-15']
  ];
  const tarihHata = tarihler.filter(([g, b]) => E.normalizeDate(g) !== b)
    .map(([g, b]) => `"${g}" -> ${E.normalizeDate(g)} (beklenen ${b})`);
  check(tarihHata.length === 0, '3. Türkçe (gg.aa.yyyy) ve ISO tarihler doğru okunur', tarihHata.join('; '));

  check(E.normalizeDate('31.02.2026') === null,
    '4. Takvimde olmayan tarih (31 Şubat) reddedilir', '-> ' + E.normalizeDate('31.02.2026'));
  check(E.normalizeDate('abc') === null && E.normalizeDate('') === null,
    '5. Anlaşılmayan tarih null döner', '');

  // --- 3. Sutun eslestirme -----------------------------------------------------
  console.log('\n--- 3. SÜTUN EŞLEŞTİRME ---');
  const mapB = E.autoDetectColumnMap(
    ['Villa', 'Misafir Adı', 'Giriş Tarihi', 'Çıkış Tarihi', 'Brüt Tutar (TL)', 'Kanal'], 'BOOKINGS');
  check(mapB.property === 'Villa' && mapB.guest === 'Misafir Adı' && mapB.checkIn === 'Giriş Tarihi'
        && mapB.checkOut === 'Çıkış Tarihi' && mapB.gross === 'Brüt Tutar (TL)',
    '6. Rezervasyon başlıkları otomatik eşleşir', JSON.stringify(mapB));

  const mapG = E.autoDetectColumnMap(['Tarih', 'Kategori', 'Tutar', 'Açıklama', 'Villa', 'Tür'], 'EXPENSES');
  check(mapG.date === 'Tarih' && mapG.category === 'Kategori' && mapG.amount === 'Tutar'
        && mapG.expenseType === 'Tür',
    '7. Gider başlıkları otomatik eşleşir', JSON.stringify(mapG));

  // --- 4. Rezervasyon dogrulama: UYDURMA YOK -----------------------------------
  console.log('\n--- 4. REZERVASYON: EKSİK ALAN UYDURULMAZ ---');
  const bMap = E.autoDetectColumnMap(
    ['Villa', 'Misafir Adı', 'Giriş Tarihi', 'Çıkış Tarihi', 'Brüt Tutar (TL)', 'Kanal',
     'OTA Komisyonu (TL)', 'Temizlik Ücreti (TL)', 'Kişi Sayısı', 'Durum'], 'BOOKINGS');

  const eksik = E.validateBookingRows([
    { 'Villa': 'SEYİR', 'Misafir Adı': '', 'Giriş Tarihi': '', 'Çıkış Tarihi': '',
      'Brüt Tutar (TL)': '', 'Kanal': '' }
  ], bMap, { properties: MULKLER });

  check(eksik.validCount === 0 && eksik.invalidCount === 1,
    '8. Tamamen boş satır REDDEDİLİR (eskiden misafir/tarih/gece uydurulurdu)',
    JSON.stringify({ gecerli: eksik.validCount, hatali: eksik.invalidCount }));

  const h = eksik.errors[0].errors.join(' ');
  check(h.includes('Misafir adı boş') && h.includes('Giriş tarihi boş') && h.includes('Çıkış tarihi boş'),
    '9. Her eksik alan ayrı ayrı bildirilir', h);

  // Olmayan mulk
  const yabanciMulk = E.validateBookingRows([
    { 'Villa': 'AZURE', 'Misafir Adı': 'Ali', 'Giriş Tarihi': '2026-03-10',
      'Çıkış Tarihi': '2026-03-14', 'Brüt Tutar (TL)': '40000' }
  ], bMap, { properties: MULKLER });
  check(yabanciMulk.validCount === 0 &&
        yabanciMulk.errors[0].errors.some(e => e.includes('Mülk bulunamadı')),
    '10. İşletmede olmayan mülk REDDEDİLİR (eskiden sessizce AZURE\'a atanırdı)',
    JSON.stringify(yabanciMulk.errors[0] && yabanciMulk.errors[0].errors));

  // Komisyon bos -> 0, TAHMIN EDILMEZ
  const komisyonsuz = E.validateBookingRows([
    { 'Villa': 'SEYİR', 'Misafir Adı': 'Ali', 'Giriş Tarihi': '2026-03-10',
      'Çıkış Tarihi': '2026-03-14', 'Brüt Tutar (TL)': '40000', 'Kanal': 'AIRBNB',
      'OTA Komisyonu (TL)': '' }
  ], bMap, { properties: MULKLER });
  check(komisyonsuz.validCount === 1 && komisyonsuz.validatedRows[0].otaCommission === 0,
    '11. Boş OTA komisyonu 0 kalır, %15 diye TAHMİN EDİLMEZ',
    'komisyon = ' + (komisyonsuz.validatedRows[0] && komisyonsuz.validatedRows[0].otaCommission));

  // Gece sayisi tarihlerden hesaplanir
  check(komisyonsuz.validatedRows[0].nights === 4,
    '12. Gece sayısı tarihlerden hesaplanır (dosyadaki "Gece" sütununa güvenilmez)',
    'gece = ' + komisyonsuz.validatedRows[0].nights);

  // Ters tarih
  const ters = E.validateBookingRows([
    { 'Villa': 'SEYİR', 'Misafir Adı': 'Ali', 'Giriş Tarihi': '2026-03-14',
      'Çıkış Tarihi': '2026-03-10', 'Brüt Tutar (TL)': '40000' }
  ], bMap, { properties: MULKLER });
  check(ters.validCount === 0 && ters.errors[0].errors.some(e => e.includes('sonra olmalı')),
    '13. Çıkış tarihi girişten önceyse reddedilir', JSON.stringify(ters.errors[0] && ters.errors[0].errors));

  // Komisyon + temizlik brutu asiyor
  const asan = E.validateBookingRows([
    { 'Villa': 'SEYİR', 'Misafir Adı': 'Ali', 'Giriş Tarihi': '2026-03-10', 'Çıkış Tarihi': '2026-03-14',
      'Brüt Tutar (TL)': '10000', 'OTA Komisyonu (TL)': '8000', 'Temizlik Ücreti (TL)': '5000' }
  ], bMap, { properties: MULKLER });
  check(asan.validCount === 0 && asan.errors[0].errors.some(e => e.includes('aşıyor')),
    '14. Komisyon + temizlik brütü aşamaz', JSON.stringify(asan.errors[0] && asan.errors[0].errors));

  // --- 5. Cakisma ve mukerrer ---------------------------------------------------
  console.log('\n--- 5. ÇAKIŞMA VE MÜKERRER ---');
  const cakisan = E.validateBookingRows([
    { 'Villa': 'SEYİR', 'Misafir Adı': 'Ali', 'Giriş Tarihi': '2026-03-10', 'Çıkış Tarihi': '2026-03-14', 'Brüt Tutar (TL)': '40000' },
    { 'Villa': 'SEYİR', 'Misafir Adı': 'Veli', 'Giriş Tarihi': '2026-03-12', 'Çıkış Tarihi': '2026-03-16', 'Brüt Tutar (TL)': '30000' }
  ], bMap, { properties: MULKLER });
  check(cakisan.overlaps.length === 1,
    '15. Dosya içindeki tarih çakışması yazmadan önce bildirilir',
    JSON.stringify(cakisan.overlaps));

  const ayniIki = E.validateBookingRows([
    { 'Villa': 'SEYİR', 'Misafir Adı': 'Ali', 'Giriş Tarihi': '2026-03-10', 'Çıkış Tarihi': '2026-03-14', 'Brüt Tutar (TL)': '40000' },
    { 'Villa': 'SEYİR', 'Misafir Adı': 'Ali', 'Giriş Tarihi': '2026-03-10', 'Çıkış Tarihi': '2026-03-14', 'Brüt Tutar (TL)': '40000' }
  ], bMap, { properties: MULKLER });
  check(ayniIki.duplicateCount === 1,
    '16. Birebir aynı satır mükerrer olarak işaretlenir', 'mükerrer = ' + ayniIki.duplicateCount);

  // --- 6. Kapali donem ------------------------------------------------------------
  console.log('\n--- 6. KAPALI DÖNEM ---');
  const kapali = E.validateBookingRows([
    { 'Villa': 'SEYİR', 'Misafir Adı': 'Ali', 'Giriş Tarihi': '2026-03-10', 'Çıkış Tarihi': '2026-03-14', 'Brüt Tutar (TL)': '40000' }
  ], bMap, { properties: MULKLER, isStayPeriodClosed: () => true });
  check(kapali.validCount === 0 && kapali.errors[0].errors.some(e => e.includes('kapatılmış')),
    '17. Kapatılmış döneme denk gelen rezervasyon önizlemede engellenir',
    JSON.stringify(kapali.errors[0] && kapali.errors[0].errors));

  // --- 7. Gider dogrulama -----------------------------------------------------
  console.log('\n--- 7. GİDER ---');
  const gMap = E.autoDetectColumnMap(['Tarih', 'Kategori', 'Tutar', 'Açıklama', 'Villa', 'Tür'], 'EXPENSES');
  const gider = E.validateExpenseRows([
    { 'Tarih': '15.03.2026', 'Kategori': 'BAKIM', 'Tutar': '₺34.268', 'Açıklama': 'kombi', 'Villa': '', 'Tür': 'OPEX' },
    { 'Tarih': '20.03.2026', 'Kategori': 'REKLAM', 'Tutar': '₺76.322', 'Açıklama': '', 'Villa': 'NEFES', 'Tür': 'CAPEX' },
    { 'Tarih': '', 'Kategori': 'FATURA', 'Tutar': '₺100', 'Açıklama': '', 'Villa': '', 'Tür': '' },
    { 'Tarih': '01.04.2026', 'Kategori': '', 'Tutar': '₺100', 'Açıklama': '', 'Villa': '', 'Tür': '' },
    { 'Tarih': '01.04.2026', 'Kategori': 'FATURA', 'Tutar': '₺100', 'Açıklama': '', 'Villa': 'YOK', 'Tür': '' }
  ], gMap, { properties: MULKLER });

  check(gider.validCount === 2 && gider.invalidCount === 3,
    '18. Geçerli ve hatalı gider satırları ayrılır', JSON.stringify({ g: gider.validCount, h: gider.invalidCount }));

  check(Math.abs(gider.totalAmount - 110590) < 0.01,
    '19. Geçerli satırların toplamı doğru hesaplanır (34.268 + 76.322)',
    'toplam = ' + gider.totalAmount);

  check(gider.validatedRows[1].expenseType === 'CAPEX' && gider.validatedRows[1].propertyId === 'p2',
    '20. CAPEX ve mülk eşlemesi doğru', JSON.stringify(gider.validatedRows[1]));

  check(gider.validatedRows[0].propertyId === null,
    '21. Boş mülk "tüm portföy" olarak kabul edilir (hata değil)',
    'propertyId = ' + gider.validatedRows[0].propertyId);

  // --- 8. CSV ----------------------------------------------------------------
  console.log('\n--- 8. CSV ---');
  const csv = E.parseCSV('Tarih;Kategori;Tutar\n15.03.2026;BAKIM;"1.234,56"\n16.03.2026;FATURA;500');
  check(csv.headers.length === 3 && csv.rows.length === 2 && csv.rows[0]['Tutar'] === '1.234,56',
    '22. Noktalı virgüllü CSV ve tırnaklı alanlar doğru ayrıştırılır', JSON.stringify(csv));

  // --- 9. Dosya parmak izi ------------------------------------------------------
  const h1 = E.computeHash('abc'), h2 = E.computeHash('abc'), h3 = E.computeHash('abd');
  check(h1 === h2 && h1 !== h3,
    '23. Dosya parmak izi kararlı ve ayırt edici (mükerrer yükleme engeli)', `${h1} / ${h3}`);

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
