import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildNextCandidateState,
  buildSynchronizationEvidence,
  evidenceRefFromHash,
  expectedRebuildConfirmation,
  sameDatabaseEndpoint,
  validateCandidatePreparation,
  validateSyncPolicy,
} from './blue-green-candidate-sync.mjs';
import { validateTransition } from './blue-green-environment-role-model.mjs';

const rolePolicy = {
  schemaVersion: 1,
  task: 'UM14.1',
  principle: 'roles-not-colors-single-write-authority',
  physicalEnvironments: ['BLUE', 'GREEN'],
  roles: ['ACTIVE', 'CANDIDATE', 'ROLLBACK'],
  constraints: {
    exactActiveCount: 1,
    maxCandidateCount: 1,
    maxRollbackCount: 1,
    activeWriteAuthorityOnly: true,
    candidateRequiresActiveSyncEvidence: true,
    directRollbackToActiveForbidden: true,
    colorsArePermanentRoles: false,
  },
  identifiers: {
    releaseShaPattern: '^[0-9a-f]{40}$',
    databaseIdentityPattern: '^[A-Za-z0-9._-]{3,80}$',
    evidenceRefPattern: '^[A-Za-z0-9._:/#-]{3,500}$',
  },
};

const syncPolicy = {
  schemaVersion: 1,
  task: 'UM14.2',
  principle: 'snapshot-rebuild-inactive-only',
  sourceRole: 'ACTIVE',
  requiredTargetRole: 'ROLLBACK',
  targetRoleAfter: 'CANDIDATE',
  backup: {
    format: 'postgres-custom',
    encryptedStorageAcknowledgementRequired: true,
    forbidRepositoryStorage: true,
    fileMode: '0600',
  },
  safety: {
    sourceMustMatchProductionReference: true,
    targetMustDifferFromSource: true,
    dropTargetRequiresExactConfirmation: true,
    failedCandidateCleanupDefault: true,
    applicationWriteAuthorityRemainsActive: true,
  },
  evidence: {
    schemaVersion: 1,
    referencePrefix: 'bluegreen:sync:',
  },
};

const ACTIVE_SHA = '1'.repeat(40);
const CANDIDATE_SHA = '2'.repeat(40);

function state() {
  return {
    schemaVersion: 1,
    generation: 4,
    writeAuthority: 'BLUE',
    environments: [
      {
        name: 'BLUE',
        role: 'ACTIVE',
        releaseSha: ACTIVE_SHA,
        databaseIdentity: 'aim-prod-blue',
      },
      {
        name: 'GREEN',
        role: 'ROLLBACK',
        releaseSha: '0'.repeat(40),
        databaseIdentity: 'aim-prod-green',
      },
    ],
  };
}

const source = {
  host: 'blue-db.internal',
  port: '5432',
  user: 'operator',
  password: 'source-secret',
  database: 'aim_blue',
};

const candidate = {
  host: 'green-db.internal',
  port: '5432',
  user: 'operator',
  password: 'target-secret',
  database: 'aim_green',
};

function preparation(overrides = {}) {
  const current = state();
  return {
    state: current,
    rolePolicy,
    syncPolicy,
    sourceDatabaseIdentity: 'aim-prod-blue',
    candidateDatabaseIdentity: 'aim-prod-green',
    sourceConnection: source,
    candidateConnection: candidate,
    productionConnection: { ...source },
    candidateReleaseSha: CANDIDATE_SHA,
    rebuildConfirmation: expectedRebuildConfirmation(current.environments[1]),
    backupDir: path.resolve('/secure/aim-blue-green'),
    repositoryRoot: path.resolve('/workspace/aim'),
    encryptedStorageAcknowledged: true,
    ...overrides,
  };
}

describe('UM14.2 database synchronization and candidate creation', () => {
  it('retains the snapshot-rebuild-inactive-only safety policy', () => {
    assert.doesNotThrow(() => validateSyncPolicy(syncPolicy));
    assert.throws(
      () =>
        validateSyncPolicy({
          ...syncPolicy,
          safety: { ...syncPolicy.safety, applicationWriteAuthorityRemainsActive: false },
        }),
      /applicationWriteAuthorityRemainsActive/,
    );
  });

  it('accepts a guarded ACTIVE -> inactive ROLLBACK preparation', () => {
    assert.deepEqual(validateCandidatePreparation(preparation()), []);
  });

  it('requires the declared source to be the exact live production database', () => {
    const failures = validateCandidatePreparation(
      preparation({
        productionConnection: { ...source, database: 'not_live' },
      }),
    );
    assert.ok(failures.some((failure) => failure.includes('AIM_PRODUCTION_DATABASE_URL')));
  });

  it('rejects rebuilding the ACTIVE database or any identical database endpoint', () => {
    assert.equal(sameDatabaseEndpoint(source, { ...source }), true);
    const failures = validateCandidatePreparation(
      preparation({ candidateConnection: { ...source } }),
    );
    assert.ok(failures.some((failure) => failure.includes('different from the ACTIVE')));
  });

  it('requires the inactive environment to remain ROLLBACK until the snapshot succeeds', () => {
    const current = state();
    current.environments[1].role = 'CANDIDATE';
    current.environments[1].synchronizedFrom = {
      environment: 'BLUE',
      releaseSha: ACTIVE_SHA,
      evidenceRef: 'bluegreen:sync:old',
    };
    const failures = validateCandidatePreparation(preparation({ state: current }));
    assert.ok(failures.some((failure) => failure.includes('must be ROLLBACK')));
  });

  it('requires exact destructive-rebuild confirmation for the inactive database identity', () => {
    const failures = validateCandidatePreparation(
      preparation({ rebuildConfirmation: 'REBUILD:GREEN:wrong-database' }),
    );
    assert.ok(failures.some((failure) => failure.includes('rebuild confirmation')));
  });

  it('requires encrypted snapshot storage and refuses repository-local snapshot directories', () => {
    const encryptionFailures = validateCandidatePreparation(
      preparation({ encryptedStorageAcknowledged: false }),
    );
    assert.ok(encryptionFailures.some((failure) => failure.includes('encrypted backup storage')));

    const pathFailures = validateCandidatePreparation(
      preparation({
        backupDir: path.resolve('/workspace/aim/private-snapshots'),
      }),
    );
    assert.ok(pathFailures.some((failure) => failure.includes('outside the repository')));
  });

  it('builds evidence without connection URLs, users, passwords, or PHI fields', () => {
    const current = state();
    const hash = 'a'.repeat(64);
    const evidence = buildSynchronizationEvidence({
      syncPolicy,
      active: current.environments[0],
      inactive: current.environments[1],
      candidateReleaseSha: CANDIDATE_SHA,
      snapshotSha256: hash,
      snapshotSizeBytes: 12345,
      snapshotFileName: 'snapshot.dump',
      migrationCount: 42,
      verificationCheckCount: 25,
      generatedAt: '2026-09-26T00:00:00.000Z',
    });
    assert.equal(evidence.evidenceRef, evidenceRefFromHash(syncPolicy, hash));
    const serialized = JSON.stringify(evidence);
    assert.equal(serialized.includes('source-secret'), false);
    assert.equal(serialized.includes('target-secret'), false);
    assert.equal(serialized.includes('postgresql://'), false);
    assert.equal(serialized.includes('operator'), false);
  });

  it('generates the UM14.1-valid next state while ACTIVE retains write authority', () => {
    const current = state();
    const active = current.environments[0];
    const inactive = current.environments[1];
    const next = buildNextCandidateState({
      state: current,
      active,
      inactive,
      candidateReleaseSha: CANDIDATE_SHA,
      evidenceRef: `bluegreen:sync:${'b'.repeat(64)}`,
    });

    assert.equal(next.writeAuthority, 'BLUE');
    assert.equal(next.environments[0].role, 'ACTIVE');
    assert.equal(next.environments[1].role, 'CANDIDATE');
    assert.equal(next.environments[1].releaseSha, CANDIDATE_SHA);
    assert.deepEqual(validateTransition(current, next, rolePolicy), []);
  });
});
