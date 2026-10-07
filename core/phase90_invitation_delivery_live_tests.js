'use strict';

/**
 * PHASE 90 — DAVET TESLIM KUYRUGU CANLI DAVRANIS TESTI
 *
 * Yalniz ayri Supabase test projesinde calisir. Bekleyen ayni davetin tekrar
 * gonderilmesi, daha once SENT olan outbox satirini yeniden PENDING yapmali;
 * service-role worker da o isi tekrar sahiplenebilmelidir.
 */

const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function anonClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function run() {
  const stamp = Date.now();
  const ownerEmail = `phase90_owner_${stamp}@lexbnb-e2e.test`;
  const inviteEmail = `phase90_invite_${stamp}@lexbnb-e2e.test`;
  const password = `Phase90!${stamp}`;
  let ownerId = null;
  let tenantId = null;
  let owner = null;

  try {
    const created = must(await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Phase 90 Owner' }
    }), 'owner olusturma');
    ownerId = created.user.id;
    owner = anonClient();
    must(await owner.auth.signInWithPassword({ email: ownerEmail, password }), 'owner girisi');
    const tenant = must(await owner.rpc('create_tenant_and_owner', {
      p_company_name: 'Phase 90 Davet Testi',
      p_full_name: 'Phase 90 Owner'
    }), 'tenant olusturma');
    tenantId = tenant.tenant_id;

    const first = must(await owner.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId,
      p_email: inviteEmail,
      p_role: 'manager'
    }), 'ilk davet');
    const firstJob = must(await admin.from('invitation_delivery_outbox')
      .select('id,status,attempts')
      .eq('invitation_id', first.invitation_id)
      .single(), 'ilk outbox');
    if (firstJob.status !== 'PENDING') throw new Error(`ilk outbox PENDING degil: ${firstJob.status}`);

    must(await admin.from('invitation_delivery_outbox')
      .update({ status: 'SENT', sent_at: new Date().toISOString(), last_error: null })
      .eq('id', firstJob.id), 'SENT simulasyonu');

    const second = must(await owner.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId,
      p_email: inviteEmail,
      p_role: 'admin'
    }), 'tekrar davet');
    if (second.invitation_id !== first.invitation_id) throw new Error('tekrar davet yeni satir olusturdu');

    const resetJob = must(await admin.from('invitation_delivery_outbox')
      .select('id,status,attempts,sent_at,last_error')
      .eq('invitation_id', first.invitation_id)
      .single(), 'yenilenen outbox');
    if (resetJob.status !== 'PENDING' || resetJob.attempts !== 0 || resetJob.sent_at !== null) {
      throw new Error(`tekrar davet kuyrugu sifirlamadi: ${JSON.stringify(resetJob)}`);
    }

    const claimed = must(await admin.rpc('claim_invitation_deliveries', { p_limit: 20 }), 'kuyruk sahiplenme');
    if (!(claimed || []).some(job => job.id === firstJob.id && job.status === 'PROCESSING')) {
      throw new Error(`tekrar davet worker tarafindan sahiplenilemedi: ${JSON.stringify(claimed)}`);
    }

    console.log('[PASS] phase90 tekrar daveti kuyruga geri alir ve worker sahiplenir');
  } finally {
    if (owner) await owner.auth.signOut().catch(() => {});
    if (tenantId) {
      const result = await admin.from('tenants').delete().eq('id', tenantId);
      if (result.error) console.error('[FAIL] tenant temizligi:', result.error.message);
    }
    if (ownerId) {
      const result = await admin.auth.admin.deleteUser(ownerId);
      if (result.error) console.error('[FAIL] owner temizligi:', result.error.message);
    }
  }
}

run().catch(error => {
  console.error('[FAIL] phase90 davet teslim testi:', error.message || error);
  process.exit(1);
});
