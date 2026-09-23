/**
 * LEXBNB — SAHIPSIZ MULK FOTOGRAFLARININ TEMIZLIGI (L-12)
 *
 * `property-media` kovasindaki dosyalar `<tenant_id>/<property_id>/...`
 * yolunda durur. Hesap kapatma (`delete_my_account`) ve veri sifirlama
 * (`reset_tenant_data`) yalnizca tablo satirlarini siler; SQL'den depolama
 * dosyasi silinemez (Supabase dogrudan `storage.objects` silmeyi reddeder).
 * Sonuc: "hesabimi sil" denmis bir isletmenin fotograflari depoda kalir.
 *
 * Bu modul, sahibi artik veritabaninda OLMAYAN klasorleri bulur ve siler:
 *   - kok klasor bir tenant kimligi ve o tenant yoksa -> tamami
 *   - tenant var ama mulk klasoru o tenant'ta yoksa     -> o mulk klasoru
 *
 * GUVENLIK: Kimlik listesini okurken tek bir hata bile olursa HICBIR SEY
 * silinmez. "Okuyamadim" ile "yok" ayni sey degildir; ayni sayilsaydi gecici
 * bir ag hatasi butun musterilerin fotograflarini silerdi.
 *
 * Hem tarayicida hem Node'da calisir; istemci disaridan verilir.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StorageOrphanCleanup = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const BUCKET = 'property-media';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PAGE = 1000;

  const isUUID = v => UUID_RE.test(String(v || ''));

  async function listAll(storage, prefix) {
    const out = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await storage.list(prefix, { limit: PAGE, offset });
      if (error) throw new Error(`STORAGE_LIST_FAILED ${prefix || '/'}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < PAGE) return out;
    }
  }

  /** Bir onekin altindaki tum dosya yollari (klasorlerde `id` null gelir). */
  async function listFilesRecursive(storage, prefix) {
    const files = [];
    for (const entry of await listAll(storage, prefix)) {
      const p = `${prefix}/${entry.name}`;
      if (entry.id) files.push(p);
      else files.push(...await listFilesRecursive(storage, p));
    }
    return files;
  }

  async function idSet(client, table, filter) {
    const ids = new Set();
    for (let from = 0; ; from += PAGE) {
      let q = client.from(table).select('id').order('id').range(from, from + PAGE - 1);
      if (filter) q = filter(q);
      const { data, error } = await q;
      if (error) throw new Error(`DB_READ_FAILED ${table}: ${error.message}`);
      (data || []).forEach(r => ids.add(r.id));
      if (!data || data.length < PAGE) return ids;
    }
  }

  /**
   * Silinecek onekleri bulur. Yazma yapmaz.
   * Donen: { prefixes: [{ prefix, reason }] }
   */
  async function planOrphanCleanup(client) {
    const storage = client.storage.from(BUCKET);
    const tenants = await idSet(client, 'tenants');
    // Yetkisiz bir anahtar tenants'i hatasiz ama BOS dondurebilir; o zaman
    // her klasor "sahipsiz" gorunur. Hic isletme gorulmuyorsa silme yapilmaz.
    if (tenants.size === 0) throw new Error('NO_TENANTS_VISIBLE: service_role anahtari mi kullaniliyor?');
    const prefixes = [];
    for (const top of await listAll(storage, '')) {
      if (top.id || !isUUID(top.name)) continue; // beklenmeyen yapiya dokunulmaz
      if (!tenants.has(top.name)) {
        prefixes.push({ prefix: top.name, reason: 'TENANT_GONE' });
        continue;
      }
      const props = await idSet(client, 'properties', q => q.eq('tenant_id', top.name));
      for (const sub of await listAll(storage, top.name)) {
        if (sub.id || !isUUID(sub.name)) continue;
        if (!props.has(sub.name)) prefixes.push({ prefix: `${top.name}/${sub.name}`, reason: 'PROPERTY_GONE' });
      }
    }
    return { prefixes };
  }

  /** Plani uygular. `dryRun` ise yalnizca sayar. */
  async function runOrphanCleanup(client, options = {}) {
    const storage = client.storage.from(BUCKET);
    const { prefixes } = await planOrphanCleanup(client);
    let removed = 0;
    for (const item of prefixes) {
      const files = await listFilesRecursive(storage, item.prefix);
      item.files = files.length;
      if (options.dryRun || !files.length) continue;
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await storage.remove(files.slice(i, i + 100));
        if (error) throw new Error(`STORAGE_REMOVE_FAILED ${item.prefix}: ${error.message}`);
      }
      removed += files.length;
    }
    return { prefixes, removed, dryRun: !!options.dryRun };
  }

  return { BUCKET, planOrphanCleanup, runOrphanCleanup, listFilesRecursive };
}));
