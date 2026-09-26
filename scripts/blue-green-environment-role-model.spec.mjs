import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validatePolicy,
  validateState,
  validateTransition,
} from './blue-green-environment-role-model.mjs';

const policy = {
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

const BLUE_SHA = '1'.repeat(40);
const GREEN_SHA = '2'.repeat(40);

function rollbackState() {
  return {
    schemaVersion: 1,
    generation: 1,
    writeAuthority: 'BLUE',
    environments: [
      { name: 'BLUE', role: 'ACTIVE', releaseSha: BLUE_SHA, databaseIdentity: 'aim-prod-blue' },
      {
        name: 'GREEN',
        role: 'ROLLBACK',
        releaseSha: '0'.repeat(40),
        databaseIdentity: 'aim-prod-green',
      },
    ],
  };
}

function candidateState() {
  return {
    schemaVersion: 1,
    generation: 2,
    writeAuthority: 'BLUE',
    environments: [
      { name: 'BLUE', role: 'ACTIVE', releaseSha: BLUE_SHA, databaseIdentity: 'aim-prod-blue' },
      {
        name: 'GREEN',
        role: 'CANDIDATE',
        releaseSha: GREEN_SHA,
        databaseIdentity: 'aim-prod-green',
        synchronizedFrom: {
          environment: 'BLUE',
          releaseSha: BLUE_SHA,
          evidenceRef: 'backup:sync:release-2',
        },
      },
    ],
  };
}

function promotedState() {
  return {
    schemaVersion: 1,
    generation: 3,
    writeAuthority: 'GREEN',
    environments: [
      { name: 'BLUE', role: 'ROLLBACK', releaseSha: BLUE_SHA, databaseIdentity: 'aim-prod-blue' },
      { name: 'GREEN', role: 'ACTIVE', releaseSha: GREEN_SHA, databaseIdentity: 'aim-prod-green' },
    ],
  };
}

describe('UM14.1 blue/green environment role model', () => {
  it('requires the stable roles-not-colors single-write policy', () => {
    assert.doesNotThrow(() => validatePolicy(policy));
    assert.throws(
      () => validatePolicy({ ...policy, principle: 'blue-is-always-production' }),
      /principle changed/,
    );
  });

  it('accepts exactly one ACTIVE write authority with one ROLLBACK environment', () => {
    assert.deepEqual(validateState(rollbackState(), policy), []);
  });

  it('rejects split-brain write authority and duplicate ACTIVE roles', () => {
    const state = rollbackState();
    state.environments[1].role = 'ACTIVE';
    state.writeAuthority = 'GREEN';
    const failures = validateState(state, policy);
    assert.ok(
      failures.some((failure) => failure.includes('exactly one environment must be ACTIVE')),
    );
  });

  it('requires a candidate to prove synchronization from the current ACTIVE release', () => {
    const state = candidateState();
    state.environments[1].synchronizedFrom.releaseSha = GREEN_SHA;
    const failures = validateState(state, policy);
    assert.ok(
      failures.some((failure) =>
        failure.includes('must be synchronized from the current ACTIVE release'),
      ),
    );
  });

  it('accepts ROLLBACK -> CANDIDATE preparation while ACTIVE remains unchanged', () => {
    assert.deepEqual(validateTransition(rollbackState(), candidateState(), policy), []);
  });

  it('accepts candidate promotion and preserves the former ACTIVE as ROLLBACK', () => {
    assert.deepEqual(validateTransition(candidateState(), promotedState(), policy), []);
  });

  it('rejects direct ROLLBACK -> ACTIVE swapping without candidate preparation', () => {
    const previous = rollbackState();
    const next = promotedState();
    next.generation = 2;
    const failures = validateTransition(previous, next, policy);
    assert.ok(failures.some((failure) => failure.includes('only a CANDIDATE may become ACTIVE')));
  });

  it('rejects secret-like database URLs by allowing only opaque database identities', () => {
    const state = rollbackState();
    state.environments[0].databaseIdentity = 'postgresql://user:password@host/database';
    const failures = validateState(state, policy);
    assert.ok(
      failures.some((failure) => failure.includes('databaseIdentity is missing or invalid')),
    );
  });
});
