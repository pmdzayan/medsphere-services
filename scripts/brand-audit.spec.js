'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const { RETENTION_RULES, classifyOccurrence } = require('./brand-audit');

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
