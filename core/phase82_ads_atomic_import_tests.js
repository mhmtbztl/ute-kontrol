const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase82_ads_atomic_import.sql'), 'utf8');
const preflight = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'preflight_phase82_ads_overlap.sql'), 'utf8');
const runner = fs.readFileSync(path.join(__dirname, '..', 'run_all_tests.js'), 'utf8');

assert.match(sql, /CREATE TABLE public\.ad_metric_period_days/);
assert.match(sql, /CREATE TRIGGER trg_tenant_id_immutable/);
assert.match(sql, /created_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
assert.match(sql, /PRIMARY KEY \(campaign_id, day\)/);
assert.match(sql, /EXCEPTION WHEN unique_violation[\s\S]*ADS_PERIOD_OVERLAP/);
assert.match(sql, /CREATE OR REPLACE FUNCTION public\.save_ad_metric_period_batch/);
assert.match(sql, /jsonb_array_elements\(p_rows\)/);
assert.match(sql, /v_id := public\.save_ad_metric_period\(/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_ad_metric_period_batch\(UUID, JSONB\) FROM PUBLIC, anon/);
assert.match(sql, /VALUES \(82, 'phase82_ads_atomic_import'\)/);
assert.match(preflight, /HAVING COUNT\(\*\) > 1/i);
assert.match(preflight, /generate_series/i);
assert.match(runner, /phase82_ads_atomic_import_live_tests\.js/);

console.log('[PASS] Phase82 reklam içe aktarımını tek transaction yapar ve yarışa dayanıklı gün tekilliği kurar');
