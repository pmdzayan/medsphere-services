import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Batch 2 Task 5 -- removes the Google Fonts network dependency
 * (next/font/google) from the build/runtime. next/font/google downloads
 * font files from fonts.googleapis.com during dev/build; an environment
 * that cannot reach that host previously could not compile or render the
 * frontend at all. These tests prove the dependency is gone, not just
 * that the current layout.tsx happens not to use it -- a static source
 * scan catches reintroduction anywhere in the app, not only in the one
 * file this fix touched.
 */

const SRC_ROOT = join(__dirname, '..', '..');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectSourceFiles(fullPath, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      out.push(fullPath);
    }
  }
  return out;
}

describe('no next/font/google dependency', () => {
  it('does not import next/font/google (or next/font, bare) anywhere in the app source', () => {
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(50); // sanity: the scan actually walked real source

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (/from\s+['"]next\/font(\/google)?['"]/.test(content)) {
        offenders.push(file.replace(SRC_ROOT, 'src'));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not reference fonts.googleapis.com or fonts.gstatic.com anywhere in the app source', () => {
    const files = collectSourceFiles(SRC_ROOT).filter((file) => !file.includes('__tests__'));
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (/fonts\.(googleapis|gstatic)\.com/.test(content)) {
        offenders.push(file.replace(SRC_ROOT, 'src'));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('defines --font-body and --font-display as real, resolvable system-font stacks in globals.css', () => {
    const css = readFileSync(join(SRC_ROOT, 'app', 'globals.css'), 'utf8');

    const bodyMatch = css.match(/--font-body:\s*([^;]+);/);
    const displayMatch = css.match(/--font-display:\s*([^;]+);/);
    expect(bodyMatch).not.toBeNull();
    expect(displayMatch).not.toBeNull();

    const bodyValue = bodyMatch![1];
    const displayValue = displayMatch![1];

    // A real fallback stack, not a next/font-generated identifier
    // (those look like __className_<hash> or a bare CSS variable with no
    // font-family content at all).
    expect(bodyValue).toMatch(/sans-serif/);
    expect(bodyValue).not.toMatch(/__/);
    expect(displayValue).not.toMatch(/__/);
    // --font-display is allowed to alias --font-body (no second distinct
    // system "display" font exists across platforms) but must still
    // resolve to a real stack, not be left undefined.
    expect(displayValue.trim().length).toBeGreaterThan(0);
  });

  it('layout.tsx applies the font-body variable without any next/font-generated class', () => {
    const layout = readFileSync(join(SRC_ROOT, 'app', 'layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/next\/font/);
    expect(layout).toMatch(/var\(--font-body\)/);
  });
});
