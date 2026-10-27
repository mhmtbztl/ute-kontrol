/**
 * LEXBNB — UYGULAMA ICI ISLETME YEDEGI (L-42, 2. kisim)
 *
 * Isletme sahibi kendi isletmesinin butun kayitlarini tek bir JSON dosyasi
 * olarak indirir. Dosya `npm run backup` ile ayni bicimdedir
 * (`lexbnb-backup/1`) ve `npm run restore -- <dosya.json> --tenant <uuid>`
 * ile geri yuklenir: "geri yuklenemeyen yedek yedek degildir" (eski
 * exportDataJSON). Gidis-donus `tenant_backup_live_tests` ile olculur.
 *
 *   - Tablo listesi asagida durur (TENANT_TABLES); goclerle karsilastirilir.
 *   - Yalniz bu isletmenin satirlari okunur (tenant_id; tenants ve uyelerin
 *     profilleri ayrica). Isletmeye baglanamayan tablolar dosyaya girmez;
 *     geri yukleme de onlari tek isletme kurtariminda yuklemez.
 *   - YALNIZCA OKUR. Okunamayan tablo (RLS reddi) manifest.errors'a yazilir;
 *     geri yukleme hatali yedegi reddeder, yani eksik yedek sessizce
 *     "tam" sanilmaz.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TenantBackupExport = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const FORMAT = 'lexbnb-backup/1';
  const PAGE = 1000;
  // Isletmeye ait (tenant_id tasiyan) tablolar. Supabase OpenAPI tanimini
  // kullanici oturumuna vermez (401), bu yuzden liste burada durur; bayatlamasin
  // diye tenant_backup_export_tests goclerden turettigi listeyle karsilastirir:
  // yeni bir tenant_id tablosu eklenip buraya yazilmazsa test kirilir.
  const TENANT_TABLES = [
    'ad_metric_periods', 'audit_logs', 'booking_payment_commissions',
    'booking_payments', 'booking_quotes', 'bookings', 'channel_media_placements',
    'channel_performance_snapshots', 'cleaning_task_executions', 'cleaning_tasks',
    'competitor_price_research', 'daily_rates', 'executive_alerts', 'expense_template_occurrences',
    'expense_templates', 'expenses', 'extension_offers', 'finance_import_batch_rows',
    'finance_import_batches', 'financial_transactions', 'guest_consent_events', 'guest_erasure_log',
    'guest_private_classifications', 'guests', 'housekeeping_status_overrides', 'income_entries',
    'influencer_collabs', 'lead_acquisition', 'lead_interest_daily',
    'lead_interest_properties', 'lead_source_catalog', 'lead_workflow', 'leads',
    'listing_change_experiments', 'listing_experiment_snapshots', 'maintenance_assignments',
    'maintenance_tickets', 'marketing_campaigns', 'marketing_findings',
    'marketing_metric_import_batches', 'message_automation_rules', 'message_delivery_logs',
    'message_templates', 'monthly_financial_closes', 'monthly_targets', 'operation_evidence',
    'operational_people', 'operational_tasks', 'operations_audit_logs', 'photo_analysis_items',
    'photo_analysis_runs', 'pricing_events', 'pricing_overrides', 'pricing_profiles',
    'pricing_rules', 'properties', 'property_analysis_context', 'property_channel_listings',
    'property_checklist_templates', 'property_daily_prices', 'property_guest_settings',
    'property_marketing_benchmarks', 'property_marketing_health_inputs',
    'property_marketing_health_snapshots', 'property_media', 'property_media_versions',
    'property_operator_notes', 'property_owner_links', 'property_owners', 'property_pricing_ladder',
    'property_pricing_rule_settings', 'rate_change_logs', 'recurring_task_rules',
    'scheduled_messages', 'task_templates', 'tenant_booking_channels', 'tenant_invitations',
    'tenant_members', 'tenant_migrations', 'tenant_onboarding', 'tenant_settings',
    'user_notifications'
  ];
  // Bilerek yok: ad_metric_period_days (reklam donemlerinden tetikleyiciyle
  // turer, geri yuklemede yeniden uretilir) ve invitation_delivery_outbox
  // (e-posta kuyrugu; geri yuklemede davet yeniden gitmesin). Ikisi de
  // kullaniciya kapalidir (42501).
  // Birincil anahtari id olmayanlar (sayfalamada sira icin).
  const ORDER = {
    booking_payment_commissions: ['booking_id'],
    guest_private_classifications: ['guest_id'], housekeeping_status_overrides: ['property_id'],
    lead_acquisition: ['lead_id'], lead_interest_daily: ['day', 'source_id', 'channel'],
    lead_interest_properties: ['lead_id', 'property_id'], lead_workflow: ['lead_id'],
    maintenance_assignments: ['maintenance_ticket_id'], property_analysis_context: ['property_id'],
    property_operator_notes: ['property_id'], property_owner_links: ['property_id', 'owner_id'],
    property_pricing_ladder: ['property_id'], tenant_settings: ['key'], tenant_members: ['user_id']
  };

  async function readAll(client, table, filter) {
    const order = ORDER[table.name] || ['id'];
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      let q = filter(client.from(table.name).select('*'));
      for (const col of order) q = q.order(col, { ascending: true });
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw new Error(`${table.name}: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) return rows;
    }
  }

  /**
   * deps: { client, tenantId, now? }
   * Donen: { manifest, tables: { ad: satirlar } }
   */
  async function exportTenantBackup(deps) {
    const { client, tenantId } = deps;
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const tables = ['tenants', 'profiles', ...TENANT_TABLES].map(name => ({ name }));
    const byName = Object.fromEntries(tables.map(t => [t.name, t]));
    const out = {};
    const errors = [];
    const read = async (t, filter) => {
      try { out[t.name] = await readAll(client, t, filter); } catch (e) { errors.push(`TABLE_READ_FAILED ${e.message}`); }
    };
    // Uyelik once: profiller uyelere gore suzulur.
    if (byName.tenant_members) await read(byName.tenant_members, q => q.eq('tenant_id', tenantId));
    const uyeler = (out.tenant_members || []).map(m => m.user_id);
    for (const t of tables) {
      if (t.name === 'tenant_members') continue;
      if (t.name === 'tenants') await read(t, q => q.eq('id', tenantId));
      else if (t.name === 'profiles') { if (uyeler.length) await read(t, q => q.in('id', uyeler)); else out.profiles = []; }
      else await read(t, q => q.eq('tenant_id', tenantId));
    }
    const now = deps.now ? new Date(deps.now) : new Date();
    const manifest = {
      format: FORMAT,
      kind: 'tenant',
      tenantId,
      createdAt: now.toISOString(),
      tables: Object.fromEntries(Object.entries(out).map(([n, r]) => [n, { rows: r.length }])),
      errors,
      note: 'Isletme yedegi. Geri yukleme: npm run restore -- <bu-dosya.json> --tenant ' + tenantId +
        '. Var olan kayda dokunulmaz, yalniz eksikler eklenir. Kullanici sifreleri yedekte yoktur.'
    };
    return { manifest, tables: out };
  }

  /** restore_engine'in readJson(rel) arayuzu: tek dosya yedekten okur. */
  function readerFromFile(file) {
    if (!file || !file.manifest || file.manifest.format !== FORMAT) throw new Error('BACKUP_FORMAT_UNKNOWN');
    return rel => {
      if (rel === 'manifest.json') return file.manifest;
      if (rel === 'auth_users.json') return file.auth_users || null;
      const m = /^tables\/(.+)\.json$/.exec(rel);
      if (m) return Object.prototype.hasOwnProperty.call(file.tables || {}, m[1]) ? file.tables[m[1]] : null;
      return null;
    };
  }

  return { exportTenantBackup, readerFromFile, FORMAT, TENANT_TABLES };
}));
