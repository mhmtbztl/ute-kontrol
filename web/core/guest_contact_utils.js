// =============================================================================
// LEXBNB PHASE 10 — GUEST CONTACT UTILITIES & NORMALIZATION
// Phone (E.164), Email normalization, and Candidate Deduplication Warning
// =============================================================================

/**
 * Normalizes phone numbers to E.164 format.
 * Defaults to Turkish +90 if 10-digit 5XX or 11-digit 05XX is provided.
 * @param {string} rawPhone
 * @param {string} defaultCountryCode 'TR'
 * @returns {{ valid: boolean, normalized: string, raw: string, error?: string }}
 */
function normalizePhone(rawPhone, defaultCountryCode = 'TR') {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { valid: false, normalized: '', raw: rawPhone || '', error: 'EMPTY_PHONE' };
  }

  const raw = rawPhone.trim();
  // Remove spaces, parentheses, hyphens, dots
  let digits = raw.replace(/[\s\(\)\-\.]/g, '');

  if (digits.startsWith('+')) {
    const withoutPlus = digits.substring(1);
    if (/^[1-9]\d{6,14}$/.test(withoutPlus)) {
      return { valid: true, normalized: digits, raw };
    }
    return { valid: false, normalized: digits, raw, error: 'INVALID_E164' };
  }

  // Handle Turkish standard patterns
  if (defaultCountryCode === 'TR') {
    if (digits.startsWith('0090')) {
      digits = '+' + digits.substring(2);
    } else if (digits.startsWith('90') && digits.length === 12) {
      digits = '+' + digits;
    } else if (digits.startsWith('0') && digits.length === 11) {
      digits = '+9' + digits;
    } else if (digits.length === 10 && digits.startsWith('5')) {
      digits = '+90' + digits;
    }
  }

  if (/^\+[1-9]\d{6,14}$/.test(digits)) {
    return { valid: true, normalized: digits, raw };
  }

  return { valid: false, normalized: digits, raw, error: 'UNRECOGNIZED_FORMAT' };
}

/**
 * Normalizes email address by trimming and lowercasing.
 * @param {string} rawEmail
 * @returns {{ valid: boolean, normalized: string, raw: string, error?: string }}
 */
function normalizeEmail(rawEmail) {
  if (!rawEmail || typeof rawEmail !== 'string') {
    return { valid: false, normalized: '', raw: rawEmail || '', error: 'EMPTY_EMAIL' };
  }

  const normalized = rawEmail.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid = emailRegex.test(normalized);

  return {
    valid,
    normalized,
    raw: rawEmail.trim(),
    error: valid ? undefined : 'INVALID_EMAIL_FORMAT'
  };
}

/**
 * Identifies duplicate guest candidates within the same tenant.
 * Does NOT merge automatically — returns non-destructive warnings.
 * @param {Object} newGuest - { phone, email, tenant_id }
 * @param {Array<Object>} existingGuests - Array of guest records
 * @returns {{ hasWarning: boolean, candidates: Array<Object> }}
 */
function detectDuplicateCandidates(newGuest, existingGuests = []) {
  if (!newGuest || !Array.isArray(existingGuests)) {
    return { hasWarning: false, candidates: [] };
  }

  const newPhoneNorm = newGuest.phone ? normalizePhone(newGuest.phone).normalized : '';
  const newEmailNorm = newGuest.email ? normalizeEmail(newGuest.email).normalized : '';
  const tenantId = newGuest.tenant_id;

  const candidates = [];

  for (const guest of existingGuests) {
    // Cross-tenant guests must never be matched or merged
    if (tenantId && guest.tenant_id && guest.tenant_id !== tenantId) {
      continue;
    }
    // Skip self
    if (newGuest.id && guest.id === newGuest.id) {
      continue;
    }

    let matchReason = null;
    let matchValue = null;

    if (newPhoneNorm && guest.phone) {
      const gPhoneNorm = normalizePhone(guest.phone).normalized;
      if (gPhoneNorm && gPhoneNorm === newPhoneNorm) {
        matchReason = 'PHONE_MATCH';
        matchValue = newPhoneNorm;
      }
    }

    if (!matchReason && newEmailNorm && guest.email) {
      const gEmailNorm = normalizeEmail(guest.email).normalized;
      if (gEmailNorm && gEmailNorm === newEmailNorm) {
        matchReason = 'EMAIL_MATCH';
        matchValue = newEmailNorm;
      }
    }

    if (matchReason) {
      candidates.push({
        guestId: guest.id,
        firstName: guest.first_name,
        lastName: guest.last_name,
        matchReason,
        matchValue
      });
    }
  }

  return {
    hasWarning: candidates.length > 0,
    candidates
  };
}

module.exports = {
  normalizePhone,
  normalizeEmail,
  detectDuplicateCandidates
};
