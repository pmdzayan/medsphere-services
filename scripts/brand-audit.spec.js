'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const os = require('node:os');
const { RETENTION_RULES, audit, classifyOccurrence, classifyPath } = require('./brand-audit');

describe('legacy brand audit classification', () => {
  it('keeps the allowlist explicit and reviewable', () => {
    assert.ok(RETENTION_RULES.length >= 6);
    assert.ok(RETENTION_RULES.every((rule) => rule.category && rule.reason));
  });

  it('blocks production-facing legacy branding', () => {
    assert.equal(
      classifyOccurrence('apps/web/src/app/page.tsx', '<span>MedSphere</span>').category,
      'USER_FACING',
    );
    assert.equal(
      classifyOccurrence('apps/auth-service/src/verification/message.ts', 'Welcome to MedSphere')
        .category,
      'USER_FACING',
    );
  });

  it('blocks active-documentation drift', () => {
    assert.equal(classifyOccurrence('README.md', '# MedSphere').category, 'DOCUMENTATION');
    assert.equal(
      classifyOccurrence('docs/adr/README.md', 'Current MedSphere decisions').category,
      'DOCUMENTATION',
    );
  });

  it('blocks legacy workflow display names without renaming machine identifiers', () => {
    assert.equal(
      classifyOccurrence(
        '.github/workflows/quality-gates.yml',
        'name: MedSphere Pull Request Quality Gates',
      ).category,
      'USER_FACING',
    );
  });

  it('retains compatibility identifiers and historical evidence with reasons', () => {
    assert.equal(
      classifyOccurrence('apps/web/src/lib/session-profile.ts', "'medsphere_access'").category,
      'INTERNAL_STABLE_IDENTIFIER',
    );
    assert.equal(
      classifyOccurrence('docs/adr/0001-example.md', 'MedSphere working decision').category,
      'HISTORICAL/MIGRATION',
    );
    assert.equal(
      classifyOccurrence('apps/auth-service/src/provider.ts', 'X-MedSphere-Delivery-Id').category,
      'EXTERNAL_CONTRACT',
    );
  });

  it('classifies filesystem names independently from file content', () => {
    assert.equal(
      classifyPath('apps/web/src/assets/medsphere-logo.svg').category,
      'FILE_OR_DIRECTORY_NAME',
    );
    assert.equal(
      classifyPath('docs/adr/medsphere-auth-decision.md').category,
      'HISTORICAL/MIGRATION',
    );
    assert.equal(classifyPath('misc/medsphere-notes.txt').category, 'FILE_OR_DIRECTORY_NAME');
    assert.equal(classifyPath('docs/all-in-medico-product-guide.md'), null);
    assert.equal(classifyPath('apps/web/src/assets/aim-logo.svg'), null);
  });

  it('fails closed when a new current legacy filename is introduced', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-brand-audit-'));
    try {
      fs.mkdirSync(path.join(root, 'apps/web/src/assets'), { recursive: true });
      fs.writeFileSync(path.join(root, 'apps/web/src/assets/medsphere-logo.svg'), '<svg />');
      const report = audit(root);
      assert.equal(report.pathTotal, 1);
      assert.equal(report.blocking.length, 1);
      assert.equal(report.blocking[0].category, 'FILE_OR_DIRECTORY_NAME');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('updates the persisted personal-account display name without renaming its stable slug', () => {
    const migration = fs.readFileSync(
      path.join(
        __dirname,
        '../packages/database/prisma/migrations/20260830190000_aim_consumer_brand/migration.sql',
      ),
      'utf8',
    );
    assert.match(migration, /SET "name" = 'All In Medico Personal Accounts'/);
    assert.match(migration, /WHERE "slug" = 'medsphere-personal-accounts'/);
    assert.doesNotMatch(migration, /SET "slug"/);
  });
});
