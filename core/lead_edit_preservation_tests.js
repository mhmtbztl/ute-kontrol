const assert = require('assert');
const App = require('../app.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

const existingLead = {
  id: '11111111-1111-4111-8111-111111111111',
  dbId: '11111111-1111-4111-8111-111111111111',
  guest: 'Deniz Kaya (05321112233)',
  guestName: 'Deniz Kaya',
  phone: '05321112233',
  email: 'deniz@ornek.com',
  villa: 'SAHIL',
  propertyId: '22222222-2222-4222-8222-222222222222',
  channel: 'WhatsApp',
  date: '2026-08-15',
  checkIn: '2026-12-20',
  checkOut: '2026-12-27',
  pax: 6,
  quote: 45000,
  status: 'NEW',
  notes: 'Ilk gorusme'
};

App.setAppData({ leads: [existingLead], villas: {} });

test('Editing visible lead fields preserves contact, stay and attribution fields', () => {
  const payload = App.buildLeadEditPayload(existingLead.id, {
    guest: 'Deniz Kaya',
    guestName: 'Deniz Kaya',
    villa: 'SAHIL',
    channel: 'WhatsApp',
    quote: 47000,
    status: 'FOLLOW_UP',
    lostReason: '',
    notes: 'Tekrar aranacak'
  });

  assert.strictEqual(payload.phone, '05321112233');
  assert.strictEqual(payload.email, 'deniz@ornek.com');
  assert.strictEqual(payload.checkIn, '2026-12-20');
  assert.strictEqual(payload.checkOut, '2026-12-27');
  assert.strictEqual(payload.pax, 6);
  assert.strictEqual(payload.date, '2026-08-15');
  assert.strictEqual(payload.propertyId, '22222222-2222-4222-8222-222222222222');
  assert.strictEqual(payload.quote, 47000);
  assert.strictEqual(payload.status, 'FOLLOW_UP');

  const dbPayload = App.mapLeadToDb(payload, '33333333-3333-4333-8333-333333333333');
  assert.strictEqual(dbPayload.guest_phone, '05321112233');
  assert.strictEqual(dbPayload.guest_email, 'deniz@ornek.com');
  assert.strictEqual(dbPayload.requested_check_in, '2026-12-20');
  assert.strictEqual(dbPayload.requested_check_out, '2026-12-27');
  assert.strictEqual(dbPayload.pax, 6);
  assert.strictEqual(dbPayload.lead_date, '2026-08-15');
});

test('Creating a lead does not borrow fields from another record', () => {
  const payload = App.buildLeadEditPayload('', {
    guestName: 'Yeni Misafir',
    phone: '05550000000',
    status: 'NEW'
  });

  assert.strictEqual(payload.guestName, 'Yeni Misafir');
  assert.strictEqual(payload.phone, '05550000000');
  assert.strictEqual(payload.email, undefined);
});

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
