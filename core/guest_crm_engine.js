// =============================================================================
// LEXBNB — GUEST CRM AGGREGATION ENGINE
// Pure helpers: canonical guest profiles, repeat-stay metrics and lifecycle.
// =============================================================================

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LexbnbGuestCrm = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DIRECT_CHANNELS = new Set(['DIRECT', 'WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'REPEAT', 'PHONE']);

  function isBulkSummaryBooking(booking) {
    const name = String(booking?.guest || booking?.guest_name || '').trim();
    return /^TOPLU\s+AKTARIM(?:\s*[—–-]|\s|$)/i.test(name);
  }

  function isActiveBooking(booking) {
    return booking && String(booking.status || '').toUpperCase() !== 'CANCELLED';
  }

  function bookingGuestId(booking) {
    return booking?.primaryGuestId || booking?.primary_guest_id || null;
  }

  function bookingNights(booking) {
    const explicit = Number(booking?.nights);
    if (Number.isFinite(explicit) && explicit >= 0) return explicit;
    const start = Date.parse(String(booking?.checkIn || booking?.check_in || '') + 'T00:00:00Z');
    const end = Date.parse(String(booking?.checkOut || booking?.check_out || '') + 'T00:00:00Z');
    return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 86400000)) : 0;
  }

  function bookingGross(booking) {
    const value = Number(booking?.gross ?? booking?.grossAmount ?? booking?.gross_amount);
    return Number.isFinite(value) ? value : 0;
  }

  function bookingPropertyId(booking) {
    return booking?.propertyId || booking?.property_id || booking?.villa || '';
  }

  function bookingDate(booking, field) {
    if (!booking) return '';
    return field === 'in'
      ? String(booking.checkIn || booking.check_in || '')
      : String(booking.checkOut || booking.check_out || '');
  }

  function dayDifference(fromDate, toDate) {
    const from = Date.parse(String(fromDate || '') + 'T00:00:00Z');
    const to = Date.parse(String(toDate || '') + 'T00:00:00Z');
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return Math.max(0, Math.floor((to - from) / 86400000));
  }

  function displayName(guest) {
    return [guest?.firstName || guest?.first_name, guest?.lastName || guest?.last_name]
      .filter(Boolean).join(' ').trim() || 'İsimsiz misafir';
  }

  function lifecycleFor(bookings, today) {
    const sorted = bookings.slice().sort((a, b) => String(a.checkIn || a.check_in).localeCompare(String(b.checkIn || b.check_in)));
    const inHouse = sorted.find(b => (b.checkIn || b.check_in) <= today && (b.checkOut || b.check_out) > today);
    if (inHouse) return { code: 'IN_HOUSE', label: 'Konaklamada', booking: inHouse };
    const next = sorted.find(b => (b.checkIn || b.check_in) > today);
    if (next) return { code: 'UPCOMING', label: 'Yaklaşan', booking: next };
    const last = sorted.slice().reverse().find(b => (b.checkOut || b.check_out) <= today);
    if (last) return { code: 'POST_STAY', label: 'Çıkış yaptı', booking: last };
    return { code: 'PROFILE_ONLY', label: 'Profil', booking: null };
  }

  function buildGuestCrmView(input = {}) {
    const guests = Array.isArray(input.guests) ? input.guests : [];
    const bookings = Array.isArray(input.bookings) ? input.bookings : [];
    const messages = Array.isArray(input.messages) ? input.messages : [];
    const offers = Array.isArray(input.offers) ? input.offers : [];
    const today = String(input.today || new Date().toISOString().slice(0, 10));
    const bookingsByGuest = new Map();

    bookings.filter(isActiveBooking).forEach(booking => {
      const guestId = bookingGuestId(booking);
      if (!guestId || isBulkSummaryBooking(booking)) return;
      if (!bookingsByGuest.has(guestId)) bookingsByGuest.set(guestId, []);
      bookingsByGuest.get(guestId).push(booking);
    });

    const messagesByBooking = new Map();
    messages.forEach(message => {
      const id = message.booking_id || message.bookingId;
      if (!id) return;
      if (!messagesByBooking.has(id)) messagesByBooking.set(id, []);
      messagesByBooking.get(id).push(message);
    });
    const offersByBooking = new Map();
    offers.forEach(offer => {
      const id = offer.booking_id || offer.bookingId;
      if (!id) return;
      if (!offersByBooking.has(id)) offersByBooking.set(id, []);
      offersByBooking.get(id).push(offer);
    });

    const rows = guests.map(guest => {
      const stays = (bookingsByGuest.get(guest.id) || []).slice().sort((a, b) => String(b.checkIn || b.check_in).localeCompare(String(a.checkIn || a.check_in)));
      const bookingIds = new Set(stays.map(b => b.id).filter(Boolean));
      const guestMessages = [];
      const guestOffers = [];
      bookingIds.forEach(id => {
        guestMessages.push(...(messagesByBooking.get(id) || []));
        guestOffers.push(...(offersByBooking.get(id) || []));
      });
      // Onaylanmış gelecek rezervasyon da tekrar satın alma sinyalidir; yalnız
      // iptal edilenler üstte elendi. Böylece ikinci rezervasyon daha misafir
      // gelmeden sadakat metriğine doğru biçimde yansır.
      const stayCount = stays.length;
      const directCount = stays.filter(b => DIRECT_CHANNELS.has(String(b.channel || '').toUpperCase())).length;
      const scheduledCount = guestMessages.filter(m => ['SCHEDULED', 'PROCESSING'].includes(String(m.status || '').toUpperCase())).length;
      const latestOffer = guestOffers.slice().sort((a, b) => String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || '')))[0] || null;
      const lastStay = stays.find(b => (b.checkOut || b.check_out) <= today) || null;
      const nextStay = stays.slice().reverse().find(b => (b.checkIn || b.check_in) > today) || null;
      const daysSinceLastStay = lastStay ? dayDifference(bookingDate(lastStay, 'out'), today) : null;
      // Yeniden rezervasyon adayi yalnizca gercek ve eyleme hazir sinyallerle
      // belirlenir: tamamlanmis konaklama, gelecekte rezervasyon olmamasi,
      // WhatsApp izni + telefon ve ayrica acik kampanya onayi. Tahmini gelir
      // veya keyfi bir "AI skoru" uretilmez.
      const rebookingEligible = !!(
        lastStay && !nextStay && guest.phone && guest.allow_whatsapp !== false &&
        guest.allowWhatsapp !== false &&
        (guest.marketingOptIn === true || guest.marketing_opt_in === true)
      );
      return {
        id: guest.id,
        guest,
        name: displayName(guest),
        phone: guest.phone || '',
        email: guest.email || '',
        language: guest.language || guest.preferred_language || 'tr',
        marketingOptIn: guest.marketingOptIn === true || guest.marketing_opt_in === true,
        stayCount,
        isRepeat: stayCount >= 2,
        nights: stays.reduce((sum, booking) => sum + bookingNights(booking), 0),
        lifetimeRevenue: stays.reduce((sum, booking) => sum + bookingGross(booking), 0),
        directCount,
        directShare: stays.length ? directCount / stays.length : null,
        rebookingEligible,
        daysSinceLastStay,
        lifecycle: lifecycleFor(stays, today),
        lastStay,
        nextStay,
        scheduledCount,
        latestOffer,
        bookings: stays,
        messages: guestMessages,
        offers: guestOffers
      };
    });

    const repeatRows = rows.filter(row => row.isRepeat);
    const excludedAggregateBookingCount = bookings.filter(isBulkSummaryBooking).length;
    const unlinkedBookingCount = bookings.filter(b => isActiveBooking(b) && !isBulkSummaryBooking(b) && !bookingGuestId(b)).length;
    return {
      rows,
      metrics: {
        totalGuests: rows.length,
        repeatGuests: repeatRows.length,
        repeatRate: rows.length ? repeatRows.length / rows.length : null,
        repeatRevenue: repeatRows.reduce((sum, row) => sum + row.lifetimeRevenue, 0),
        contactableGuests: rows.filter(row => row.phone || row.email).length,
        marketingEligibleGuests: rows.filter(row => row.marketingOptIn && (row.phone || row.email)).length,
        rebookingOpportunityCount: rows.filter(row => row.rebookingEligible).length,
        unlinkedBookingCount,
        excludedAggregateBookingCount
      }
    };
  }

  function filterGuestRows(rows, options = {}) {
    const query = String(options.query || '').trim().toLocaleLowerCase('tr-TR');
    const segment = String(options.segment || 'ALL');
    const dateStart = String(options.dateStart || '');
    const dateEnd = String(options.dateEnd || '');
    const result = (rows || []).filter(row => {
      if (segment === 'REPEAT' && !row.isRepeat) return false;
      if (segment === 'UPCOMING' && row.lifecycle.code !== 'UPCOMING') return false;
      if (segment === 'IN_HOUSE' && row.lifecycle.code !== 'IN_HOUSE') return false;
      if (segment === 'CONTACTABLE' && !row.phone && !row.email) return false;
      if (segment === 'POST_STAY' && row.lifecycle.code !== 'POST_STAY') return false;
      if (segment === 'CONSENTED' && !(row.marketingOptIn && (row.phone || row.email))) return false;
      if (segment === 'REBOOKING' && !row.rebookingEligible) return false;
      if (segment === 'NO_CONTACT' && (row.phone || row.email)) return false;
      if (options.propertyId && !(row.bookings || []).some(booking => bookingPropertyId(booking) === options.propertyId)) return false;
      if (dateStart || dateEnd) {
        const hasBookingInRange = (row.bookings || []).some(booking => {
          const checkIn = String(booking.checkIn || booking.check_in || '');
          const checkOut = String(booking.checkOut || booking.check_out || checkIn);
          if (dateStart && checkOut <= dateStart) return false;
          if (dateEnd && checkIn > dateEnd) return false;
          return true;
        });
        if (!hasBookingInRange) return false;
      }
      if (!query) return true;
      return [row.name, row.phone, row.email].some(value => String(value || '').toLocaleLowerCase('tr-TR').includes(query));
    });
    const sort = String(options.sort || 'RECENT');
    const direction = String(options.direction || 'DESC') === 'ASC' ? 1 : -1;
    result.sort((a, b) => {
      let comparison = 0;
      if (sort === 'VALUE') comparison = a.lifetimeRevenue - b.lifetimeRevenue;
      else if (sort === 'STAYS') comparison = a.stayCount - b.stayCount;
      else if (sort === 'NIGHTS') comparison = a.nights - b.nights;
      else if (sort === 'NAME') comparison = a.name.localeCompare(b.name, 'tr');
      else {
        const aDate = a.nextStay?.checkIn || a.nextStay?.check_in || a.lifecycle?.booking?.checkIn || a.lifecycle?.booking?.check_in || a.lastStay?.checkOut || a.lastStay?.check_out || '';
        const bDate = b.nextStay?.checkIn || b.nextStay?.check_in || b.lifecycle?.booking?.checkIn || b.lifecycle?.booking?.check_in || b.lastStay?.checkOut || b.lastStay?.check_out || '';
        comparison = String(aDate).localeCompare(String(bDate));
      }
      if (comparison !== 0) return comparison * direction;
      return a.name.localeCompare(b.name, 'tr');
    });
    return result;
  }

  return { isBulkSummaryBooking, buildGuestCrmView, filterGuestRows, displayName };
});
