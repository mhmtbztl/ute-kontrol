// =============================================================================
// LEXBNB ANALYSIS EXPORT SERVICE
// Contract, aggregation orchestration and sanitized ChatGPT export boundary.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./financial_metrics_service'));
  } else {
    root.AnalysisExportService = factory(root.FinancialMetricsService);
  }
}(typeof self !== 'undefined' ? self : this, function (FinancialMetricsService) {
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
      .filter(property => selected.has(property.id))
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
    const includeFinance = request.sections.some(section => ['FINANCE', 'EXPENSES', 'INVESTMENTS'].includes(section));
    const includeBookingKpis = request.sections.includes('BOOKING_KPIS');
    const hasMeasuredData = operations.reservationCount > 0 ||
      finance.operatingExpenses > 0 || finance.capex > 0;

    return {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      generatedAt: input.generatedAt || new Date().toISOString(),
      currency: request.currency,
      business: { name: input.business && input.business.name || null },
      period: { ...request.period, dateBasis: 'STAY_DATE' },
      comparisonPeriod: null,
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
        dateBasis: 'STAY_DATE'
      } : {},
      channels: [],
      properties: [],
      comparison: {},
      dataQuality: {
        status: hasMeasuredData ? 'OK' : 'INSUFFICIENT_DATA',
        items: hasMeasuredData ? [] : [{ code: 'NO_MEASURED_ACTIVITY', severity: 'INFO' }]
      }
    };
  }

  return {
    ANALYSIS_SCHEMA_VERSION,
    validateAnalysisRequest,
    buildAnalysisPackage
  };
}));
