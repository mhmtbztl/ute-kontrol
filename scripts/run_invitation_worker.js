const { createClient } = require('@supabase/supabase-js');

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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
  for (const job of jobs || []) {
    const result = await client.auth.admin.inviteUserByEmail(job.email, { redirectTo });
    if (result.error) {
      const delayMinutes = Math.min(60, 2 ** Number(job.attempts || 1));
      const failed = await client.from('invitation_delivery_outbox').update({
        status: 'FAILED', last_error: String(result.error.message || 'DELIVERY_FAILED').slice(0, 500),
        available_at: new Date(Date.now() + delayMinutes * 60000).toISOString()
      }).eq('id', job.id);
      if (failed.error) throw failed.error;
    } else {
      const sent = await client.from('invitation_delivery_outbox').update({
        status: 'SENT', sent_at: new Date().toISOString(), last_error: null
      }).eq('id', job.id);
      if (sent.error) throw sent.error;
    }
  }
  process.stdout.write(`${JSON.stringify({ claimed: (jobs || []).length })}\n`);
}

main().catch(err => { console.error(err.message || err); process.exitCode = 1; });
