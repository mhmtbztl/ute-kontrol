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
  assert.strictEqual(result.revenue.current, 50000);
  assert.strictEqual(result.expenses, 15000);
  assert.strictEqual(result.opex.current, 12000);
  assert.strictEqual(result.opex.manual, 8000);
  assert.strictEqual(result.opex.otaCommission, 4000);
  assert.strictEqual(result.capex.current, 3000);
  assert.strictEqual(result.operatingProfit.current, 38000);
  assert.strictEqual(result.netProfit.current, 35000);
  assert.strictEqual(result.adr.current, 4200);
  assert.strictEqual(result.revpar.current, 1050);
  assert.strictEqual(result.revenue.prior, 40000);
  assert.strictEqual(result.adr.prior, 4000);
  assert.strictEqual(result.forecast.monthEndRevenue, null);
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

test('Arayuz mevcut ve onceki ayi RPC uzerinden yukler', () => {
  assert.match(app, /Promise\.all\([\s\S]*getExecutiveDashboardSnapshot\(context\.period, context\.propertyId\)[\s\S]*getExecutiveDashboardSnapshot\(context\.priorPeriod, context\.propertyId\)/);
  assert.match(app, /snapshotOwnsTopKpis[\s\S]*!snapshotOwnsTopKpis[\s\S]*computeExecutiveTopKpis/);
  assert.match(app, /finansal KPI gösterilmiyor/);
});

test('Yenile dugmesi gercek snapshot yenilemesini zorlar', () => {
  assert.match(html, /onclick="refreshExecutiveDashboardSnapshot\(true\)"/);
  assert.match(html, /id="execSnapshotStatus"/);
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

async function runAsyncTests() {
  const elements = {};
  const calls = [];
  global.ExecutiveDashboardService = ExecutiveDashboardService;
  global.document = {
    getElementById(id) {
      if (id === 'tab-executive') return null;
      if (!elements[id]) elements[id] = { innerText: '', className: '', style: {} };
      return elements[id];
    }
  };
  App.setActiveTenant({ id: '11111111-1111-4111-8111-111111111111' });
  App.setCurrentFilter({ period: '2026-04', villa: 'ALL' });
  App.setAppData({ targets: { '2026-04': { revenue_target: 60000 } }, villas: {} });
  App.setSupabaseClient({
    async rpc(name, args) {
      calls.push({ name, args });
      const prior = args.p_target_month === '2026-03';
      return {
        data: {
          total_revenue: prior ? 40000 : 50000,
          room_revenue: prior ? 36000 : 42000,
          manual_opex: prior ? 7000 : 8000,
          ota_commission: prior ? 3000 : 4000,
          operating_expenses: prior ? 10000 : 12000,
          capex: prior ? 2000 : 3000,
          total_expenses: prior ? 12000 : 15000,
          operating_profit: prior ? 30000 : 38000,
          net_profit: prior ? 28000 : 35000,
          booked_nights: prior ? 9 : 10,
          available_nights: prior ? 30 : 40,
          occupancy: prior ? 30 : 25
        },
        error: null
      };
    }
  });

  await App.refreshExecutiveDashboardSnapshot(true);
  App.renderExecutiveSnapshotKpis();
  assert.deepStrictEqual(calls.map(call => call.args.p_target_month), ['2026-04', '2026-03']);
  assert.ok(calls.every(call => call.name === 'get_executive_dashboard_snapshot'));
  assert.strictEqual(elements.execKpiRevenue.innerText, '₺50.000');
  assert.strictEqual(elements.execKpiOpex.innerText, '₺12.000');
  assert.strictEqual(elements.execKpiCapex.innerText, '₺3.000');
  assert.strictEqual(elements.execKpiOperatingProfit.innerText, '₺38.000');
  assert.strictEqual(elements.execKpiProfit.innerText, '₺35.000');
  assert.strictEqual(elements.execKpiOccupancy.innerText, '%25');
  assert.strictEqual(elements.execSoldNightsLabel.innerText, '10 / 40 Gece');
  assert.strictEqual(elements.execKpiAdr.innerText, '₺4.200');
  assert.strictEqual(elements.execKpiRevpar.innerText, '₺1.050');
  assert.match(elements.execSnapshotStatus.innerText, /finansal tek kaynak/);
  passed++;
  console.log('[PASS] Gercek istemci akisi mevcut ve onceki snapshot ile DOM KPI degerlerini gunceller');

  App.setSupabaseClient(null);
  App.setActiveTenant(null);
  delete global.document;
  delete global.ExecutiveDashboardService;
}

runAsyncTests().then(() => {
  console.log(`\nExecutive snapshot UI: ${passed}/${passed} tests passed.`);
}).catch(error => {
  console.error(error);
  process.exit(1);
});
