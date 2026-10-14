(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PropertySalesReadiness = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATUS_META = Object.freeze({
    SALES_READY: Object.freeze({
      value: 'SALES_READY',
      label: 'Satışa hazır',
      shortLabel: 'Hazır',
      icon: '🟢',
      tone: 'green',
      description: 'Mülk yeni rezervasyon kabul etmeye hazır.'
    }),
    NEEDS_CLEANING: Object.freeze({
      value: 'NEEDS_CLEANING',
      label: 'Temizlik sonrası hazır',
      shortLabel: 'Temizlenecek',
      icon: '🟡',
      tone: 'yellow',
      description: 'Satışa açılmadan önce temizlik veya son kontrol gerekiyor.'
    }),
    BLOCKED_MAINTENANCE: Object.freeze({
      value: 'BLOCKED_MAINTENANCE',
      label: 'Satışa kapalı · büyük arıza/tadilat',
      shortLabel: 'Satışa kapalı',
      icon: '🔴',
      tone: 'red',
      description: 'Mülk rezervasyon kabulünü engelleyen arıza veya tadilat nedeniyle kapalı.'
    }),
    NON_BLOCKING_ISSUE: Object.freeze({
      value: 'NON_BLOCKING_ISSUE',
      label: 'Satışa açık · küçük arıza var',
      shortLabel: 'Küçük arıza',
      icon: '🔵',
      tone: 'blue',
      description: 'Açık bir arıza var ancak rezervasyon satışını engellemiyor.'
    }),
    UNSET: Object.freeze({
      value: 'UNSET',
      label: 'Durum seçilmedi',
      shortLabel: 'Belirsiz',
      icon: '⚪',
      tone: 'neutral',
      description: 'Yetkili bir kullanıcı mülkün satış hazırlığı durumunu seçmeli.'
    })
  });

  const EDIT_ROLES = Object.freeze(['owner', 'admin', 'manager', 'staff']);
  const SELECTABLE_STATUSES = Object.freeze([
    'SALES_READY',
    'NEEDS_CLEANING',
    'BLOCKED_MAINTENANCE',
    'NON_BLOCKING_ISSUE'
  ]);
  const LEGACY_STATUS_MAP = Object.freeze({
    READY: 'SALES_READY',
    CLEANING: 'NEEDS_CLEANING',
    OCCUPIED: 'SALES_READY'
  });

  function normalizeStatus(value) {
    const status = String(value || '').trim().toUpperCase();
    if (SELECTABLE_STATUSES.includes(status)) return status;
    return LEGACY_STATUS_MAP[status] || 'UNSET';
  }

  function canEdit(role) {
    return EDIT_ROLES.includes(String(role || '').trim().toLowerCase());
  }

  // app.js isMaintenanceTicketOpen ile ayni kume (CLAUDE.md 3.4: acik ariza tek
  // tanimdir). COMPLETED eksikti: DB'deki RESOLVED bellekte COMPLETED'e
  // cevrildigi icin cozulmus ariza mulku satisa kapali tutuyordu (L-179).
  const CLOSED_TICKET_STATUSES = Object.freeze(['DONE', 'CLOSED', 'TAMAMLANDI', 'RESOLVED', 'COMPLETED', 'CANCELLED']);

  function isOpenTicket(ticket) {
    return !!ticket && !CLOSED_TICKET_STATUSES.includes(
      String(ticket.statusRaw || ticket.status || '').toUpperCase()
    );
  }

  function matchesProperty(ticket, property) {
    const ids = [property?.id, property?.dbId, property?.key, property?.slug].filter(Boolean).map(String);
    const ticketIds = [ticket?.property_id, ticket?.propertyId, ticket?.villa].filter(Boolean).map(String);
    return ticketIds.some(id => ids.includes(id));
  }

  function isBlockingTicket(ticket) {
    const priority = String(ticket?.priority || ticket?.severity || '').toUpperCase();
    return ticket?.blocks_availability === true
      || ticket?.blocksAvailability === true
      || ticket?.booking_impact === true
      || ticket?.bookingImpact === true
      || ['P1', 'CRITICAL', 'P1_CRITICAL'].includes(priority);
  }

  function buildPropertyReadiness(property, options) {
    const opts = options || {};
    const openTickets = (opts.maintenanceTickets || [])
      .filter(ticket => isOpenTicket(ticket) && matchesProperty(ticket, property));
    const blockingTickets = openTickets.filter(isBlockingTicket);
    const manualStatus = normalizeStatus(opts.overrideStatus);

    // Temizlik durumu kendiliginden yansir (L-183, kullanici M13): bugun ya da
    // daha once planlanmis ve yapilmamis temizlik varken mulk "temizlik
    // bekliyor"dur; elle "hazir" secimi bunu ortemez. Gelecek tarihli temizlik
    // bugunu etkilemez. "Yapilmadi" (SKIPPED) bekleyen is degildir.
    const today = /^\d{4}-\d{2}-\d{2}$/.test(opts.today || '') ? opts.today : null;
    const propertyTasks = (opts.cleaningTasks || []).filter(task => task && matchesProperty(task, property));
    const taskDate = task => String(task.date || task.task_date || '').slice(0, 10);
    const taskStatus = task => String(task.status || '').toUpperCase();
    const pendingCleaning = today ? propertyTasks
      .filter(task => !['DONE', 'SKIPPED'].includes(taskStatus(task)) && taskDate(task) && taskDate(task) <= today)
      .sort((a, b) => taskDate(a).localeCompare(taskDate(b))) : [];
    const lastDoneCleaning = propertyTasks
      .filter(task => taskStatus(task) === 'DONE' && (!today || taskDate(task) <= today))
      .sort((a, b) => taskDate(b).localeCompare(taskDate(a)))[0] || null;

    let status = manualStatus;
    let source = manualStatus === 'UNSET' ? 'UNSET' : 'MANUAL';
    let reason = STATUS_META[status].description;

    if (blockingTickets.length > 0) {
      status = 'BLOCKED_MAINTENANCE';
      source = 'BLOCKING_MAINTENANCE';
      reason = `${blockingTickets.length} satışa engel açık arıza veya tadilat kaydı var.`;
    } else if (pendingCleaning.length > 0) {
      status = 'NEEDS_CLEANING';
      source = 'CLEANING';
      reason = taskDate(pendingCleaning[0]) < today
        ? `Geciken temizlik var (${taskDate(pendingCleaning[0])}); yapıldı işaretlenince hazır olur.`
        : 'Bugün planlı temizlik var; yapıldı işaretlenince hazır olur.';
    } else if (manualStatus === 'UNSET' && openTickets.length === 0 && lastDoneCleaning) {
      status = 'SALES_READY';
      source = 'CLEANING';
      reason = `Son temizlik yapıldı (${taskDate(lastDoneCleaning)}); açık arıza yok.`;
    } else if (manualStatus === 'UNSET' && openTickets.length > 0) {
      status = 'NON_BLOCKING_ISSUE';
      source = 'MAINTENANCE';
      reason = `${openTickets.length} satışa engel olmayan açık arıza kaydı var.`;
    }

    return {
      propertyId: property?.id || property?.dbId || null,
      propertyKey: property?.key || property?.slug || '',
      propertyName: property?.name || property?.key || property?.slug || 'Adsız mülk',
      status,
      meta: STATUS_META[status],
      source,
      reason,
      openIssueCount: openTickets.length,
      blockingIssueCount: blockingTickets.length,
      blockingTicketIds: blockingTickets.map(ticket => ticket.id).filter(Boolean),
      pendingCleaningTaskIds: pendingCleaning.map(task => task.id || task.dbId).filter(Boolean),
      manualStatus
    };
  }

  return {
    STATUS_META,
    EDIT_ROLES,
    SELECTABLE_STATUSES,
    CLOSED_TICKET_STATUSES,
    normalizeStatus,
    canEdit,
    isOpenTicket,
    isBlockingTicket,
    buildPropertyReadiness
  };
}));
