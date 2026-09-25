import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftPath = path.join(root, 'apps/web/src/lib/offline-pos-draft.ts');
const revalidationPath = path.join(root, 'apps/web/src/lib/offline-pos-revalidation.ts');

export function checkOfflineDraftBoundary(
  draftSource = fs.readFileSync(draftPath, 'utf8'),
  revalidationSource = fs.readFileSync(revalidationPath, 'utf8'),
) {
  const failures = [];

  const persistencePatterns = [
    /\blocalStorage\s*[.(]/,
    /\bsessionStorage\s*[.(]/,
    /\bindexedDB\s*[.(]/,
    /\bcaches\s*[.(]/,
    /\bBroadcastChannel\s*\(/,
  ];
  for (const pattern of persistencePatterns) {
    if (pattern.test(draftSource) || pattern.test(revalidationSource)) {
      failures.push(`Offline POS draft uses forbidden durable/browser persistence: ${pattern}`);
    }
  }

  const executionPatterns = [/\bcheckoutPosSale\s*\(/, /\bfetch\s*\(/, /\bXMLHttpRequest\b/];
  for (const pattern of executionPatterns) {
    if (pattern.test(draftSource) || pattern.test(revalidationSource)) {
      failures.push(`Offline POS draft crosses into transaction execution: ${pattern}`);
    }
  }

  const inputMatch = draftSource.match(
    /export interface OfflinePosDraftInput\s*\{([\s\S]*?)\n\}/,
  );
  if (!inputMatch) {
    failures.push('OfflinePosDraftInput interface is missing.');
  } else {
    const input = inputMatch[1];
    for (const forbidden of [
      'reservationId',
      'pickupToken',
      'recipientName',
      'recipientAddress',
      'recipientGstin',
      'paymentReference',
      'externalReference',
      'cashTendered',
      'idempotencyKey',
    ]) {
      if (input.includes(forbidden)) {
        failures.push(`OfflinePosDraftInput contains forbidden sensitive/transaction field: ${forbidden}`);
      }
    }
  }

  if (!revalidationSource.includes('loadQuote')) {
    failures.push('Offline draft revalidation must require an authoritative quote loader.');
  }
  if (revalidationSource.includes('auto-submit') && !revalidationSource.includes('never')) {
    failures.push('Offline revalidation must never auto-submit a sale.');
  }

  return failures;
}

export function run() {
  const failures = checkOfflineDraftBoundary();
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    return 1;
  }
  process.stdout.write('Offline POS draft boundary: PASS (memory-only, revalidation-only)\n');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
