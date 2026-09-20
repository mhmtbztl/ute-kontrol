const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase30_booking_channel_settings.sql'), 'utf8');

assert(/CREATE TABLE IF NOT EXISTS public\.tenant_booking_channels/i.test(sql));
assert(/UNIQUE \(tenant_id, code\)/i.test(sql));
assert(/default_commission_rate NUMERIC\(5,2\)/i.test(sql));
assert(/channel_type IN \('OTA', 'DIRECT'\)/i.test(sql));
assert(/uq_tenant_booking_channel_name[\s\S]*lower\(display_name\)/i.test(sql));
console.log('[PASS] Kanal kataloğu tenant kapsamında, oran ve tür kısıtlarıyla tanımlı');

assert(/CREATE POLICY "tenant_booking_channels_select"/i.test(sql));
assert(/get_tenant_role\(tenant_id\) IS NOT NULL/i.test(sql));
assert(/REVOKE ALL ON TABLE public\.tenant_booking_channels FROM anon/i.test(sql));
assert(/REVOKE ALL ON TABLE public\.tenant_booking_channels FROM authenticated/i.test(sql));
assert(/GRANT SELECT ON TABLE public\.tenant_booking_channels TO authenticated/i.test(sql));
console.log('[PASS] Tenant RLS uygulanır ve doğrudan istemci yazması kapalıdır');

assert(/CREATE OR REPLACE FUNCTION public\.save_tenant_booking_channel/i.test(sql));
assert(/v_role IS NULL OR v_role NOT IN \('owner', 'admin', 'manager'\)/i.test(sql));
assert(sql.indexOf('v_role IS NULL OR v_role NOT IN') < sql.indexOf('WHERE tenant_id = p_tenant_id AND id = p_channel_id'));
assert(/FOR UPDATE/i.test(sql));
assert(/FROM anon/i.test(sql));
console.log('[PASS] Kanal RPC yetkiyi kayıttan önce doğrular, satırı kilitler ve anon erişimini reddeder');

assert(/channel_type = CASE WHEN is_system THEN channel_type ELSE v_type END/i.test(sql));
assert(/WHEN is_system AND channel_type = 'DIRECT' THEN 0/i.test(sql));
console.log('[PASS] Sistem kanallarının türü ve direkt kanal sıfır komisyon kuralı RPC katmanında korunur');

assert(/AFTER INSERT ON public\.tenants/i.test(sql));
assert(/PERFORM public\.seed_tenant_booking_channels\(NEW\.id\)/i.test(sql));
assert(/ON CONFLICT \(tenant_id, code\) DO NOTHING/i.test(sql));
console.log('[PASS] Mevcut ve yeni tenantlar için tekrar çalıştırılabilir varsayılan kanal kurulumu vardır');

assert(/is_active BOOLEAN NOT NULL DEFAULT TRUE/i.test(sql));
assert(!/DELETE FROM public\.tenant_booking_channels/i.test(sql));
assert(/ON DELETE CASCADE/i.test(sql));
console.log('[PASS] Kanal kaldırma geçmiş rezervasyonları silmeden pasifleştirme olarak modellenir');

assert(/PHASE30_CHANNEL_TABLE_MISSING/i.test(sql));
assert(/PHASE30_DIRECT_CLIENT_WRITE_GRANT_PRESENT/i.test(sql));
assert(/PHASE30_ANON_RPC_EXECUTE_PRESENT/i.test(sql));
console.log('[PASS] Göç kendi tablo, RLS, yazma ve anonim yetki doğrulamalarını içerir');

console.log('TEST SUMMARY: 7 / 7 TESTS PASSED (0 FAILED)');
