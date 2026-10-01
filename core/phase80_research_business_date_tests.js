const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase80_research_business_date.sql'), 'utf8');
assert.match(sql, /DROP CONSTRAINT competitor_price_research_researched_on_check/);
assert.match(sql, /CHECK \(researched_on <= \(now\(\) AT TIME ZONE 'Europe\/Istanbul'\)::date\)/);
assert.match(sql, /INSERT INTO public\.schema_migrations/);
console.log('[PASS] Phase80 rakip arastirmasi tarihini Istanbul is gunune baglar');
