/**
 * LEXBNB — VERITABANI YEDEGI (L-42, 1. kisim)
 *
 * Supabase Free planda otomatik yedek yok (K-01): ilk musteri gercek veri
 * girmeden Pro'ya gecilene kadar bu betik haftalik kosar. Yaptigi:
 *
 *   - public semasindaki her tabloyu PostgREST OpenAPI tanimindan KESFEDER
 *     (elle liste tutulmaz: yeni tablo yedekten sessizce kacmaz),
 *   - her tabloyu birincil anahtara gore sirali sayfalarla eksiksiz okur,
 *   - auth kullanicilarini (sifre ozeti API'den gelmez) ve depo dosya
 *     listesini yazar; istenirse dosyalarin kendisini de indirir,
 *   - her dosyanin sha256 ozetini ve satir sayisini manifest.json'a yazar.
 *
 * YALNIZCA OKUR. Istemciye hicbir yazma cagrisi yapilmaz; testler bunu
 * sahte istemcide olcer (core/backup_engine_tests.js).
 *
 * Tutarlilik: tablo bazindadir. Yedek sirasinda yazma olursa tablolar
 * farkli anlari yansitabilir; bu manifest'e yazilir.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BackupEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const PAGE = 1000;
  const BUCKET = 'property-media';

  /** OpenAPI tanimindan tablo adlari ve birincil anahtar sutunlari. */
  async function discoverTables(fetchFn, url, key) {
    const res = await fetchFn(`${url}/rest/v1/`, { headers: { apikey: key, Accept: 'application/openapi+json' } });
    if (!res.ok) throw new Error(`OPENAPI_READ_FAILED ${res.status}`);
    const spec = await res.json();
    const defs = spec.definitions || {};
    const tables = Object.keys(defs).sort().map(name => {
      const props = defs[name].properties || {};
      const pk = Object.keys(props).filter(c => /<pk\/>/.test(props[c].description || ''));
      return { name, pk, columns: Object.keys(props) };
    });
    if (!tables.length) throw new Error('OPENAPI_NO_TABLES: anahtar service_role degil mi?');
    return tables;
  }

  /** Bir tablonun tum satirlari; birincil anahtara gore sirali sayfalar. */
  async function dumpTable(client, table) {
    const order = table.pk.length ? table.pk : table.columns.slice(0, 1);
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      let q = client.from(table.name).select('*');
      for (const col of order) q = q.order(col, { ascending: true });
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw new Error(`TABLE_READ_FAILED ${table.name}: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) return rows;
    }
  }

  async function dumpAuthUsers(client) {
    const users = [];
    for (let page = 1; ; page++) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE });
      if (error) throw new Error(`AUTH_USERS_READ_FAILED: ${error.message}`);
      const batch = (data && data.users) || [];
      users.push(...batch.map(u => ({
        id: u.id, email: u.email, phone: u.phone || null, created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null, email_confirmed_at: u.email_confirmed_at || null,
        user_metadata: u.user_metadata || {}, app_metadata: u.app_metadata || {}
      })));
      if (batch.length < PAGE) return users;
    }
  }

  async function listStorage(storage, prefix) {
    const out = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await storage.list(prefix, { limit: PAGE, offset });
      if (error) throw new Error(`STORAGE_LIST_FAILED ${prefix || '/'}: ${error.message}`);
      for (const e of data || []) {
        const p = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.id) out.push({ path: p, size: (e.metadata && e.metadata.size) || null, updated_at: e.updated_at || null });
        else out.push(...await listStorage(storage, p));
      }
      if (!data || data.length < PAGE) return out;
    }
  }

  /**
   * deps: { client, fetchFn, url, key, writeFile(relPath, bufferOrString),
   *         sha256(bufferOrString), now(), withStorage, log }
   * Donen: manifest nesnesi (ayrica manifest.json olarak yazilir).
   */
  async function runBackup(deps) {
    const { client, fetchFn, url, key, writeFile, sha256 } = deps;
    const log = deps.log || (() => {});
    const manifest = {
      format: 'lexbnb-backup/1',
      created_at: (deps.now ? deps.now() : new Date()).toISOString(),
      supabase_host: new URL(url).hostname,
      consistency: 'tablo bazinda; yedek sirasinda yazma olursa tablolar farkli anlari yansitabilir',
      tables: {}, auth_users: null, storage: null, errors: []
    };

    const tables = await discoverTables(fetchFn, url, key);
    for (const t of tables) {
      try {
        const rows = await dumpTable(client, t);
        const body = JSON.stringify(rows);
        await writeFile(`tables/${t.name}.json`, body);
        manifest.tables[t.name] = { rows: rows.length, pk: t.pk, sha256: sha256(body) };
        log(`  ${t.name}: ${rows.length}`);
      } catch (e) {
        manifest.errors.push(e.message);
      }
    }

    try {
      const users = await dumpAuthUsers(client);
      const body = JSON.stringify(users);
      await writeFile('auth_users.json', body);
      manifest.auth_users = { rows: users.length, sha256: sha256(body) };
    } catch (e) { manifest.errors.push(e.message); }

    try {
      const storage = client.storage.from(BUCKET);
      const objects = await listStorage(storage, '');
      manifest.storage = { bucket: BUCKET, objects: objects.length, downloaded: 0 };
      await writeFile('storage_objects.json', JSON.stringify(objects));
      if (deps.withStorage) {
        for (const o of objects) {
          const { data, error } = await storage.download(o.path);
          if (error) { manifest.errors.push(`STORAGE_DOWNLOAD_FAILED ${o.path}: ${error.message}`); continue; }
          const buf = Buffer.from(await data.arrayBuffer());
          await writeFile(`storage/${BUCKET}/${o.path}`, buf);
          manifest.storage.downloaded++;
        }
      }
    } catch (e) { manifest.errors.push(e.message); }

    await writeFile('manifest.json', JSON.stringify(manifest, null, 2));
    return manifest;
  }

  return { discoverTables, dumpTable, dumpAuthUsers, listStorage, runBackup, PAGE };
}));
