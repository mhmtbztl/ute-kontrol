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
  });

  console.log('✅ A4 Misafirler ve Satış UI testleri tamamlandı.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
