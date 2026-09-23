const assert = require('assert');
const fs = require('fs');
const path = require('path');
const App = require('../app.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

(async () => {
  await test('AI task button delegates to the persistent task workflow without a fake villa', async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const body = source.match(/async function createTaskFromAI[\s\S]*?\n}/)?.[0] || '';
    assert.match(body, /await convertAiActionToTask/);
    assert.doesNotMatch(body, /appData\.maintenance\.push|['"]AZURE['"]/);
    assert.doesNotMatch(body, /Görev Başarıyla Oluşturuldu/);
  });

  await test('Command-center completion awaits the canonical write and returns its result', async () => {
    let call = null;
    const expected = { id: 'task-1', status: 'DONE' };
    const result = await App.runCommandCenterAction('COMPLETE_TASK', 'task-1', {
      updateOperationalTask: async (id, patch) => {
        call = { id, patch };
        return expected;
      }
    });
    assert.deepStrictEqual(call, { id: 'task-1', patch: { status: 'DONE' } });
    assert.strictEqual(result, expected);
  });

  await test('Maintenance resolution sends a numeric cost, not a sentence', async () => {
    let args = null;
    await App.runCommandCenterAction('RESOLVE_TICKET', 'ticket-1', {
      actualCost: 1250,
      resolveMaintenanceTicket: async (...received) => {
        args = received;
        return { success: true };
      }
    });
    assert.deepStrictEqual(args, ['ticket-1', 1250, 'Tadilat', 'Komuta Merkezi üzerinden çözüldü.']);
  });

  await test('A failed command-center write is propagated instead of reported as success', async () => {
    await assert.rejects(
      App.runCommandCenterAction('COMPLETE_TASK', 'task-2', {
        updateOperationalTask: async () => { throw new Error('database unavailable'); }
      }),
      /database unavailable/
    );
  });

  await test('Cancelled lead conversion is not turned into a success message', async () => {
    await assert.rejects(
      App.runCommandCenterAction('CONVERT_LEAD', 'lead-1', {
        convertLeadAction: async () => false
      }),
      /dönüştürülmedi/
    );
  });

  await test('Unsupported cleaning completion is not rendered as an Apply button', async () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const cleaningCandidate = source.match(/\/\/ Cleaning \/ Turnover tasks[\s\S]*?\/\/ Maintenance tickets/)?.[0] || '';
    assert.match(cleaningCandidate, /quickAction: null/);
    assert.doesNotMatch(cleaningCandidate, /['"]BELLA['"]/);
  });

  await test('Confirmed gap discount persists a real dated override', async () => {
    let payload = null;
    const action = {
      type: 'GAP_DISCOUNT',
      propertyId: '11111111-1111-4111-8111-111111111111',
      date: '2027-01-20',
      rate: 4500
    };
    await App.executeCanonicalAiAction(action, {
      saveManualPricingOverride: async input => {
        payload = input;
        return { success: true };
      }
    });
    assert.deepStrictEqual(payload, {
      propertyId: action.propertyId,
      startDate: action.date,
      endDate: action.date,
      rate: 4500,
      reason: 'Komuta Merkezi: boş gece fiyatı'
    });
  });

  await test('Manual pricing override uses the deployed RPC contract', async () => {
    const tenantId = '33333333-3333-4333-8333-333333333333';
    let rpcCall = null;
    App.setActiveTenant({ id: tenantId });
    App.setSupabaseClient({
      rpc: async (name, args) => {
        rpcCall = { name, args };
        return { data: { success: true }, error: null };
      }
    });
    await App.saveManualPricingOverride({
      propertyId: '44444444-4444-4444-8444-444444444444',
      startDate: '2027-01-20',
      endDate: '2027-01-20',
      rate: 4500,
      reason: 'Test override'
    });
    assert.deepStrictEqual(rpcCall, {
      name: 'save_manual_pricing_override_atomic',
      args: {
        p_tenant_id: tenantId,
        p_property_id: '44444444-4444-4444-8444-444444444444',
        p_start_date: '2027-01-20',
        p_end_date: '2027-01-20',
        p_rate_override: 4500,
        p_reason: 'Test override',
        p_min_stay_override: null,
        p_bypass_guardrail: false
      }
    });
  });

  await test('Cloud booking deletion refuses a booking without a UUID', async () => {
    const tenantId = '22222222-2222-4222-8222-222222222222';
    let rpcCalls = 0;
    App.setActiveTenant({ id: tenantId });
    App.setSupabaseClient({
      rpc: async () => {
        rpcCalls += 1;
        return { data: null, error: null };
      }
    });
    App.setAppData({
      bookings: [{ id: 'REZ-LEGACY-1', guest: 'Test', checkIn: '2027-02-01', checkOut: '2027-02-03' }],
      cleaningTasks: []
    });

    await assert.rejects(App.deleteBooking('REZ-LEGACY-1'), /UUID|bulut kimliği/i);
    assert.strictEqual(rpcCalls, 0);
    assert.strictEqual(App.getAppData().bookings.length, 1);
    const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert.match(source, /async function deleteBookingUI[\s\S]*await deleteBooking\(bookingId\)[\s\S]*catch/);
    assert.doesNotMatch(source, /onclick="deleteBooking\(/);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
