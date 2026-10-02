(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./finance_export_engine'));
  else root.ReportEngine = factory(root.FinanceExportEngine);
}(typeof self !== 'undefined' ? self : this, function (FinanceExportEngine) {
  'use strict';
  const PAGES = ['FINANCE','PROPERTY','BOOKINGS','OPERATIONS','SALES','CHANNELS_MARKETING'];
  const PAGE_NAMES = { FINANCE: 'Finans', PROPERTY: 'Mülk', BOOKINGS: 'Rezervasyonlar', OPERATIONS: 'Operasyon', SALES: 'Misafirler ve Satış', CHANNELS_MARKETING: 'Kanallar ve Pazarlama' };
  const absent = value => value === undefined || value === null || value === '';
  // Ekranda ve dosyada iç alan adı görünmez (L-146). Bilinmeyen anahtar adıyla
  // kalır; yeni bir özet alanı eklerken etiketini buraya yazın.
  const LABELS = {
    netRoomRevenue: ['Net konaklama geliri', 'money'], cleaningRevenue: ['Temizlik geliri', 'money'],
    totalRevenue: ['Toplam gelir', 'money'], totalOpex: ['Toplam OPEX', 'money'], capex: ['CAPEX', 'money'],
    netProfit: ['Net kâr', 'money'], soldNights: ['Satılan gece', 'int'], adr: ['ADR', 'money'],
    reservationCount: ['Rezervasyon', 'int'], bookingCount: ['Rezervasyon', 'int'], recordCount: ['Kayıt', 'int'],
    collections: ['Tahsilat (dönem)', 'money'], pendingCleaningDebt: ['Ödenmemiş personel borcu (tüm dönemler)', 'money'],
    total: ['Toplam talep', 'int'], NEW: ['Yeni', 'int'], CONTACTED: ['İletişime geçildi', 'int'], QUOTE_SENT: ['Teklif gönderildi', 'int'],
    FOLLOW_UP: ['Takipte', 'int'], WON: ['Kazanıldı', 'int'], LOST: ['Kaybedildi', 'int'],
    bookedNights: ['Satılan gece', 'int'], bookingRevenueAfterDiscount: ['Toplam gelir (indirim sonrası)', 'money'],
    roomRevenueBeforeDistribution: ['Net konaklama geliri', 'money'], distributionCost: ['Dağıtım maliyeti (komisyon)', 'money'],
    roomRevenueAfterDistribution: ['Dağıtım sonrası konaklama geliri', 'money'], netRoomRevenueAfterDistribution: ['Dağıtım sonrası konaklama geliri', 'money'],
    roomAdr: ['ADR', 'money'], netRoomAdr: ['Dağıtım sonrası ADR', 'money'], availableNights: ['Satılabilir gece', 'int'],
    roomRevPar: ['RevPAR', 'money'], netRoomRevPar: ['Dağıtım sonrası RevPAR', 'money'], channel: ['Kanal', 'text']
  };
  const labelOf = id => (LABELS[id] ? LABELS[id][0] : id);
  const typeOf = (id, value) => (LABELS[id] ? LABELS[id][1] : (typeof value === 'number' ? 'number' : 'text'));
  // Dosyaya giden değer: para 2 haneye yuvarlanır (ADR;4666,666666666667
  // yazılıyordu), iç nesne "[object Object]" olarak dökülmez (L-146).
  function fileValue(value, type) {
    if (absent(value)) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? (type === 'int' ? Math.round(value) : Math.round(value * 100) / 100) : null;
    if (typeof value === 'object') return null;
    return value;
  }
  function metricItems(ledger, profitUnmeasured) {
    const fields = ['netRoomRevenue', 'cleaningRevenue', 'totalRevenue', 'totalOpex', 'capex', 'netProfit', 'soldNights', 'adr'];
    return fields.map(id => ({ id, label: labelOf(id), type: typeOf(id), value: id === 'netProfit' && profitUnmeasured ? null : ledger && !absent(ledger[id]) ? ledger[id] : null }));
  }
  function reportSheet(page, rows, columns, name) {
    return { name: String(name || PAGE_NAMES[page]).slice(0, 31), columns, rows: [{ notice: 'Bu dosya içe aktarılamaz, rapordur.' }].concat((rows || []).map(row => ({ ...row }))) };
  }
  function summaryItems(summary) {
    return Object.entries(summary || {})
      .filter(([, value]) => value === null || value === undefined || typeof value !== 'object')
      .map(([id, value]) => ({ id, label: labelOf(id), type: typeOf(id, value), value: absent(value) ? null : value }));
  }
  function inferColumns(rows) {
    const keys = rows.reduce((all, row) => {
      Object.entries(row || {}).forEach(([key, value]) => { if (value === null || typeof value !== 'object') all.add(key); });
      return all;
    }, new Set());
    return Array.from(keys).map(key => ({ key, label: labelOf(key), type: typeOf(key) }));
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
      const columns = Array.isArray(data.columns) && data.columns.length ? data.columns : inferColumns(rows);
      sections.push({ id: mapping[0], title: mapping[1], kind: 'table', columns, rows });
      if (!rows.length) unmeasured.push({ id: mapping[0], reason: 'Kayıt yok' });
    }
    let excel;
    if (page === 'FINANCE') {
      const bookings = FinanceExportEngine.buildExport('BOOKINGS', data.bookings || []), expenses = FinanceExportEngine.buildExport('EXPENSES', data.expenses || []);
      // Geri yüklenebilir defter sayfaları önde; dönem özeti en sonda ayrı sayfa:
      // rapor toplamı Excel'de de görünür, içe aktarma ilk sayfayı okur (L-146).
      const ozet = sections[0].items.map(x => ({ metric: x.label, value: fileValue(x.value, x.type) }));
      excel = { roundTrip: true, sheets: [{ name: 'Rezervasyonlar', columns: bookings.headers, rows: bookings.rows }, { name: 'Giderler', columns: expenses.headers, rows: expenses.rows }, reportSheet(page, ozet, [{ key: 'metric', label: 'Metrik', type: 'text' }, { key: 'value', label: 'Değer', type: 'text' }], 'Dönem özeti')] };
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
    const subtitle = `${period.label || `${period.start || '—'} – ${period.end || '—'}`} · ${filterLabel}`;
    // Finans/Mülk özeti yalnız KPI kalemlerinden türer: ölçülemeyen kâr null
    // kalır ve ChatGPT'ye gitmez (L-142). Ham defter nesnesi (data.summary)
    // "kâr ölçülemedi" döneminde ciro kadar kâr taşıyordu.
    const summary = page === 'FINANCE' || page === 'PROPERTY'
      ? Object.fromEntries(sections[0].items.filter(x => x.value !== null).map(x => [x.id, x.value]))
      : data.summary || (page === 'SALES' ? { funnel: data.funnel || null } : page === 'FINANCE' || page === 'PROPERTY' ? Object.fromEntries((sections[0].items || []).map(x => [x.id, x.value])) : { recordCount: ((sections.find(section => section.kind === 'table') || {}).rows || []).length });
    return { title, subtitle, business: { name: business.name || null, logoUrl: business.logoUrl || null }, sections, unmeasured, excel, chatGptContext: { title, subtitle, summary } };
  }
  function toCSV(report) {
    const rows = [];
    (report.sections || []).forEach(section => {
      rows.push([section.title || 'Rapor']);
      if (section.kind === 'kpis') {
        rows.push(['Metrik', 'Değer']);
        // Hesaplanamayan özet hücresi boş değil "—" yazılır (ekranla aynı).
        (section.items || []).forEach(item => { const value = fileValue(item.value, item.type); rows.push([item.label, value === null ? '—' : value]); });
      } else if (section.kind === 'table') {
        const columns = section.columns && section.columns.length ? section.columns : inferColumns(section.rows || []);
        rows.push(columns.map(column => column.label));
        (section.rows || []).forEach(row => rows.push(columns.map(column => fileValue(row && row[column.key], column.type))));
      }
      rows.push([]);
    });
    return '\ufeff' + rows.map(row => row.map(value => FinanceExportEngine.csvHucre(value, ';')).join(';')).join('\r\n') + '\r\n';
  }
  return { buildReport, toCSV, fileValue, LABELS, PAGES: PAGES.slice() };
}));
