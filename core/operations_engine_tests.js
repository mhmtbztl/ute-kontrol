/** A3-G1 — Operasyon gorunum kurallari. */
const fs = require('fs');
const path = require('path');
const OperationsEngine = require('./operations_engine.js');

let passed = 0, failed = 0;
const check = (condition, name, detail) => {
  if (condition) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}\n       ${detail}`); }
};

try {
  const people = [
    { id: 'c1', kind: 'CLEANER', full_name: 'Ayse', user_id: 'u1', is_active: true },
    { id: 'c2', kind: 'CLEANER', full_name: 'Fatma', user_id: null, is_active: true },
    { id: 'c3', kind: 'CLEANER', full_name: 'Eski', user_id: 'u3', is_active: false },
    { id: 't1', kind: 'TECHNICIAN', full_name: 'Usta', user_id: 'u4', is_active: true }
  ];
  const eligible = OperationsEngine.eligibleCleaners(people);
  check(eligible.length === 1 && eligible[0].id === 'c1',
    'A1. Iki imzali atamada yalniz aktif ve user_id dolu temizlikci', JSON.stringify(eligible));
  check(OperationsEngine.canAssignCleaner(people, 'c1') && !OperationsEngine.canAssignCleaner(people, 'c2'),
    'A2. RPC oncesi kapisi hesapsiz temizlikciyi reddeder', 'uygunluk yanlis');

  const tasks = [
    { id: 'a', date: '2026-10-01', status: 'PLANNED', paid: false, amount: 500, cleaner: 'Ayse' },
    { id: 'b', date: '2026-10-02', status: 'DONE', paid: false, amount: 800, cleaner: 'Ayse' },
    { id: 'c', date: '2026-10-03', status: 'DONE', paid: true, amount: 700, cleaner: 'Fatma' }
  ];
  const groups = OperationsEngine.groupCleaningTasks(tasks, '2026-10-01');
  check(groups.today.map(t => t.id).join() === 'a' && groups.tomorrow.map(t => t.id).join() === 'b'
    && groups.week.map(t => t.id).join() === 'c',
    'B1. Temizlik bugun / yarin / bu hafta tekil gruplara ayrilir', JSON.stringify(groups));
  const debt = OperationsEngine.cleanerDebtSummary(tasks);
  check(debt.length === 1 && debt[0].cleaner === 'Ayse' && debt[0].amount === 800 && debt[0].count === 1,
    'B2. Kisi borcu yalniz DONE + odenmemis kayitlardan', JSON.stringify(debt));

  const executions = [
    { id: 'e1', cleaning_task_id: 'a', status: 'CLEANED' },
    { id: 'e2', cleaning_task_id: 'b', status: 'INSPECTED' }
  ];
  const view = OperationsEngine.attachExecutions(tasks, executions);
  check(view.find(t => t.id === 'a').workflowState === 'AWAITING_INSPECTION'
    && view.find(t => t.id === 'b').workflowState === 'INSPECTED',
    'C1. Z imzali temizlik borc degil denetim bekliyor diye ayrilir', JSON.stringify(view));
  check(OperationsEngine.isCleaningDebt({ status: 'DONE', paid: false })
    && !OperationsEngine.isCleaningDebt({ status: 'PLANNED', paid: false })
    && !OperationsEngine.isCleaningDebt({ status: 'DONE', paid: true }),
    'C2. Temizlik borcu tek tanim: DONE ve odenmemis', 'borc tanimi yanlis');

  const technicians = OperationsEngine.eligibleTechnicians(people);
  check(technicians.length === 1 && technicians[0].id === 't1',
    'C3. Usta atamasinda yalniz aktif teknisyenler listelenir', JSON.stringify(technicians));
  const orderedTickets = OperationsEngine.sortMaintenanceTickets([
    { id: 'normal', booking_impact: false, severity: 'CRITICAL' },
    { id: 'blocking', booking_impact: true, severity: 'LOW' }
  ]);
  check(orderedTickets.map(ticket => ticket.id).join() === 'blocking,normal',
    'C4. Satisa kapatan ariza once gelir', orderedTickets.map(ticket => ticket.id).join());

  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n?/g, '\n');
  const assignBody = (app.match(/async function assignCleaningTask[\s\S]*?\n}\n/) || [''])[0];
  check(/canAssignCleaner/.test(assignBody) && /assign_cleaning_task/.test(assignBody),
    'D1. Istemci atama RPCsinden once L-129 kapisini yeniden denetler', assignBody.slice(0, 500));
  const inspectBody = (app.match(/async function inspectCleaningExecution[\s\S]*?\n}\n/) || [''])[0];
  check(/inspect_cleaning/.test(inspectBody) && /invalidateExecutiveSnapshotCache\(\)/.test(inspectBody),
    'D2. M denetimi defter onbellegini temizler', inspectBody.slice(0, 500));
  const assignMaintenance = (app.match(/async function assignMaintenanceTechnician[\s\S]*?\n}\n/) || [''])[0];
  check(/maintenance_assignments/.test(assignMaintenance) && /upsert/.test(assignMaintenance),
    'D3. Ariza ustasi maintenance_assignments defterine yazilir', assignMaintenance.slice(0, 500));
  const resolveMaintenance = (app.match(/async function resolveMaintenanceFromOperations[\s\S]*?\n}\n/) || [''])[0];
  check(/Gider olarak kaydedilsin mi/.test(resolveMaintenance) && /resolveMaintenanceTicket/.test(resolveMaintenance),
    'D4. Ariza cozulurken gider kaydi kullaniciya sorulur', resolveMaintenance.slice(0, 700));
  const createGeneral = (app.match(/async function createGeneralOperationalTask[\s\S]*?\n}\n/) || [''])[0];
  check(/property_id:\s*null/.test(createGeneral) && /createOperationalTask/.test(createGeneral),
    'D5. Genel gorev mulksuz kaydedilir', createGeneral.slice(0, 500));
} catch (error) {
  failed++;
  console.error(`[FAIL] Beklenmeyen hata\n       ${error && error.stack}`);
} finally {
  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  console.log('=============================================================================');
  if (failed > 0) process.exit(1);
}
