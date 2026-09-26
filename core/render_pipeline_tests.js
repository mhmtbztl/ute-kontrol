/**
 * LEXBNB RENDER HATTI TESTLERI
 *
 * BU SUIT NEDEN VAR:
 *
 * 2026-09-13'te uretimde bulundu:
 *
 *   ReferenceError: setEl is not defined
 *     at renderExecutiveControlCenter (app.js:12835)
 *     at renderAll (app.js:3071)
 *     at loadTenantAppData (app.js:11441)   <-- catch blogu
 *
 * setEl IKI fonksiyonun ICINDE yerel tanimliydi; renderExecutiveControlCenter
 * onu kendi kapsaminda bulamiyordu. Oturum acan HER kullanicida veri yukleme
 * catch'e dusuyor, appData bos duruma cekiliyordu. Uygulama girisden sonra
 * bostu ve bu gun boyunca canlida kaldi.
 *
 * O ZAMANKI 54 SUITTEN HICBIRI YAKALAYAMADI: hicbiri renderAll'i
 * calistirmiyordu. Node tarafinda `document` olmadigi icin render hatti
 * tamamen test disiydi.
 *
 * Bu suit o boslugu kapatir: minimal ama "her zaman eleman doner" bir DOM
 * taklidi kurar ve renderAll()'i GERCEKTEN calistirir. Boylece render
 * fonksiyonlarindaki tanimsiz referanslar, null erisimler ve tip hatalari
 * calisma aninda yakalanir.
 *
 * Statik tarama denendi ve BIRAKILDI: regex literalleri (/['\"]/ gibi) dize
 * ayristiricisini bozuyor, 40'tan fazla yanlis pozitif uretiyordu.
 */

// --- Sahte DOM ---------------------------------------------------------------
// Her getElementById CAGRISI bir eleman doner. Bu bilincli: null donseydi
// render fonksiyonlari `if (!el) return;` ile erken cikar ve asil kod hic
// calismazdi — yani hatalar yine gizlenirdi.
function sahteEleman(id) {
  const el = {
    id: id || '',
    tagName: 'DIV',
    innerHTML: '',
    innerText: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    title: '',
    className: '',
    dataset: {},
    style: new Proxy({}, { get: (t, k) => t[k] || '', set: (t, k, v) => { t[k] = v; return true; } }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    options: [],
    children: [],
    parentNode: null,
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.dataset[k] = v; },
    getAttribute(k) { return this.dataset[k] !== undefined ? this.dataset[k] : null; },
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    focus() {}, blur() {}, click() {}, scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    getContext: () => null
  };
  return el;
}

function domKur() {
  const onbellek = new Map();
  const doc = {
    body: sahteEleman('body'),
    documentElement: sahteEleman('html'),
    getElementById(id) {
      if (!onbellek.has(id)) onbellek.set(id, sahteEleman(id));
      return onbellek.get(id);
    },
    createElement: (tag) => { const e = sahteEleman(''); e.tagName = String(tag || 'div').toUpperCase(); return e; },
    // SVG grafikleri (gider donutu) createElementNS kullaniyor.
    createElementNS: (ns, tag) => { const e = sahteEleman(''); e.tagName = String(tag || 'svg').toUpperCase(); return e; },
    createTextNode: (t) => ({ textContent: t }),
    createDocumentFragment: () => sahteEleman(''),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    getElementsByClassName: () => [],
    getElementsByTagName: () => []
  };
  global.document = doc;
  global.window = global.window || {};
  global.window.document = doc;
  global.requestAnimationFrame = (fn) => { try { fn(); } catch (e) {} return 1; };
  global.cancelAnimationFrame = () => {};
  global.alert = () => {};
  global.confirm = () => false;
  global.getComputedStyle = () => ({ getPropertyValue: () => '' });
  global.localStorage = {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  };
  return doc;
}

domKur();

global.ExecutiveDashboardService = require('./executive_dashboard_service.js');
const app = require('../app.js');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

function hataOzeti(e) {
  const yig = (e && e.stack ? e.stack : String(e)).split('\n').slice(0, 4).join('\n         ');
  return (e && e.message ? e.message : String(e)) + '\n         ' + yig;
}

// --- Senaryolar ---------------------------------------------------------------
function bosVeri() {
  return {
    tenantId: '00000000-0000-4000-8000-000000000001',
    companyName: 'Test İşletme',
    villas: {}, bookings: [], expenses: [], cleaningTasks: [], leads: [],
    maintenance: [], marketingCampaigns: [], influencerCollabs: [],
    closedPeriods: [], targets: [], isCleanState: true
  };
}

function doluVeri() {
  return {
    tenantId: '00000000-0000-4000-8000-000000000001',
    companyName: 'Test İşletme',
    villas: {
      V1: { id: 'p1', slug: 'V1', name: 'Deniz Evi', capacity: '6', basePrice: 12000, cleanCost: 1500, url: 'https://ornek/1' },
      V2: { id: 'p2', slug: 'V2', name: 'Bahçe Evi', capacity: '8', basePrice: 9000, cleanCost: 1200 }
    },
    bookings: [
      // Aylari KESEN rezervasyon: tahakkuk yolunu da calistirir
      { id: 'b1', villa: 'V1', propertyId: 'p1', code: 'R-1', guest: 'Ali', checkIn: '2026-08-28',
        checkOut: '2026-09-03', nights: 6, gross: 60000, net: 52000, otaCommission: 5000,
        cleaningFee: 3000, channel: 'AIRBNB', status: 'CONFIRMED', pax: 6 },
      { id: 'b2', villa: 'V2', propertyId: 'p2', code: 'R-2', guest: 'Ayşe', checkIn: '2026-09-10',
        checkOut: '2026-09-14', nights: 4, gross: 20000, net: 20000, otaCommission: 0,
        cleaningFee: 1000, channel: 'WHATSAPP', status: 'CONFIRMED', pax: 4 },
      { id: 'b3', villa: 'V1', propertyId: 'p1', code: 'R-3', guest: 'İptal', checkIn: '2026-09-20',
        checkOut: '2026-09-22', nights: 2, gross: 15000, net: 15000, otaCommission: 0,
        cleaningFee: 0, channel: 'DIRECT', status: 'CANCELLED', pax: 2 }
    ],
    expenses: [
      { id: 'e1', date: '2026-09-05', category: 'Bakım & Onarım', amount: 8000, type: 'OPEX', villa: 'ALL', description: 'kombi' },
      { id: 'e2', date: '2026-09-08', category: 'Yatırım & Demirbaş', amount: 25000, type: 'CAPEX', villa: 'V1', description: 'mobilya' }
    ],
    cleaningTasks: [
      { id: 'c1', bookingId: 'b1', villa: 'V1', date: '2026-09-03', cleaner: 'Zeynep', amount: 500, desc: '', paid: false }
    ],
    leads: [
      { id: 'l1', name: 'Talep', villa: 'V1', status: 'NEW', channel: 'WHATSAPP', value: 30000, createdAt: '2026-09-01' }
    ],
    maintenance: [
      { id: 'm1', villa: 'V1', priority: 'P1', title: 'Arıza', assignee: 'X', downtime: 0, cost: 0, status: 'OPEN' }
    ],
    marketingCampaigns: [], influencerCollabs: [],
    closedPeriods: [], targets: [], isCleanState: false
  };
}

function renderCalistir(etiket, veri, donem) {
  domKur();                       // her senaryo temiz DOM ile
  app.setAppData(veri);
  if (app.setActiveTenantForTests) {
    app.setActiveTenantForTests({ id: veri.tenantId, name: veri.companyName, slug: 't', role: 'owner' });
  }
  app.setCurrentFilter({ period: donem, villa: 'ALL', startDate: null, endDate: null });
  try {
    app.renderAll();
    ok(etiket);
    return true;
  } catch (e) {
    no(etiket, hataOzeti(e));
    return false;
  }
}

function run() {
  console.log('=============================================================================');
  console.log('LEXBNB RENDER HATTI TESTLERI');
  console.log('=============================================================================\n');

  check(typeof app.renderAll === 'function', '1. renderAll test edilebilir şekilde dışa aktarılmış',
    'renderAll export edilmemiş; render hattı test edilemez');

  if (typeof app.renderAll !== 'function') {
    console.log('\nrenderAll yok, kalan testler atlanıyor.');
  } else {
    renderCalistir('2. renderAll boş işletmede hata vermeden çalışır', bosVeri(), '2026-09');
    renderCalistir('3. renderAll dolu veriyle hata vermeden çalışır', doluVeri(), '2026-09');
    renderCalistir('4. renderAll ayları kesen rezervasyonun ÖNCEKİ ayında çalışır', doluVeri(), '2026-08');
    renderCalistir('5. renderAll veri olmayan bir dönemde çalışır', doluVeri(), '2027-03');
    renderCalistir('6. renderAll "Tüm Zamanlar" filtresinde çalışır', doluVeri(), 'ALL');

    // Kapatilmis donem: ay kapanisi karti ve kapali donem yollari
    const kapali = doluVeri();
    kapali.closedPeriods = [{ id: 'k1', tenant_id: kapali.tenantId, year: 2026, month: 9,
      status: 'CLOSED', closed_at: '2026-09-30T12:00:00Z', snapshot_json: {},
      history_json: [{ action: 'CLOSED', at: '2026-09-30T12:00:00Z' }] }];
    renderCalistir('7. renderAll kapatılmış dönemde çalışır (ay kapanışı kartı)', kapali, '2026-09');
  }

  // --- Uretimde patlayan iki isim -----------------------------------------------
  check(typeof app.setEl === 'function',
    '8. setEl genel kapsamda tanımlı',
    'renderExecutiveControlCenter onu kullanıyor; yerel tanım yetmez — bu tam olarak ' +
    'üretimde patlayan hataydı.');

  check(typeof app.showToast === 'function',
    '9. showToast genel kapsamda tanımlı',
    '34 çağrı var; tanım yoksa hepsi "typeof" koruması yüzünden SESSİZCE yutulur ve ' +
    'kullanıcı hiçbir onay görmez.');

  const uuidRezervasyon = [{ id: 'b-uuid', propertyId: 'p1', villa: 'p1', guest: 'Ali' }];
  const slugEslesmis = app.attachBookingVillaSlugs(uuidRezervasyon, doluVeri().villas);
  check(slugEslesmis[0].villa === 'V1',
    '10. Paralel ilk yüklemede rezervasyon property UUID değeri villa slug değerine çevrilir',
    JSON.stringify(slugEslesmis[0]));

  const eslesmeyen = app.attachBookingVillaSlugs([{ propertyId: 'bilinmeyen', villa: 'bilinmeyen' }], doluVeri().villas);
  check(eslesmeyen[0].villa === 'bilinmeyen',
    '11. Eşleşmeyen property kimliği veri kaybı olmadan korunur',
    JSON.stringify(eslesmeyen[0]));

  // --- Temizlik operasyon ozeti: gercek alan sozlesmesi ---------------------
  try {
    domKur();
    const operasyonVeri = bosVeri();
    operasyonVeri.villas = {
      V1: { id: 'p1', slug: 'V1', name: 'Deniz Evi' },
      V2: { id: 'p2', slug: 'V2', name: 'Bahçe Evi' }
    };
    operasyonVeri.cleaningTasks = [
      { id: 'pending-1', villa: 'V1', date: '2026-09-23', cleaner: 'Zeynep', amount: 2500,
        notes: 'Nevresim değişecek', paid: false, status: 'DONE' },
      // K-04: planli (henuz yapilmamis) temizlik personele borc DEGILDIR.
      { id: 'planned-1', villa: 'V1', date: '2026-09-25', cleaner: 'Zeynep', amount: 900,
        notes: 'PLANLI-GOREV-BORC-DEGIL', paid: false, status: 'PLANNED' },
      { id: 'paid-1', villa: 'V2', date: '2026-09-24', cleaner: 'Ayşe', amount: 1800,
        notes: 'ODENMIS-GOREV-GIZLI', paid: true }
    ];
    app.setAppData(operasyonVeri);
    app.renderOperationsTab();
    const operationsHtml = global.document.getElementById('opsCombinedContainer').innerHTML;
    const operationsCount = global.document.getElementById('opsTaskCountBadge').innerText;
    const rowCount = (operationsHtml.match(/data-cleaning-task-id=/g) || []).length;

    check(
      !operationsHtml.includes('Turnover ()') && !operationsHtml.includes('>PENDING<'),
      '17. Operasyon ozeti "Turnover ()" ve ham "PENDING" URETMİYOR',
      operationsHtml.slice(0, 700)
    );
    check(
      operationsHtml.includes('Deniz Evi') && operationsHtml.includes('23.09.2026')
        && operationsHtml.includes('Zeynep') && operationsHtml.includes('₺2.500')
        && operationsHtml.includes('Nevresim değişecek') && operationsHtml.includes('Ödenecek'),
      '18. Operasyon satiri mulk, tarih, personel, tutar, aciklama ve odeme durumunu GOSTERIYOR',
      operationsHtml.slice(0, 1000)
    );
    check(
      !operationsHtml.includes('ODENMIS-GOREV-GIZLI') && !operationsHtml.includes('PLANLI-GOREV-BORC-DEGIL') && operationsCount === '1'
        && operationsHtml.includes('Bekleyen Temizlik Borçları (1)') && rowCount === 1,
      '19. Odenmis gorev bekleyen borcta YOK; baslik, sayac ve liste ayni filtreyi kullaniyor',
      `badge=${operationsCount}, satir=${rowCount}, html=${operationsHtml.slice(0, 700)}`
    );
    check(
      operationsHtml.includes("openEditCleaningTaskModal(decodeURIComponent('pending-1'))")
        && operationsHtml.includes('Ayrıntı / Düzenle'),
      '20. Operasyon satirindan ayrinti/duzenleme akisina ULASILABILIYOR',
      operationsHtml.slice(0, 900)
    );
  } catch (e) {
    no('17-20. Temizlik operasyon ozeti cevrimdisi render testi', hataOzeti(e));
  }

  // --- Phase 36: anasayfa mulk satis hazirligi -----------------------------
  try {
    domKur();
    const hazirlikVeri = bosVeri();
    hazirlikVeri.villas = {
      V1: { id: 'p1', slug: 'V1', name: 'Yeşil Ev' },
      V2: { id: 'p2', slug: 'V2', name: 'Sarı Ev' },
      V3: { id: 'p3', slug: 'V3', name: 'Mavi Ev' },
      V4: { id: 'p4', slug: 'V4', name: 'Kırmızı Ev' }
    };
    hazirlikVeri.housekeepingOverrides = {
      V1: 'SALES_READY', V2: 'NEEDS_CLEANING', V4: 'SALES_READY'
    };
    hazirlikVeri.maintenanceTickets = [
      { id: 'minor', property_id: 'p3', status: 'OPEN', severity: 'MEDIUM', booking_impact: false },
      { id: 'blocking', property_id: 'p4', status: 'IN_PROGRESS', severity: 'CRITICAL', booking_impact: true }
    ];
    app.setAppData(hazirlikVeri);
    app.setActiveTenantForTests({ id: hazirlikVeri.tenantId, name: 'Test', role: 'owner' });
    app.renderExecutiveControlCenter();

    const grid = global.document.getElementById('portfolioHealthCardsGrid').innerHTML;
    check(grid.includes('Yeşil Ev') && grid.includes('Satışa hazır')
      && grid.includes('Sarı Ev') && grid.includes('Temizlik sonrası hazır')
      && grid.includes('Mavi Ev') && grid.includes('Satışa açık · küçük arıza var')
      && grid.includes('Kırmızı Ev') && grid.includes('Satışa kapalı · büyük arıza/tadilat'),
    '21. Anasayfa dort mulk durumunu gercek adlari ve acik etiketleriyle gosteriyor',
    grid.slice(0, 1800));
    check(grid.includes('status-HEALTHY') && grid.includes('status-WARNING')
      && grid.includes('status-INFO') && grid.includes('status-CRITICAL'),
    '22. Hazirlik kartlari yesil, sari, mavi ve kirmizi gorsel siniflari tasiyor',
    grid.slice(0, 1400));
    check((grid.match(/class="property-readiness-select"/g) || []).length === 4,
      '23. Yetkili kullanici her mulkun durumunu anasayfadan degistirebiliyor',
      grid.slice(0, 1200));
    check(global.document.getElementById('healthPillReady').innerText.includes('1')
      && global.document.getElementById('healthPillCleaning').innerText.includes('1')
      && global.document.getElementById('healthPillMinorIssue').innerText.includes('1')
      && global.document.getElementById('healthPillBlocked').innerText.includes('1'),
    '24. Dort anasayfa sayaci kartlarla ayni normalize sonucu kullaniyor');

    app.setActiveTenantForTests({ id: hazirlikVeri.tenantId, name: 'Test', role: 'viewer' });
    app.renderExecutiveControlCenter();
    const viewerGrid = global.document.getElementById('portfolioHealthCardsGrid').innerHTML;
    check(!viewerGrid.includes('property-readiness-select')
      && viewerGrid.includes('değiştirme yetkiniz yok'),
    '25. Yetkisiz kullanici durumu goruyor ama degistirme kontrolu gormuyor',
    viewerGrid.slice(0, 1200));
  } catch (e) {
    no('21-25. Phase 36 anasayfa hazirlik render testi', hataOzeti(e));
  }

  // --- Phase 38: finansal KPI'lar ayni anasayfa sozlesmesinde ------------
  try {
    domKur();
    const kpiVeri = bosVeri();
    kpiVeri.villas = {
      V1: { id: 'p1', slug: 'V1', name: 'KPI Evi', activatedOn: '2026-01-01', isActive: true }
    };
    kpiVeri.bookings = [{
      id: 'kpi-b1', villa: 'V1', propertyId: 'p1', checkIn: '2026-09-01', checkOut: '2026-09-11',
      nights: 10, gross: 100000, cleaningFee: 10000, otaCommission: 10000, discount: 0,
      status: 'CONFIRMED'
    }];
    kpiVeri.expenses = [
      { id: 'kpi-o', date: '2026-09-05', amount: 20000, type: 'OPEX', villa: 'ALL', category: 'Enerji' },
      { id: 'kpi-c', date: '2026-09-06', amount: 15000, type: 'CAPEX', villa: 'ALL', category: 'Yatırım' }
    ];
    app.setAppData(kpiVeri);
    app.setActiveTenantForTests(null);
    app.setCurrentFilter({ period: '2026-09', villa: 'ALL', startDate: null, endDate: null });
    app.renderExecutiveControlCenter();

    const get = id => global.document.getElementById(id).innerText;
    check(get('execKpiRevenue') === '₺100.000'
      && get('execKpiOpex') === '₺30.000'
      && get('execKpiCapex') === '₺15.000'
      && get('execKpiOperatingProfit') === '₺70.000'
      && get('execKpiProfit') === '₺55.000',
    '26. Anasayfa ciro, OPEX, CAPEX, faaliyet kari ve net nakit karini birlikte gosteriyor',
    JSON.stringify({ revenue: get('execKpiRevenue'), opex: get('execKpiOpex'), capex: get('execKpiCapex'),
      operatingProfit: get('execKpiOperatingProfit'), netProfit: get('execKpiProfit') }));
    check(get('execKpiOccupancy') === '%33.33' && get('execSoldNightsLabel') === '10 / 30 Gece'
      && get('execKpiAdr') === '₺9.000' && get('execKpiRevpar') === '₺3.000',
    '27. Doluluk, satilan/kullanilabilir gece, ADR ve RevPAR ayni filtreyle entegre',
    JSON.stringify({ occupancy: get('execKpiOccupancy'), nights: get('execSoldNightsLabel'),
      adr: get('execKpiAdr'), revpar: get('execKpiRevpar') }));
  } catch (e) {
    no('26-27. Phase 38 anasayfa KPI render testi', hataOzeti(e));
  }

  // L-67: Takvim boş işletmede sahte villa üretmemeli; dolu işletmede de
  // yalnızca müşterinin kendi, birbirinden farklı anahtarlarını çizmelidir.
  try {
    check(typeof app.renderTapeChart === 'function',
      '28. Doluluk takvimi gerçek render testi için dışa aktarılmış',
      'renderTapeChart export edilmemiş; boş ve çok mülklü senaryo doğrulanamıyor');

    if (typeof app.renderTapeChart === 'function') {
      domKur();
      app.setAppData(bosVeri());
      app.renderTapeChart();
      const bosTakvim = global.document.getElementById('tapeChartContainer').innerHTML;
      check(/Henüz gerçek mülk/.test(bosTakvim)
        && !/BELLA|OLIVE|AZURE|SUNSET|PALM/.test(bosTakvim),
      '29. Boş işletme takvimi nedenini gösteriyor, sahte mülk göstermiyor',
      bosTakvim.slice(0, 500));

      domKur();
      const ikiMulk = bosVeri();
      ikiMulk.villas = {
        KAYIK_EVI: { id: 'property-a', slug: 'KAYIK_EVI', name: 'Kayık Evi' },
        ORMAN_KULUBESI: { id: 'property-b', slug: 'ORMAN_KULUBESI', name: 'Orman Kulübesi' }
      };
      app.setAppData(ikiMulk);
      app.renderTapeChart();
      const ikiMulkTakvimi = global.document.getElementById('tapeChartContainer').innerHTML;
      check(ikiMulkTakvimi.includes('Kayık Evi') && ikiMulkTakvimi.includes('Orman Kulübesi')
        && !/BELLA|OLIVE|AZURE|SUNSET|PALM/.test(ikiMulkTakvimi),
      '30. Takvim iki farklı gerçek mülk anahtarını birbirine karıştırmadan çiziyor',
      ikiMulkTakvimi.slice(0, 800));
    }
  } catch (e) {
    no('28-30. L-67 takvim render senaryoları', hataOzeti(e));
  }

  // L-68: Raporlar ilk musterinin sabit rakamlarini gostermemeli. Bos hesapta
  // neden belirtilmeli; iki farkli anahtar kullanan iki kiracinin raporu da
  // yalnizca kendi kayitlarindan uretilmelidir.
  try {
    check(typeof app.renderReportsTab === 'function',
      '31. Raporlar gerçek render testi için dışa aktarılmış',
      'renderReportsTab export edilmemiş');
    if (typeof app.renderReportsTab === 'function') {
      domKur();
      app.setAppData(bosVeri());
      app.setCurrentFilter({ period: '2026-09', villa: 'ALL', startDate: null, endDate: null });
      app.renderReportsTab();
      const bosRapor = global.document.getElementById('reportsContentContainer').innerHTML;
      check(/rezervasyon kaydı yok|hesaplanamadı/i.test(bosRapor)
        && !/483[.]965|251[.]661|142[.]793/.test(bosRapor),
      '32. Boş işletme raporu açıklamalı boş durum gösteriyor', bosRapor.slice(0, 900));

      const kiraciA = bosVeri();
      kiraciA.villas = { KIYI_01: { id: 'pa', slug: 'KIYI_01', name: 'Kıyı Evi' } };
      kiraciA.bookings = [{ id: 'ba', villa: 'KIYI_01', propertyId: 'pa', checkIn: '2026-09-01',
        checkOut: '2026-09-03', nights: 2, gross: 11000, otaCommission: 1100,
        channel: 'AIRBNB', status: 'CONFIRMED', pax: 2 }];
      domKur(); app.setAppData(kiraciA); app.setCurrentFilter({ period: '2026-09', villa: 'ALL', startDate: null, endDate: null });
      app.renderReportsTab();
      const raporA = global.document.getElementById('reportsContentContainer').innerHTML;

      const kiraciB = bosVeri();
      kiraciB.villas = { DAG_99: { id: 'pb', slug: 'DAG_99', name: 'Dağ Evi' } };
      kiraciB.bookings = [{ id: 'bb', villa: 'DAG_99', propertyId: 'pb', checkIn: '2026-09-05',
        checkOut: '2026-09-08', nights: 3, gross: 27000, otaCommission: 0,
        channel: 'WHATSAPP', status: 'CONFIRMED', pax: 4 }];
      domKur(); app.setAppData(kiraciB); app.setCurrentFilter({ period: '2026-09', villa: 'ALL', startDate: null, endDate: null });
      app.renderReportsTab();
      const raporB = global.document.getElementById('reportsContentContainer').innerHTML;
      check(/11[.]000/.test(raporA) && !/27[.]000|DAG_99/.test(raporA)
        && /27[.]000/.test(raporB) && !/11[.]000|KIYI_01/.test(raporB),
      '33. İki kiracının rapor rakamları birbirine sızmıyor',
      'A: ' + raporA.slice(0, 500) + '\n       B: ' + raporB.slice(0, 500));
    }

    check(typeof app.renderCoverAbTestLab === 'function',
      '34. A/B laboratuvarı gerçek mülk anahtarıyla test edilebilir',
      'renderCoverAbTestLab export edilmemiş');
    check(typeof app.renderPricingTab === 'function',
      '35. Fiyatlandırma boş durumu gerçek render testi için dışa aktarılmış',
      'renderPricingTab export edilmemiş');
    if (typeof app.renderPricingTab === 'function') {
      domKur(); app.setAppData(bosVeri()); app.renderPricingTab();
      const bosFiyat = global.document.getElementById('pricingManagerContainer').innerHTML;
      check(/hesaplanamadı|mülk kaydı yok/i.test(bosFiyat) && !/Kritik boş gece penceresi bulunmuyor/.test(bosFiyat),
        '36. Boş işletmede fiyatlandırma başarı iddiası değil veri eksikliği gösteriyor', bosFiyat.slice(0, 700));
    }
    check(typeof app.renderGapNights === 'function' && typeof app.renderOtaRadar === 'function',
      '37. Kanal ve boş gece yüzeyleri gerçek render testi için dışa aktarılmış',
      'renderGapNights/renderOtaRadar export edilmemiş');
    if (typeof app.renderGapNights === 'function' && typeof app.renderOtaRadar === 'function') {
      domKur(); app.setAppData(bosVeri());
      app.renderGapNights(); app.renderOtaRadar();
      const gapText = global.document.getElementById('gapNightGrid').innerHTML;
      const channelText = global.document.getElementById('channelProfitabilityTableBody').innerHTML;
      const directValue = global.document.getElementById('otaSavedCommission').innerText;
      check(/hesaplanamadı/i.test(gapText) && !/Optimum|dengeli dağıldı/i.test(gapText)
        && /rezervasyon kaydı yok/i.test(channelText) && directValue === '—',
      '38. Boş işletmede kanal ve takvim başarı/tasarruf uydurmuyor',
      `gap=${gapText.slice(0, 350)} channel=${channelText.slice(0, 350)} direct=${directValue}`);
    }
  } catch (e) {
    no('31-38. L-68 görünür rapor render senaryoları', hataOzeti(e));
  }

  // showToast gercekten bir sey yaziyor mu?
  try {
    domKur();
    app.showToast('deneme mesajı', 'success');
    const kap = global.document.getElementById('lexToastWrap');
    check(kap && kap.children.length === 1 && kap.children[0].textContent === 'deneme mesajı',
      '12. showToast ekrana gerçekten bir bildirim ekler',
      'kapsayıcı: ' + (kap ? kap.children.length + ' çocuk' : 'yok'));
  } catch (e) {
    no('12. showToast ekrana gerçekten bir bildirim ekler', hataOzeti(e));
  }

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================\n');
  if (failed > 0) process.exit(1);
}

run();
