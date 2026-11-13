'use strict';

const assert = require('assert');
const {
  CONTRACT,
  inspectOpenApi,
  compareContract,
  compareSchemas
} = require('../scripts/schema_contract.js');
const {
  PROTECTED_TABLES,
  PROTECTED_RPCS,
  anonExposureErrors,
  buildAnonProbeRequests,
  isAnonProbeDenied,
  securityLedgerErrors
} = require('../scripts/check_production_readiness.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.message}`); process.exitCode = 1; }
}

function fixture() {
  const definitions = {};
  for (const [table, spec] of Object.entries(CONTRACT.tables)) {
    definitions[table] = {
      required: Object.entries(spec.columns).filter(([, c]) => c.nullable === false).map(([name]) => name),
      properties: Object.fromEntries(Object.keys(spec.columns).map(name => [name, { type: 'string' }]))
    };
  }
  const paths = {};
  for (const [name, rpc] of Object.entries(CONTRACT.rpcs)) {
    paths[`/rpc/${name}`] = { post: { parameters: [{ in: 'body', schema: {
      properties: Object.fromEntries(rpc.args.map(arg => [arg, { type: 'string' }])),
      required: rpc.requiredArgs
    } }] } };
  }
  return { definitions, paths };
}

test('eksik tabloyu reddeder', () => {
  const spec = fixture();
  delete spec.definitions.leads;
  assert(compareContract(inspectOpenApi(spec)).errors.some(e => e.includes('leads')));
});

test('eksik sütunu reddeder', () => {
  const spec = fixture();
  delete spec.definitions.leads.properties.guest_phone;
  assert(compareContract(inspectOpenApi(spec)).errors.some(e => e.includes('leads.guest_phone')));
});

test('yanlış nullability durumunu reddeder', () => {
  const spec = fixture();
  spec.definitions.leads.required.push('guest_name');
  assert(compareContract(inspectOpenApi(spec)).errors.some(e => e.includes('leads.guest_name')));
});

test('eksik RPC ve imzasını reddeder', () => {
  const spec = fixture();
  delete spec.paths['/rpc/convert_lead_to_booking_atomic'];
  assert(compareContract(inspectOpenApi(spec)).errors.some(e => e.includes('convert_lead_to_booking_atomic')));
});

test('beklenmeyen nesneyi reddeder, gerekçeli allowlisti kabul eder', () => {
  const spec = fixture();
  spec.definitions.surprise_table = { properties: { id: {} }, required: ['id'] };
  assert(compareContract(inspectOpenApi(spec)).errors.some(e => e.includes('surprise_table')));
  delete spec.definitions.surprise_table;
  spec.paths['/rpc/rls_auto_enable'] = { post: { parameters: [] } };
  assert.strictEqual(compareContract(inspectOpenApi(spec)).errors.length, 0);
});

test('tam uyumlu şema yeşildir', () => {
  assert.deepStrictEqual(compareContract(inspectOpenApi(fixture())).errors, []);
});

test('readiness yalniz salt okunur yetki kanitlarini kabul eder', () => {
  assert.strictEqual(isAnonProbeDenied('rpc', 404, ''), false);
  assert.strictEqual(isAnonProbeDenied('table', 404, ''), false);
  assert.strictEqual(isAnonProbeDenied('rpc', 403, '{"code":"42501","message":"permission denied"}'), true);
  assert.strictEqual(isAnonProbeDenied('rpc', 200, '{}'), false);
  assert.deepStrictEqual(securityLedgerErrors([42]), []);
  assert(securityLedgerErrors([44]).some(error => error.includes('phase42')));
});

test('korunan tablolar anon kapisinda yoklanir; phase119 ile silinen fiyat nesneleri yoklanmaz', () => {
  // Phase11 fiyat tablolari ve RPC'leri phase119 ile kaldirildi (13.11.2026).
  const removed = ['pricing_profiles', 'daily_rates', 'booking_quotes',
    'accept_booking_quote_atomic', 'save_manual_pricing_override_atomic'];
  for (const name of removed) {
    assert(!PROTECTED_TABLES.includes(name) && !Object.hasOwn(PROTECTED_RPCS, name), `silinen nesne hala yoklaniyor: ${name}`);
  }
  assert(PROTECTED_TABLES.includes('leads'), 'leads anon kapisindan cikmamali');
  const exposure = anonExposureErrors({ tables: { leads: { columns: {} } }, rpcs: {} });
  assert(exposure.some(error => error.includes('leads')), 'anon acik leads raporlanmadi');
  const probes = buildAnonProbeRequests('https://example.supabase.co');
  assert(probes.some(p => p.object === 'table:leads' && p.method === 'GET'));
});

test('test ve üretim drift karşılaştırması nullability, sütun ve RPC farkını bulur', () => {
  const production = fixture();
  production.definitions.leads.required.push('guest_name');
  delete production.definitions.leads.properties.guest_phone;
  delete production.paths['/rpc/convert_lead_to_booking_atomic'];
  const drift = compareSchemas(inspectOpenApi(fixture()), inspectOpenApi(production));
  assert(drift.some(x => x.includes('leads.guest_name')));
  assert(drift.some(x => x.includes('leads.guest_phone')));
  assert(drift.some(x => x.includes('convert_lead_to_booking_atomic')));
});

console.log(`TEST SUMMARY: ${passed} / 9 TESTS PASSED (${process.exitCode ? 1 : 0} FAILED)`);
