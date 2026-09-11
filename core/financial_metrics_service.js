// =============================================================================
// LEXBNB PHASE 8 — FINANCIAL METRICS SERVICE & COMPUTATION ENGINE
// Canonical Single Source of Truth for Financial & STR Operational Metrics
// =============================================================================

const FINANCE_INSIGHT_THRESHOLDS = {
  HIGH_OCC_PERCENT_DELTA: 15,     // Occupancy > Portfolio Avg + 15%
  LOW_ADR_RATIO: 0.85,            // ADR < Portfolio Avg * 0.85
  HIGH_ADR_RATIO: 1.25,           // ADR > Portfolio Avg * 1.25
  LOW_OCC_RATIO: 0.70,            // Occupancy < Portfolio Avg * 0.70
  EXPENSE_SPIKE_PERCENT: 25,      // Category MoM growth > 25%
  EXPENSE_SPIKE_MIN_AMOUNT: 5000, // Minimum ₺5,000 absolute growth
  LOW_MARGIN_THRESHOLD: 15        // Net cash margin < 15%
};

function roundMoney(val) {
  if (val === null || val === undefined || isNaN(val)) return 0;
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function parseDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
  const parts = String(dateStr).split('T')[0].split('-');
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Split a reservation into stay nights with accrual revenue attribution.
 * USALI Standard: Each night receives an equal share of room accommodation revenue.
 */
function splitBookingStayNights(b) {
  if (!b.checkIn || !b.checkOut) return [];
  const checkIn = parseDate(b.checkIn);
  const checkOut = parseDate(b.checkOut);
  const totalNights = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
  if (totalNights <= 0) return [];

  const gross = Number(b.grossAmount || b.gross || b.gross_amount || 0);
  const cleanFee = Number(b.cleanFee || b.cleaningFee || b.cleaning_fee || 0);
  const discount = Number(b.discount || 0);
  const otaComm = Number(b.otaComm || b.otaCommission || b.ota_commission || 0);

  // Pure Room Accommodation Revenue: gross minus cleaning fee and discount
  const roomRevenue = Math.max(0, gross - cleanFee - discount);
  const roomRevPerNight = totalNights > 0 ? roomRevenue / totalNights : 0;
  const cleanFeePerNight = totalNights > 0 ? cleanFee / totalNights : 0;
  const financialRevPerNight = totalNights > 0 ? (gross - discount) / totalNights : 0;

  const stayNights = [];
  const cur = new Date(checkIn.getTime());

  for (let i = 0; i < totalNights; i++) {
    const dStr = formatDate(cur);
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    stayNights.push({
      bookingId: b.id,
      propertyId: b.propertyId || b.property_id || b.villa,
      date: dStr,
      year: y,
      month: m,
      yearMonth: `${y}-${String(m).padStart(2, '0')}`,
      roomRevenue: roomRevPerNight,
      cleaningRevenue: cleanFeePerNight,
      financialRevenue: financialRevPerNight,
      otaCommission: totalNights > 0 ? otaComm / totalNights : 0,
      channel: b.channel || 'Direct',
      status: b.status || 'CONFIRMED'
    });
    cur.setDate(cur.getDate() + 1);
  }

  return stayNights;
}

/**
 * Calculate Available Nights for active properties in a specific period.
 * Refined domain: supports mid-month activation, inactive properties, and maintenance downtime.
 */
function calculateAvailableNights(properties = [], year, month, maintenances = []) {
  const daysInMonth = getDaysInMonth(year, month);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, daysInMonth);
  let totalAvailable = 0;

  properties.forEach(p => {
    // Check if property is active
    if (p.is_active === false || p.isActive === false) return;

    // Check activation window (if activation date exists)
    let pStart = monthStart;
    let pEnd = monthEnd;

    if (p.created_at || p.createdAt || p.activationDate) {
      const actDate = parseDate(p.activationDate || p.created_at || p.createdAt);
      if (actDate > monthEnd) return; // Not active in this month
      if (actDate > monthStart) pStart = actDate; // Mid-month activation
    }

    if (p.deactivationDate) {
      const deactDate = parseDate(p.deactivationDate);
      if (deactDate < monthStart) return;
      if (deactDate < monthEnd) pEnd = deactDate;
    }

    const propDays = Math.max(0, Math.round((pEnd.getTime() - pStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    
    // Deduct P1 maintenance downtime for this property
    const propKey = p.id || p.slug;
    let downtime = 0;
    maintenances.forEach(m => {
      const mVilla = m.villa || m.property_id || m.propertyId;
      if (mVilla === propKey || mVilla === p.slug || mVilla === p.id) {
        if (m.priority === 'P1' && (m.status === 'OPEN' || m.downtime > 0)) {
          downtime += Number(m.downtime || 1);
        }
      }
    });

    totalAvailable += Math.max(0, propDays - downtime);
  });

  return totalAvailable;
}

/**
 * Core Canonical Metrics Computation
 * Single canonical contract serving dashboard, scorecard, bridge, trends, and AI payload.
 */
function computeFinancialMetrics({
  year,
  month,
  propertyId = null,
  bookings = [],
  expenses = [],
  properties = [],
  targets = [],
  maintenances = [],
  activeTenantId = null
}) {
  const targetYearMonth = `${year}-${String(month).padStart(2, '0')}`;
  
  // 1. Filter relevant properties
  let relevantProperties = properties;
  if (propertyId) {
    relevantProperties = properties.filter(p => p.id === propertyId || p.slug === propertyId);
  }

  // 2. Compute Available Nights
  const availableNights = calculateAvailableNights(relevantProperties, year, month, maintenances);

  // 3. Process Bookings & Stay Nights in target month
  let targetSoldNights = 0;
  let targetRoomRevenue = 0;
  let targetCleaningRevenue = 0;
  let targetFinancialRevenue = 0;
  let totalBookedOtaCommission = 0;

  const validBookings = bookings.filter(b => (b.status || 'CONFIRMED') !== 'CANCELLED');

  validBookings.forEach(b => {
    const bPropId = b.propertyId || b.property_id || b.villa;
    if (propertyId && bPropId !== propertyId) {
      // Check slug match if propertyId is UUID
      const matchedProp = properties.find(p => p.id === propertyId || p.slug === propertyId);
      if (!matchedProp || (bPropId !== matchedProp.id && bPropId !== matchedProp.slug)) {
        return;
      }
    }

    const stayNights = splitBookingStayNights(b);
    const monthNights = stayNights.filter(sn => sn.yearMonth === targetYearMonth);

    monthNights.forEach(sn => {
      targetSoldNights += 1;
      targetRoomRevenue += sn.roomRevenue;
      targetCleaningRevenue += sn.cleaningRevenue;
      targetFinancialRevenue += sn.financialRevenue;
      totalBookedOtaCommission += sn.otaCommission;
    });
  });

  // 4. Process Expenses (OPEX vs CAPEX, Portfolio vs Single Property)
  let totalOpex = 0;
  let totalCapex = 0;
  let unallocatedPortfolioExpenses = 0;
  const categoryTotals = {};

  expenses.forEach(e => {
    const eDateStr = (e.expense_date || e.date || '').substring(0, 7);
    if (eDateStr !== targetYearMonth) return;

    const eAmt = Number(e.amount || 0);
    const eType = (e.expense_type || e.type || 'OPEX').toUpperCase();
    const eCat = (e.category || 'Diğer').trim();
    const ePropId = e.property_id || e.propertyId;

    if (propertyId) {
      // Single Property Scope: only include direct expenses for this property
      const matchedProp = properties.find(p => p.id === propertyId || p.slug === propertyId);
      const matchesProperty = (ePropId === propertyId) || (matchedProp && (ePropId === matchedProp.id || e.villa === matchedProp.slug));
      if (!matchesProperty) return;
    } else {
      // Portfolio Scope: record unallocated expenses
      if (!ePropId && (!e.villa || e.villa === 'ALL')) {
        unallocatedPortfolioExpenses += eAmt;
      }
    }

    if (eType === 'CAPEX') {
      totalCapex += eAmt;
    } else {
      totalOpex += eAmt;
    }

    categoryTotals[eCat] = roundMoney((categoryTotals[eCat] || 0) + eAmt);
  });

  // 5. Financial & STR Calculations (Guarded against NaN & Infinity)
  const finRevenue = roundMoney(targetFinancialRevenue);
  const finOpex = roundMoney(totalOpex);
  const finCapex = roundMoney(totalCapex);
  const operatingProfit = roundMoney(finRevenue - finOpex);
  const netCashProfit = roundMoney(operatingProfit - finCapex);
  const operatingMargin = finRevenue > 0 ? roundMoney((operatingProfit / finRevenue) * 100) : 0;
  const netCashMargin = finRevenue > 0 ? roundMoney((netCashProfit / finRevenue) * 100) : 0;

  const roomRevenue = roundMoney(targetRoomRevenue);
  const cleaningRevenue = roundMoney(targetCleaningRevenue);
  const occupancy = availableNights > 0 ? roundMoney((targetSoldNights / availableNights) * 100) : 0;
  const adr = targetSoldNights > 0 ? roundMoney(roomRevenue / targetSoldNights) : 0;
  const revpar = availableNights > 0 ? roundMoney(roomRevenue / availableNights) : 0;

  // 6. Targets Evaluation
  let targetObj = null;
  if (Array.isArray(targets)) {
    targetObj = targets.find(t => 
      Number(t.year) === Number(year) && 
      Number(t.month) === Number(month) &&
      (propertyId ? (t.property_id === propertyId || t.propertyId === propertyId) : (!t.property_id && !t.propertyId))
    );
  } else if (targets && typeof targets === 'object') {
    targetObj = targets[targetYearMonth] || targets['ALL'] || null;
  }

  const hasTarget = !!targetObj;
  const revTarget = hasTarget ? Number(targetObj.revenue_target || targetObj.revenue || targetObj.targetCiro || 0) : null;
  const profitTarget = hasTarget ? Number(targetObj.net_profit_target || targetObj.profit || 0) : null;
  const occTarget = hasTarget ? Number(targetObj.occupancy_target || targetObj.occupancy || 0) : null;
  const adrTarget = hasTarget ? Number(targetObj.adr_target || targetObj.adr || 0) : null;
  const revparTarget = hasTarget ? Number(targetObj.revpar_target || targetObj.revpar || 0) : null;

  const targetsPayload = {
    hasTarget,
    revenueTarget: revTarget,
    revenueTargetAchievement: (hasTarget && revTarget > 0) ? roundMoney((finRevenue / revTarget) * 100) : null,
    revenueTargetDiff: hasTarget ? roundMoney(finRevenue - revTarget) : null,
    profitTargetDiff: (hasTarget && profitTarget !== null) ? roundMoney(netCashProfit - profitTarget) : null,
    occupancyTargetDiff: (hasTarget && occTarget !== null) ? roundMoney(occupancy - occTarget) : null,
    adrTargetDiff: (hasTarget && adrTarget !== null) ? roundMoney(adr - adrTarget) : null,
    revparTargetDiff: (hasTarget && revparTarget !== null) ? roundMoney(revpar - revparTarget) : null
  };

  // 7. Reconciliation (Booked Room Revenue vs Recorded Financial Revenue)
  const reconciliationDiff = roundMoney(finRevenue - roomRevenue);
  const reconciliationPayload = {
    bookedRoomRevenue: roomRevenue,
    recordedFinancialRevenue: finRevenue,
    difference: reconciliationDiff,
    hasWarning: false,
    warningCode: null
  };

  return {
    period: {
      year: Number(year),
      month: Number(month),
      yearMonth: targetYearMonth
    },
    scope: {
      propertyId: propertyId || null,
      isPortfolio: !propertyId
    },
    financial: {
      revenue: finRevenue,
      operatingExpenses: finOpex,
      capex: finCapex,
      operatingProfit,
      netCashProfit,
      operatingMargin,
      netCashMargin,
      unallocatedPortfolioExpenses: roundMoney(unallocatedPortfolioExpenses),
      categoryBreakdown: categoryTotals
    },
    operations: {
      roomRevenue,
      cleaningRevenue,
      soldNights: targetSoldNights,
      availableNights,
      occupancy,
      adr,
      revpar,
      bookedOtaCommission: roundMoney(totalBookedOtaCommission)
    },
    targets: targetsPayload,
    reconciliation: reconciliationPayload
  };
}

/**
 * Month-over-Month (MoM) and Year-over-Year (YoY) Analytics Engine
 */
function computeComparativeMetrics({ currentMetrics, previousMonthMetrics, previousYearMetrics }) {
  function getChange(curr, prev) {
    if (prev === null || prev === undefined || prev === 0) {
      if (curr === 0) return { changeAmount: 0, changePercent: 0, comparisonAvailable: true };
      return { changeAmount: curr, changePercent: null, comparisonAvailable: false };
    }
    const diff = roundMoney(curr - prev);
    const pct = roundMoney((diff / Math.abs(prev)) * 100);
    return { changeAmount: diff, changePercent: pct, comparisonAvailable: true };
  }

  // MoM
  let mom = { comparisonAvailable: false };
  if (previousMonthMetrics && previousMonthMetrics.financial) {
    mom = {
      comparisonAvailable: true,
      revenue: getChange(currentMetrics.financial.revenue, previousMonthMetrics.financial.revenue),
      operatingExpenses: getChange(currentMetrics.financial.operatingExpenses, previousMonthMetrics.financial.operatingExpenses),
      operatingProfit: getChange(currentMetrics.financial.operatingProfit, previousMonthMetrics.financial.operatingProfit),
      netCashProfit: getChange(currentMetrics.financial.netCashProfit, previousMonthMetrics.financial.netCashProfit),
      occupancy: getChange(currentMetrics.operations.occupancy, previousMonthMetrics.operations.occupancy),
      adr: getChange(currentMetrics.operations.adr, previousMonthMetrics.operations.adr),
      revpar: getChange(currentMetrics.operations.revpar, previousMonthMetrics.operations.revpar)
    };
  }

  // YoY
  let yoy = { comparisonAvailable: false };
  if (previousYearMetrics && previousYearMetrics.financial) {
    yoy = {
      comparisonAvailable: true,
      revenue: getChange(currentMetrics.financial.revenue, previousYearMetrics.financial.revenue),
      operatingExpenses: getChange(currentMetrics.financial.operatingExpenses, previousYearMetrics.financial.operatingExpenses),
      operatingProfit: getChange(currentMetrics.financial.operatingProfit, previousYearMetrics.financial.operatingProfit),
      netCashProfit: getChange(currentMetrics.financial.netCashProfit, previousYearMetrics.financial.netCashProfit),
      occupancy: getChange(currentMetrics.operations.occupancy, previousYearMetrics.operations.occupancy),
      adr: getChange(currentMetrics.operations.adr, previousYearMetrics.operations.adr),
      revpar: getChange(currentMetrics.operations.revpar, previousYearMetrics.operations.revpar)
    };
  }

  return {
    mom,
    yoy,
    inflationDataAvailable: false
  };
}

/**
 * Trend Engine (3M, 6M, 12M, YTD)
 * Supports chronological monthly aggregations with deterministic zero-fill.
 */
function computeTrendTimeline({ range = '6M', endYear, endMonth, context }) {
  const monthsCount = range === '3M' ? 3 : range === '12M' ? 12 : range === 'YTD' ? endMonth : 6;
  const timeline = [];
  
  let curY = endYear;
  let curM = endMonth;

  for (let i = 0; i < monthsCount; i++) {
    const ym = `${curY}-${String(curM).padStart(2, '0')}`;
    const mMetrics = computeFinancialMetrics({
      year: curY,
      month: curM,
      propertyId: context.propertyId || null,
      bookings: context.bookings || [],
      expenses: context.expenses || [],
      properties: context.properties || [],
      targets: context.targets || [],
      maintenances: context.maintenances || []
    });

    timeline.unshift({
      year: curY,
      month: curM,
      yearMonth: ym,
      revenue: mMetrics.financial.revenue,
      operatingExpenses: mMetrics.financial.operatingExpenses,
      capex: mMetrics.financial.capex,
      operatingProfit: mMetrics.financial.operatingProfit,
      netCashProfit: mMetrics.financial.netCashProfit,
      soldNights: mMetrics.operations.soldNights,
      adr: mMetrics.operations.adr,
      occupancy: mMetrics.operations.occupancy
    });

    curM -= 1;
    if (curM < 1) {
      curM = 12;
      curY -= 1;
    }
  }

  return timeline;
}

/**
 * Deterministic Anomaly & Insight Detection
 * Uses central FINANCE_INSIGHT_THRESHOLDS and non-causal descriptions.
 */
function detectAnomaliesAndInsights({ currentMetrics, previousMonthMetrics, propertyScorecards = [] }) {
  const insights = [];
  const T = FINANCE_INSIGHT_THRESHOLDS;

  // 1. High Occupancy + Low ADR on properties
  const portfolioAdr = currentMetrics.operations.adr;
  const portfolioOcc = currentMetrics.operations.occupancy;

  propertyScorecards.forEach(p => {
    if (p.soldNights > 0 && portfolioAdr > 0) {
      if (p.occupancy >= portfolioOcc + T.HIGH_OCC_PERCENT_DELTA && p.adr <= portfolioAdr * T.LOW_ADR_RATIO) {
        insights.push({
          type: 'HIGH_OCC_LOW_ADR',
          severity: 'OPPORTUNITY',
          propertyId: p.propertyId,
          propertyName: p.name,
          title: 'Yüksek Doluluk + Düşük ADR Tespit Edildi',
          message: `${p.name} doluluğu (%${p.occupancy}) portföyün üzerinde, ancak ADR (₺${p.adr}) portföy ortalamasının (%${portfolioOcc}, ₺${portfolioAdr}) altında. Fiyat/talep dengesi incelenebilir.`,
          metric: 'adr',
          currentValue: p.adr,
          targetValue: portfolioAdr
        });
      }

      if (p.adr >= portfolioAdr * T.HIGH_ADR_RATIO && p.occupancy <= portfolioOcc * T.LOW_OCC_RATIO) {
        insights.push({
          type: 'HIGH_ADR_LOW_OCC',
          severity: 'WARNING',
          propertyId: p.propertyId,
          propertyName: p.name,
          title: 'Yüksek ADR + Düşük Doluluk Tespit Edildi',
          message: `${p.name} ADR tutarı (₺${p.adr}) yüksek seyrederken doluluk oranı (%${p.occupancy}) düşük kaldı. Talep direnci incelenebilir.`,
          metric: 'occupancy',
          currentValue: p.occupancy,
          targetValue: portfolioOcc
        });
      }
    }
  });

  // 2. High Revenue + Low Margin
  if (currentMetrics.financial.revenue > 100000 && currentMetrics.financial.netCashMargin < T.LOW_MARGIN_THRESHOLD) {
    insights.push({
      type: 'HIGH_REV_LOW_MARGIN',
      severity: 'WARNING',
      propertyId: null,
      title: 'Yüksek Ciro + Düşük Kâr Marjı',
      message: `Finansal ciro ₺${currentMetrics.financial.revenue.toLocaleString('tr-TR')} seviyesinde olmasına rağmen net nakit kâr marjı %${currentMetrics.financial.netCashMargin} olarak gerçekleşti. Faaliyet giderleri incelenebilir.`,
      metric: 'netCashMargin',
      currentValue: currentMetrics.financial.netCashMargin,
      targetValue: T.LOW_MARGIN_THRESHOLD
    });
  }

  // 3. Category Expense Spike (MoM)
  if (previousMonthMetrics && previousMonthMetrics.financial && previousMonthMetrics.financial.categoryBreakdown) {
    const curCats = currentMetrics.financial.categoryBreakdown || {};
    const prevCats = previousMonthMetrics.financial.categoryBreakdown || {};

    Object.keys(curCats).forEach(cat => {
      const curAmt = curCats[cat] || 0;
      const prevAmt = prevCats[cat] || 0;
      const diff = curAmt - prevAmt;
      if (prevAmt > 0 && diff >= T.EXPENSE_SPIKE_MIN_AMOUNT) {
        const pctGrowth = (diff / prevAmt) * 100;
        if (pctGrowth >= T.EXPENSE_SPIKE_PERCENT) {
          insights.push({
            type: 'EXPENSE_SPIKE',
            severity: 'WARNING',
            propertyId: null,
            title: `Gider Sıçraması: ${cat}`,
            message: `${cat} kategorisi önceki aya göre %${roundMoney(pctGrowth)} artarak ₺${curAmt.toLocaleString('tr-TR')} seviyesine ulaştı (+₺${diff.toLocaleString('tr-TR')}).`,
            metric: 'categoryExpense',
            currentValue: curAmt,
            targetValue: prevAmt
          });
        }
      }
    });
  }

  return insights;
}

/**
 * Property Scorecard Generator
 * Produces clean per-property analytics with direct costs and profit contributions.
 */
function computePropertyScorecards({ year, month, properties = [], bookings = [], expenses = [], maintenances = [] }) {
  const activeProps = properties.filter(p => p.is_active !== false && p.isActive !== false);
  
  return activeProps.map(p => {
    const pId = p.id;
    const pSlug = p.slug;
    const m = computeFinancialMetrics({
      year,
      month,
      propertyId: pId,
      bookings,
      expenses,
      properties,
      maintenances
    });

    return {
      propertyId: pId,
      slug: pSlug,
      name: p.name || pSlug,
      revenue: m.financial.revenue,
      roomRevenue: m.operations.roomRevenue,
      soldNights: m.operations.soldNights,
      availableNights: m.operations.availableNights,
      occupancy: m.operations.occupancy,
      adr: m.operations.adr,
      revpar: m.operations.revpar,
      directOperatingExpense: m.financial.operatingExpenses,
      estimatedOperatingContribution: m.financial.operatingProfit,
      directCapex: m.financial.capex
    };
  });
}

/**
 * AI Finance Analyst Payload Builder
 * Prepares strict, sanitized, structured payload for LLM analysis. Never exposes raw database dumps.
 */
function buildAiAnalystPayload({ metrics, comparative, scorecards = [], anomalies = [] }) {
  return {
    period: metrics.period.yearMonth,
    financialSummary: {
      revenue: metrics.financial.revenue,
      operatingExpenses: metrics.financial.operatingExpenses,
      capex: metrics.financial.capex,
      operatingProfit: metrics.financial.operatingProfit,
      netCashProfit: metrics.financial.netCashProfit,
      operatingMargin: metrics.financial.operatingMargin,
      netCashMargin: metrics.financial.netCashMargin
    },
    operationsSummary: {
      roomRevenue: metrics.operations.roomRevenue,
      soldNights: metrics.operations.soldNights,
      availableNights: metrics.operations.availableNights,
      occupancy: metrics.operations.occupancy,
      adr: metrics.operations.adr,
      revpar: metrics.operations.revpar
    },
    targets: metrics.targets,
    reconciliation: metrics.reconciliation,
    comparisons: {
      mom: comparative.mom,
      yoy: comparative.yoy
    },
    properties: scorecards.map(s => ({
      name: s.name,
      revenue: s.revenue,
      soldNights: s.soldNights,
      occupancy: s.occupancy,
      adr: s.adr,
      revpar: s.revpar,
      contribution: s.estimatedOperatingContribution
    })),
    detectedAnomalies: anomalies
  };
}

/**
 * Validate AI Response Schema
 */
function validateAiResponseSchema(response) {
  if (!response || typeof response !== 'object') return false;
  if (!Array.isArray(response.wins)) return false;
  if (!Array.isArray(response.risks)) return false;
  if (!Array.isArray(response.observations)) return false;
  if (!Array.isArray(response.actions)) return false;

  for (const act of response.actions) {
    if (!act.title || typeof act.title !== 'string') return false;
    if (!act.priority || !['LOW', 'MEDIUM', 'HIGH'].includes(act.priority)) return false;
  }

  return true;
}

// Universal Exports (Node.js CommonJS + Browser Window)
const FinancialMetricsService = {
  FINANCE_INSIGHT_THRESHOLDS,
  roundMoney,
  parseDate,
  formatDate,
  getDaysInMonth,
  splitBookingStayNights,
  calculateAvailableNights,
  computeFinancialMetrics,
  computeComparativeMetrics,
  computeTrendTimeline,
  detectAnomaliesAndInsights,
  computePropertyScorecards,
  buildAiAnalystPayload,
  validateAiResponseSchema
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FinancialMetricsService;
}
if (typeof window !== 'undefined') {
  window.FinancialMetricsService = FinancialMetricsService;
}
