import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'apps/web/src/app/globals.css'), 'utf8');
const shell = fs.readFileSync(
  path.join(root, 'apps/web/src/components/platform/app-shell.tsx'),
  'utf8',
);

const organizationTypes = [
  'PHARMACY',
  'HOSPITAL',
  'LABORATORY',
  'CLINIC',
  'BLOOD_BANK',
  'SUPPLIER',
  'NONE',
];

describe('AIM organization theme contract', () => {
  it('defines one semantic palette for every accepted organization type', () => {
    for (const organizationType of organizationTypes) {
      assert.match(css, new RegExp(`\\[data-organization-theme=['"]${organizationType}['"]\\]`));
    }
  });

  it('uses semantic tokens rather than organization-specific component branches', () => {
    for (const token of [
      '--org-primary',
      '--org-primary-soft',
      '--org-accent',
      '--org-sidebar',
      '--org-canvas',
      '--org-border',
      '--org-glow',
    ]) {
      assert.ok(css.includes(token), `missing theme token ${token}`);
    }
    assert.ok(shell.includes('data-organization-theme={session.context.organizationType}'));
  });

  it('coordinates the normal transition and respects reduced motion', () => {
    assert.match(css, /440ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /transition-duration: 1ms !important/);
  });
});
