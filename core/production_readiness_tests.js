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

test('fiyat tablolari ve aktif fiyat RPCleri varlik sozlesmesinden bagimsiz anon kapisinda kalir', () => {
  const pricingTables = [
    'pricing_profiles', 'pricing_rules', 'pricing_events', 'pricing_overrides',
    'daily_rates', 'rate_change_logs', 'booking_quotes'
  ];
  const pricingRpcs = ['accept_booking_quote_atomic', 'save_manual_pricing_override_atomic'];
  for (const name of pricingTables) assert(PROTECTED_TABLES.includes(name), `anon tablo kapisinda yok: ${name}`);
  for (const name of pricingRpcs) assert(Object.hasOwn(PROTECTED_RPCS, name), `anon RPC kapisinda yok: ${name}`);

  const inspection = {
    tables: Object.fromEntries(pricingTables.map(name => [name, { columns: {} }])),
    rpcs: Object.fromEntries(pricingRpcs.map(name => [name, { args: [] }]))
  };
  const exposure = anonExposureErrors(inspection);
  for (const name of [...pricingTables, ...pricingRpcs]) {
    assert(exposure.some(error => error.includes(name)), `anon acik nesne raporlanmadi: ${name}`);
  }

  const probes = buildAnonProbeRequests('https://example.supabase.co');
  for (const name of pricingTables) assert(probes.some(p => p.object === `table:${name}` && p.method === 'GET'));
  for (const name of pricingRpcs) {
    const probe = probes.find(p => p.object === `rpc:${name}`);
    assert(probe && probe.method === 'POST' && probe.body, `guvenli RPC probe yok: ${name}`);
  }
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
