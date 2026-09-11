// =============================================================================
// LEXBNB PHASE 11 — REVENUE FORECAST & PACING SERVICE
// Rolling Pickup Tracking, Same Lead-Time Pacing, Deterministic Revenue Forecast,
// and Transparent Pricing Insights.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const PricingEngine = require('./pricing_engine');
    module.exports = factory(PricingEngine);
  } else {
    root.RevenueForecastService = factory(root.PricingEngine);
  }
}(typeof self !== 'undefined' ? self : this, function (PricingEngine) {
  'use strict';

  function roundMoney(val) {
    return Math.round((Number(val) || 0) * 100) / 100;
  }

  function parseDate(dStr) {
    return new Date(dStr + 'T00:00:00Z');
  }

  function getDaysInMonth(year, month1Indexed) {
    return new Date(Date.UTC(year, month1Indexed, 0)).getUTCDate();
  }

  function getDatesInMonth(yearMonthStr) {
    const [year, month] = yearMonthStr.split('-').map(Number);
    const totalDays = getDaysInMonth(year, month);
    const dates = [];
    for (let day = 1; day <= totalDays; day++) {
      const dd = String(day).padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      dates.push(`${year}-${mm}-${dd}`);
    }
    return dates;
  }

  /**
   * Evaluates pickup for a target stay period over a rolling lookback window.
   * Target stay period can be a month ("2026-07") or explicit date range.
   */
  function computePickupMetrics(params) {
    const {
      bookings = [],
      propertyId = null,
      targetMonth = null,       // "YYYY-MM"
      startDate = null,         // "YYYY-MM-DD"
      endDate = null,           // "YYYY-MM-DD"
      lookbackDays = 7,
      asOfDate = new Date().toISOString().split('T')[0]
    } = params;

    const asOf = parseDate(asOfDate);
    const windowStart = new Date(asOf.getTime() - lookbackDays * 86400000);

    let periodStart = startDate;
    let periodEnd = endDate;
    if (targetMonth && (!periodStart || !periodEnd)) {
      const dates = getDatesInMonth(targetMonth);
      periodStart = dates[0];
      periodEnd = dates[dates.length - 1];
    }

    const matchingBookings = bookings.filter(b => {
      if (propertyId && (b.property_id !== propertyId && b.propertyId !== propertyId)) return false;
      if (b.status === 'CANCELLED') return false;

      // Check creation within lookback window
      const createdAtStr = b.created_at || b.createdAt;
      if (!createdAtStr) return false;
      const createdAt = new Date(createdAtStr);
      if (createdAt < windowStart || createdAt > asOf) return false;

      // Check stay overlaps with target period
      const bIn = b.check_in || b.checkIn;
      const bOut = b.check_out || b.checkOut;
      return bIn <= periodEnd && bOut > periodStart;
    });

    let pickupBookingsCount = matchingBookings.length;
    let pickupRoomNights = 0;
    let pickupRevenue = 0;

    matchingBookings.forEach(b => {
      const bIn = b.check_in || b.checkIn;
      const bOut = b.check_out || b.checkOut;
      const stayDates = PricingEngine.getDatesBetween(bIn, bOut);
      // Filter only nights falling inside target period
      const relevantNights = stayDates.filter(d => d >= periodStart && d <= periodEnd);
      pickupRoomNights += relevantNights.length;

      // Pro-rate gross revenue for relevant nights
      const gross = Number(b.gross_amount || b.grossAmount || b.total_price || 0);
      const stayLen = stayDates.length || 1;
      pickupRevenue += (gross / stayLen) * relevantNights.length;
    });

    return {
      targetPeriod: targetMonth || `${periodStart} to ${periodEnd}`,
      lookbackDays,
      asOfDate,
      pickupBookingsCount,
      pickupRoomNights,
      pickupRevenue: roundMoney(pickupRevenue)
    };
  }

  /**
   * Evaluates pacing at the same lead-time.
   * Compares current bookings against historical bookings at the same relative days before stay.
   */
  function computePacingMetrics(params) {
    const {
      currentBookings = [],
      historicalBookings = [],
      propertyId = null,
      targetMonth = null,
      leadTimeDays = 30
    } = params;

    function filterAndSum(bookingsList) {
      let nights = 0;
      let revenue = 0;
      let count = 0;

      bookingsList.forEach(b => {
        if (propertyId && (b.property_id !== propertyId && b.propertyId !== propertyId)) return false;
        if (b.status === 'CANCELLED') return;

        const bIn = b.check_in || b.checkIn;
        const bOut = b.check_out || b.checkOut;
        if (targetMonth && !bIn.startsWith(targetMonth.substring(5))) {
          // If comparing same calendar month across years
          const bMonth = bIn.substring(5, 7);
          const targetM = targetMonth.substring(5, 7);
          if (bMonth !== targetM) return;
        }

        const stayDates = PricingEngine.getDatesBetween(bIn, bOut);
        nights += stayDates.length;
        revenue += Number(b.gross_amount || b.grossAmount || 0);
        count++;
      });

      return { count, nights, revenue: roundMoney(revenue) };
    }

    const current = filterAndSum(currentBookings);
    const historical = filterAndSum(historicalBookings);

    const nightsDiff = current.nights - historical.nights;
    const revenueDiff = roundMoney(current.revenue - historical.revenue);
    const pacingRatio = historical.nights > 0
      ? Math.round((current.nights / historical.nights) * 100) / 100
      : (current.nights > 0 ? 1 : 0);

    return {
      leadTimeDays,
      current: {
        bookingsCount: current.count,
        bookedNights: current.nights,
        revenue: current.revenue
      },
      historical: {
        bookingsCount: historical.count,
        bookedNights: historical.nights,
        revenue: historical.revenue
      },
      comparison: {
        nightsDiff,
        revenueDiff,
        pacingRatio,
        status: nightsDiff >= 0 ? 'AHEAD' : 'BEHIND'
      }
    };
  }

  /**
   * Generates deterministic revenue forecast for a property in a given month.
   * Formula: Booked Revenue + (Remaining Nights * Expected Sell-Through * Avg Recommended Rate)
   */
  function generateRevenueForecast(params) {
    const {
      property,
      targetMonth,               // "YYYY-MM"
      bookings = [],
      dailyRates = [],           // pre-computed or will calculate via engine
      profile = null,
      rules = [],
      events = [],
      overrides = [],
      expectedSellThrough = 0.65 // 65% default assumption
    } = params;

    if (!property || !targetMonth) {
      throw new Error('INVALID_PARAMS: property and targetMonth are required');
    }

    const monthDates = getDatesInMonth(targetMonth);
    const totalNights = monthDates.length;
    const propertyId = property.id || property.dbId;

    // Track occupied dates
    const bookedDates = new Set();
    let bookedRevenue = 0;

    bookings.forEach(b => {
      if (b.property_id !== propertyId && b.propertyId !== propertyId) return;
      if (b.status === 'CANCELLED') return;

      const bIn = b.check_in || b.checkIn;
      const bOut = b.check_out || b.checkOut;
      const stayDates = PricingEngine.getDatesBetween(bIn, bOut);
      const relevantNights = stayDates.filter(d => d.startsWith(targetMonth));

      relevantNights.forEach(d => bookedDates.add(d));

      const gross = Number(b.gross_amount || b.grossAmount || 0);
      const stayLen = stayDates.length || 1;
      bookedRevenue += (gross / stayLen) * relevantNights.length;
    });

    bookedRevenue = roundMoney(bookedRevenue);
    const bookedNights = bookedDates.size;
    const remainingNights = Math.max(0, totalNights - bookedNights);

    // Build rate lookup map
    const rateMap = {};
    dailyRates.forEach(r => {
      if (r.date) rateMap[r.date] = Number(r.rate || r.finalRate || 0);
    });

    let sumRemainingRates = 0;
    let countedRemainingNights = 0;

    monthDates.forEach(d => {
      if (!bookedDates.has(d)) {
        let rate = rateMap[d];
        if (rate === undefined || rate === null) {
          const calc = PricingEngine.calculateDailyPrice({
            property,
            date: d,
            profile,
            rules,
            events,
            overrides
          });
          rate = calc.finalRate;
        }
        sumRemainingRates += rate;
        countedRemainingNights++;
      }
    });

    const avgRecommendedRate = countedRemainingNights > 0
      ? roundMoney(sumRemainingRates / countedRemainingNights)
      : Number(property.base_price || (profile && profile.base_rate) || 0);

    const projectedRemainingRevenue = roundMoney(remainingNights * expectedSellThrough * avgRecommendedRate);
    const forecastedTotalRevenue = roundMoney(bookedRevenue + projectedRemainingRevenue);

    const currentOccupancy = roundMoney(bookedNights / totalNights);
    const forecastedOccupancy = roundMoney((bookedNights + remainingNights * expectedSellThrough) / totalNights);

    // Confidence heuristic
    let confidence = 'MEDIUM';
    if (currentOccupancy >= 0.70) {
      confidence = 'HIGH';
    } else if (remainingNights > 20 && currentOccupancy < 0.20) {
      confidence = 'LOW';
    }

    return {
      propertyId,
      targetMonth,
      totalNights,
      bookedNights,
      remainingNights,
      currentOccupancy,
      expectedSellThrough,
      avgRecommendedRate,
      bookedRevenue,
      projectedRemainingRevenue,
      forecastedTotalRevenue,
      forecastedOccupancy,
      confidence,
      assumptions: {
        totalNights,
        remainingNights,
        bookedNights,
        expectedSellThrough,
        avgRecommendedRate,
        formula: 'bookedRevenue + (remainingNights * expectedSellThrough * avgRecommendedRate)'
      }
    };
  }

  /**
   * Evaluates occupancy, pickup, and pacing to produce deterministic pricing insights.
   */
  function generatePricingInsights(params) {
    const {
      property,
      forwardDays = 30,
      bookings = [],
      dailyRates = [],
      gapNights = [],
      asOfDate = new Date().toISOString().split('T')[0]
    } = params;

    const insights = [];
    const propertyId = property.id || property.dbId;

    // Check gap nights
    if (gapNights && gapNights.length > 0) {
      insights.push({
        type: 'ACTION',
        code: 'GAP_NIGHT_DETECTED',
        title: 'Boşluk Gece Fırsatı',
        description: `${gapNights.length} adet rezervasyon arası boşluk gece tespit edildi. Minimum konaklama kuralı otomatik esnetildi.`,
        priority: 'HIGH',
        affectedDates: gapNights.map(g => g.date)
      });
    }

    // Evaluate short-term occupancy (next 7 days)
    const asOf = parseDate(asOfDate);
    const next7Days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(asOf.getTime() + i * 86400000);
      next7Days.push(d.toISOString().split('T')[0]);
    }

    const occupiedInNext7 = new Set();
    bookings.forEach(b => {
      if (b.property_id !== propertyId && b.propertyId !== propertyId) return;
      if (b.status === 'CANCELLED') return;
      const bIn = b.check_in || b.checkIn;
      const bOut = b.check_out || b.checkOut;
      const stayDates = PricingEngine.getDatesBetween(bIn, bOut);
      stayDates.forEach(d => {
        if (next7Days.includes(d)) occupiedInNext7.add(d);
      });
    });

    const shortTermOcc = occupiedInNext7.size / 7;
    if (shortTermOcc <= 0.30) {
      insights.push({
        type: 'RISK',
        code: 'DISTRESSED_INVENTORY_NEAR_TERM',
        title: 'Yakın Dönem Düşük Doluluk',
        description: `Gelecek 7 gün içindeki doluluk oranı %${Math.round(shortTermOcc * 100)}. Son dakika indirimi veya minimum stay indirimi değerlendirilebilir.`,
        priority: 'HIGH'
      });
    } else if (shortTermOcc >= 0.85) {
      insights.push({
        type: 'OPPORTUNITY',
        code: 'HIGH_NEAR_TERM_DEMAND',
        title: 'Yüksek Yakın Dönem Talebi',
        description: `Gelecek 7 gün içindeki doluluk %${Math.round(shortTermOcc * 100)}. Kalan geceler için fiyat artışı uygulanabilir.`,
        priority: 'MEDIUM'
      });
    }

    return insights;
  }

  return {
    roundMoney,
    getDaysInMonth,
    getDatesInMonth,
    computePickupMetrics,
    computePacingMetrics,
    generateRevenueForecast,
    generatePricingInsights
  };
}));
