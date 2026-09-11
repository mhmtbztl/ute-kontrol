// =============================================================================
// LEXBNB PHASE 12 — NOTIFICATION CENTER SERVICE
// Cross-Domain Notification Aggregation, Deterministic Event Keys,
// Deduplication, State Transitions (UNREAD -> READ -> ACK -> RESOLVED),
// and Re-Occurrence Lifecycle Management.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NotificationCenterService = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Generates a deterministic event key for deduplication.
   */
  function buildNotificationEventKey(tenantId, domain, entityId, eventType, dateStr = '') {
    return `notif:${tenantId}:${domain}:${entityId}:${eventType}${dateStr ? ':' + dateStr : ''}`;
  }

  /**
   * Evaluates candidate notification against existing notifications pool.
   * Returns:
   * - { shouldCreate: true, notification: {...} } if brand new or re-occurring after resolution
   * - { shouldCreate: false, reason: 'DUPLICATE_ACTIVE' } if already active
   */
  function processCandidateNotification(existingNotifications, candidate) {
    const {
      tenantId,
      domain,
      entityId,
      eventType,
      dateStr = '',
      severity = 'INFO',
      title,
      message,
      deepLink = '/'
    } = candidate;

    const eventKey = buildNotificationEventKey(tenantId, domain, entityId, eventType, dateStr);

    const match = existingNotifications.find(n => n.event_key === eventKey || n.eventKey === eventKey);

    if (match) {
      if (match.status === 'RESOLVED') {
        // Re-occurrence after resolution: start brand new lifecycle!
        const newNotif = {
          id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          tenant_id: tenantId,
          event_key: eventKey,
          domain,
          severity,
          title,
          message,
          deep_link: deepLink,
          status: 'UNREAD',
          is_reoccurrence: true,
          previous_notification_id: match.id,
          created_at: new Date().toISOString()
        };
        return { shouldCreate: true, notification: newNotif };
      }
      // Already active (UNREAD, READ, or ACKNOWLEDGED)
      return { shouldCreate: false, reason: 'DUPLICATE_ACTIVE', existingId: match.id };
    }

    // Brand new
    const newNotif = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      tenant_id: tenantId,
      event_key: eventKey,
      domain,
      severity,
      title,
      message,
      deep_link: deepLink,
      status: 'UNREAD',
      created_at: new Date().toISOString()
    };
    return { shouldCreate: true, notification: newNotif };
  }

  /**
   * Transitions notification state: UNREAD -> READ -> ACKNOWLEDGED -> RESOLVED.
   */
  function transitionNotificationState(notification, targetState, options = {}) {
    const validTransitions = {
      UNREAD: ['READ', 'ACKNOWLEDGED', 'RESOLVED'],
      READ: ['ACKNOWLEDGED', 'RESOLVED'],
      ACKNOWLEDGED: ['RESOLVED'],
      RESOLVED: []
    };

    if (!validTransitions[notification.status] || !validTransitions[notification.status].includes(targetState)) {
      throw new Error(`INVALID_NOTIFICATION_TRANSITION: Cannot transition from ${notification.status} to ${targetState}`);
    }

    const updated = {
      ...notification,
      status: targetState,
      updated_at: new Date().toISOString()
    };

    if (targetState === 'READ') {
      updated.read_at = new Date().toISOString();
    } else if (targetState === 'ACKNOWLEDGED') {
      updated.acknowledged_at = new Date().toISOString();
    } else if (targetState === 'RESOLVED') {
      updated.resolved_at = new Date().toISOString();
    }

    return updated;
  }

  return {
    buildNotificationEventKey,
    processCandidateNotification,
    transitionNotificationState
  };
}));
