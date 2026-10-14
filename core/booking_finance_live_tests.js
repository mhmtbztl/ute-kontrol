const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');
const Finance = require('./booking_finance');
const env = require('./test_env.js').loadTestEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options);
const client = createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,options);
const anon = createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,options);
const must = r => { if (r.error) throw new Error(r.error.message); return r.data; };
let user, viewerUser, tenant, passed = 0;
async function check(name,fn) { await fn(); passed++; console.log('[PASS] '+name); }
const profile = { dateBasis:'checkIn',validFrom:'2020-01-01',validTo:'2040-12-31',vat:{rate:10,room:true,cleaning:true,includesOther:false},accommodation:{rate:2,room:true,cleaning:false,includesOther:false} };
const input = { amount:12200,cleanFee:1000,discount:0,commission:1500,paymentCommission:100,cleanCost:500,nights:4,checkIn:'2031-01-01',checkOut:'2031-01-05',invoiceDate:'',
  tax:{enabled:true,mode:'exclusive',profile,vat:{platformCollected:'none',businessLiability:'all'},accommodation:{platformCollected:'none',businessLiability:'all'}},extras:[{id:'fuel',name:'Akaryakıt',amount:300},{id:'supplies',name:'Sarf',amount:100}] };
(async () => {
  try {
    const stamp = Date.now(); const email = `finance_${stamp}@lexbnb-e2e.test`, password = 'Finance!'+stamp;
    user = must(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;
    must(await client.auth.signInWithPassword({email,password}));
    tenant = must(await client.rpc('create_tenant_and_owner',{p_company_name:'Finance '+stamp,p_full_name:'Finance Test'})).tenant_id;
    const property = must(await client.from('properties').insert({tenant_id:tenant,name:'Finance test',slug:'finance'+stamp,base_price:10000,activated_on:'2030-01-01'}).select().single());
    await check('Server calculation matches JS for disabled, inclusive, exclusive, manual and compound rules', async () => {
      const cases = [input,{...input,tax:{enabled:false}}, {...input,tax:{...input.tax,vat:{platformCollected:'none',businessLiability:'none'},accommodation:{platformCollected:'none',businessLiability:'none'}}}, {...input,amount:13644,cleanFee:1100,tax:{...input.tax,mode:'inclusive'}},
        {...input,tax:{enabled:true,mode:'manual',vat:{amount:800,cleaningAmount:50,platformCollected:300,businessLiability:800},accommodation:{amount:200,cleaningAmount:0,platformCollected:200,businessLiability:200}}},
        {...input,tax:{...input.tax,profile:{...profile,vat:{...profile.vat,includesOther:true}}}}];
      for (const p of cases) assert.deepStrictEqual(must(await client.rpc('compute_booking_finance',{p})),Finance.calculate(p));
    });
    const booking = {tenant_id:tenant,property_id:property.id,booking_code:'FIN'+stamp,guest_name:'Finance Guest',guest_phone:'',channel:'AIRBNB',pax:2,status:'CONFIRMED',notes:''};
    let saved;
    await check('Atomic create persists tax snapshot and POS commission',async () => {
      saved = must(await client.rpc('save_booking_finance',{p_booking:booking,p_input:input}));
      assert.equal(Number(saved.gross_amount),13644); assert.equal(Number(saved.cleaning_fee),1100);
      assert.deepStrictEqual(saved.financial_details.result,Finance.calculate(input));
      assert.equal(Number(must(await client.from('booking_payment_commissions').select('amount').eq('booking_id',saved.id).single()).amount),100);
    });
    await check('Edit/reload preserves values; new settings do not mutate snapshot',async () => {
      must(await client.from('tenant_settings').upsert({tenant_id:tenant,key:'booking_tax_profiles',value:[{...profile,vat:{...profile.vat,rate:90}}]}));
      saved = must(await client.rpc('save_booking_finance',{p_booking:booking,p_input:saved.financial_details.input,p_booking_id:saved.id}));
      assert.equal(saved.financial_details.result.vat,1220);
    });
    await check('Server reports exclude tax and commission never lowers ADR base',async () => {
      const r = must(await client.rpc('compute_month_close_snapshot',{p_tenant_id:tenant,p_year:2031,p_month:1}));
      assert.equal(Number(r.roomRevenue),11200); assert.equal(Number(r.cleaningRevenue),1000); assert.equal(Number(r.adr),2800);
      const e = must(await client.rpc('get_executive_dashboard_snapshot',{p_tenant_id:tenant,p_target_month:'2031-01'}));
      assert.equal(Number(e.room_revenue),11200); assert.equal(Number(e.total_revenue),12200);
    });
    await check('Expense transfer is idempotent and included exactly once in ledger',async () => {
      const args = {p_booking_id:saved.id,p_tenant_id:tenant,p_date:'2031-01-05'};
      assert.equal(must(await client.rpc('post_booking_extra_expenses',args)),2);
      assert.equal(must(await client.rpc('post_booking_extra_expenses',args)),0);
      const r = must(await client.rpc('compute_month_close_snapshot',{p_tenant_id:tenant,p_year:2031,p_month:1}));
      assert.equal(Number(r.manualOpex),400); assert.equal(Number(r.totalOpex),2000);
    });
    await check('Posted expense cannot be silently removed or repriced in reservation',async () => {
      const r = await client.rpc('save_booking_finance',{p_booking:booking,p_input:{...input,extras:[]},p_booking_id:saved.id});
      assert(r.error); assert.match(r.error.message,/POSTED_EXPENSE_CHANGED/);
    });
    await check('Older client cannot invalidate a tax snapshot',async () => {
      const r = await client.from('bookings').update({gross_amount:10}).eq('id',saved.id); assert(r.error);
      assert.equal(Number(must(await client.from('bookings').select('gross_amount').eq('id',saved.id).single()).gross_amount),13644);
    });
    await check('Anonymous access and foreign-tenant writes are rejected',async () => {
      assert((await anon.rpc('save_booking_finance',{p_booking:booking,p_input:input})).error);
      assert((await client.rpc('save_booking_finance',{p_booking:{...booking,tenant_id:'00000000-0000-4000-8000-000000000001'},p_input:input})).error);
    });
    await check('Viewer cannot save finance or transfer expenses',async () => {
      const email = `finance_viewer_${stamp}@lexbnb-e2e.test`;
      viewerUser = must(await admin.auth.admin.createUser({email,password,email_confirm:true})).user.id;
      must(await admin.from('tenant_members').insert({tenant_id:tenant,user_id:viewerUser,role:'viewer'}));
      const viewer = createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,options);
      must(await viewer.auth.signInWithPassword({email,password}));
      try {
        assert((await viewer.rpc('save_booking_finance',{p_booking:booking,p_input:input,p_booking_id:saved.id})).error);
        assert((await viewer.rpc('post_booking_extra_expenses',{p_booking_id:saved.id,p_tenant_id:tenant,p_date:'2031-01-05'})).error);
      } finally {
        await viewer.auth.signOut();
      }
    });
    await check('Closed period blocks snapshot changes without changing saved data',async () => {
      must(await admin.from('monthly_financial_closes').insert({tenant_id:tenant,year:2031,month:1,status:'CLOSED',closed_at:new Date().toISOString()}));
      const r = await client.rpc('save_booking_finance',{p_booking:booking,p_input:{...input,cleanCost:600},p_booking_id:saved.id});
      assert(r.error); assert.match(r.error.message,/CLOSED_PERIOD/);
      assert.equal(must(await client.from('bookings').select('financial_details').eq('id',saved.id).single()).financial_details.result.cleanCost,500);
    });
  } catch(e) { console.error('[FAIL] '+e.message); process.exitCode=1; }
  finally {
    if (tenant) { const r=await admin.from('tenants').delete().eq('id',tenant); if(r.error) { console.error('Cleanup tenant: '+r.error.message); process.exitCode=1; } }
    if (user) { const r=await admin.auth.admin.deleteUser(user); if(r.error) { console.error('Cleanup user: '+r.error.message); process.exitCode=1; } }
    if (viewerUser) { const r=await admin.auth.admin.deleteUser(viewerUser); if(r.error) { console.error('Cleanup viewer: '+r.error.message); process.exitCode=1; } }
    await client.auth.signOut();
    console.log(`${passed} live checks passed; ${process.exitCode ? 'FAILED' : 'OK'}`);
  }
})();
