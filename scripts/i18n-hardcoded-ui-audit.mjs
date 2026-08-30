import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOTS = ['apps/web/src/app', 'apps/web/src/components', 'apps/web/src/features'];
const scanRootArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const scanRoot = path.resolve(scanRootArgument ?? '.');

const visibleAttributes = new Set([
  'action',
  'alt',
  'aria-description',
  'aria-label',
  'description',
  'detail',
  'emptyMessage',
  'eyebrow',
  'label',
  'loadingLabel',
  'message',
  'placeholder',
  'subtitle',
  'title',
]);
const visiblePropertyNames = new Set([
  'action',
  'description',
  'detail',
  'emptyMessage',
  'eyebrow',
  'label',
  'loadingLabel',
  'message',
  'placeholder',
  'subtitle',
  'title',
]);
const justifiedLiteralExclusions = new Map([
  ['UUID', 'standard technical identifier'],
  ['PHARMACY_MANAGER', 'role-code example, not prose'],
  ['you@organization.com', 'locale-independent email-format example'],
  ['overdue', 'internal expiry-urgency discriminator'],
  ['urgent', 'internal expiry-urgency discriminator'],
]);

const files = ROOTS.flatMap((root) => walk(path.join(scanRoot, root))).filter(
  (file) =>
    file.endsWith('.tsx') &&
    !file.endsWith('.test.tsx') &&
    !file.includes('/app/api/') &&
    !file.includes('/test/'),
);

const candidates = [];
for (const file of files) scanFile(file, candidates);

const excluded = [];
const unexplained = [];
for (const candidate of deduplicate(candidates)) {
  const reason = exclusionReason(candidate);
  if (reason) excluded.push({ ...candidate, reason });
  else unexplained.push(candidate);
}

const report = {
  scannedFiles: files.length,
  candidates: excluded.length + unexplained.length,
  justifiedExclusions: excluded,
  unexplained,
  unexplainedCount: unexplained.length,
};
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `i18n UI audit: ${report.scannedFiles} files, ${report.candidates} candidates, ` +
      `${report.justifiedExclusions.length} justified exclusions, ${report.unexplainedCount} unexplained`,
  );
  for (const item of unexplained) {
    console.log(`${item.file}:${item.line} [${item.kind}] ${item.text}`);
  }
}

if (unexplained.length > 0) process.exitCode = 1;

function walk(root) {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function scanFile(file, output) {
  const sourceText = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function add(node, kind, text) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!/[A-Za-z]{2}/.test(normalized)) return;
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    output.push({
      file: path.relative(scanRoot, file).split(path.sep).join('/'),
      line: position.line + 1,
      kind,
      text: normalized,
    });
  }

  function visit(node) {
    if (ts.isJsxText(node)) add(node, 'jsx-text', node.text);

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source);
      if (visibleAttributes.has(name) && node.initializer) {
        if (ts.isStringLiteral(node.initializer))
          add(node, `attribute:${name}`, node.initializer.text);
        if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression &&
          ts.isStringLiteralLike(node.initializer.expression)
        ) {
          add(node, `attribute:${name}`, node.initializer.expression.text);
        }
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(source).replace(/^['"]|['"]$/g, '');
      if (visiblePropertyNames.has(name) && ts.isStringLiteralLike(node.initializer)) {
        add(node, `property:${name}`, node.initializer.text);
      }
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      const errorBoundary =
        /^(?:set[A-Za-z]*Error|publicError|toPublicError)$/.test(callee) ||
        /\.(?:setError|setFieldError)$/.test(callee);
      if (errorBoundary) {
        for (const argument of node.arguments) {
          if (ts.isStringLiteralLike(argument))
            add(argument, `error-boundary:${callee}`, argument.text);
        }
      }
    }

    if (ts.isStringLiteralLike(node) && isVisibleJsxExpressionLiteral(node, source)) {
      add(node, 'jsx-expression-literal', node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
}

function isVisibleJsxExpressionLiteral(node, source) {
  let current = node.parent;
  let expression = null;
  while (current) {
    if (ts.isCallExpression(current) && current.expression.getText(source) === 't') return false;
    if (ts.isJsxAttribute(current)) {
      return false; // visible attributes are recorded separately; all other props are structural
    }
    if (ts.isJsxExpression(current)) {
      expression = current;
      current = current.parent;
      continue;
    }
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return Boolean(expression);
    current = current.parent;
  }
  return Boolean(expression);
}

function exclusionReason(candidate) {
  const exact = justifiedLiteralExclusions.get(candidate.text);
  if (exact) return exact;
  if (/^(?:[A-Z][A-Z0-9_.-]*|[a-z]+(?:\.[a-z]+)+)$/.test(candidate.text)) {
    return 'protocol, permission, status, or internal identifier';
  }
  if (/^[A-Z][A-Z0-9-]*-[A-Z0-9-]+$/.test(candidate.text)) {
    return 'bounded code or fixture-like identifier';
  }
  return null;
}

function deduplicate(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.file}:${item.line}:${item.kind}:${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
