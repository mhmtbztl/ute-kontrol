/**
 * LEXBNB — VERITABANI YEDEGI (npm run backup)
 *
 *   npm run backup                          # uretim (.env), dosya listesi
 *   npm run backup -- --with-storage        # fotograflari da indir
 *   npm run backup -- --env .env.test       # test projesi
 *
 * Yedek MUSTERI VERISI icerir (misafir adlari, telefonlar, e-postalar).
 * Varsayilan hedef deponun DISINDADIR: <Masaustu>\lexbnb-yedekler\<tarih>.
 * LEXBNB_BACKUP_DIR ile degistirilebilir; depo icindeki bir klasor REDDEDILIR
 * (git'e girmesin). Betik veritabanina hicbir sey yazmaz.
 *
 * Geri yukleme: docs/BACKUP_RESTORE.md
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { readEnvFileUnguarded } = require('../core/test_env.js');
const { runBackup } = require('../core/backup_engine.js');

const REPO = path.resolve(__dirname, '..');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

function targetDir(now) {
  const base = path.resolve(process.env.LEXBNB_BACKUP_DIR || path.join(REPO, '..', 'lexbnb-yedekler'));
  const rel = path.relative(REPO, base);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error(`BACKUP_DIR_INSIDE_REPO: ${base} depo icinde; yedek musteri verisi icerir ve git'e girmemeli.`);
  }
  const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 16);
  return path.join(base, stamp);
}

async function main() {
  const envFile = arg('--env') || '.env';
  const env = { ...readEnvFileUnguarded(envFile) };
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !key) throw new Error(`${envFile}: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY eksik`);

  const now = new Date();
  const dir = targetDir(now);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`Yedek: ${new URL(url).hostname} -> ${dir}`);

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const manifest = await runBackup({
    client, fetchFn: fetch, url, key,
    withStorage: process.argv.includes('--with-storage'),
    now: () => now,
    sha256: b => crypto.createHash('sha256').update(b).digest('hex'),
    writeFile: async (rel, body) => {
      const p = path.join(dir, rel);
      if (!p.startsWith(dir + path.sep)) throw new Error('GECERSIZ_YOL ' + rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body);
    },
    log: m => console.log(m)
  });

  const rows = Object.values(manifest.tables).reduce((s, t) => s + t.rows, 0);
  console.log(`\n${Object.keys(manifest.tables).length} tablo, ${rows} satir; ${manifest.auth_users ? manifest.auth_users.rows : '?'} kullanici; ` +
    `${manifest.storage ? manifest.storage.objects : '?'} depo dosyasi (${manifest.storage ? manifest.storage.downloaded : 0} indirildi)`);
  if (manifest.errors.length) {
    console.error(`\nYEDEK EKSIK — ${manifest.errors.length} hata:\n  ` + manifest.errors.join('\n  '));
    process.exit(1);
  }
  console.log('Yedek tamam: ' + path.join(dir, 'manifest.json'));
}

main().catch(e => { console.error(e && e.message ? e.message : e); process.exit(1); });
