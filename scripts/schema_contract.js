'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SUPABASE = path.join(ROOT, 'supabase');

function canonicalFiles() {
  const manifest = fs.readFileSync(path.join(SUPABASE, 'migration_manifest.txt'), 'utf8')
    .split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split(/\s+/)[0]);
  return ['schema.sql', ...manifest];
}

function canonicalSql() {
  return canonicalFiles().map(file => fs.readFileSync(path.join(SUPABASE, file), 'utf8'))
    .join('\n').replace(/^\uFEFF/gm, '').replace(/--[^\n]*/g, '');
}

function discoveredObjects() {
  const sql = canonicalSql();
  const tables = new Set();
  const rpcs = new Set();
  for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.(\w+)/gi)) tables.add(match[1]);
  for (const match of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+public\.(\w+)/gi)) tables.add(match[1]);
  for (const match of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\(/gi)) rpcs.add(match[1]);
  return { tables: [...tables].sort(), rpcs: [...rpcs].sort() };
}

const discovered = discoveredObjects();
const tableContracts = Object.fromEntries(discovered.tables.map(name => [name, { columns: {} }]));

Object.assign(tableContracts, {
  tenants: { columns: { id: { nullable: false } } },
  tenant_members: { columns: { tenant_id: { nullable: false }, user_id: { nullable: false }, role: { nullable: false } } },
  properties: { columns: { id: { nullable: false }, tenant_id: { nullable: false }, is_active: { nullable: false } } },
  bookings: { columns: {
    id: { nullable: false }, tenant_id: { nullable: false }, property_id: { nullable: false },
    quote_snapshot: { nullable: true }, pricing_source: { nullable: true }
  } },
  leads: { columns: {
    id: { nullable: false }, tenant_id: { nullable: false }, guest_name: { nullable: true }, guest_phone: { nullable: true }
  } },
  financial_transactions: { columns: { id: { nullable: false }, tenant_id: { nullable: false } } },
  invitation_delivery_outbox: { columns: { id: { nullable: false }, tenant_id: { nullable: false } } },
  pricing_profiles: { columns: { id: { nullable: false }, tenant_id: { nullable: false }, property_id: { nullable: false } } },
  pricing_rules: { columns: { id: { nullable: false }, tenant_id: { nullable: false }, name: { nullable: false } } },
  pricing_events: { columns: { id: { nullable: false }, tenant_id: { nullable: false }, name: { nullable: false } } },
  pricing_overrides: { columns: { id: { nullable: false }, tenant_id: { nullable: false }, reason: { nullable: false } } },
  daily_rates: { columns: { id: { nullable: false }, tenant_id: { nullable: false }, rate_date: { nullable: false } } },
  rate_change_logs: { columns: { id: { nullable: false }, tenant_id: { nullable: false }, rate_date: { nullable: false } } },
  booking_quotes: { columns: { id: { nullable: false }, tenant_id: { nullable: false }, quoted_total: { nullable: false } } }
});

const CONTRACT = {
  tables: tableContracts,
  rpcs: {
    save_manual_pricing_override_atomic: {
      args: ['p_tenant_id', 'p_property_id', 'p_start_date', 'p_end_date', 'p_rate_override', 'p_reason', 'p_bypass_guardrail', 'p_min_stay_override'],
      requiredArgs: ['p_tenant_id', 'p_property_id', 'p_start_date', 'p_end_date', 'p_rate_override', 'p_reason']
    },
    accept_booking_quote_atomic: {
      args: ['p_tenant_id', 'p_quote_id'], requiredArgs: ['p_tenant_id', 'p_quote_id']
    },
    convert_lead_to_booking_atomic: {
      args: ['p_lead_id', 'p_tenant_id', 'p_property_id', 'p_booking_code', 'p_check_in', 'p_check_out', 'p_pax', 'p_gross_amount', 'p_ota_commission', 'p_cleaning_fee', 'p_discount', 'p_notes'],
      requiredArgs: ['p_lead_id', 'p_tenant_id']
    }
  },
  allowedRpcs: new Set(discovered.rpcs),
  allowlist: {
    rpcs: new Map([['rls_auto_enable', 'Supabase production event-trigger helper; not part of the application contract']]),
    tables: new Map([['lexbnb_bootstrap_log', 'test bootstrap ledger; intentionally exists only in the dedicated test project']])
  }
};

function bodySchema(operation, spec) {
  const parameter = ((operation && operation.parameters) || []).find(p => p.in === 'body');
  let schema = parameter && parameter.schema;
  if (schema && schema.$ref) {
    const name = schema.$ref.split('/').pop();
    schema = spec.definitions && spec.definitions[name];
  }
  return schema || { properties: {}, required: [] };
}

function inspectOpenApi(spec) {
  const tables = {};
  for (const [name, def] of Object.entries(spec.definitions || {})) {
    const required = new Set(def.required || []);
    tables[name] = { columns: Object.fromEntries(Object.keys(def.properties || {}).map(column => [column, { nullable: !required.has(column) }])) };
  }
  const rpcs = {};
  for (const [route, pathSpec] of Object.entries(spec.paths || {})) {
    if (!route.startsWith('/rpc/')) continue;
    const name = route.slice('/rpc/'.length);
    const schema = bodySchema(pathSpec.post || pathSpec.get || {}, spec);
    rpcs[name] = { args: Object.keys(schema.properties || {}).sort(), requiredArgs: [...(schema.required || [])].sort() };
  }
  return { tables, rpcs };
}

function compareContract(actual, contract = CONTRACT) {
  const errors = [];
  for (const [table, expected] of Object.entries(contract.tables)) {
    const found = actual.tables[table];
    if (!found) { errors.push(`eksik tablo: ${table}`); continue; }
    for (const [column, columnSpec] of Object.entries(expected.columns)) {
      const actualColumn = found.columns[column];
      if (!actualColumn) errors.push(`eksik sütun: ${table}.${column}`);
      else if (actualColumn.nullable !== columnSpec.nullable) {
        errors.push(`yanlış nullability: ${table}.${column} beklenen=${columnSpec.nullable ? 'NULL' : 'NOT NULL'} gerçek=${actualColumn.nullable ? 'NULL' : 'NOT NULL'}`);
      }
    }
  }
  for (const table of Object.keys(actual.tables)) {
    if (!contract.tables[table] && !contract.allowlist.tables.has(table)) errors.push(`beklenmeyen tablo: ${table}`);
  }
  for (const [name, expected] of Object.entries(contract.rpcs)) {
    const found = actual.rpcs[name];
    if (!found) { errors.push(`eksik RPC: ${name}`); continue; }
    const missingArgs = expected.args.filter(arg => !found.args.includes(arg));
    const wrongRequired = expected.requiredArgs.filter(arg => !found.requiredArgs.includes(arg));
    if (missingArgs.length || wrongRequired.length) {
      errors.push(`yanlış RPC imzası: ${name} eksik=${missingArgs.join(',') || '-'} zorunlu=${wrongRequired.join(',') || '-'}`);
    }
  }
  for (const name of Object.keys(actual.rpcs)) {
    if (!contract.allowedRpcs.has(name) && !contract.allowlist.rpcs.has(name)) errors.push(`beklenmeyen RPC: ${name}`);
  }
  return { ok: errors.length === 0, errors };
}

function compareSchemas(left, right) {
  const drift = [];
  const tableNames = new Set([...Object.keys(left.tables), ...Object.keys(right.tables)]);
  for (const table of [...tableNames].sort()) {
    if (CONTRACT.allowlist.tables.has(table)) continue;
    if (!left.tables[table] || !right.tables[table]) { drift.push(`tablo farkı: ${table}`); continue; }
    const columns = new Set([...Object.keys(left.tables[table].columns), ...Object.keys(right.tables[table].columns)]);
    for (const column of [...columns].sort()) {
      const a = left.tables[table].columns[column], b = right.tables[table].columns[column];
      if (!a || !b) drift.push(`sütun farkı: ${table}.${column}`);
      else if (a.nullable !== b.nullable) drift.push(`nullability farkı: ${table}.${column}`);
    }
  }
  const rpcNames = new Set([...Object.keys(left.rpcs), ...Object.keys(right.rpcs)]);
  for (const name of [...rpcNames].sort()) {
    if (CONTRACT.allowlist.rpcs.has(name)) continue;
    const a = left.rpcs[name], b = right.rpcs[name];
    if (!a || !b || JSON.stringify(a) !== JSON.stringify(b)) drift.push(`RPC farkı: ${name}`);
  }
  return drift;
}

module.exports = { CONTRACT, canonicalFiles, discoveredObjects, inspectOpenApi, compareContract, compareSchemas };
