// =============================================================================
// LEXBNB PHASE 9 — OPERATIONS ENGINE & BOOKING RECONCILIATION SERVICE
// Deterministic, idempotent reservation-driven operations automation.
// Reconciles booking lifecycle events, creates turnover cleaning, checkin prep,
// manages tight-turnover detection, checklist snapshots, and type-specific cancellations.
// =============================================================================

// Node tarafinda bagimliliklar require ile gelir. Tarayicida ayni
// fonksiyonlar onceki <script> etiketleriyle zaten global kapsamdadir;
// ust seviyede const ile yeniden bildirmek SyntaxError verir ve bu
// dosyanin tamamen calismamasina yol acar.
if (typeof require !== 'undefined') {
  var { computeTaskPriority } = require('./operations_priority_engine.js');
  var { calculateSlaDeadline } = require('./operations_sla_service.js');
}


const DEFAULT_CLEANING_CHECKLIST = [
  { id: 'chk_linen', text: 'Yatak çarşafları ve nevresimler değiştirildi', completed: false, required: true },
  { id: 'chk_towels', text: 'Temiz banyo ve yüz havluları yerleştirildi', completed: false, required: true },
  { id: 'chk_bath', text: 'Banyo, tuvalet ve duşakabin dezenfekte edildi', completed: false, required: true },
  { id: 'chk_kitchen', text: 'Mutfak tezgahı, ocak ve fırın temizlendi', completed: false, required: true },
  { id: 'chk_fridge', text: 'Buzdolabı içi boşaltıldı ve temizlendi', completed: false, required: true },
  { id: 'chk_trash', text: 'Tüm çöp kovaları boşaltıldı ve yeni poşet takıldı', completed: false, required: true },
  { id: 'chk_floor', text: 'Zeminler süpürüldü ve paspaslandı', completed: false, required: true },
  { id: 'chk_amenities', text: 'Sarf malzemeleri (sabun, şampuan, tuvalet kağıdı) tamamlandı', completed: false, required: true },
  { id: 'chk_pool_jacuzzi', text: 'Havuz / Jakuzi hijyeni ve su seviyesi kontrol edildi', completed: false, required: false },
  { id: 'chk_outdoor', text: 'Bahçe ve teras mobilyaları düzenlendi', completed: false, required: false }
];

const DEFAULT_CHECKIN_PREP_CHECKLIST = [
  { id: 'chk_ac', text: 'Klima ve havalandırma uygun dereceye ayarlandı', completed: false, required: true },
  { id: 'chk_keys', text: 'Giriş anahtarı / şifreli kilit hazırlandı', completed: false, required: true },
  { id: 'chk_water_elec', text: 'Sıcak su ve elektrik kontrolleri yapıldı', completed: false, required: true },
  { id: 'chk_welcome', text: 'Hoş geldiniz ikramı ve karşılama rehberi hazırlandı', completed: false, required: false }
];

function cloneChecklistValue(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Converts the historical array contract and the rich section contract to one
 * validated shape. Invalid persisted JSON is reported instead of being treated
 * as an empty checklist, so an editor cannot silently overwrite it.
 */
function normalizeChecklistTemplate(rawItems) {
  const errors = [];
  if (Array.isArray(rawItems)) {
    if (!rawItems.length) errors.push('Kontrol listesinde en az bir madde olmalı.');
    const items = rawItems.map((item, index) => {
      const text = typeof item?.text === 'string' ? item.text.trim() : '';
      if (!text) errors.push(`Eski biçimdeki ${index + 1}. maddenin metni boş.`);
      return {
        ...(item?.id ? { id: item.id } : {}),
        text,
        important: item?.important === true || item?.required === true,
        completed: item?.completed === true,
        subChecks: []
      };
    });
    return {
      valid: errors.length === 0,
      errors,
      sourceFormat: 'legacy',
      checklist: { sections: [{ title: 'Genel', items }], supplies: [] }
    };
  }

  if (!rawItems || typeof rawItems !== 'object' || Array.isArray(rawItems.sections) === false) {
    return {
      valid: false,
      errors: ['Kontrol listesi bölümler içeren bir nesne veya eski biçimli bir dizi olmalı.'],
      sourceFormat: 'invalid',
      checklist: null
    };
  }

  if (!rawItems.sections.length) errors.push('Kontrol listesinde en az bir bölüm olmalı.');
  rawItems.sections.forEach((section, sectionIndex) => {
    if (typeof section?.title !== 'string' || !section.title.trim()) {
      errors.push(`${sectionIndex + 1}. bölümün adı boş.`);
    }
    if (!Array.isArray(section?.items) || !section.items.length) {
      errors.push(`${sectionIndex + 1}. bölümde en az bir madde olmalı.`);
      return;
    }
    section.items.forEach((item, itemIndex) => {
      if (typeof item?.text !== 'string' || !item.text.trim()) {
        errors.push(`${sectionIndex + 1}. bölümdeki ${itemIndex + 1}. maddenin metni boş.`);
      }
      if (item?.subChecks != null && !Array.isArray(item.subChecks)) {
        errors.push(`${sectionIndex + 1}. bölümdeki ${itemIndex + 1}. maddenin alt kontrolleri dizi olmalı.`);
      } else if ((item?.subChecks || []).some(value => typeof value !== 'string' || !value.trim())) {
        errors.push(`${sectionIndex + 1}. bölümdeki ${itemIndex + 1}. maddede boş alt kontrol var.`);
      }
    });
  });
  if (rawItems.supplies != null && !Array.isArray(rawItems.supplies)) {
    errors.push('Malzeme listesi dizi olmalı.');
  }

  return {
    valid: errors.length === 0,
    errors,
    sourceFormat: 'rich',
    checklist: cloneChecklistValue({
      sections: rawItems.sections,
      supplies: Array.isArray(rawItems.supplies) ? rawItems.supplies : []
    })
  };
}

/** Critical completion rule approved for G9: only important items and every
 * sub-check below an important item block completion. */
function checklistCompletionState(rawChecklist, result = {}) {
  const normalized = normalizeChecklistTemplate(rawChecklist);
  if (!normalized.valid) {
    return { canComplete: false, missingKeys: [], errors: normalized.errors };
  }
  const missingKeys = [];
  normalized.checklist.sections.forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => {
      if (!item.important) return;
      const key = `s${sectionIndex}.i${itemIndex}`;
      const mainDone = result?.[key]?.z === true || result?.[key] === true || item.completed === true;
      if (!mainDone) missingKeys.push(key);
      (item.subChecks || []).forEach((unused, subIndex) => {
        const subKey = `${key}.sub${subIndex}`;
        if (!(result?.[subKey]?.z === true || result?.[subKey] === true)) missingKeys.push(subKey);
      });
    });
  });
  return { canComplete: missingKeys.length === 0, missingKeys, errors: [] };
}

/**
 * Resolves checklist template for a property, snapshotting items into the task.
 * @param {string} propertyId
 * @param {string} taskType
 * @param {Array<Object>} templates
 * @returns {{ checklist: Array<Object>, templateVersion: number }}
 */
function resolveChecklistSnapshot(propertyId, taskType, templates = []) {
  const candidates = (templates || [])
    .filter(template => template?.task_type === taskType
      && template.is_active !== false
      && (!template.property_id || template.property_id === propertyId));
  const newest = list => list.slice().sort((left, right) =>
    (Number(right.version) || 1) - (Number(left.version) || 1)
      || String(right.updated_at || '').localeCompare(String(left.updated_at || ''))
  )[0];
  const selected = [
    newest(candidates.filter(template => !template.property_id)),
    newest(candidates.filter(template => template.property_id === propertyId))
  ].filter(Boolean);
  const normalized = selected.map(template => ({
    template,
    normalized: normalizeChecklistTemplate(template.items)
  })).filter(entry => entry.normalized.valid);

  if (normalized.length) {
    const templateVersion = normalized.reduce(
      (highest, entry) => Math.max(highest, Number(entry.template.version) || 1), 1
    );
    if (normalized.every(entry => entry.normalized.sourceFormat === 'legacy')) {
      return {
        checklist: normalized.flatMap(entry => cloneChecklistValue(entry.template.items)),
        templateVersion
      };
    }
    return {
      checklist: {
        sections: normalized.flatMap(entry => cloneChecklistValue(entry.normalized.checklist.sections)),
        supplies: normalized.flatMap(entry => cloneChecklistValue(entry.normalized.checklist.supplies))
      },
      templateVersion
    };
  }

  // Fallback defaults
  const fallback = taskType === 'CHECKIN_PREP' ? DEFAULT_CHECKIN_PREP_CHECKLIST : DEFAULT_CLEANING_CHECKLIST;
  return {
    checklist: JSON.parse(JSON.stringify(fallback)),
    templateVersion: 1
  };
}

/**
 * Reconciles operational tasks for a specific booking.
 * Idempotent: Can be safely called repeatedly without producing duplicate tasks.
 * @param {Object} booking - Booking entity
 * @param {Array<Object>} allBookings - All bookings for tight-turnover & proximity checks
 * @param {Array<Object>} propertyTemplates - Checklist templates
 * @param {Array<Object>} existingTasks - Existing operational tasks for the tenant
 * @param {Object} [options]
 * @returns {{
 *   tasksToInsert: Array<Object>,
 *   tasksToUpdate: Array<Object>,
 *   tasksToCancel: Array<Object>,
 *   allReconciledTasks: Array<Object>
 * }}
 */
function reconcileBookingOperations(booking, allBookings = [], propertyTemplates = [], existingTasks = [], options = {}) {
  const tenantId = booking.tenant_id || booking.tenantId;
  const propertyId = booking.property_id || booking.propertyId;
  const bookingId = booking.id;
  const isCancelled = booking.status === 'CANCELLED';

  const checkinDateStr = booking.check_in || booking.checkIn;
  const checkoutDateStr = booking.check_out || booking.checkOut;

  const tasksToInsert = [];
  const tasksToUpdate = [];
  const tasksToCancel = [];

  // Filter tasks already linked to this booking
  const linkedTasks = (existingTasks || []).filter(
    t => (t.booking_id === bookingId || t.bookingId === bookingId)
  );

  // 1. CANCELLATION POLICY
  if (isCancelled) {
    for (const t of linkedTasks) {
      if (!['DONE', 'CANCELLED'].includes(t.status)) {
        // Type-specific policy:
        // CHECKIN_PREP, CHECKOUT, and TURNOVER CLEANING are cancelled
        // MAINTENANCE is preserved!
        if (t.task_type !== 'MAINTENANCE') {
          tasksToCancel.push({
            ...t,
            status: 'CANCELLED',
            metadata: { ...(t.metadata || {}), cancellation_reason: 'BOOKING_CANCELLED' }
          });
        }
      }
    }

    return {
      tasksToInsert,
      tasksToUpdate,
      tasksToCancel,
      allReconciledTasks: [...tasksToCancel]
    };
  }

  // 2. TIGHT TURNOVER DETECTION
  // Check if another active booking checks in on the exact check_out date of this booking
  const nextBooking = (allBookings || []).find(b => {
    if (b.id === bookingId || b.status === 'CANCELLED') return false;
    const bProp = b.property_id || b.propertyId;
    if (bProp !== propertyId) return false;
    const bCheckin = b.check_in || b.checkIn;
    return bCheckin === checkoutDateStr;
  });

  const isTightTurnover = Boolean(nextBooking);

  // 3. RECONCILE CHECKIN_PREP TASK
  const checkinPrepSourceEvent = `booking:${bookingId}:checkin_prep`;
  let existingCheckinPrep = linkedTasks.find(t => t.source_event_id === checkinPrepSourceEvent);

  const checkinDueTime = `${checkinDateStr}T14:00:00Z`; // Default 14:00 checkin buffer
  const checkinPrepTitle = `Giriş Hazırlığı: ${booking.guest_name || booking.guestName || 'Misafir'}`;

  if (!existingCheckinPrep) {
    const { checklist, templateVersion } = resolveChecklistSnapshot(propertyId, 'CHECKIN_PREP', propertyTemplates);
    const newTask = {
      tenant_id: tenantId,
      property_id: propertyId,
      booking_id: bookingId,
      task_type: 'CHECKIN_PREP',
      task_subtype: 'STANDARD',
      title: checkinPrepTitle,
      description: `${checkinDateStr} girişli misafir hazırlığı ve oda kontrolü.`,
      status: 'TODO',
      priority: 'MEDIUM',
      priority_score: 30,
      due_at: checkinDueTime,
      source: 'BOOKING_EVENT',
      source_event_id: checkinPrepSourceEvent,
      checklist,
      metadata: {
        template_version: templateVersion,
        guest_name: booking.guest_name || booking.guestName,
        checkin_date: checkinDateStr
      }
    };

    const priorityInfo = computeTaskPriority(newTask, { currentDate: options.currentDate });
    newTask.priority = priorityInfo.priorityLevel;
    newTask.priority_score = priorityInfo.priorityScore;
    newTask.sla_breach_at = calculateSlaDeadline(newTask, { checkinTime: checkinDueTime });

    tasksToInsert.push(newTask);
  } else if (!['DONE', 'CANCELLED'].includes(existingCheckinPrep.status)) {
    // Check if dates or tight turnover changed
    if (existingCheckinPrep.due_at !== checkinDueTime) {
      const updated = {
        ...existingCheckinPrep,
        due_at: checkinDueTime,
        title: checkinPrepTitle,
        metadata: {
          ...(existingCheckinPrep.metadata || {}),
          checkin_date: checkinDateStr
        }
      };
      const priorityInfo = computeTaskPriority(updated, { currentDate: options.currentDate });
      updated.priority = priorityInfo.priorityLevel;
      updated.priority_score = priorityInfo.priorityScore;
      updated.sla_breach_at = calculateSlaDeadline(updated, { checkinTime: checkinDueTime });
      tasksToUpdate.push(updated);
    }
  }

  // 4. RECONCILE TURNOVER CLEANING TASK
  const turnoverCleanSourceEvent = `booking:${bookingId}:turnover_clean`;
  let existingTurnoverClean = linkedTasks.find(t => t.source_event_id === turnoverCleanSourceEvent);

  const checkoutDueTime = `${checkoutDateStr}T11:00:00Z`; // Default 11:00 checkout
  const nextCheckinTime = nextBooking ? `${nextBooking.check_in || nextBooking.checkIn}T15:00:00Z` : null;

  const cleaningTitle = isTightTurnover
    ? `⚡ Sıkışık Çıkış Temizliği (Tight Turnover): ${booking.guest_name || 'Misafir'} → ${nextBooking.guest_name || 'Yeni Misafir'}`
    : `Çıkış Temizliği (Turnover): ${booking.guest_name || 'Misafir'}`;

  const cleaningPriority = isTightTurnover ? 'HIGH' : 'MEDIUM';

  if (!existingTurnoverClean) {
    const { checklist, templateVersion } = resolveChecklistSnapshot(propertyId, 'CLEANING', propertyTemplates);
    const newTask = {
      tenant_id: tenantId,
      property_id: propertyId,
      booking_id: bookingId,
      task_type: 'CLEANING',
      task_subtype: 'TURNOVER',
      title: cleaningTitle,
      description: `${checkoutDateStr} çıkış sonrası detaylı oda turnover temizliği.`,
      status: 'TODO',
      priority: cleaningPriority,
      priority_score: isTightTurnover ? 70 : 30,
      due_at: checkoutDueTime,
      source: 'BOOKING_EVENT',
      source_event_id: turnoverCleanSourceEvent,
      checklist,
      metadata: {
        template_version: templateVersion,
        is_tight_turnover: isTightTurnover,
        next_booking_id: nextBooking ? nextBooking.id : null,
        turnover_window_hours: isTightTurnover ? 4 : null,
        checkout_date: checkoutDateStr
      }
    };

    const priorityInfo = computeTaskPriority(newTask, {
      currentDate: options.currentDate,
      isTightTurnover
    });
    newTask.priority = priorityInfo.priorityLevel;
    newTask.priority_score = priorityInfo.priorityScore;
    newTask.sla_breach_at = calculateSlaDeadline(newTask, {
      isTightTurnover,
      nextCheckinTime
    });

    tasksToInsert.push(newTask);
  } else if (!['DONE', 'CANCELLED'].includes(existingTurnoverClean.status)) {
    // Re-evaluate if dates, tight-turnover state, or next booking changed
    const hadTightFlag = Boolean(existingTurnoverClean.metadata?.is_tight_turnover);
    const dateChanged = existingTurnoverClean.due_at !== checkoutDueTime;
    const tightChanged = hadTightFlag !== isTightTurnover;

    if (dateChanged || tightChanged) {
      const updated = {
        ...existingTurnoverClean,
        due_at: checkoutDueTime,
        title: cleaningTitle,
        priority: cleaningPriority,
        metadata: {
          ...(existingTurnoverClean.metadata || {}),
          is_tight_turnover: isTightTurnover,
          next_booking_id: nextBooking ? nextBooking.id : null,
          turnover_window_hours: isTightTurnover ? 4 : null,
          checkout_date: checkoutDateStr
        }
      };

      const priorityInfo = computeTaskPriority(updated, {
        currentDate: options.currentDate,
        isTightTurnover
      });
      updated.priority = priorityInfo.priorityLevel;
      updated.priority_score = priorityInfo.priorityScore;
      updated.sla_breach_at = calculateSlaDeadline(updated, {
        isTightTurnover,
        nextCheckinTime
      });

      tasksToUpdate.push(updated);
    }
  }

  return {
    tasksToInsert,
    tasksToUpdate,
    tasksToCancel,
    allReconciledTasks: [...tasksToInsert, ...tasksToUpdate]
  };
}

/**
 * Reconciles all bookings for a tenant.
 */
function reconcileAllTenantBookings(allBookings = [], propertyTemplates = [], existingTasks = [], options = {}) {
  const allToInsert = [];
  const allToUpdate = [];
  const allToCancel = [];

  const activeBookings = (allBookings || []).filter(b => b.status !== 'CANCELLED');

  for (const booking of activeBookings) {
    const res = reconcileBookingOperations(booking, allBookings, propertyTemplates, existingTasks, options);
    allToInsert.push(...res.tasksToInsert);
    allToUpdate.push(...res.tasksToUpdate);
    allToCancel.push(...res.tasksToCancel);
  }

  return {
    tasksToInsert: allToInsert,
    tasksToUpdate: allToUpdate,
    tasksToCancel: allToCancel
  };
}

// A3 operasyon ekrani gorunum kurallari. Bunlar veri yazmaz; ayni kuralin
// kart, liste ve RPC kapisinda farkli yorumlanmasini engeller.
function isCleaningDebt(task) {
  return !!task && String(task.status || '').toUpperCase() === 'DONE' && !(task.paid ?? task.is_paid);
}

function eligibleCleaners(people = []) {
  return people.filter(person => person
    && person.kind === 'CLEANER'
    && person.is_active !== false
    && !!person.user_id);
}

function canAssignCleaner(people = [], personId) {
  return eligibleCleaners(people).some(person => person.id === personId);
}

function eligibleTechnicians(people = []) {
  return people.filter(person => person && person.kind === 'TECHNICIAN' && person.is_active !== false);
}

function sortMaintenanceTickets(tickets = []) {
  const severity = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return tickets.slice().sort((a, b) => Number(!!b.booking_impact) - Number(!!a.booking_impact)
    || (severity[String(b.severity || '').toUpperCase()] || 0) - (severity[String(a.severity || '').toUpperCase()] || 0)
    || String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function addDays(isoDate, count) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function groupCleaningTasks(tasks = [], today) {
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6);
  const result = { overdue: [], today: [], tomorrow: [], week: [] };
  tasks.forEach(task => {
    const date = String(task?.date || task?.task_date || '').slice(0, 10);
    const status = String(task?.status || '').toUpperCase();
    const isOpen = task?.paid !== true && task?.is_paid !== true && (!['DONE', 'SKIPPED', 'CANCELLED'].includes(status)
      || task?.workflowState === 'AWAITING_INSPECTION');
    const completedToday = date === today && status === 'DONE';
    if (!isOpen && !completedToday) return;
    if (date && date < today && isOpen) result.overdue.push(task);
    else if (date === today) result.today.push(task);
    else if (date === tomorrow) result.tomorrow.push(task);
    else if (date > tomorrow && date <= weekEnd) result.week.push(task);
  });
  result.overdue.sort((a, b) => String(a?.date || a?.task_date || '').localeCompare(String(b?.date || b?.task_date || '')));
  return result;
}

function cleanerDebtSummary(tasks = []) {
  const grouped = new Map();
  tasks.filter(isCleaningDebt).forEach(task => {
    const cleaner = String(task.cleaner || task.cleaner_name || 'Personel belirtilmedi').trim() || 'Personel belirtilmedi';
    const current = grouped.get(cleaner) || { cleaner, amount: 0, count: 0, taskIds: [] };
    current.amount += Number(task.amount) || 0;
    current.count += 1;
    current.taskIds.push(task.id || task.dbId);
    grouped.set(cleaner, current);
  });
  return [...grouped.values()].sort((a, b) => b.amount - a.amount || a.cleaner.localeCompare(b.cleaner, 'tr'));
}

function attachExecutions(tasks = [], executions = []) {
  const byTask = new Map(executions.map(execution => [execution.cleaning_task_id, execution]));
  return tasks.map(task => {
    const execution = byTask.get(task.dbId || task.id) || null;
    let workflowState = 'DIRECT';
    if (execution?.status === 'CLEANED') workflowState = 'AWAITING_INSPECTION';
    else if (execution?.status === 'INSPECTED') workflowState = 'INSPECTED';
    else if (execution) workflowState = execution.status;
    return { ...task, execution, workflowState };
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_CLEANING_CHECKLIST,
    DEFAULT_CHECKIN_PREP_CHECKLIST,
    normalizeChecklistTemplate,
    checklistCompletionState,
    resolveChecklistSnapshot,
    reconcileBookingOperations,
    reconcileAllTenantBookings,
    isCleaningDebt,
    eligibleCleaners,
    canAssignCleaner,
    eligibleTechnicians,
    sortMaintenanceTickets,
    groupCleaningTasks,
    cleanerDebtSummary,
    attachExecutions
  };
}

if (typeof window !== 'undefined') {
  window.DEFAULT_CLEANING_CHECKLIST = DEFAULT_CLEANING_CHECKLIST;
  window.DEFAULT_CHECKIN_PREP_CHECKLIST = DEFAULT_CHECKIN_PREP_CHECKLIST;
  window.normalizeChecklistTemplate = normalizeChecklistTemplate;
  window.checklistCompletionState = checklistCompletionState;
  window.resolveChecklistSnapshot = resolveChecklistSnapshot;
  window.reconcileBookingOperations = reconcileBookingOperations;
  window.reconcileAllTenantBookings = reconcileAllTenantBookings;
  window.OperationsEngine = {
    normalizeChecklistTemplate,
    checklistCompletionState,
    isCleaningDebt,
    eligibleCleaners,
    canAssignCleaner,
    eligibleTechnicians,
    sortMaintenanceTickets,
    groupCleaningTasks,
    cleanerDebtSummary,
    attachExecutions
  };
}
