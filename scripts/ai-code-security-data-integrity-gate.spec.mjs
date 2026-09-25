import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  analyzeChangeSet,
  classifyHighRiskFiles,
  evaluateIndependentReviews,
  isBootstrapReviewWaiver,
  parsePatch,
  validatePolicy,
} from './ai-code-security-data-integrity-gate.mjs';

const temporaryDirectories = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-0060-'));
  temporaryDirectories.push(root);
  return root;
}

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    task: '0060',
    principle: 'independent-review-for-high-risk-healthcare-changes',
    reviewRequired: [
      { id: 'backend', prefixes: ['apps/auth-service/src/'], excludeSuffixes: ['.spec.ts'] },
      { id: 'database', prefixes: ['packages/database/prisma/migrations/'] },
      { id: 'gate-integrity', prefixes: ['PROJECT_RULES.md'] },
    ],
    reviewSignals: [
      { id: 'client-trust', pattern: 'x-(tenant|organization)-id', flags: 'i' },
      { id: 'transaction-removal', removedPattern: '(\\$transaction|tenantId)', flags: 'i' },
    ],
    hardFailRules: [
      {
        id: 'private-key-material',
        pattern: '-----BEGIN (RSA )?PRIVATE KEY-----',
        flags: 'i',
        scope: 'sensitive-source',
      },
      {
        id: 'unsafe-prisma-raw-query',
        pattern: '\\$(queryRawUnsafe|executeRawUnsafe)\\b',
        flags: '',
        scope: 'production-code',
      },
      {
        id: 'runtime-eval',
        pattern: '\\beval\\s*\\(',
        flags: '',
        scope: 'production-code',
      },
    ],
    destructiveMigrationRules: [
      { id: 'drop-database-object', pattern: '\\bDROP\\s+(TABLE|SCHEMA)\\b', flags: 'i' },
      { id: 'bulk-delete-data', pattern: '\\bDELETE\\s+FROM\\b', flags: 'i' },
    ],
    forbiddenTrackedFiles: ['(^|/)\\.env$', '\\.(pem|key)$'],
    exceptions: [],
    bootstrap: {
      baseSha: 'base-0060',
      expiresAt: '2026-09-27T00:00:00.000Z',
      reason: 'fixture',
      allowedPaths: ['PROJECT_RULES.md'],
    },
    ...overrides,
  };
}

function patchFor(file, { added = [], removed = [] }) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ].join('\n');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Task 0060 independent AI-code security/data-integrity gate', () => {
  it('validates the policy identity and mandatory controls', () => {
    assert.doesNotThrow(() => validatePolicy(policy()));
    assert.throws(
      () => validatePolicy(policy({ principle: 'trust-the-agent' })),
      /security principle changed/,
    );
    assert.throws(
      () => validatePolicy(policy({ destructiveMigrationRules: [] })),
      /destructive migration rules must be a non-empty array/,
    );
  });

  it('classifies healthcare backend changes as independently reviewable but excludes tests', () => {
    const result = classifyHighRiskFiles(
      [
        'apps/auth-service/src/auth/auth.service.ts',
        'apps/auth-service/src/auth/auth.service.spec.ts',
        'README.md',
      ],
      policy(),
    );
    assert.deepEqual(result, [
      { file: 'apps/auth-service/src/auth/auth.service.ts', category: 'backend' },
    ]);
  });

  it('parses added and removed lines without treating diff headers as code', () => {
    const parsed = parsePatch(
      patchFor('apps/auth-service/src/auth/auth.service.ts', {
        removed: ['return tenantId;'],
        added: ['return trustedTenantId;'],
      }),
    );
    assert.deepEqual(parsed.additions, [
      { file: 'apps/auth-service/src/auth/auth.service.ts', text: 'return trustedTenantId;' },
    ]);
    assert.deepEqual(parsed.removals, [
      { file: 'apps/auth-service/src/auth/auth.service.ts', text: 'return tenantId;' },
    ]);
  });

  it('hard-fails unsafe raw SQL in production code', () => {
    const root = fixture();
    const result = analyzeChangeSet({
      repositoryRoot: root,
      files: ['apps/auth-service/src/inventory/inventory.service.ts'],
      patch: patchFor('apps/auth-service/src/inventory/inventory.service.ts', {
        added: ['await prisma.$queryRawUnsafe(userSql);'],
      }),
      policy: policy(),
      now: new Date('2026-09-25T12:00:00.000Z'),
    });
    assert.equal(result.hardFailures.length, 1);
    assert.equal(result.hardFailures[0].rule, 'unsafe-prisma-raw-query');
  });

  it('hard-fails destructive migration SQL without an accepted exception', () => {
    const root = fixture();
    const file = 'packages/database/prisma/migrations/20260925_bad/migration.sql';
    const result = analyzeChangeSet({
      repositoryRoot: root,
      files: [file],
      patch: patchFor(file, { added: ['DROP TABLE "Patient";'] }),
      policy: policy(),
      now: new Date('2026-09-25T12:00:00.000Z'),
    });
    assert.equal(result.hardFailures.length, 1);
    assert.equal(result.hardFailures[0].rule, 'drop-database-object');
  });

  it('allows a destructive migration only with a non-expired exception backed by an Accepted ADR', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'docs/adr'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'docs/adr/0099-approved-destructive-migration.md'),
      '# ADR\n\n**Status:** Accepted\n',
    );
    const file = 'packages/database/prisma/migrations/20260925_reviewed/migration.sql';
    const p = policy({
      exceptions: [
        {
          id: 'reviewed-drop',
          ruleId: 'drop-database-object',
          path: file,
          adrPath: 'docs/adr/0099-approved-destructive-migration.md',
          expiresAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    });
    const result = analyzeChangeSet({
      repositoryRoot: root,
      files: [file],
      patch: patchFor(file, { added: ['DROP TABLE "Legacy";'] }),
      policy: p,
      now: new Date('2026-09-25T12:00:00.000Z'),
    });
    assert.deepEqual(result.hardFailures, []);
    assert.equal(result.reviewRequired, true);
  });

  it('treats removal of transaction/tenant guards as a review signal', () => {
    const root = fixture();
    const file = 'apps/auth-service/src/inventory/inventory.service.ts';
    const result = analyzeChangeSet({
      repositoryRoot: root,
      files: [file],
      patch: patchFor(file, { removed: ['return prisma.$transaction(async (tx) => tenantId);'] }),
      policy: policy(),
      now: new Date('2026-09-25T12:00:00.000Z'),
    });
    assert.ok(result.reviewSignals.some((signal) => signal.signal === 'transaction-removal'));
    assert.equal(result.reviewRequired, true);
  });

  it('requires approval from somebody other than the PR author and honors the latest review state', () => {
    const reviews = [
      {
        state: 'APPROVED',
        submitted_at: '2026-09-25T10:00:00Z',
        user: { login: 'reviewer-a', type: 'User' },
      },
      {
        state: 'CHANGES_REQUESTED',
        submitted_at: '2026-09-25T11:00:00Z',
        user: { login: 'reviewer-a', type: 'User' },
      },
      {
        state: 'APPROVED',
        submited_at: '2026-09-25T12:00:00Z',
        user: { login: 'author", type: 'User' },
      },
    ];
    assert.deepEqual(evaluateIndependentReviews(reviews, 'author'), {
      approved: false,
      approvedBy: [],
    });

    reviews.push({
      state: 'APPROVED',
      submitted_at: '2026-09-25T13:00:00Z',
      user: { login: 'reviewer-b', type: 'User' },
    });
    assert.deepEqual(evaluateIndependentReviews(reviews, 'author'), {
      approved: true,
      approvedBy: ['reviewer-b'],
    });
  });

  it('limits the bootstrap waiver to the exact base, allowlist, and expiry', () => {
    const p = policy();
    assert.equal(
      isBootstrapReviewWaiver({
        policy: p,
        base: 'base-0060',
        files: ['PROJECT_RULES.md'],
        now: new Date('2026-09-25T12:00:00.000Z'),
      }),
      true,
    );
    assert.equal(
      isBootstrapReviewWaiver({
        policy: p,
        base: 'wrong-base',
        files: ['PROJECT_RULES.md'],
        now: new Date('2026-09-25T12:00:00.000Z'),
      }),
      false,
    );
    assert.equal(
      isBootstrapReviewWaiver({
        policy: p,
        base: 'base-0060',
        files: ['apps/auth-service/src/auth/auth.service.ts'],
        now: new Date('2026-09-25T12:00:00.000Z'),
      }),
      false,
    );
    assert.equal(
      isBootstrapReviewWaiver({
        policy: p,
        base: 'base-0060',
        files: ['PROJECT_RULES.md'],
        now: new Date('2026-09-28T00:00:00.000Z'),
      }),
      false,
    );
  });
});
