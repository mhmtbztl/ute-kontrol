const assert = require('assert');

const {
  ANALYSIS_SCHEMA_VERSION,
  validateAnalysisRequest,
  buildAnalysisPackage
} = require('./analysis_export_service');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

function expectCode(fn, code) {
  assert.throws(fn, error => error && error.code === code);
}

test('analysis contract exposes a stable schema version', () => {
  assert.strictEqual(ANALYSIS_SCHEMA_VERSION, '1.0');
});

test('inclusive UI dates normalize to an end-exclusive internal range', () => {
  const request = validateAnalysisRequest({
    period: { start: '2026-09-01', end: '2026-09-30' },
    propertyIds: ['prop-a'],
    sections: ['FINANCE']
  });

  assert.deepStrictEqual(request.period, {
    start: '2026-09-01',
    end: '2026-09-30',
    endExclusive: '2026-10-01',
    dayCount: 30
  });
});

test('invalid periods fail with a stable error code', () => {
  expectCode(() => validateAnalysisRequest({
    period: { start: '2026-09-30', end: '2026-09-01' },
    propertyIds: ['prop-a'], sections: ['FINANCE']
  }), 'ANALYSIS_INVALID_PERIOD');

  expectCode(() => validateAnalysisRequest({
    period: { start: '09/01/2026', end: '2026-09-30' },
    propertyIds: ['prop-a'], sections: ['FINANCE']
  }), 'ANALYSIS_INVALID_PERIOD');
});

test('empty property and section scopes are rejected explicitly', () => {
  expectCode(() => validateAnalysisRequest({
    period: { start: '2026-09-01', end: '2026-09-30' },
    propertyIds: [], sections: ['FINANCE']
  }), 'ANALYSIS_EMPTY_PROPERTY_SCOPE');

  expectCode(() => validateAnalysisRequest({
    period: { start: '2026-09-01', end: '2026-09-30' },
    propertyIds: ['prop-a'], sections: []
  }), 'ANALYSIS_EMPTY_SECTIONS');
});

test('minimal package is versioned, deterministic and contains only allowlisted business fields', () => {
  const input = {
    period: { start: '2026-09-01', end: '2026-09-30' },
    comparison: { mode: 'NONE' },
    propertyIds: ['prop-a'],
    sections: ['FINANCE'],
    currency: 'TRY',
    generatedAt: '2026-09-22T12:00:00.000Z',
    business: { name: 'Lex Villas', tenantId: 'tenant-secret-id' },
    properties: [{ id: 'prop-a', name: 'Seyir', tenant_id: 'tenant-secret-id' }],
    bookings: [], expenses: [], maintenances: []
  };

  const first = buildAnalysisPackage(input);
  const second = buildAnalysisPackage(input);

  assert.deepStrictEqual(first, second);
  assert.strictEqual(first.schemaVersion, '1.0');
  assert.strictEqual(first.generatedAt, input.generatedAt);
  assert.strictEqual(first.currency, 'TRY');
  assert.deepStrictEqual(first.portfolio.properties, [{ name: 'Seyir' }]);
  assert.deepStrictEqual(first.financials, {});
  assert.strictEqual(first.comparisonPeriod, null);
  assert.strictEqual(first.dataQuality.status, 'INSUFFICIENT_DATA');

  const serialized = JSON.stringify(first);
  assert(!serialized.includes('tenant-secret-id'));
  assert(!serialized.includes('prop-a'));
  assert(!serialized.includes('guest_name'));
});

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
