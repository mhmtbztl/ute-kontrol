// =============================================================================
// LEXBNB PHASE 9 — TODAY OPERATIONS DASHBOARD SERVICE
// Canonical aggregation for today's short-term rental operations.
// Timezone-safe local date resolution. Six actionable buckets:
// 1. Kritik (Emergency / SLA Breached / Tight Turnover Alert)
// 2. Check-in (Today arrivals & prep)
// 3. Check-out (Today departures)
// 4. Temizlik (Turnover & refresh cleanings)
// 5. Bakım (Open maintenance tickets)
// 6. Yaklaşan (24-48h upcoming operations)
// =============================================================================

// Node tarafinda bagimliliklar require ile gelir. Tarayicida ayni
// fonksiyonlar onceki <script> etiketleriyle zaten global kapsamdadir;
// ust seviyede const ile yeniden bildirmek SyntaxError verir ve bu
// dosyanin tamamen calismamasina yol acar.
if (typeof require !== 'undefined') {
  var { evaluateTaskSla } = require('./operations_sla_service.js');
  var { computeTaskPriority } = require('./operations_priority_engine.js');
}


/**
 * Resolves local date string (YYYY-MM-DD) for a given timezone.
 * Defaults to Europe/Istanbul if not specified.
 * @param {Date|string} [date]
 * @param {string} [timeZone]
 * @returns {string}
 */
function getTenantLocalDateStr(date = new Date(), timeZone = 'Europe/Istanbul') {
  const d = new Date(date);
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    return formatter.format(d);
  } catch (e) {
    return d.toISOString().split('T')[0];
  }
}

/**
 * Builds Today Operations Dashboard state.
 * @param {Object} params
 * @param {Array<Object>} params.tasks
 * @param {Array<Object>} params.tickets
 * @param {Array<Object>} params.bookings
 * @param {Array<Object>} params.properties
 * @param {Date|string} [params.referenceDate]
 * @param {string} [params.timeZone]
 * @returns {Object} Dashboard view payload
 */
function buildTodayOperationsDashboard({ tasks = [], tickets = [], bookings = [], properties = [], referenceDate = new Date(), timeZone = 'Europe/Istanbul' }) {
  const todayStr = getTenantLocalDateStr(referenceDate, timeZone);
  const refDateObj = new Date(referenceDate);

  // Tomorrow & Day After Tomorrow dates
  const tomorrowObj = new Date(refDateObj.getTime() + 24 * 3600 * 1000);
  const dayAfterTomorrowObj = new Date(refDateObj.getTime() + 48 * 3600 * 1000);
  const tomorrowStr = getTenantLocalDateStr(tomorrowObj, timeZone);
  const dayAfterStr = getTenantLocalDateStr(dayAfterTomorrowObj, timeZone);

  const activeBookings = (bookings || []).filter(b => b.status !== 'CANCELLED');
  const activeTasks = (tasks || []).filter(t => t.status !== 'CANCELLED');
  const activeTickets = (tickets || []).filter(t => t.status !== 'CANCELLED');

  const propertyMap = new Map((properties || []).map(p => [p.id, p]));

  // 1. KRİTİK (Critical alerts: SLA breaches, Critical maintenance, Tight turnover issues)
  const critical = [];

  for (const t of activeTasks) {
    if (t.status === 'DONE') continue;
    const sla = evaluateTaskSla(t, referenceDate);
    const isCriticalPriority = t.priority === 'CRITICAL';
    const isTightTurnoverAlert = t.metadata?.is_tight_turnover && (t.due_at && t.due_at.startsWith(todayStr));

    if (sla.isSlaBreached || isCriticalPriority || isTightTurnoverAlert) {
      critical.push({
        type: 'TASK',
        item: t,
        property: propertyMap.get(t.property_id),
        reason: sla.isSlaBreached ? 'SLA_BREACHED' : (isCriticalPriority ? 'CRITICAL_PRIORITY' : 'TIGHT_TURNOVER_ALERT'),
        sla
      });
    }
  }

  for (const ticket of activeTickets) {
    if (ticket.status === 'RESOLVED') continue;
    if (ticket.severity === 'CRITICAL' || ticket.booking_impact) {
      critical.push({
        type: 'MAINTENANCE',
        item: ticket,
        property: propertyMap.get(ticket.property_id),
        reason: ticket.severity === 'CRITICAL' ? 'CRITICAL_MAINTENANCE' : 'BOOKING_IMPACT_MAINTENANCE'
      });
    }
  }

  // 2. CHECK-IN (Arrivals today)
  const checkinsToday = activeBookings
    .filter(b => (b.check_in || b.checkIn) === todayStr)
    .map(b => ({
      booking: b,
      property: propertyMap.get(b.property_id || b.propertyId),
      prepTask: activeTasks.find(t => (t.booking_id === b.id || t.bookingId === b.id) && t.task_type === 'CHECKIN_PREP')
    }));

  // 3. CHECK-OUT (Departures today)
  const checkoutsToday = activeBookings
    .filter(b => (b.check_out || b.checkOut) === todayStr)
    .map(b => ({
      booking: b,
      property: propertyMap.get(b.property_id || b.propertyId),
      turnoverTask: activeTasks.find(t => (t.booking_id === b.id || t.bookingId === b.id) && t.task_type === 'CLEANING')
    }));

  // 4. TEMİZLİK (Cleanings scheduled for today)
  const cleaningsToday = activeTasks
    .filter(t => t.task_type === 'CLEANING' && (t.due_at && t.due_at.startsWith(todayStr)))
    .map(t => ({
      task: t,
      property: propertyMap.get(t.property_id),
      sla: evaluateTaskSla(t, referenceDate)
    }));

  // 5. BAKIM (Open maintenance tickets)
  const openMaintenance = activeTickets
    .filter(ticket => ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS'].includes(ticket.status))
    .map(ticket => ({
      ticket,
      property: propertyMap.get(ticket.property_id)
    }));

  // 6. YAKLAŞAN (Next 24-48h upcoming checkins, checkouts, and tasks)
  const upcoming = [];
  for (const b of activeBookings) {
    const cin = b.check_in || b.checkIn;
    const cout = b.check_out || b.checkOut;
    if (cin === tomorrowStr || cin === dayAfterStr) {
      upcoming.push({
        type: 'UPCOMING_CHECKIN',
        date: cin,
        booking: b,
        property: propertyMap.get(b.property_id || b.propertyId)
      });
    }
    if (cout === tomorrowStr || cout === dayAfterStr) {
      upcoming.push({
        type: 'UPCOMING_CHECKOUT',
        date: cout,
        booking: b,
        property: propertyMap.get(b.property_id || b.propertyId)
      });
    }
  }

  return {
    today: todayStr,
    timeZone,
    counts: {
      critical: critical.length,
      checkins: checkinsToday.length,
      checkouts: checkoutsToday.length,
      cleanings: cleaningsToday.length,
      openMaintenance: openMaintenance.length,
      upcoming: upcoming.length
    },
    sections: {
      critical,
      checkinsToday,
      checkoutsToday,
      cleaningsToday,
      openMaintenance,
      upcoming
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getTenantLocalDateStr,
    buildTodayOperationsDashboard
  };
}

if (typeof window !== 'undefined') {
  window.getTenantLocalDateStr = getTenantLocalDateStr;
  window.buildTodayOperationsDashboard = buildTodayOperationsDashboard;
}
