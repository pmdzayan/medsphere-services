#!/usr/bin/env node
// aim-backup-status.mjs -- emit bounded, provider-neutral Prometheus
// text metrics describing the AIM backup/recovery pipeline (Task 0022).
//
// Reads the JSONL status file that the backup/restore CLIs append bounded
// records to and renders metrics an operator can scrape with a Prometheus
// node/textfile collector (see docs/operations/v1-observability-runbook.md
// and docs/operations/v1-alert-rules.prometheus.yml).
//
// Metrics never contain database content, patient data, URLs, passwords, or
// backup bytes.
//
// Usage:
//   node scripts/aim-backup-status.mjs --file <status-file>
//
// Options:
//   --file <path>                 required JSONL status file
//   --warn-after <seconds>        staleness warning threshold (default 100800 = 28h)
//   --critical-after <seconds>    staleness critical threshold (default 259200 = 72h)
//   --now <epoch-seconds>         override clock for testing

import {
  computeBackupMetrics,
  formatBackupMetrics,
  readStatusRecords,
} from './backup-recovery-core.mjs';

const args = process.argv.slice(2);
function optionValue(name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1];
}

const statusFile = optionValue('--file');
const warnAfter = Number(optionValue('--warn-after', '100800'));
const criticalAfter = Number(optionValue('--critical-after', '259200'));
const nowRaw = optionValue('--now');

if (!statusFile) {
  console.error('[FAIL] --file <path> is required.');
  process.exit(1);
}
if (!Number.isFinite(warnAfter) || !Number.isFinite(criticalAfter)) {
  console.error('[FAIL] --warn-after and --critical-after must be numbers (seconds).');
  process.exit(1);
}

const nowSeconds = nowRaw ? Number(nowRaw) : Math.floor(Date.now() / 1000);
let records;
try {
  records = readStatusRecords(statusFile);
} catch {
  process.stdout.write(
    formatBackupMetrics(
      computeBackupMetrics([], nowSeconds, warnAfter, criticalAfter),
      warnAfter,
      criticalAfter,
    ),
  );
  process.exit(0);
}

const metrics = computeBackupMetrics(records, nowSeconds, warnAfter, criticalAfter);
process.stdout.write(formatBackupMetrics(metrics, warnAfter, criticalAfter));
