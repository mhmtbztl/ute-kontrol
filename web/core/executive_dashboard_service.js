// =============================================================================
// LEXBNB PHASE 12 — EXECUTIVE DASHBOARD & HEALTH SERVICE
// Top KPIs with Target Variances, Explainable Portfolio Health, Property Cards,
// Alert State Machine (OPEN -> ACKNOWLEDGED -> RESOLVED), and Onboarding Checklist.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ExecutiveDashboardService = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function roundMoney(val) {
    return Math.round((Number(val) || 0) * 100) / 100;
  }

  /**
   * Computes top executive KPIs with target variance and prior period comparisons.
   */
  function computeExecutiveTopKpis(params) {
    const {
      bookings = [],
      expenses = [],
      targets = {},
      forecast = {},
      propertiesCount = 1,
      daysInMonth = 30,
      priorPeriodMetrics = null
    } = params;

    let currentRevenue = 0;
    let bookedNights = 0;

    bookings.forEach(b => {
      if (b.status !== 'CANCELLED') {
        currentRevenue += Number(b.gross_amount || b.grossAmount || 0);
        const nights = b.nights || 1;
        bookedNights += nights;
      }
    });

    let currentExpenses = 0;
    expenses.forEach(e => {
      currentExpenses += Number(e.amount || 0);
    });

    currentRevenue = roundMoney(currentRevenue);
    currentExpenses = roundMoney(currentExpenses);
    const netCashProfit = roundMoney(currentRevenue - currentExpenses);

    const totalAvailableRoomNights = Math.max(1, propertiesCount * daysInMonth);
    const occupancyRate = roundMoney((bookedNights / totalAvailableRoomNights) * 100);
    const adr = bookedNights > 0 ? roundMoney(currentRevenue / bookedNights) : 0;
    const revpar = roundMoney(currentRevenue / totalAvailableRoomNights);
    const forecastedTotalRevenue = forecast.forecastedTotalRevenue || currentRevenue;

    // Target comparisons
    const targetRevenue = Number(targets.revenue_target || targets.revenueTarget || 0);
    const targetProfit = Number(targets.profit_target || targets.profitTarget || 0);
    const targetOccupancy = Number(targets.occupancy_target || targets.occupancyTarget || 75);

    function calcVariance(current, target) {
      if (!target || target === 0) return { varianceAmount: 0, variancePercent: 0, status: 'NEUTRAL' };
      const diff = roundMoney(current - target);
      const pct = Math.round((diff / target) * 100);
      return {
        varianceAmount: diff,
        variancePercent: pct,
        status: diff >= 0 ? 'ON_TARGET' : 'BELOW_TARGET'
      };
    }

    return {
      revenue: {
        current: currentRevenue,
        target: targetRevenue,
        variance: calcVariance(currentRevenue, targetRevenue),
        prior: priorPeriodMetrics ? priorPeriodMetrics.revenue : null
      },
      netProfit: {
        current: netCashProfit,
        target: targetProfit,
        variance: calcVariance(netCashProfit, targetProfit),
        prior: priorPeriodMetrics ? priorPeriodMetrics.netProfit : null
      },
      occupancy: {
        current: occupancyRate,
        target: targetOccupancy,
        variance: calcVariance(occupancyRate, targetOccupancy),
        prior: priorPeriodMetrics ? priorPeriodMetrics.occupancy : null
      },
      adr: {
        current: adr,
        prior: priorPeriodMetrics ? priorPeriodMetrics.adr : null
      },
      revpar: {
        current: revpar,
        prior: priorPeriodMetrics ? priorPeriodMetrics.revpar : null
      },
      forecast: {
        monthEndRevenue: forecastedTotalRevenue,
        confidence: forecast.confidence || 'MEDIUM',
        target: targetRevenue,
        variance: calcVariance(forecastedTotalRevenue, targetRevenue)
      }
    };
  }

  /**
   * Evaluates explainable portfolio health with distinct sub-domain statuses.
   */
  function evaluatePortfolioHealth(params) {
    const {
      kpis,
      tasks = [],
      tickets = [],
      alerts = [],
      gapNights = [],
      failedMessagesCount = 0,
      openLeadsCount = 0
    } = params;

    const domains = {};

    // 1. Revenue Health
    const revVariance = kpis.revenue.variance;
    if (revVariance.status === 'BELOW_TARGET' && revVariance.variancePercent < -25) {
      domains.revenue = { status: 'CRITICAL', reason: `Ciro hedefin %${Math.abs(revVariance.variancePercent)} gerisinde` };
    } else if (revVariance.status === 'BELOW_TARGET') {
      domains.revenue = { status: 'ATTENTION', reason: 'Ciro hedefin hafif altında seyrediyor' };
    } else {
      domains.revenue = { status: 'HEALTHY', reason: 'Ciro hedef seviyesinde veya üzerinde' };
    }

    // 2. Operations Health
    const criticalTasks = tasks.filter(t => t.priority === 'CRITICAL' && (t.status === 'TODO' || t.status === 'IN_PROGRESS'));
    const criticalTickets = tickets.filter(t => t.severity === 'P1_CRITICAL' && t.status === 'OPEN');
    if (criticalTickets.length > 0 || criticalTasks.length > 2) {
      domains.operations = { status: 'CRITICAL', reason: `${criticalTickets.length} acil bakım bileti ve ${criticalTasks.length} kritik görev var` };
    } else if (criticalTasks.length > 0 || tasks.some(t => t.isOverdue)) {
      domains.operations = { status: 'ATTENTION', reason: 'Gecikmiş veya açık kritik operasyonel görevler mevcut' };
    } else {
      domains.operations = { status: 'HEALTHY', reason: 'Tüm operasyonel görevler ve bakımlar kontrol altında' };
    }

    // 3. Guest Experience Health
    if (failedMessagesCount > 2) {
      domains.guestExperience = { status: 'CRITICAL', reason: `${failedMessagesCount} misafir mesajı iletiminde hata oluştu` };
    } else if (failedMessagesCount > 0) {
      domains.guestExperience = { status: 'ATTENTION', reason: 'İletilemeyen misafir bildirimleri kontrol edilmeli' };
    } else {
      domains.guestExperience = { status: 'HEALTHY', reason: 'Misafir iletişim otomasyonu sorunsuz çalışıyor' };
    }

    // 4. Pricing Health
    if (gapNights.length > 3) {
      domains.pricing = { status: 'ATTENTION', reason: `${gapNights.length} adet boşluk gece satış bekliyor` };
    } else {
      domains.pricing = { status: 'HEALTHY', reason: 'Dinamik fiyatlandırma ve takvim kuralları aktif' };
    }

    // 5. Sales Pipeline Health
    if (openLeadsCount > 5) {
      domains.sales = { status: 'ATTENTION', reason: `${openLeadsCount} potansiyel müşteri takipsiz bekliyor` };
    } else {
      domains.sales = { status: 'HEALTHY', reason: 'Satış kanalı ve dönüşüm takibi güncel' };
    }

    // Overall Synthesis
    const subStatuses = Object.values(domains).map(d => d.status);
    let overall = 'HEALTHY';
    if (subStatuses.includes('CRITICAL')) {
      overall = 'CRITICAL';
    } else if (subStatuses.includes('ATTENTION')) {
      overall = 'ATTENTION';
    }

    return {
      overallStatus: overall,
      domains,
      reasons: Object.entries(domains).map(([key, val]) => `${key.toUpperCase()}: ${val.reason}`)
    };
  }

  /**
   * Generates property health cards with readiness, occupancy, revenue, and next action.
   */
  function generatePropertyHealthCards(properties, context = {}) {
    const {
      bookings = [],
      tasks = [],
      tickets = [],
      gapNights = []
    } = context;

    return properties.map(prop => {
      const propId = prop.id || prop.dbId;

      const propBookings = bookings.filter(b => (b.property_id === propId || b.propertyId === propId) && b.status !== 'CANCELLED');
      const propTasks = tasks.filter(t => (t.property_id === propId || t.propertyId === propId) && t.status !== 'DONE');
      const propTickets = tickets.filter(t => (t.property_id === propId || t.propertyId === propId) && t.status !== 'RESOLVED');

      let rev = 0;
      let nights = 0;
      propBookings.forEach(b => {
        rev += Number(b.gross_amount || b.grossAmount || 0);
        nights += (b.nights || 1);
      });

      const adr = nights > 0 ? roundMoney(rev / nights) : Number(prop.base_price || 0);

      // Determine readiness
      let readiness = 'READY';
      if (propTickets.some(t => t.severity === 'P1_CRITICAL')) {
        readiness = 'MAINTENANCE_BLOCKED';
      } else if (propTasks.some(t => t.task_type === 'CLEANING' && t.status !== 'DONE')) {
        readiness = 'NEEDS_CLEANING';
      }

      // Next important action
      let nextAction = { title: 'Tüm süreçler yolunda', deepLink: `/properties/${propId}` };
      if (readiness === 'MAINTENANCE_BLOCKED') {
        nextAction = { title: 'Kritik arıza müdahalesi bekleniyor', deepLink: `/operations?propertyId=${propId}&tab=maintenance` };
      } else if (readiness === 'NEEDS_CLEANING') {
        nextAction = { title: 'Temizlik tamamlama kontrolü yapın', deepLink: `/operations?propertyId=${propId}&tab=cleaning` };
      }

      return {
        propertyId: propId,
        propertyName: prop.name,
        readiness,
        revenue: roundMoney(rev),
        bookedNights: nights,
        adr,
        openMaintenanceCount: propTickets.length,
        openTasksCount: propTasks.length,
        nextAction
      };
    });
  }

  /**
   * Explicit Alert State Machine: OPEN -> ACKNOWLEDGED -> RESOLVED.
   * If a resolved condition re-occurs, starts a deterministic new lifecycle.
   */
  function transitionAlertState(alert, targetState, options = {}) {
    const validTransitions = {
      OPEN: ['ACKNOWLEDGED', 'RESOLVED'],
      ACKNOWLEDGED: ['RESOLVED'],
      RESOLVED: [] // Terminal unless re-opened via new instance
    };

    if (!validTransitions[alert.status] || !validTransitions[alert.status].includes(targetState)) {
      throw new Error(`INVALID_ALERT_TRANSITION: Cannot transition alert from ${alert.status} to ${targetState}`);
    }

    const updated = {
      ...alert,
      status: targetState,
      updated_at: new Date().toISOString()
    };

    if (targetState === 'ACKNOWLEDGED') {
      updated.acknowledged_at = new Date().toISOString();
      updated.acknowledged_by = options.userId || null;
    } else if (targetState === 'RESOLVED') {
      updated.resolved_at = new Date().toISOString();
      updated.resolved_by = options.userId || null;
    }

    return updated;
  }

  /**
   * Starts a brand new alert lifecycle if a previously resolved issue re-occurs.
   */
  function createOrReopenAlert(existingAlert, newIssueData) {
    if (existingAlert && existingAlert.status === 'RESOLVED') {
      // Re-occurrence: initiate a brand new alert instance
      return {
        id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        status: 'OPEN',
        isReoccurrence: true,
        previousAlertId: existingAlert.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...newIssueData
      };
    }
    if (existingAlert) {
      // Already OPEN or ACKNOWLEDGED -> return existing without duplication
      return existingAlert;
    }
    // Brand new alert
    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...newIssueData
    };
  }

  /**
   * Calculates 10-step onboarding progress for new tenants.
   */
  function computeTenantOnboardingProgress(tenantData = {}) {
    const steps = [
      { id: 'create_tenant', title: 'İşletme Hesabı Oluşturuldu', completed: Boolean(tenantData.tenantId) },
      { id: 'add_property', title: 'İlk Mülk Eklendi', completed: (tenantData.propertiesCount || 0) > 0 },
      { id: 'pricing_profile', title: 'Fiyatlandırma Profili Tanımlandı', completed: Boolean(tenantData.hasPricingProfile) },
      { id: 'guest_settings', title: 'Misafir İletişim Ayarları Yapıldı', completed: Boolean(tenantData.hasGuestSettings) },
      { id: 'cleaning_checklist', title: 'Temizlik Kontrol Listesi Hazırlandı', completed: Boolean(tenantData.hasCleaningChecklist) },
      { id: 'team_member', title: 'Ekip Üyesi Davet Edildi', completed: Boolean(tenantData.hasTeamMembers) },
      { id: 'message_templates', title: 'Mesaj Şablonları Aktifleştirildi', completed: Boolean(tenantData.hasMessageTemplates) },
      { id: 'monthly_targets', title: 'Aylık Ciro Hedefi Belirlendi', completed: Boolean(tenantData.hasMonthlyTargets) },
      { id: 'first_booking', title: 'İlk Rezervasyon Kaydedildi', completed: (tenantData.bookingsCount || 0) > 0 },
      { id: 'finance_setup', title: 'Finansal Başlangıç Yapıldı', completed: Boolean(tenantData.hasFinanceTransactions) }
    ];

    const completedCount = steps.filter(s => s.completed).length;
    const progressPercent = Math.round((completedCount / steps.length) * 100);

    return {
      steps,
      completedCount,
      totalSteps: steps.length,
      progressPercent,
      isFullyOnboarded: completedCount === steps.length
    };
  }

  return {
    roundMoney,
    computeExecutiveTopKpis,
    evaluatePortfolioHealth,
    generatePropertyHealthCards,
    transitionAlertState,
    createOrReopenAlert,
    computeTenantOnboardingProgress
  };
}));
