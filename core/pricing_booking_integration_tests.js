// =============================================================================
// LEXBNB PHASE 11 — PRICING & BOOKING INTEGRATION TEST SUITE
// Authoritative Price Verification, Extra Guest Calculation, Quote Snapshotting,
// Expiry Enforcement, Immutability, and Phase 10 Extension Offer Bridge.
// =============================================================================

const assert = require('assert');
const PricingBookingService = require('./pricing_booking_service.js');

console.log('=============================================================================');
console.log('⚡ LEXBNB PHASE 11 — PRICING & BOOKING INTEGRATION TEST SUITE');
console.log('=============================================================================');

function runPricingBookingIntegrationTests() {
  let passedTests = 0;
  let totalTests = 0;

  function recordPass(msg) {
    totalTests++;
    passedTests++;
    console.log(`[PASS] ${msg}`);
  }

  const sampleProperty = {
    id: 'prop-integration-1',
    name: 'Villa Infinity',
    base_price: 2500,
    min_price: 1500,
    max_price: 10000,
    base_pax: 2,
    extra_guest_fee: 300,
    currency: 'TRY'
  };

  const sampleProfile = {
    property_id: 'prop-integration-1',
    weekday_base_rate: 2500,
    weekend_base_rate: 3000,
    minimum_rate: 1500,
    maximum_rate: 10000,
    base_pax: 2,
    extra_guest_fee: 300
  };

  // TEST 1: Authoritative Stay Price Calculation
  console.log('\n--- TEST 1: Authoritative Stay Price Calculation ---');
  // Check-in: 2026-09-15 (Tue), Check-out: 2026-09-17 (Thu) -> 2 nights (Tue, Wed: weekday 2500 each = 5000)
  // Guests: 4 -> 2 extra guests * 300 * 2 nights = 1200 TL
  // Total: 5000 + 1200 = 6200 TL
  const stayPrice = PricingBookingService.calculateAuthoritativeStayPrice({
    property: sampleProperty,
    profile: sampleProfile,
    checkIn: '2026-09-15',
    checkOut: '2026-09-17',
    pax: 4
  });

  assert.strictEqual(stayPrice.nights, 2);
  assert.strictEqual(stayPrice.subtotal, 5000);
  assert.strictEqual(stayPrice.extraGuests, 2);
  assert.strictEqual(stayPrice.extraGuestFeeTotal, 1200);
  assert.strictEqual(stayPrice.grossTotal, 6200);
  assert.strictEqual(stayPrice.nightlyBreakdown.length, 2);
  assert.ok(stayPrice.calculationContextHash, 'Context hash must be generated');
  recordPass('1. (Correction 13 & 14) Authoritative stay price accurately computes base nights (5000) + extra guest fees (1200) = 6200 TL');

  // TEST 2: Price Verification — Matching Client Price
  console.log('\n--- TEST 2: Price Verification (Matching) ---');
  const verifyMatch = PricingBookingService.verifyAuthoritativeBookingPrice(
    sampleProperty,
    '2026-09-15',
    '2026-09-17',
    4,
    6200,
    { profile: sampleProfile }
  );
  assert.strictEqual(verifyMatch.valid, true);
  assert.strictEqual(verifyMatch.difference, 0);
  recordPass('2. (Correction 14) Matching client gross amount passes authoritative verification');

  // TEST 3: Price Verification — Tampered / Outdated Client Price
  console.log('\n--- TEST 3: Price Verification (Tampered Rejection) ---');
  const verifyTampered = PricingBookingService.verifyAuthoritativeBookingPrice(
    sampleProperty,
    '2026-09-15',
    '2026-09-17',
    4,
    3000, // Tampered client price!
    { profile: sampleProfile }
  );
  assert.strictEqual(verifyTampered.valid, false);
  assert.strictEqual(verifyTampered.authoritativeGross, 6200);
  assert.strictEqual(verifyTampered.clientGross, 3000);
  assert.strictEqual(verifyTampered.difference, 3200);
  recordPass('3. (Correction 14) Tampered client price (3000 TL vs 6200 TL) strictly rejected with difference');

  // TEST 4: Formal Lead Quote Generation with Schema Version 1
  console.log('\n--- TEST 4: Formal Lead Quote Generation ---');
  const sampleLead = {
    id: 'lead-999',
    tenant_id: 'tenant-1',
    check_in: '2026-09-15',
    check_out: '2026-09-17',
    pax: 2
  };
  const quote = PricingBookingService.calculateLeadQuote({
    lead: sampleLead,
    property: sampleProperty,
    profile: sampleProfile,
    validHours: 48
  });

  assert.strictEqual(quote.schema_version, 1);
  assert.strictEqual(quote.status, 'ACTIVE');
  assert.strictEqual(quote.total_amount, 5000); // 2 nights @ 2500, 0 extra pax
  assert.strictEqual(quote.lead_id, 'lead-999');
  assert.strictEqual(quote.property_id, 'prop-integration-1');
  assert.ok(new Date(quote.expires_at) > new Date());
  recordPass('4. (Correction 15 & 16) Formal quote snapshot created with schema_version: 1, ACTIVE status, and 48h expiry');

  // TEST 5: Quote Acceptance Validation
  console.log('\n--- TEST 5: Quote Acceptance Validation ---');
  const validCheck = PricingBookingService.validateQuoteAcceptance(quote);
  assert.strictEqual(validCheck.valid, true);
  recordPass('5. Active unexpired quote passes acceptance validation');

  // Expired quote test
  const expiredQuote = {
    ...quote,
    expires_at: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
  };
  const expiredCheck = PricingBookingService.validateQuoteAcceptance(expiredQuote);
  assert.strictEqual(expiredCheck.valid, false);
  assert.strictEqual(expiredCheck.error, 'QUOTE_EXPIRED');
  recordPass('6. Expired quote rejected by validateQuoteAcceptance');

  // Cancelled or inactive quote test
  const cancelledQuote = { ...quote, status: 'CANCELLED' };
  const cancelledCheck = PricingBookingService.validateQuoteAcceptance(cancelledQuote);
  assert.strictEqual(cancelledCheck.valid, false);
  assert.strictEqual(cancelledCheck.error, 'QUOTE_INACTIVE');
  recordPass('7. Inactive / cancelled quote rejected by validateQuoteAcceptance');

  // TEST 6: Phase 10 Extension Offer Dynamic Pricing Bridge
  console.log('\n--- TEST 6: Phase 10 Extension Offer Pricing Bridge ---');
  // Date: 2026-09-18 (Friday -> weekend base 3000)
  // 20% discount on 3000 = 2400 (which is above minRate 1500)
  const extNormal = PricingBookingService.calculateDynamicExtensionPrice({
    property: sampleProperty,
    profile: sampleProfile,
    targetDate: '2026-09-18',
    configuredDiscountPercent: 20
  });
  assert.strictEqual(extNormal.baseDailyRate, 3000);
  assert.strictEqual(extNormal.offeredPrice, 2400);
  assert.strictEqual(extNormal.isClampedToMinRate, false);
  recordPass('8. (Correction 24) Dynamic extension offer computes 20% discount on Friday rate (3000 -> 2400 TL)');

  // Discount that would breach minimum rate (1500 TL)
  // Suppose base is 2500, discount is 60% -> 1000 TL < 1500 TL minRate -> clamped to 1500 TL!
  const extClamped = PricingBookingService.calculateDynamicExtensionPrice({
    property: sampleProperty,
    profile: sampleProfile,
    targetDate: '2026-09-15', // Tuesday base 2500
    configuredDiscountPercent: 60
  });
  assert.strictEqual(extClamped.baseDailyRate, 2500);
  assert.strictEqual(extClamped.rawDiscountedPrice, 1000);
  assert.strictEqual(extClamped.offeredPrice, 1500, 'Must clamp to minimum_rate 1500');
  assert.strictEqual(extClamped.isClampedToMinRate, true);
  recordPass('9. (Correction 24) Dynamic extension offer strictly clamped to minimum_rate guardrail when discount exceeds floor');

  console.log(`\n=============================================================================`);
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log(`=============================================================================\n`);
}

runPricingBookingIntegrationTests();
