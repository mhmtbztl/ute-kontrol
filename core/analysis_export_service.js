// =============================================================================
// LEXBNB ANALYSIS EXPORT SERVICE
// Contract, aggregation orchestration and sanitized ChatGPT export boundary.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./financial_metrics_service'), require('./marketing_engine'));
  } else {
    root.AnalysisExportService = factory(root.FinancialMetricsService, root.MarketingEngine);
  }
}(typeof self !== 'undefined' ? self : this, function (FinancialMetricsService, MarketingEngine) {
  'use strict';

  const ANALYSIS_SCHEMA_VERSION = '1.0';
  const ALLOWED_SECTIONS = new Set([
    'FINANCE', 'BOOKING_KPIS', 'CHANNELS', 'PROPERTIES', 'EXPENSES', 'INVESTMENTS'
  ]);

  function contractError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function parseIsoDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() !== Number(match[1]) ||
        date.getUTCMonth() !== Number(match[2]) - 1 ||
        date.getUTCDate() !== Number(match[3])) return null;
    return date;
  }

  function formatIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function addUtcDays(date, amount) {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + amount);
    return next;
  }

  function deriveComparisonPeriod(period, mode) {
    if (!mode || mode === 'NONE') return null;
    const currentStart = parseIsoDate(period.start);
    let start;
    if (mode === 'PREVIOUS_PERIOD') {
      start = addUtcDays(currentStart, -period.dayCount);
    } else if (mode === 'PRIOR_YEAR') {
      const targetYear = currentStart.getUTCFullYear() - 1;
      const targetMonth = currentStart.getUTCMonth();
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      start = new Date(Date.UTC(targetYear, targetMonth, Math.min(currentStart.getUTCDate(), lastDay)));
    } else {
      throw contractError('ANALYSIS_INVALID_COMPARISON', 'Unknown comparison mode.');
    }
    const endExclusive = addUtcDays(start, period.dayCount);
    return {
      mode,
      start: formatIsoDate(start),
      end: formatIsoDate(addUtcDays(endExclusive, -1)),
      endExclusive: formatIsoDate(endExclusive),
      dayCount: period.dayCount
    };
  }

  function compareMetric(current, previous) {
    if (current === null || current === undefined || previous === null || previous === undefined) {
      return { current, previous, changeAmount: null, changePercent: null, comparisonAvailable: false };
    }
    const changeAmount = FinancialMetricsService.roundMoney(current - previous);
    if (previous === 0 && current !== 0) {
      return { current, previous, changeAmount, changePercent: null, comparisonAvailable: false };
    }
    const changePercent = previous === 0
      ? 0
      : FinancialMetricsService.roundMoney(changeAmount / Math.abs(previous) * 100);
    return { current, previous, changeAmount, changePercent, comparisonAvailable: true };
  }

  function validateAnalysisRequest(input) {
    const start = parseIsoDate(input && input.period && input.period.start);
    const end = parseIsoDate(input && input.period && input.period.end);
    if (!start || !end || end < start) {
      throw contractError('ANALYSIS_INVALID_PERIOD', 'Analysis period must be a valid inclusive date range.');
    }

    const propertyIds = Array.from(new Set((input.propertyIds || []).filter(Boolean)));
    if (propertyIds.length === 0) {
      throw contractError('ANALYSIS_EMPTY_PROPERTY_SCOPE', 'At least one property must be selected.');
    }

    const sections = Array.from(new Set((input.sections || []).map(String)));
    if (sections.length === 0) {
      throw contractError('ANALYSIS_EMPTY_SECTIONS', 'At least one analysis section must be selected.');
    }
    if (sections.some(section => !ALLOWED_SECTIONS.has(section))) {
      throw contractError('ANALYSIS_UNKNOWN_SECTION', 'Analysis request contains an unknown section.');
    }

    const endExclusiveDate = new Date(end.getTime());
    endExclusiveDate.setUTCDate(endExclusiveDate.getUTCDate() + 1);

    return {
      period: {
        start: formatIsoDate(start),
        end: formatIsoDate(end),
        endExclusive: formatIsoDate(endExclusiveDate),
        dayCount: Math.round((endExclusiveDate.getTime() - start.getTime()) / 86400000)
      },
      comparison: { mode: input.comparison && input.comparison.mode || 'NONE' },
      propertyIds,
      sections,
      currency: input.currency || 'TRY'
    };
  }

  function buildAnalysisPackage(input) {
    const request = validateAnalysisRequest(input || {});
    const selected = new Set(request.propertyIds);
    const sourceProperties = input.properties || [];
    const knownPropertyIds = new Set();
    sourceProperties.forEach(property => {
      if (property.id) knownPropertyIds.add(property.id);
      if (property.slug) knownPropertyIds.add(property.slug);
    });
    if (request.propertyIds.some(propertyId => !knownPropertyIds.has(propertyId))) {
      throw contractError('ANALYSIS_UNKNOWN_PROPERTY', 'Selected property is not available in the active tenant scope.');
    }
    const properties = (input.properties || [])
      .filter(property => selected.has(property.id) || selected.has(property.slug))
      .map(property => ({ name: property.name || property.slug || 'Adsız mülk' }));
    if (!FinancialMetricsService || typeof FinancialMetricsService.computeFinancialMetricsForRange !== 'function') {
      throw contractError('ANALYSIS_FINANCE_SERVICE_UNAVAILABLE', 'Canonical financial metrics service is unavailable.');
    }
    const metrics = FinancialMetricsService.computeFinancialMetricsForRange({
      periodStart: request.period.start,
      periodEndExclusive: request.period.endExclusive,
      propertyIds: request.propertyIds,
      bookings: input.bookings || [],
      expenses: input.expenses || [],
      properties: sourceProperties,
      maintenances: input.maintenances || []
    });
    const finance = metrics.financial;
    const operations = metrics.operations;
    const comparisonPeriod = deriveComparisonPeriod(request.period, request.comparison.mode);
    const comparisonMetrics = comparisonPeriod
      ? FinancialMetricsService.computeFinancialMetricsForRange({
        periodStart: comparisonPeriod.start,
        periodEndExclusive: comparisonPeriod.endExclusive,
        propertyIds: request.propertyIds,
        bookings: input.bookings || [], expenses: input.expenses || [],
        properties: sourceProperties, maintenances: input.maintenances || []
      })
      : null;
    const includeFinance = request.sections.some(section => ['FINANCE', 'EXPENSES', 'INVESTMENTS'].includes(section));
    const includeBookingKpis = request.sections.includes('BOOKING_KPIS');
    const includeChannels = request.sections.includes('CHANNELS');
    const includeProperties = request.sections.includes('PROPERTIES');
    const scopedBookings = (input.bookings || []).filter(booking => {
      const propertyId = booking.propertyId || booking.property_id || booking.villa;
      return selected.has(propertyId);
    });
    const channelReport = (includeChannels || includeBookingKpis) && MarketingEngine
      ? MarketingEngine.computeChannelEconomics({
        bookings: scopedBookings,
        periodStart: request.period.start,
        periodEndExclusive: request.period.endExclusive,
        baseCurrency: request.currency,
        availableNights: operations.availableNights
      }) : null;
    const cohortReport = includeBookingKpis && MarketingEngine
      ? MarketingEngine.computeBookingCohortMetrics({
        bookings: scopedBookings,
        cohortStart: request.period.start + 'T00:00:00Z',
        cohortEndExclusive: request.period.endExclusive + 'T00:00:00Z'
      }) : null;
    const qualityItems = [];
    if (channelReport && channelReport.dataQuality.unknownRawChannels.length > 0) {
      qualityItems.push({
        code: 'UNKNOWN_CHANNEL', severity: 'WARNING',
        values: channelReport.dataQuality.unknownRawChannels
      });
    }
    if (cohortReport && cohortReport.dataQuality.missingCreatedAtReservations > 0) {
      qualityItems.push({
        code: 'MISSING_BOOKING_CREATED_AT', severity: 'WARNING',
        count: cohortReport.dataQuality.missingCreatedAtReservations
      });
    }
    if (cohortReport && cohortReport.dataQuality.invalidLeadTimeReservations > 0) {
      qualityItems.push({
        code: 'INVALID_NEGATIVE_LEAD_TIME', severity: 'WARNING',
        count: cohortReport.dataQuality.invalidLeadTimeReservations
      });
    }
    const contributingGuestCount = scopedBookings.reduce((sum, booking) => {
      if ((booking.status || 'CONFIRMED') === 'CANCELLED') return sum;
      const nights = FinancialMetricsService.splitBookingStayNights({
        ...booking,
        checkIn: booking.checkIn || booking.check_in,
        checkOut: booking.checkOut || booking.check_out
      }).some(night => night.date >= request.period.start && night.date < request.period.endExclusive);
      if (!nights) return sum;
      const pax = Number(booking.pax);
      return sum + (Number.isFinite(pax) && pax >= 0 ? pax : 0);
    }, 0);
    const propertyResults = includeProperties ? (input.properties || [])
      .filter(property => selected.has(property.id) || selected.has(property.slug))
      .map(property => {
        const propertyKey = property.id || property.slug;
        const propertyMetrics = FinancialMetricsService.computeFinancialMetricsForRange({
          periodStart: request.period.start,
          periodEndExclusive: request.period.endExclusive,
          propertyIds: [propertyKey],
          bookings: input.bookings || [], expenses: input.expenses || [],
          properties: input.properties || [], maintenances: input.maintenances || []
        });
        return {
          name: property.name || property.slug || 'Adsız mülk',
          reservations: propertyMetrics.operations.reservationCount,
          nights: propertyMetrics.operations.soldNights,
          availableNights: propertyMetrics.operations.availableNights,
          occupancy: propertyMetrics.operations.occupancy,
          adr: propertyMetrics.operations.adr,
          revpar: propertyMetrics.operations.revpar,
          roomRevenue: propertyMetrics.operations.roomRevenue,
          financialRevenue: propertyMetrics.financial.revenue,
          expenses: propertyMetrics.financial.operatingExpenses,
          investments: propertyMetrics.financial.capex,
          operatingProfit: propertyMetrics.financial.operatingProfit,
          netCashProfit: propertyMetrics.financial.netCashProfit
        };
      }) : [];
    const hasMeasuredData = operations.reservationCount > 0 ||
      finance.operatingExpenses > 0 || finance.capex > 0;

    return {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      generatedAt: input.generatedAt || new Date().toISOString(),
      currency: request.currency,
      business: { name: input.business && input.business.name || null },
      period: { ...request.period, dateBasis: 'STAY_DATE' },
      comparisonPeriod,
      portfolio: { propertyCount: properties.length, properties },
      financials: includeFinance ? {
        financialRevenue: finance.revenue,
        roomRevenue: operations.roomRevenue,
        otherRevenue: FinancialMetricsService.roundMoney(finance.revenue - operations.roomRevenue),
        operatingExpenses: finance.operatingExpenses,
        totalExpenses: FinancialMetricsService.roundMoney(finance.operatingExpenses + finance.capex),
        otaCommission: operations.bookedOtaCommission,
        investments: finance.capex,
        operatingProfit: finance.operatingProfit,
        netCashProfit: finance.netCashProfit,
        operatingMargin: finance.operatingMargin,
        netMargin: finance.netCashMargin,
        expenseCategories: finance.categoryBreakdown,
        unallocatedPortfolioExpenses: finance.unallocatedPortfolioExpenses,
        dateBasis: 'STAY_DATE_AND_EXPENSE_DATE'
      } : {},
      bookingKpis: includeBookingKpis ? {
        reservationCount: operations.reservationCount,
        soldNights: operations.soldNights,
        availableNights: operations.availableNights,
        occupancy: operations.occupancy,
        adr: operations.adr,
        revpar: operations.revpar,
        averageBookingValue: operations.reservationCount > 0
          ? FinancialMetricsService.roundMoney(finance.revenue / operations.reservationCount) : null,
        guestCount: contributingGuestCount,
        alos: cohortReport ? cohortReport.totals.averageLengthOfStay : null,
        leadTime: cohortReport ? cohortReport.totals.averageLeadTimeDays : null,
        cancellationRate: cohortReport ? cohortReport.totals.cancellationRatePercent : null,
        dateBasis: 'STAY_DATE_WITH_BOOKING_CREATED_AT_COHORT'
      } : {},
      channels: includeChannels && channelReport ? channelReport.channels.map(channel => ({
        channel: channel.channel,
        reservations: channel.reservationCount,
        nights: channel.bookedNights,
        roomRevenue: channel.roomRevenueBeforeDistribution,
        adr: channel.roomAdr,
        otaCommission: channel.distributionCost,
        netRevenue: channel.roomRevenueAfterDistribution,
        revenueShare: channelReport.totals.roomRevenueBeforeDistribution !== 0
          ? FinancialMetricsService.roundMoney(channel.roomRevenueBeforeDistribution / channelReport.totals.roomRevenueBeforeDistribution * 100)
          : null,
        directSubchannels: channel.directSubchannels
      })) : [],
      properties: propertyResults,
      comparison: comparisonMetrics ? {
        financialRevenue: compareMetric(finance.revenue, comparisonMetrics.financial.revenue),
        roomRevenue: compareMetric(operations.roomRevenue, comparisonMetrics.operations.roomRevenue),
        operatingExpenses: compareMetric(finance.operatingExpenses, comparisonMetrics.financial.operatingExpenses),
        investments: compareMetric(finance.capex, comparisonMetrics.financial.capex),
        operatingProfit: compareMetric(finance.operatingProfit, comparisonMetrics.financial.operatingProfit),
        netCashProfit: compareMetric(finance.netCashProfit, comparisonMetrics.financial.netCashProfit),
        reservations: compareMetric(operations.reservationCount, comparisonMetrics.operations.reservationCount),
        soldNights: compareMetric(operations.soldNights, comparisonMetrics.operations.soldNights),
        availableNights: compareMetric(operations.availableNights, comparisonMetrics.operations.availableNights),
        occupancy: compareMetric(operations.occupancy, comparisonMetrics.operations.occupancy),
        adr: compareMetric(operations.adr, comparisonMetrics.operations.adr),
        revpar: compareMetric(operations.revpar, comparisonMetrics.operations.revpar)
      } : {},
      dataQuality: {
        status: qualityItems.length > 0 ? 'NEEDS_REVIEW' : (hasMeasuredData ? 'OK' : 'INSUFFICIENT_DATA'),
        items: qualityItems.length > 0
          ? qualityItems
          : (hasMeasuredData ? [] : [{ code: 'NO_MEASURED_ACTIVITY', severity: 'INFO' }])
      }
    };
  }

  return {
    ANALYSIS_SCHEMA_VERSION,
    validateAnalysisRequest,
    buildAnalysisPackage
  };
}));
