import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REPOSITORY_CHECKS = Object.freeze([
  'qualityGates',
  'productionRuntime',
  'coreRuntime',
  'dashboardBrowser',
  'reservationsRuntime',
  'stockTransferRuntime',
  'performanceReliability',
  'backupRestoreRecovery',
  'telemetrySecurityPrivacy',
  'migrationUpgradeSafety',
]);

export const EXTERNAL_CHECKS = Object.freeze([
  'independentSecurityReview',
  'independentPrivacyReview',
  'qualifiedComplianceReview',
  'realEnvironmentConfiguration',
  'authenticatedTlsOperatorIngress',
  'alertDeliveryIncidentDrill',
  'productionBackupStorageAndPitr',
  'measuredRecoveryDrill',
  'rollbackCanaryDrill',
  'incidentResponseDrill',
]);

const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const IMAGE_DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const APP_VERSION_RE = /^[A-Za-z0-9._-]{1,64}$/;
const EVIDENCE_REF_RE = /^[A-Za-z0-9._:/#-]{3,500}$/;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function listFilesRecursively(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursively(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export function hashDirectory(directory, base = directory) {
  const hash = crypto.createHash('sha256');
  for (const file of listFilesRecursively(directory)) {
    const relative = path.relative(base, file).split(path.sep).join('/');
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function validateCandidate(candidate, expectedSha = candidate?.releaseSha) {
  const failures = [];
  if (!candidate || candidate.schemaVersion !== 1)
    failures.push('candidate schemaVersion must be 1');
  if (!SHA_RE.test(candidate?.releaseSha ?? ''))
    failures.push('candidate releaseSha must be a full lowercase 40-character Git SHA');
  if (expectedSha && candidate?.releaseSha !== expectedSha)
    failures.push('candidate releaseSha does not match the expected exact release SHA');
  if (!SHA_RE.test(candidate?.gitTreeSha ?? ''))
    failures.push('candidate gitTreeSha must be a full lowercase 40-character Git tree SHA');
  if (!SHA256_RE.test(candidate?.sourceArchiveSha256 ?? ''))
    failures.push('candidate sourceArchiveSha256 must be a SHA-256 hex digest');
  if (!SHA256_RE.test(candidate?.lockfileSha256 ?? ''))
    failures.push('candidate lockfileSha256 must be a SHA-256 hex digest');
  if (!SHA256_RE.test(candidate?.migrationsSha256 ?? ''))
    failures.push('candidate migrationsSha256 must be a SHA-256 hex digest');
  if (!IMAGE_DIGEST_RE.test(candidate?.containerImageId ?? ''))
    failures.push('candidate containerImageId must be a sha256 image identifier');
  if (!APP_VERSION_RE.test(candidate?.appVersion ?? ''))
    failures.push('candidate appVersion is missing or invalid');
  return failures;
}

function rejectUnknownKeys(value, allowed, label, failures) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) failures.push(`${label} contains unsupported field: ${key}`);
  }
}

function checkEvidenceRef(value, label, failures) {
  if (typeof value !== 'string' || !EVIDENCE_REF_RE.test(value)) {
    failures.push(
      `${label} evidenceRef must be an opaque bounded reference without query strings, credentials or free text`,
    );
  }
}

function validateCheckGroup(group, keys, releaseSha, prefix, failures) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) {
    failures.push(`${prefix} checks are missing`);
    return;
  }
  for (const key of keys) {
    const check = group[key];
    rejectUnknownKeys(
      check,
      prefix === 'repositoryChecks' ? ['status', 'sha', 'evidenceRef'] : ['status', 'evidenceRef'],
      `${prefix}.${key}`,
      failures,
    );
    if (!check || check.status !== 'PASS') {
      failures.push(`${prefix}.${key} must be PASS`);
      continue;
    }
    if (prefix === 'repositoryChecks' && check.sha !== releaseSha) {
      failures.push(`${prefix}.${key} must be bound to releaseSha`);
    }
    checkEvidenceRef(check.evidenceRef, `${prefix}.${key}`, failures);
  }
}

export function evaluateEvidence(evidence, expectedSha = evidence?.releaseSha) {
  const candidateFailures = validateCandidate(evidence?.candidate, expectedSha);
  const repositoryFailures = [...candidateFailures];

  rejectUnknownKeys(
    evidence,
    [
      'schemaVersion',
      'releaseSha',
      'appVersion',
      'candidate',
      'repositoryChecks',
      'externalChecks',
      'registryImageDigest',
      'openCriticalFindings',
      'decision',
    ],
    'evidence',
    repositoryFailures,
  );
  rejectUnknownKeys(
    evidence?.candidate,
    [
      'schemaVersion',
      'releaseSha',
      'appVersion',
      'gitTreeSha',
      'sourceArchiveSha256',
      'lockfileSha256',
      'migrationsSha256',
      'containerImageId',
    ],
    'candidate',
    repositoryFailures,
  );
  const productionFailures = [];

  if (!evidence || evidence.schemaVersion !== 1)
    repositoryFailures.push('evidence schemaVersion must be 1');
  if (evidence?.releaseSha !== evidence?.candidate?.releaseSha)
    repositoryFailures.push('evidence releaseSha must match candidate releaseSha');
  if (!APP_VERSION_RE.test(evidence?.appVersion ?? ''))
    repositoryFailures.push('evidence appVersion is missing or invalid');
  if (evidence?.appVersion !== evidence?.candidate?.appVersion)
    repositoryFailures.push('evidence appVersion must match candidate appVersion');

  validateCheckGroup(
    evidence?.repositoryChecks,
    REPOSITORY_CHECKS,
    evidence?.releaseSha,
    'repositoryChecks',
    repositoryFailures,
  );

  productionFailures.push(...repositoryFailures);

  validateCheckGroup(
    evidence?.externalChecks,
    EXTERNAL_CHECKS,
    evidence?.releaseSha,
    'externalChecks',
    productionFailures,
  );

  if (!IMAGE_DIGEST_RE.test(evidence?.registryImageDigest ?? '')) {
    productionFailures.push('registryImageDigest must be an immutable sha256 registry digest');
  }
  if (!Number.isInteger(evidence?.openCriticalFindings) || evidence.openCriticalFindings !== 0) {
    productionFailures.push('openCriticalFindings must be exactly 0');
  }
  rejectUnknownKeys(
    evidence?.decision,
    ['approved', 'approvalRef'],
    'decision',
    productionFailures,
  );
  if (evidence?.decision?.approved !== true)
    productionFailures.push('decision.approved must be true');
  checkEvidenceRef(evidence?.decision?.approvalRef, 'decision', productionFailures);

  return {
    repositoryReady: repositoryFailures.length === 0,
    productionGo: productionFailures.length === 0,
    repositoryFailures,
    productionFailures,
  };
}

export function createEvidenceTemplate(candidate) {
  const candidateFailures = validateCandidate(candidate);
  if (candidateFailures.length > 0) throw new Error(candidateFailures.join('; '));

  const repositoryChecks = Object.fromEntries(
    REPOSITORY_CHECKS.map((key) => [
      key,
      { status: 'PENDING', sha: candidate.releaseSha, evidenceRef: '' },
    ]),
  );
  const externalChecks = Object.fromEntries(
    EXTERNAL_CHECKS.map((key) => [key, { status: 'PENDING', evidenceRef: '' }]),
  );

  return {
    schemaVersion: 1,
    releaseSha: candidate.releaseSha,
    appVersion: candidate.appVersion,
    candidate,
    repositoryChecks,
    externalChecks,
    registryImageDigest: '',
    openCriticalFindings: null,
    decision: {
      approved: false,
      approvalRef: '',
    },
  };
}

export function generateCandidate({ cwd = root, appVersion, containerImageId }) {
  if (!APP_VERSION_RE.test(appVersion ?? ''))
    throw new Error('TASK_0050_APP_VERSION is missing or invalid');
  if (!IMAGE_DIGEST_RE.test(containerImageId ?? ''))
    throw new Error('TASK_0050_CONTAINER_IMAGE_ID must be a sha256 image identifier');

  const releaseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' })
    .trim()
    .toLowerCase();
  const gitTreeSha = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd, encoding: 'utf8' })
    .trim()
    .toLowerCase();
  const sourceArchive = execFileSync('git', ['archive', '--format=tar', 'HEAD'], {
    cwd,
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
  });
  const lockfile = fs.readFileSync(path.join(cwd, 'pnpm-lock.yaml'));
  const migrationDir = path.join(cwd, 'packages/database/prisma/migrations');

  const candidate = {
    schemaVersion: 1,
    releaseSha,
    appVersion,
    gitTreeSha,
    sourceArchiveSha256: sha256(sourceArchive),
    lockfileSha256: sha256(lockfile),
    migrationsSha256: hashDirectory(migrationDir),
    containerImageId: containerImageId.toLowerCase(),
  };

  const failures = validateCandidate(candidate, releaseSha);
  if (failures.length > 0) throw new Error(failures.join('; '));
  return candidate;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/pharmacy-release-certification.mjs candidate <output.json>',
    '  node scripts/pharmacy-release-certification.mjs template <candidate.json> <output.json>',
    '  node scripts/pharmacy-release-certification.mjs contract <evidence.json> <expected-sha>',
    '  node scripts/pharmacy-release-certification.mjs decide <evidence.json> <expected-sha>',
  ].join('\n');
}

export function run(argv = process.argv.slice(2)) {
  const [command, first, second] = argv;
  if (command === 'candidate' && first) {
    const candidate = generateCandidate({
      appVersion: process.env.TASK_0050_APP_VERSION,
      containerImageId: process.env.TASK_0050_CONTAINER_IMAGE_ID,
    });
    writeJson(first, candidate);
    console.log(`TASK 0050 RELEASE CANDIDATE: PASS (${candidate.releaseSha})`);
    return 0;
  }

  if (command === 'template' && first && second) {
    const candidate = readJson(first);
    const template = createEvidenceTemplate(candidate);
    writeJson(second, template);
    console.log(
      'TASK 0050 EVIDENCE TEMPLATE: PASS (production decision remains NO-GO until evidence is completed)',
    );
    return 0;
  }

  if ((command === 'contract' || command === 'decide') && first && second) {
    const evidence = readJson(first);
    const result = evaluateEvidence(evidence, second.toLowerCase());
    console.log(`repositoryReady=${result.repositoryReady ? 'PASS' : 'FAIL'}`);
    console.log(`productionDecision=${result.productionGo ? 'GO' : 'NO-GO'}`);

    if (!result.repositoryReady) {
      for (const reason of result.repositoryFailures) console.error(`[REPOSITORY] ${reason}`);
    }
    if (!result.productionGo) {
      for (const reason of result.productionFailures.filter(
        (reason) => !result.repositoryFailures.includes(reason),
      )) {
        console.error(`[PRODUCTION] ${reason}`);
      }
    }

    if (command === 'contract') {
      if (result.productionGo) {
        console.error(
          'Contract check expected the generated template to fail closed, but it produced GO.',
        );
        return 1;
      }
      console.log('TASK 0050 FAIL-CLOSED CONTRACT: PASS');
      return 0;
    }

    if (result.productionGo) {
      console.log('TASK 0050 PHARMACY-FIRST PRODUCTION GO/NO-GO: GO');
      return 0;
    }
    console.log('TASK 0050 PHARMACY-FIRST PRODUCTION GO/NO-GO: NO-GO');
    return 1;
  }

  console.error(usage());
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(
      `TASK 0050 CERTIFICATION ERROR: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
