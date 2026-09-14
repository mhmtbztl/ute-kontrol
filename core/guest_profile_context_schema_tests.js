const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase28_guest_profile_context.sql'), 'utf8');

assert(/ADD COLUMN IF NOT EXISTS preferences TEXT/i.test(sql));
assert(/ADD COLUMN IF NOT EXISTS internal_notes TEXT/i.test(sql));
assert(/ADD COLUMN IF NOT EXISTS tags TEXT\[\]/i.test(sql));
console.log('[PASS] Misafir tercihleri, ekip notu ve etiketleri yeni ve değişmez bir göçte tanımlı');

assert(/CREATE TABLE IF NOT EXISTS public\.guest_consent_events/i.test(sql));
assert(/marketing_opt_in BOOLEAN NOT NULL/i.test(sql));
assert(/recorded_by UUID REFERENCES auth\.users/i.test(sql));
assert(/recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/i.test(sql));
console.log('[PASS] Kampanya izni değişiklikleri zaman ve kullanıcıyla denetlenebilir olay defterine yazılır');

assert(/AFTER INSERT OR UPDATE OF marketing_opt_in ON public\.guests/i.test(sql));
assert(/NEW\.marketing_opt_in IS DISTINCT FROM OLD\.marketing_opt_in/i.test(sql));
assert(/INSERT INTO public\.guest_consent_events/i.test(sql));
console.log('[PASS] İzin açma ve geri çekme değişiklikleri tetikleyiciyle otomatik kaydedilir');

assert(/ENABLE ROW LEVEL SECURITY/i.test(sql));
assert(/get_tenant_role\(tenant_id\) IS NOT NULL/i.test(sql));
assert(/REVOKE ALL ON TABLE public\.guest_consent_events FROM anon/i.test(sql));
assert(/REVOKE ALL ON TABLE public\.guest_consent_events FROM authenticated/i.test(sql));
assert(/GRANT SELECT ON TABLE public\.guest_consent_events TO authenticated/i.test(sql));
console.log('[PASS] İzin geçmişi tenant RLS ile okunur; istemciden değiştirilemez ve anon erişemez');

assert(/guest_id UUID NOT NULL REFERENCES public\.guests\(id\) ON DELETE CASCADE/i.test(sql));
assert(/tenant_id UUID NOT NULL REFERENCES public\.tenants\(id\) ON DELETE CASCADE/i.test(sql));
console.log('[PASS] Veri sıfırlama ve hesap kapatma guest/tenant cascade zincirini kilitlemez');

assert(/PHASE28_GUEST_CONTEXT_COLUMNS_MISSING/i.test(sql));
assert(/PHASE28_CONSENT_TRIGGER_MISSING/i.test(sql));
assert(/PHASE28_ANON_CONSENT_GRANT_PRESENT/i.test(sql));
console.log('[PASS] Göç kendi kolon, tetikleyici, RLS ve anon yetki doğrulamasını içerir');

console.log('TEST SUMMARY: 6 / 6 TESTS PASSED (0 FAILED)');
