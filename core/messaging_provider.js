// =============================================================================
// LEXBNB PHASE 10 — MESSAGING PROVIDER ABSTRACTION
// Channel Capability Matrix, Adapters, Provider-Side Idempotency Keys,
// and Sanitized Payload Handlers
// =============================================================================

const CHANNEL_CAPABILITIES = {
  WHATSAPP: {
    supportsSubject: false,
    supportsHtml: false,
    supportsAttachments: true,
    maxLength: 4096,
    requiresPhone: true,
    requiresEmail: false
  },
  EMAIL: {
    supportsSubject: true,
    supportsHtml: true,
    supportsAttachments: true,
    maxLength: 50000,
    requiresPhone: false,
    requiresEmail: true
  },
  SMS: {
    supportsSubject: false,
    supportsHtml: false,
    supportsAttachments: false,
    maxLength: 160,
    requiresPhone: true,
    requiresEmail: false
  },
  AIRBNB: {
    supportsSubject: false,
    supportsHtml: false,
    supportsAttachments: false,
    maxLength: 2000,
    requiresPhone: false,
    requiresEmail: false
  },
  BOOKING: {
    supportsSubject: false,
    supportsHtml: false,
    supportsAttachments: false,
    maxLength: 2000,
    requiresPhone: false,
    requiresEmail: false
  },
  INTERNAL: {
    supportsSubject: true,
    supportsHtml: true,
    supportsAttachments: true,
    maxLength: 10000,
    requiresPhone: false,
    requiresEmail: false
  }
};

class MessagingProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * Sends a message through the provider.
   * @param {Object} params - { recipient, subject, body, channel, idempotencyKey, metadata }
   * @returns {Promise<{ success: boolean, providerMessageId?: string, status: string, errorCode?: string, errorCategory?: string, failureMessage?: string }>}
   */
  async sendMessage(params) {
    throw new Error('sendMessage() must be implemented by subclass');
  }

  /**
   * Retrieves provider delivery status.
   * @param {string} providerMessageId
   */
  async getDeliveryStatus(providerMessageId) {
    return { status: 'DELIVERED', providerMessageId };
  }
}

class MockDeliveryProvider extends MessagingProvider {
  constructor(options = {}) {
    super('MockProvider');
    this.options = options;
    this.dispatchedMessages = [];
  }

  setBehavior(options) {
    this.options = { ...this.options, ...options };
  }

  async sendMessage(params) {
    const { recipient, subject, body, channel, idempotencyKey } = params;

    // Simulate configured behavior
    if (this.options.simulateTimeout) {
      const err = new Error('PROVIDER_TIMEOUT: Gateway timeout connecting to SMS/WhatsApp provider');
      err.code = 'TIMEOUT';
      err.category = 'NETWORK';
      return {
        success: false,
        status: 'TRANSIENT_ERROR',
        errorCode: 'TIMEOUT',
        errorCategory: 'NETWORK',
        failureMessage: err.message
      };
    }

    if (this.options.simulateTransientError) {
      return {
        success: false,
        status: 'TRANSIENT_ERROR',
        errorCode: 'RATE_LIMIT_EXCEEDED',
        errorCategory: 'THROTTLE',
        failureMessage: 'Too many requests, retry after backoff'
      };
    }

    if (this.options.simulatePermanentError || (recipient && recipient.includes('invalid'))) {
      return {
        success: false,
        status: 'PERMANENT_ERROR',
        errorCode: 'INVALID_RECIPIENT',
        errorCategory: 'CLIENT_ERROR',
        failureMessage: 'Destination address not found or permanently blocked'
      };
    }

    const providerMessageId = `mock_${channel.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.dispatchedMessages.push({
      providerMessageId,
      recipient,
      subject,
      body,
      channel,
      idempotencyKey,
      sentAt: new Date().toISOString()
    });

    return {
      success: true,
      status: 'SUCCESS',
      providerMessageId
    };
  }
}

class WhatsAppProvider extends MessagingProvider {
  constructor(config = {}) {
    super('WhatsAppProvider');
    this.config = config;
  }

  async sendMessage(params) {
    if (!params.recipient) {
      return {
        success: false,
        status: 'SKIPPED',
        errorCode: 'MISSING_RECIPIENT',
        errorCategory: 'CLIENT_ERROR',
        failureMessage: 'Telefon numarası eksik'
      };
    }
    const providerMessageId = `wa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      success: true,
      status: 'SUCCESS',
      providerMessageId
    };
  }
}

class EmailProvider extends MessagingProvider {
  constructor(config = {}) {
    super('EmailProvider');
    this.config = config;
  }

  async sendMessage(params) {
    if (!params.recipient) {
      return {
        success: false,
        status: 'SKIPPED',
        errorCode: 'MISSING_RECIPIENT',
        errorCategory: 'CLIENT_ERROR',
        failureMessage: 'E-posta adresi eksik'
      };
    }
    const providerMessageId = `email_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      success: true,
      status: 'SUCCESS',
      providerMessageId
    };
  }
}

class SmsProvider extends MessagingProvider {
  constructor(config = {}) {
    super('SmsProvider');
    this.config = config;
  }

  async sendMessage(params) {
    if (!params.recipient) {
      return {
        success: false,
        status: 'SKIPPED',
        errorCode: 'MISSING_RECIPIENT',
        errorCategory: 'CLIENT_ERROR',
        failureMessage: 'Telefon numarası eksik'
      };
    }
    const providerMessageId = `sms_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      success: true,
      status: 'SUCCESS',
      providerMessageId
    };
  }
}

class AirbnbProvider extends MessagingProvider {
  constructor(config = {}) {
    super('AirbnbProvider');
    this.config = config;
  }

  async sendMessage(params) {
    const providerMessageId = `ab_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      success: true,
      status: 'SUCCESS',
      providerMessageId
    };
  }
}

class BookingProvider extends MessagingProvider {
  constructor(config = {}) {
    super('BookingProvider');
    this.config = config;
  }

  async sendMessage(params) {
    const providerMessageId = `bcom_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      success: true,
      status: 'SUCCESS',
      providerMessageId
    };
  }
}

function getProviderForChannel(channel, customProvider = null) {
  if (customProvider) return customProvider;

  switch (channel) {
    case 'WHATSAPP': return new WhatsAppProvider();
    case 'EMAIL': return new EmailProvider();
    case 'SMS': return new SmsProvider();
    case 'AIRBNB': return new AirbnbProvider();
    case 'BOOKING': return new BookingProvider();
    default: return new MockDeliveryProvider();
  }
}

module.exports = {
  CHANNEL_CAPABILITIES,
  MessagingProvider,
  MockDeliveryProvider,
  WhatsAppProvider,
  EmailProvider,
  SmsProvider,
  AirbnbProvider,
  BookingProvider,
  getProviderForChannel
};
