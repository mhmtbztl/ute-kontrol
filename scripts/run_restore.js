/**
 * LEXBNB — YEDEKTEN GERI YUKLEME (npm run restore)
 *
 *   npm run restore -- <yedek-klasoru> --env .env.test                 # tum yedek, test projesi
 *   npm run restore -- <yedek-klasoru> --env .env.test --tenant <uuid>  # tek isletme
 *   npm run restore -- <yedek-klasoru> --tenant <uuid> --confirm-production kirpcqklyjlrhvdbgdrq
 *
 * URETIM: yalnizca TEK ISLETME (--tenant) ve proje referansi yazilarak
 * (--confirm-production) hedeflenebilir. Tum yedegi uretime yuklemek bu
 * betikle mumkun degildir; felakette yedek yeni/bos bir projeye yuklenir.
 *
 * Var olan satira dokunulmaz; yalnizca eksik satirlar eklenir.
 * Ayrinti: docs/BACKUP_RESTORE.md
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const testEnv = require('../core/test_env.js');
const { restoreBackup } = require('../core/restore_engine.js');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

async function main() {
  const dir = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : null;
  if (!dir || !fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error('Kullanim: npm run restore -- <yedek-klasoru> [--env .env.test] [--tenant <uuid>]');
  const envFile = arg('--env') || '.env';
  const env = testEnv.readEnvFileUnguarded(envFile);
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const tenantId = arg('--tenant');
  const ref = testEnv.projectRefOf(new URL(url).hostname);

  if (testEnv.isProductionTarget(url)) {
    if (!tenantId) throw new Error('RESTORE_GUARD: uretime TUM yedek yuklenemez; --tenant <uuid> ile tek isletme secin.');
    if (arg('--confirm-production') !== ref) throw new Error(`RESTORE_GUARD: uretim hedefi icin --confirm-production ${ref} yazin.`);
  }

  const readJson = rel => {
    const p = path.join(dir, rel);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  const specRes = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Accept: 'application/openapi+json' } });
  if (!specRes.ok) throw new Error(`OPENAPI_READ_FAILED ${specRes.status}`);
  const spec = await specRes.json();
  const startedAt = new Date(new Date(specRes.headers.get('date')).getTime() - 1000);

  console.log(`Geri yukleme: ${dir} -> ${new URL(url).hostname}${tenantId ? ' (isletme ' + tenantId + ')' : ' (tum yedek)'}`);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const rapor = await restoreBackup({ client, spec, readJson, tenantId, startedAt, log: m => console.log(m) });

  const eklenen = Object.values(rapor.tables).reduce((s, t) => s + t.inserted, 0);
  console.log(`\n${eklenen} satir eklendi; kullanici: ${rapor.users.created} yeni, ${rapor.users.existing} zaten vardi; ` +
    `temizlenen yan etki: ${JSON.stringify(rapor.sideEffectsRemoved)}`);
  if (rapor.users.created) console.log('Yeniden acilan kullanicilarin sifresi yedekte yoktur: "Sifremi unuttum" ile yeni sifre belirlemeleri gerekir.');
  if (rapor.errors.length) {
    console.error(`\nGERI YUKLEME EKSIK — ${rapor.errors.length} hata:\n  ` + rapor.errors.join('\n  '));
    process.exit(1);
  }
}

main().catch(e => { console.error(e && e.message ? e.message : e); process.exit(1); });
