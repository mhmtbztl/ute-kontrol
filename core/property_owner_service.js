(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PropertyOwnerService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  async function saveOwnerAndLink(client, input = {}) {
    if (!client || !input.tenantId || !input.propertyId) throw new Error('PROPERTY_OWNER_SCOPE_REQUIRED');
    let ownerId = input.ownerId || null;
    if (!ownerId) {
      const fullName = String(input.fullName || '').trim();
      if (!fullName) return { skipped: true };
      const { data, error } = await client.from('property_owners').insert({
        tenant_id: input.tenantId, full_name: fullName,
        phone: String(input.phone || '').trim() || null,
        email: String(input.email || '').trim() || null
      }).select('id').single();
      if (error) throw error;
      ownerId = data.id;
    }
    const removed = await client.from('property_owner_links').delete()
      .eq('tenant_id', input.tenantId).eq('property_id', input.propertyId);
    if (removed.error) throw removed.error;
    const { error: linkError } = await client.from('property_owner_links').insert({
      tenant_id: input.tenantId, property_id: input.propertyId, owner_id: ownerId
    });
    if (linkError) throw linkError;
    return { ownerId };
  }

  return { saveOwnerAndLink };
});
