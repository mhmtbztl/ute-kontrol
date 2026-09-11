// =============================================================================
// LEXBNB PHASE 9 — OPERATIONS PRIORITY ENGINE
// Deterministic priority scoring based on guest impact, due time, tight turnover,
// and severity. No magic numbers — centralized configuration with tenant overrides.
// =============================================================================

const OPERATIONS_PRIORITY_CONFIG = {
  base: {
    CRITICAL: 100,
    HIGH: 60,
    MEDIUM: 30,
    LOW: 10
  },
  proximity: {
    dueToday: 30,
    overdue: 50,
    guestInHouse: 35
  },
  turnover: {
    tightTurnover: 40
  }
};

/**
 * Computes deterministic priority score for an operational task.
 * @param {Object} task - The operational task
 * @param {Object} context - Environmental context (currentDate, bookings, etc.)
 * @param {Object} [configOverride] - Optional tenant-level configuration override
 * @returns {{ priorityScore: number, priorityLevel: string, breakdown: Object }}
 */
function computeTaskPriority(task, context = {}, configOverride = null) {
  const config = configOverride ? { ...OPERATIONS_PRIORITY_CONFIG, ...configOverride } : OPERATIONS_PRIORITY_CONFIG;
  const baseConfig = config.base || OPERATIONS_PRIORITY_CONFIG.base;
  const proximityConfig = config.proximity || OPERATIONS_PRIORITY_CONFIG.proximity;
  const turnoverConfig = config.turnover || OPERATIONS_PRIORITY_CONFIG.turnover;

  const priorityLevel = String(task.priority || 'MEDIUM').toUpperCase();
  let baseScore = baseConfig[priorityLevel] || baseConfig.MEDIUM;

  const breakdown = {
    base: baseScore,
    dueToday: 0,
    overdue: 0,
    guestInHouse: 0,
    tightTurnover: 0
  };

  const now = context.currentDate ? new Date(context.currentDate) : new Date();

  // Due time checks
  if (task.due_at) {
    const dueTime = new Date(task.due_at).getTime();
    const currentTime = now.getTime();

    if (!['DONE', 'CANCELLED'].includes(task.status)) {
      if (currentTime > dueTime) {
        breakdown.overdue = proximityConfig.overdue || 50;
      } else {
        // Check if due within same calendar day (24 hours)
        const diffHours = (dueTime - currentTime) / (1000 * 60 * 60);
        if (diffHours >= 0 && diffHours <= 24) {
          breakdown.dueToday = proximityConfig.dueToday || 30;
        }
      }
    }
  }

  // Tight turnover check (same day checkout/checkin)
  const isTight = task.metadata?.is_tight_turnover || context.isTightTurnover;
  if (isTight && !['DONE', 'CANCELLED'].includes(task.status)) {
    breakdown.tightTurnover = turnoverConfig.tightTurnover || 40;
  }

  // Active guest in-house during maintenance
  const hasGuestInHouse = context.isGuestInHouse || task.metadata?.guest_in_house;
  if (hasGuestInHouse && task.task_type === 'MAINTENANCE' && !['DONE', 'CANCELLED'].includes(task.status)) {
    breakdown.guestInHouse = proximityConfig.guestInHouse || 35;
  }

  const totalScore = breakdown.base + breakdown.dueToday + breakdown.overdue + breakdown.guestInHouse + breakdown.tightTurnover;

  // Resolve derived priority rank if elevated significantly
  let derivedLevel = priorityLevel;
  if (totalScore >= 120 && priorityLevel !== 'CRITICAL') {
    derivedLevel = 'HIGH';
  }
  if (totalScore >= 160) {
    derivedLevel = 'CRITICAL';
  }

  return {
    priorityScore: totalScore,
    priorityLevel: derivedLevel,
    breakdown
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OPERATIONS_PRIORITY_CONFIG,
    computeTaskPriority
  };
}

if (typeof window !== 'undefined') {
  window.OPERATIONS_PRIORITY_CONFIG = OPERATIONS_PRIORITY_CONFIG;
  window.computeTaskPriority = computeTaskPriority;
}
