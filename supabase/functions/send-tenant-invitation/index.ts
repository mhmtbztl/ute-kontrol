import { createSupabaseContext } from 'npm:@supabase/server@1';
import { deliverInvitation, processInvitationDelivery } from '../_shared/invitation_delivery.mjs';

const ALLOWED_ORIGINS = new Set([
  'https://lexbnb.space',
  'https://www.lexbnb.space',
  'http://127.0.0.1',
  'http://localhost'
]);

function allowedOrigin(rawOrigin: string | null) {
  if (!rawOrigin) return null;
  try {
    const url = new URL(rawOrigin);
    const base = `${url.protocol}//${url.hostname}`;
    return ALLOWED_ORIGINS.has(base) ? rawOrigin : null;
  } catch (_error) {
    return null;
  }
}

function response(origin: string | null, body: Record<string, unknown>, status = 200) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Vary': 'Origin'
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  const origin = allowedOrigin(requestOrigin);
  if (requestOrigin && !origin) return response(null, { code: 'ORIGIN_NOT_ALLOWED' }, 403);
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || 'https://lexbnb.space',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
      }
    });
  }
  if (req.method !== 'POST') return response(origin, { code: 'METHOD_NOT_ALLOWED' }, 405);

  const { data: ctx, error: authError } = await createSupabaseContext(req, { auth: 'user' });
  if (authError || !ctx) return response(origin, { code: 'UNAUTHORIZED' }, authError?.status || 401);

  let input: unknown;
  try {
    input = await req.json();
  } catch (_error) {
    return response(origin, { code: 'INVALID_JSON' }, 400);
  }

  const redirectTo = Deno.env.get('LEXBNB_PUBLIC_URL') || 'https://lexbnb.space';
  try {
    const result = await processInvitationDelivery(input, {
      createInvitation: async ({ tenantId, email, role }) => {
        const { data, error } = await ctx.supabase.rpc('create_tenant_invitation', {
          p_tenant_id: tenantId,
          p_email: email,
          p_role: role
        });
        if (error) throw new Error(`INVITATION_REJECTED:${error.message}`);
        return data;
      },
      claimDelivery: async (invitationId: string) => {
        const now = new Date().toISOString();
        const { data: pending, error: readError } = await ctx.supabaseAdmin
          .from('invitation_delivery_outbox')
          .select('id,email,status,attempts')
          .eq('invitation_id', invitationId)
          .in('status', ['PENDING', 'FAILED'])
          .lte('available_at', now)
          .maybeSingle();
        if (readError) throw readError;
        if (!pending) return null;
        const { data: claimed, error: claimError } = await ctx.supabaseAdmin
          .from('invitation_delivery_outbox')
          .update({ status: 'PROCESSING', attempts: Number(pending.attempts || 0) + 1 })
          .eq('id', pending.id)
          .eq('status', pending.status)
          .select('id,email,attempts')
          .maybeSingle();
        if (claimError) throw claimError;
        return claimed;
      },
      deliver: job => deliverInvitation(ctx.supabaseAdmin, job, redirectTo),
      markSent: async (jobId: string) => {
        const { error } = await ctx.supabaseAdmin
          .from('invitation_delivery_outbox')
          .update({ status: 'SENT', sent_at: new Date().toISOString(), last_error: null })
          .eq('id', jobId);
        if (error) throw error;
      },
      markFailed: async (jobId: string, message: string) => {
        const availableAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        const { error } = await ctx.supabaseAdmin
          .from('invitation_delivery_outbox')
          .update({ status: 'FAILED', last_error: message, available_at: availableAt })
          .eq('id', jobId);
        if (error) throw error;
      }
    });
    return response(origin, result);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (message === 'INVALID_INVITATION_REQUEST') return response(origin, { code: message }, 422);
    if (message.startsWith('INVITATION_REJECTED:')) {
      return response(origin, { code: 'INVITATION_REJECTED', message: message.slice('INVITATION_REJECTED:'.length) }, 400);
    }
    console.error('send-tenant-invitation failed', { code: 'INVITATION_DELIVERY_INTERNAL' });
    return response(origin, { code: 'INVITATION_DELIVERY_INTERNAL' }, 500);
  }
});
