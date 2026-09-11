// =============================================================================
// LEXBNB PHASE 11 — GAP NIGHT & ORPHAN GAP TEST SUITE
// 1-night & 2-night gap detection, orphan gap relaxation, bounded slot checking,
// buffer recompute window, and pricing engine integration.
// =============================================================================

const assert = require('assert');
const { getAffectedRecomputeWindow, detectGapNights } = require('./gap_night_service.js');
const PricingEngine = require('./pricing_engine.js');

console.log('=============================================================================');
console.log('⚡ LEXBNB PHASE 11 — GAP NIGHT & ORPHAN GAP TEST SUITE');
console.log('=============================================================================');

function runGapNightTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  // TEST 1: Buffer Recompute Window Calculation
  console.log('\n--- TEST 1: Buffer Recompute Window ---');
  const sampleBooking = {
    check_in: '2026-09-10',
    check_out: '2026-09-15'
  };
  const window3 = getAffectedRecomputeWindow(sampleBooking, 3);
  assert.strictEqual(window3.startDate, '2026-09-07');
  assert.strictEqual(window3.endDate, '2026-09-18');
  recordPass('1. (Correction 9) getAffectedRecomputeWindow calculates exact 3-day buffer around booking');

  // TEST 2: 1-Night Gap Detection Between Bookings
  console.log('\n--- TEST 2: 1-Night Gap Detection ---');
  // Booking A: 2026-09-01 -> 2026-09-03 (checkout Sep 3)
  // Booking B: 2026-09-04 -> 2026-09-07 (checkin Sep 4)
  // Gap Night: 2026-09-03 (1 night)
  const bookings = [
    { property_id: 'p1', check_in: '2026-09-01', check_out: '2026-09-03', status: 'CONFIRMED' },
    { property_id: 'p1', check_in: '2026-09-04', check_out: '2026-09-07', status: 'CONFIRMED' }
  ];

  const gapMap = detectGapNights({
    propertyId: 'p1',
    bookings,
    startDate: '2026-09-01',
    endDate: '2026-09-07',
    defaultMinStay: 2
  });

  const sep3 = gapMap.get('2026-09-03');
  assert.ok(sep3, '2026-09-03 must be in gap map');
  assert.strictEqual(sep3.isGapNight, true);
  assert.strictEqual(sep3.gapLength, 1);
  assert.strictEqual(sep3.isOrphanGap, true, '1-night gap is orphan when defaultMinStay is 2');
  assert.strictEqual(sep3.relaxedMinStay, 1, 'minStay relaxed to 1 night for orphan gap');
  recordPass('2. (Correction 10) 1-night gap correctly detected and minStay relaxed from 2 to 1');

  // TEST 3: 2-Night Gap Detection
  console.log('\n--- TEST 3: 2-Night Gap Detection ---');
  // Booking C: 2026-09-10 -> 2026-09-12 (checkout Sep 12)
  // Booking D: 2026-09-14 -> 2026-09-17 (checkin Sep 14)
  // Gap Nights: 2026-09-12, 2026-09-13 (2 nights)
  const bookings2 = [
    { property_id: 'p1', check_in: '2026-09-10', check_out: '2026-09-12', status: 'CONFIRMED' },
    { property_id: 'p1', check_in: '2026-09-14', check_out: '2026-09-17', status: 'CONFIRMED' }
  ];
  const gapMap2 = detectGapNights({
    propertyId: 'p1',
    bookings: bookings2,
    startDate: '2026-09-10',
    endDate: '2026-09-17',
    defaultMinStay: 2
  });
  const sep12 = gapMap2.get('2026-09-12');
  const sep13 = gapMap2.get('2026-09-13');
  assert.strictEqual(sep12.isGapNight, true);
  assert.strictEqual(sep12.gapLength, 2);
  assert.strictEqual(sep12.isOrphanGap, false, '2-night gap is NOT orphan when defaultMinStay is 2');
  assert.strictEqual(sep12.relaxedMinStay, 2);
  assert.strictEqual(sep13.isGapNight, true);
  recordPass('3. (Correction 10) 2-night gap correctly detected with isGapNight = true');

  // TEST 4: Orphan Gap when defaultMinStay is 3
  console.log('\n--- TEST 4: Orphan Gap with 3-Night MinStay ---');
  const gapMapOrphan3 = detectGapNights({
    propertyId: 'p1',
    bookings: bookings2,
    startDate: '2026-09-10',
    endDate: '2026-09-17',
    defaultMinStay: 3 // Default is 3 nights, but gap is 2 nights!
  });
  const sep12Orphan = gapMapOrphan3.get('2026-09-12');
  assert.strictEqual(sep12Orphan.isOrphanGap, true, '2-night gap is orphan when defaultMinStay is 3');
  assert.strictEqual(sep12Orphan.relaxedMinStay, 2, 'Relaxed min stay to 2 nights');
  recordPass('4. (Correction 11) Orphan gap detected when gap length (2) < defaultMinStay (3), relaxing minStay to 2');

  // TEST 5: Unbounded Vacant Nights (Not Gap Nights)
  console.log('\n--- TEST 5: Unbounded Vacant Nights ---');
  // Only Booking A at start of month; end of month is completely open
  const gapMapUnbounded = detectGapNights({
    propertyId: 'p1',
    bookings: [bookings[0]],
    startDate: '2026-09-01',
    endDate: '2026-09-10',
    defaultMinStay: 2
  });
  // Sep 5 is vacant, but no subsequent booking -> unbounded
  const sep5 = gapMapUnbounded.get('2026-09-05');
  assert.strictEqual(sep5.isGapNight, false, 'Unbounded open calendar is not a gap night');
  assert.strictEqual(sep5.relaxedMinStay, 2);
  recordPass('5. Open calendar dates without a succeeding booking are not treated as gap nights');

  // TEST 6: Gap Bounded by Maintenance Block
  console.log('\n--- TEST 6: Gap Bounded by Maintenance Block ---');
  const maintBlocks = [
    { property_id: 'p1', start_date: '2026-09-05', end_date: '2026-09-06', status: 'ACTIVE' }
  ];
  // Booking A: Sep 1-3. Maint Block: Sep 5-6. Sep 3 and Sep 4 are bounded by booking and maintenance!
  const gapMapMaint = detectGapNights({
    propertyId: 'p1',
    bookings: [bookings[0]],
    blocks: maintBlocks,
    startDate: '2026-09-01',
    endDate: '2026-09-06',
    defaultMinStay: 2
  });
  const sep3Maint = gapMapMaint.get('2026-09-03');
  assert.strictEqual(sep3Maint.isGapNight, true, 'Gap bounded between booking and maintenance block');
  recordPass('6. Gap bounded by maintenance block correctly flagged as gap night');

  // TEST 7: Pricing Engine Integration with Gap Night Rule
  console.log('\n--- TEST 7: Pricing Engine Integration ---');
  const gapRule = {
    id: 'rule-gap-discount',
    name: 'Gap Night 15% Incentive',
    rule_type: 'GAP_NIGHT',
    priority: 30,
    multiplier: 0.85, // -15%
    is_active: true
  };
  const resEngineGap = PricingEngine.calculateDailyPrice({
    property: { id: 'p1', base_price: 2000, min_price: 1000, max_price: 5000 },
    date: '2026-09-03',
    isGapNight: true,
    rules: [gapRule]
  });
  // 2000 * 0.85 = 1700
  assert.strictEqual(resEngineGap.finalRate, 1700);
  assert.ok(resEngineGap.rulesApplied.includes('Gap Night 15% Incentive'));
  recordPass('7. PricingEngine applies 15% gap night incentive discount specifically when isGapNight is true');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runGapNightTests();
