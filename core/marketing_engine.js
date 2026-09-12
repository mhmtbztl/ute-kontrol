// =============================================================================
// LEXBNB PHASE 17 — REVENUE & DISTRIBUTION MARKETING ENGINE
// Canonical channel identity and stay-date channel economics.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./financial_metrics_service'));
  } else {
    root.MarketingEngine = factory(root.FinancialMetricsService);
  }
}(typeof self !== 'undefined' ? self : this, function (FinancialMetricsService) {
  'use strict';

  if (!FinancialMetricsService || typeof FinancialMetricsService.splitBookingStayNights !== 'function') {
    throw new Error('MarketingEngine requires FinancialMetricsService.splitBookingStayNights');
  }

  const CANONICAL_CHANNELS = Object.freeze([
    'AIRBNB', 'BOOKING_COM', 'VRBO', 'EXPEDIA', 'DIRECT', 'OTHER_OTA', 'UNKNOWN'
  ]);

  const DIRECT_SUBCHANNELS = Object.freeze({
    DIRECT: 'DIRECT', WHATSAPP: 'WHATSAPP', INSTAGRAM: 'INSTAGRAM',
    WEBSITE: 'WEBSITE', WEB: 'WEBSITE', PHONE: 'PHONE', TELEPHONE: 'PHONE',
    TELEFON: 'PHONE', REPEAT: 'REPEAT_GUEST', REPEAT_GUEST: 'REPEAT_GUEST'
  });

  const CHANNEL_ALIASES = Object.freeze({
    AIRBNB: 'AIRBNB', AIR_BNB: 'AIRBNB', BOOKING: 'BOOKING_COM', BOOKING_COM: 'BOOKING_COM',
    BOOKINGCOM: 'BOOKING_COM', VRBO: 'VRBO', HOMEAWAY: 'VRBO',
    EXPEDIA: 'EXPEDIA', OTHER_OTA: 'OTHER_OTA', OTA_OTHER: 'OTHER_OTA'
  });

  function firstDefined(source, keys, fallback) {
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    }
    return fallback;
  }

  function normalizeToken(value) {
    return String(value === undefined || value === null ? '' : value)
      .trim().toUpperCase().replace(/İ/g, 'I').replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function normalizeChannel(rawChannel) {
    const raw = rawChannel === undefined || rawChannel === null ? '' : String(rawChannel).trim();
    const token = normalizeToken(raw);
    if (DIRECT_SUBCHANNELS[token]) {
      return { rawChannel: raw, canonicalChannel: 'DIRECT', directSubchannel: DIRECT_SUBCHANNELS[token], mappingStatus: 'MAPPED' };
    }
    if (CHANNEL_ALIASES[token]) {
      return { rawChannel: raw, canonicalChannel: CHANNEL_ALIASES[token], directSubchannel: null, mappingStatus: 'MAPPED' };
    }
    return { rawChannel: raw, canonicalChannel: 'UNKNOWN', directSubchannel: null, mappingStatus: raw ? 'UNMAPPED' : 'MISSING' };
  }

  function roundMoney(value) {
    return FinancialMetricsService.roundMoney(value);
  }

  function safeRate(numerator, denominator) {
    if (!Number.isFinite(denominator) || denominator <= 0) return null;
    return roundMoney(numerator / denominator);
  }

  function normalizeCurrency(value, fallback) {
    const token = normalizeToken(value || fallback);
    return token || fallback;
  }

  function assertCurrencyCompatible(booking, baseCurrency) {
    const explicitCurrency = firstDefined(booking, ['currency', 'currency_code', 'currencyCode'], null);
    if (!explicitCurrency) return { currency: baseCurrency, wasAssumed: true };
    const currency = normalizeCurrency(explicitCurrency, baseCurrency);
    if (currency !== baseCurrency) {
      const bookingId = firstDefined(booking, ['id', 'booking_code', 'bookingCode'], 'UNKNOWN_BOOKING');
      throw new Error(`MIXED_CURRENCY_NOT_SUPPORTED: ${bookingId} is ${currency}, expected ${baseCurrency}`);
    }
    return { currency, wasAssumed: false };
  }

  function isInPeriod(date, periodStart, periodEndExclusive) {
    if (periodStart && date < periodStart) return false;
    if (periodEndExclusive && date >= periodEndExclusive) return false;
    return true;
  }

  function toFinancialBooking(booking) {
    return {
      ...booking,
      checkIn: firstDefined(booking, ['checkIn', 'check_in'], null),
      checkOut: firstDefined(booking, ['checkOut', 'check_out'], null),
      propertyId: firstDefined(booking, ['propertyId', 'property_id', 'villa'], null)
    };
  }

  function newAccumulator(channel) {
    return {
      channel, bookingIds: new Set(), bookedNights: 0, bookingRevenueAfterDiscount: 0,
      roomRevenueBeforeDistribution: 0, cleaningRevenue: 0, distributionCost: 0,
      roomRevenueAfterDistribution: 0, assumedCurrencyBookingIds: new Set(),
      rawChannels: new Set(), directSubchannels: new Set()
    };
  }

  function finalizeAccumulator(acc, availableNights) {
    const hasAvailability = Number.isFinite(availableNights) && availableNights >= 0;
    return {
      channel: acc.channel,
      reservationCount: acc.bookingIds.size,
      bookedNights: acc.bookedNights,
      bookingRevenueAfterDiscount: roundMoney(acc.bookingRevenueAfterDiscount),
      roomRevenueBeforeDistribution: roundMoney(acc.roomRevenueBeforeDistribution),
      cleaningRevenue: roundMoney(acc.cleaningRevenue),
      distributionCost: roundMoney(acc.distributionCost),
      roomRevenueAfterDistribution: roundMoney(acc.roomRevenueAfterDistribution),
      roomAdr: safeRate(acc.roomRevenueBeforeDistribution, acc.bookedNights),
      netRoomAdr: safeRate(acc.roomRevenueAfterDistribution, acc.bookedNights),
      availableNights: hasAvailability ? availableNights : null,
      roomRevPar: hasAvailability ? safeRate(acc.roomRevenueBeforeDistribution, availableNights) : null,
      netRoomRevPar: hasAvailability ? safeRate(acc.roomRevenueAfterDistribution, availableNights) : null,
      assumedCurrencyReservationCount: acc.assumedCurrencyBookingIds.size,
      rawChannels: Array.from(acc.rawChannels).sort(),
      directSubchannels: Array.from(acc.directSubchannels).sort()
    };
  }

  function computeChannelEconomics(params) {
    const {
      bookings = [], propertyId = null, periodStart = null, periodEndExclusive = null,
      baseCurrency = 'TRY', availableNights = null, channelAvailableNights = {}
    } = params || {};

    if (periodStart && periodEndExclusive && periodEndExclusive <= periodStart) {
      throw new Error('INVALID_PERIOD: periodEndExclusive must be after periodStart');
    }

    const normalizedBaseCurrency = normalizeCurrency(baseCurrency, 'TRY');
    const groups = new Map();
    const total = newAccumulator('ALL');
    const unknownRawChannels = new Set();
    let excludedCancelledReservations = 0;
    let excludedOutsidePeriodReservations = 0;

    bookings.forEach(booking => {
      const bookingPropertyId = firstDefined(booking, ['propertyId', 'property_id', 'villa'], null);
      if (propertyId && bookingPropertyId !== propertyId) return;

      const status = normalizeToken(firstDefined(booking, ['status'], 'CONFIRMED'));
      if (status === 'CANCELLED') {
        excludedCancelledReservations += 1;
        return;
      }

      const stayNights = FinancialMetricsService.splitBookingStayNights(toFinancialBooking(booking))
        .filter(night => isInPeriod(night.date, periodStart, periodEndExclusive));
      if (stayNights.length === 0) {
        excludedOutsidePeriodReservations += 1;
        return;
      }

      const currencyInfo = assertCurrencyCompatible(booking, normalizedBaseCurrency);
      const channelInfo = normalizeChannel(firstDefined(booking, ['channel'], null));
      if (channelInfo.canonicalChannel === 'UNKNOWN') unknownRawChannels.add(channelInfo.rawChannel || '(missing)');

      if (!groups.has(channelInfo.canonicalChannel)) groups.set(channelInfo.canonicalChannel, newAccumulator(channelInfo.canonicalChannel));
      const group = groups.get(channelInfo.canonicalChannel);
      const bookingId = firstDefined(booking, ['id', 'booking_code', 'bookingCode'], `anonymous-${groups.size}-${total.bookingIds.size}`);

      [group, total].forEach(acc => {
        acc.bookingIds.add(bookingId);
        acc.rawChannels.add(channelInfo.rawChannel || '(missing)');
        if (channelInfo.directSubchannel) acc.directSubchannels.add(channelInfo.directSubchannel);
        if (currencyInfo.wasAssumed) acc.assumedCurrencyBookingIds.add(bookingId);
        stayNights.forEach(night => {
          acc.bookedNights += 1;
          acc.bookingRevenueAfterDiscount += Number(night.financialRevenue || 0);
          acc.roomRevenueBeforeDistribution += Number(night.roomRevenue || 0);
          acc.cleaningRevenue += Number(night.cleaningRevenue || 0);
          acc.distributionCost += Number(night.otaCommission || 0);
          acc.roomRevenueAfterDistribution += Number(night.roomRevenue || 0) - Number(night.otaCommission || 0);
        });
      });
    });

    const channels = Array.from(groups.values())
      .map(group => finalizeAccumulator(group, channelAvailableNights[group.channel]))
      .sort((a, b) => b.roomRevenueAfterDistribution - a.roomRevenueAfterDistribution || a.channel.localeCompare(b.channel));
    const totals = finalizeAccumulator(total, availableNights);
    const direct = channels.find(row => row.channel === 'DIRECT');

    return {
      contractVersion: '17.1',
      period: { start: periodStart, endExclusive: periodEndExclusive, dateBasis: 'STAY_DATE' },
      scope: { propertyId },
      currency: normalizedBaseCurrency,
      channels,
      totals,
      mix: {
        directReservationSharePercent: totals.reservationCount > 0
          ? roundMoney(((direct && direct.reservationCount) || 0) / totals.reservationCount * 100) : null,
        directNetRoomRevenueSharePercent: totals.roomRevenueAfterDistribution !== 0
          ? roundMoney(((direct && direct.roomRevenueAfterDistribution) || 0) / totals.roomRevenueAfterDistribution * 100) : null
      },
      dataQuality: {
        status: unknownRawChannels.size > 0 ? 'NEEDS_REVIEW' : 'OK',
        unknownRawChannels: Array.from(unknownRawChannels).sort(),
        assumedCurrencyReservationCount: totals.assumedCurrencyReservationCount,
        excludedCancelledReservations,
        excludedOutsidePeriodReservations,
        notes: [
          'Distribution cost contains recorded channel commission only.',
          'Channel RevPAR is unavailable unless channel-specific available nights are supplied.'
        ]
      }
    };
  }

  return { CANONICAL_CHANNELS, normalizeChannel, computeChannelEconomics };
}));
