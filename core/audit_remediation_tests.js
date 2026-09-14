const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { computeFinancialMetrics } = require('./financial_metrics_service');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase', 'migration_phase24_audit_remediation.sql'), 'utf8');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`[PASS] ${name}`); }

test('PII/business state is never serialized to localStorage', () => {
  const saveBody = app.match(/function saveAppData\(\) \{([\s\S]*?)\n\}/)[1];
  assert.doesNotMatch(saveBody, /JSON\.stringify\(appData\)|localStorage\.setItem/);
  assert.match(saveBody, /removeItem\('LEXBNB_DATA_'/);
});

test('browser HTML boundary strips executable markup and dangerous URLs', () => {
  assert.match(app, /installInnerHtmlSecurityBoundary/);
  assert.match(app, /'SCRIPT'.*'IFRAME'.*'OBJECT'.*'EMBED'/s);
  assert.match(app, /javascript\|vbscript\|data/);
  assert.match(html, /Content-Security-Policy/);
});

test('canonical finance treats cleaning fee as revenue and OTA as OPEX', () => {
  const metrics = computeFinancialMetrics({
    year: 2026, month: 9,
    properties: [{ id: 'p1', activationDate: '2026-09-01' }],
    bookings: [{ id: 'b1', propertyId: 'p1', checkIn: '2026-09-01', checkOut: '2026-09-03', grossAmount: 12000, cleaningFee: 2000, otaCommission: 1500, discount: 1000 }]
  });
  assert.strictEqual(metrics.financial.revenue, 11000);
  assert.strictEqual(metrics.operations.roomRevenue, 9000);
  assert.strictEqual(metrics.operations.cleaningRevenue, 2000);
  assert.strictEqual(metrics.financial.operatingExpenses, 1500);
  assert.strictEqual(metrics.financial.operatingProfit, 9500);
  assert.strictEqual(metrics.reconciliation.hasWarning, false);
});

test('fake target, forecast, phone and cleaning-person fallbacks are removed', () => {
  assert.doesNotMatch(app, /revenue \* 1\.018|totalRevenue \* 1\.018|\+90 532 000 00 00|Fatma Hanım|2 Mesaj Planlandı|Teklif Uygun/);
  assert.doesNotMatch(app, /1200000\s*:\s*350000|\|\|\s*350000/);
});

test('phase 24 locks tenant identity, audit writes and property lifecycle', () => {
  assert.match(sql, /TENANT_ID_IMMUTABLE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.log_audit_event[\s\S]*FROM authenticated/);
  assert.match(sql, /PROPERTY_ARCHIVE_REQUIRED/);
  assert.match(sql, /financial_transactions/);
  assert.match(sql, /get_executive_dashboard_snapshot\(\s*p_tenant_id UUID/);
});

console.log(`TEST SUMMARY: ${passed} / ${passed} TESTS PASSED`);
