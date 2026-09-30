(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./finance_export_engine'));
  else root.ReportEngine = factory(root.FinanceExportEngine);
}(typeof self !== 'undefined' ? self : this, function (FinanceExportEngine) {
  'use strict';
  const PAGES = ['FINANCE','PROPERTY','BOOKINGS','OPERATIONS','SALES','CHANNELS_MARKETING'];
  const PAGE_NAMES = { FINANCE: 'Finans', PROPERTY: 'Mülk', BOOKINGS: 'Rezervasyonlar', OPERATIONS: 'Operasyon', SALES: 'Misafirler ve Satış', CHANNELS_MARKETING: 'Kanallar ve Pazarlama' };
  const absent = value => value === undefined || value === null || value === '';
  function metricItems(ledger, profitUnmeasured) {
    const fields = [['netRoomRevenue','Net konaklama geliri','money'],['cleaningRevenue','Temizlik geliri','money'],['totalRevenue','Toplam gelir','money'],['totalOpex','Toplam OPEX','money'],['netProfit','Net kâr','money'],['soldNights','Satılan gece','int'],['adr','ADR','money']];
    return fields.map(([id, label, type]) => ({ id, label, type, value: id === 'netProfit' && profitUnmeasured ? null : ledger && !absent(ledger[id]) ? ledger[id] : null }));
  }
  function reportSheet(page, rows, columns) {
    return { name: PAGE_NAMES[page].slice(0, 31), columns, rows: [{ notice: 'Bu dosya içe aktarılamaz, rapordur.' }].concat((rows || []).map(row => ({ ...row }))) };
  }
  function buildReport(input) {
    const o = input || {}, page = String(o.page || ''), data = o.data || {}, period = o.period || {}, business = o.business || {};
    if (!PAGES.includes(page)) { const error = new Error('Bilinmeyen rapor sayfası'); error.code = 'REPORT_PAGE_UNKNOWN'; throw error; }
    const unmeasured = [], sections = [], ledger = data.ledger || null;
    if (page === 'FINANCE' || page === 'PROPERTY') {
      const profitUnmeasured = data.isProfitUnmeasured === true || data.profitUnmeasured === true;
      const items = metricItems(ledger, profitUnmeasured);
      if (!ledger) unmeasured.push({ id: 'ledger', reason: 'Dönem defteri verilmedi' });
      if (profitUnmeasured) unmeasured.push({ id: 'netProfit', reason: 'Gider kaydı yok; kâr ölçülemedi' });
      items.filter(x => x.value === null && !unmeasured.some(u => u.id === x.id)).forEach(x => unmeasured.push({ id: x.id, reason: 'Veri ölçülmedi' }));
      sections.push({ id: 'summary', title: 'Dönem özeti', kind: 'kpis', items });
    } else {
      const mapping = {
        BOOKINGS: ['bookings', 'Rezervasyonlar'], OPERATIONS: ['cleaningTasks', 'Operasyon kayıtları'],
        SALES: ['leads', 'Satış hunisi'], CHANNELS_MARKETING: ['channelEconomics', 'Kanal ekonomisi']
      }[page];
      const rows = Array.isArray(data[mapping[0]]) ? data[mapping[0]] : [];
      sections.push({ id: mapping[0], title: mapping[1], kind: 'table', columns: [], rows });
      if (!rows.length) unmeasured.push({ id: mapping[0], reason: 'Kayıt yok' });
    }
    let excel;
    if (page === 'FINANCE') {
      const bookings = FinanceExportEngine.buildExport('BOOKINGS', data.bookings || []), expenses = FinanceExportEngine.buildExport('EXPENSES', data.expenses || []);
      excel = { roundTrip: true, sheets: [{ name: 'Rezervasyonlar', columns: bookings.headers, rows: bookings.rows }, { name: 'Giderler', columns: expenses.headers, rows: expenses.rows }] };
    } else if (page === 'BOOKINGS') {
      const exported = FinanceExportEngine.buildExport('BOOKINGS', data.bookings || []);
      excel = { roundTrip: true, sheets: [{ name: 'Rezervasyonlar', columns: exported.headers, rows: exported.rows }] };
    } else {
      const first = sections[0], rows = first.rows || (first.items || []).map(x => ({ metric: x.label, value: x.value }));
      excel = { roundTrip: false, sheets: [reportSheet(page, rows, first.columns || [{ key: 'metric', label: 'Metrik', type: 'text' }, { key: 'value', label: 'Değer', type: 'text' }])] };
    }
    const filterLabel = o.filters && o.filters.label ? o.filters.label : 'Tüm mülkler';
    const title = `${PAGE_NAMES[page]} raporu`;
    const subtitle = `${period.start || '—'} – ${period.end || '—'} · ${filterLabel}`;
    const summary = page === 'SALES' ? { funnel: data.funnel || null } : page === 'FINANCE' || page === 'PROPERTY' ? Object.fromEntries((sections[0].items || []).map(x => [x.id, x.value])) : { recordCount: (sections[0].rows || []).length };
    return { title, subtitle, business: { name: business.name || null, logoUrl: business.logoUrl || null }, sections, unmeasured, excel, chatGptContext: { title, subtitle, summary } };
  }
  return { buildReport };
}));
