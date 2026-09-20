const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  computeBookingEconomics,
  getChannelCommissionRate,
  getFallbackBookingChannels,
  mapBookingChannelFromDb,
  isMissingBookingChannelSchema,
  sortBookingChannelsForSelection,
  renderBookingChannelSettings,
  setAppData,
  setActiveTenant
} = require('../app.js');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const fallback = getFallbackBookingChannels();
assert.strictEqual(getChannelCommissionRate('AIRBNB', fallback), 15);
assert.strictEqual(getChannelCommissionRate('BOOKING', fallback), 18);
assert.strictEqual(getChannelCommissionRate('WHATSAPP', fallback), 0);
console.log('[PASS] Mevcut kanal oranları göç öncesi güvenli geri dönüş olarak korunur');

const databaseOrder = [
  fallback.find(channel => channel.code === 'AIRBNB'),
  { code: 'CUSTOM_Z', displayName: 'Z Kanalı', channelType: 'OTA', defaultCommissionRate: 10, isActive: true },
  fallback.find(channel => channel.code === 'WHATSAPP'),
  { code: 'CUSTOM_A', displayName: 'A Kanalı', channelType: 'DIRECT', defaultCommissionRate: 0, isActive: true }
];
const selectionOrder = sortBookingChannelsForSelection(databaseOrder);
assert.strictEqual(selectionOrder[0].code, 'WHATSAPP');
assert.strictEqual(selectionOrder[1].code, 'AIRBNB');
assert.deepStrictEqual(selectionOrder.slice(2).map(channel => channel.code), ['CUSTOM_A', 'CUSTOM_Z']);
console.log('[PASS] Veritabanı sırasından bağımsız olarak yeni rezervasyonun güvenli varsayılanı WhatsApp kalır');

const custom = mapBookingChannelFromDb({
  id: 'c1', tenant_id: 't1', code: 'CUSTOM_TEST', display_name: 'Test OTA',
  channel_type: 'OTA', default_commission_rate: '12.50', is_active: true
});
assert.strictEqual(custom.defaultCommissionRate, 12.5);
assert.strictEqual(custom.displayName, 'Test OTA');
assert.strictEqual(getChannelCommissionRate('CUSTOM_TEST', [custom]), 12.5);
const economics = computeBookingEconomics({ gross: 40000, channel: 'CUSTOM_TEST', commission: '', channels: [custom], nights: 4 });
assert.strictEqual(economics.otaComm, 5000);
console.log('[PASS] Tenant kanalının gerçek varsayılan oranı rezervasyon ekonomisine uygulanır');

assert.strictEqual(isMissingBookingChannelSchema({ code: '42P01' }), true);
assert.strictEqual(isMissingBookingChannelSchema({ code: 'PGRST205' }), true);
assert.strictEqual(isMissingBookingChannelSchema({ code: '42501' }), false);
assert(appSource.includes('return { rows: getFallbackBookingChannels(), schemaReady: false }'));
console.log('[PASS] Göç henüz uygulanmadığında rezervasyon ekranı kırılmadan varsayılanlara döner');

assert(html.includes('id="bookingChannelSettingsCard"'));
assert(html.includes('id="bookingChannelSettingsBody"'));
assert(html.includes('id="bookingChannelAddForm"'));
assert(html.includes('onchange="handleBookingChannelChange()"'));
assert(html.includes('oninput="syncCommissionFromRate()"'));
assert(appSource.includes("activeTenant?.role"));
console.log('[PASS] Ayarlar yönetimi ve rezervasyon formu aynı kanal kataloğuna bağlanır');

assert(!appSource.includes('const CHANNEL_COMMISSION_RATES'));
assert(appSource.includes("supabaseClient.rpc('save_tenant_booking_channel'"));
assert(appSource.includes('Eski rezervasyonlar korunur'));
console.log('[PASS] Sabit oran kaynağı kaldırılmış; değişiklikler Supabase RPC ile kalıcı ve arşivlemelidir');

const dom = {
  bookingChannelSettingsBody: { innerHTML: '' },
  bookingChannelAddForm: { style: {} },
  bookingChannelSchemaNotice: { style: {}, innerText: '' }
};
global.document = { getElementById: id => dom[id] || null };
setAppData({ bookingChannels: [custom], bookingChannelSchemaReady: true });
setActiveTenant({ id: 't1', role: 'viewer' });
renderBookingChannelSettings();
assert.strictEqual(dom.bookingChannelAddForm.style.display, 'none');
assert(dom.bookingChannelSettingsBody.innerHTML.includes('disabled'));
setActiveTenant({ id: 't1', role: 'manager' });
renderBookingChannelSettings();
assert.strictEqual(dom.bookingChannelAddForm.style.display, 'grid');
delete global.document;
console.log('[PASS] Viewer kanal ayarlarını değiştiremez; manager düzenleme formunu kullanabilir');

console.log('TEST SUMMARY: 7 / 7 TESTS PASSED (0 FAILED)');
