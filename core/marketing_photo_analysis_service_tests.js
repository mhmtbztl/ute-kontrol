const assert = require('assert');
const service = require('./marketing_photo_analysis_service');

const TENANT = '11111111-1111-4111-8111-111111111111';
const PROPERTY = '22222222-2222-4222-8222-222222222222';
const MEDIA_A = '33333333-3333-4333-8333-333333333333';
const MEDIA_B = '44444444-4444-4444-8444-444444444444';
let total = 0;
let passed = 0;

async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

(async () => {
  await test('Context hash is deterministic regardless of input media order', async () => {
    const a = { id: MEDIA_A, property_id: PROPERTY, media_status: 'ACTIVE', content_sha256: 'a'.repeat(64), room_category: 'POOL' };
    const b = { id: MEDIA_B, property_id: PROPERTY, media_status: 'ACTIVE', content_sha256: 'b'.repeat(64), room_category: 'BEDROOM' };
    const first = await service.buildPropertyContext({ propertyId: PROPERTY, media: [a, b] });
    const second = await service.buildPropertyContext({ propertyId: PROPERTY, media: [b, a] });
    assert.strictEqual(first.propertyContextHash, second.propertyContextHash);
    assert.match(first.propertyContextHash, /^[0-9a-f]{64}$/);
  });

  await test('Only active media belonging to the requested property enters the context', async () => {
    const built = await service.buildPropertyContext({ propertyId: PROPERTY, media: [
      { id: MEDIA_A, property_id: PROPERTY, media_status: 'ACTIVE', content_sha256: 'a'.repeat(64) },
      { id: MEDIA_B, property_id: PROPERTY, media_status: 'FAILED', content_sha256: 'b'.repeat(64) },
      { id: '55555555-5555-4555-8555-555555555555', property_id: TENANT, media_status: 'ACTIVE', content_sha256: 'c'.repeat(64) }
    ] });
    assert.deepStrictEqual(built.context.media.map(item => item.id), [MEDIA_A]);
  });

  await test('An analysis cannot be requested without active hashed media', async () => {
    await assert.rejects(() => service.buildPropertyContext({ propertyId: PROPERTY, media: [] }), /ACTIVE_PROPERTY_MEDIA_REQUIRED/);
    await assert.rejects(() => service.buildPropertyContext({ propertyId: PROPERTY, media: [
      { id: MEDIA_A, property_id: PROPERTY, media_status: 'ACTIVE', content_sha256: 'not-a-hash' }
    ] }), /VALID_MEDIA_CONTENT_HASH_REQUIRED/);
  });

  await test('The client calls only the guarded request RPC with versioned identity', async () => {
    const calls = [];
    const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: MEDIA_B, error: null }; } };
    const result = await service.requestPhotoAnalysis(client, {
      tenantId: TENANT, propertyId: PROPERTY,
      media: [{ id: MEDIA_A, property_id: PROPERTY, media_status: 'ACTIVE', content_sha256: 'a'.repeat(64) }]
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, 'request_photo_analysis');
    assert.strictEqual(calls[0].args.p_prompt_version, service.PROMPT_VERSION);
    assert.strictEqual(calls[0].args.p_schema_version, service.SCHEMA_VERSION);
    assert.match(calls[0].args.p_property_context_hash, /^[0-9a-f]{64}$/);
    assert.strictEqual(result.runId, MEDIA_B);
    assert.strictEqual(result.mediaCount, 1);
  });

  await test('RPC failures and malformed run identifiers are not hidden', async () => {
    const input = { tenantId: TENANT, propertyId: PROPERTY, media: [
      { id: MEDIA_A, property_id: PROPERTY, media_status: 'ACTIVE', content_sha256: 'a'.repeat(64) }
    ] };
    await assert.rejects(() => service.requestPhotoAnalysis({ rpc: async () => ({ error: new Error('denied') }) }, input), /denied/);
    await assert.rejects(() => service.requestPhotoAnalysis({ rpc: async () => ({ data: 'bad-id' }) }, input), /INVALID_ANALYSIS_RUN_ID/);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
