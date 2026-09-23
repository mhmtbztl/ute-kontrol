const { createClient } = require('@supabase/supabase-js');
const { runOrphanCleanup } = require('../core/storage_orphan_cleanup.js');

// Hesap kapatma ve veri sifirlama tablo satirlarini siler; depodaki mulk
// fotograflari SQL'den silinemez. Bu worker sahibi kalmamis klasorleri siler
// (core/storage_orphan_cleanup.js). `--dry-run` yalnizca raporlar.

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function main() {
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const result = await runOrphanCleanup(client, { dryRun: process.argv.includes('--dry-run') });
  console.log(JSON.stringify({
    dryRun: result.dryRun,
    orphanPrefixes: result.prefixes.length,
    removedFiles: result.removed,
    byReason: result.prefixes.reduce((acc, p) => { acc[p.reason] = (acc[p.reason] || 0) + 1; return acc; }, {})
  }));
}

main().catch(error => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
