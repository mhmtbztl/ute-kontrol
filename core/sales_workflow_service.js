(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SalesWorkflowService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  async function saveWorkflow(client, input = {}) {
    if (!client || !input.tenantId || !input.leadId) throw new Error('LEAD_WORKFLOW_SCOPE_REQUIRED');
    const { data, error } = await client.from('lead_workflow').upsert({
      tenant_id: input.tenantId, lead_id: input.leadId,
      assigned_to: input.assignedTo || null, next_follow_up_at: input.nextFollowUpAt || null
    }, { onConflict: 'lead_id' }).select().single();
    if (error) throw error;
    return data;
  }

  async function bumpInterest(client, input = {}) {
    if (!client || !input.tenantId || !input.day || !input.sourceId || !input.channel) throw new Error('LEAD_INTEREST_INPUT_REQUIRED');
    const { data, error } = await client.rpc('bump_lead_interest', {
      p_tenant_id: input.tenantId, p_day: input.day, p_source_id: input.sourceId,
      p_channel: input.channel, p_delta: Number(input.delta) === -1 ? -1 : 1
    });
    if (error) throw error;
    return data;
  }

  async function createSource(client, input = {}) {
    const label = String(input.label || '').trim();
    if (!client || !input.tenantId || !label) throw new Error('LEAD_SOURCE_INPUT_REQUIRED');
    const code = label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    if (!code || code === 'UNKNOWN') throw new Error('LEAD_SOURCE_CODE_INVALID');
    const { data, error } = await client.from('lead_source_catalog').insert({
      tenant_id: input.tenantId, code, label, is_system: false, is_active: true
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function saveClassification(client, input = {}) {
    if (!client || !input.tenantId || !input.guestId) throw new Error('GUEST_CLASSIFICATION_SCOPE_REQUIRED');
    if (!input.listType) {
      const result = await client.from('guest_private_classifications').delete()
        .eq('tenant_id', input.tenantId).eq('guest_id', input.guestId);
      if (result.error) throw result.error;
      return null;
    }
    const reason = String(input.reason || '').trim();
    if (!['WHITE', 'BLACK'].includes(input.listType) || reason.length < 3 || reason.length > 500) throw new Error('GUEST_CLASSIFICATION_REASON_REQUIRED');
    const { data, error } = await client.from('guest_private_classifications').upsert({
      tenant_id: input.tenantId, guest_id: input.guestId, list_type: input.listType,
      reason, incident_on: input.incidentOn || null
    }, { onConflict: 'guest_id' }).select().single();
    if (error) throw error;
    return data;
  }

  function buildWhatsAppLink(input = {}) {
    if (!input.allowWhatsapp) return { allowed: false, reason: 'WHATSAPP_NOT_ALLOWED' };
    if (input.messageType === 'MARKETING' && input.marketingOptIn !== true) return { allowed: false, reason: 'MARKETING_CONSENT_REQUIRED' };
    const phone = String(input.phone || '').replace(/\D/g, '');
    const body = String(input.body || '').trim();
    if (!phone || !body) return { allowed: false, reason: 'RECIPIENT_OR_BODY_MISSING' };
    return { allowed: true, url: `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(body)}` };
  }

  return { saveWorkflow, bumpInterest, createSource, saveClassification, buildWhatsAppLink };
});
