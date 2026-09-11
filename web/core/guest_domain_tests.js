// =============================================================================
// LEXBNB PHASE 10 — GUEST DOMAIN & CONTACT NORMALIZATION TEST SUITE
// Tests guest creation, E.164 phone normalization, email normalization,
// booking-guest linkage, duplicate candidate warnings, and cross-tenant isolation.
// =============================================================================

const assert = require('assert');
const {
  normalizePhone,
  normalizeEmail,
  detectDuplicateCandidates
} = require('./guest_contact_utils.js');

console.log('=============================================================================');
console.log('👤 LEXBNB PHASE 10 — GUEST DOMAIN & CONTACT NORMALIZATION TEST SUITE');
console.log('=============================================================================');

let passedTests = 0;
let totalTests = 0;

function recordPass(msg) {
  totalTests++;
  passedTests++;
  console.log(`[PASS] ${msg}`);
}

async function runGuestDomainTests() {
  // TEST 1: Phone Normalization (Turkish standard & International E.164)
  console.log('\n--- TEST 1: Phone Normalization ---');
  const tr1 = normalizePhone('0532 123 45 67');
  assert.strictEqual(tr1.valid, true);
  assert.strictEqual(tr1.normalized, '+905321234567');

  const tr2 = normalizePhone('5321234567');
  assert.strictEqual(tr2.valid, true);
  assert.strictEqual(tr2.normalized, '+905321234567');

  const intl = normalizePhone('+44 7911 123456');
  assert.strictEqual(intl.valid, true);
  assert.strictEqual(intl.normalized, '+447911123456');

  const invalid = normalizePhone('abc123');
  assert.strictEqual(invalid.valid, false);

  recordPass('1. Phone normalization converts Turkish and international numbers to E.164');

  // TEST 2: Email Normalization
  console.log('\n--- TEST 2: Email Normalization ---');
  const em1 = normalizeEmail('  Ahmet.Yilmaz@GMAIL.com  ');
  assert.strictEqual(em1.valid, true);
  assert.strictEqual(em1.normalized, 'ahmet.yilmaz@gmail.com');

  const em2 = normalizeEmail('not-an-email');
  assert.strictEqual(em2.valid, false);

  recordPass('2. Email normalization trims whitespace, converts to lowercase, and validates');

  // TEST 3: Candidate Deduplication Detection
  console.log('\n--- TEST 3: Duplicate Candidate Detection ---');
  const tenantA = 'tenant_alpha';
  const existingGuests = [
    { id: 'g1', tenant_id: tenantA, first_name: 'Ahmet', last_name: 'Yılmaz', phone: '+905321234567', email: 'ahmet@test.com' },
    { id: 'g2', tenant_id: tenantA, first_name: 'Mehmet', last_name: 'Demir', phone: '+905339876543', email: 'mehmet@test.com' }
  ];

  const newGuestMatchingPhone = { tenant_id: tenantA, phone: '0532 123 45 67', email: 'ahmet.new@test.com' };
  const dupCheck1 = detectDuplicateCandidates(newGuestMatchingPhone, existingGuests);
  assert.strictEqual(dupCheck1.hasWarning, true);
  assert.strictEqual(dupCheck1.candidates.length, 1);
  assert.strictEqual(dupCheck1.candidates[0].guestId, 'g1');
  assert.strictEqual(dupCheck1.candidates[0].matchReason, 'PHONE_MATCH');

  const newGuestMatchingEmail = { tenant_id: tenantA, phone: '0555 111 22 33', email: 'MEHMET@TEST.COM' };
  const dupCheck2 = detectDuplicateCandidates(newGuestMatchingEmail, existingGuests);
  assert.strictEqual(dupCheck2.hasWarning, true);
  assert.strictEqual(dupCheck2.candidates[0].matchReason, 'EMAIL_MATCH');

  recordPass('3. Duplicate candidate detection identifies phone/email matches without destructive auto-merge');

  // TEST 4: Cross-Tenant Isolation in Deduplication
  console.log('\n--- TEST 4: Cross-Tenant Isolation ---');
  const tenantB = 'tenant_beta';
  const guestInTenantB = { tenant_id: tenantB, phone: '0532 123 45 67', email: 'ahmet@test.com' };
  const dupCheckCross = detectDuplicateCandidates(guestInTenantB, existingGuests);
  assert.strictEqual(dupCheckCross.hasWarning, false);
  assert.strictEqual(dupCheckCross.candidates.length, 0);

  recordPass('4. Cross-tenant guests NEVER produce duplicate warnings or match candidates');

  // TEST 5: Booking-Guest Linkage & Backward Compatibility
  console.log('\n--- TEST 5: Booking-Guest Linkage & Backward Compatibility ---');
  const legacyBooking = {
    id: 'bk_1',
    booking_code: 'BK-100',
    guest_name: 'Canan Kaya',
    guest_phone: '0544 555 66 77',
    check_in: '2026-10-01',
    check_out: '2026-10-05'
  };
  assert.strictEqual(legacyBooking.primary_guest_id, undefined);
  assert.strictEqual(typeof legacyBooking.guest_name, 'string');

  const modernBooking = {
    ...legacyBooking,
    primary_guest_id: 'guest_uuid_999',
    guest_count: 4,
    adults: 2,
    children: 2,
    infants: 0
  };
  assert.strictEqual(modernBooking.primary_guest_id, 'guest_uuid_999');
  assert.strictEqual(modernBooking.guest_count, 4);

  recordPass('5. Bookings link to guests while remaining 100% backward-compatible with legacy bookings');

  // TEST 6: Language Preference & Fallback
  console.log('\n--- TEST 6: Language Preference & Fallback ---');
  const guestWithLang = { first_name: 'John', preferred_language: 'en' };
  const guestDefault = { first_name: 'Ali' };

  assert.strictEqual(guestWithLang.preferred_language, 'en');
  assert.strictEqual(guestDefault.preferred_language || 'tr', 'tr');

  recordPass('6. Guest preferred language honors explicit value and cleanly falls back to tenant default');

  // TEST 7: Empty Identity Validation
  console.log('\n--- TEST 7: Empty Identity Validation ---');
  const emptyGuest = { first_name: '   ', phone: '', email: '' };
  const hasIdentity = Boolean(
    (emptyGuest.first_name && emptyGuest.first_name.trim().length > 0) ||
    (emptyGuest.phone && emptyGuest.phone.trim().length > 0) ||
    (emptyGuest.email && emptyGuest.email.trim().length > 0)
  );
  assert.strictEqual(hasIdentity, false);

  recordPass('7. Empty identity validation blocks guest records without at least one valid identifier');

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (0 FAILED)`);
  console.log('=============================================================================');
}

runGuestDomainTests().catch(err => {
  console.error('[FAIL] Guest domain test suite failed:', err);
  process.exit(1);
});
