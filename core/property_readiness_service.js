// =============================================================================
// LEXBNB PHASE 9 — PROPERTY READINESS & HEALTH ENGINE
// Cycle-aware, derived property readiness state (READY, ATTENTION, NOT_READY).
// No mutable boolean flags on properties — derived directly from bookings,
// operational tasks, and maintenance tickets with transparent sub-metrics.
// =============================================================================

/**
 * Computes cycle-aware operational health and readiness state for a property.
 * @param {Object} property - Property entity
 * @param {Array<Object>} tasks - Tasks for this property
 * @param {Array<Object>} tickets - Maintenance tickets for this property
 * @param {Array<Object>} bookings - Bookings for this property
 * @param {Date|string} [currentDate] - Current reference date/time
 * @returns {{
 *   readinessState: 'READY' | 'ATTENTION' | 'NOT_READY',
 *   healthScore: number,
 *   submetrics: {
 *     cleaningReadiness: 'CLEAN' | 'IN_PROGRESS' | 'DIRTY',
 *     overdueTasksCount: number,
 *     openMaintenanceCount: number,
 *     criticalMaintenanceCount: number,
 *     upcomingCheckInHours: number|null,
 *     tightTurnoverRisk: boolean
 *   },
 *   reasons: Array<string>
 * }}
 */
function computePropertyOperationsHealth(property, tasks = [], tickets = [], bookings = [], currentDate = new Date()) {
  const now = new Date(currentDate);
  const reasons = [];

  const propTasks = (tasks || []).filter(t => t.property_id === property.id || t.propertyId === property.id);
  const propTickets = (tickets || []).filter(t => t.property_id === property.id || t.propertyId === property.id);
  const propBookings = (bookings || []).filter(b => (b.property_id === property.id || b.propertyId === property.id || b.villa === property.slug) && b.status !== 'CANCELLED');

  // 1. Identify latest checkout and next upcoming check-in
  let latestCheckoutTime = null;
  let nextCheckinTime = null;
  let nextBooking = null;

  const sortedBookings = [...propBookings].sort((a, b) => new Date(a.check_in || a.checkIn).getTime() - new Date(b.check_in || b.checkIn).getTime());

  for (const b of sortedBookings) {
    const checkinTime = new Date(b.check_in || b.checkIn).getTime();
    const checkoutTime = new Date(b.check_out || b.checkOut).getTime();

    if (checkoutTime <= now.getTime()) {
      if (!latestCheckoutTime || checkoutTime > latestCheckoutTime) {
        latestCheckoutTime = checkoutTime;
      }
    }

    if (checkinTime >= now.getTime()) {
      if (!nextCheckinTime || checkinTime < nextCheckinTime) {
        nextCheckinTime = checkinTime;
        nextBooking = b;
      }
    }
  }

  // 2. Cycle-Aware Cleaning Verification
  // A cleaning completion is valid ONLY if completed_at >= latestCheckoutTime
  const cleaningTasks = propTasks.filter(t => t.task_type === 'CLEANING');
  let validTurnoverFound = false;
  let cleaningInProgress = false;
  let checklistIncomplete = false;

  for (const ct of cleaningTasks) {
    if (ct.status === 'IN_PROGRESS') {
      cleaningInProgress = true;
    }

    if (ct.status === 'DONE') {
      const completedTime = ct.completed_at ? new Date(ct.completed_at).getTime() : 0;
      
      // If there was a previous checkout, completion must be at or after that checkout
      if (!latestCheckoutTime || completedTime >= latestCheckoutTime) {
        // Verify required checklist items
        const checklist = ct.checklist || [];
        const requiredPending = checklist.some(item => item.required && !item.completed);
        
        if (requiredPending) {
          checklistIncomplete = true;
          reasons.push('Temizlik kontrol listesinde zorunlu maddeler eksik.');
        } else {
          validTurnoverFound = true;
        }
      }
    }
  }

  let cleaningReadiness = 'DIRTY';
  if (validTurnoverFound && !checklistIncomplete) {
    cleaningReadiness = 'CLEAN';
  } else if (cleaningInProgress) {
    cleaningReadiness = 'IN_PROGRESS';
    reasons.push('Temizlik şu anda devam ediyor.');
  } else {
    if (latestCheckoutTime && !validTurnoverFound) {
      reasons.push('Son çıkış sonrasında tamamlanmış geçerli bir temizlik kaydı bulunmuyor.');
    }
  }

  // 3. Maintenance Analysis
  const openTickets = propTickets.filter(t => ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS'].includes(t.status));
  const criticalTickets = openTickets.filter(t => t.severity === 'CRITICAL' || t.booking_impact);

  if (criticalTickets.length > 0) {
    reasons.push(`${criticalTickets.length} adet kritik/rezervasyon etkileyen açık bakım kaydı mevcut.`);
  }

  // 4. Overdue Tasks Analysis
  const overdueTasks = propTasks.filter(t => {
    if (['DONE', 'CANCELLED'].includes(t.status)) return false;
    if (!t.due_at) return false;
    return new Date(t.due_at).getTime() < now.getTime();
  });

  if (overdueTasks.length > 0) {
    reasons.push(`${overdueTasks.length} adet gecikmiş operasyonel görev mevcut.`);
  }

  // 5. Upcoming Check-in Proximity & Tight Turnover Risk
  let upcomingHours = null;
  let tightTurnoverRisk = false;

  if (nextCheckinTime) {
    upcomingHours = Math.max(0, Math.round((nextCheckinTime - now.getTime()) / (3600 * 1000) * 10) / 10);
    
    // Check if next booking is a tight turnover
    if (nextBooking?.metadata?.is_tight_turnover || nextBooking?.is_tight_turnover) {
      tightTurnoverRisk = true;
      if (cleaningReadiness !== 'CLEAN') {
        reasons.push('Sıkışık dönüşümlü (aynı gün) yaklaşan giriş mevcut ve mülk henüz temizlenmedi.');
      }
    }
  }

  // 6. Deterministic Readiness State Derivation
  let readinessState = 'READY';

  // Hard blocking conditions -> NOT_READY
  if (criticalTickets.length > 0) {
    readinessState = 'NOT_READY';
  } else if (cleaningReadiness !== 'CLEAN' && upcomingHours !== null && upcomingHours <= 4) {
    readinessState = 'NOT_READY';
    reasons.push('Girişe 4 saatten az kaldı ancak mülk temizliği hazır değil.');
  } else if (checklistIncomplete) {
    readinessState = 'NOT_READY';
  } else if (openTickets.length > 0 || overdueTasks.length > 0 || cleaningReadiness !== 'CLEAN' || tightTurnoverRisk) {
    // Non-blocking issues -> ATTENTION
    readinessState = 'ATTENTION';
    if (cleaningReadiness !== 'CLEAN' && (upcomingHours === null || upcomingHours > 4)) {
      reasons.push('Mülk temizliği henüz tamamlanmadı.');
    }
  }

  // 7. Transparent Health Score Calculation (0 - 100)
  let healthScore = 100;
  if (criticalTickets.length > 0) healthScore -= 50 * criticalTickets.length;
  if (openTickets.length > 0) healthScore -= 10 * (openTickets.length - criticalTickets.length);
  if (cleaningReadiness === 'DIRTY') healthScore -= 25;
  if (cleaningReadiness === 'IN_PROGRESS') healthScore -= 10;
  if (overdueTasks.length > 0) healthScore -= 15 * overdueTasks.length;
  if (tightTurnoverRisk && cleaningReadiness !== 'CLEAN') healthScore -= 20;

  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    readinessState,
    healthScore,
    submetrics: {
      cleaningReadiness,
      overdueTasksCount: overdueTasks.length,
      openMaintenanceCount: openTickets.length,
      criticalMaintenanceCount: criticalTickets.length,
      upcomingCheckInHours: upcomingHours,
      tightTurnoverRisk
    },
    reasons
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computePropertyOperationsHealth
  };
}

if (typeof window !== 'undefined') {
  window.computePropertyOperationsHealth = computePropertyOperationsHealth;
}
