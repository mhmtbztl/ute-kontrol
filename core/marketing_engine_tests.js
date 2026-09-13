const assert = require('assert');
const {
  CANONICAL_CHANNELS,
  normalizeChannel,
  computeChannelEconomics,
  computeBookingCohortMetrics
} = require('./marketing_engine');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests += 1;
  try {
    fn();
    passedTests += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${error.stack || error.message}`);
  }
}

runTest('Canonical channel vocabulary is explicit and includes UNKNOWN', () => {
  assert.deepStrictEqual(CANONICAL_CHANNELS, ['AIRBNB', 'BOOKING_COM', 'VRBO', 'EXPEDIA', 'DIRECT', 'OTHER_OTA', 'UNKNOWN']);
});

runTest('Booking.com aliases normalize without losing the raw value', () => {
  assert.deepStrictEqual(normalizeChannel('Booking.com'), {
    rawChannel: 'Booking.com', canonicalChannel: 'BOOKING_COM', directSubchannel: null, mappingStatus: 'MAPPED'
  });
});

runTest('WhatsApp is a direct subchannel', () => {
  const result = normalizeChannel('WhatsApp');
  assert.strictEqual(result.canonicalChannel, 'DIRECT');
  assert.strictEqual(result.directSubchannel, 'WHATSAPP');
});

runTest('Unknown values never silently default to DIRECT', () => {
  const result = normalizeChannel('Local Travel Agent');
  assert.strictEqual(result.canonicalChannel, 'UNKNOWN');
  assert.strictEqual(result.mappingStatus, 'UNMAPPED');
});

runTest('Room revenue follows the financial service and commission is separate', () => {
  const result = computeChannelEconomics({
    bookings: [{ id: 'B1', propertyId: 'P1', channel: 'AIRBNB', checkIn: '2026-09-01', checkOut: '2026-09-03', grossAmount: 22000, cleaningFee: 2000, discount: 1000, otaCommission: 3000, status: 'CONFIRMED', currency: 'TRY' }],
    propertyId: 'P1', periodStart: '2026-09-01', periodEndExclusive: '2026-10-01'
  });
  assert.strictEqual(result.totals.bookingRevenueAfterDiscount, 21000);
  assert.strictEqual(result.totals.roomRevenueBeforeDistribution, 19000);
  assert.strictEqual(result.totals.distributionCost, 3000);
  assert.strictEqual(result.totals.roomRevenueAfterDistribution, 16000);
  assert.strictEqual(result.totals.roomAdr, 9500);
  assert.strictEqual(result.totals.netRoomAdr, 8000);
});

runTest('Split-month bookings accrue only nights inside the requested period', () => {
  const result = computeChannelEconomics({
    bookings: [{ id: 'B1', channel: 'Direct', checkIn: '2026-09-29', checkOut: '2026-10-03', grossAmount: 40000, cleaningFee: 4000, otaCommission: 0, status: 'CONFIRMED' }],
    periodStart: '2026-09-01', periodEndExclusive: '2026-10-01'
  });
  assert.strictEqual(result.totals.bookedNights, 2);
  assert.strictEqual(result.totals.roomRevenueBeforeDistribution, 18000);
  assert.strictEqual(result.totals.cleaningRevenue, 2000);
});

runTest('Supabase snake_case booking dates are supported', () => {
  const result = computeChannelEconomics({
    bookings: [{ id: 'DB-1', channel: 'BOOKING', check_in: '2026-09-10', check_out: '2026-09-12', gross_amount: 12000, cleaning_fee: 1000, ota_commission: 2000, status: 'CHECKED_OUT' }]
  });
  assert.strictEqual(result.totals.bookedNights, 2);
  assert.strictEqual(result.totals.roomRevenueBeforeDistribution, 11000);
  assert.strictEqual(result.totals.roomRevenueAfterDistribution, 9000);
});

runTest('Cancelled bookings are excluded and reported', () => {
  const result = computeChannelEconomics({ bookings: [{ id: 'C1', channel: 'AIRBNB', checkIn: '2026-09-01', checkOut: '2026-09-03', grossAmount: 20000, status: 'CANCELLED' }] });
  assert.strictEqual(result.totals.reservationCount, 0);
  assert.strictEqual(result.dataQuality.excludedCancelledReservations, 1);
});

runTest('ADR is null when there are no sold nights', () => {
  const result = computeChannelEconomics({ bookings: [] });
  assert.strictEqual(result.totals.roomAdr, null);
  assert.strictEqual(result.totals.netRoomAdr, null);
  assert.strictEqual(result.mix.directReservationSharePercent, null);
});

runTest('Channel RevPAR remains unavailable without channel inventory', () => {
  const result = computeChannelEconomics({ bookings: [{ id: 'B1', channel: 'AIRBNB', checkIn: '2026-09-01', checkOut: '2026-09-02', grossAmount: 10000, status: 'CONFIRMED' }], availableNights: 30 });
  assert.strictEqual(result.totals.roomRevPar, 333.33);
  assert.strictEqual(result.channels[0].roomRevPar, null);
});

runTest('Channel RevPAR is calculated only with explicit channel inventory', () => {
  const result = computeChannelEconomics({ bookings: [{ id: 'B1', channel: 'AIRBNB', checkIn: '2026-09-01', checkOut: '2026-09-03', grossAmount: 20000, status: 'CONFIRMED' }], channelAvailableNights: { AIRBNB: 20 } });
  assert.strictEqual(result.channels[0].roomRevPar, 1000);
});

runTest('Explicit mixed currencies fail instead of being silently summed', () => {
  assert.throws(() => computeChannelEconomics({ baseCurrency: 'TRY', bookings: [{ id: 'EUR-1', currency: 'EUR', channel: 'AIRBNB', checkIn: '2026-09-01', checkOut: '2026-09-02', grossAmount: 100 }] }), /MIXED_CURRENCY_NOT_SUPPORTED/);
});

runTest('Out-of-period currency does not block the requested report', () => {
  const result = computeChannelEconomics({
    baseCurrency: 'TRY', periodStart: '2026-09-01', periodEndExclusive: '2026-10-01',
    bookings: [{ id: 'OLD-EUR', currency: 'EUR', channel: 'AIRBNB', checkIn: '2026-08-01', checkOut: '2026-08-02', grossAmount: 100 }]
  });
  assert.strictEqual(result.totals.reservationCount, 0);
  assert.strictEqual(result.dataQuality.excludedOutsidePeriodReservations, 1);
});

runTest('Property scope excludes cancellation counts from other properties', () => {
  const result = computeChannelEconomics({
    propertyId: 'P1',
    bookings: [{ id: 'C2', propertyId: 'P2', channel: 'AIRBNB', checkIn: '2026-09-01', checkOut: '2026-09-02', grossAmount: 1000, status: 'CANCELLED' }]
  });
  assert.strictEqual(result.dataQuality.excludedCancelledReservations, 0);
});

runTest('Unknown channels produce a visible data-quality warning', () => {
  const result = computeChannelEconomics({ bookings: [{ id: 'B1', channel: 'Agency X', checkIn: '2026-09-01', checkOut: '2026-09-02', grossAmount: 10000, status: 'CONFIRMED' }] });
  assert.strictEqual(result.channels[0].channel, 'UNKNOWN');
  assert.strictEqual(result.dataQuality.status, 'NEEDS_REVIEW');
  assert.deepStrictEqual(result.dataQuality.unknownRawChannels, ['Agency X']);
});

runTest('Channel totals reconcile to portfolio totals', () => {
  const result = computeChannelEconomics({ bookings: [
    { id: 'A', channel: 'AIRBNB', checkIn: '2026-09-01', checkOut: '2026-09-03', grossAmount: 20000, otaCommission: 3000 },
    { id: 'D', channel: 'WHATSAPP', checkIn: '2026-09-05', checkOut: '2026-09-08', grossAmount: 24000, otaCommission: 0 }
  ] });
  assert.strictEqual(result.channels.reduce((sum, row) => sum + row.roomRevenueAfterDistribution, 0), result.totals.roomRevenueAfterDistribution);
  assert.strictEqual(result.channels.reduce((sum, row) => sum + row.bookedNights, 0), result.totals.bookedNights);
  assert.strictEqual(result.mix.directReservationSharePercent, 50);
});

runTest('Invalid reporting periods are rejected', () => {
  assert.throws(() => computeChannelEconomics({ bookings: [], periodStart: '2026-10-01', periodEndExclusive: '2026-10-01' }), /INVALID_PERIOD/);
});

runTest('Booking cohort uses created_at rather than stay month', () => {
  const result = computeBookingCohortMetrics({
    cohortStart: '2026-09-01T00:00:00Z', cohortEndExclusive: '2026-10-01T00:00:00Z',
    bookings: [{ id: 'B1', channel: 'AIRBNB', created_at: '2026-09-10T12:00:00Z', check_in: '2026-12-01', check_out: '2026-12-05', status: 'CONFIRMED' }]
  });
  assert.strictEqual(result.totals.createdReservations, 1);
  assert.strictEqual(result.totals.averageLeadTimeDays, 82);
  assert.strictEqual(result.totals.averageLengthOfStay, 4);
});

runTest('Cancellation rate is calculated inside the booking-created cohort', () => {
  const result = computeBookingCohortMetrics({
    cohortStart: '2026-09-01', cohortEndExclusive: '2026-10-01',
    bookings: [
      { id: 'B1', channel: 'Booking.com', created_at: '2026-09-02', check_in: '2026-10-01', check_out: '2026-10-03', status: 'CONFIRMED' },
      { id: 'B2', channel: 'Booking.com', created_at: '2026-09-03', check_in: '2026-10-05', check_out: '2026-10-08', status: 'CANCELLED' }
    ]
  });
  assert.strictEqual(result.totals.createdReservations, 2);
  assert.strictEqual(result.totals.cancelledReservations, 1);
  assert.strictEqual(result.totals.cancellationRatePercent, 50);
  assert.strictEqual(result.totals.lengthOfStaySampleSize, 1);
});

runTest('Missing creation timestamps are excluded rather than assigned to a cohort', () => {
  const result = computeBookingCohortMetrics({
    bookings: [{ id: 'B1', channel: 'DIRECT', check_in: '2026-09-01', check_out: '2026-09-03', status: 'CONFIRMED' }]
  });
  assert.strictEqual(result.totals.createdReservations, 0);
  assert.strictEqual(result.dataQuality.missingCreatedAtReservations, 1);
  assert.strictEqual(result.dataQuality.status, 'NEEDS_REVIEW');
});

runTest('Invalid negative lead time is excluded and reported', () => {
  const result = computeBookingCohortMetrics({
    bookings: [{ id: 'B1', channel: 'DIRECT', created_at: '2026-09-10T18:00:00Z', check_in: '2026-09-09', check_out: '2026-09-12', status: 'CONFIRMED' }]
  });
  assert.strictEqual(result.totals.averageLeadTimeDays, null);
  assert.strictEqual(result.dataQuality.invalidLeadTimeReservations, 1);
});

runTest('Booking cohort respects property scope', () => {
  const result = computeBookingCohortMetrics({
    propertyId: 'P1',
    bookings: [
      { id: 'A', property_id: 'P1', channel: 'AIRBNB', created_at: '2026-09-01', check_in: '2026-09-10', check_out: '2026-09-12', status: 'CONFIRMED' },
      { id: 'B', property_id: 'P2', channel: 'AIRBNB', created_at: '2026-09-01', check_in: '2026-09-10', check_out: '2026-09-12', status: 'CONFIRMED' }
    ]
  });
  assert.strictEqual(result.totals.createdReservations, 1);
});

console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
if (passedTests !== totalTests) process.exit(1);
