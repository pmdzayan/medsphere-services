'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);

function listSourceFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'dist' || entry.name === 'node_modules'
        ? []
        : listSourceFiles(absolute);
    }
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [absolute] : [];
  });
}

function stringModuleSpecifier(node) {
  return ts.isStringLiteralLike(node) ? node.text : undefined;
}

function collectModuleSpecifiers(sourceFile) {
  const specifiers = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const value = node.moduleSpecifier && stringModuleSpecifier(node.moduleSpecifier);
      if (value) specifiers.push({ value, node: node.moduleSpecifier });
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (isRequire || isDynamicImport) {
        const value = stringModuleSpecifier(node.arguments[0]);
        if (value) specifiers.push({ value, node: node.arguments[0] });
      }
    } else if (ts.isImportTypeNode(node)) {
      const value =
        ts.isLiteralTypeNode(node.argument) && stringModuleSpecifier(node.argument.literal);
      if (value) specifiers.push({ value, node: node.argument });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function appNameForPath(candidate, appsRoot) {
  const relative = path.relative(appsRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep)[0];
}

function targetAppForSpecifier(specifier, sourceFile, repositoryRoot, appsRoot) {
  if (specifier.startsWith('.')) {
    return appNameForPath(path.resolve(path.dirname(sourceFile), specifier), appsRoot);
  }
  if (path.isAbsolute(specifier)) {
    return appNameForPath(path.resolve(specifier), appsRoot);
  }
  const normalized = specifier.replaceAll('\\\\', '/');
  const appsMatch = normalized.match(/(?:^|\/)apps\/([^/]+)(?:\/|$)/);
  if (appsMatch) return appsMatch[1];
  if (normalized.startsWith('apps/')) {
    return appNameForPath(path.resolve(repositoryRoot, normalized), appsRoot);
  }
  return undefined;
}

function findBoundaryViolations(repositoryRoot) {
  const appsRoot = path.join(repositoryRoot, 'apps');
  const violations = [];
  for (const file of listSourceFiles(appsRoot)) {
    const sourceApp = appNameForPath(file, appsRoot);
    const sourceFile = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    for (const specifier of collectModuleSpecifiers(sourceFile)) {
      const normalized = specifier.value.replaceAll('\\\\', '/');
      const targetApp = targetAppForSpecifier(specifier.value, file, repositoryRoot, appsRoot);
      const deepPackageImport = /^@medsphere\/[^/]+\/src(?:\/|$)/.test(normalized);
      if ((targetApp && targetApp !== sourceApp) || deepPackageImport) {
        const position = sourceFile.getLineAndCharacterOfPosition(specifier.node.getStart());
        violations.push({
          file: path.relative(repositoryRoot, file),
          line: position.line + 1,
          column: position.character + 1,
          specifier: specifier.value,
          reason: deepPackageImport ? 'package-internal import' : 'cross-application import',
        });
      }
    }
  }
  return violations;
}

function run(repositoryRoot = path.resolve(__dirname, '..')) {
  const violations = findBoundaryViolations(repositoryRoot);
  if (violations.length === 0) {
    process.stdout.write('Architecture boundary check passed: 0 violations.\n');
    return 0;
  }
  for (const violation of violations) {
    process.stderr.write(
      violation.file +
        ':' +
        violation.line +
        ':' +
        violation.column +
        ' ' +
        violation.reason +
        ': ' +
        violation.specifier +
        '\n',
    );
  }
  process.stderr.write(
    'Architecture boundary check failed: ' + violations.length + ' violation(s).\n',
  );
  return 1;
}

if (require.main === module) process.exitCode = run();

module.exports = { collectModuleSpecifiers, findBoundaryViolations, run };
