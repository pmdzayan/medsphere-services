#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const POLICY_PATH = 'docs/architecture/bottleneck-governance.json';
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.env',
  '.js',
  '.json',
  '.mjs',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const SKIP_DIRECTORIES = new Set(['.git', '.next', '.turbo', 'coverage', 'dist', 'node_modules']);

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function isWithin(candidate, prefix) {
  return candidate === prefix || candidate.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

export function loadPolicy(repositoryRoot = DEFAULT_ROOT) {
  const absolute = path.join(repositoryRoot, POLICY_PATH);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Task 0058 policy missing: ${POLICY_PATH}`);
  }
  const policy = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  validatePolicyShape(policy);
  return policy;
}

export function validatePolicyShape(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('Task 0058 policy must be a JSON object');
  }
  if (policy.schemaVersion !== 1 || policy.task !== '0058') {
    throw new Error('Task 0058 policy schemaVersion/task identity is invalid');
  }
  if (policy.principle !== 'measure-before-complexity') {
    throw new Error('Task 0058 policy must retain measure-before-complexity');
  }
  if (!Array.isArray(policy.productionSurfaces) || policy.productionSurfaces.length === 0) {
    throw new Error('Task 0058 policy must declare production surfaces');
  }
  if (!Array.isArray(policy.excludedSurfaces)) {
    throw new Error('Task 0058 policy excludedSurfaces must be an array');
  }
  if (!Array.isArray(policy.complexityPatterns) || policy.complexityPatterns.length === 0) {
    throw new Error('Task 0058 policy must declare complexity patterns');
  }
  const ids = new Set();
  for (const item of policy.complexityPatterns) {
    if (!item?.id || ids.has(item.id)) {
      throw new Error('Task 0058 complexity pattern IDs must be unique and non-empty');
    }
    ids.add(item.id);
    if (!Array.isArray(item.markers) || item.markers.length === 0) {
      throw new Error(`Task 0058 pattern ${item.id} must declare markers`);
    }
    for (const marker of item.markers) {
      try {
        new RegExp(marker, 'i');
      } catch {
        throw new Error(`Task 0058 pattern ${item.id} has invalid regex marker: ${marker}`);
      }
    }
  }
  if (!Array.isArray(policy.approvedExceptions)) {
    throw new Error('Task 0058 approvedExceptions must be an array');
  }
  if (policy.requiredDecisionEvidence?.adrStatus !== 'Accepted') {
    throw new Error('Task 0058 scaling exceptions must require an Accepted ADR');
  }
}

function listFiles(absolutePath) {
  if (!fs.existsSync(absolutePath)) return [];
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [absolutePath];
  const files = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const candidate = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(candidate));
    else files.push(candidate);
  }
  return files;
}

export function productionFiles(repositoryRoot, policy) {
  const excluded = policy.excludedSurfaces.map((item) => normalize(item));
  const seen = new Set();
  const files = [];
  for (const surface of policy.productionSurfaces) {
    const absolute = path.join(repositoryRoot, surface);
    for (const file of listFiles(absolute)) {
      const relative = normalize(path.relative(repositoryRoot, file));
      if (excluded.some((prefix) => isWithin(relative, prefix))) continue;
      const extension = path.extname(relative);
      if (!TEXT_EXTENSIONS.has(extension) && path.basename(relative) !== 'Dockerfile') continue;
      if (seen.has(relative)) continue;
      seen.add(relative);
      files.push(relative);
    }
  }
  return files.sort();
}

function readText(repositoryRoot, relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function exceptionFor(policy, patternId, relativePath) {
  return policy.approvedExceptions.find(
    (entry) =>
      entry.patternId === patternId &&
      Array.isArray(entry.paths) &&
      entry.paths.some((prefix) => isWithin(relativePath, normalize(prefix))),
  );
}

function headingPresent(source, heading) {
  return new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, 'im').test(source);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}

export function validateException(repositoryRoot, policy, exception) {
  if (!exception?.adr || typeof exception.adr !== 'string') {
    return 'approved scaling exception is missing adr';
  }
  if (!Array.isArray(exception.evidence) || exception.evidence.length === 0) {
    return 'approved scaling exception is missing measured evidence references';
  }
  const adrPath = normalize(exception.adr);
  const absoluteAdr = path.join(repositoryRoot, adrPath);
  if (!fs.existsSync(absoluteAdr)) {
    return `approved scaling ADR does not exist: ${adrPath}`;
  }
  const adr = fs.readFileSync(absoluteAdr, 'utf8');
  if (!/^\*\*Status:\*\*\s+Accepted\s*$/im.test(adr)) {
    return `approved scaling ADR is not Accepted: ${adrPath}`;
  }
  for (const section of policy.requiredDecisionEvidence.requiredAdrSections ?? []) {
    if (!headingPresent(adr, section)) {
      return `approved scaling ADR is missing required section "${section}": ${adrPath}`;
    }
  }
  for (const phrase of policy.requiredDecisionEvidence.evidenceMustReference ?? []) {
    if (!adr.toLowerCase().includes(String(phrase).toLowerCase())) {
      return `approved scaling ADR is missing evidence phrase "${phrase}": ${adrPath}`;
    }
  }
  for (const evidence of exception.evidence) {
    const relative = normalize(evidence);
    if (!fs.existsSync(path.join(repositoryRoot, relative))) {
      return `approved scaling evidence does not exist: ${relative}`;
    }
  }
  return null;
}

export function findComplexityViolations(repositoryRoot, policy) {
  const violations = [];
  const exceptionValidation = new Map();
  for (const relativePath of productionFiles(repositoryRoot, policy)) {
    const source = readText(repositoryRoot, relativePath);
    for (const pattern of policy.complexityPatterns) {
      const matchingMarkers = pattern.markers.filter((marker) =>
        new RegExp(marker, 'i').test(source),
      );
      if (matchingMarkers.length === 0) continue;

      const exception = exceptionFor(policy, pattern.id, relativePath);
      if (!exception) {
        violations.push({
          file: relativePath,
          patternId: pattern.id,
          markers: matchingMarkers,
          reason: 'no accepted scaling decision/evidence exception',
        });
        continue;
      }

      const cacheKey = JSON.stringify(exception);
      let validation = exceptionValidation.get(cacheKey);
      if (validation === undefined) {
        validation = validateException(repositoryRoot, policy, exception);
        exceptionValidation.set(cacheKey, validation);
      }
      if (validation) {
        violations.push({
          file: relativePath,
          patternId: pattern.id,
          markers: matchingMarkers,
          reason: validation,
        });
      }
    }
  }
  return violations;
}

function numericLiteral(source, property) {
  const match = source.match(
    new RegExp(`\\b${escapeRegex(property)}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`),
  );
  if (!match) throw new Error(`Performance baseline property missing: ${property}`);
  return Number(match[1]);
}

export function validatePerformanceBaseline(repositoryRoot, policy) {
  const baseline = policy.currentRuntime;
  for (const evidencePath of [baseline.performanceEvidence, baseline.operationsEvidence]) {
    if (!evidencePath || !fs.existsSync(path.join(repositoryRoot, evidencePath))) {
      throw new Error(`Task 0058 baseline evidence missing: ${evidencePath ?? '<unset>'}`);
    }
  }

  const source = readText(repositoryRoot, baseline.performanceEvidence);
  const expected = {
    certificationWorkers: numericLiteral(source, 'certificationWorkers'),
    readOperations: numericLiteral(source, 'readOperations'),
    mutationOperations: numericLiteral(source, 'mutationOperations'),
    maxErrorRate: numericLiteral(source, 'maxErrorRate'),
    maxP95Ms: numericLiteral(source, 'maxP95Ms'),
    maxP99Ms: numericLiteral(source, 'maxP99Ms'),
  };

  const policyValues = {
    certificationWorkers: baseline.profile.certificationWorkers,
    readOperations: baseline.profile.readOperations,
    mutationOperations: baseline.profile.mutationOperations,
    maxErrorRate: baseline.thresholds.maxErrorRate,
    maxP95Ms: baseline.thresholds.maxP95Ms,
    maxP99Ms: baseline.thresholds.maxP99Ms,
  };

  for (const [key, value] of Object.entries(expected)) {
    if (policyValues[key] !== value) {
      throw new Error(
        `Task 0058 performance baseline drift for ${key}: policy=${policyValues[key]} runtime=${value}`,
      );
    }
  }
  if (
    baseline.profile.totalCertifiedOperations !==
    baseline.profile.readOperations + baseline.profile.mutationOperations
  ) {
    throw new Error('Task 0058 total certified operations do not reconcile');
  }
  return expected;
}

export function evaluateRepository(repositoryRoot = DEFAULT_ROOT) {
  const policy = loadPolicy(repositoryRoot);
  const baseline = validatePerformanceBaseline(repositoryRoot, policy);
  const violations = findComplexityViolations(repositoryRoot, policy);
  return { policy, baseline, violations };
}

export function run(repositoryRoot = DEFAULT_ROOT) {
  const { policy, baseline, violations } = evaluateRepository(repositoryRoot);
  process.stdout.write('TASK 0058 — ARCHITECTURE & BOTTLENECK GOVERNANCE\n');
  process.stdout.write(`principle=${policy.principle}\n`);
  process.stdout.write(`runtime=${policy.currentRuntime.applicationPath}\n`);
  process.stdout.write(
    `baseline=workers:${baseline.certificationWorkers} operations:${
      baseline.readOperations + baseline.mutationOperations
    } p95<=${baseline.maxP95Ms}ms p99<=${baseline.maxP99Ms}ms error<=${
      baseline.maxErrorRate * 100
    }%\n`,
  );

  if (violations.length === 0) {
    process.stdout.write('unjustified-production-scaling-primitives=0\n');
    process.stdout.write('TASK 0058 ARCHITECTURE BOTTLENECK GOVERNANCE: PASS\n');
    return 0;
  }

  for (const violation of violations) {
    process.stderr.write(
      `${violation.file}: ${violation.patternId}: ${violation.reason}; markers=${violation.markers.join(',')}\n`,
    );
  }
  process.stderr.write(
    `TASK 0058 ARCHITECTURE BOTTLENECK GOVERNANCE: FAIL (${violations.length} violation(s))\n`,
  );
  return 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run();
  } catch (error) {
    process.stderr.write(
      `TASK 0058 ARCHITECTURE BOTTLENECK GOVERNANCE: ERROR: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  }
}
