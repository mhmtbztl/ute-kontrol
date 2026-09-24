const assert = require('assert');
const app = require('../app.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

async function run() {
  await test('Görünür ana veri tabloları realtime kapsamındadır', () => {
    assert.strictEqual(typeof app.getTenantRealtimeTables, 'function');
    const tables = app.getTenantRealtimeTables();
    [
      'properties', 'bookings', 'expenses', 'cleaning_tasks', 'leads',
      'monthly_financial_closes', 'monthly_targets', 'maintenance_tickets',
      'operational_tasks', 'financial_transactions', 'guests', 'user_notifications'
    ].forEach(table => assert(tables.includes(table), `${table} aboneliği eksik`));
  });

  await test('Tek satırlık realtime olayı tüm tabloyu çekmeden yerel durumu günceller', () => {
    assert.strictEqual(typeof app.applyTenantRealtimePayload, 'function');
    app.setAppData({
      villas: {}, bookings: [], expenses: [], cleaningTasks: [], leads: [],
      closedPeriods: [], targets: [], maintenance: [], operationalTasks: [],
      financialTransactions: [], guests: [], userNotifications: []
    });
    const changed = app.applyTenantRealtimePayload('expenses', {
      eventType: 'INSERT',
      new: {
        id: 'expense-1', tenant_id: 'tenant-1', expense_date: '2026-09-24',
        category: 'Elektrik', expense_type: 'OPEX', amount: 750
      }
    });
    assert.strictEqual(changed, true);
    assert.strictEqual(app.getAppData().expenses.length, 1);
    assert.strictEqual(app.getAppData().expenses[0].amount, 750);
  });

  await test('Realtime alanlarının aktif ekranları hedefli yeniden çizim planına sahiptir', () => {
    assert(app.getActiveRenderPlan('tab-properties').includes('renderPropertiesTab'));
    assert(app.getActiveRenderPlan('tab-operations').includes('renderOperationsTab'));
    assert(app.getActiveRenderPlan('tab-guests').includes('renderGuestsTab'));
    assert(app.getActiveRenderPlan('tab-maintenance').includes('renderManageMaintTable'));
  });

  await test('Arıza olayı hem defter görünümünü hem yönetici ham biletlerini günceller', () => {
    app.setAppData({
      villas: { V1: { id: 'property-1', slug: 'V1', name: 'Villa 1' } },
      maintenance: [], maintenanceTickets: []
    });
    app.applyTenantRealtimePayload('maintenance_tickets', {
      eventType: 'INSERT',
      new: {
        id: 'ticket-1', tenant_id: 'tenant-1', property_id: 'property-1',
        severity: 'CRITICAL', title: 'Klima', status: 'OPEN'
      }
    });
    assert.strictEqual(app.getAppData().maintenance.length, 1);
    assert.strictEqual(app.getAppData().maintenanceTickets.length, 1);
  });

  await test('Abonelikler tenant filtresi taşır ve yeniden abonelik eski kanalı kaldırır', () => {
    assert.strictEqual(typeof app.subscribeTenantRealtime, 'function');
    assert.strictEqual(typeof app.unsubscribeTenantRealtime, 'function');
    const subscriptions = [];
    let removed = 0;
    let tableFetches = 0;
    const client = {
      channel() {
        return {
          on(_kind, config, callback) {
            subscriptions.push({ config, callback });
            return this;
          },
          subscribe() { return this; }
        };
      },
      removeChannel() { removed += 1; },
      from() { tableFetches += 1; throw new Error('Realtime olayı tüm tabloyu çekmemeli'); }
    };
    app.setSupabaseClient(client);
    app.setActiveTenant({ id: '11111111-1111-4111-8111-111111111111' });
    app.subscribeTenantRealtime('11111111-1111-4111-8111-111111111111');
    assert(subscriptions.length >= 12);
    subscriptions.forEach(({ config }) => {
      assert.strictEqual(config.filter, 'tenant_id=eq.11111111-1111-4111-8111-111111111111');
    });
    const expenseSubscription = subscriptions.find(item => item.config.table === 'expenses');
    const beforeForeign = app.getAppData().expenses.length;
    expenseSubscription.callback({
      eventType: 'INSERT',
      new: { id: 'foreign-expense', tenant_id: '22222222-2222-4222-8222-222222222222', expense_date: '2026-09-24', amount: 99 }
    });
    assert.strictEqual(app.getAppData().expenses.length, beforeForeign, 'Yabancı tenant payloadı belleğe alınmamalı');
    expenseSubscription.callback({
      eventType: 'INSERT',
      new: { id: 'expense-2', tenant_id: '11111111-1111-4111-8111-111111111111', expense_date: '2026-09-24', amount: 10 }
    });
    assert.strictEqual(tableFetches, 0);
    app.subscribeTenantRealtime('11111111-1111-4111-8111-111111111111');
    assert.strictEqual(removed, 1);
    app.unsubscribeTenantRealtime();
    assert.strictEqual(removed, 2);
  });

  console.log(`\n${passed} geçti, ${failed} başarısız`);
  if (failed > 0) process.exit(1);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
