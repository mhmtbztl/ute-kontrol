const INVITATION_ROLES = new Set(['admin', 'manager', 'sales', 'staff', 'viewer']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeInvitationRequest(input) {
  const tenantId = String(input?.tenantId || '').trim();
  const email = String(input?.email || '').trim().toLowerCase();
  const role = String(input?.role || '').trim().toLowerCase();
  if (!UUID_RE.test(tenantId) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !INVITATION_ROLES.has(role)) {
    throw new Error('INVALID_INVITATION_REQUEST');
  }
  return { tenantId, email, role };
}

export function isAlreadyRegistered(error) {
  if (!error) return false;
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return true;
  return /already (been )?registered|already exists/i.test(String(error.message || ''));
}

export async function deliverInvitation(client, job, redirectTo) {
  const invited = await client.auth.admin.inviteUserByEmail(job.email, { redirectTo });
  if (!invited.error) return { ok: true, channel: 'invite' };
  if (!isAlreadyRegistered(invited.error)) return { ok: false, error: invited.error };

  const linked = await client.auth.signInWithOtp({
    email: job.email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo }
  });
  if (!linked.error) return { ok: true, channel: 'magiclink' };
  return { ok: false, error: linked.error };
}

export async function processInvitationDelivery(input, deps) {
  const request = normalizeInvitationRequest(input);
  const invitation = await deps.createInvitation(request);
  const invitationId = invitation?.invitation_id;
  if (!invitationId) throw new Error('INVITATION_CREATE_FAILED');

  const job = await deps.claimDelivery(invitationId);
  if (!job) return { invitation, delivery: 'queued' };

  const result = await deps.deliver(job);
  if (result?.ok) {
    await deps.markSent(job.id, result.channel);
    return { invitation, delivery: 'sent', channel: result.channel };
  }

  const message = String(result?.error?.message || 'DELIVERY_FAILED').slice(0, 500);
  await deps.markFailed(job.id, message);
  return { invitation, delivery: 'queued' };
}
