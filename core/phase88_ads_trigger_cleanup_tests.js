const assert = require('assert');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'supabase', 'migration_phase88_ads_update_trigger_cleanup.sql');
assert.ok(fs.existsSync(file), 'phase88 tetikleyici temizliği bulunmalı');
const sql = fs.readFileSync(file, 'utf8');

assert.match(sql, /PHASE88_REQUIRES_PHASE86/);
assert.match(sql, /DROP TRIGGER IF EXISTS trg_ad_metric_period_days_update\s+ON public\.ad_metric_periods/);
assert.match(sql, /trg_ad_metric_period_days_update_insert/);
assert.match(sql, /VALUES \(88, 'phase88_ads_update_trigger_cleanup'\)/);

console.log('[PASS] Phase88 reklam dönemi UPDATE senkronunu tek tetikleyiciye indirir');
