// =============================================================================
// LEXBNB PHASE 9 — OPERATIONS SLA SERVICE
// Canonical SLA deadline calculation and breach detection across task types.
// =============================================================================

const OPERATIONS_SLA_CONFIG = {
  CRITICAL_MAINTENANCE: {
    durationHours: 2
  },
  HIGH_MAINTENANCE: {
    durationHours: 6
  },
  CHECKIN_PREP: {
    bufferHoursBeforeCheckin: 2
  },
  TIGHT_TURNOVER_CLEANING: {
    bufferHoursBeforeNextCheckin: 1
  },
  STANDARD_TURNOVER_CLEANING: {
    defaultCheckoutHour: 11,
    defaultNextCheckinHour: 15,
    bufferHoursBeforeNextCheckin: 1
  }
};

/**
 * Calculates SLA deadline for an operational task.
 * @param {Object} task
 * @param {Object} context
 * @param {Object} [configOverride]
 * @returns {Date|null}
 */
function calculateSlaDeadline(task, context = {}, configOverride = null) {
  const config = configOverride ? { ...OPERATIONS_SLA_CONFIG, ...configOverride } : OPERATIONS_SLA_CONFIG;

  if (task.task_type === 'MAINTENANCE') {
    const createdAt = task.created_at ? new Date(task.created_at) : (context.currentDate ? new Date(context.currentDate) : new Date());
    if (task.priority === 'CRITICAL') {
      return new Date(createdAt.getTime() + config.CRITICAL_MAINTENANCE.durationHours * 3600 * 1000);
    } else if (task.priority === 'HIGH') {
      return new Date(createdAt.getTime() + config.HIGH_MAINTENANCE.durationHours * 3600 * 1000);
    }
  }

  if (task.task_type === 'CHECKIN_PREP' && context.checkinTime) {
    const checkin = new Date(context.checkinTime);
    return new Date(checkin.getTime() - config.CHECKIN_PREP.bufferHoursBeforeCheckin * 3600 * 1000);
  }

  if (task.task_type === 'CLEANING') {
    const isTight = task.metadata?.is_tight_turnover || context.isTightTurnover;
    if (isTight && context.nextCheckinTime) {
      const nextCheckin = new Date(context.nextCheckinTime);
      return new Date(nextCheckin.getTime() - config.TIGHT_TURNOVER_CLEANING.bufferHoursBeforeNextCheckin * 3600 * 1000);
    }
  }

  // Fallback: If due_at is provided, SLA breach occurs at due_at
  if (task.due_at) {
    return new Date(task.due_at);
  }

  return null;
}

/**
 * Evaluates whether an operational task has breached its SLA or is nearing breach.
 * @param {Object} task
 * @param {Date|string} [currentDate]
 * @returns {{ isSlaBreached: boolean, remainingHours: number|null, deadline: string|null, status: string }}
 */
function evaluateTaskSla(task, currentDate = new Date()) {
  const now = new Date(currentDate);

  if (['DONE', 'CANCELLED'].includes(task.status)) {
    return {
      isSlaBreached: false,
      remainingHours: null,
      deadline: task.sla_breach_at ? new Date(task.sla_breach_at).toISOString() : null,
      status: 'RESOLVED'
    };
  }

  const deadlineDate = task.sla_breach_at ? new Date(task.sla_breach_at) : (task.due_at ? new Date(task.due_at) : null);

  if (!deadlineDate || isNaN(deadlineDate.getTime())) {
    return {
      isSlaBreached: false,
      remainingHours: null,
      deadline: null,
      status: 'NO_SLA'
    };
  }

  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffHours = diffMs / (3600 * 1000);
  const isBreached = diffMs < 0;

  let status = 'OK';
  if (isBreached) {
    status = 'BREACHED';
  } else if (diffHours <= 2) {
    status = 'CRITICAL_BUFFER';
  } else if (diffHours <= 6) {
    status = 'WARNING';
  }

  return {
    isSlaBreached: isBreached,
    remainingHours: Math.round(diffHours * 10) / 10,
    deadline: deadlineDate.toISOString(),
    status
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OPERATIONS_SLA_CONFIG,
    calculateSlaDeadline,
    evaluateTaskSla
  };
}

if (typeof window !== 'undefined') {
  window.OPERATIONS_SLA_CONFIG = OPERATIONS_SLA_CONFIG;
  window.calculateSlaDeadline = calculateSlaDeadline;
  window.evaluateTaskSla = evaluateTaskSla;
}
