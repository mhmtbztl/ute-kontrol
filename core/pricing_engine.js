// =============================================================================
// LEXBNB PHASE 11 — CANONICAL PRICING ENGINE
// Deterministic 9-Step Priority Pipeline, Explainable Adjustments,
// Tie-Breakers, Guardrails with Privileged Owner Bypass, and Context Hashing.
// Supports both Node.js and Browser environments.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const crypto = require('crypto');
    module.exports = factory(crypto);
  } else {
    root.PricingEngine = factory(root.crypto);
  }
}(typeof self !== 'undefined' ? self : this, function (cryptoModule) {
  'use strict';

  const ENGINE_VERSION = '1.0.0';

  /**
   * Rounds monetary amounts to 2 decimal places.
   */
  function roundMoney(val) {
    return Math.round((Number(val) || 0) * 100) / 100;
  }

  /**
   * Returns array of date strings between checkIn and checkOut (exclusive of checkOut).
   */
  function getDatesBetween(checkInStr, checkOutStr) {
    const dates = [];
    let curr = new Date(checkInStr + 'T00:00:00Z');
    const end = new Date(checkOutStr + 'T00:00:00Z');
    while (curr < end) {
      dates.push(curr.toISOString().split('T')[0]);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return dates;
  }

  /**
   * Generates a 16-char hex context hash for audit and version tracking.
   */
  function generateCalculationContextHash(input) {
    const str = JSON.stringify(input);
    if (cryptoModule && typeof cryptoModule.createHash === 'function') {
      return cryptoModule.createHash('sha256').update(str).digest('hex').substring(0, 16);
    }
    // Fallback hash for browser environments without node crypto
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(16, '0');
    return hex.substring(0, 16);
  }

  /**
   * Determines whether a given date is considered a weekend based on property config.
   * Default [5, 6] (Friday, Saturday) for short-term vacation rentals.
   */
  function isWeekend(date, weekendDays = [5, 6]) {
    const d = new Date(date + (String(date).includes('T') ? '' : 'T00:00:00Z'));
    const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    const days = Array.isArray(weekendDays) && weekendDays.length > 0 ? weekendDays : [5, 6];
    return days.includes(dayOfWeek);
  }

  /**
   * Sorts overlapping rules deterministically using strict tie-breaker order:
   * 1. Higher priority number wins
   * 2. Property-specific rule wins over portfolio-wide rule
   * 3. Stable ID / alphabetical order
   */
  function sortRulesDeterministically(rules) {
    return [...rules].sort((a, b) => {
      // 1. Higher priority
      const pA = Number(a.priority) || 0;
      const pB = Number(b.priority) || 0;
      if (pA !== pB) return pB - pA;

      // 2. Property-specific > portfolio
      const propA = Boolean(a.property_id);
      const propB = Boolean(b.property_id);
      if (propA !== propB) return propA ? -1 : 1;

      // 3. Stable ID order
      const idA = String(a.id || '');
      const idB = String(b.id || '');
      return idA.localeCompare(idB);
    });
  }

  /**
   * Calculates canonical nightly room rate for a single date.
   */
  function calculateNightlyRate(params) {
    const {
      date,
      rules = [],
      events = [],
      overrides = [],
      occupancy = 0,
      occupancyRate = 0,
      leadTimeDays = null,
      bookingLeadTime = null,
      isGapNight = false,
      userRole = 'owner'
    } = params;

    const property = params.property || {};
    const profile = params.profile || {};
    const propertyId = params.propertyId || property.id || property.dbId || null;

    const effOccupancy = occupancy || occupancyRate || 0;
    const effLeadTime = bookingLeadTime !== null ? bookingLeadTime : (leadTimeDays !== null ? leadTimeDays : 30);

    // Resolve base rate
    const genericBase = Number(profile.base_rate || profile.baseRate || property.base_price || property.basePrice || 0);
    const weekdayBase = roundMoney(profile.weekday_base_rate || profile.weekdayBaseRate || genericBase || 10000);
    const weekendMultiplier = Number(profile.weekend_multiplier || profile.weekendMultiplier || 1.0);
    const weekendBase = roundMoney(profile.weekend_base_rate || profile.weekendBaseRate || (weekdayBase * weekendMultiplier));

    const minRate = roundMoney(profile.minimum_rate || profile.minimumRate || property.min_price || property.minPrice || 0);
    const maxRate = roundMoney(profile.maximum_rate || profile.maximumRate || property.max_price || property.maxPrice || 999999);
    const weekendDays = profile.weekend_days || profile.weekendDays || [5, 6];

    const adjustments = [];
    const rulesApplied = [];
    let currentRate = 0;

    // STEP 1: Base Rate (Weekday vs Weekend)
    const isWknd = isWeekend(date, weekendDays);
    currentRate = isWknd ? weekendBase : weekdayBase;
    const baseStepName = isWknd ? 'Weekend Base Rate' : 'Weekday Base Rate';
    adjustments.push({
      step: 'BASE_RATE',
      name: baseStepName,
      type: 'BASE',
      factor: 1.0,
      amount: currentRate,
      delta: currentRate,
      rateAfter: currentRate,
      intermediateRate: currentRate,
      reason: baseStepName
    });
    if (isWknd && weekendMultiplier > 1.0) {
      rulesApplied.push('DAY_OF_WEEK_WEEKEND');
    }

    // STEP 2: Seasonality
    const activeSeasons = rules.filter(r =>
      r.is_active !== false &&
      r.rule_type === 'SEASON' &&
      (!r.start_date || r.start_date <= date) &&
      (!r.end_date || r.end_date >= date) &&
      (!r.property_id || r.property_id === propertyId)
    );

    if (activeSeasons.length > 0) {
      const sortedSeasons = sortRulesDeterministically(activeSeasons);
      const season = sortedSeasons[0];
      const prevRate = currentRate;
      if (season.fixed_rate_override) {
        currentRate = roundMoney(season.fixed_rate_override);
      } else if (season.multiplier) {
        currentRate = roundMoney(currentRate * Number(season.multiplier));
      }
      const delta = roundMoney(currentRate - prevRate);
      adjustments.push({
        step: 'SEASON',
        name: `Season: ${season.name || season.id}`,
        type: 'SEASON',
        factor: Number(season.multiplier) || 1.0,
        amount: delta,
        delta: delta,
        rateAfter: currentRate,
        intermediateRate: currentRate,
        ruleId: season.id,
        reason: season.name || 'Season adjustment'
      });
      rulesApplied.push(season.name || 'SEASON');
    }

    // STEP 3: Day-of-Week Adjustment
    const dObj = new Date(date + 'T00:00:00Z');
    const dayIndex = dObj.getUTCDay();
    const dowRules = rules.filter(r =>
      r.is_active !== false &&
      r.rule_type === 'DAY_OF_WEEK' &&
      (!r.property_id || r.property_id === propertyId) &&
      (r.conditions && Array.isArray(r.conditions.days) && r.conditions.days.includes(dayIndex))
    );

    if (dowRules.length > 0) {
      const dowRule = sortRulesDeterministically(dowRules)[0];
      const prevRate = currentRate;
      if (dowRule.fixed_rate_override) {
        currentRate = roundMoney(dowRule.fixed_rate_override);
      } else if (dowRule.multiplier) {
        currentRate = roundMoney(currentRate * Number(dowRule.multiplier));
      }
      const delta = roundMoney(currentRate - prevRate);
      adjustments.push({
        step: 'DAY_OF_WEEK',
        name: `Day of Week (${dowRule.name || dowRule.id})`,
        type: 'DAY_OF_WEEK',
        factor: Number(dowRule.multiplier) || 1.0,
        amount: delta,
        delta: delta,
        rateAfter: currentRate,
        intermediateRate: currentRate,
        ruleId: dowRule.id,
        reason: dowRule.name || 'Day of week rule'
      });
      rulesApplied.push(dowRule.name || 'DAY_OF_WEEK');
    }

    // STEP 4: Events
    const combinedEvents = [
      ...events,
      ...rules.filter(r => r.rule_type === 'EVENT')
    ];
    const activeEvents = combinedEvents.filter(e =>
      e.is_active !== false &&
      (!e.start_date || e.start_date <= date) &&
      (!e.end_date || e.end_date >= date) &&
      (!e.property_id || e.property_id === propertyId)
    );

    if (activeEvents.length > 0) {
      const evt = sortRulesDeterministically(activeEvents)[0];
      const prevRate = currentRate;
      if (evt.fixed_rate_override) {
        currentRate = roundMoney(evt.fixed_rate_override);
      } else if (evt.multiplier) {
        currentRate = roundMoney(currentRate * Number(evt.multiplier));
      }
      const delta = roundMoney(currentRate - prevRate);
      adjustments.push({
        step: 'EVENT',
        name: `Event: ${evt.name || evt.id}`,
        type: 'EVENT',
        factor: Number(evt.multiplier) || 1.0,
        amount: delta,
        delta: delta,
        rateAfter: currentRate,
        intermediateRate: currentRate,
        eventId: evt.id,
        reason: evt.name || 'Special event'
      });
      rulesApplied.push(evt.name || 'EVENT');
    }

    // STEP 5: Occupancy Pressure
    const occRules = rules.filter(r =>
      r.is_active !== false &&
      r.rule_type === 'OCCUPANCY' &&
      (!r.property_id || r.property_id === propertyId) &&
      (!r.conditions || (
        (r.conditions.min_occupancy === undefined || effOccupancy >= r.conditions.min_occupancy) &&
        (r.conditions.max_occupancy === undefined || effOccupancy <= r.conditions.max_occupancy)
      ))
    );

    if (occRules.length > 0) {
      const occRule = sortRulesDeterministically(occRules)[0];
      const prevRate = currentRate;
      if (occRule.multiplier) {
        currentRate = roundMoney(currentRate * Number(occRule.multiplier));
        const delta = roundMoney(currentRate - prevRate);
        adjustments.push({
          step: 'OCCUPANCY',
          name: `Occupancy Pressure (${Math.round(effOccupancy * 100)}%)`,
          type: 'OCCUPANCY',
          factor: Number(occRule.multiplier),
          amount: delta,
          delta: delta,
          rateAfter: currentRate,
          intermediateRate: currentRate,
          ruleId: occRule.id,
          reason: occRule.name || 'Occupancy adjustment'
        });
        rulesApplied.push(occRule.name || 'OCCUPANCY');
      }
    }

    // STEP 6: Lead-Time & Last-Minute Adjustments
    const leadRules = rules.filter(r =>
      r.is_active !== false &&
      (r.rule_type === 'LEAD_TIME' || r.rule_type === 'LAST_MINUTE') &&
      (!r.property_id || r.property_id === propertyId) &&
      (!r.conditions || (
        (r.conditions.min_lead_days === undefined || effLeadTime >= r.conditions.min_lead_days) &&
        (r.conditions.max_lead_days === undefined || effLeadTime <= r.conditions.max_lead_days)
      ))
    );

    if (leadRules.length > 0) {
      const leadRule = sortRulesDeterministically(leadRules)[0];
      const prevRate = currentRate;
      if (leadRule.multiplier) {
        currentRate = roundMoney(currentRate * Number(leadRule.multiplier));
        const delta = roundMoney(currentRate - prevRate);
        adjustments.push({
          step: 'LEAD_TIME',
          name: `Lead Time Adjustment (${effLeadTime}d)`,
          type: 'LEAD_TIME',
          factor: Number(leadRule.multiplier),
          amount: delta,
          delta: delta,
          rateAfter: currentRate,
          intermediateRate: currentRate,
          ruleId: leadRule.id,
          reason: leadRule.name || 'Lead time adjustment'
        });
        rulesApplied.push(leadRule.name || 'LEAD_TIME');
      }
    }

    // STEP 7: Gap Night Adjustment
    if (isGapNight) {
      const gapRules = rules.filter(r =>
        r.is_active !== false &&
        r.rule_type === 'GAP_NIGHT' &&
        (!r.property_id || r.property_id === propertyId)
      );
      if (gapRules.length > 0) {
        const gapRule = sortRulesDeterministically(gapRules)[0];
        const prevRate = currentRate;
        if (gapRule.multiplier) {
          currentRate = roundMoney(currentRate * Number(gapRule.multiplier));
          const delta = roundMoney(currentRate - prevRate);
          adjustments.push({
            step: 'GAP_NIGHT',
            name: 'Gap Night Incentive',
            type: 'GAP_NIGHT',
            factor: Number(gapRule.multiplier),
            amount: delta,
            delta: delta,
            rateAfter: currentRate,
            intermediateRate: currentRate,
            ruleId: gapRule.id,
            reason: gapRule.name || 'Gap night discount'
          });
          rulesApplied.push(gapRule.name || 'GAP_NIGHT');
        }
      }
    }

    // STEP 8: Min/Max Guardrail Clamp
    let clampedRate = currentRate;
    if (minRate > 0 && clampedRate < minRate) {
      const delta = roundMoney(minRate - clampedRate);
      adjustments.push({
        step: 'GUARDRAIL_CLAMP',
        name: 'Minimum Rate Floor Clamp',
        type: 'GUARDRAIL_CLAMP',
        amount: delta,
        delta: delta,
        rateAfter: minRate,
        intermediateRate: minRate,
        reason: 'Clamped to minimum rate floor'
      });
      rulesApplied.push('GUARDRAIL_MIN_RATE_APPLIED');
      clampedRate = minRate;
    }
    if (maxRate > 0 && clampedRate > maxRate) {
      const delta = roundMoney(maxRate - clampedRate);
      adjustments.push({
        step: 'GUARDRAIL_CLAMP',
        name: 'Maximum Rate Ceiling Clamp',
        type: 'GUARDRAIL_CLAMP',
        amount: delta,
        delta: delta,
        rateAfter: maxRate,
        intermediateRate: maxRate,
        reason: 'Clamped to maximum rate ceiling'
      });
      rulesApplied.push('GUARDRAIL_MAX_RATE_APPLIED');
      clampedRate = maxRate;
    }

    const recommendedRate = roundMoney(clampedRate);
    let finalRate = recommendedRate;
    let hasManualOverride = false;
    let overrideReason = null;
    let overrideId = null;

    // STEP 9: Manual Override (Authoritative Final Layer)
    const activeOverrides = overrides.filter(o =>
      o.is_active !== false &&
      o.start_date <= date &&
      o.end_date >= date &&
      (!o.expires_at || new Date(o.expires_at) > new Date())
    );

    if (activeOverrides.length > 0) {
      const ov = activeOverrides[activeOverrides.length - 1];
      const candidateRaw = Number(ov.rate_override !== undefined ? ov.rate_override : ov.rate);
      let candidateRate = roundMoney(candidateRaw);

      if (ov.bypass_guardrail) {
        if (userRole && userRole !== 'owner' && userRole !== 'admin') {
          throw new Error('UNAUTHORIZED: Taban/tavan fiyat bariyeri yalnız işletme sahibi (owner) tarafından aşılabilir');
        }
        finalRate = candidateRate;
        rulesApplied.push('MANUAL_OVERRIDE_GUARDRAIL_BYPASSED');
      } else {
        // Clamped to guardrails
        if (minRate > 0 && candidateRate < minRate) candidateRate = minRate;
        if (maxRate > 0 && candidateRate > maxRate) candidateRate = maxRate;
        finalRate = candidateRate;
        rulesApplied.push('MANUAL_OVERRIDE');
      }

      hasManualOverride = true;
      overrideReason = ov.reason || 'Manual override';
      overrideId = ov.id || null;

      const delta = roundMoney(finalRate - recommendedRate);
      adjustments.push({
        step: 'MANUAL_OVERRIDE',
        name: `Manual Override: ${overrideReason}`,
        type: ov.bypass_guardrail ? 'OWNER_GUARDRAIL_OVERRIDE' : 'MANUAL_OVERRIDE',
        amount: delta,
        delta: delta,
        rateAfter: finalRate,
        intermediateRate: finalRate,
        overrideId: ov.id,
        reason: overrideReason
      });
    }

    const minStay = (activeOverrides[0] && (activeOverrides[0].min_stay_override || activeOverrides[0].min_stay)) ||
                    profile.min_stay_default || profile.default_min_stay || 1;

    const contextHash = generateCalculationContextHash({
      propertyId,
      date,
      baseRate: isWknd ? weekendBase : weekdayBase,
      adjustmentsCount: adjustments.length,
      finalRate
    });

    return {
      propertyId,
      date,
      baseRate: isWknd ? weekendBase : weekdayBase,
      recommendedRate,
      finalRate: roundMoney(finalRate),
      minimumRate: minRate,
      minRate: minRate,
      maximumRate: maxRate,
      maxRate: maxRate,
      minStay,
      isWeekend: isWknd,
      isGapNight: Boolean(isGapNight),
      hasManualOverride,
      overrideReason,
      overrideId,
      rulesApplied,
      adjustments,
      engineVersion: ENGINE_VERSION,
      calculationContextHash: contextHash
    };
  }

  /**
   * Calculates daily rates for a contiguous date range [startDate, endDate).
   */
  function calculateRates(params) {
    const { startDate, endDate } = params;
    const rates = [];

    const stayDates = getDatesBetween(startDate, endDate);
    stayDates.forEach(dateStr => {
      const rate = calculateNightlyRate({
        ...params,
        date: dateStr
      });
      rates.push(rate);
    });

    return rates;
  }

  return {
    ENGINE_VERSION,
    roundMoney,
    getDatesBetween,
    generateCalculationContextHash,
    isWeekend,
    sortRulesDeterministically,
    calculateNightlyRate,
    calculateDailyPrice: calculateNightlyRate,
    calculateRates
  };
}));
