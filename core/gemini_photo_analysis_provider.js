// LEXBNB PHASE 17 — GEMINI MULTIMODAL STRUCTURED-OUTPUT ADAPTER
// API keys remain server-side. Output is still revalidated by the worker.
const analysisSchema = require('./photo_analysis_schema.json');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_INLINE_BYTES = 18 * 1024 * 1024;
const SAFE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function schemaForGemini(value) {
  if (Array.isArray(value)) return value.map(schemaForGemini);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((result, [key, child]) => {
    if (key === 'const') result.enum = [schemaForGemini(child)];
    else if (!['$schema', '$id'].includes(key)) result[key] = schemaForGemini(child);
    return result;
  }, {});
}

function toBase64(bytes) {
  const view = bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null;
  if (!view) throw new Error('IMAGE_BYTES_REQUIRED');
  if (typeof Buffer !== 'undefined') return Buffer.from(view).toString('base64');
  let binary = '';
  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function imageParts(freshMedia) {
  let totalBytes = 0;
  const parts = [];
  freshMedia.forEach(item => {
    const bytes = item.bytes instanceof ArrayBuffer ? item.bytes.byteLength
      : ArrayBuffer.isView(item.bytes) ? item.bytes.byteLength : 0;
    const mimeType = String(item.mimeType || '').toLowerCase();
    if (!item.mediaId || !bytes) throw new Error('COMPLETE_FRESH_MEDIA_REQUIRED');
    if (!SAFE_MIME_TYPES.has(mimeType)) throw new Error('UNSUPPORTED_ANALYSIS_IMAGE_MIME');
    totalBytes += bytes;
    parts.push({ text: `PHOTO_ID:${item.mediaId}` });
    parts.push({ inlineData: { mimeType, data: toBase64(item.bytes) } });
  });
  if (totalBytes > MAX_INLINE_BYTES) throw new Error('GEMINI_INLINE_MEDIA_LIMIT_EXCEEDED');
  return parts;
}

function promptText(input) {
  const property = input.property || {};
  const manifest = (input.media || []).map(item => ({
    mediaId: item.id,
    roomCategory: item.room_category || item.roomCategory || 'OTHER'
  }));
  return [
    'Assess this short-term-rental gallery for technical and commercial presentation quality.',
    'Treat every PHOTO_ID label as the identity of the image immediately following it.',
    'Return only JSON matching the supplied schema. Include every mediaId exactly once.',
    'Never invent, add, remove, or imply amenities that are not visible or declared.',
    'No property-level current cover is supplied; set currentCoverMediaId and currentCoverScore to null.',
    'Recommendations may use only the schema-safe edit operations; otherwise choose RESHOOT.',
    'Mark uncertain visual claims in trustAssessment.uncertainClaims and keep fabricationSuggested false.',
    `RUN_ID:${input.run.id}`,
    `PROPERTY_ID:${input.run.propertyId}`,
    `SCHEMA_VERSION:${input.schemaVersion}`,
    `PROPERTY_CONTEXT:${JSON.stringify({ capacity: property.capacity || null, amenities: property.amenities || [] })}`,
    `MEDIA_MANIFEST:${JSON.stringify(manifest)}`,
    `CACHED_EVALUATIONS:${JSON.stringify(input.cachedEvaluations || [])}`
  ].join('\n');
}

function extractText(response) {
  const candidate = response && response.candidates && response.candidates[0];
  if (!candidate) throw new Error('GEMINI_RESPONSE_CANDIDATE_MISSING');
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    const error = new Error(`GEMINI_FINISH_${candidate.finishReason}`);
    error.code = `GEMINI_FINISH_${candidate.finishReason}`;
    throw error;
  }
  const text = ((candidate.content && candidate.content.parts) || []).map(part => part.text || '').join('').trim();
  if (!text) throw new Error('GEMINI_RESPONSE_TEXT_MISSING');
  return text;
}

function createGeminiProvider(options = {}) {
  const apiKey = String(options.apiKey || '').trim();
  const model = String(options.model || DEFAULT_MODEL).trim();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = options.timeoutMs === undefined ? 90000 : Number(options.timeoutMs);
  if (!apiKey) throw new Error('GEMINI_API_KEY_REQUIRED');
  if (!/^[a-z0-9._-]+$/i.test(model)) throw new Error('INVALID_GEMINI_MODEL');
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_IMPLEMENTATION_REQUIRED');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 180000) throw new Error('INVALID_PROVIDER_TIMEOUT');

  return {
    async analyze(input = {}) {
      if (!input.run || !input.run.id || !input.run.propertyId || !input.schemaVersion) throw new Error('ANALYSIS_PROVIDER_SCOPE_REQUIRED');
      const parts = [{ text: promptText(input) }, ...imageParts(input.freshMedia || [])];
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      let response;
      try {
        response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: 'You are a conservative lodging photo auditor. Report observations, not facts beyond visible evidence.' }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseJsonSchema: schemaForGemini(analysisSchema)
            }
          }),
          signal: controller ? controller.signal : undefined
        });
      } catch (error) {
        if (error && error.name === 'AbortError') {
          const timeoutError = new Error('GEMINI_TIMEOUT');
          timeoutError.code = 'GEMINI_TIMEOUT';
          throw timeoutError;
        }
        throw error;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      if (!response || !response.ok) {
        const status = response ? response.status : 'NO_RESPONSE';
        const error = new Error(`GEMINI_HTTP_${status}`);
        error.code = `GEMINI_HTTP_${status}`;
        throw error;
      }
      const raw = await response.json();
      let payload;
      try { payload = JSON.parse(extractText(raw)); }
      catch (error) {
        if (error.code) throw error;
        const malformed = new Error('GEMINI_INVALID_JSON');
        malformed.code = 'GEMINI_INVALID_JSON';
        throw malformed;
      }
      return {
        payload,
        provider: 'GOOGLE_GEMINI',
        modelVersion: model,
        requestId: response.headers && response.headers.get ? response.headers.get('x-request-id') : null,
        usageMetadata: raw.usageMetadata || {}
      };
    }
  };
}

module.exports = { DEFAULT_MODEL, MAX_INLINE_BYTES, SAFE_MIME_TYPES, schemaForGemini, toBase64, imageParts, promptText, extractText, createGeminiProvider };
