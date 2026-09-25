import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  findComplexityViolations,
  productionFiles,
  validateException,
  validatePerformanceBaseline,
  validatePolicyShape,
} from './architecture-bottleneck-governance.mjs';

const temporaryDirectories = [];

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-0058-'));
  temporaryDirectories.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    task: '0058',
    principle: 'measure-before-complexity',
    currentRuntime: {
      applicationPath: 'web -> auth-service -> PostgreSQL + Redis',
      performanceEvidence: 'scripts/perf.mjs',
      operationsEvidence: 'docs/perf.md',
      profile: {
        certificationWorkers: 20,
        readOperations: 160,
        mutationOperations: 40,
        totalCertifiedOperations: 200,
      },
      thresholds: { maxErrorRate: 0.01, maxP95Ms: 1500, maxP99Ms: 3000 },
    },
    productionSurfaces: ['apps/auth-service/src', 'compose'],
    excludedSurfaces: ['compose/docker-compose.services.yml'],
    complexityPatterns: [
      {
        id: 'message-broker',
        rationale: 'measured need required',
        markers: ['\\bkafkajs\\b', '\\bKAFKA_BROKERS\\b'],
      },
    ],
    approvedExceptions: [],
    requiredDecisionEvidence: {
      adrStatus: 'Accepted',
      requiredAdrSections: [
        'Decision',
        'Reason and context',
        'Alternatives',
        'Consequences',
        'Implementation constraints',
        'Review triggers',
      ],
      evidenceMustReference: ['measured bottleneck', 'baseline', 'expected improvement', 'rollback'],
    },
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Task 0058 architecture bottleneck governance', () => {
  it('requires a stable measure-before-complexity policy shape', () => {
    assert.doesNotThrow(() => validatePolicyShape(policy()));
    assert.throws(
      () => validatePolicyShape(policy({ principle: 'scale-first' })),
      /measure-before-complexity/,
    );
  });

  it('ignores explicitly non-production prototype surfaces', () => {
    const root = fixture({
      'apps/auth-service/src/main.ts': 'export const accepted = true;\n',
      'compose/docker-compose.services.yml': 'KAFKA_BROKERS: kafka:9092\n',
    });
    assert.deepEqual(productionFiles(root, policy()), ['apps/auth-service/src/main.ts']);
    assert.deepEqual(findComplexityViolations(root, policy()), []);
  });

  it('fails when a new scaling primitive appears on a production surface without evidence', () => {
    const root = fixture({
      'apps/auth-service/src/main.ts': "import { Kafka } from 'kafkajs';\n",
    });
    const violations = findComplexityViolations(root, policy());
    assert.equal(violations.length, 1);
    assert.equal(violations[0].patternId, 'message-broker');
    assert.match(violations[0].reason, /no accepted scaling decision/);
  });

  it('allows a bounded exception only with an Accepted ADR and measured evidence', () => {
    const acceptedPolicy = policy({
      approvedExceptions: [
        {
          patternId: 'message-broker',
          paths: ['apps/auth-service/src'],
          adr: 'docs/adr/0099-measured-broker.md',
          evidence: ['docs/evidence/broker-load.md'],
        },
      ],
    });
    const root = fixture({
      'apps/auth-service/src/main.ts': "import { Kafka } from 'kafkajs';\n",
      'docs/evidence/broker-load.md': '# Synthetic capacity evidence\n',
      'docs/adr/0099-measured-broker.md': [
        '# ADR-099: Measured broker extraction',
        '',
        '**Status:** Accepted',
        '',
        '## Decision',
        'Use a broker only for the measured bottleneck.',
        '## Reason and context',
        'The measured bottleneck is documented against the baseline.',
        '## Alternatives',
        'Keep the outbox worker.',
        '## Consequences',
        'Adds distributed operations.',
        '## Implementation constraints',
        'Expected improvement must be verified and rollback must remain available.',
        '## Review triggers',
        'Review if the measured load returns below the baseline.',
      ].join('\n'),
    });
    assert.equal(
      validateException(root, acceptedPolicy, acceptedPolicy.approvedExceptions[0]),
      null,
    );
    assert.deepEqual(findComplexityViolations(root, acceptedPolicy), []);
  });

  it('rejects an exception whose ADR is not accepted', () => {
    const proposedPolicy = policy({
      approvedExceptions: [
        {
          patternId: 'message-broker',
          paths: ['apps/auth-service/src'],
          adr: 'docs/adr/0099-measured-broker.md',
          evidence: ['docs/evidence/broker-load.md'],
        },
      ],
    });
    const root = fixture({
      'apps/auth-service/src/main.ts': "import { Kafka } from 'kafkajs';\n",
      'docs/evidence/broker-load.md': '# Evidence\n',
      'docs/adr/0099-measured-broker.md': '**Status:** Proposed\n',
    });
    assert.match(
      validateException(root, proposedPolicy, proposedPolicy.approvedExceptions[0]),
      /not Accepted/,
    );
  });

  it('binds the governance baseline to the real performance certification constants', () => {
    const root = fixture({
      'scripts/perf.mjs': [
        'const PROFILE = {',
        '  certificationWorkers: 20,',
        '  readOperations: 160,',
        '  mutationOperations: 40,',
        '};',
        'const THRESHOLDS = {',
        '  maxErrorRate: 0.01,',
        '  maxP95Ms: 1500,',
        '  maxP99Ms: 3000,',
        '};',
      ].join('\n'),
      'docs/perf.md': '# Performance evidence\n',
    });
    assert.deepEqual(validatePerformanceBaseline(root, policy()), {
      certificationWorkers: 20,
      readOperations: 160,
      mutationOperations: 40,
      maxErrorRate: 0.01,
      maxP95Ms: 1500,
      maxP99Ms: 3000,
    });

    const drifted = policy();
    drifted.currentRuntime.thresholds.maxP95Ms = 9999;
    assert.throws(
      () => validatePerformanceBaseline(root, drifted),
      /performance baseline drift for maxP95Ms/,
    );
  });
});
