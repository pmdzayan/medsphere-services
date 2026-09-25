import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EXTERNAL_CHECKS,
  REPOSITORY_CHECKS,
  createEvidenceTemplate,
  evaluateEvidence,
  validateCandidate,
} from './pharmacy-release-certification.mjs';

const sha = 'a'.repeat(40);
const candidate = {
  schemaVersion: 1,
  releaseSha: sha,
  appVersion: '1.0.0-rc.1',
  gitTreeSha: 'b'.repeat(40),
  sourceArchiveSha256: 'c'.repeat(64),
  lockfileSha256: 'd'.repeat(64),
  migrationsSha256: 'e'.repeat(64),
  containerImageId: `sha256:${'f'.repeat(64)}`,
};

function completedEvidence() {
  const evidence = createEvidenceTemplate(candidate);
  for (const key of REPOSITORY_CHECKS) {
    evidence.repositoryChecks[key] = {
      status: 'PASS',
      sha,
      evidenceRef: `github-run:${key}:123`,
    };
  }
  for (const key of EXTERNAL_CHECKS) {
    evidence.externalChecks[key] = {
      status: 'PASS',
      evidenceRef: `controlled-evidence:${key}:123`,
    };
  }
  evidence.registryImageDigest = `sha256:${'1'.repeat(64)}`;
  evidence.openCriticalFindings = 0;
  evidence.decision = { approved: true, approvalRef: 'change-record:aim-pharmacy-release-1' };
  return evidence;
}

describe('Task 0050 release candidate contract', () => {
  it('accepts a fully bounded immutable candidate', () => {
    assert.deepEqual(validateCandidate(candidate, sha), []);
  });

  it('rejects a candidate that is not bound to the expected exact SHA', () => {
    assert.ok(
      validateCandidate(candidate, '9'.repeat(40)).some((failure) =>
        failure.includes('expected exact release SHA'),
      ),
    );
  });

  it('creates a fail-closed evidence template', () => {
    const evidence = createEvidenceTemplate(candidate);
    const result = evaluateEvidence(evidence, sha);
    assert.equal(result.repositoryReady, false);
    assert.equal(result.productionGo, false);
    assert.equal(evidence.decision.approved, false);
  });

  it('requires every repository check to be bound to the exact release SHA', () => {
    const evidence = completedEvidence();
    evidence.repositoryChecks.qualityGates.sha = '9'.repeat(40);
    const result = evaluateEvidence(evidence, sha);
    assert.equal(result.repositoryReady, false);
    assert.equal(result.productionGo, false);
    assert.ok(result.repositoryFailures.some((failure) => failure.includes('qualityGates')));
  });

  it('rejects unreviewed free-form fields instead of allowing evidence files to become a data sink', () => {
    const evidence = completedEvidence();
    evidence.patientData = 'must-never-be-collected-here';
    const result = evaluateEvidence(evidence, sha);
    assert.equal(result.repositoryReady, false);
    assert.equal(result.productionGo, false);
    assert.ok(result.repositoryFailures.some((failure) => failure.includes('patientData')));
  });

  it('keeps production NO-GO when live or independent evidence is missing', () => {
    const evidence = completedEvidence();
    evidence.externalChecks.rollbackCanaryDrill = { status: 'PENDING', evidenceRef: '' };
    const result = evaluateEvidence(evidence, sha);
    assert.equal(result.repositoryReady, true);
    assert.equal(result.productionGo, false);
    assert.ok(result.productionFailures.some((failure) => failure.includes('rollbackCanaryDrill')));
  });

  it('keeps production NO-GO when a critical finding remains open', () => {
    const evidence = completedEvidence();
    evidence.openCriticalFindings = 1;
    const result = evaluateEvidence(evidence, sha);
    assert.equal(result.repositoryReady, true);
    assert.equal(result.productionGo, false);
    assert.ok(
      result.productionFailures.some((failure) => failure.includes('openCriticalFindings')),
    );
  });

  it('returns GO only when exact artifact, repository, external and approval evidence are all complete', () => {
    const result = evaluateEvidence(completedEvidence(), sha);
    assert.equal(result.repositoryReady, true);
    assert.equal(result.productionGo, true);
    assert.deepEqual(result.productionFailures, []);
  });
});
