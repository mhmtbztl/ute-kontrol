// =============================================================================
// LEXBNB PHASE 9 — RECURRING TASKS SERVICE
// Deterministic and idempotent periodic task generation (HVAC, Jacuzzi, Chimney, Inspections).
// =============================================================================

/**
 * Checks whether a recurring rule matches a specific calendar date.
 * @param {Object} rule
 * @param {Date} targetDate
 * @returns {boolean}
 */
function isRuleDueOnDate(rule, targetDate) {
  if (!rule.is_active) return false;

  const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday...
  const dayOfMonth = targetDate.getDate(); // 1 - 31
  const month = targetDate.getMonth() + 1; // 1 - 12

  switch (rule.frequency) {
    case 'DAILY':
      return true;
    case 'WEEKLY':
      return rule.day_of_week === undefined || rule.day_of_week === null || rule.day_of_week === dayOfWeek;
    case 'BIWEEKLY': {
      // Every 2 weeks (using week number from start of year)
      const firstDayOfYear = new Date(targetDate.getFullYear(), 0, 1);
      const pastDaysOfYear = (targetDate - firstDayOfYear) / 86400000;
      const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
      return weekNum % 2 === 0 && (rule.day_of_week === undefined || rule.day_of_week === dayOfWeek);
    }
    case 'MONTHLY':
      return rule.day_of_month === undefined || rule.day_of_month === null || rule.day_of_month === dayOfMonth;
    case 'QUARTERLY':
      return [1, 4, 7, 10].includes(month) && (rule.day_of_month === undefined || rule.day_of_month === dayOfMonth);
    case 'SEASONAL':
      return [3, 6, 9, 12].includes(month) && dayOfMonth === 1;
    default:
      return false;
  }
}

/**
 * Evaluates rules and generates idempotent task instances for a specific date.
 * @param {Array<Object>} rules - Recurring rules
 * @param {Date|string} targetDate - The target calendar date
 * @param {Array<Object>} existingTasks - Currently existing tasks to prevent duplicates
 * @returns {Array<Object>} New task instances to insert
 */
function generateRecurringInstances(rules = [], targetDate = new Date(), existingTasks = []) {
  const dateObj = new Date(targetDate);
  const dateStr = dateObj.toISOString().split('T')[0];
  const newInstances = [];

  const existingSourceIds = new Set(
    (existingTasks || []).map(t => t.source_event_id).filter(Boolean)
  );

  for (const rule of rules) {
    if (!rule.is_active) continue;

    const sourceEventId = `recur:${rule.id}:${dateStr}`;
    if (existingSourceIds.has(sourceEventId)) {
      // Already generated for this period -> skip idempotently
      continue;
    }

    if (isRuleDueOnDate(rule, dateObj)) {
      const dueTime = `${dateStr}T12:00:00Z`;
      const newTask = {
        tenant_id: rule.tenant_id,
        property_id: rule.property_id,
        booking_id: null,
        task_type: rule.task_type || 'MAINTENANCE',
        task_subtype: rule.task_subtype || 'PREVENTIVE',
        title: rule.title,
        description: rule.description || 'Periyodik mülk koruma ve bakım görevi.',
        status: 'TODO',
        priority: rule.priority || 'MEDIUM',
        priority_score: rule.priority === 'CRITICAL' ? 100 : (rule.priority === 'HIGH' ? 60 : 30),
        assigned_to: rule.assigned_to || null,
        due_at: dueTime,
        source: 'RECURRING',
        source_event_id: sourceEventId,
        checklist: [],
        metadata: {
          recurring_rule_id: rule.id,
          frequency: rule.frequency,
          scheduled_date: dateStr
        }
      };

      newInstances.push(newTask);
      existingSourceIds.add(sourceEventId);
    }
  }

  return newInstances;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isRuleDueOnDate,
    generateRecurringInstances
  };
}

if (typeof window !== 'undefined') {
  window.isRuleDueOnDate = isRuleDueOnDate;
  window.generateRecurringInstances = generateRecurringInstances;
}
