// =============================================================================
// LEXBNB PHASE 10 — EXTENSION OFFER SERVICE
// Server-Side Authoritative Pricing, Real-Time GiST Vacancy Verification,
// Expiry Enforcement, and Phase 5 Booking Engine Conversion
// =============================================================================

/**
 * Checks whether the night immediately following the booking checkout is vacant.
 * @param {Object} booking
 * @param {Array<Object>} allPropertyBookings
 * @param {Array<Object>} maintenanceTickets
 * @returns {{ available: boolean, targetDate: string, newCheckoutDate: string, reason?: string }}
 */
function evaluateExtensionAvailability(booking, allPropertyBookings = [], maintenanceTickets = []) {
  if (!booking || !booking.check_out || booking.status === 'CANCELLED') {
    return { available: false, targetDate: '', newCheckoutDate: '', reason: 'INVALID_BOOKING' };
  }

  const targetDate = booking.check_out;
  const d = new Date(targetDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  const newCheckoutDate = d.toISOString().split('T')[0];

  // 1. Check for overlapping bookings
  for (const b of allPropertyBookings) {
    if ((b.id && b.id === booking.id) || (b.dbId && b.dbId === booking.dbId)) continue;
    if (b.status === 'CANCELLED') continue;

    // Check overlap with [targetDate, newCheckoutDate)
    const bIn = b.check_in || b.checkIn;
    const bOut = b.check_out || b.checkOut;

    // Overlap condition: targetDate < bOut && newCheckoutDate > bIn
    if (targetDate < bOut && newCheckoutDate > bIn) {
      return {
        available: false,
        targetDate,
        newCheckoutDate,
        reason: 'OCCUPIED_BY_BOOKING'
      };
    }
  }

  // 2. Check for blocking maintenance tickets
  for (const t of maintenanceTickets) {
    if (t.property_id === booking.property_id && (t.status === 'OPEN' || t.status === 'IN_PROGRESS')) {
      if (t.severity === 'P1_CRITICAL' || t.severity === 'P2_HIGH') {
        return {
          available: false,
          targetDate,
          newCheckoutDate,
          reason: 'MAINTENANCE_BLOCK'
        };
      }
    }
  }

  return {
    available: true,
    targetDate,
    newCheckoutDate
  };
}

/**
 * Calculates server-side authoritative extension pricing.
 * Never trusts client-supplied discounts or amounts.
 * @param {Object} property - { base_price }
 * @param {number} configuredDiscountPercent
 * @returns {{ basePrice: number, discountPercent: number, offeredPrice: number }}
 */
function calculateExtensionPrice(property, configuredDiscountPercent = 20) {
  const basePrice = Number(property.base_price || property.basePrice || 0);
  const discountPercent = Math.max(0, Math.min(100, Number(configuredDiscountPercent) || 20));
  const discountFactor = (100 - discountPercent) / 100;
  const offeredPrice = Math.round(basePrice * discountFactor * 100) / 100;

  return {
    basePrice,
    discountPercent,
    offeredPrice
  };
}

/**
 * Generates an extension offer snapshot with strict expiration.
 * @param {Object} params - { booking, property, discountPercent, hoursValid }
 * @returns {Object} Offer snapshot
 */
function createOfferSnapshot(params) {
  const { booking, property, discountPercent = 20, hoursValid = 6 } = params;

  const availability = evaluateExtensionAvailability(booking, params.existingBookings || [], params.maintenanceTickets || []);
  if (!availability.available) {
    const err = new Error(`EXTENSION_UNAVAILABLE: Sonraki gece müsait değil (${availability.reason})`);
    err.reason = availability.reason;
    throw err;
  }

  const pricing = calculateExtensionPrice(property, discountPercent);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + hoursValid * 3600 * 1000);

  return {
    booking_id: booking.id || booking.dbId,
    property_id: property.id || property.dbId,
    target_date: availability.targetDate,
    new_checkout_date: availability.newCheckoutDate,
    base_price: pricing.basePrice,
    discount_percent: pricing.discountPercent,
    offered_price: pricing.offeredPrice,
    currency: 'TRY',
    status: 'OFFERED',
    expires_at: expiresAt.toISOString(),
    availability_checked_at: now.toISOString()
  };
}

/**
 * Validates offer acceptance conditions.
 * @param {Object} offer
 * @param {Object} booking
 * @param {Array<Object>} existingBookings
 * @returns {{ valid: boolean, error?: string }}
 */
function validateOfferAcceptance(offer, booking, existingBookings = []) {
  if (!offer || offer.status !== 'OFFERED') {
    return { valid: false, error: 'OFFER_INACTIVE' };
  }

  const now = new Date();
  const expiry = new Date(offer.expires_at);
  if (now > expiry) {
    return { valid: false, error: 'OFFER_EXPIRED' };
  }

  if (!booking || booking.status === 'CANCELLED') {
    return { valid: false, error: 'BOOKING_CANCELLED' };
  }

  const currentCheckout = booking.check_out || booking.checkOut;
  if (currentCheckout !== offer.target_date) {
    return { valid: false, error: 'DATES_CHANGED_SINCE_OFFER' };
  }

  // Re-verify real-time availability immediately before acceptance
  const availability = evaluateExtensionAvailability(booking, existingBookings);
  if (!availability.available) {
    return { valid: false, error: 'AVAILABILITY_LOST' };
  }

  return { valid: true };
}

module.exports = {
  evaluateExtensionAvailability,
  calculateExtensionPrice,
  createOfferSnapshot,
  validateOfferAcceptance
};
