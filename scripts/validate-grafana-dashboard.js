#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DASHBOARD_PATH = path.resolve(__dirname, '../analytics/grafana-dashboard.json');
const REQUIRED_TOP_LEVEL = ['panels', 'title', 'uid', 'schemaVersion', '__inputs'];
const VALID_FORMATS = new Set(['time_series', 'table']);

let errors = [];

// ── Load ──────────────────────────────────────────────────────────────────────
let raw;
try {
  raw = fs.readFileSync(DASHBOARD_PATH, 'utf8');
} catch {
  console.error(`✗ Cannot read ${DASHBOARD_PATH}`);
  process.exit(1);
}

let dashboard;
try {
  dashboard = JSON.parse(raw);
} catch (e) {
  console.error(`✗ Invalid JSON: ${e.message}`);
  process.exit(1);
}

// ── Top-level fields ──────────────────────────────────────────────────────────
for (const field of REQUIRED_TOP_LEVEL) {
  if (dashboard[field] === undefined) {
    errors.push(`Missing top-level field: "${field}"`);
  }
}

if (!Array.isArray(dashboard.panels)) {
  errors.push('"panels" must be an array');
}

if (!Array.isArray(dashboard.__inputs) || dashboard.__inputs.length === 0) {
  errors.push('"__inputs" must be a non-empty array');
}

const dsDefined = (dashboard.__inputs || []).some(
  (i) => i.type === 'datasource' && i.pluginId === 'postgres'
);
if (!dsDefined) {
  errors.push('"__inputs" must include a postgres datasource entry');
}

// ── Panel validation ──────────────────────────────────────────────────────────
const ids = new Set();
for (const panel of dashboard.panels || []) {
  const label = `Panel id=${panel.id ?? '?'} ("${panel.title ?? ''}")`;

  if (panel.id === undefined) errors.push(`${label}: missing "id"`);
  if (!panel.type)            errors.push(`${label}: missing "type"`);
  if (!panel.gridPos)         errors.push(`${label}: missing "gridPos"`);

  if (panel.id !== undefined) {
    if (ids.has(panel.id)) errors.push(`Duplicate panel id: ${panel.id}`);
    ids.add(panel.id);
  }

  if (panel.type === 'row') continue;

  if (!Array.isArray(panel.targets) || panel.targets.length === 0) {
    errors.push(`${label}: non-row panel must have at least one target`);
    continue;
  }

  for (const [i, target] of panel.targets.entries()) {
    const tlabel = `${label} target[${i}]`;
    if (!target.rawSql) {
      errors.push(`${tlabel}: missing "rawSql"`);
    }
    if (!VALID_FORMATS.has(target.format)) {
      errors.push(`${tlabel}: "format" must be "time_series" or "table", got "${target.format}"`);
    }
  }
}

// ── Result ────────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error('✗ Grafana dashboard validation failed:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✓ Grafana dashboard valid (${(dashboard.panels || []).length} panels)`);
