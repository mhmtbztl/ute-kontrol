const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ReportEngine = require('./report_engine');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Finans/Mülk özeti KPI kalemlerinden türer (L-142: ham defter, ölçülemeyen
// kârı ChatGPT'ye taşıyordu); diğer sayfalar ekran özetini aynen taşır.
const pages = ['BOOKINGS', 'OPERATIONS', 'SALES', 'CHANNELS_MARKETING'];
for (const page of ['FINANCE', 'PROPERTY']) {
  const ledger = { netRoomRevenue: 1234.5, totalOpex: 0, netProfit: 0, soldNights: 0 };
  const report = ReportEngine.buildReport({ page, period: {}, data: { ledger, isProfitUnmeasured: false } });
  assert.strictEqual(report.chatGptContext.summary.netRoomRevenue, ledger.netRoomRevenue, `${page}: ekran toplamı değişti`);
  assert.strictEqual(report.chatGptContext.summary.soldNights, 0, `${page}: ölçülmüş sıfır kayboldu`);
}
for (const page of pages) {
  const summary = { screenTotal: page.length * 137.25, zeroIsMeasured: 0 };
  const report = ReportEngine.buildReport({
    page,
    period: { start: '2026-09-01', end: '2026-09-30' },
    filters: { label: 'Tüm mülkler' },
    data: { summary, rows: [], ledger: page === 'FINANCE' || page === 'PROPERTY' ? summary : undefined },
    business: { name: 'İşletme' }
  });
  assert.strictEqual(report.chatGptContext.summary.screenTotal, summary.screenTotal, `${page}: ekran toplamı değişti`);
  assert.strictEqual(report.chatGptContext.summary.zeroIsMeasured, 0, `${page}: ölçülmüş sıfır kayboldu`);
}

const malicious = ReportEngine.toCSV(ReportEngine.buildReport({
  page: 'SALES', period: {}, filters: {}, business: {},
  data: { summary: { count: 1 }, rows: [{ guest: '=HYPERLINK("https://invalid")', status: 'NEW' }] }
}));
assert(malicious.includes("'=HYPERLINK"), 'CSV yazıcısı formül başlangıcını metne sabitlemeli');

assert(html.includes('id="pageReportModal"'), 'Ortak rapor penceresi eksik');
assert(html.includes('core/report_engine.js'), 'ReportEngine tarayıcıya yüklenmiyor');
assert(app.includes("['finance', 'FINANCE']") && app.includes("['marketing', 'CHANNELS_MARKETING']") && app.includes("id: 'page-report'"), 'Altı sayfanın Rapor al eylemleri kayıtlı değil');
assert(app.includes('function canExportReportPage') && app.includes("staff: ['OPERATIONS']") && app.includes("sales: ['BOOKINGS', 'SALES']"), 'Rapor rol sınırı açık izin listesiyle kurulmalı');
assert(app.includes('ReportEngine.toCSV'), 'CSV yalnız ortak ve korumalı yazıcıdan çıkmalı');

console.log('[PASS] A5-G2 altı sayfa toplam eşliği, rol sınırı ve ortak CSV yazıcısı');
