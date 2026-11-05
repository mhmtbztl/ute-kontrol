(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AirbnbPerformanceService = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FIELDS = Object.freeze({ views: 'Sayfa görüntüleme sayısı', impressions: 'İlk arama sayfasında gösterim sayısı', favorites: 'Favoriye ekleme sayısı', totalConversion: 'Toplam dönüşüm oranı', firstPageRate: 'İlk sayfada gösterilme oranı', searchConversion: 'Aramadan ilana dönüşüm oranı', bookingConversion: 'İlandan rezervasyona dönüşüm oranı' });
  const COUNTS = ['views', 'impressions', 'favorites'];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function day(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
    const n = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null;
  }
  function addDays(value, days) { const n = day(value); return n === null ? null : new Date(n + days * 86400000).toISOString().slice(0, 10); }
  function validate(input) {
    if (!UUID.test(String(input.listingId))) throw new Error('Bir Airbnb ilanı seçin.');
    if (day(input.start) === null || day(input.end) === null || input.end < input.start) throw new Error('Geçerli bir başlangıç ve bitiş tarihi seçin.');
    const metrics = {};
    for (const [key, label] of Object.entries(FIELDS)) {
      const raw = input.metrics && input.metrics[key];
      if (raw === null || raw === undefined || String(raw).trim() === '') { metrics[key] = null; continue; }
      const text = String(raw).trim().replace(',', '.');
      const value = Number(text);
      if (!/^\d+(\.\d+)?$/.test(text) || !Number.isFinite(value) || value < 0 || (COUNTS.includes(key) ? !Number.isSafeInteger(value) : value > 100)) throw new Error(`${label}: ${COUNTS.includes(key) ? 'sıfır veya pozitif tam sayı' : '0–100 arasında yüzde'} girin.`);
      metrics[key] = value;
    }
    if (Object.values(metrics).every(v => v === null)) throw new Error('En az bir değer girin.');
    const notes = String(input.notes || '').trim();
    if (notes.length > 1000) throw new Error('Not en fazla 1000 karakter olabilir.');
    return { ...input, metrics, notes, endExclusive: addDays(input.end, 1) };
  }
  function currentRecords(records) {
    const superseded = new Set(records.map(r => r.supersedes_id).filter(Boolean));
    const groups = new Map();
    // Old snapshots are retained, but never added to a corrected/new record for the same interval.
    for (const row of records.filter(r => !superseded.has(r.id)).sort((a, b) => Number(Boolean(b.legacy)) - Number(Boolean(a.legacy)) || String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)))) {
      groups.set(`${row.channel_listing_id}:${row.period_start}:${row.period_end}`, row);
    }
    return [...groups.values()];
  }
  function compare(records, listingId, period = {}) {
    const own = currentRecords(records).filter(r => r.channel_listing_id === listingId);
    const current = period.start && period.endExclusive
      ? own.find(r => r.period_start === period.start && addDays(r.period_end, 1) === period.endExclusive)
      : own.sort((a, b) => b.period_end.localeCompare(a.period_end) || b.period_start.localeCompare(a.period_start))[0];
    if (!current) return { current: null, previous: null };
    const days = (day(current.period_end) - day(current.period_start)) / 86400000 + 1;
    const previous = own.find(r => r.period_start === addDays(current.period_start, -days) && r.period_end === addDays(current.period_start, -1));
    return { current, previous: previous || null };
  }
  function difference(current, previous, key) {
    const a = current && current.metrics[key], b = previous && previous.metrics[key];
    return a == null || b == null ? null : Math.round((a - b) * 10000) / 10000;
  }
  function fromLegacy(r) {
    return { ...r, period_end: addDays(r.period_end_exclusive, -1), legacy: true, metrics: { views: r.listing_views ?? null, impressions: r.impressions ?? null, favorites: r.wishlist_saves ?? null, totalConversion: null, firstPageRate: null, searchConversion: null, bookingConversion: null } };
  }
  function changeWindows(date) { return { before: { start: addDays(date, -14), endExclusive: date }, after: { start: date, endExclusive: addDays(date, 14) } }; }
  async function load(client, tenantId) {
    if (!client || !UUID.test(String(tenantId))) throw new Error('Bulut bağlantısı gerekli.');
    async function read(table) {
      const all = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from(table).select('*').eq('tenant_id', tenantId).order('id').range(offset, offset + 499);
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < 500) return all;
      }
    }
    const [records, changes, snapshots] = await Promise.all([read('airbnb_performance_records'), read('airbnb_listing_changes'), read('channel_performance_snapshots')]);
    return { records, changes, legacy: snapshots.map(fromLegacy) };
  }
  async function save(client, tenantId, input, expectedId = null) {
    const v = validate(input);
    const { data, error } = await client.rpc('record_airbnb_performance', { p_tenant_id: tenantId, p_listing_id: v.listingId, p_start: v.start, p_end: v.end, p_metrics: v.metrics, p_notes: v.notes, p_expected_id: expectedId });
    if (error) throw error;
    return data;
  }
  async function saveChange(client, tenantId, input) {
    if (!UUID.test(String(input.listingId)) || day(input.date) === null || !['COVER', 'PHOTOS', 'TITLE', 'PRICE', 'OTHER'].includes(input.kind) || !String(input.notes || '').trim() || String(input.notes).length > 1000) throw new Error('İlanı, tarihi, değişiklik türünü ve kısa açıklamayı doldurun.');
    const { data, error } = await client.rpc('record_airbnb_listing_change', { p_tenant_id: tenantId, p_listing_id: input.listingId, p_date: input.date, p_kind: input.kind, p_notes: input.notes.trim(), p_request_id: input.requestId });
    if (error) throw error;
    return data;
  }
  return { FIELDS, COUNTS, day, addDays, validate, currentRecords, compare, difference, fromLegacy, changeWindows, load, save, saveChange };
}));
