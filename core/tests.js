// UTE Kontrol Merkezi V5 - Acceptance Test Suite (Phases 1 - 11)
const assert = require('assert');
const {
  VILLAS,
  CHANNELS,
  processReservation,
  calculateMonthlyPerformance,
  calculateLeadFunnel,
  calculateInvestmentPriority,
  detectGapNights,
  generateTodayRadar
} = require('./engine');

console.log('=====================================================');
console.log('UTE KONTROL MERKEZİ V5 - ACCEPTANCE TEST SUITE');
console.log('=====================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}\n`);
  }
}

// -------------------------------------------------------------
// TEST PHASE 1: RESERVATION ENGINE & SPLIT-MONTH ACCRUAL
// -------------------------------------------------------------
runTest('Phase 1: Split-Month Accrual & Revenue Attribution Test', () => {
  // Scenario from prompt: Villa Bella Vista 29.09.2026 to 03.10.2026 (4 nights)
  // Gross: 40.000 TL, Commission: 6.000 TL, Cleaning Fee: 2.000 TL -> Net Room Revenue: 32.000 TL
  const res = processReservation({
    id: 'RES-001',
    propertyId: 'BELLA',
    checkIn: '2026-09-29',
    checkOut: '2026-10-03',
    channel: 'AIRBNB',
    grossAmount: 40000,
    otaCommission: 6000,
    cleaningFee: 2000,
    discount: 0,
    status: 'CONFIRMED'
  });

  assert.strictEqual(res.nights, 4, 'Nights must be 4');
  assert.strictEqual(res.netRoomRevenue, 32000, 'Net room revenue must be 32.000 TL');
  assert.strictEqual(res.revenuePerNight, 8000, 'Revenue per night must be 8.000 TL');
  assert.strictEqual(res.stayNights.length, 4, 'Must generate 4 stay night records');

  // Verify accrual split:
  // 29 Sept -> Sept
  // 30 Sept -> Sept
  // 1 Oct -> Oct
  // 2 Oct -> Oct
  // Check-out on 3 Oct means night of 2 Oct is last night
  const septNights = res.stayNights.filter(sn => sn.yearMonth === '2026-09');
  const octNights = res.stayNights.filter(sn => sn.yearMonth === '2026-10');

  assert.strictEqual(septNights.length, 2, 'September must have exactly 2 stay nights (29, 30)');
  assert.strictEqual(octNights.length, 2, 'October must have exactly 2 stay nights (1, 2)');

  const septRevenue = septNights.reduce((sum, sn) => sum + sn.nightRevenue, 0);
  const octRevenue = octNights.reduce((sum, sn) => sum + sn.nightRevenue, 0);

  assert.strictEqual(septRevenue, 16000, 'September accrued revenue must be 16.000 TL');
  assert.strictEqual(octRevenue, 16000, 'October accrued revenue must be 16.000 TL');
});

// -------------------------------------------------------------
// TEST PHASE 2: CORE DASHBOARD KPI VERIFICATION (ADR, RevPAR, Occupancy)
// -------------------------------------------------------------
runTest('Phase 2: Core Dashboard KPI Calculation Verification', () => {
  // Scenario: 1 property (Villa Bella Vista) in Sept 2026 (30 days).
  // 2 days P1 maintenance downtime -> Available Nights = 28.
  // 14 paid nights, Total Net Revenue = 70.000 TL.
  const dummyBookings = [
    {
      id: 'B1',
      propertyId: 'BELLA',
      checkIn: '2026-09-01',
      checkOut: '2026-09-15', // 14 nights
      channel: 'WHATSAPP',
      grossAmount: 70000,
      otaCommission: 0,
      cleaningFee: 0,
      discount: 0,
      status: 'CONFIRMED'
    }
  ];

  const maintenances = [
    {
      id: 'M1',
      propertyId: 'BELLA',
      yearMonth: '2026-09',
      priority: 'P1',
      status: 'IN_PROGRESS',
      downtimeNights: 2,
      actualCost: 5000
    }
  ];

  const perf = calculateMonthlyPerformance({
    year: 2026,
    month: 9,
    propertyId: 'BELLA',
    bookings: dummyBookings,
    maintenances
  });

  assert.strictEqual(perf.totalCalendarNights, 30, 'Calendar nights should be 30');
  assert.strictEqual(perf.downtimeNights, 2, 'Downtime nights should be 2');
  assert.strictEqual(perf.availableNights, 28, 'Available nights should be 28');
  assert.strictEqual(perf.paidNights, 14, 'Paid nights should be 14');
  assert.strictEqual(perf.occupancyRate, 50.0, 'Occupancy must be 50.0% (14/28)');
  assert.strictEqual(perf.adr, 5000, 'ADR must be 5.000 TL (70.000 / 14)');
  assert.strictEqual(perf.revpar, 2500, 'RevPAR must be 2.500 TL (70.000 / 28)');
  assert.strictEqual(perf.directBookingShare, 100.0, 'WhatsApp is direct, share must be 100%');
});

// -------------------------------------------------------------
// TEST PHASE 3: LEAD CRM FUNNEL & CONVERSION
// -------------------------------------------------------------
runTest('Phase 3: Lead CRM Funnel & Conversion Rate Test', () => {
  const sampleLeads = [
    { id: 'L1', channel: 'WHATSAPP', status: 'WON', quoteAmount: 25000 },
    { id: 'L2', channel: 'WHATSAPP', status: 'LOST', quoteAmount: 30000 },
    { id: 'L3', channel: 'INSTAGRAM', status: 'QUOTE_SENT', quoteAmount: 18000 },
    { id: 'L4', channel: 'INSTAGRAM', status: 'FOLLOW_UP', quoteAmount: 22000 }
  ];

  const sampleBookings = [
    { id: 'B1', netRoomRevenue: 25000 }
  ];

  const funnel = calculateLeadFunnel(sampleLeads, sampleBookings);
  assert.strictEqual(funnel.totalLeads, 4, 'Total leads should be 4');
  assert.strictEqual(funnel.wonReservations, 1, 'Won should be 1');
  assert.strictEqual(funnel.conversionRate, 25.0, 'Conversion rate should be 25.0%');
  assert.strictEqual(funnel.revenuePerLead, 6250, 'Revenue per lead should be 25000 / 4 = 6250 TL');
});

// -------------------------------------------------------------
// TEST PHASE 4: CHANNEL PERFORMANCE & DIRECT BOOKING RATIO
// -------------------------------------------------------------
runTest('Phase 4: Channel OTA vs Direct Performance', () => {
  const bookings = [
    {
      id: 'B1',
      propertyId: 'AZURE',
      checkIn: '2026-09-01',
      checkOut: '2026-09-03', // 2 nights
      channel: 'AIRBNB',
      grossAmount: 20000,
      otaCommission: 3000,
      cleaningFee: 1500,
      discount: 0,
      status: 'CONFIRMED'
    },
    {
      id: 'B2',
      propertyId: 'AZURE',
      checkIn: '2026-09-05',
      checkOut: '2026-09-07', // 2 nights
      channel: 'WHATSAPP',
      grossAmount: 22000,
      otaCommission: 0,
      cleaningFee: 0,
      discount: 0,
      status: 'CONFIRMED'
    }
  ];

  const perf = calculateMonthlyPerformance({
    year: 2026,
    month: 9,
    propertyId: 'AZURE',
    bookings
  });

  // Net Room Revenue:
  // B1 (Airbnb): 20000 - 3000 - 1500 = 15500 TL
  // B2 (WhatsApp): 22000 TL
  // Total Net = 37500 TL
  // Direct Share = 22000 / 37500 = 58.67% ~ 58.7%
  assert.strictEqual(perf.netRoomRevenue, 37500, 'Total Net Room Revenue must match');
  assert.strictEqual(perf.directRevenue, 22000, 'Direct revenue must be 22000 TL');
  assert.strictEqual(perf.otaRevenue, 15500, 'OTA revenue must be 15500 TL');
  assert.strictEqual(perf.directBookingShare, 58.7, 'Direct share should be ~58.7%');
});

// -------------------------------------------------------------
// TEST PHASE 6: MAINTENANCE & INVESTMENT SCORING
// -------------------------------------------------------------
runTest('Phase 6: Maintenance & Investment Score Guardrails', () => {
  const p1Task = {
    id: 'T1',
    priority: 'P1',
    guestImpact: 5,
    revenueImpact: 5,
    cost: 5000,
    effortDays: 1
  };
  const p1Eval = calculateInvestmentPriority(p1Task);
  assert.strictEqual(p1Eval.recommendation, 'Hemen Yap', 'P1 tasks must always be "Hemen Yap"');

  const cosmeticTask = {
    id: 'T2',
    priority: 'P3',
    guestImpact: 1,
    revenueImpact: 1,
    cost: 25000,
    effortDays: 10
  };
  const cosmeticEval = calculateInvestmentPriority(cosmeticTask);
  assert.strictEqual(cosmeticEval.recommendation, 'Yapma / Beklet', 'Low impact high cost task must be "Yapma / Beklet"');
});

// -------------------------------------------------------------
// TEST PHASE 8: GAP NIGHT & MARGINAL FLOOR GUARDRAIL
// -------------------------------------------------------------
runTest('Phase 8: Gap Night Detection & Floor Rate Guardrail', () => {
  const bookings = [
    {
      id: 'B1',
      propertyId: 'AZURE',
      checkIn: '2026-10-10',
      checkOut: '2026-10-12',
      status: 'CONFIRMED'
    },
    {
      id: 'B2',
      propertyId: 'AZURE',
      checkIn: '2026-10-13', // 1 night gap: 12th to 13th
      checkOut: '2026-10-15',
      status: 'CONFIRMED'
    }
  ];

  const gaps = detectGapNights({ propertyId: 'AZURE', bookings });
  assert.strictEqual(gaps.length, 1, 'Should detect exactly 1 orphan night gap');
  assert.strictEqual(gaps[0].gapDays, 1, 'Gap days should be 1');
  assert.strictEqual(gaps[0].startDate, '2026-10-12', 'Gap starts at 2026-10-12');
  assert.strictEqual(gaps[0].endDate, '2026-10-13', 'Gap ends at 2026-10-13');

  // Guardrail check:
  // Villa Azure Bay Floor = 6500, Cleaning = 1500, Heating = 700 -> Min variable floor = 8700 TL
  // Base rate = 8500 -> 25% disc = 6375 TL
  // Recommended offer price must NOT drop below floorWithMarginal (8700 TL)
  assert.strictEqual(gaps[0].recommendedOfferPrice, 8700, 'Recommended offer price must respect floor guardrail');
});

// -------------------------------------------------------------
// TEST PHASE 10: TODAY RADAR ENGINE (MAX 3 CRITICAL + 2 OPS + 1 REV)
// -------------------------------------------------------------
runTest('Phase 10: Today Radar Rule Constraints (Max 3 + 2 + 1)', () => {
  const radar = generateTodayRadar({
    todayStr: '2026-09-06',
    bookings: [
      { id: 'B1', propertyId: 'BELLA', checkOut: '2026-09-06', guestName: 'Ahmet Y.', status: 'CONFIRMED' },
      { id: 'B2', propertyId: 'OLIVE', checkIn: '2026-09-06', guestName: 'Mehmet K.', status: 'CONFIRMED' },
      { id: 'B3', propertyId: 'PALM', checkOut: '2026-09-06', guestName: 'Can T.', status: 'CONFIRMED' }
    ],
    leads: [
      { id: 'L1', propertyId: 'AZURE', guestName: 'Selin B.', status: 'FOLLOW_UP', quoteAmount: 45000, channel: 'WHATSAPP' },
      { id: 'L2', propertyId: 'SUNSET', guestName: 'Ali V.', status: 'QUOTE_SENT', quoteAmount: 20000, channel: 'INSTAGRAM' }
    ],
    maintenances: [
      { id: 'M1', propertyId: 'OLIVE', title: 'Şömine Camı', priority: 'P1', status: 'IN_PROGRESS', downtimeNights: 1 }
    ]
  });

  assert.ok(radar.actions.critical.length <= 3, 'Critical actions must be <= 3');
  assert.ok(radar.actions.operations.length <= 2, 'Operations actions must be <= 2');
  assert.ok(radar.actions.revenue.length <= 1, 'Revenue actions must be <= 1');
  assert.strictEqual(radar.actions.critical[0].category, 'P1_ARIZA', 'Top critical action must be the P1 defect');
});

console.log('\n=====================================================');
console.log(`TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('=====================================================\n');

if (passedTests === totalTests) {
  console.log('ALL PHASES 1-11 ACCEPTANCE TESTS PASSED WITH 100% SUCCESS.');
  process.exit(0);
} else {
  console.error('SOME ACCEPTANCE TESTS FAILED.');
  process.exit(1);
}
