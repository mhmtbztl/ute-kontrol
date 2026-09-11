// =============================================================================
// LEXBNB PHASE 10 — MESSAGE DELIVERY SERVICE & WORKER
// Send-Time Recipient Resolution, Stuck Processing Recovery, Exponential Retry,
// Effectively-Once Delivery, and Sanitized Audit Logs
// =============================================================================

const { getProviderForChannel } = require('./messaging_provider.js');
const { normalizePhone, normalizeEmail } = require('./guest_contact_utils.js');
const { evaluateExtensionAvailability } = require('./extension_offer_service.js');

class MessageDeliveryService {
  constructor(options = {}) {
    this.customProvider = options.customProvider || null;
    this.maxRetries = options.maxRetries || 3;
    this.staleTimeoutMinutes = options.staleTimeoutMinutes || 5;
  }

  /**
   * Reclaims stale PROCESSING messages that crashed or timed out.
   * @param {Array<Object>} messages
   * @param {Date} now
   * @returns {Array<Object>} Reclaimed messages
   */
  reclaimStaleProcessing(messages = [], now = new Date()) {
    const cutoff = new Date(now.getTime() - this.staleTimeoutMinutes * 60 * 1000);
    const reclaimed = [];

    for (const msg of messages) {
      if (msg.status === 'PROCESSING' && msg.claimed_at) {
        const claimedAt = new Date(msg.claimed_at);
        if (claimedAt < cutoff) {
          msg.status = 'SCHEDULED';
          msg.claimed_at = null;
          msg.claimed_by = null;
          reclaimed.push(msg);
        }
      }
    }
    return reclaimed;
  }

  /**
   * Resolves recipient address immediately before sending.
   * @param {Object} message
   * @param {Object} guest
   * @returns {{ valid: boolean, recipient: string, error?: string }}
   */
  resolveRecipient(message, guest = null) {
    let raw = message.recipient;

    if (!raw && guest) {
      if (message.channel === 'WHATSAPP' || message.channel === 'SMS') {
        raw = guest.phone;
      } else if (message.channel === 'EMAIL') {
        raw = guest.email;
      }
    }

    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return { valid: false, recipient: '', error: 'MISSING_RECIPIENT' };
    }

    if (message.channel === 'WHATSAPP' || message.channel === 'SMS') {
      const norm = normalizePhone(raw);
      if (!norm.valid) {
        return { valid: false, recipient: raw, error: 'INVALID_PHONE_FORMAT' };
      }
      return { valid: true, recipient: norm.normalized };
    }

    if (message.channel === 'EMAIL') {
      const norm = normalizeEmail(raw);
      if (!norm.valid) {
        return { valid: false, recipient: raw, error: 'INVALID_EMAIL_FORMAT' };
      }
      return { valid: true, recipient: norm.normalized };
    }

    return { valid: true, recipient: raw.trim() };
  }

  /**
   * Processes a single message delivery attempt.
   * @param {Object} message
   * @param {Object} context - { guest, booking, allPropertyBookings }
   * @param {Object} providerOverride
   * @returns {Promise<{ message: Object, deliveryLog: Object }>}
   */
  async processMessage(message, context = {}, providerOverride = null) {
    const { guest, booking, allPropertyBookings = [] } = context;

    // 1. Resolve Recipient at Send Time
    const resolved = this.resolveRecipient(message, guest);
    if (!resolved.valid) {
      message.status = 'SKIPPED';
      message.failure_code = resolved.error;
      message.failure_message = `Recipient could not be resolved: ${resolved.error}`;
      message.claimed_at = null;
      message.claimed_by = null;

      const log = {
        tenant_id: message.tenant_id,
        scheduled_message_id: message.id,
        attempted_at: new Date().toISOString(),
        channel: message.channel,
        provider: 'INTERNAL',
        status: 'SKIPPED',
        error_code: resolved.error,
        error_category: 'CLIENT_ERROR'
      };

      return { message, deliveryLog: log };
    }

    const finalRecipient = resolved.recipient;

    // 2. Real-time availability check for extension offers
    if (message.automation_rule_id && message.automation_rule_id.includes('NEXT_NIGHT')) {
      if (booking) {
        const avail = evaluateExtensionAvailability(booking, allPropertyBookings);
        if (!avail.available) {
          message.status = 'CANCELLED';
          message.failure_code = 'AVAILABILITY_LOST';
          message.failure_message = 'Consecutive night is no longer vacant';
          message.cancelled_at = new Date().toISOString();
          message.claimed_at = null;
          message.claimed_by = null;

          return {
            message,
            deliveryLog: {
              tenant_id: message.tenant_id,
              scheduled_message_id: message.id,
              attempted_at: new Date().toISOString(),
              channel: message.channel,
              provider: 'INTERNAL',
              status: 'SKIPPED',
              error_code: 'AVAILABILITY_LOST',
              error_category: 'INVENTORY_UNAVAILABLE'
            }
          };
        }
      }
    }

    // 3. Dispatch via Provider
    const provider = getProviderForChannel(message.channel, providerOverride || this.customProvider);
    const dispatchResult = await provider.sendMessage({
      recipient: finalRecipient,
      subject: message.rendered_subject,
      body: message.rendered_body,
      channel: message.channel,
      idempotencyKey: message.idempotency_key
    });

    const nowIso = new Date().toISOString();

    if (dispatchResult.success) {
      message.status = 'SENT';
      message.recipient_snapshot = finalRecipient;
      message.provider_message_id = dispatchResult.providerMessageId;
      message.sent_at = nowIso;
      message.claimed_at = null;
      message.claimed_by = null;

      const deliveryLog = {
        tenant_id: message.tenant_id,
        scheduled_message_id: message.id,
        attempted_at: nowIso,
        channel: message.channel,
        provider: provider.name,
        status: 'SUCCESS',
        provider_response_id: dispatchResult.providerMessageId
      };

      return { message, deliveryLog };
    }

    // 4. Handle Failure (Transient vs Permanent)
    if (dispatchResult.status === 'TRANSIENT_ERROR' && (message.retry_count || 0) < this.maxRetries) {
      const nextRetry = (message.retry_count || 0) + 1;
      const backoffMin = Math.pow(2, nextRetry) * 5;
      const nextScheduled = new Date(Date.now() + backoffMin * 60 * 1000);

      message.status = 'SCHEDULED';
      message.retry_count = nextRetry;
      message.scheduled_at = nextScheduled.toISOString();
      message.failure_code = dispatchResult.errorCode || 'TRANSIENT_FAILURE';
      message.failure_message = dispatchResult.failureMessage;
      message.claimed_at = null;
      message.claimed_by = null;

      const deliveryLog = {
        tenant_id: message.tenant_id,
        scheduled_message_id: message.id,
        attempted_at: nowIso,
        channel: message.channel,
        provider: provider.name,
        status: 'TRANSIENT_ERROR',
        error_code: dispatchResult.errorCode,
        error_category: dispatchResult.errorCategory || 'RETRYABLE'
      };

      return { message, deliveryLog };
    }

    // Permanent Error or Exceeded Retries
    message.status = 'FAILED';
    message.failure_code = dispatchResult.errorCode || 'PERMANENT_ERROR';
    message.failure_message = dispatchResult.failureMessage;
    message.failed_at = nowIso;
    message.claimed_at = null;
    message.claimed_by = null;

    const deliveryLog = {
      tenant_id: message.tenant_id,
      scheduled_message_id: message.id,
      attempted_at: nowIso,
      channel: message.channel,
      provider: provider.name,
      status: 'PERMANENT_ERROR',
      error_code: dispatchResult.errorCode,
      error_category: dispatchResult.errorCategory || 'FATAL'
    };

    return { message, deliveryLog };
  }
}

module.exports = {
  MessageDeliveryService
};
