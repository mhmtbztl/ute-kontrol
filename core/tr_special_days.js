/** Türkiye resmî/dinî tatilleri ve MEB yarıyıl tatili; tarih tahmini yapmaz. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TrSpecialDays = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const YEAR_SOURCES = {
    // Diyanet 2026 resmî tatiller: https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=158
    // MEB 2025-2026 çalışma takvimi: https://meb.gov.tr/2025-2026-egitim-ogretim-yili-takvimi-aciklandi/haber/37198/tr
    2026: true,
    // Diyanet 2027 resmî tatiller: https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=159
    // MEB 2026-2027 çalışma takvimi: https://meb.gov.tr/2026-2027-egitim-ogretim-yili-takvimi-aciklandi/haber/41057/tr
    2027: true
  };

  const FIXED = [
    ['01-01', 'Yılbaşı', 'YILBASI'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı', 'RESMI'],
    ['05-01', 'Emek ve Dayanışma Günü', 'RESMI'], ['05-19', 'Atatürk’ü Anma, Gençlik ve Spor Bayramı', 'RESMI'],
    ['07-15', 'Demokrasi ve Millî Birlik Günü', 'RESMI'], ['08-30', 'Zafer Bayramı', 'RESMI'],
    ['10-28', 'Cumhuriyet Bayramı Arifesi (yarım gün)', 'RESMI'], ['10-29', 'Cumhuriyet Bayramı', 'RESMI']
  ];

  const VARIABLE = {
    2026: [
      ['03-19','Ramazan Bayramı Arefesi','DINI'], ['03-20','Ramazan Bayramı 1. Gün','DINI'],
      ['03-21','Ramazan Bayramı 2. Gün','DINI'], ['03-22','Ramazan Bayramı 3. Gün','DINI'],
      ['05-26','Kurban Bayramı Arefesi','DINI'], ['05-27','Kurban Bayramı 1. Gün','DINI'],
      ['05-28','Kurban Bayramı 2. Gün','DINI'], ['05-29','Kurban Bayramı 3. Gün','DINI'],
      ['05-30','Kurban Bayramı 4. Gün','DINI']
    ],
    2027: [
      ['03-08','Ramazan Bayramı Arefesi','DINI'], ['03-09','Ramazan Bayramı 1. Gün','DINI'],
      ['03-10','Ramazan Bayramı 2. Gün','DINI'], ['03-11','Ramazan Bayramı 3. Gün','DINI'],
      ['05-15','Kurban Bayramı Arefesi','DINI'], ['05-16','Kurban Bayramı 1. Gün','DINI'],
      ['05-17','Kurban Bayramı 2. Gün','DINI'], ['05-18','Kurban Bayramı 3. Gün','DINI'],
      ['05-19','Kurban Bayramı 4. Gün','DINI']
    ]
  };

  const SCHOOL_BREAKS = { 2026: ['2026-01-19', '2026-01-30'], 2027: ['2027-01-25', '2027-02-05'] };
  const DAY = 86400000;
  function isoToMs(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(value + 'T00:00:00Z') : NaN; }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function rowsForYear(year) {
    const rows = FIXED.map(([md, name, kind]) => ({ date: `${year}-${md}`, name, kind }));
    VARIABLE[year].forEach(([md, name, kind]) => rows.push({ date: `${year}-${md}`, name, kind }));
    const [start, end] = SCHOOL_BREAKS[year];
    for (let ms = isoToMs(start); ms <= isoToMs(end); ms += DAY) rows.push({ date: iso(ms), name: 'MEB Yarıyıl Tatili', kind: 'OKUL' });
    return rows;
  }
  const TABLE = Object.fromEntries(Object.keys(YEAR_SOURCES).map(y => [y, rowsForYear(Number(y))]));
  function withWarnings(rows, warnings) { Object.defineProperty(rows, 'warnings', { value: warnings, enumerable: false }); return rows; }
  function forRange(start, end) {
    const startMs = isoToMs(start), endMs = isoToMs(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return withWarnings([], [{ code: 'INVALID_RANGE', text: 'Geçerli bir tarih aralığı girilmemiş' }]);
    const years = [];
    for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) years.push(y);
    const unknown = years.filter(y => !YEAR_SOURCES[y]);
    const rows = years.filter(y => YEAR_SOURCES[y]).flatMap(y => TABLE[y]).filter(row => row.date >= start && row.date <= end).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'tr'));
    return withWarnings(rows, unknown.length ? [{ code: 'SPECIAL_DAYS_UNKNOWN_FOR_YEAR', text: `${unknown.join(', ')} yılı için doğrulanmış özel gün tablosu yok` }] : []);
  }
  function coveredYears() { return Object.keys(YEAR_SOURCES).map(Number); }
  return { forRange, coveredYears };
}));
