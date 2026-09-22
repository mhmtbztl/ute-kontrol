const { createClient } = require('@supabase/supabase-js');

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

// Davet edilen adresin Lexbnb hesabi zaten varsa `inviteUserByEmail` teslim
// etmez, "already registered" ile reddeder. Eskiden bu satir bes kez FAILED
// olup kuyrukta olup gidiyordu: baska bir isletmede hesabi olan birine davet
// e-postasi HIC gitmiyordu. Davetin kendisi yine de gecerliydi (girisinde
// accept_pending_invitations uyeligi acar), ama kisi bundan haberdar olmuyordu.
function isAlreadyRegistered(error) {
  if (!error) return false;
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return true;
  return /already (been )?registered|already exists/i.test(String(error.message || ''));
}

// Tek bir kuyruk isini teslim eder ve sonucu dondurur. Kuyruk satirini
// guncellemek cagiranin isidir; boylece bu fonksiyon sahte istemciyle
// cevrimdisi olculebilir (core/invitation_worker_tests.js).
async function deliverInvitation(client, job, redirectTo) {
  const invited = await client.auth.admin.inviteUserByEmail(job.email, { redirectTo });
  if (!invited.error) return { ok: true, channel: 'invite' };
  if (!isAlreadyRegistered(invited.error)) return { ok: false, error: invited.error };

  // Mevcut hesap: sifresi zaten var, yeni hesap acilmaz. Giris linki gider;
  // link ile gelindiginde handleAuthenticatedSession bekleyen daveti kabul eder.
  const linked = await client.auth.signInWithOtp({
    email: job.email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo }
  });
  if (!linked.error) return { ok: true, channel: 'magiclink' };
  return { ok: false, error: linked.error };
}

async function main() {
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const redirectTo = required('LEXBNB_PUBLIC_URL');
  const { data: jobs, error } = await client.rpc('claim_invitation_deliveries', {
    p_limit: Number(process.env.INVITATION_DELIVERY_LIMIT || 20)
  });
  if (error) throw error;
  const channels = { invite: 0, magiclink: 0, failed: 0 };
  for (const job of jobs || []) {
    const result = await deliverInvitation(client, job, redirectTo);
    if (!result.ok) {
      channels.failed++;
      const delayMinutes = Math.min(60, 2 ** Number(job.attempts || 1));
      const failed = await client.from('invitation_delivery_outbox').update({
        status: 'FAILED', last_error: String(result.error.message || 'DELIVERY_FAILED').slice(0, 500),
        available_at: new Date(Date.now() + delayMinutes * 60000).toISOString()
      }).eq('id', job.id);
      if (failed.error) throw failed.error;
    } else {
      channels[result.channel]++;
      const sent = await client.from('invitation_delivery_outbox').update({
        status: 'SENT', sent_at: new Date().toISOString(), last_error: null
      }).eq('id', job.id);
      if (sent.error) throw sent.error;
    }
  }
  process.stdout.write(`${JSON.stringify({ claimed: (jobs || []).length, ...channels })}\n`);
}

if (require.main === module) {
  main().catch(err => { console.error(err.message || err); process.exitCode = 1; });
}

module.exports = { deliverInvitation, isAlreadyRegistered };
