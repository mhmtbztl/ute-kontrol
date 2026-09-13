// LEXBNB PHASE 17 — SAFE CLIENT ADAPTER FOR FINDING LIFECYCLE RPC
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingReviewService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ACTIONS = Object.freeze(['ACKNOWLEDGE', 'DISMISS', 'RESOLVE', 'ACCEPT_TASK']);
  const PHYSICAL_ACTIONS = Object.freeze(['RESHOOT', 'ON_SITE_CONTENT']);

  function normalize(value) { return String(value || '').trim().toUpperCase(); }

  function validateReview(input = {}) {
    const findingId = String(input.findingId || '');
    const action = normalize(input.action);
    const reason = input.reason === undefined || input.reason === null ? null : String(input.reason).trim();
    if (!UUID_RE.test(findingId)) throw new Error('VALID_FINDING_ID_REQUIRED');
    if (!ACTIONS.includes(action)) throw new Error('INVALID_REVIEW_ACTION');
    if (action === 'DISMISS' && !reason) throw new Error('DISMISS_REASON_REQUIRED');
    if (action === 'ACCEPT_TASK') {
      const finding = input.finding || {};
      const actionKind = normalize(finding.actionKind || finding.action_kind);
      if (!PHYSICAL_ACTIONS.includes(actionKind)) throw new Error('NON_PHYSICAL_FINDING_CANNOT_CREATE_TASK');
    }
    return { findingId, action, reason };
  }

  async function reviewFinding(client, input = {}) {
    if (!client || typeof client.rpc !== 'function') throw new Error('SUPABASE_CLIENT_REQUIRED');
    const payload = validateReview(input);
    const { data, error } = await client.rpc('review_marketing_finding', {
      p_finding_id: payload.findingId,
      p_action: payload.action,
      p_reason: payload.reason
    });
    if (error) throw error;
    return data;
  }

  return { ACTIONS, PHYSICAL_ACTIONS, validateReview, reviewFinding };
}));
