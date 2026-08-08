'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, describe, it } = require('node:test');

const { findBoundaryViolations } = require('./architecture-boundary-check');

const temporaryDirectories = [];

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'medsphere-boundary-'));
  temporaryDirectories.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('architecture boundary check', () => {
  it('allows same-application and public package imports', () => {
    const root = fixture({
      'apps/auth-service/src/main.ts':
        "import './local';\nimport { DomainEventEnvelope } from '@medsphere/types';\n",
      'apps/auth-service/src/local.ts': 'export const local = true;\n',
    });
    assert.deepEqual(findBoundaryViolations(root), []);
  });

  it('detects static, exported, required, dynamic, and import-type cross-app access', () => {
    const root = fixture({
      'apps/auth-service/src/main.ts': [
        "import value from '../../billing-service/src/value';",
        "export { value } from 'apps/billing-service/src/value';",
        "require('../../notification-service/src/value');",
        "void import('../../search-service/src/value');",
        "type Remote = import('../../inventory-service/src/value').Remote;",
      ].join('\n'),
    });
    const violations = findBoundaryViolations(root);
    assert.equal(violations.length, 5);
    assert.ok(violations.every((value) => value.reason === 'cross-application import'));
  });

  it('rejects internal package source imports', () => {
    const root = fixture({
      'apps/auth-service/src/main.ts':
        "import { internal } from '@medsphere/database/src/internal';\n",
    });
    assert.deepEqual(
      findBoundaryViolations(root).map((value) => value.reason),
      ['package-internal import'],
    );
  });

  it('does not treat comments or ordinary strings as imports', () => {
    const root = fixture({
      'apps/auth-service/src/main.ts': [
        "// import '../../billing-service/src/value';",
        "const example = '../../billing-service/src/value';",
      ].join('\n'),
    });
    assert.deepEqual(findBoundaryViolations(root), []);
  });
});
