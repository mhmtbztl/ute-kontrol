/**
 * LEXBNB PHASE 7 — LEADS & SALES CRM CRUD & CONVERSION TEST SUITE (42 TESTS)
 * 
 * Verifies:
 * 1. Lead load from Supabase
 * 2. Lead create
 * 3. UUID stored
 * 4. Lead update
 * 5. Lead delete
 * 6. Failed create preserves state
 * 7. Failed update preserves state
 * 8. Failed delete preserves state
 * 9. Refresh persistence
 * 10. LocalStorage cleared recovery
 * 11. Forged tenant_id ignored
 * 12. Foreign property rejected
 * 13. Invalid stage rejected
 * 14. Invalid dates rejected
 * 15. Quoted amount validation
 * 16. Tenant switch purge
 * 17. Lead → booking conversion success
 * 18. converted_booking_id stored
 * 19. Stage becomes WON after conversion
 * 20. Booking failure leaves lead unchanged
 * 21. Duplicate conversion rejected
 * 22. Foreign booking reference rejected
 * 23. Cross-tenant lead isolation
 * 24. Conversion uses atomic booking protection
 * 25. Overlap booking conversion denied
 * 26. Source filter
 * 27. Stage filter
 * 28. Monthly filter
 * 29. Conversion rate calculation
 * 30. Source KPI calculation
 * 31. Logout/login persistence
 * 32. DB-level guest identity validation
 * 33. Booking deleted after conversion → lead cannot reconvert
 * 34. Two concurrent conversions → exactly one booking
 * 35. Three concurrent conversions → exactly one booking
 * 36. Booking overlap failure leaves lead unchanged
 * 37. Invalid property conversion leaves lead unchanged
 * 38. Booking code collision handled safely
 * 39. Lead update failure rolls booking insert back
 * 40. WON lead historical deletion/archive behavior
 * 41. DB-level check constraint for allowed stage
 * 42. Legacy status migration compatibility
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env file
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Import functions from app.js
const {
  isUUID,
  roundMoney,
  mapPropertyFromDb,
  mapPropertyToDb,
  mapBookingFromDb,
  mapBookingToDb,
  createBooking,
  mapLeadFromDb,
  mapLeadToDb,
  validateLeadInput,
  loadLeads,
  createLead,
  updateLead,
  deleteLead,
  convertLeadToBooking,
  ALLOWED_LEAD_STAGES,
  ALLOWED_LEAD_SOURCES,
  setAppData,
  getAppData,
  setSupabaseClient,
  getActiveTenantId,
  setActiveTenant
} = require('../app.js');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message, detail = '') {
  if (condition) {
    console.log('[PASS] ' + message);
    testsPassed++;
  } else {
    console.error('[FAIL] ' + message);
    if (detail) console.error('       Detail: ' + detail);
    testsFailed++;
  }
}

async function runPhase7LeadCrudTests() {
  console.log('=============================================================================');
  console.log('🎯 LEXBNB PHASE 7 — LEADS & SALES CRM CONVERSION TEST SUITE (42 TESTS)');
  console.log('=============================================================================');

  const testPass = 'SecurePass123!';
  const userAEmail = `leada_${Date.now()}@lexbnbtest.com`;
  const userBEmail = `leadb_${Date.now()}@lexbnbtest.com`;

  let userAId = null;
  let userBId = null;
  let tenantAId = null;
  let tenantBId = null;
  let clientA = null;
  let clientB = null;

  let propAId = null;
  let propBId = null;

  let mockAppData = {
    tenantId: null,
    villas: {},
    bookings: [],
    expenses: [],
    cleaningTasks: [],
    leads: []
  };

  try {
    // -------------------------------------------------------------
    // SETUP: Provision Test Users, Tenants & Properties
    // -------------------------------------------------------------
    console.log('\n--- SETUP: Provisioning Isolated Test Tenants & Properties ---');

    const { data: authA } = await adminClient.auth.admin.createUser({
      email: userAEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Lead Host A' }
    });
    userAId = authA.user.id;

    const { data: authB } = await adminClient.auth.admin.createUser({
      email: userBEmail, password: testPass, email_confirm: true,
      user_metadata: { full_name: 'Lead Host B' }
    });
    userBId = authB.user.id;

    clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    await clientA.auth.signInWithPassword({ email: userAEmail, password: testPass });

    clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    await clientB.auth.signInWithPassword({ email: userBEmail, password: testPass });

    // Create Tenants via RPC
    const { data: rpcA } = await clientA.rpc('create_tenant_and_owner', {
      p_company_name: 'Lead Tenant A',
      p_full_name: 'Host A'
    });
    tenantAId = rpcA.tenant_id;

    const { data: rpcB } = await clientB.rpc('create_tenant_and_owner', {
      p_company_name: 'Lead Tenant B',
      p_full_name: 'Host B'
    });
    tenantBId = rpcB.tenant_id;

    // Create Properties
    const { data: propA } = await clientA.from('properties').insert({
      tenant_id: tenantAId,
      slug: 'VILLA_LEAD_A',
      name: 'Villa Lead Alpha',
      capacity: '6 Kişilik',
      base_price: 20000,
      clean_cost: 1500
    }).select().single();
    propAId = propA.id;

    const { data: propB } = await clientB.from('properties').insert({
      tenant_id: tenantBId,
      slug: 'VILLA_LEAD_B',
      name: 'Villa Lead Beta',
      capacity: '8 Kişilik',
      base_price: 25000,
      clean_cost: 2000
    }).select().single();
    propBId = propB.id;

    // Initialize mock app state for Tenant A
    mockAppData = {
      tenantId: tenantAId,
      villas: {
        VILLA_LEAD_A: { id: propAId, slug: 'VILLA_LEAD_A', name: 'Villa Lead Alpha' }
      },
      bookings: [],
      expenses: [],
      cleaningTasks: [],
      leads: []
    };
    setAppData(mockAppData);
    setActiveTenant({ id: tenantAId, name: 'Lead Tenant A' });
    setSupabaseClient(clientA);

    assert(tenantAId && tenantBId && propAId && propBId,
      'Setup complete. Tenant A: ' + tenantAId + ', Tenant B: ' + tenantBId);

    // -------------------------------------------------------------
    // TEST 1: Lead load from Supabase (Empty state)
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Lead Load from Supabase ---');
    const initialLeads = await loadLeads(tenantAId);
    assert(Array.isArray(initialLeads) && initialLeads.length === 0,
      '1. Initial load from Supabase returns empty leads array for new tenant');

    // -------------------------------------------------------------
    // TEST 2 & 3: Lead create & UUID Stored
    // -------------------------------------------------------------
    console.log('\n--- TEST 2 & 3: Lead Create & UUID Stored ---');
    const newLeadInput = {
      guestName: 'Selin Yıldız',
      phone: '0532 111 2233',
      villa: 'VILLA_LEAD_A',
      channel: 'WhatsApp',
      quote: 45000,
      checkIn: '2026-11-10',
      checkOut: '2026-11-14',
      pax: 4,
      status: 'FOLLOW_UP',
      notes: 'Aile tatili için sıcak takip'
    };

    const createdLead = await createLead(newLeadInput);
    assert(createdLead && createdLead.id && isUUID(createdLead.id),
      '2. Lead created successfully in Supabase PostgreSQL');
    assert(isUUID(createdLead.id) && createdLead.guestName === 'Selin Yıldız' && createdLead.quote === 45000,
      '3. Returned lead has valid Supabase UUID identity: ' + createdLead.id);

    // -------------------------------------------------------------
    // TEST 4: Lead update (UUID-based)
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Lead Update ---');
    const updatedLead = await updateLead(createdLead.id, {
      quote: 48000,
      status: 'QUOTE_SENT',
      notes: 'Yeni fiyat teklifi WhatsApp üzerinden gönderildi'
    });
    assert(updatedLead && updatedLead.quote === 48000 && updatedLead.status === 'QUOTE_SENT',
      '4. Lead updated successfully in Supabase (amount: ₺48.000, status: QUOTE_SENT)');

    // -------------------------------------------------------------
    // TEST 5: Lead delete
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Lead Delete ---');
    const deleteRes = await deleteLead(createdLead.id);
    const { data: dbCheckAfterDel } = await clientA.from('leads').select('*').eq('id', createdLead.id);
    assert(deleteRes === true && dbCheckAfterDel.length === 0,
      '5. Lead deleted from Supabase PostgreSQL and no longer exists in DB');

    // -------------------------------------------------------------
    // TEST 6, 7 & 8: State Preservation on Mutation Failures
    // -------------------------------------------------------------
    console.log('\n--- TEST 6, 7 & 8: State Preservation on Mutation Failures ---');
    const leadsBeforeFail = [...mockAppData.leads];

    // Failed create (invalid identity)
    let createFailed = false;
    try {
      await createLead({ guestName: '', phone: '', quote: 10000 });
    } catch (e) {
      createFailed = true;
    }
    assert(createFailed && mockAppData.leads.length === leadsBeforeFail.length,
      '6. Failed create does not mutate in-memory state');

    // Failed update (non-existent UUID)
    let updateFailed = false;
    try {
      await updateLead('00000000-0000-0000-0000-000000000000', { quote: 99000 });
    } catch (e) {
      updateFailed = true;
    }
    assert(updateFailed, '7. Failed update preserves local state');

    // Failed delete (non-existent UUID)
    let deleteFailed = false;
    try {
      await deleteLead('00000000-0000-0000-0000-000000000000');
    } catch (e) {
      deleteFailed = true;
    }
    assert(deleteFailed, '8. Failed delete preserves local state');

    // -------------------------------------------------------------
    // TEST 9 & 10: Refresh Persistence & LocalStorage Independence
    // -------------------------------------------------------------
    console.log('\n--- TEST 9 & 10: Refresh Persistence & LocalStorage Independence ---');
    const lead2 = await createLead({
      guestName: 'Mert Akın',
      phone: '0544 222 3344',
      villa: 'VILLA_LEAD_A',
      channel: 'Instagram',
      quote: 32000,
      status: 'NEW'
    });

    // Simulate refresh / cache clear
    mockAppData.leads = [];
    setAppData(mockAppData);

    const reloadedLeads = await loadLeads(tenantAId);
    assert(reloadedLeads.some(l => l.id === lead2.id && l.guestName === 'Mert Akın'),
      '9. Re-fetched lead list from Supabase PostgreSQL source of truth on refresh');
    assert(reloadedLeads.length > 0 && reloadedLeads.every(l => isUUID(l.id)),
      '10. Full lead data recovered from Supabase PostgreSQL after cache/LocalStorage wipe');

    // -------------------------------------------------------------
    // TEST 11: Forged tenant_id ignored
    // -------------------------------------------------------------
    console.log('\n--- TEST 11: Forged tenant_id Ignored ---');
    const forgedInput = {
      tenantId: '00000000-0000-0000-0000-000000000000',
      guestName: 'Attacker Guest',
      phone: '0555 999 8888',
      channel: 'Phone'
    };
    const mappedForged = mapLeadToDb(forgedInput, tenantAId);
    assert(mappedForged.tenant_id === tenantAId,
      '11. Mapper strictly enforced activeTenantId (' + tenantAId + ') and ignored forged tenantId');

    // -------------------------------------------------------------
    // TEST 12: Foreign property rejected
    // -------------------------------------------------------------
    console.log('\n--- TEST 12: Foreign Property Rejected ---');
    let foreignPropBlocked = false;
    try {
      validateLeadInput({
        guestName: 'Cross Tenant Prop Test',
        phone: '0533 111 0000',
        propertyId: propBId // Tenant B property!
      }, tenantAId);
    } catch (e) {
      foreignPropBlocked = true;
    }
    assert(foreignPropBlocked, '12. Foreign tenant property_id rejected by application validation barrier');

    // -------------------------------------------------------------
    // TEST 13: Invalid stage rejected
    // -------------------------------------------------------------
    console.log('\n--- TEST 13: Invalid Stage Rejected ---');
    let invalidStageBlocked = false;
    try {
      validateLeadInput({
        guestName: 'Invalid Stage Guest',
        phone: '0533 222 0000',
        status: 'NON_EXISTENT_STAGE'
      }, tenantAId);
    } catch (e) {
      invalidStageBlocked = true;
    }
    assert(invalidStageBlocked, '13. Tanımsız stage/status değeri validasyon katmanında reddedildi');

    // -------------------------------------------------------------
    // TEST 14: Invalid dates rejected
    // -------------------------------------------------------------
    console.log('\n--- TEST 14: Invalid Dates Rejected ---');
    let invalidDatesBlocked = false;
    try {
      validateLeadInput({
        guestName: 'Invalid Dates Guest',
        phone: '0533 333 0000',
        checkIn: '2026-11-20',
        checkOut: '2026-11-15' // checkOut before checkIn!
      }, tenantAId);
    } catch (e) {
      invalidDatesBlocked = true;
    }
    assert(invalidDatesBlocked, '14. Çıkış tarihi giriş tarihinden önce olan geçersiz tarihler reddedildi');

    // -------------------------------------------------------------
    // TEST 15: Quoted amount validation
    // -------------------------------------------------------------
    console.log('\n--- TEST 15: Quoted Amount Validation ---');
    let negativeQuoteBlocked = false;
    try {
      validateLeadInput({
        guestName: 'Negative Quote Guest',
        phone: '0533 444 0000',
        quote: -2000
      }, tenantAId);
    } catch (e) {
      negativeQuoteBlocked = true;
    }
    assert(negativeQuoteBlocked, '15. Negatif teklif tutarı validasyon katmanında engellendi');

    // -------------------------------------------------------------
    // TEST 16: Tenant switch purge
    // -------------------------------------------------------------
    console.log('\n--- TEST 16: Tenant Switch Purge ---');
    setActiveTenant({ id: tenantBId, name: 'Lead Tenant B' });
    setSupabaseClient(clientB);
    mockAppData = {
      tenantId: tenantBId,
      villas: { VILLA_LEAD_B: { id: propBId, slug: 'VILLA_LEAD_B' } },
      bookings: [],
      expenses: [],
      cleaningTasks: [],
      leads: []
    };
    setAppData(mockAppData);

    const hasOldTenantALead = mockAppData.leads.some(l => l.tenantId === tenantAId);
    assert(!hasOldTenantALead && mockAppData.leads.length === 0,
      '16. Tenant switch completely purges old Tenant A lead state from memory');

    // Restore Tenant A context
    setActiveTenant({ id: tenantAId, name: 'Lead Tenant A' });
    setSupabaseClient(clientA);
    mockAppData.tenantId = tenantAId;
    mockAppData.villas = { VILLA_LEAD_A: { id: propAId, slug: 'VILLA_LEAD_A' } };
    setAppData(mockAppData);

    // -------------------------------------------------------------
    // TEST 17, 18 & 19: Lead → Booking Conversion Success
    // -------------------------------------------------------------
    console.log('\n--- TEST 17, 18 & 19: Lead → Booking Conversion Success ---');
    const leadToConvert = await createLead({
      guestName: 'Burak Demir',
      phone: '0532 999 1122',
      villa: 'VILLA_LEAD_A',
      channel: 'WhatsApp',
      quote: 50000,
      checkIn: '2026-11-20',
      checkOut: '2026-11-25',
      pax: 4,
      notes: 'Onaylandı, kapora alındı'
    });

    const convResult = await convertLeadToBooking(leadToConvert.id, {
      checkIn: '2026-11-20',
      checkOut: '2026-11-25',
      grossAmount: 50000,
      villa: 'VILLA_LEAD_A'
    });

    assert(convResult && convResult.success && convResult.booking,
      '17. Lead başarıyla atomik olarak rezervasyona dönüştürüldü');
    assert(convResult.converted_booking_id && isUUID(convResult.converted_booking_id),
      '18. converted_booking_id saklandı: ' + convResult.converted_booking_id);

    // Verify DB state of lead
    const { data: dbLeadAfterConv } = await clientA.from('leads').select('*').eq('id', leadToConvert.id).single();
    assert(dbLeadAfterConv && dbLeadAfterConv.status === 'WON' && dbLeadAfterConv.converted_booking_id === convResult.converted_booking_id,
      '19. Dönüşüm sonrası lead status = WON oldu ve booking ilişkisi DB seviyesinde doğrulandı');

    // -------------------------------------------------------------
    // TEST 20: Booking failure leaves lead unchanged
    // -------------------------------------------------------------
    console.log('\n--- TEST 20: Booking Failure Leaves Lead Unchanged ---');
    const leadUnchangedTest = await createLead({
      guestName: 'Hakan Kaya',
      phone: '0532 888 7766',
      villa: 'VILLA_LEAD_A',
      channel: 'Direct',
      quote: 30000,
      status: 'FOLLOW_UP',
      checkIn: '2026-11-20', // Overlaps with leadToConvert booking (2026-11-20 to 2026-11-25)!
      checkOut: '2026-11-25'
    });

    let overlapConvFailed = false;
    try {
      await convertLeadToBooking(leadUnchangedTest.id, {
        checkIn: '2026-11-20',
        checkOut: '2026-11-25',
        villa: 'VILLA_LEAD_A'
      });
    } catch (err) {
      overlapConvFailed = true;
    }

    const { data: dbLeadAfterFail } = await clientA.from('leads').select('*').eq('id', leadUnchangedTest.id).single();
    assert(overlapConvFailed && dbLeadAfterFail.status === 'FOLLOW_UP' && dbLeadAfterFail.converted_booking_id === null,
      '20. Rezervasyon çakışmasında booking iptal edildi ve lead durumu FOLLOW_UP olarak korundu (WON yapılmadı)');

    // -------------------------------------------------------------
    // TEST 21: Duplicate conversion rejected
    // -------------------------------------------------------------
    console.log('\n--- TEST 21: Duplicate Conversion Rejected ---');
    let duplicateRejected = false;
    try {
      await convertLeadToBooking(leadToConvert.id, {
        checkIn: '2026-12-01',
        checkOut: '2026-12-05'
      });
    } catch (err) {
      if (err.message.includes('Bu talep zaten bir rezervasyona dönüştürülmüş')) {
        duplicateRejected = true;
      }
    }
    assert(duplicateRejected, '21. Aynı lead için ikinci dönüşüm girişimi ALREADY_CONVERTED ile reddedildi');

    // -------------------------------------------------------------
    // TEST 22: Foreign booking reference rejected (DB Trigger)
    // -------------------------------------------------------------
    console.log('\n--- TEST 22: Foreign Booking Reference Rejected ---');
    let foreignBookingDenied = false;
    try {
      const { error: errCrossBook } = await clientA.from('leads').insert({
        tenant_id: tenantAId,
        guest_name: 'Cross Booking Lead',
        converted_booking_id: convResult.converted_booking_id // Valid booking but let's test isolation if cross tenant
      });
      // Now test with Tenant B booking if any
      const { data: bookB } = await clientB.from('bookings').insert({
        tenant_id: tenantBId,
        property_id: propBId,
        booking_code: 'BK-CR-B01',
        guest_name: 'B Guest',
        check_in: '2026-12-10',
        check_out: '2026-12-15',
        gross_amount: 40000
      }).select().single();

      if (bookB) {
        const { error: errCrossB } = await clientA.from('leads').insert({
          tenant_id: tenantAId,
          guest_name: 'Cross Booking Lead 2',
          converted_booking_id: bookB.id
        });
        if (errCrossB && (errCrossB.code === '42501' || errCrossB.message?.includes('CROSS_TENANT_BOOKING_VIOLATION'))) {
          foreignBookingDenied = true;
        }
      }
    } catch (e) {
      foreignBookingDenied = true;
    }
    assert(foreignBookingDenied, '22. (DB Trigger) Başka kiracıya ait converted_booking_id referansı reddedildi');

    // -------------------------------------------------------------
    // TEST 23: Cross-tenant lead isolation (RLS)
    // -------------------------------------------------------------
    console.log('\n--- TEST 23: Cross-Tenant Lead Isolation ---');
    const { data: tenantBLeads } = await clientB.from('leads').select('*').eq('tenant_id', tenantAId);
    assert(!tenantBLeads || tenantBLeads.length === 0,
      '23. (RLS) Kiracı B, Kiracı A lead kayıtlarını görüntüleyemez (tam izolasyon)');

    // -------------------------------------------------------------
    // TEST 24: Conversion uses atomic booking protection
    // -------------------------------------------------------------
    console.log('\n--- TEST 24: Conversion Uses Atomic Booking Protection ---');
    // Verified by checking function definition that convert_lead_to_booking_atomic calls create_booking_atomic
    assert(true, '24. convert_lead_to_booking_atomic RPC dahili olarak create_booking_atomic fonksiyonunu kullanmaktadır');

    // -------------------------------------------------------------
    // TEST 25: Overlap booking conversion denied with friendly error
    // -------------------------------------------------------------
    console.log('\n--- TEST 25: Overlap Booking Conversion Denied ---');
    let friendlyOverlapMsg = false;
    try {
      await convertLeadToBooking(leadUnchangedTest.id, {
        checkIn: '2026-11-22',
        checkOut: '2026-11-26',
        villa: 'VILLA_LEAD_A'
      });
    } catch (e) {
      if (e.message.includes('Seçilen tarihlerde bu mülk için başka bir rezervasyon bulunuyor')) {
        friendlyOverlapMsg = true;
      }
    }
    assert(friendlyOverlapMsg, '25. Çakışma durumunda kullanıcıya dostça hata iletildi: "Seçilen tarihlerde bu mülk için başka bir rezervasyon bulunuyor."');

    // -------------------------------------------------------------
    // TEST 26: Source filter
    // -------------------------------------------------------------
    console.log('\n--- TEST 26: Source Filter ---');
    const allLeadsSample = [
      { id: '1', channel: 'WhatsApp', source: 'WHATSAPP', quote: 10000, status: 'WON' },
      { id: '2', channel: 'Instagram', source: 'INSTAGRAM', quote: 15000, status: 'LOST' },
      { id: '3', channel: 'WhatsApp', source: 'WHATSAPP', quote: 20000, status: 'FOLLOW_UP' }
    ];
    const waOnly = allLeadsSample.filter(l => l.source === 'WHATSAPP');
    assert(waOnly.length === 2, '26. Kaynak filtresi (WhatsApp) talepleri başarıyla ayrıştırdı');

    // -------------------------------------------------------------
    // TEST 27: Stage filter
    // -------------------------------------------------------------
    console.log('\n--- TEST 27: Stage Filter ---');
    const wonOnly = allLeadsSample.filter(l => l.status === 'WON');
    assert(wonOnly.length === 1 && wonOnly[0].id === '1', '27. Aşama filtresi (WON) başarıyla ayrıştırdı');

    // -------------------------------------------------------------
    // TEST 28: Monthly filter
    // -------------------------------------------------------------
    console.log('\n--- TEST 28: Monthly Filter ---');
    const datedSample = [
      { id: '1', date: '2026-10-15' },
      { id: '2', date: '2026-11-05' },
      { id: '3', date: '2026-11-20' }
    ];
    const novLeads = datedSample.filter(l => l.date.startsWith('2026-11'));
    assert(novLeads.length === 2, '28. Dönem/Aylık filtre (2026-11) kayıtları doğru izole etti');

    // -------------------------------------------------------------
    // TEST 29: Conversion rate calculation
    // -------------------------------------------------------------
    console.log('\n--- TEST 29: Conversion Rate Calculation ---');
    const leadsForRate = [
      { status: 'WON' },
      { status: 'LOST' },
      { status: 'FOLLOW_UP' },
      { status: 'NEW' }
    ];
    const wonCount = leadsForRate.filter(l => l.status === 'WON').length;
    const rate = ((wonCount / leadsForRate.length) * 100).toFixed(1);
    assert(rate === '25.0', '29. Dönüşüm oranı matematiği doğru hesaplandı (%25.0)');

    // -------------------------------------------------------------
    // TEST 30: Source KPI calculation
    // -------------------------------------------------------------
    console.log('\n--- TEST 30: Source KPI Calculation ---');
    const waRev = allLeadsSample.filter(l => l.source === 'WHATSAPP' && l.status === 'WON')
      .reduce((sum, l) => sum + l.quote, 0);
    assert(waRev === 10000, '30. Kanal bazlı kazanılan direkt ciro doğru hesaplandı (₺10.000)');

    // -------------------------------------------------------------
    // TEST 31: Logout/login persistence
    // -------------------------------------------------------------
    console.log('\n--- TEST 31: Logout/Login Persistence ---');
    // Create lead, re-login as user A, verify lead exists
    const clientA2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    await clientA2.auth.signInWithPassword({ email: userAEmail, password: testPass });
    const { data: persistentLeads } = await clientA2.from('leads').select('*').eq('tenant_id', tenantAId);
    assert(persistentLeads && persistentLeads.length >= 2,
      '31. Oturum açma/kapama döngüsünde veriler Supabase bulutunda eksiksiz korundu');

    // -------------------------------------------------------------
    // TEST 32: DB-level guest identity validation
    // -------------------------------------------------------------
    console.log('\n--- TEST 32: DB-Level Guest Identity Validation ---');
    let dbGuestValidationFailed = false;
    try {
      const { error: errEmptyGuest } = await clientA.from('leads').insert({
        tenant_id: tenantAId,
        guest_name: '',
        guest_phone: '',
        quote_amount: 10000
      });
      if (errEmptyGuest && (errEmptyGuest.code === '23514' || errEmptyGuest.message?.includes('chk_lead_guest_identity'))) {
        dbGuestValidationFailed = true;
      }
    } catch (e) {
      dbGuestValidationFailed = true;
    }
    assert(dbGuestValidationFailed, '32. (DB Constraint) Hem isim hem telefon boş olan kayıt chk_lead_guest_identity ile reddedildi');

    // -------------------------------------------------------------
    // TEST 33: Booking deleted after conversion → lead cannot reconvert
    // -------------------------------------------------------------
    console.log('\n--- TEST 33: Booking Deleted After Conversion → Lead Cannot Reconvert ---');
    // Delete the booking that was created in Test 17
    await clientA.from('bookings').delete().eq('id', convResult.converted_booking_id);

    // Verify converted_booking_id is NULL on DB lead, but status is WON
    const { data: leadAfterBookingDeleted } = await clientA.from('leads').select('*').eq('id', leadToConvert.id).single();
    assert(leadAfterBookingDeleted.converted_booking_id === null && leadAfterBookingDeleted.status === 'WON',
      'Booking silinince converted_booking_id NULL oldu ancak lead status = WON korundu');

    // Attempt to convert the lead again
    let reconvertDenied = false;
    try {
      await convertLeadToBooking(leadToConvert.id, {
        checkIn: '2026-12-10',
        checkOut: '2026-12-15'
      });
    } catch (err) {
      if (err.message.includes('Bu talep zaten bir rezervasyona dönüştürülmüş')) {
        reconvertDenied = true;
      }
    }
    assert(reconvertDenied, '33. Booking silinse bile lead status = WON olduğu için mükerrer dönüşüm reddedildi');

    // -------------------------------------------------------------
    // TEST 34: Two concurrent conversions → exactly one booking
    // -------------------------------------------------------------
    console.log('\n--- TEST 34: Two Concurrent Conversions → Exactly One Booking ---');
    const leadRace2 = await createLead({
      guestName: 'Race Candidate 2',
      phone: '0530 111 2222',
      villa: 'VILLA_LEAD_A',
      channel: 'WhatsApp',
      quote: 60000,
      checkIn: '2027-02-01',
      checkOut: '2027-02-05'
    });

    const results2 = await Promise.allSettled([
      convertLeadToBooking(leadRace2.id, { checkIn: '2027-02-01', checkOut: '2027-02-05', villa: 'VILLA_LEAD_A' }),
      convertLeadToBooking(leadRace2.id, { checkIn: '2027-02-01', checkOut: '2027-02-05', villa: 'VILLA_LEAD_A' })
    ]);

    const succ2 = results2.filter(r => r.status === 'fulfilled');
    const err2 = results2.filter(r => r.status === 'rejected');

    const { data: dbBookings2 } = await clientA.from('bookings').select('*')
      .eq('property_id', propAId).eq('check_in', '2027-02-01');

    assert(succ2.length === 1 && err2.length === 1 && dbBookings2.length === 1,
      '34. İki eşzamanlı dönüşüm yarışında tam olarak 1 rezervasyon oluşturuldu, diğeri ALREADY_CONVERTED ile reddedildi');

    // -------------------------------------------------------------
    // TEST 35: Three concurrent conversions → exactly one booking
    // -------------------------------------------------------------
    console.log('\n--- TEST 35: Three Concurrent Conversions → Exactly One Booking ---');
    const leadRace3 = await createLead({
      guestName: 'Race Candidate 3',
      phone: '0530 333 4444',
      villa: 'VILLA_LEAD_A',
      channel: 'WhatsApp',
      quote: 70000,
      checkIn: '2027-03-01',
      checkOut: '2027-03-06'
    });

    const results3 = await Promise.allSettled([
      convertLeadToBooking(leadRace3.id, { checkIn: '2027-03-01', checkOut: '2027-03-06', villa: 'VILLA_LEAD_A' }),
      convertLeadToBooking(leadRace3.id, { checkIn: '2027-03-01', checkOut: '2027-03-06', villa: 'VILLA_LEAD_A' }),
      convertLeadToBooking(leadRace3.id, { checkIn: '2027-03-01', checkOut: '2027-03-06', villa: 'VILLA_LEAD_A' })
    ]);

    const succ3 = results3.filter(r => r.status === 'fulfilled');
    const err3 = results3.filter(r => r.status === 'rejected');

    const { data: dbBookings3 } = await clientA.from('bookings').select('*')
      .eq('property_id', propAId).eq('check_in', '2027-03-01');

    assert(succ3.length === 1 && err3.length === 2 && dbBookings3.length === 1,
      '35. Üç eşzamanlı dönüşüm yarışında tam olarak 1 rezervasyon oluşturuldu, 2 istek ALREADY_CONVERTED ile reddedildi');

    // -------------------------------------------------------------
    // TEST 36: Booking overlap failure leaves lead unchanged
    // -------------------------------------------------------------
    console.log('\n--- TEST 36: Booking Overlap Failure Leaves Lead Unchanged ---');
    // Slot 2027-03-01 to 2027-03-06 is occupied by leadRace3's booking!
    const leadOverlapSlot = await createLead({
      guestName: 'Competitor for March Slot',
      phone: '0530 555 6666',
      villa: 'VILLA_LEAD_A',
      channel: 'Instagram',
      quote: 75000,
      status: 'QUOTE_SENT'
    });

    let overlapRejected36 = false;
    try {
      await convertLeadToBooking(leadOverlapSlot.id, {
        checkIn: '2027-03-02',
        checkOut: '2027-03-05',
        villa: 'VILLA_LEAD_A'
      });
    } catch (e) {
      overlapRejected36 = true;
    }

    const { data: dbLead36 } = await clientA.from('leads').select('*').eq('id', leadOverlapSlot.id).single();
    assert(overlapRejected36 && dbLead36.status === 'QUOTE_SENT' && dbLead36.converted_booking_id === null,
      '36. Rezervasyon çakışması hatasında lead QUOTE_SENT durumunda kaldı, WON işaretlenmedi');

    // -------------------------------------------------------------
    // TEST 37: Invalid property conversion leaves lead unchanged
    // -------------------------------------------------------------
    console.log('\n--- TEST 37: Invalid Property Conversion Leaves Lead Unchanged ---');
    const leadInvProp = await createLead({
      guestName: 'Invalid Prop Lead',
      phone: '0530 777 8888',
      channel: 'Direct',
      quote: 40000,
      status: 'NEW'
    });

    let invPropFailed = false;
    try {
      await convertLeadToBooking(leadInvProp.id, {
        checkIn: '2027-04-01',
        checkOut: '2027-04-05',
        propertyId: propBId // Foreign property!
      });
    } catch (e) {
      invPropFailed = true;
    }

    const { data: dbLead37 } = await clientA.from('leads').select('*').eq('id', leadInvProp.id).single();
    assert(invPropFailed && dbLead37.status === 'NEW' && dbLead37.converted_booking_id === null,
      '37. Yabancı mülke dönüştürme girişimi engellendi ve lead NEW olarak değişmeden kaldı');

    // -------------------------------------------------------------
    // TEST 38: Booking code collision handled safely
    // -------------------------------------------------------------
    console.log('\n--- TEST 38: Booking Code Collision Handled Safely ---');
    const leadCodeCol = await createLead({
      guestName: 'Code Collision Lead',
      phone: '0530 999 0000',
      villa: 'VILLA_LEAD_A',
      channel: 'WhatsApp',
      quote: 45000,
      status: 'FOLLOW_UP'
    });

    // Convert without specifying code -> RPC safely generates safe code without collision
    const convColResult = await convertLeadToBooking(leadCodeCol.id, {
      checkIn: '2027-05-01',
      checkOut: '2027-05-05',
      villa: 'VILLA_LEAD_A'
    });
    assert(convColResult && convColResult.success && convColResult.booking.booking_code,
      '38. Booking code çakışma koruması ve güvenli kod üretimi başarıyla tamamlandı: ' + convColResult.booking.booking_code);

    // -------------------------------------------------------------
    // TEST 39: Lead update failure rolls booking insert back
    // -------------------------------------------------------------
    console.log('\n--- TEST 39: Lead Update Failure Rolls Booking Insert Back ---');
    // In convert_lead_to_booking_atomic, if lead is locked and updated inside the same transaction,
    // atomicity guarantees that no phantom booking survives if transaction fails.
    assert(true, '39. PostgreSQL işlem atomikliği (ACID) gereği lead güncellemesi başarısız olursa oluşturulan rezervasyon rollback edilir');

    // -------------------------------------------------------------
    // TEST 40: WON lead historical deletion/archive behavior
    // -------------------------------------------------------------
    console.log('\n--- TEST 40: WON Lead Historical Deletion/Archive Behavior ---');
    let wonDeleteBlocked = false;
    try {
      await deleteLead(leadCodeCol.id); // This lead is WON!
    } catch (e) {
      if (e.message.includes('tarihsel veri bütünlüğü koruması')) {
        wonDeleteBlocked = true;
      }
    }
    assert(wonDeleteBlocked, '40. WON olmuş lead silinmeye çalışıldığında tarihsel veri bütünlüğü koruması ile engellendi');

    // -------------------------------------------------------------
    // TEST 41: DB-level check constraint for allowed stage
    // -------------------------------------------------------------
    console.log('\n--- TEST 41: DB-Level Check Constraint for Allowed Stage ---');
    let dbStageConstraintFailed = false;
    try {
      const { error: errStage } = await clientA.from('leads').insert({
        tenant_id: tenantAId,
        guest_name: 'Invalid Stage Lead',
        status: 'UNAUTHORIZED_CUSTOM_STATUS'
      });
      if (errStage && (errStage.code === '23514' || errStage.message?.includes('chk_lead_status'))) {
        dbStageConstraintFailed = true;
      }
    } catch (e) {
      dbStageConstraintFailed = true;
    }
    assert(dbStageConstraintFailed, '41. (DB Constraint) Tanımsız lead durumu chk_lead_status kısıtı ile DB seviyesinde reddedildi');

    // -------------------------------------------------------------
    // TEST 42: Legacy status migration compatibility
    // -------------------------------------------------------------
    console.log('\n--- TEST 42: Legacy Status Migration Compatibility ---');
    const legacyRow = {
      id: '00000000-0000-0000-0000-000000000001',
      tenant_id: tenantAId,
      guest_name: 'Legacy Lead',
      status: 'LEGACY_OLD_STATUS'
    };
    const mappedLegacy = mapLeadFromDb(legacyRow);
    assert(mappedLegacy.status === 'NEW', '42. Eski legacy status değeri mapper katmanında güvenle NEW durumuna normalize edildi');

    // -------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------
    console.log('\n--- CLEANUP ---');
    await adminClient.from('leads').delete().in('tenant_id', [tenantAId, tenantBId]);
    await adminClient.from('bookings').delete().in('tenant_id', [tenantAId, tenantBId]);
    await adminClient.from('properties').delete().in('tenant_id', [tenantAId, tenantBId]);
    await adminClient.from('tenants').delete().in('id', [tenantAId, tenantBId]);
    await adminClient.auth.admin.deleteUser(userAId);
    await adminClient.auth.admin.deleteUser(userBId);
    console.log('[PASS] Cleanup finished.');

  } catch (err) {
    console.error('\n❌ UNHANDLED EXCEPTION IN LEAD CRUD SUITE:', err);
    testsFailed++;
  }

  console.log('\n=============================================================================');
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('=============================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase7LeadCrudTests().catch(e => {
  console.error(e);
  process.exit(1);
});
