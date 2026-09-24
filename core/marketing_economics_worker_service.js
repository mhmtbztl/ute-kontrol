// LEXBNB PHASE 17 — SCHEDULED CHANNEL ECONOMICS FINDINGS
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_engine'), require('./marketing_economics_finding_service'), require('./business_date'));
  else root.MarketingEconomicsWorkerService = factory(root.MarketingEngine, root.MarketingEconomicsFindingService, root.LexbnbBusinessDate);
}(typeof self !== 'undefined' ? self : this, function (Engine, FindingService, BusinessDate) {
  'use strict';
  const DAY = 86400000;
  const field = (object, camel, snake) => object && (object[camel] !== undefined ? object[camel] : object[snake]);
  async function runEconomicsFindings(repository, options = {}) {
    ['loadPropertyScopes', 'loadBenchmark', 'loadBookings', 'persistFinding'].forEach(name => {
      if (!repository || typeof repository[name] !== 'function') throw new Error(`REPOSITORY_${name.toUpperCase()}_REQUIRED`);
    });
    const asOfDate = options.asOfDate || BusinessDate.getBusinessDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || !Number.isFinite(Date.parse(`${asOfDate}T00:00:00Z`))) throw new Error('VALID_AS_OF_DATE_REQUIRED');
    const periodDays = Number.isInteger(options.periodDays) && options.periodDays > 0 ? options.periodDays : 90;
    const periodStart = new Date(Date.parse(`${asOfDate}T00:00:00Z`) - periodDays * DAY).toISOString().slice(0, 10);
    const scopes = await repository.loadPropertyScopes(options.tenantId || null, options.limit || 100);
    const summary = { status: 'COMPLETED', examined: 0, persisted: 0, skipped: [], errors: [] };
    for (const scope of scopes) {
      const tenantId = field(scope, 'tenantId', 'tenant_id'); const propertyId = field(scope, 'propertyId', 'property_id') || scope.id;
      summary.examined += 1;
      try {
        const benchmark = await repository.loadBenchmark(tenantId, propertyId, asOfDate);
        if (!benchmark) { summary.skipped.push({ propertyId, reason: 'NO_BENCHMARK' }); continue; }
        const bookings = await repository.loadBookings(tenantId, propertyId, periodStart, asOfDate);
        const report = Engine.computeChannelEconomics({ bookings, propertyId, periodStart, periodEndExclusive: asOfDate, baseCurrency: 'TRY' });
        const diagnosis = FindingService.diagnose({ report, benchmark, minBookings: options.minBookings });
        for (const observation of diagnosis.observations) {
          const draft = await FindingService.buildFindingDraft({ tenantId, propertyId, observation, currency: 'TRY', periodStart,
            periodEndExclusive: asOfDate, expiresAt: new Date(Date.parse(`${asOfDate}T00:00:00Z`) + 14 * DAY).toISOString() });
          await repository.persistFinding(draft); summary.persisted += 1;
        }
        if (!diagnosis.observations.length) summary.skipped.push({ propertyId, reason: diagnosis.status });
      } catch (error) { summary.errors.push({ propertyId, code: String(error.code || error.message || 'ECONOMICS_WORKER_FAILED').slice(0, 100) }); }
    }
    if (summary.errors.length) summary.status = summary.persisted ? 'PARTIAL' : 'FAILED';
    return summary;
  }
  return { runEconomicsFindings };
}));
