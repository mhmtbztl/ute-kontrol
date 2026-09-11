// =============================================================================
// LEXBNB PHASE 11 — PRICING & BOOKING INTEGRATION SERVICE
// Server-side Authoritative Pricing, Quote Snapshotting, Lead-to-Quote Bridge,
// and Phase 10 Extension Offer Dynamic Pricing Bridge.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const PricingEngine = require('./pricing_engine');
    module.exports = factory(PricingEngine);
  } else {
    root.PricingBookingService = factory(root.PricingEngine);
  }
}(typeof self !== 'undefined' ? self : this, function (PricingEngine) {
  'use strict';

  function roundMoney(val) {
    return Math.round((Number(val) || 0) * 100) / 100;
  }

  function parseDate(dStr) {
    return new Date(dStr + 'T00:00:00Z');
  }

  function getDatesBetween(checkInStr, checkOutStr) {
    const dates = [];
    let curr = parseDate(checkInStr);
    const end = parseDate(checkOutStr);
    while (curr < end) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return dates;
  }

  /**
   * Authoritatively computes stay pricing night-by-night using PricingEngine.
   */
  function calculateAuthoritativeStayPrice(params) {
    const {
      property,
      checkIn,
      checkOut,
      pax = 1,
      profile = null,
      rules = [],
      events = [],
      overrides = [],
      occupancy = 0,
      gapNightsMap = {},
      bookingLeadTime = null
    } = params;

    if (!property || !checkIn || !checkOut) {
      throw new Error('INVALID_PARAMS: property, checkIn, and checkOut are required');
    }

    const stayDates = getDatesBetween(checkIn, checkOut);
    if (stayDates.length === 0) {
      throw new Error('INVALID_DATES: checkOut must be after checkIn');
    }

    const nightlyBreakdown = [];
    let subtotal = 0;
    const allRulesApplied = new Set();

    stayDates.forEach((dateStr, idx) => {
      const isGap = !!gapNightsMap[dateStr];
      const calculation = PricingEngine.calculateDailyPrice({
        property,
        date: dateStr,
        profile,
        rules,
        events,
        overrides,
        occupancy,
        isGapNight: isGap,
        bookingLeadTime
      });

      subtotal += calculation.finalRate;
      calculation.rulesApplied.forEach(r => allRulesApplied.add(r));

      nightlyBreakdown.push({
        date: dateStr,
        baseRate: calculation.baseRate,
        finalRate: calculation.finalRate,
        rulesApplied: calculation.rulesApplied,
        adjustments: calculation.adjustments,
        minRate: calculation.minRate,
        maxRate: calculation.maxRate
      });
    });

    subtotal = roundMoney(subtotal);

    // Extra guest fee calculation
    const basePax = Number(property.base_pax || property.basePax || (profile && profile.base_pax) || 2);
    const extraGuestFeePerNight = Number(property.extra_guest_fee || property.extraGuestFee || (profile && profile.extra_guest_fee) || 0);
    const guestCount = Number(pax) || 1;
    const extraGuests = Math.max(0, guestCount - basePax);
    const nights = stayDates.length;
    const extraGuestFeeTotal = roundMoney(extraGuests * extraGuestFeePerNight * nights);
    const grossTotal = roundMoney(subtotal + extraGuestFeeTotal);

    const contextHash = PricingEngine.generateCalculationContextHash({
      propertyId: property.id || property.dbId,
      checkIn,
      checkOut,
      pax: guestCount,
      subtotal,
      extraGuestFeeTotal,
      grossTotal
    });

    return {
      propertyId: property.id || property.dbId,
      checkIn,
      checkOut,
      nights,
      pax: guestCount,
      basePax,
      extraGuestFeePerNight,
      extraGuests,
      subtotal,
      extraGuestFeeTotal,
      grossTotal,
      currency: property.currency || 'TRY',
      nightlyBreakdown,
      rulesAppliedSummary: Array.from(allRulesApplied),
      calculationContextHash: contextHash
    };
  }

  /**
   * Verifies client-supplied gross price against authoritative server calculation.
   * Rejects tampering, stale pricing, and out-of-tolerance quotes.
   */
  function verifyAuthoritativeBookingPrice(property, checkIn, checkOut, pax, clientGross, options = {}) {
    const authoritative = calculateAuthoritativeStayPrice({
      property,
      checkIn,
      checkOut,
      pax,
      profile: options.profile,
      rules: options.rules || [],
      events: options.events || [],
      overrides: options.overrides || [],
      occupancy: options.occupancy || 0,
      gapNightsMap: options.gapNightsMap || {},
      bookingLeadTime: options.bookingLeadTime
    });

    const tolerance = options.tolerance !== undefined ? options.tolerance : 0.01;
    const clientVal = Number(clientGross);
    const diff = roundMoney(Math.abs(clientVal - authoritative.grossTotal));
    const isValid = !isNaN(clientVal) && diff <= tolerance;

    return {
      valid: isValid,
      authoritativeGross: authoritative.grossTotal,
      clientGross: clientVal,
      difference: diff,
      tolerance,
      nights: authoritative.nights,
      authoritativeDetails: authoritative
    };
  }

  /**
   * Generates a formal, immutable quote with schemaVersion: 1.
   */
  function calculateLeadQuote(params) {
    const {
      lead,
      property,
      profile = null,
      rules = [],
      events = [],
      overrides = [],
      validHours = 48,
      pax = null,
      checkIn = null,
      checkOut = null,
      currency = 'TRY'
    } = params;

    const effCheckIn = checkIn || (lead && (lead.check_in || lead.checkIn));
    const effCheckOut = checkOut || (lead && (lead.check_out || lead.checkOut));
    const effPax = pax || (lead && (lead.pax || lead.guests_count)) || 1;

    if (!effCheckIn || !effCheckOut) {
      throw new Error('MISSING_QUOTE_DATES: check_in and check_out required');
    }

    const authoritative = calculateAuthoritativeStayPrice({
      property,
      checkIn: effCheckIn,
      checkOut: effCheckOut,
      pax: effPax,
      profile,
      rules,
      events,
      overrides
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + validHours * 3600 * 1000);

    return {
      schema_version: 1,
      quote_id: 'QTE-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      lead_id: lead ? (lead.id || lead.dbId || null) : null,
      property_id: property.id || property.dbId,
      tenant_id: property.tenant_id || (lead && lead.tenant_id) || null,
      check_in: effCheckIn,
      check_out: effCheckOut,
      nights: authoritative.nights,
      pax: authoritative.pax,
      base_rate_snapshot: (profile && profile.base_rate) || property.base_price || 0,
      subtotal: authoritative.subtotal,
      extra_guest_fee_total: authoritative.extraGuestFeeTotal,
      total_amount: authoritative.grossTotal,
      currency: currency || property.currency || 'TRY',
      status: 'ACTIVE',
      rules_applied_summary: authoritative.rulesAppliedSummary,
      nightly_breakdown: authoritative.nightlyBreakdown,
      calculation_context_hash: authoritative.calculationContextHash,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    };
  }

  /**
   * Validates quote acceptance.
   * Active quotes are locked; expired or cancelled quotes cannot be accepted.
   */
  function validateQuoteAcceptance(quote) {
    if (!quote) {
      return { valid: false, error: 'QUOTE_NOT_FOUND' };
    }
    if (quote.status !== 'ACTIVE') {
      return { valid: false, error: 'QUOTE_INACTIVE', status: quote.status };
    }
    const now = new Date();
    const expiry = new Date(quote.expires_at);
    if (now > expiry) {
      return { valid: false, error: 'QUOTE_EXPIRED', expiresAt: quote.expires_at };
    }
    return { valid: true };
  }

  /**
   * Phase 10 Extension Offer Dynamic Pricing Bridge:
   * Uses pricing engine daily rate for targetDate rather than naive flat rate,
   * applying configured discount while strictly honoring minimum_rate guardrail.
   */
  function calculateDynamicExtensionPrice(params) {
    const {
      property,
      targetDate,
      configuredDiscountPercent = 20,
      profile = null,
      rules = [],
      events = [],
      overrides = []
    } = params;

    const dailyCalc = PricingEngine.calculateDailyPrice({
      property,
      date: targetDate,
      profile,
      rules,
      events,
      overrides
    });

    const basePrice = dailyCalc.finalRate;
    const discountPercent = Math.max(0, Math.min(100, Number(configuredDiscountPercent) || 20));
    const discountFactor = (100 - discountPercent) / 100;
    const rawDiscounted = roundMoney(basePrice * discountFactor);

    // Clamp to minimum_rate
    const minRate = dailyCalc.minRate;
    const finalOfferedPrice = Math.max(minRate, rawDiscounted);
    const isClamped = rawDiscounted < minRate;

    return {
      targetDate,
      baseDailyRate: basePrice,
      discountPercent,
      rawDiscountedPrice: rawDiscounted,
      offeredPrice: finalOfferedPrice,
      minRate,
      isClampedToMinRate: isClamped,
      calculationContextHash: dailyCalc.calculationContextHash
    };
  }

  return {
    roundMoney,
    getDatesBetween,
    calculateAuthoritativeStayPrice,
    verifyAuthoritativeBookingPrice,
    calculateLeadQuote,
    validateQuoteAcceptance,
    calculateDynamicExtensionPrice
  };
}));
