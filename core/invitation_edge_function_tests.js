'use strict';

/**
 * M4 — EKIP DAVETI ANLIK TESLIM AGI
 *
 * GitHub schedule daveti 6,5 saat kuyrukta bekletti. Bu test, tarayicidan
 * gelen yetkili istegin daveti olusturup ilgili outbox satirini sahiplenerek
 * e-postayi ayni istekte teslim ettigini olcer. Edge JWT kapisi Deno
 * calisma zamanina ait oldugu icin en alttaki dar kaynak sozlesmesiyle
 * ayrica kilitlenir; teslim orkestrasyonu gercek kodla davranissal olculur.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');

async function run() {
  const sharedPath = path.join(ROOT, 'supabase', 'functions', '_shared', 'invitation_delivery.mjs');
  const shared = await import(pathToFileURL(sharedPath).href);
  assert.strictEqual(typeof shared.processInvitationDelivery, 'function', 'Teslim orkestrasyonu disari acilmali');

  const calls = [];
  const deps = {
    createInvitation: async input => {
      calls.push(['create', input]);
      return { invitation_id: 'inv-1', email: input.email, role: input.role };
    },
    claimDelivery: async invitationId => {
      calls.push(['claim', invitationId]);
      return { id: 'job-1', email: 'yonetici@ornek.com', attempts: 1 };
    },
    deliver: async job => {
      calls.push(['deliver', job.id]);
      return { ok: true, channel: 'invite' };
    },
    markSent: async (jobId, channel) => calls.push(['sent', jobId, channel]),
    markFailed: async () => { throw new Error('Basarili teslim FAILED olmamali'); }
  };

  const sent = await shared.processInvitationDelivery({
    tenantId: '00000000-0000-4000-8000-000000000001',
    email: ' YONETICI@ORNEK.COM ',
    role: 'admin'
  }, deps);
  assert.strictEqual(sent.delivery, 'sent');
  assert.strictEqual(sent.channel, 'invite');
  assert.deepStrictEqual(calls, [
    ['create', { tenantId: '00000000-0000-4000-8000-000000000001', email: 'yonetici@ornek.com', role: 'admin' }],
    ['claim', 'inv-1'],
    ['deliver', 'job-1'],
    ['sent', 'job-1', 'invite']
  ]);

  let delivered = false;
  const queued = await shared.processInvitationDelivery({
    tenantId: '00000000-0000-4000-8000-000000000001',
    email: 'kuyruk@ornek.com',
    role: 'manager'
  }, {
    createInvitation: async input => ({ invitation_id: 'inv-2', ...input }),
    claimDelivery: async () => null,
    deliver: async () => { delivered = true; return { ok: true, channel: 'invite' }; },
    markSent: async () => {},
    markFailed: async () => {}
  });
  assert.strictEqual(queued.delivery, 'queued');
  assert.strictEqual(delivered, false, 'Baska worker sahiplenmisse ikinci e-posta gitmemeli');

  let failedJob = null;
  const failed = await shared.processInvitationDelivery({
    tenantId: '00000000-0000-4000-8000-000000000001',
    email: 'gecici-hata@ornek.com',
    role: 'viewer'
  }, {
    createInvitation: async input => ({ invitation_id: 'inv-3', ...input }),
    claimDelivery: async () => ({ id: 'job-3', email: 'gecici-hata@ornek.com', attempts: 1 }),
    deliver: async () => ({ ok: false, error: { message: 'SMTP gecici olarak kullanilamiyor' } }),
    markSent: async () => { throw new Error('Basarisiz teslim SENT olmamali'); },
    markFailed: async (jobId, message) => { failedJob = { jobId, message }; }
  });
  assert.strictEqual(failed.delivery, 'queued');
  assert.deepStrictEqual(failedJob, { jobId: 'job-3', message: 'SMTP gecici olarak kullanilamiyor' });

  await assert.rejects(
    () => shared.processInvitationDelivery({ tenantId: 'x', email: 'bozuk', role: 'owner' }, deps),
    /INVALID_INVITATION_REQUEST/
  );

  const edgePath = path.join(ROOT, 'supabase', 'functions', 'send-tenant-invitation', 'index.ts');
  const configPath = path.join(ROOT, 'supabase', 'config.toml');
  const migrationPath = path.join(ROOT, 'supabase', 'migration_phase90_invitation_delivery.sql');
  const edge = fs.readFileSync(edgePath, 'utf8');
  const config = fs.readFileSync(configPath, 'utf8');
  const migration = fs.readFileSync(migrationPath, 'utf8');
  assert(/createSupabaseContext\(req,\s*\{\s*auth:\s*['"]user['"]\s*\}\)/.test(edge), 'Edge Function kullanici JWT kapisini kurmali');
  assert(/ctx\.supabaseAdmin/.test(edge) && /ctx\.supabase\.rpc\(['"]create_tenant_invitation['"]/.test(edge), 'Yetki RPC ile, e-posta admin istemcisiyle calismali');
  assert(!/Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/.test(edge), 'CORS joker olamaz');
  assert(/\[functions\.send-tenant-invitation\][\s\S]*verify_jwt\s*=\s*true/.test(config), 'Platform JWT dogrulamasi acik olmali');
  assert(/status\s*=\s*'PENDING'[\s\S]+WHERE tenant_id = p_tenant_id/.test(migration), 'Tekrar davet outbox tetikleyicisini uyandirmali');
  assert(/status = 'PROCESSING'[\s\S]+INTERVAL '15 minutes'/.test(migration), 'Yarim kalan PROCESSING isi lease sonrasinda kurtarilmali');
  assert(/REVOKE ALL ON FUNCTION public\.claim_invitation_deliveries\(INT\) FROM anon/.test(migration), 'Kuyruk claim RPC anon rolune kapali olmali');

  console.log('[PASS] M4 daveti yetkili Edge Function ile aninda teslim eder; kuyruk guvenli yedektir');
}

run().catch(error => {
  console.error('[FAIL] M4 davet Edge Function testi:', error.message || error);
  process.exit(1);
});
