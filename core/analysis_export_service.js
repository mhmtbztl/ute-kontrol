// =============================================================================
// LEXBNB ANALYSIS EXPORT SERVICE
// Contract, aggregation orchestration and sanitized ChatGPT export boundary.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AnalysisExportService = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
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
    const properties = (input.properties || [])
      .filter(property => selected.has(property.id))
      .map(property => ({ name: property.name || property.slug || 'Adsız mülk' }));

    return {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      generatedAt: input.generatedAt || new Date().toISOString(),
      currency: request.currency,
      business: { name: input.business && input.business.name || null },
      period: { ...request.period, dateBasis: 'STAY_DATE' },
      comparisonPeriod: null,
      portfolio: { propertyCount: properties.length, properties },
      financials: {},
      bookingKpis: {},
      channels: [],
      properties: [],
      comparison: {},
      dataQuality: {
        status: 'INSUFFICIENT_DATA',
        items: [{ code: 'ANALYSIS_AGGREGATION_PENDING', severity: 'INFO' }]
      }
    };
  }

  return {
    ANALYSIS_SCHEMA_VERSION,
    validateAnalysisRequest,
    buildAnalysisPackage
  };
}));
