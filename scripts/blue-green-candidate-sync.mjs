#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalFileHash,
  createVerifier,
  parseConnectionUrl,
  validateBackupFile,
} from './backup-recovery-core.mjs';
import {
  loadPolicy as loadRolePolicy,
  validateState,
  validateTransition,
} from './blue-green-environment-role-model.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const SYNC_POLICY_PATH = 'docs/architecture/blue-green-candidate-sync-policy.json';

function readRequired(repositoryRoot, relativePath) {
  const absolute = path.join(repositoryRoot, relativePath);
  if (!existsSync(absolute)) {
    throw new Error(`Required UM14.2 file missing: ${relativePath}`);
  }
  return readFileSync(absolute, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  const absolute = path.resolve(filePath);
  mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
  const temp = `${absolute}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temp, absolute);
  try {
    chmodSync(absolute, 0o600);
  } catch {
    // Best effort on platforms without POSIX modes.
  }
}

function normalizePath(value) {
  return path.resolve(value);
}

function isWithin(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function sameDatabaseEndpoint(left, right) {
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

export function validateSyncPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('UM14.2 policy must be an object');
  }
  if (
    policy.schemaVersion !== 1 ||
    policy.task !== 'UM14.2' ||
    policy.principle !== 'snapshot-rebuild-inactive-only'
  ) {
    throw new Error('UM14.2 policy identity/principle is invalid');
  }
  if (
    policy.sourceRole !== 'ACTIVE' ||
    policy.requiredTargetRole !== 'ROLLBACK' ||
    policy.targetRoleAfter !== 'CANDIDATE'
  ) {
    throw new Error('UM14.2 role transition policy is invalid');
  }
  if (
    policy.backup?.format !== 'postgres-custom' ||
    policy.backup?.encryptedStorageAcknowledgementRequired !== true ||
    policy.backup?.forbidRepositoryStorage !== true ||
    policy.backup?.fileMode !== '0600'
  ) {
    throw new Error('UM14.2 backup safety policy is incomplete');
  }
  for (const key of [
    'sourceMustMatchProductionReference',
    'targetMustDifferFromSource',
    'dropTargetRequiresExactConfirmation',
    'failedCandidateCleanupDefault',
    'applicationWriteAuthorityRemainsActive',
  ]) {
    if (policy.safety?.[key] !== true) {
      throw new Error(`UM14.2 safety policy must retain ${key}=true`);
    }
  }
  if (
    policy.evidence?.schemaVersion !== 1 ||
    policy.evidence?.referencePrefix !== 'bluegreen:sync:'
  ) {
    throw new Error('UM14.2 evidence policy is invalid');
  }
}

export function loadSyncPolicy(repositoryRoot = DEFAULT_ROOT) {
  const policy = JSON.parse(readRequired(repositoryRoot, SYNC_POLICY_PATH));
  validateSyncPolicy(policy);
  return policy;
}

function activeAndInactive(state) {
  const active = state.environments.find((environment) => environment.role === 'ACTIVE');
  const inactive = state.environments.find((environment) => environment.name !== active?.name);
  return { active, inactive };
}

export function expectedRebuildConfirmation(inactive) {
  return `REBUILD:${inactive.name}:${inactive.databaseIdentity}`;
}

export function validateCandidatePreparation({
  state,
  rolePolicy,
  syncPolicy,
  sourceDatabaseIdentity,
  candidateDatabaseIdentity,
  sourceConnection,
  candidateConnection,
  productionConnection,
  candidateReleaseSha,
  rebuildConfirmation,
  backupDir,
  repositoryRoot,
  encryptedStorageAcknowledged,
}) {
  const failures = [];
  try {
    validateSyncPolicy(syncPolicy);
  } catch (error) {
    failures.push(error.message);
    return failures;
  }

  failures.push(...validateState(state, rolePolicy).map((failure) => `state: ${failure}`));
  if (failures.length > 0) return failures;

  const { active, inactive } = activeAndInactive(state);

  if (inactive.role !== syncPolicy.requiredTargetRole) {
    failures.push('inactive environment must be ROLLBACK before candidate synchronization');
  }
  if (state.writeAuthority !== active.name) {
    failures.push('ACTIVE environment must retain application write authority');
  }
  if (sourceDatabaseIdentity !== active.databaseIdentity) {
    failures.push('source database identity must match the ACTIVE environment');
  }
  if (candidateDatabaseIdentity !== inactive.databaseIdentity) {
    failures.push('candidate database identity must match the inactive environment');
  }
  if (!new RegExp(rolePolicy.identifiers.releaseShaPattern).test(candidateReleaseSha ?? '')) {
    failures.push('candidate release SHA must be a full lowercase 40-character Git SHA');
  }
  if (!sameDatabaseEndpoint(sourceConnection, productionConnection)) {
    failures.push('source database must exactly match AIM_PRODUCTION_DATABASE_URL');
  }
  if (sameDatabaseEndpoint(sourceConnection, candidateConnection)) {
    failures.push('candidate database must be different from the ACTIVE source database');
  }
  if (['postgres', 'template0', 'template1'].includes(candidateConnection.database.toLowerCase())) {
    failures.push('candidate database name is a protected PostgreSQL system database');
  }
  if (rebuildConfirmation !== expectedRebuildConfirmation(inactive)) {
    failures.push('candidate rebuild confirmation does not match the inactive environment');
  }
  if (syncPolicy.backup.encryptedStorageAcknowledgementRequired && !encryptedStorageAcknowledged) {
    failures.push('encrypted backup storage acknowledgement is required');
  }

  const absoluteRoot = normalizePath(repositoryRoot);
  const absoluteBackupDir = normalizePath(backupDir);
  if (syncPolicy.backup.forbidRepositoryStorage && isWithin(absoluteBackupDir, absoluteRoot)) {
    failures.push('production blue/green snapshots must be stored outside the repository');
  }

  return failures;
}

export function evidenceRefFromHash(syncPolicy, sha256) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('snapshot SHA-256 is invalid');
  }
  return `${syncPolicy.evidence.referencePrefix}${sha256}`;
}

export function buildSynchronizationEvidence({
  syncPolicy,
  active,
  inactive,
  candidateReleaseSha,
  snapshotSha256,
  snapshotSizeBytes,
  snapshotFileName,
  migrationCount,
  verificationCheckCount,
  generatedAt,
}) {
  return {
    schemaVersion: syncPolicy.evidence.schemaVersion,
    task: 'UM14.2',
    evidenceRef: evidenceRefFromHash(syncPolicy, snapshotSha256),
    generatedAt,
    source: {
      environment: active.name,
      databaseIdentity: active.databaseIdentity,
      releaseSha: active.releaseSha,
    },
    candidate: {
      environment: inactive.name,
      databaseIdentity: inactive.databaseIdentity,
      releaseSha: candidateReleaseSha,
    },
    snapshot: {
      format: syncPolicy.backup.format,
      fileName: snapshotFileName,
      sha256: snapshotSha256,
      sizeBytes: snapshotSizeBytes,
      migrationCount,
    },
    verification: {
      passed: true,
      checkCount: verificationCheckCount,
    },
  };
}

export function buildNextCandidateState({
  state,
  active,
  inactive,
  candidateReleaseSha,
  evidenceRef,
}) {
  return {
    schemaVersion: state.schemaVersion,
    generation: state.generation + 1,
    writeAuthority: active.name,
    environments: state.environments.map((environment) => {
      if (environment.name === active.name) {
        return { ...environment };
      }
      return {
        name: inactive.name,
        role: 'CANDIDATE',
        releaseSha: candidateReleaseSha,
        databaseIdentity: inactive.databaseIdentity,
        synchronizedFrom: {
          environment: active.name,
          releaseSha: active.releaseSha,
          evidenceRef,
        },
      };
    }),
  };
}

function parseRequiredConnection(value, label) {
  if (!value || !value.trim()) throw new Error(`${label} is required`);
  try {
    return parseConnectionUrl(value);
  } catch (error) {
    throw new Error(`${label} is invalid: ${error.message}`);
  }
}

function runTool(connection, command, args) {
  return execFileSync(command, args, {
    env: { ...process.env, PGPASSWORD: connection.password },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
}

function psql(connection, database, query) {
  return runTool(connection, 'psql', [
    '-h',
    connection.host,
    '-p',
    connection.port,
    '-U',
    connection.user,
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-q',
    '-c',
    query,
  ]).trim();
}

function cleanupCandidate(connection) {
  runTool(connection, 'dropdb', [
    '-h',
    connection.host,
    '-p',
    connection.port,
    '-U',
    connection.user,
    '--maintenance-db=postgres',
    '--if-exists',
    '--force',
    connection.database,
  ]);
}

function checkRepositoryBoundary(repositoryRoot = DEFAULT_ROOT) {
  const failures = [];
  loadSyncPolicy(repositoryRoot);
  const required = [
    'scripts/blue-green-candidate-sync.mjs',
    'scripts/blue-green-candidate-sync.spec.mjs',
    SYNC_POLICY_PATH,
    'docs/adr/0034-blue-green-candidate-snapshot-rebuild.md',
    'docs/operations/um14-2-blue-green-candidate-sync.md',
    'docs/sprints/UM14.2-database-sync-candidate-creation.md',
  ];
  for (const relativePath of required) readRequired(repositoryRoot, relativePath);

  const packageJson = JSON.parse(readRequired(repositoryRoot, 'package.json'));
  if (
    !String(packageJson.scripts?.['test:blue-green-candidate-sync'] ?? '').includes(
      'blue-green-candidate-sync',
    )
  ) {
    failures.push('package.json is missing the focused UM14.2 candidate-sync test command');
  }
  const architecture = String(packageJson.scripts?.['test:architecture'] ?? '');
  if (
    !architecture.includes('blue-green-candidate-sync.spec.mjs') ||
    !architecture.includes('blue-green-candidate-sync.mjs boundary')
  ) {
    failures.push('UM14.2 is not included in the mandatory architecture quality gate');
  }

  const rules = readRequired(repositoryRoot, 'PROJECT_RULES.md');
  if (!rules.includes('## 16. Blue/green candidate synchronization governance')) {
    failures.push('PROJECT_RULES.md is missing the binding UM14.2 synchronization section');
  }
  const roadmap = readRequired(repositoryRoot, 'PRODUCT_ROADMAP.md');
  if (!roadmap.includes('UM14.2 Database Synchronization & Candidate Creation')) {
    failures.push('PRODUCT_ROADMAP.md is missing the UM14.2 synchronization task');
  }

  return failures;
}

function executeSynchronization(repositoryRoot = DEFAULT_ROOT) {
  const stateFile = process.env.AIM_BLUE_GREEN_STATE_FILE;
  const evidenceFile = process.env.AIM_BLUE_GREEN_EVIDENCE_FILE;
  const nextStateFile = process.env.AIM_BLUE_GREEN_NEXT_STATE_FILE;
  const backupDir = process.env.AIM_BLUE_GREEN_BACKUP_DIR;
  const sourceDatabaseIdentity = process.env.AIM_BLUE_GREEN_SOURCE_DATABASE_IDENTITY;
  const candidateDatabaseIdentity = process.env.AIM_BLUE_GREEN_CANDIDATE_DATABASE_IDENTITY;
  const candidateReleaseSha = process.env.AIM_BLUE_GREEN_CANDIDATE_RELEASE_SHA;
  const rebuildConfirmation = process.env.AIM_BLUE_GREEN_REBUILD_CONFIRMATION;
  const encryptedStorageAcknowledged = process.env.AIM_BLUE_GREEN_BACKUP_STORAGE_ENCRYPTED === '1';
  const keepFailedCandidate = process.env.AIM_BLUE_GREEN_KEEP_FAILED_CANDIDATE === '1';
  const keepFailedSnapshot = process.env.AIM_BLUE_GREEN_KEEP_FAILED_SNAPSHOT === '1';

  for (const [name, value] of [
    ['AIM_BLUE_GREEN_STATE_FILE', stateFile],
    ['AIM_BLUE_GREEN_EVIDENCE_FILE', evidenceFile],
    ['AIM_BLUE_GREEN_NEXT_STATE_FILE', nextStateFile],
    ['AIM_BLUE_GREEN_BACKUP_DIR', backupDir],
    ['AIM_BLUE_GREEN_SOURCE_DATABASE_IDENTITY', sourceDatabaseIdentity],
    ['AIM_BLUE_GREEN_CANDIDATE_DATABASE_IDENTITY', candidateDatabaseIdentity],
    ['AIM_BLUE_GREEN_CANDIDATE_RELEASE_SHA', candidateReleaseSha],
    ['AIM_BLUE_GREEN_REBUILD_CONFIRMATION', rebuildConfirmation],
  ]) {
    if (!value || !value.trim()) throw new Error(`${name} is required`);
  }
  if (!existsSync(stateFile)) throw new Error('AIM_BLUE_GREEN_STATE_FILE does not exist');

  const rolePolicy = loadRolePolicy(repositoryRoot);
  const syncPolicy = loadSyncPolicy(repositoryRoot);
  const state = readJson(stateFile);
  const sourceConnection = parseRequiredConnection(
    process.env.AIM_BLUE_GREEN_SOURCE_DATABASE_URL,
    'AIM_BLUE_GREEN_SOURCE_DATABASE_URL',
  );
  const candidateConnection = parseRequiredConnection(
    process.env.AIM_BLUE_GREEN_CANDIDATE_DATABASE_URL,
    'AIM_BLUE_GREEN_CANDIDATE_DATABASE_URL',
  );
  const productionConnection = parseRequiredConnection(
    process.env.AIM_PRODUCTION_DATABASE_URL,
    'AIM_PRODUCTION_DATABASE_URL',
  );

  const failures = validateCandidatePreparation({
    state,
    rolePolicy,
    syncPolicy,
    sourceDatabaseIdentity,
    candidateDatabaseIdentity,
    sourceConnection,
    candidateConnection,
    productionConnection,
    candidateReleaseSha,
    rebuildConfirmation,
    backupDir,
    repositoryRoot,
    encryptedStorageAcknowledged,
  });
  if (failures.length > 0) throw new Error(failures.join('; '));

  const { active, inactive } = activeAndInactive(state);
  mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
  const backupFileName = `aim-blue-green-${active.name.toLowerCase()}-to-${inactive.name.toLowerCase()}-${candidateReleaseSha.slice(0, 12)}-${stamp}.dump`;
  const backupPath = path.join(backupDir, backupFileName);
  let candidateTouched = false;
  let snapshotCreated = false;

  try {
    process.stdout.write(
      `UM14.2 source=${active.name} candidate=${inactive.name} writeAuthority=${state.writeAuthority}\n`,
    );
    process.stdout.write('Creating consistent PostgreSQL snapshot of ACTIVE database...\n');
    runTool(sourceConnection, 'pg_dump', [
      '-h',
      sourceConnection.host,
      '-p',
      sourceConnection.port,
      '-U',
      sourceConnection.user,
      '-d',
      sourceConnection.database,
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      backupPath,
    ]);
    snapshotCreated = true;
    try {
      chmodSync(backupPath, 0o600);
    } catch {
      // Best effort on platforms without POSIX modes.
    }

    const backupCheck = validateBackupFile(backupPath);
    if (!backupCheck.ok) throw new Error(backupCheck.reason);
    runTool(sourceConnection, 'pg_restore', ['--list', backupPath]);
    const snapshotSha256 = canonicalFileHash(backupPath);

    const migrationCount = Number(
      psql(
        sourceConnection,
        sourceConnection.database,
        'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;',
      ),
    );
    if (!Number.isInteger(migrationCount) || migrationCount < 1) {
      throw new Error('ACTIVE migration history could not be bounded before candidate rebuild');
    }

    process.stdout.write('Rebuilding inactive database from the verified snapshot...\n');
    cleanupCandidate(candidateConnection);
    candidateTouched = true;
    runTool(candidateConnection, 'createdb', [
      '-h',
      candidateConnection.host,
      '-p',
      candidateConnection.port,
      '-U',
      candidateConnection.user,
      '--maintenance-db=postgres',
      candidateConnection.database,
    ]);
    runTool(candidateConnection, 'pg_restore', [
      '-h',
      candidateConnection.host,
      '-p',
      candidateConnection.port,
      '-U',
      candidateConnection.user,
      '-d',
      candidateConnection.database,
      '--no-owner',
      '--no-privileges',
      backupPath,
    ]);

    const verifier = createVerifier(
      (database, query) => psql(candidateConnection, database, query),
      candidateConnection.database,
    );
    const verification = verifier.runAll({ expectedMigrations: migrationCount });
    if (!verification.passed) {
      const failed = verification.checks.filter((check) => !check.ok).map((check) => check.name);
      throw new Error(`candidate integrity verification failed: ${failed.join(', ')}`);
    }

    const evidence = buildSynchronizationEvidence({
      syncPolicy,
      active,
      inactive,
      candidateReleaseSha,
      snapshotSha256,
      snapshotSizeBytes: statSync(backupPath).size,
      snapshotFileName: backupFileName,
      migrationCount,
      verificationCheckCount: verification.checks.length,
      generatedAt: new Date().toISOString(),
    });
    const nextState = buildNextCandidateState({
      state,
      active,
      inactive,
      candidateReleaseSha,
      evidenceRef: evidence.evidenceRef,
    });
    const transitionFailures = validateTransition(state, nextState, rolePolicy);
    if (transitionFailures.length > 0) {
      throw new Error(`UM14.1 transition validation failed: ${transitionFailures.join('; ')}`);
    }

    writeJsonAtomic(evidenceFile, evidence);
    writeJsonAtomic(nextStateFile, nextState);

    process.stdout.write(`evidenceRef=${evidence.evidenceRef}\n`);
    process.stdout.write(`candidateRole=${inactive.name}:CANDIDATE\n`);
    process.stdout.write(`writeAuthority=${active.name}\n`);
    process.stdout.write('UM14.2 DATABASE SYNCHRONIZATION & CANDIDATE CREATION: PASS\n');
    return 0;
  } catch (error) {
    if (candidateTouched && !keepFailedCandidate) {
      try {
        cleanupCandidate(candidateConnection);
      } catch {
        process.stderr.write('Failed candidate cleanup requires operator attention.\n');
      }
    }
    if (snapshotCreated && !keepFailedSnapshot) {
      try {
        rmSync(backupPath, { force: true });
      } catch {
        process.stderr.write('Failed snapshot cleanup requires operator attention.\n');
      }
    }
    throw error;
  }
}

export function run(repositoryRoot = DEFAULT_ROOT, argv = process.argv.slice(2)) {
  const [mode = 'boundary'] = argv;
  if (mode === 'boundary') {
    const failures = checkRepositoryBoundary(repositoryRoot);
    if (failures.length === 0) {
      process.stdout.write('UM14.2 BLUE/GREEN CANDIDATE SYNC BOUNDARY: PASS\n');
      return 0;
    }
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    process.stderr.write(
      `UM14.2 BLUE/GREEN CANDIDATE SYNC BOUNDARY: FAIL (${failures.length} violation(s))\n`,
    );
    return 1;
  }
  if (mode === 'sync') return executeSynchronization(repositoryRoot);
  process.stderr.write('Usage: blue-green-candidate-sync.mjs boundary|sync\n');
  return 2;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run();
  } catch (error) {
    process.stderr.write(
      `UM14.2 DATABASE SYNCHRONIZATION & CANDIDATE CREATION: FAIL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
