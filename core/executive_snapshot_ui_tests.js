const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ExecutiveDashboardService = require('./executive_dashboard_service.js');
const App = require('../app.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migration_phase32_executive_snapshot_ui.sql'), 'utf8');
const phase38Migration = fs.readFileSync(path.join(root, 'supabase', 'migration_phase38_executive_kpi_breakdown.sql'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`[PASS] ${name}`);
}

test('Sunucu snapshot finansal KPI sekline kayipsiz donusur', () => {
  const result = ExecutiveDashboardService.computeExecutiveTopKpisFromSnapshot({
    total_revenue: 50000,
    room_revenue: 42000,
    manual_opex: 8000,
    ota_commission: 4000,
    operating_expenses: 12000,
    capex: 3000,
    total_expenses: 15000,
    operating_profit: 38000,
    net_profit: 35000,
    booked_nights: 10,
    available_nights: 40,
    occupancy: 25
  }, {
    targets: { revenue_target: 60000, profit_target: 40000, occupancy_target: 50 },
    priorSnapshot: {
      total_revenue: 40000,
      room_revenue: 36000,
      operating_expenses: 10000,
      capex: 2000,
      operating_profit: 30000,
      net_profit: 28000,
      booked_nights: 9,
      available_nights: 30,
      occupancy: 30
    }
  });

  assert.strictEqual(result.source, 'SERVER_SNAPSHOT');
  // Ciro = net konaklama geliri (room_revenue); toplam gelir ayri (ENVANTER Finans 1).
  assert.strictEqual(result.revenue.current, 42000);
  assert.strictEqual(result.totalIncome.current, 50000);
  assert.strictEqual(result.expenses, 15000);
  assert.strictEqual(result.opex.current, 12000);
  assert.strictEqual(result.opex.manual, 8000);
  assert.strictEqual(result.opex.otaCommission, 4000);
  assert.strictEqual(result.capex.current, 3000);
  assert.strictEqual(result.operatingProfit.current, 38000);
  assert.strictEqual(result.netProfit.current, 35000);
  assert.strictEqual(result.adr.current, 4200);
  assert.strictEqual(result.revpar.current, 1050);
  assert.strictEqual(result.revenue.prior, 36000);
  assert.strictEqual(result.totalIncome.prior, 40000);
  assert.strictEqual(result.revenue.variance.varianceAmount, 42000 - 60000);
  assert.strictEqual(result.adr.prior, 4000);
  assert.strictEqual(result.forecast.monthEndRevenue, null);
});

test('Net kar hedefi yeni alan, eski alanlar, eksik ve sifir icin iki yolda da korunur', () => {
  const cases = [
    [{ net_profit_target: 30000, profit_target: 90000 }, 30000],
    [{ net_profit_target: '30000.25' }, 30000.25],
    [{ profit_target: 30000 }, 30000],
    [{ profitTarget: 30000 }, 30000],
    [{ net_profit_target: null, profit_target: 30000 }, 30000],
    [{ net_profit_target: 0, profit_target: 30000 }, 0],
    [{ profit_target: 0, profitTarget: 30000 }, 0],
    [{ net_profit_target: '0' }, 0],
    [{}, null], [{ net_profit_target: null }, null],
    [{ net_profit_target: '' }, null], [{ net_profit_target: ' ' }, null],
    [{ net_profit_target: -1 }, null], [{ net_profit_target: Infinity }, null],
    [{ net_profit_target: 'invalid' }, null], [{ net_profit_target: false }, null]
  ];
  for (const [targets, expected] of cases) {
    for (const kpis of [
      ExecutiveDashboardService.computeExecutiveTopKpisFromSnapshot({ net_profit: 0 }, { targets }),
      ExecutiveDashboardService.computeExecutiveTopKpis({ targets })
    ]) {
      assert.strictEqual(kpis.netProfit.target, expected, JSON.stringify(targets));
      if (expected === null) assert.strictEqual(kpis.netProfit.variance.status, 'NEUTRAL');
      if (expected === 0) {
        assert.strictEqual(kpis.netProfit.variance.variancePercent, null);
        assert.strictEqual(kpis.netProfit.variance.status, 'ON_TARGET');
      }
    }
  }
  const positive = ExecutiveDashboardService.computeExecutiveTopKpisFromSnapshot(
    { net_profit: 20000 }, { targets: { net_profit_target: 30000 } });
  assert.strictEqual(positive.netProfit.variance.varianceAmount, -10000);
  assert.strictEqual(positive.netProfit.variance.variancePercent, -33);
});

test('Eski semada room_revenue yoksa ADR ve RevPAR uydurulmaz', () => {
  const result = ExecutiveDashboardService.computeExecutiveTopKpisFromSnapshot({
    total_revenue: 50000,
    total_expenses: 12000,
    net_profit: 38000,
    booked_nights: 10,
    available_nights: 40,
    occupancy: 25
  });
  assert.strictEqual(result.adr.current, null);
  assert.strictEqual(result.revpar.current, null);
  // Ciro bilinmiyor: toplam gelirle DOLDURULMAZ (3.6).
  assert.strictEqual(result.revenue.current, null);
  assert.strictEqual(result.totalIncome.current, 50000);
  assert.strictEqual(result.hasExpenseBreakdown, false);
  assert.strictEqual(result.opex.current, null);
  assert.strictEqual(result.capex.current, null);
  assert.strictEqual(result.operatingProfit.current, null);
});

test('Eksik snapshot acik hata verir', () => {
  assert.throws(
    () => ExecutiveDashboardService.computeExecutiveTopKpisFromSnapshot(null),
    /EXECUTIVE_SNAPSHOT_REQUIRED/
  );
});

// Sadelik (21.11.2026): Bugun'deki gizli KPI seridi ve istemcinin sunucu anlik
// goruntusu cagrisi kalkti. Sunucu fonksiyonu ay kapanisi karsilastirmasi icin durur.
test('Bugun gizli KPI seridi ve istemci anlik goruntu cagrisi yok', () => {
  assert.doesNotMatch(app, /get_executive_dashboard_snapshot|refreshExecutiveDashboardSnapshot|executiveSnapshotState/);
  assert.doesNotMatch(html, /executive-kpi-grid|id="execKpi|id="execSnapshotStatus"/);
  assert.doesNotMatch(html, />AI MODEL</);
});

test('Phase32 oda gelirini tahakkukla hesaplar ve yetkileri kapatir', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_executive_dashboard_snapshot\(\s*p_tenant_id UUID/);
  assert.match(migration, /SUM\(\(gross_amount - cleaning_fee - discount\) \/ total_nights\)/);
  assert.match(migration, /'room_revenue', round\(v_room_revenue,2\)/);
  assert.match(migration, /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_executive_dashboard_snapshot\(UUID, TEXT, UUID\) FROM anon/);
  assert.match(migration, /PHASE32_ROOM_REVENUE_MISSING/);
});

test('Phase38 snapshot OPEX ve CAPEX siniflarini ayirir', () => {
  assert.match(phase38Migration, /FILTER \(WHERE COALESCE\(e\.expense_type, 'OPEX'\) = 'OPEX'\)/);
  assert.match(phase38Migration, /FILTER \(WHERE e\.expense_type = 'CAPEX'\)/);
  assert.match(phase38Migration, /'operating_expenses', round\(v_manual_opex \+ v_ota,2\)/);
  assert.match(phase38Migration, /'operating_profit', round\(v_revenue - v_manual_opex - v_ota,2\)/);
  assert.match(phase38Migration, /'net_profit', round\(v_revenue - v_manual_opex - v_ota - v_capex,2\)/);
  assert.match(phase38Migration, /REVOKE ALL ON FUNCTION public\.get_executive_dashboard_snapshot\(UUID, TEXT, UUID\) FROM anon/);
});

// Istemci akisi (refresh + KPI seridi) sadelik turunda kalkti (21.11.2026).
async function runAsyncTests() {}

runAsyncTests().then(() => {
  console.log(`\nExecutive snapshot UI: ${passed}/${passed} tests passed.`);
}).catch(error => {
  console.error(error);
  process.exit(1);
});
