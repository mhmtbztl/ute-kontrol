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
        unlinkedBookingCount,
        excludedAggregateBookingCount
      }
    };
  }

  function filterGuestRows(rows, options = {}) {
    const query = String(options.query || '').trim().toLocaleLowerCase('tr-TR');
    const segment = String(options.segment || 'ALL');
    const result = (rows || []).filter(row => {
      if (segment === 'REPEAT' && !row.isRepeat) return false;
      if (segment === 'UPCOMING' && row.lifecycle.code !== 'UPCOMING') return false;
      if (segment === 'IN_HOUSE' && row.lifecycle.code !== 'IN_HOUSE') return false;
      if (segment === 'CONTACTABLE' && !row.phone && !row.email) return false;
      if (!query) return true;
      return [row.name, row.phone, row.email].some(value => String(value || '').toLocaleLowerCase('tr-TR').includes(query));
    });
    const sort = String(options.sort || 'RECENT');
    result.sort((a, b) => {
      if (sort === 'VALUE') return b.lifetimeRevenue - a.lifetimeRevenue || a.name.localeCompare(b.name, 'tr');
      if (sort === 'STAYS') return b.stayCount - a.stayCount || a.name.localeCompare(b.name, 'tr');
      if (sort === 'NAME') return a.name.localeCompare(b.name, 'tr');
      const aDate = a.nextStay?.checkIn || a.nextStay?.check_in || a.lastStay?.checkOut || a.lastStay?.check_out || '';
      const bDate = b.nextStay?.checkIn || b.nextStay?.check_in || b.lastStay?.checkOut || b.lastStay?.check_out || '';
      return String(bDate).localeCompare(String(aDate)) || a.name.localeCompare(b.name, 'tr');
    });
    return result;
  }

  return { isBulkSummaryBooking, buildGuestCrmView, filterGuestRows, displayName };
});
