'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LEGACY_BRAND = /medsphere/gi;
const SKIP_DIRECTORIES = new Set(['.git', '.next', '.turbo', 'coverage', 'dist', 'node_modules']);

/**
 * Ordered, reviewable classification rules for intentionally retained legacy
 * identifiers. Earlier rules are more specific and win.
 */
const RETENTION_RULES = [
  {
    category: 'HISTORICAL/MIGRATION',
    reason: 'Single truthful transition note recording the former development working name.',
    path: /^README\.md$/,
    line: /formerly developed under the MedSphere working name/i,
  },
  {
    category: 'EXTERNAL_CONTRACT',
    reason:
      'Existing provider idempotency header; renaming requires a versioned compatibility change.',
    line: /X-MedSphere-Delivery-Id/i,
  },
  {
    category: 'INTERNAL_STABLE_IDENTIFIER',
    reason: 'Stable internal package scope.',
    line: /@medsphere\//i,
  },
  {
    category: 'INTERNAL_STABLE_IDENTIFIER',
    reason:
      'Stable repository, host, database, runtime, telemetry, cache, cookie, or configuration identifier.',
    line: /(?:pmdzayan\/medsphere-services|auth\.medsphere\.test|medsphere[-_.:]?(?:services|monorepo|access|refresh|profile|locale|web|ci|dev|postgres|redis|infra|apps|auth|database|http|notification|otp|metrics|permission|required|personal|v1)|MEDSPHERE_[A-Z0-9_]+)/i,
  },
  {
    category: 'HISTORICAL/MIGRATION',
    reason: 'Append-only migration or historical evidence; retained to preserve audit truth.',
    path: /^(?:packages\/database\/prisma\/migrations\/|docs\/(?:adr|audits|security|sprints)\/|.*\.patch$)/,
  },
  {
    category: 'TEST FIXTURE',
    reason:
      'Technical test fixture or compatibility assertion; user-facing expectations are not allowlisted here.',
    path: /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/,
  },
  {
    category: 'INTERNAL_STABLE_IDENTIFIER',
    reason:
      'Existing Prometheus rule or alert identifier; renaming would break operational routing.',
    path: /^docs\/operations\/v1-alert-rules\.prometheus\.yml$/,
    line: /(?:name:\s+medsphere-|alert:\s+MedSphere)/i,
  },
  {
    category: 'INTERNAL_STABLE_IDENTIFIER',
    reason: 'Internal source, validation, or tooling identifier with no consumer-facing rendering.',
    path: /^(?:\.eslintrc\.js|packages\/|scripts\/)/,
  },
  {
    category: 'INTERNAL_STABLE_IDENTIFIER',
    reason: 'Deployment, workflow, package, or source-level compatibility identifier.',
    path: /^(?:\.github\/|compose\/|\.env\.example$|pnpm-lock\.yaml$|package\.json$|tsconfig(?:\.base)?\.json$|apps\/[^/]+\/package\.json$|packages\/[^/]+\/package\.json$)/,
  },
];

const CURRENT_DOCUMENTATION =
  /^(?:README\.md|PROJECT_RULES\.md|PROJECT_STATUS\.md|PRODUCT_ROADMAP\.md|AI_HANDOFF\.md|docs\/(?:ENGINEERING_REVIEW\.md|status\/|operations\/|development-bible\/|i18n\/|runtime-cert-inventory\.md))/;
const USER_FACING_SOURCE =
  /^(?:apps\/web\/src\/(?:app|components|features)\/|apps\/auth-service\/src\/(?:notifications|verification|organization)\/)/;

function classifyOccurrence(file, line) {
  for (const rule of RETENTION_RULES) {
    if (rule.path && !rule.path.test(file)) continue;
    if (rule.line && !rule.line.test(line)) continue;
    return { category: rule.category, reason: rule.reason };
  }
  if (CURRENT_DOCUMENTATION.test(file)) {
    return {
      category: 'DOCUMENTATION',
      reason: 'Current documentation must use the active AIM — All In Medico identity.',
    };
  }
  if (USER_FACING_SOURCE.test(file)) {
    return {
      category: 'USER_FACING',
      reason: 'Production-facing source must not render or communicate the legacy brand.',
    };
  }
  return {
    category: 'UNEXPLAINED',
    reason: 'No approved retention rule explains this legacy-brand occurrence.',
  };
}

function walk(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) return [];
    const absolute = path.join(current, entry.name);
    return entry.isDirectory() ? walk(root, absolute) : [absolute];
  });
}

function audit(repositoryRoot) {
  const occurrences = [];
  for (const absolute of walk(repositoryRoot)) {
    const file = path.relative(repositoryRoot, absolute).split(path.sep).join('/');
    if (file === '0029-v1-aim-all-in-medico-rebrand-final.patch') continue;
    let contents;
    try {
      contents = fs.readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    const lines = contents.split(/\r?\n/);
    lines.forEach((line, index) => {
      LEGACY_BRAND.lastIndex = 0;
      const count = [...line.matchAll(LEGACY_BRAND)].length;
      if (count === 0) return;
      const classification = classifyOccurrence(file, line);
      occurrences.push({ file, line: index + 1, count, ...classification });
    });
  }
  const categoryCounts = {};
  let total = 0;
  for (const occurrence of occurrences) {
    total += occurrence.count;
    categoryCounts[occurrence.category] =
      (categoryCounts[occurrence.category] ?? 0) + occurrence.count;
  }
  const blocking = occurrences.filter((item) =>
    ['USER_FACING', 'DOCUMENTATION', 'UNEXPLAINED'].includes(item.category),
  );
  return { total, categoryCounts, blocking, occurrences };
}

function run(repositoryRoot = path.resolve(__dirname, '..')) {
  const report = audit(repositoryRoot);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      `brand audit: ${report.total} legacy-name occurrence(s); ${report.blocking.length} blocking line(s)\n`,
    );
    for (const [category, count] of Object.entries(report.categoryCounts).sort()) {
      process.stdout.write(`${category}: ${count}\n`);
    }
    for (const item of report.blocking) {
      process.stderr.write(`${item.file}:${item.line} [${item.category}] ${item.reason}\n`);
    }
  }
  return report.blocking.length === 0 ? 0 : 1;
}

if (require.main === module) process.exitCode = run();

module.exports = { RETENTION_RULES, audit, classifyOccurrence, run };
