// =============================================================================
// LEXBNB PHASE 10 — GUEST MESSAGING RECONCILIATION ENGINE
// Deterministic, Idempotent Message Scheduling, Timezone-Aware Triggers,
// Send-Time Recipient Resolution, Consent Enforcement, and Audit Protection
// =============================================================================

const { renderTemplate, resolveTemplate } = require('./message_template_engine.js');
const { evaluateExtensionAvailability, calculateExtensionPrice } = require('./extension_offer_service.js');
const { normalizePhone, normalizeEmail } = require('./guest_contact_utils.js');

/**
 * Calculates scheduled timestamp in local timezone.
 * Fallback order: property timezone -> tenant timezone -> system default ('Europe/Istanbul').
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {string} timeStr 'HH:mm'
 * @param {number} offsetMinutes
 * @param {string} timezone
 * @returns {Date}
 */
function calculateTriggerDateTime(dateStr, timeStr = '15:00', offsetMinutes = 0, timezone = 'Europe/Istanbul') {
  const [hh, mm] = (timeStr || '15:00').split(':').map(Number);
  // Construct local date time representation
  const dt = new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  if (offsetMinutes) {
    dt.setUTCMinutes(dt.getUTCMinutes() - offsetMinutes);
  }
  return dt;
}

/**
 * Builds template context for rendering.
 * @param {Object} booking
 * @param {Object} guest
 * @param {Object} property
 * @param {Object} guestSettings
 * @param {Object} extra
 * @returns {Object} Context key-values
 */
function buildTemplateContext(booking, guest = {}, property = {}, guestSettings = {}, extra = {}) {
  const g = guest || {};
  const guestFirstName = g.first_name || (booking.guest_name ? booking.guest_name.split(' ')[0] : 'Misafir');
  const guestLastName = g.last_name || (booking.guest_name && booking.guest_name.includes(' ') ? booking.guest_name.split(' ').slice(1).join(' ') : '');
  const guestFullName = `${guestFirstName} ${guestLastName}`.trim();

  const checkInTime = (guestSettings && guestSettings.check_in_time) || '15:00';
  const checkOutTime = (guestSettings && guestSettings.check_out_time) || '11:00';

  // Calculate nights
  const inD = new Date(booking.check_in || booking.checkIn);
  const outD = new Date(booking.check_out || booking.checkOut);
  const nightsCount = Math.max(1, Math.round((outD - inD) / (1000 * 60 * 60 * 24)));

  return {
    guest_first_name: guestFirstName,
    guest_last_name: guestLastName,
    guest_full_name: guestFullName,
    property_name: property.name || 'Villa',
    check_in_date: booking.check_in || booking.checkIn,
    check_in_time: checkInTime,
    check_out_date: booking.check_out || booking.checkOut,
    check_out_time: checkOutTime,
    property_address: (guestSettings && guestSettings.address_text) || '',
    map_link: (guestSettings && guestSettings.map_url) || '',
    host_phone: (guestSettings && guestSettings.emergency_contact) || '',
    wifi_name: (guestSettings && guestSettings.wifi_name) || '',
    wifi_password: (guestSettings && guestSettings.wifi_password) || '',
    door_code: (guestSettings && guestSettings.door_code) || '',
    lockbox_code: (guestSettings && guestSettings.door_code) || '',
    access_code: (guestSettings && guestSettings.door_code) || '',
    booking_total: Number(booking.gross_amount || booking.gross || 0).toLocaleString('tr-TR') + ' ₺',
    remaining_balance: '0,00 ₺',
    nights_count: nightsCount,
    guest_count: booking.guest_count || booking.pax || 2,
    extension_discount_percent: extra.discountPercent || 20,
    extension_night_rate: extra.offeredPrice ? `${extra.offeredPrice.toLocaleString('tr-TR')} ₺` : '',
    ...extra
  };
}

/**
 * Reconciles messages for a given booking against active automation rules.
 * Idempotent, timezone-aware, and safe against duplicates.
 * @param {Object} params
 * @returns {{ scheduled: Array<Object>, updated: Array<Object>, cancelled: Array<Object>, skipped: Array<Object> }}
 */
function reconcileBookingMessages(params) {
  const {
    booking,
    guest,
    property = {},
    guestSettings = {},
    rules = [],
    templates = [],
    existingMessages = [],
    allPropertyBookings = [],
    maintenanceTickets = [],
    now = new Date()
  } = params;

  if (!booking || !booking.id) {
    return { scheduled: [], updated: [], cancelled: [], skipped: [] };
  }

  const bookingId = booking.id;
  const tenantId = booking.tenant_id;
  const propertyId = booking.property_id;
  const isCancelled = booking.status === 'CANCELLED';

  const scheduled = [];
  const updated = [];
  const cancelled = [];
  const skipped = [];

  const existingMap = new Map();
  for (const msg of existingMessages) {
    if (msg.booking_id === bookingId) {
      existingMap.set(msg.idempotency_key, msg);
    }
  }

  // 1. If booking is CANCELLED, cancel all pending (SCHEDULED) messages
  if (isCancelled) {
    for (const [key, msg] of existingMap.entries()) {
      if (msg.status === 'SCHEDULED') {
        cancelled.push({
          id: msg.id,
          idempotency_key: key,
          status: 'CANCELLED',
          cancelled_at: now.toISOString()
        });
      }
    }
    return { scheduled, updated, cancelled, skipped };
  }

  // 2. Evaluate active automation rules
  const targetTimezone = (guestSettings && guestSettings.timezone) ||
                         (params.tenant && params.tenant.timezone) ||
                         'Europe/Istanbul';

  for (const rule of rules) {
    // Check property match
    if (rule.property_id && rule.property_id !== propertyId) {
      continue;
    }

    const ruleKey = `booking:${bookingId}:${rule.id}:${rule.lifecycle_stage}`;
    let existingMsg = existingMap.get(ruleKey);
    if (!existingMsg) {
      for (const [k, m] of existingMap.entries()) {
        if (m.automation_rule_id === rule.id || k.includes(`:${rule.id}:`) || k.includes(`:rule_${rule.id}:`)) {
          existingMsg = m;
          break;
        }
      }
    }

    // Rule deactivated -> cancel existing scheduled message if pending
    if (rule.is_active === false) {
      if (existingMsg && existingMsg.status === 'SCHEDULED') {
        cancelled.push({
          id: existingMsg.id,
          idempotency_key: existingMsg.idempotency_key || ruleKey,
          status: 'CANCELLED',
          cancelled_at: now.toISOString()
        });
      }
      continue;
    }

    // Evaluate Trigger Timing
    let scheduledAt = null;
    let extraContext = {};

    switch (rule.trigger_type) {
      case 'BOOKING_CREATED':
        scheduledAt = existingMsg ? new Date(existingMsg.scheduled_at) : new Date(now.getTime() + (rule.offset_minutes || 0) * 60 * 1000);
        break;

      case 'X_MINUTES_BEFORE_CHECKIN':
      case 'CHECKIN_AT': {
        const checkInTime = (guestSettings && guestSettings.check_in_time) || '15:00';
        scheduledAt = calculateTriggerDateTime(booking.check_in, checkInTime, rule.offset_minutes || 0, targetTimezone);
        break;
      }

      case 'CHECKOUT_AT':
      case 'X_HOURS_BEFORE_CHECKOUT': {
        const checkOutTime = (guestSettings && guestSettings.check_out_time) || '11:00';
        scheduledAt = calculateTriggerDateTime(booking.check_out, checkOutTime, (rule.offset_minutes || 0), targetTimezone);
        break;
      }

      case 'AFTER_CHECKOUT': {
        const checkOutTime = (guestSettings && guestSettings.check_out_time) || '11:00';
        const offsetMin = (rule.offset_minutes || 0) < 0 ? rule.offset_minutes : -(rule.offset_minutes || 0); // after checkout is negative offset
        scheduledAt = calculateTriggerDateTime(booking.check_out, checkOutTime, offsetMin, targetTimezone);
        break;
      }

      case 'NEXT_NIGHT_AVAILABLE': {
        // Evaluate consecutive night availability
        const extCheck = evaluateExtensionAvailability(booking, allPropertyBookings, maintenanceTickets);
        if (!extCheck.available) {
          // Night occupied -> cannot schedule extension offer
          if (existingMsg && existingMsg.status === 'SCHEDULED') {
            cancelled.push({
              id: existingMsg.id,
              idempotency_key: ruleKey,
              status: 'CANCELLED',
              cancelled_at: now.toISOString(),
              reason: 'NEXT_NIGHT_OCCUPIED'
            });
          }
          continue;
        }

        const discPercent = (rule.conditions && rule.conditions.extension_discount_percent) || 20;
        const pricing = calculateExtensionPrice(property, discPercent);
        extraContext = {
          discountPercent: pricing.discountPercent,
          offeredPrice: pricing.offeredPrice,
          targetDate: extCheck.targetDate
        };

        // Scheduled in evening of departure minus 1 day or check-in evening
        const checkOutTime = (guestSettings && guestSettings.check_out_time) || '11:00';
        scheduledAt = calculateTriggerDateTime(booking.check_out, checkOutTime, 14 * 60, targetTimezone); // 14 hours before checkout (e.g. 21:00 prev day)
        break;
      }

      default:
        scheduledAt = new Date(now.getTime() + (rule.offset_minutes || 0) * 60 * 1000);
    }

    // Resolve template
    let template = null;
    try {
      template = resolveTemplate(templates, {
        propertyId,
        lifecycleStage: rule.lifecycle_stage,
        channel: rule.channel,
        language: (guest && guest.preferred_language) || 'tr',
        defaultLanguage: 'tr'
      });
    } catch (e) {
      // Template not found -> skip scheduling
      continue;
    }

    const context = buildTemplateContext(booking, guest, property, guestSettings, extraContext);
    const rendered = renderTemplate(template, context);

    // Consent and Recipient check
    const messageType = rule.message_type || template.message_type || 'TRANSACTIONAL';
    let status = 'SCHEDULED';
    let failureCode = null;

    if (messageType === 'MARKETING' && (!guest || guest.marketing_opt_in !== true)) {
      status = 'SKIPPED';
      failureCode = 'MARKETING_OPT_OUT';
    }

    // Channel level opt-in check
    if (guest) {
      if (rule.channel === 'WHATSAPP' && guest.allow_whatsapp === false) {
        status = 'SKIPPED';
        failureCode = 'CHANNEL_OPT_OUT';
      } else if (rule.channel === 'SMS' && guest.allow_sms === false) {
        status = 'SKIPPED';
        failureCode = 'CHANNEL_OPT_OUT';
      } else if (rule.channel === 'EMAIL' && guest.allow_email === false) {
        status = 'SKIPPED';
        failureCode = 'CHANNEL_OPT_OUT';
      }
    }

    // Recipient can be null at schedule time (resolved at send time)
    let recipient = null;
    if (rule.channel === 'WHATSAPP' || rule.channel === 'SMS') {
      recipient = (guest && guest.phone) ? normalizePhone(guest.phone).normalized : (booking.guest_phone || null);
    } else if (rule.channel === 'EMAIL') {
      recipient = (guest && guest.email) ? normalizeEmail(guest.email).normalized : null;
    }

    if (existingMsg) {
      if (existingMsg.status === 'SENT') {
        // SENT messages are strictly immutable
        continue;
      }

      // Check if scheduled_at or content changed
      const isDateShifted = new Date(existingMsg.scheduled_at).getTime() !== scheduledAt.getTime();
      const isBodyChanged = existingMsg.rendered_body !== rendered.renderedBody;
      const isStatusChanged = existingMsg.status !== status;

      if (isDateShifted || isBodyChanged || isStatusChanged) {
        updated.push({
          id: existingMsg.id,
          idempotency_key: ruleKey,
          scheduled_at: scheduledAt.toISOString(),
          rendered_body: rendered.renderedBody,
          rendered_subject: rendered.renderedSubject,
          template_version: rendered.templateVersion,
          status,
          failure_code: failureCode,
          recipient: recipient || existingMsg.recipient
        });
      }
    } else {
      // New message to schedule
      const newMsg = {
        tenant_id: tenantId,
        booking_id: bookingId,
        guest_id: guest ? guest.id : null,
        automation_rule_id: rule.id,
        template_id: template.id,
        template_version: rendered.templateVersion,
        channel: rule.channel,
        message_type: messageType,
        recipient: recipient || null,
        scheduled_at: scheduledAt.toISOString(),
        status,
        failure_code: failureCode,
        rendered_subject: rendered.renderedSubject,
        rendered_body: rendered.renderedBody,
        idempotency_key: ruleKey,
        retry_count: 0
      };

      if (status === 'SKIPPED') {
        skipped.push(newMsg);
      } else {
        scheduled.push(newMsg);
      }
    }
  }

  return { scheduled, updated, cancelled, skipped };
}

module.exports = {
  calculateTriggerDateTime,
  buildTemplateContext,
  reconcileBookingMessages
};
