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
  function summaryItems(summary) {
    return Object.entries(summary || {}).map(([id, value]) => ({
      id,
      label: id,
      type: typeof value === 'number' ? 'number' : 'text',
      value: absent(value) ? null : value
    }));
  }
  function inferColumns(rows) {
    const keys = rows.reduce((all, row) => {
      Object.keys(row || {}).forEach(key => all.add(key));
      return all;
    }, new Set());
    return Array.from(keys).map(key => ({ key, label: key, type: 'text' }));
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
      const rows = Array.isArray(data.rows) ? data.rows : (Array.isArray(data[mapping[0]]) ? data[mapping[0]] : []);
      const items = summaryItems(data.summary || {});
      if (items.length) sections.push({ id: 'summary', title: 'Ekran özeti', kind: 'kpis', items });
      sections.push({ id: mapping[0], title: mapping[1], kind: 'table', columns: inferColumns(rows), rows });
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
      const table = sections.find(section => section.kind === 'table');
      const first = table || sections[0], rows = first.rows || (first.items || []).map(x => ({ metric: x.label, value: x.value }));
      excel = { roundTrip: false, sheets: [reportSheet(page, rows, first.columns && first.columns.length ? first.columns : [{ key: 'metric', label: 'Metrik', type: 'text' }, { key: 'value', label: 'Değer', type: 'text' }])] };
    }
    const filterLabel = o.filters && o.filters.label ? o.filters.label : 'Tüm mülkler';
    const title = `${PAGE_NAMES[page]} raporu`;
    const subtitle = `${period.start || '—'} – ${period.end || '—'} · ${filterLabel}`;
    const summary = data.summary || (page === 'SALES' ? { funnel: data.funnel || null } : page === 'FINANCE' || page === 'PROPERTY' ? Object.fromEntries((sections[0].items || []).map(x => [x.id, x.value])) : { recordCount: ((sections.find(section => section.kind === 'table') || {}).rows || []).length });
    return { title, subtitle, business: { name: business.name || null, logoUrl: business.logoUrl || null }, sections, unmeasured, excel, chatGptContext: { title, subtitle, summary } };
  }
  function toCSV(report) {
    const rows = [];
    (report.sections || []).forEach(section => {
      rows.push([section.title || 'Rapor']);
      if (section.kind === 'kpis') {
        rows.push(['Metrik', 'Değer']);
        (section.items || []).forEach(item => rows.push([item.label, item.value]));
      } else if (section.kind === 'table') {
        const columns = section.columns && section.columns.length ? section.columns : inferColumns(section.rows || []);
        rows.push(columns.map(column => column.label));
        (section.rows || []).forEach(row => rows.push(columns.map(column => row && row[column.key])));
      }
      rows.push([]);
    });
    return '\ufeff' + rows.map(row => row.map(value => FinanceExportEngine.csvHucre(value, ';')).join(';')).join('\r\n') + '\r\n';
  }
  return { buildReport, toCSV, PAGES: PAGES.slice() };
}));
