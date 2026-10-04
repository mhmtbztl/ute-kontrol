(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./ledger_contract') : root.LedgerContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PropertyProfileEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LedgerContract) {
  'use strict';

  function validPair(latitude, longitude) {
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }

  // Open Location Code (Plus Code) — yalniz TAM kod cevrimdisi cozulur.
  // Kisa kod ("CWC8+R9 Mountain View") bir yer adina gore tamamlanir; bunun
  // icin cografi kodlama servisi gerekir, tahminle tamamlanmaz (CLAUDE.md 3.6).
  const OLC_ALPHABET = '23456789CFGHJMPQRVWX';
  const FULL_PLUS_CODE = /^([23456789C][23456789CFGHJMPQRV][23456789CFGHJMPQRVWX0]{6})\+([23456789CFGHJMPQRVWX]{2,})?$/i;
  const SHORT_PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,6}\+[23456789CFGHJMPQRVWX]{2,}\b/i;

  function decodePlusCode(code) {
    const match = String(code || '').trim().toUpperCase().match(FULL_PLUS_CODE);
    if (!match) return null;
    const digits = (match[1] + (match[2] || '')).replace(/0+$/, '');
    if (digits.includes('0') || digits.length % 2 === 1 && digits.length < 10) return null;
    let lat = -90; let lng = -180;
    let latRes = 20; let lngRes = 20;
    for (let i = 0; i < Math.min(digits.length, 10); i += 2) {
      if (i > 0) { latRes /= 20; lngRes /= 20; }
      lat += OLC_ALPHABET.indexOf(digits[i]) * latRes;
      lng += OLC_ALPHABET.indexOf(digits[i + 1]) * lngRes;
    }
    for (let i = 10; i < digits.length; i++) {
      latRes /= 5; lngRes /= 4;
      const index = OLC_ALPHABET.indexOf(digits[i]);
      lat += Math.floor(index / 4) * latRes;
      lng += (index % 4) * lngRes;
    }
    const round = n => Math.round(n * 1e6) / 1e6;
    const latitude = round(lat + latRes / 2);
    const longitude = round(lng + lngRes / 2);
    return validPair(latitude, longitude) ? { latitude, longitude } : null;
  }

  // Kullanicinin elinde olabilecek konum bicimlerini okur:
  //   Google Haritalar baglantisi (pin !3d!4d, @, ?q=, ?ll=, /search/),
  //   kopyalanan duz koordinat "36.2012, 29.6431", tam Plus Code.
  // Okunamazsa { error } doner ki arayuz NEDENINI soyleyebilsin.
  function readLocationInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return { error: 'EMPTY' };
    let text = raw;
    try { text = decodeURIComponent(raw); } catch (_) { /* yari kodlanmis metin: oldugu gibi */ }
    text = text.replace(/\+/g, ' ');
    const plusCode = decodePlusCode(raw.split(/\s/)[0]);
    if (plusCode) return { ...plusCode, source: 'PLUS_CODE' };
    if (SHORT_PLUS_CODE.test(raw)) return { error: 'SHORT_PLUS_CODE' };
    if (/^(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(raw)) return { error: 'SHORT_LINK' };
    const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
    const patterns = [
      new RegExp('!3d' + num + '!4d' + num),
      new RegExp('@' + num + ',' + num + '(?:,|/|$)'),
      new RegExp('[?&](?:q|query|ll|center|destination)=' + num + ',\\s*' + num + '(?:&|$)'),
      new RegExp('/(?:search|place|dir)/' + num + ',\\s*' + num + '(?:[/?,]|$)'),
      new RegExp('^' + num + ',\\s*' + num + '$')
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (validPair(latitude, longitude)) return { latitude, longitude, source: 'COORDINATES' };
    }
    return { error: 'NOT_FOUND' };
  }

  function parseMapCoordinates(value) {
    const result = readLocationInput(value);
    return result.error ? null : { latitude: result.latitude, longitude: result.longitude };
  }

  function belongs(row, property) {
    const id = row && (row.propertyId || row.property_id);
    const slug = row && row.villa;
    return id === property.id || slug === property.slug;
  }

  function buildPropertyReport(input = {}) {
    if (!LedgerContract) throw new Error('LEDGER_CONTRACT_UNAVAILABLE');
    const property = input.property || {};
    const bookings = (input.bookings || []).filter(row => belongs(row, property));
    const expenses = (input.expenses || []).filter(row => belongs(row, property));
    const cleaningTasks = (input.cleaningTasks || []).filter(row => belongs(row, property));
    return LedgerContract.computePeriodLedger({
      bookings, expenses, allExpenses: input.expenses || [], cleaningTasks,
      bookingInScope: () => true,
      bookingShare: row => {
        const checkIn = row.checkIn || row.check_in;
        const checkOut = row.checkOut || row.check_out;
        const nights = checkIn && checkOut ? Math.max(0, Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000)) : 0;
        return { ratio: nights > 0 ? 1 : 0, nights };
      },
      expenseInScope: () => true,
      taskInScope: () => true
    });
  }

  return { parseMapCoordinates, readLocationInput, decodePlusCode, buildPropertyReport };
});
