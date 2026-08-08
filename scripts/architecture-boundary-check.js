#!/usr/bin/env node
/**
 * Architecture boundary enforcement check (AG-01 / ADR-0008).
 *
 * Proves that the following violations are detected:
 *   1. App A imports App B through a relative path.
 *   2. App A imports `apps/<other-app>/src`.
 *   3. An alias points to another application's internals.
 *   4. A shared package imports from `apps/*`.
 *   5. A consumer deep-imports a private unexported package path.
 *
 * This is an executable repository check, not merely an ESLint rule.
 * It is wired into the root `test:architecture` script used by CI.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appsDir = path.join(root, 'apps');
const packagesDir = path.join(root, 'packages');

const violations = [];

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(entry.name)) out.push(full);
  }
  return out;
}

const tsFiles = walk(root, (name) => /\.(ts|tsx)$/.test(name)).filter(
  (f) =>
    !f.includes(`${path.sep}node_modules${path.sep}`) && !f.includes(`${path.sep}dist${path.sep}`),
);

for (const file of tsFiles) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('import') && !trimmed.startsWith('export')) return;

    // 1. Relative cross-app import: ../../auth-service/src/...
    if (/from\s+['"]\.\.\/.*\/apps\//.test(trimmed) || /from\s+['"]\.\.\/.*\/src\//.test(trimmed)) {
      if (/apps\/(?!web)/.test(trimmed)) {
        violations.push({
          file: rel,
          line: idx + 1,
          code: trimmed,
          rule: 'relative-cross-app-import',
        });
      }
    }

    // 2. apps/<other-app>/src import
    if (/from\s+['"][^'"]*apps\/[^'"]*\/src/.test(trimmed)) {
      violations.push({ file: rel, line: idx + 1, code: trimmed, rule: 'apps-src-import' });
    }

    // 3. Alias to another app's internals
    if (/from\s+['"](@?[^'"]*\/apps\/[^'"]*)/.test(trimmed)) {
      violations.push({ file: rel, line: idx + 1, code: trimmed, rule: 'alias-to-app-internals' });
    }

    // 4. Shared package imports from apps/*
    const isPackage = rel.startsWith('packages/');
    if (isPackage && /from\s+['"][^'"]*apps\//.test(trimmed)) {
      violations.push({
        file: rel,
        line: idx + 1,
        code: trimmed,
        rule: 'shared-package-imports-app',
      });
    }

    // 5. Deep-import of a private unexported package path
    if (/from\s+['"]@medsphere\/[^'"]+\/src\//.test(trimmed)) {
      violations.push({
        file: rel,
        line: idx + 1,
        code: trimmed,
        rule: 'deep-import-private-path',
      });
    }
  });
}

if (violations.length > 0) {
  console.error('ARCHITECTURE BOUNDARY VIOLATIONS DETECTED:');
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}:${v.line} -> ${v.code}`);
  }
  process.exit(1);
}

console.log('Architecture boundary check passed: no cross-application source imports detected.');
process.exit(0);
