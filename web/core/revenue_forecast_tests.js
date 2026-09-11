// =============================================================================
// LEXBNB PHASE 11 — REVENUE FORECAST & PACING TEST SUITE
// Rolling Pickup Tracking, Same Lead-Time Pacing, Deterministic Forecast Formula,
// Transparent Assumptions, and Explainable Pricing Insights.
// =============================================================================

const assert = require('assert');
const RevenueForecastService = require('./revenue_forecast_service.js');

console.log('=============================================================================');
console.log('⚡ LEXBNB PHASE 11 — REVENUE FORECAST & PACING TEST SUITE');
console.log('=============================================================================');

function runRevenueForecastTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  const sampleProperty = {
    id: 'prop-forecast-1',
    name: 'Villa Horizon',
    base_price: 3000,
    min_price: 2000,
    max_price: 8000
  };

  const sampleProfile = {
    property_id: 'prop-forecast-1',
    weekday_base_rate: 3000,
    weekend_base_rate: 3500,
    minimum_rate: 2000,
    maximum_rate: 8000
  };

  // TEST 1: Rolling Pickup Metrics Calculation
  console.log('\n--- TEST 1: Rolling Pickup Metrics ---');
  // As-of date: 2026-06-15. Lookback: 7 days (created between 2026-06-08 and 2026-06-15)
  // Target month: "2026-07"
  const sampleBookings = [
    // Booking 1: Created on 2026-06-10 (inside window) for July 1-5 (4 nights, 12000 TL)
    {
      id: 'b-pickup-1',
      property_id: 'prop-forecast-1',
      created_at: '2026-06-10T12:00:00Z',
      check_in: '2026-07-01',
      check_out: '2026-07-05',
      gross_amount: 12000,
      status: 'CONFIRMED'
    },
    // Booking 2: Created on 2026-05-20 (outside 7-day window) for July 10-15 (5 nights, 15000 TL)
    {
      id: 'b-pickup-2',
      property_id: 'prop-forecast-1',
      created_at: '2026-05-20T10:00:00Z',
      check_in: '2026-07-10',
      check_out: '2026-07-15',
      gross_amount: 15000,
      status: 'CONFIRMED'
    },
    // Booking 3: Created on 2026-06-12 (inside window) but CANCELLED
    {
      id: 'b-pickup-3',
      property_id: 'prop-forecast-1',
      created_at: '2026-06-12T14:00:00Z',
      check_in: '2026-07-20',
      check_out: '2026-07-25',
      gross_amount: 15000,
      status: 'CANCELLED'
    }
  ];

  const pickup = RevenueForecastService.computePickupMetrics({
    bookings: sampleBookings,
    propertyId: 'prop-forecast-1',
    targetMonth: '2026-07',
    lookbackDays: 7,
    asOfDate: '2026-06-15'
  });

  assert.strictEqual(pickup.pickupBookingsCount, 1);
  assert.strictEqual(pickup.pickupRoomNights, 4);
  assert.strictEqual(pickup.pickupRevenue, 12000);
  recordPass('1. (Correction 18) Rolling 7-day pickup accurately captures 1 new booking (4 nights, 12,000 TL)');

  // TEST 2: Same Lead-Time Pacing Comparison
  console.log('\n--- TEST 2: Same Lead-Time Pacing Metrics ---');
  // Current: 2 bookings in July totaling 9 nights and 27,000 TL
  const currentBookings = [
    sampleBookings[0], // 4 nights, 12000 TL
    sampleBookings[1]  // 5 nights, 15000 TL
  ];
  // Historical (last year at same lead time): 1 booking of 6 nights, 16000 TL
  const historicalBookings = [
    {
      id: 'b-hist-1',
      property_id: 'prop-forecast-1',
      check_in: '2025-07-01',
      check_out: '2025-07-07',
      gross_amount: 16000,
      status: 'CONFIRMED'
    }
  ];

  const pacing = RevenueForecastService.computePacingMetrics({
    currentBookings,
    historicalBookings,
    propertyId: 'prop-forecast-1',
    targetMonth: '2026-07',
    leadTimeDays: 30
  });

  assert.strictEqual(pacing.current.bookedNights, 9);
  assert.strictEqual(pacing.historical.bookedNights, 6);
  assert.strictEqual(pacing.comparison.nightsDiff, 3);
  assert.strictEqual(pacing.comparison.revenueDiff, 11000); // 27000 - 16000
  assert.strictEqual(pacing.comparison.status, 'AHEAD');
  recordPass('2. (Correction 19) Pacing comparison confirms property is AHEAD by +3 nights and +11,000 TL revenue');

  // TEST 3: Deterministic Revenue Forecast Formula
  console.log('\n--- TEST 3: Deterministic Revenue Forecast ---');
  // Month: July 2026 (31 nights)
  // Booked nights: 9 nights (from currentBookings)
  // Booked revenue: 27000 TL
  // Remaining nights: 31 - 9 = 22 nights
  // Expected sell-through: 0.50 (50%)
  // Avg recommended rate for remaining nights: weekday 3000, weekend 3500 (~3142.86)
  const forecast = RevenueForecastService.generateRevenueForecast({
    property: sampleProperty,
    profile: sampleProfile,
    targetMonth: '2026-07',
    bookings: currentBookings,
    expectedSellThrough: 0.50
  });

  assert.strictEqual(forecast.totalNights, 31);
  assert.strictEqual(forecast.bookedNights, 9);
  assert.strictEqual(forecast.remainingNights, 22);
  assert.strictEqual(forecast.bookedRevenue, 27000);
  assert.ok(forecast.avgRecommendedRate >= 3000 && forecast.avgRecommendedRate <= 3500);

  // Expected formula: 27000 + (22 * 0.50 * avgRecommendedRate)
  const expectedRemainingRev = Math.round(22 * 0.50 * forecast.avgRecommendedRate * 100) / 100;
  assert.strictEqual(forecast.projectedRemainingRevenue, expectedRemainingRev);
  assert.strictEqual(forecast.forecastedTotalRevenue, Math.round((27000 + expectedRemainingRev) * 100) / 100);
  assert.ok(forecast.assumptions);
  assert.strictEqual(forecast.assumptions.formula, 'bookedRevenue + (remainingNights * expectedSellThrough * avgRecommendedRate)');
  recordPass('3. (Correction 20 & 21) Deterministic revenue forecast accurately follows Booked + (Remaining * SellThrough * AvgRate)');

  // TEST 4: High Occupancy Confidence Level
  console.log('\n--- TEST 4: High Occupancy Confidence ---');
  // Create bookings filling 25 out of 31 nights (> 80% occupancy)
  const highOccBookings = [
    { property_id: 'prop-forecast-1', check_in: '2026-07-01', check_out: '2026-07-26', gross_amount: 80000, status: 'CONFIRMED' }
  ];
  const highOccForecast = RevenueForecastService.generateRevenueForecast({
    property: sampleProperty,
    profile: sampleProfile,
    targetMonth: '2026-07',
    bookings: highOccBookings
  });
  assert.strictEqual(highOccForecast.confidence, 'HIGH');
  recordPass('4. (Correction 22) Forecast confidence heuristic assigns HIGH when month is already >= 70% booked');

  // TEST 5: Deterministic Pricing Insights
  console.log('\n--- TEST 5: Deterministic Pricing Insights ---');
  // Test Gap Night insight
  const insightsWithGaps = RevenueForecastService.generatePricingInsights({
    property: sampleProperty,
    gapNights: [{ date: '2026-07-06' }],
    asOfDate: '2026-07-01'
  });
  const gapInsight = insightsWithGaps.find(i => i.code === 'GAP_NIGHT_DETECTED');
  assert.ok(gapInsight, 'Must generate gap night insight');
  assert.strictEqual(gapInsight.type, 'ACTION');
  recordPass('5. (Correction 23) Generates ACTION insight when gap nights are detected');

  // Test Distressed Inventory insight (< 30% occupancy in next 7 days)
  const distressedInsights = RevenueForecastService.generatePricingInsights({
    property: sampleProperty,
    bookings: [], // 0 bookings in next 7 days
    asOfDate: '2026-07-01'
  });
  const distressedInsight = distressedInsights.find(i => i.code === 'DISTRESSED_INVENTORY_NEAR_TERM');
  assert.ok(distressedInsight, 'Must generate distressed inventory insight');
  assert.strictEqual(distressedInsight.type, 'RISK');
  recordPass('6. (Correction 23) Generates RISK insight when 7-day occupancy is critical (< 30%)');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runRevenueForecastTests();
