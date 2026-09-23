const assert = require('assert');
const Service = require('./marketing_channel_listing_service');
let totalTests = 0, passedTests = 0;
async function runTest(name, fn) { totalTests++; try { await fn(); passedTests++; console.log(`[PASS] ${name}`); } catch (e) { console.error(`[FAIL] ${name}`); console.error(`       ${e.stack || e.message}`); } }
const base = { tenantId: '11111111-1111-4111-8111-111111111111', propertyId: '22222222-2222-4222-8222-222222222222', channelCode: 'airbnb', externalListingId: ' 12345 ' };
(async () => {
  await runTest('Canonical channel and listing reference are normalized', () => {
    const valid = Service.validateInput(base);
    assert.strictEqual(valid.channelCode, 'AIRBNB');
    assert.strictEqual(valid.externalListingId, '12345');
    assert.strictEqual(valid.payoutCurrency, 'TRY');
  });
  await runTest('Unknown channels and missing stable references are rejected', () => {
    assert.throws(() => Service.validateInput({ ...base, channelCode: 'INSTAGRAM' }), /INVALID_CHANNEL_CODE/);
    assert.throws(() => Service.validateInput({ ...base, externalListingId: ' ' }), /REFERENCE_REQUIRED/);
  });
  await runTest('Manual OTAs require a human-readable platform name such as ETS Tur', () => {
    assert.throws(() => Service.validateInput({ ...base, channelCode: 'OTHER_OTA', displayName: ' ' }), /CUSTOM_OTA_NAME_REQUIRED/);
    const valid = Service.validateInput({ ...base, channelCode: 'OTHER_OTA', displayName: ' ETS Tur ', externalUrl: 'https://www.etstur.com/villa' });
    assert.strictEqual(valid.displayName, 'ETS Tur');
  });
  await runTest('Only HTTPS listing URLs pass validation', () => {
    assert.throws(() => Service.validateInput({ ...base, externalUrl: 'http://example.com/listing' }), /HTTPS_CHANNEL_URL_REQUIRED/);
    assert.strictEqual(Service.validateInput({ ...base, externalUrl: 'https://example.com/listing' }).externalUrl, 'https://example.com/listing');
  });
  await runTest('Save calls only the guarded RPC with normalized arguments', async () => {
    const calls = [];
    const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { listingId: 'L1' }, error: null }; } };
    const result = await Service.saveChannelListing(client, { ...base, displayName: ' Ana İlan ' });
    assert.deepStrictEqual(result, { listingId: 'L1' });
    assert.strictEqual(calls[0].name, 'save_property_channel_listing');
    assert.strictEqual(calls[0].args.p_display_name, 'Ana İlan');
    assert.strictEqual(calls[0].args.p_channel_code, 'AIRBNB');
  });
  await runTest('Backend authorization errors are preserved', async () => {
    const denied = Object.assign(new Error('UNAUTHORIZED_CHANNEL_LISTING_WRITE'), { code: '42501' });
    await assert.rejects(() => Service.saveChannelListing({ rpc: async () => ({ error: denied }) }, base), error => error === denied);
  });
  console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (passedTests !== totalTests) process.exit(1);
})();
