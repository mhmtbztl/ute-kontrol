const assert = require('assert');
const Service = require('./property_analysis_context_service');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

const TENANT = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';
const P2 = '33333333-3333-4333-8333-333333333333';

function queryResult(rows, error, calls, table) {
  const state = { table, columns: null, filters: [] };
  calls.push(state);
  const query = {
    select(columns) { state.columns = columns; return query; },
    eq(column, value) { state.filters.push({ kind: 'eq', column, value }); return query; },
    in(column, value) { state.filters.push({ kind: 'in', column, value }); return query; },
    then(resolve, reject) { return Promise.resolve({ data: rows || [], error: error || null }).then(resolve, reject); }
  };
  return query;
}

function mockClient(dataByTable = {}, errorsByTable = {}) {
  const calls = [];
  return {
    calls,
    from(table) { return queryResult(dataByTable[table], errorsByTable[table], calls, table); },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      return { data: { propertyId: args.p_property_id }, error: null };
    }
  };
}

(async () => {
  await test('context validation normalizes structured location and allowlisted HTTPS links', () => {
    const valid = Service.validateContextInput({
      tenantId: TENANT,
      propertyId: P1,
      countryCode: ' tr ',
      adminArea: ' Antalya ',
      city: 'Kaş',
      districtRegion: ' Kalkan ',
      socialLinks: {
        website: 'https://example.com/villa',
        instagram: ' https://instagram.com/example ',
        empty: '',
        facebook: ''
      }
    });
    assert.strictEqual(valid.countryCode, 'TR');
    assert.strictEqual(valid.adminArea, 'Antalya');
    assert.strictEqual(valid.districtRegion, 'Kalkan');
    assert.deepStrictEqual(valid.socialLinks, {
      website: 'https://example.com/villa',
      instagram: 'https://instagram.com/example'
    });
  });

  await test('context validation rejects foreign keys, unknown social fields and unsafe URLs', () => {
    assert.throws(() => Service.validateContextInput({ tenantId: 'bad', propertyId: P1 }), /VALID_TENANT_ID_REQUIRED/);
    assert.throws(() => Service.validateContextInput({ tenantId: TENANT, propertyId: P1, countryCode: 'TUR' }), /INVALID_COUNTRY_CODE/);
    assert.throws(() => Service.validateContextInput({
      tenantId: TENANT, propertyId: P1, socialLinks: { linkedin: 'https://linkedin.com/company/example' }
    }), /UNSUPPORTED_SOCIAL_LINK/);
    for (const url of ['http://example.com', 'javascript:alert(1)', 'https://user:secret@example.com']) {
      assert.throws(() => Service.validateContextInput({
        tenantId: TENANT, propertyId: P1, socialLinks: { website: url }
      }), /HTTPS_PUBLIC_URL_REQUIRED/);
    }
  });

  await test('save uses the Phase 40 authenticated RPC with a bounded payload', async () => {
    const client = mockClient();
    await Service.savePropertyAnalysisContext(client, {
      tenantId: TENANT, propertyId: P1, countryCode: 'TR', city: 'Kaş',
      socialLinks: { youtube: 'https://youtube.com/@villa' }
    });
    const call = client.calls.find(item => item.rpc);
    assert.strictEqual(call.rpc, 'save_property_analysis_context');
    assert.deepStrictEqual(call.args, {
      p_tenant_id: TENANT,
      p_property_id: P1,
      p_country_code: 'TR',
      p_admin_area: null,
      p_city: 'Kaş',
      p_district_region: null,
      p_social_links: { youtube: 'https://youtube.com/@villa' }
    });
  });

  await test('analysis context reads are tenant and property scoped with strict column allowlists', async () => {
    const client = mockClient({ property_analysis_context: [], property_channel_listings: [] });
    await Service.loadAnalysisContext(client, { tenantId: TENANT, propertyIds: [P1, P2] });
    const contextCall = client.calls.find(item => item.table === 'property_analysis_context');
    const listingCall = client.calls.find(item => item.table === 'property_channel_listings');
    assert.strictEqual(contextCall.columns, 'property_id,country_code,admin_area,city,district_region,social_links');
    assert.strictEqual(listingCall.columns, 'property_id,channel_code,display_name,external_url,status');
    for (const call of [contextCall, listingCall]) {
      assert(call.filters.some(filter => filter.column === 'tenant_id' && filter.value === TENANT));
      assert(call.filters.some(filter => filter.kind === 'in' && filter.column === 'property_id'));
    }
    assert(listingCall.filters.some(filter => filter.column === 'status' && filter.value === 'ACTIVE'));
  });

  await test('an unapplied Phase 40 degrades context only and still returns OTA links', async () => {
    const client = mockClient({
      property_channel_listings: [{
        property_id: P1, channel_code: 'OTHER_OTA', display_name: 'ETS Tur',
        external_url: 'https://www.etstur.com/villa/example', status: 'ACTIVE'
      }]
    }, {
      property_analysis_context: { code: 'PGRST205', message: 'table not found' }
    });
    const result = await Service.loadAnalysisContext(client, { tenantId: TENANT, propertyIds: [P1] });
    assert.strictEqual(result.contextAvailable, false);
    assert.deepStrictEqual(result.warnings, ['ANALYSIS_CONTEXT_SCHEMA_UNAVAILABLE']);
    assert.strictEqual(result.channelListings[0].display_name, 'ETS Tur');
  });

  await test('property enrichment keeps internal IDs only as join keys and sanitizes URLs', () => {
    const properties = [{ id: P1, slug: 'SEYIR', name: 'Villa Seyir' }];
    const enriched = Service.attachAnalysisContext(properties, {
      contexts: [{
        property_id: P1, country_code: 'TR', admin_area: 'Antalya', city: 'Kaş',
        district_region: 'Kalkan', social_links: {
          instagram: 'https://instagram.com/villa', website: 'http://unsafe.example'
        }
      }],
      channelListings: [
        { property_id: P1, channel_code: 'OTHER_OTA', display_name: 'ETS Tur', external_url: 'https://etstur.com/villa' },
        { property_id: P1, channel_code: 'AIRBNB', display_name: 'Secret ref', external_url: 'javascript:alert(1)', external_listing_id: 'DO-NOT-EXPORT' }
      ]
    });
    assert.strictEqual(enriched[0].analysisContext.location.countryCode, 'TR');
    assert.strictEqual(enriched[0].analysisContext.location.countryName, 'Türkiye');
    assert.deepStrictEqual(enriched[0].analysisContext.socialLinks, { instagram: 'https://instagram.com/villa' });
    assert.deepStrictEqual(enriched[0].analysisContext.otaLinks, [{
      channel: 'OTHER_OTA', displayName: 'ETS Tur', url: 'https://etstur.com/villa'
    }]);
    assert(!JSON.stringify(enriched[0].analysisContext).includes('DO-NOT-EXPORT'));
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
})();
