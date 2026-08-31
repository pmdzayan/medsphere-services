import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BRAND } = require('../dist/index.js');

test('exports the approved immutable AIM identity', () => {
  assert.equal(BRAND.shortName, 'AIM');
  assert.equal(BRAND.fullName, 'All In Medico');
  assert.equal(BRAND.accessibleName, 'AIM — All In Medico');
  assert.equal(BRAND.applicationTitle, 'AIM — All In Medico');
  assert.equal(Object.hasOwn(BRAND, 'tagline'), false);
  assert.equal(Object.isFrozen(BRAND), true);
});
