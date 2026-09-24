/**
 * LEXBNB — YEDEKTEN GERI YUKLEME (L-42)
 *
 * "Geri yuklenemeyen yedek, yedek degildir" — eski exportDataJSON tam olarak
 * buydu. Bu motor backup_engine.js'in yazdigi klasoru hedef projeye yukler:
 *
 *   - Tablolar HEDEF projenin FK grafigine gore sirayla yuklenir (ebeveyn
 *     once). Ay kapanis kayitlari EN SONA kalir: once yuklenirse kapali
 *     donem korumalari o aya ait rezervasyon/gider/temizligi reddeder.
 *   - Var olan satira DOKUNULMAZ: once hedefte hangi birincil anahtarlarin
 *     oldugu okunur, yalnizca EKSIK satirlar eklenir. (ON CONFLICT DO NOTHING
 *     yetmez: BEFORE INSERT korumalari cakisan satirda da calisir.)
 *   - Tetikleyicilerin bu calistirmada urettigi ve yedekte olmayan satirlar
 *     silinir (SIDE_EFFECTS) — davet e-postasi yeniden gitmez.
 *   - --tenant ile yalnizca bir isletme yuklenir (yanlislikla sifirlanan
 *     isletmeyi kurtarma senaryosu). Uyelerin auth kaydi yoksa ayni kimlikle
 *     yeniden acilir; sifreleri yedekte olmadigi icin "sifremi unuttum"
 *     ile yeni sifre belirlerler.
 *
 * Gorunumler ve altyapi defterleri yuklenmez (asagidaki listeler).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RestoreEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  // Yazilamaz ya da yedekten yuklenmemesi gerekenler. Yeni bir VIEW
  // eklenirse buraya da eklenir; restore_engine_tests goclerle karsilastirir.
  const VIEWS = ['channel_performance_rates'];
  const INFRA = ['schema_migrations', 'lexbnb_bootstrap_log'];
  const LAST = ['monthly_financial_closes'];
  // Baska bir tabloya satir eklenince TETIKLEYICININ kendiliginden satir
  // yazdigi tablolar. Geri yukleme sirasinda uretilen bu satirlar yedekte
  // yoktur: kanallar yedektekilerle cakisir, izin kaydi cogalir ve davet
  // kuyrugu insanlara davet e-postasini YENIDEN gonderir. Bu calistirmada
  // uretilen ve yedekte olmayanlar silinir (yalniz ilgili isletmede).
  //   tenants          -> tenant_booking_channels (seed_booking_channels_for_new_tenant)
  //   guests           -> guest_consent_events    (audit_guest_marketing_consent)
  //   tenant_invitations -> invitation_delivery_outbox (enqueue_invitation_delivery)
  const SIDE_EFFECTS = ['tenant_booking_channels', 'guest_consent_events', 'invitation_delivery_outbox'];
  // Olusturma zamaninin sutunu (varsayilan created_at).
  const CREATED_COL = { guest_consent_events: 'recorded_at' };
  const BATCH = 500;

  function parseSpec(spec) {
    const defs = spec.definitions || {};
    const out = {};
    for (const [name, d] of Object.entries(defs)) {
      const props = d.properties || {};
      const pk = [], deps = new Set();
      for (const [col, p] of Object.entries(props)) {
        const desc = p.description || '';
        if (/<pk\/>/.test(desc)) pk.push(col);
        const m = desc.match(/<fk table='([^']+)' column='[^']+'\/>/);
        if (m && m[1] !== name) deps.add(m[1]);
      }
      out[name] = { pk, deps: [...deps], columns: Object.keys(props) };
    }
    return out;
  }

  /** Ebeveynler once; LAST listesindekiler en sonda. Dongu varsa hata. */
  function loadOrder(tables) {
    const names = Object.keys(tables).filter(n => !VIEWS.includes(n) && !INFRA.includes(n));
    const order = [], state = {};
    const visit = (n, stack) => {
      if (state[n] === 2) return;
      if (state[n] === 1) throw new Error('FK_CYCLE ' + stack.concat(n).join(' -> '));
      state[n] = 1;
      for (const d of tables[n].deps) if (names.includes(d)) visit(d, stack.concat(n));
      state[n] = 2;
      order.push(n);
    };
    names.sort().forEach(n => visit(n, []));
    return order.filter(n => !LAST.includes(n)).concat(order.filter(n => LAST.includes(n)));
  }

  /** Bir tablonun, istenen isletmeye ait satirlari. */
  function tenantRows(name, rows, tenantId, memberIds) {
    if (!tenantId) return rows;
    if (name === 'tenants') return rows.filter(r => r.id === tenantId);
    if (name === 'profiles') return rows.filter(r => memberIds.has(r.id));
    if (rows.length && Object.prototype.hasOwnProperty.call(rows[0], 'tenant_id')) return rows.filter(r => r.tenant_id === tenantId);
    return []; // isletmeye baglanamayan tablo: tek isletme kurtariminda yuklenmez
  }

  /**
   * deps: { client, spec, readJson(rel) -> any|null, tenantId?, log? }
   * deps.startedAt: calistirmanin SUNUCU saatiyle baslangici (zorunlu).
   * Donen: { tables: {name: {inBackup, inserted, alreadyPresent}}, users, sideEffectsRemoved, errors }
   */
  async function restoreBackup(deps) {
    const { client, spec, readJson } = deps;
    const log = deps.log || (() => {});
    const tables = parseSpec(spec);
    const manifest = readJson('manifest.json');
    if (!manifest || manifest.format !== 'lexbnb-backup/1') throw new Error('BACKUP_FORMAT_UNKNOWN');
    if (manifest.errors && manifest.errors.length) throw new Error('BACKUP_INCOMPLETE: yedek hatali alinmis, geri yuklenmez');

    const report = { tables: {}, users: { created: 0, existing: 0 }, errors: [] };
    const members = readJson('tables/tenant_members.json') || [];
    const memberIds = new Set(deps.tenantId ? members.filter(m => m.tenant_id === deps.tenantId).map(m => m.user_id) : members.map(m => m.user_id));

    // 1. Auth kullanicilari (FK hedefi): eksik olan ayni kimlikle acilir.
    const users = (readJson('auth_users.json') || []).filter(u => memberIds.has(u.id));
    for (const u of users) {
      const got = await client.auth.admin.getUserById(u.id);
      if (got.data && got.data.user) { report.users.existing++; continue; }
      const { error } = await client.auth.admin.createUser({
        id: u.id, email: u.email, email_confirm: true, user_metadata: u.user_metadata || {}
      });
      if (error) report.errors.push(`AUTH_USER_CREATE_FAILED ${u.email}: ${error.message}`);
      else report.users.created++;
    }

    // Tetikleyici yan etkilerini ayirt etmek icin: bu calistirmanin baslangici.
    // SUNUCU saatinden verilmeli (deps.startedAt, HTTP Date basligi): genis
    // bir pay, kullanicinin az once ekledigi satiri "yan etki" sanip silerdi.
    if (!deps.startedAt) throw new Error('STARTED_AT_REQUIRED: sunucu saati verilmeli');
    const startedAt = new Date(deps.startedAt).toISOString();
    const backupIds = name => new Set((readJson(`tables/${name}.json`) || []).map(r => r.id));

    async function cleanSideEffects(name) {
      const tsCol = CREATED_COL[name] || 'created_at';
      if (!SIDE_EFFECTS.includes(name) || !tables[name]) return;
      if (!tables[name].columns.includes(tsCol)) { report.errors.push(`SIDE_EFFECT_NO_TIMESTAMP ${name}.${tsCol}`); return; }
      const keep = backupIds(name);
      let q = client.from(name).select('id').gte(tsCol, startedAt);
      if (deps.tenantId) q = q.eq('tenant_id', deps.tenantId);
      const { data, error } = await q;
      if (error) { report.errors.push(`SIDE_EFFECT_READ_FAILED ${name}: ${error.message}`); return; }
      const extra = (data || []).map(r => r.id).filter(id => !keep.has(id));
      for (let i = 0; i < extra.length; i += BATCH) {
        const { error: de } = await client.from(name).delete().in('id', extra.slice(i, i + BATCH));
        if (de) { report.errors.push(`SIDE_EFFECT_CLEAN_FAILED ${name}: ${de.message}`); return; }
      }
      if (extra.length) report.sideEffectsRemoved[name] = (report.sideEffectsRemoved[name] || 0) + extra.length;
    }

    /** Hedefte zaten var olan birincil anahtarlar (yalniz bu satirlar icin). */
    async function existingKeys(name, pk, batch) {
      const first = pk[0];
      const vals = [...new Set(batch.map(r => r[first]))];
      const { data, error } = await client.from(name).select(pk.join(',')).in(first, vals);
      if (error) throw new Error(`EXISTING_READ_FAILED ${name}: ${error.message}`);
      return new Set((data || []).map(r => pk.map(c => String(r[c])).join('|')));
    }

    report.sideEffectsRemoved = {};

    // 2. Tablolar
    for (const name of loadOrder(tables)) {
      const all = readJson(`tables/${name}.json`);
      if (all === null) continue; // hedefte var, yedekte yok (daha yeni sema)
      const rows = tenantRows(name, all, deps.tenantId, memberIds);
      report.tables[name] = { inBackup: rows.length, inserted: 0, alreadyPresent: 0 };
      await cleanSideEffects(name);
      if (!rows.length) continue;
      const pk = tables[name].pk;
      try {
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          // Var olan satira dokunulmaz — ve INSERT denenmez bile: BEFORE INSERT
          // korumalari (kapali donem) ON CONFLICT DO NOTHING'de de calisir.
          const have = pk.length ? await existingKeys(name, pk, batch) : new Set();
          const missing = batch.filter(r => !have.has(pk.map(c => String(r[c])).join('|')));
          report.tables[name].alreadyPresent += batch.length - missing.length;
          if (!missing.length) continue;
          const { error } = await client.from(name).insert(missing);
          if (error) throw new Error(`TABLE_RESTORE_FAILED ${name}: ${error.message}`);
          report.tables[name].inserted += missing.length;
        }
      } catch (e) {
        report.errors.push(e.message);
      }
      log(`  ${name}: +${report.tables[name].inserted} (zaten var: ${report.tables[name].alreadyPresent})`);
    }

    // Sonradan yuklenen tablolarin tetikledigi yan etkiler (ornegin davetler
    // yuklendikten sonra dogan kuyruk satirlari) icin son bir tur.
    for (const name of SIDE_EFFECTS) await cleanSideEffects(name);
    return report;
  }

  return { parseSpec, loadOrder, tenantRows, restoreBackup, VIEWS, INFRA, LAST, SIDE_EFFECTS };
}));
