#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const POLICY_PATH = 'docs/architecture/ai-code-security-data-integrity-policy.json';

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function readRequired(repositoryRoot, relativePath) {
  const absolute = path.join(repositoryRoot, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Required Task 0060 file missing: ${relativePath}`);
  }
  return fs.readFileSync(absolute, 'utf8');
}

function regexFrom(rule) {
  try {
    return new RegExp(rule.pattern, rule.flags ?? '');
  } catch (error) {
    throw new Error(`Task 0060 rule ${rule.id} has an invalid regex: ${error.message}`);
  }
}

function validateRuleArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Task 0060 ${label} must be a non-empty array`);
  }
  for (const rule of value) {
    if (!rule || typeof rule.id !== 'string' || typeof rule.pattern !== 'string') {
      throw new Error(`Task 0060 ${label} contains an invalid rule`);
    }
    regexFrom(rule);
  }
}

export function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('Task 0060 policy must be an object');
  }
  if (policy.schemaVersion !== 1 || policy.task !== '0060') {
    throw new Error('Task 0060 policy identity is invalid');
  }
  if (policy.principle !== 'independent-review-for-high-risk-healthcare-changes') {
    throw new Error('Task 0060 security principle changed');
  }
  if (!Array.isArray(policy.reviewRequired) || policy.reviewRequired.length === 0) {
    throw new Error('Task 0060 review-required paths are missing');
  }
  for (const entry of policy.reviewRequired) {
    if (!entry?.id || !Array.isArray(entry.prefixes) || entry.prefixes.length === 0) {
      throw new Error('Task 0060 has an invalid review-required entry');
    }
  }
  validateRuleArray(policy.hardFailRules, 'hard-fail rules');
  validateRuleArray(policy.destructiveMigrationRules, 'destructive migration rules');
  if (!Array.isArray(policy.reviewSignals)) {
    throw new Error('Task 0060 review signals must be an array');
  }
  for (const signal of policy.reviewSignals) {
    if (!signal?.id || (!signal.pattern && !signal.removedPattern)) {
      throw new Error('Task 0060 has an invalid review signal');
    }
    if (signal.pattern) regexFrom(signal);
    if (signal.removedPattern) {
      try {
        new RegExp(signal.removedPattern, signal.flags ?? '');
      } catch (error) {
        throw new Error(
          `Task 0060 review signal ${signal.id} has an invalid regex: ${error.message}`,
        );
      }
    }
  }
  if (!Array.isArray(policy.forbiddenTrackedFiles) || policy.forbiddenTrackedFiles.length === 0) {
    throw new Error('Task 0060 forbidden tracked-file rules are missing');
  }
  for (const pattern of policy.forbiddenTrackedFiles) new RegExp(pattern, 'i');
  if (!Array.isArray(policy.exceptions)) {
    throw new Error('Task 0060 exceptions must be an array');
  }
  for (const exception of policy.exceptions) {
    if (
      !exception?.id ||
      !exception?.ruleId ||
      !exception?.path ||
      !exception?.adrPath ||
      !exception?.expiresAt
    ) {
      throw new Error('Task 0060 contains an invalid exception');
    }
  }
  if (
    !policy.bootstrap?.baseSha ||
    !policy.bootstrap?.expiresAt ||
    !Array.isArray(policy.bootstrap?.allowedPaths) ||
    policy.bootstrap.allowedPaths.length === 0
  ) {
    throw new Error('Task 0060 bounded bootstrap definition is missing');
  }
}

export function loadPolicy(repositoryRoot = DEFAULT_ROOT) {
  const policy = JSON.parse(readRequired(repositoryRoot, POLICY_PATH));
  validatePolicy(policy);
  return policy;
}

function pathMatchesEntry(relativePath, entry) {
  const excluded = (entry.excludeSuffixes ?? []).some((suffix) => relativePath.endsWith(suffix));
  if (excluded) return false;
  return entry.prefixes.some(
    (prefix) => relativePath === prefix || relativePath.startsWith(prefix),
  );
}

export function classifyHighRiskFiles(files, policy) {
  return files.flatMap((file) => {
    const normalized = normalize(file);
    return policy.reviewRequired
      .filter((entry) => pathMatchesEntry(normalized, entry))
      .map((entry) => ({ file: normalized, category: entry.id }));
  });
}

function isTestOrFixture(relativePath) {
  return (
    /\.(spec|test)\.[cm]?[jt]sx?$/.test(relativePath) ||
    relativePath.includes('/testing/') ||
    relativePath.includes('/fixtures/') ||
    relativePath.includes('/__fixtures__/')
  );
}

function isProductionCode(relativePath) {
  if (isTestOrFixture(relativePath)) return false;
  return (
    relativePath.startsWith('apps/') ||
    relativePath.startsWith('packages/') ||
    relativePath.startsWith('services/')
  );
}

function isSensitiveSource(relativePath) {
  if (isTestOrFixture(relativePath)) return false;
  return (
    isProductionCode(relativePath) ||
    relativePath.startsWith('.github/workflows/') ||
    relativePath.startsWith('compose/') ||
    /(^|\/)(Dockerfile|docker-compose[^/]*)$/i.test(relativePath)
  );
}

function isMigrationFile(relativePath) {
  return (
    relativePath.startsWith('packages/database/prisma/migrations/') && relativePath.endsWith('.sql')
  );
}

export function parsePatch(patch) {
  const additions = [];
  const removals = [];
  let currentFile = null;

  for (const line of String(patch).split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      currentFile = normalize(line.slice(6));
      continue;
    }
    if (line.startsWith('+++ /dev/null')) {
      currentFile = null;
      continue;
    }
    if (!currentFile || line.startsWith('@@') || line.startsWith('diff --git')) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions.push({ file: currentFile, text: line.slice(1) });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removals.push({ file: currentFile, text: line.slice(1) });
    }
  }

  return { additions, removals };
}

function exceptionAllows(repositoryRoot, policy, ruleId, relativePath, now = new Date()) {
  const exception = policy.exceptions.find(
    (candidate) => candidate.ruleId === ruleId && candidate.path === relativePath,
  );
  if (!exception) return false;
  const expiry = new Date(exception.expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry <= now) return false;
  const adr = readRequired(repositoryRoot, exception.adrPath);
  return /\*\*Status:\*\*\s+Accepted\b/i.test(adr);
}

export function analyzeChangeSet({
  repositoryRoot = DEFAULT_ROOT,
  files,
  patch,
  policy = loadPolicy(repositoryRoot),
  now = new Date(),
}) {
  const normalizedFiles = [...new Set(files.map(normalize))];
  const highRisk = classifyHighRiskFiles(normalizedFiles, policy);
  const { additions, removals } = parsePatch(patch);
  const hardFailures = [];
  const reviewSignals = [];

  for (const added of additions) {
    for (const rule of policy.hardFailRules) {
      const inScope =
        rule.scope === 'production-code'
          ? isProductionCode(added.file)
          : rule.scope === 'sensitive-source'
            ? isSensitiveSource(added.file)
            : true;
      if (!inScope || !regexFrom(rule).test(added.text)) continue;
      if (!exceptionAllows(repositoryRoot, policy, rule.id, added.file, now)) {
        hardFailures.push({ file: added.file, rule: rule.id, evidence: added.text.trim() });
      }
    }

    if (isMigrationFile(added.file)) {
      for (const rule of policy.destructiveMigrationRules) {
        if (!regexFrom(rule).test(added.text)) continue;
        if (!exceptionAllows(repositoryRoot, policy, rule.id, added.file, now)) {
          hardFailures.push({ file: added.file, rule: rule.id, evidence: added.text.trim() });
        }
      }
    }

    for (const signal of policy.reviewSignals) {
      if (!signal.pattern) continue;
      const regex = new RegExp(signal.pattern, signal.flags ?? '');
      if (regex.test(added.text)) {
        reviewSignals.push({ file: added.file, signal: signal.id, direction: 'added' });
      }
    }
  }

  for (const removed of removals) {
    for (const signal of policy.reviewSignals) {
      if (!signal.removedPattern) continue;
      const regex = new RegExp(signal.removedPattern, signal.flags ?? '');
      if (regex.test(removed.text)) {
        reviewSignals.push({ file: removed.file, signal: signal.id, direction: 'removed' });
      }
    }
  }

  return {
    files: normalizedFiles,
    hardFailures,
    highRisk,
    reviewSignals,
    reviewRequired: highRisk.length > 0 || reviewSignals.length > 0,
  };
}

export function evaluateIndependentReviews(reviews, author) {
  const normalizedAuthor = String(author ?? '').toLowerCase();
  const latestByReviewer = new Map();

  for (const review of Array.isArray(reviews) ? reviews : []) {
    const login = review?.user?.login;
    if (
      !login ||
      String(login).toLowerCase() === normalizedAuthor ||
      review?.user?.type === 'Bot'
    ) {
      continue;
    }
    const submittedAt = Date.parse(review.submitted_at ?? '') || 0;
    const existing = latestByReviewer.get(login);
    if (!existing || submittedAt >= existing.submittedAt) {
      latestByReviewer.set(login, { state: review.state, submittedAt });
    }
  }

  const approvedBy = [...latestByReviewer.entries()]
    .filter(([, review]) => review.state === 'APPROVED')
    .map(([login]) => login)
    .sort();

  return { approved: approvedBy.length > 0, approvedBy };
}

export function isBootstrapReviewWaiver({ policy, base, files, now = new Date() }) {
  if (base !== policy.bootstrap.baseSha) return false;
  const expiry = new Date(policy.bootstrap.expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry <= now) return false;
  const allowed = new Set(policy.bootstrap.allowedPaths.map(normalize));
  return files.length > 0 && files.every((file) => allowed.has(normalize(file)));
}

function walkFiles(root, relative = '') {
  const absolute = path.join(root, relative);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const next = normalize(path.join(relative, entry.name));
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', '.next', 'coverage', 'dist', 'build'].includes(entry.name))
        return [];
      return walkFiles(root, next);
    }
    return [next];
  });
}

function scanTrackedFilePolicy(repositoryRoot, policy) {
  const failures = [];
  const files = walkFiles(repositoryRoot);
  const forbidden = policy.forbiddenTrackedFiles.map((pattern) => new RegExp(pattern, 'i'));

  for (const relativePath of files) {
    if (relativePath.endsWith('.example')) continue;
    if (forbidden.some((regex) => regex.test(relativePath))) {
      failures.push(`Forbidden secret-bearing file is tracked: ${relativePath}`);
    }
  }

  return failures;
}

export function checkRepositoryBoundary(repositoryRoot = DEFAULT_ROOT) {
  const policy = loadPolicy(repositoryRoot);
  const failures = [];

  const requiredFiles = [
    'scripts/ai-code-security-data-integrity-gate.mjs',
    'scripts/ai-code-security-data-integrity-gate.spec.mjs',
    '.github/workflows/ai-code-security-data-integrity.yml',
    'docs/adr/0032-independent-ai-code-security-data-integrity-gate.md',
    'docs/operations/task-0060-ai-code-security-data-integrity.md',
    'docs/sprints/Task-0060-ai-code-security-data-integrity.md',
  ];
  for (const relativePath of requiredFiles) readRequired(repositoryRoot, relativePath);

  const packageJson = JSON.parse(readRequired(repositoryRoot, 'package.json'));
  if (
    !String(packageJson.scripts?.['test:ai-code-security-gate'] ?? '').includes(
      'ai-code-security-data-integrity-gate',
    )
  ) {
    failures.push('package.json is missing the focused Task 0060 security-gate command.');
  }
  const architectureScript = String(packageJson.scripts?.['test:architecture'] ?? '');
  if (
    !architectureScript.includes('ai-code-security-data-integrity-gate.spec.mjs') ||
    !architectureScript.includes('ai-code-security-data-integrity-gate.mjs')
  ) {
    failures.push('Task 0060 is not included in the mandatory architecture quality gate.');
  }

  const workflow = readRequired(
    repositoryRoot,
    '.github/workflows/ai-code-security-data-integrity.yml',
  );
  for (const marker of [
    'pull_request_review:',
    'pull-requests: read',
    'gh api',
    'ai-code-security-data-integrity-gate.mjs diff',
    '--base',
  ]) {
    if (!workflow.includes(marker)) {
      failures.push(`Task 0060 workflow is missing required marker: ${marker}`);
    }
  }

  const rules = readRequired(repositoryRoot, 'PROJECT_RULES.md');
  if (!rules.includes('## 14. AI-code security and data-integrity governance')) {
    failures.push('PROJECT_RULES.md is missing the binding Task 0060 governance section.');
  }

  failures.push(...scanTrackedFilePolicy(repositoryRoot, policy));
  return failures;
}

function git(repositoryRoot, args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function parseArgs(argv) {
  const values = { mode: argv[2] ?? 'boundary' };
  for (let index = 3; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    values[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return values;
}

function printFailure(message) {
  process.stderr.write(`${message}\n`);
}

export function runBoundary(repositoryRoot = DEFAULT_ROOT) {
  try {
    const failures = checkRepositoryBoundary(repositoryRoot);
    if (failures.length === 0) {
      process.stdout.write('TASK 0060 AI-CODE SECURITY/DATA-INTEGRITY BOUNDARY: PASS\n');
      return 0;
    }
    failures.forEach(printFailure);
    printFailure(
      `TASK 0060 AI-CODE SECURITY/DATA-INTEGRITY BOUNDARY: FAIL (${failures.length} violation(s))`,
    );
    return 1;
  } catch (error) {
    printFailure(`TASK 0060 AI-CODE SECURITY/DATA-INTEGRITY BOUNDARY: ERROR: ${error.message}`);
    return 1;
  }
}

export function runDiff({ repositoryRoot = DEFAULT_ROOT, base, head, author, reviewsPath }) {
  try {
    if (!base || !head) throw new Error('diff mode requires --base and --head');
    const policy = loadPolicy(repositoryRoot);
    const files = git(repositoryRoot, ['diff', '--name-only', `${base}...${head}`])
      .split(/\r?\n/)
      .filter(Boolean);
    const patch = git(repositoryRoot, ['diff', '--unified=0', '--no-color', `${base}...${head}`]);
    const result = analyzeChangeSet({ repositoryRoot, files, patch, policy });

    if (result.hardFailures.length > 0) {
      for (const failure of result.hardFailures) {
        printFailure(
          `Hard security failure [${failure.rule}] in ${failure.file}: ${failure.evidence}`,
        );
      }
      printFailure(`TASK 0060 CHANGE GATE: FAIL (${result.hardFailures.length} hard violation(s))`);
      return 1;
    }

    if (!result.reviewRequired) {
      process.stdout.write('TASK 0060 CHANGE GATE: PASS (no high-risk review surface changed)\n');
      return 0;
    }

    if (isBootstrapReviewWaiver({ policy, base, files })) {
      process.stdout.write(
        'TASK 0060 CHANGE GATE: PASS (bounded Task 0060 bootstrap review waiver)\n',
      );
      return 0;
    }

    if (!author) throw new Error('high-risk diff requires --author');
    if (!reviewsPath) throw new Error('high-risk diff requires --reviews');
    const reviews = JSON.parse(fs.readFileSync(reviewsPath, 'utf8'));
    const review = evaluateIndependentReviews(reviews, author);
    if (!review.approved) {
      const categories = [...new Set(result.highRisk.map((entry) => entry.category))];
      printFailure(
        `Independent approval required for high-risk AIM change. Categories: ${categories.join(', ') || 'review-signal'}.`,
      );
      printFailure(
        'The approving reviewer must be different from the PR author and their latest review must be APPROVED.',
      );
      return 1;
    }

    process.stdout.write(
      `TASK 0060 CHANGE GATE: PASS (independent approval by ${review.approvedBy.join(', ')})\n`,
    );
    return 0;
  } catch (error) {
    printFailure(`TASK 0060 CHANGE GATE: ERROR: ${error.message}`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv);
  process.exitCode =
    args.mode === 'diff'
      ? runDiff({
          base: args.base,
          head: args.head,
          author: args.author,
          reviewsPath: args.reviews,
        })
      : runBoundary();
}
