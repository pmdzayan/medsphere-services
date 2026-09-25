import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkOfflineDraftBoundary } from './offline-draft-boundary-check.mjs';

describe('Task 0048 offline POS draft boundary', () => {
  it('accepts the committed memory-only and revalidation-only implementation', () => {
    assert.deepEqual(checkOfflineDraftBoundary(), []);
  });

  it('rejects browser persistence', () => {
    const unsafeDraft = `
      export interface OfflinePosDraftInput { providerId: string; }
      localStorage.setItem('draft', 'unsafe');
    `;
    assert.ok(
      checkOfflineDraftBoundary(unsafeDraft, 'const loadQuote = true;').some((failure) =>
        failure.includes('forbidden durable/browser persistence'),
      ),
    );
  });

  it('rejects transaction execution from the offline helper', () => {
    const unsafeRevalidation = `
      const loadQuote = true;
      checkoutPosSale('provider', {});
    `;
    assert.ok(
      checkOfflineDraftBoundary(
        'export interface OfflinePosDraftInput { providerId: string; }',
        unsafeRevalidation,
      ).some((failure) => failure.includes('transaction execution')),
    );
  });

  it('rejects sensitive or final-transaction fields in the draft contract', () => {
    const unsafeDraft = `
      export interface OfflinePosDraftInput {
        providerId: string;
        pickupToken: string;
        paymentReference: string;
      }
    `;
    const failures = checkOfflineDraftBoundary(unsafeDraft, 'const loadQuote = true;');
    assert.ok(failures.some((failure) => failure.includes('pickupToken')));
    assert.ok(failures.some((failure) => failure.includes('paymentReference')));
  });
});
