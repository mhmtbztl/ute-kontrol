const assert = require('assert');
const app = require('../app.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

test('Sorumlu etiketi kaydetme ve yeniden yükleme turunda korunur', () => {
  assert.strictEqual(typeof app.mapMaintenanceTicketFromDb, 'function');
  const mapped = app.mapMaintenanceTicketFromDb({
    id: 'ticket-1',
    property_id: 'property-1',
    severity: 'HIGH',
    description: 'Sorumlu: Ahmet Usta',
    assigned_to: null,
    status: 'OPEN'
  }, { 'property-1': 'villa-1' });
  assert.strictEqual(mapped.assignee, 'Ahmet Usta');
});

test('Arşivlenmiş kayıt açık değil, arşivlenmiş olarak sunulur', () => {
  assert.strictEqual(typeof app.getMaintenanceStatusPresentation, 'function');
  assert.deepStrictEqual(app.getMaintenanceStatusPresentation('CANCELLED'), {
    label: 'Arşivlendi',
    badgeClass: 'badge-secondary',
    archived: true
  });
});

test('Düzenlemede değişmeyen MEDIUM önem seviyesi düşürülmez', () => {
  assert.strictEqual(typeof app.getMaintenanceSeverityForSave, 'function');
  assert.strictEqual(app.getMaintenanceSeverityForSave('P2', {
    priority: 'P2',
    severity: 'MEDIUM'
  }), 'MEDIUM');
});

test('Kullanıcı önceliği açıkça değiştirirse yeni önem seviyesi uygulanır', () => {
  assert.strictEqual(app.getMaintenanceSeverityForSave('P3', {
    priority: 'P2',
    severity: 'MEDIUM'
  }), 'LOW');
});

console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed > 0) process.exit(1);
