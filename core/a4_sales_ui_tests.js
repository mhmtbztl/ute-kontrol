const assert = require('assert');
const fs = require('fs');
const path = require('path');

const App = require('../app.js');

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.error(`  ❌ ${name}`);
    throw error;
  }
}

(async () => {
  console.log('\n🧪 A4 Misafirler ve Satış UI testleri');

  await test('telefonlu adsız talebi sentetik ad üretmeden sunar', () => {
    const mapped = App.mapLeadFromDb({
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: '22222222-2222-4222-8222-222222222222',
      guest_name: null,
      guest_phone: '+905321234567',
      status: 'NEW'
    });

    assert.strictEqual(mapped.guestName, '');
    assert.strictEqual(mapped.guest, 'Ad girilmedi (+905321234567)');

    const payload = App.mapLeadToDb(mapped, mapped.tenantId);
    assert.strictEqual(payload.guest_name, null);
  });

  await test('hızlı kayıt telefon ve kaynak olmadan RPC çağırmaz', async () => {
    const calls = [];
    const client = { rpc: async (...args) => { calls.push(args); return { data: {}, error: null }; } };

    await assert.rejects(
      () => App.quickCaptureLead({ phone: '', sourceId: '33333333-3333-4333-8333-333333333333', channel: 'Telefon' }, {
        client,
        tenantId: '22222222-2222-4222-8222-222222222222'
      }),
      /telefon/i
    );
    await assert.rejects(
      () => App.quickCaptureLead({ phone: '05321234567', sourceId: '', channel: 'Telefon' }, {
        client,
        tenantId: '22222222-2222-4222-8222-222222222222'
      }),
      /kaynak|nereden geldi/i
    );
    assert.deepStrictEqual(calls, []);
  });

  await test('hızlı kayıt yalnız quick_capture_lead RPC sözleşmesini kullanır', async () => {
    const calls = [];
    const client = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return {
          data: {
            success: true,
            lead_id: '44444444-4444-4444-8444-444444444444',
            created: true,
            returning: false,
            previous_leads: 0,
            classification: null
          },
          error: null
        };
      }
    };

    const result = await App.quickCaptureLead({
      phone: '0532 123 45 67',
      sourceId: '33333333-3333-4333-8333-333333333333',
      channel: 'Telefon',
      guestName: '',
      note: 'Akşam aranacak'
    }, {
      client,
      tenantId: '22222222-2222-4222-8222-222222222222'
    });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, 'quick_capture_lead');
    assert.deepStrictEqual(calls[0].args, {
      p_tenant_id: '22222222-2222-4222-8222-222222222222',
      p_phone: '0532 123 45 67',
      p_source_id: '33333333-3333-4333-8333-333333333333',
      p_channel: 'Telefon',
      p_check_in: null,
      p_check_out: null,
      p_pax: null,
      p_property_id: null,
      p_guest_name: null,
      p_note: 'Akşam aranacak'
    });
    assert.strictEqual(result.created, true);
  });

  await test('satış ekranı erişilebilir hızlı kayıt formunu ve zorunlu kaynak alanını bağlar', () => {
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const actions = fs.readFileSync(path.join(__dirname, 'action_dispatch.js'), 'utf8');

    assert.match(html, /<form[^>]+id="leadQuickCaptureForm"[^>]+data-onsubmit="submitQuickLead\(event\)"/);
    assert.match(html, /id="leadQuickPhone"[^>]+required/);
    assert.match(html, /id="leadQuickSource"[^>]+required/);
    assert.match(html, /id="leadQuickMessage"[^>]+role="status"/);
    assert.match(app, /function renderLeadQuickCapture\(/);
    assert.match(app, /async function submitQuickLead\(/);
    assert.match(actions, /'submitQuickLead'/);
    assert.match(html, /id="leadInterestToday"/);
    assert.match(html, /data-onclick="addLeadSource\(\)"/);
    assert.match(html, /id="leadAssignedTo"/);
    assert.match(html, /id="leadNextFollowUp"/);
    assert.match(html, /id="leadMessageTemplate"/);
    assert.match(html, /id="guestBirthDate"/);
    assert.match(html, /id="guestPrivateClassificationSection"/);
    assert.match(app, /SalesWorkflowService\.saveWorkflow/);
    assert.match(app, /status === 'QUOTE_SENT' && !nextFollowUpAt/);
    assert.match(app, /canManageTenantRole\(activeTenant\?\.role\)/);
    assert.match(app, /Talep bilgileri kaydedildi; ancak atama\/takip bilgisi kaydedilemedi/);
    assert.match(app, /Kara\/beyaz liste bilgisi kaydedilemedi/);
  });

  await test('izleyici misafir profilini salt okunur görür; satış rolü düzenler ama özel listeyi yönetemez', () => {
    const makeForm = () => {
      const controls = [
        { id: 'guestFirstName', type: 'text', disabled: false },
        { id: 'guestBirthDate', type: 'date', disabled: false },
        { id: 'guestPrivateListType', type: 'select-one', disabled: false },
        { id: 'guestProfileId', type: 'hidden', disabled: false }
      ];
      const submit = { hidden: false, disabled: false };
      return { elements: controls, querySelector: selector => selector === 'button[type="submit"]' ? submit : null, controls, submit };
    };

    const viewer = makeForm();
    assert.deepStrictEqual(App.applyGuestProfileAccess(viewer, 'viewer'), { canEdit: false, canManagePrivate: false });
    assert.strictEqual(viewer.controls.find(control => control.id === 'guestFirstName').disabled, true);
    assert.strictEqual(viewer.controls.find(control => control.id === 'guestBirthDate').disabled, true);
    assert.strictEqual(viewer.controls.find(control => control.id === 'guestProfileId').disabled, false);
    assert.strictEqual(viewer.submit.hidden, true);

    const sales = makeForm();
    assert.deepStrictEqual(App.applyGuestProfileAccess(sales, 'sales'), { canEdit: true, canManagePrivate: false });
    assert.strictEqual(sales.controls.find(control => control.id === 'guestFirstName').disabled, false);
    assert.strictEqual(sales.controls.find(control => control.id === 'guestPrivateListType').disabled, true);
    assert.strictEqual(sales.submit.hidden, false);

    const owner = makeForm();
    assert.deepStrictEqual(App.applyGuestProfileAccess(owner, 'owner'), { canEdit: true, canManagePrivate: true });
    assert.ok(owner.controls.every(control => control.disabled === false));
  });

  await test('talep çalışma alanı kaynak, takip ve atamayı tek görünümde birleştirir', () => {
    const view = App.buildLeadSalesView({
      leads: [
        { id: 'lead-1', guest: 'Ayşe', status: 'QUOTE_SENT', createdAt: '2026-10-01T08:00:00Z' },
        { id: 'lead-2', guest: 'Mehmet', status: 'NEW', createdAt: '2026-10-01T09:00:00Z' }
      ],
      sources: [{ id: 'src-1', label: 'Instagram reklamı' }],
      acquisitions: [{ lead_id: 'lead-1', source_id: 'src-1' }],
      workflows: [
        { lead_id: 'lead-1', assigned_to: 'user-1', next_follow_up_at: '2026-10-01T12:00:00+03:00' },
        { lead_id: 'lead-2', assigned_to: 'user-2', next_follow_up_at: '2026-10-02T12:00:00+03:00' }
      ],
      today: '2026-10-01',
      currentUserId: 'user-1'
    });

    assert.strictEqual(view.rows.find(row => row.id === 'lead-1').sourceLabel, 'Instagram reklamı');
    assert.strictEqual(view.columns.QUOTE_SENT.length, 1);
    assert.deepStrictEqual(view.followUpsToday.map(row => row.id), ['lead-1']);
    assert.deepStrictEqual(view.myFollowUpsToday.map(row => row.id), ['lead-1']);
  });

  console.log('✅ A4 Misafirler ve Satış UI testleri tamamlandı.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
