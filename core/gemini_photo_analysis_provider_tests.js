const assert = require('assert');
const provider = require('./gemini_photo_analysis_provider');

let total = 0;
let passed = 0;
async function test(name, fn) {
  total += 1;
  try { await fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

const input = {
  run: { id: 'R1', propertyId: 'P1' }, schemaVersion: 'photo-analysis-v1',
  property: { capacity: 4, amenities: ['pool'] },
  media: [{ id: 'M1', room_category: 'POOL' }],
  freshMedia: [{ mediaId: 'M1', mimeType: 'image/webp', bytes: Buffer.from('image') }],
  cachedEvaluations: []
};

function response(payload, extra = {}) {
  return {
    ok: extra.ok === undefined ? true : extra.ok,
    status: extra.status || 200,
    headers: { get: name => name === 'x-request-id' ? 'REQ1' : null },
    json: async () => ({
      candidates: [{ finishReason: extra.finishReason || 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }],
      usageMetadata: { promptTokenCount: 12 }
    })
  };
}

(async () => {
  await test('API key is sent only as a header and images use inlineData', async () => {
    let request;
    const adapter = provider.createGeminiProvider({ apiKey: 'secret-key', fetchImpl: async (url, init) => { request = { url, init }; return response({ ok: true }); } });
    const result = await adapter.analyze(input);
    assert.doesNotMatch(request.url, /secret-key/);
    assert.strictEqual(request.init.headers['x-goog-api-key'], 'secret-key');
    const body = JSON.parse(request.init.body);
    assert.strictEqual(body.contents[0].parts[1].text, 'PHOTO_ID:M1');
    assert.strictEqual(body.contents[0].parts[2].inlineData.mimeType, 'image/webp');
    assert.strictEqual(result.provider, 'GOOGLE_GEMINI');
    assert.strictEqual(result.requestId, 'REQ1');
  });

  await test('Structured output uses the versioned JSON schema without unsupported document metadata', async () => {
    let body;
    const adapter = provider.createGeminiProvider({ apiKey: 'k', fetchImpl: async (_url, init) => { body = JSON.parse(init.body); return response({}); } });
    await adapter.analyze(input);
    assert.strictEqual(body.generationConfig.responseMimeType, 'application/json');
    assert.strictEqual(body.generationConfig.responseJsonSchema.$schema, undefined);
    assert.strictEqual(body.generationConfig.responseJsonSchema.$id, undefined);
    assert.deepStrictEqual(body.generationConfig.responseJsonSchema.properties.schemaVersion.enum, ['photo-analysis-v1']);
  });

  await test('Prompt binds photo identity and carries cached evaluations without media fabrication permission', () => {
    const text = provider.promptText({ ...input, cachedEvaluations: [{ mediaId: 'M0', commercialScore: 80 }] });
    assert.match(text, /MEDIA_MANIFEST/);
    assert.match(text, /CACHED_EVALUATIONS/);
    assert.match(text, /Never invent/);
    assert.match(text, /fabricationSuggested false/);
  });

  await test('Only safe transformed image MIME types are accepted', () => {
    assert.throws(() => provider.imageParts([{ mediaId: 'M1', mimeType: 'image/svg+xml', bytes: Buffer.from('x') }]), /UNSUPPORTED/);
    assert.throws(() => provider.imageParts([{ mediaId: 'M1', mimeType: 'image/webp', bytes: new Uint8Array(provider.MAX_INLINE_BYTES + 1) }]), /LIMIT_EXCEEDED/);
  });

  await test('Safety stops, HTTP failures and invalid JSON are explicit failures', async () => {
    const safety = provider.createGeminiProvider({ apiKey: 'k', fetchImpl: async () => response({}, { finishReason: 'SAFETY' }) });
    await assert.rejects(() => safety.analyze(input), /GEMINI_FINISH_SAFETY/);
    const truncated = provider.createGeminiProvider({ apiKey: 'k', fetchImpl: async () => response({}, { finishReason: 'MAX_TOKENS' }) });
    await assert.rejects(() => truncated.analyze(input), /GEMINI_FINISH_MAX_TOKENS/);
    const denied = provider.createGeminiProvider({ apiKey: 'k', fetchImpl: async () => response({}, { ok: false, status: 429 }) });
    await assert.rejects(() => denied.analyze(input), /GEMINI_HTTP_429/);
    const malformed = provider.createGeminiProvider({ apiKey: 'k', fetchImpl: async () => ({ ...response({}), json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] }) }) });
    await assert.rejects(() => malformed.analyze(input), /GEMINI_INVALID_JSON/);
  });

  await test('Provider configuration rejects missing secrets and untrusted model paths', () => {
    assert.throws(() => provider.createGeminiProvider({}), /API_KEY_REQUIRED/);
    assert.throws(() => provider.createGeminiProvider({ apiKey: 'k', model: '../bad' }), /INVALID_GEMINI_MODEL/);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})();
