const assert = require('assert');
const Service = require('./marketing_media_upload_service');
let totalTests = 0, passedTests = 0;
async function runTest(name, fn) { totalTests++; try { await fn(); passedTests++; console.log(`[PASS] ${name}`); } catch (e) { console.error(`[FAIL] ${name}`); console.error(`       ${e.stack || e.message}`); } }
const TENANT = '11111111-1111-4111-8111-111111111111';
const PROPERTY = '22222222-2222-4222-8222-222222222222';
const file = { name: 'pool.jpg', type: 'image/jpeg', size: 3, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };

function mockClient(options = {}) {
  const calls = [];
  const client = {
    calls,
    storage: { from(bucket) { return { async upload(path, value, config) { calls.push({ op: 'upload', bucket, path, value, config }); return { error: options.uploadError || null }; } }; } },
    from(table) {
      const call = { table, op: 'read', payload: null, filters: [] };
      calls.push(call);
      const builder = {
        select() { return builder; },
        eq(column, value) { call.filters.push({ column, value }); return builder; },
        maybeSingle: async () => ({ data: options.existing || null, error: null }),
        insert(payload) { call.op = 'insert'; call.payload = payload; return builder; },
        update(payload) { call.op = 'update'; call.payload = payload; return builder; },
        single: async () => ({ data: { id: call.payload && call.payload.id }, error: options.insertError || null }),
        then(resolve) { resolve({ data: null, error: call.table === 'property_media_versions' ? options.versionError || null : null }); }
      };
      return builder;
    }
  };
  return client;
}

(async () => {
  await runTest('Only private bucket MIME types and 25 MiB files are accepted', () => {
    assert.strictEqual(Service.validateUpload({ tenantId: TENANT, propertyId: PROPERTY, file }).roomCategory, 'OTHER');
    assert.throws(() => Service.validateUpload({ tenantId: TENANT, propertyId: PROPERTY, file: { ...file, type: 'image/svg+xml' } }), /UNSUPPORTED/);
    assert.throws(() => Service.validateUpload({ tenantId: TENANT, propertyId: PROPERTY, file: { ...file, size: Service.MAX_BYTES + 1 } }), /BYTE_SIZE/);
  });
  await runTest('Content hash is deterministic over file bytes', async () => {
    assert.strictEqual(await Service.sha256File(file), '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
  });
  await runTest('Storage path is tenant and property scoped with a generated media id', () => {
    const valid = Service.validateUpload({ tenantId: TENANT, propertyId: PROPERTY, file });
    assert.strictEqual(Service.storagePath(valid, '33333333-3333-4333-8333-333333333333'), `${TENANT}/${PROPERTY}/33333333-3333-4333-8333-333333333333/original.jpg`);
  });
  await runTest('Existing hash is reused without uploading bytes', async () => {
    const client = mockClient({ existing: { id: 'M1', media_status: 'ACTIVE', original_storage_path: 'existing.jpg' } });
    const result = await Service.uploadPropertyMedia(client, { tenantId: TENANT, propertyId: PROPERTY, file });
    assert.deepStrictEqual(result, { mediaId: 'M1', reused: true, storagePath: 'existing.jpg' });
    assert.strictEqual(client.calls.some(call => call.op === 'upload'), false);
  });
  await runTest('A failed prior record is never presented as a cache hit', async () => {
    const client = mockClient({ existing: { id: 'M1', media_status: 'FAILED', original_storage_path: 'failed.jpg' } });
    await assert.rejects(() => Service.uploadPropertyMedia(client, { tenantId: TENANT, propertyId: PROPERTY, file }), /FAILED_MEDIA_RECORD_REQUIRES_CLEANUP/);
    assert.strictEqual(client.calls.some(call => call.op === 'upload'), false);
  });
  await runTest('New media is reserved, privately uploaded, versioned and activated', async () => {
    const client = mockClient();
    const result = await Service.uploadPropertyMedia(client, { tenantId: TENANT, propertyId: PROPERTY, file, roomCategory: 'POOL' });
    assert.strictEqual(result.reused, false);
    const upload = client.calls.find(call => call.op === 'upload');
    assert.strictEqual(upload.bucket, 'property-media');
    assert.strictEqual(upload.config.upsert, false);
    assert.ok(client.calls.some(call => call.table === 'property_media_versions' && call.op === 'insert' && call.payload.version_type === 'ORIGINAL'));
    assert.ok(client.calls.some(call => call.table === 'property_media' && call.op === 'update' && call.payload.media_status === 'ACTIVE'));
  });
  await runTest('Upload failure marks the reserved row failed and preserves the error', async () => {
    const failure = new Error('UPLOAD_FAILED');
    const client = mockClient({ uploadError: failure });
    await assert.rejects(() => Service.uploadPropertyMedia(client, { tenantId: TENANT, propertyId: PROPERTY, file }), error => error === failure);
    assert.ok(client.calls.some(call => call.table === 'property_media' && call.op === 'update' && call.payload.media_status === 'FAILED'));
  });
  console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (passedTests !== totalTests) process.exit(1);
})();
