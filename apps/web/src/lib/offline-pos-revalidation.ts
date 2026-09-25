import type { OfflinePosDraft } from './offline-pos-draft';
import type { PosProductQuote } from './pos-contract';

export interface RevalidatedOfflinePosLine {
  quote: PosProductQuote;
  quantity: number;
}

export interface RevalidatedOfflinePosDraft {
  lines: RevalidatedOfflinePosLine[];
  hasConflict: boolean;
}

/**
 * Revalidates a memory-only offline draft against fresh server quotes.
 *
 * This function deliberately has no checkout callback. A successful result
 * means "safe to show for operator review", never "safe to auto-submit".
 */
export async function revalidateOfflinePosDraft(
  draft: OfflinePosDraft,
  loadQuote: (providerId: string, productId: string) => Promise<PosProductQuote>,
): Promise<RevalidatedOfflinePosDraft> {
  const quotes = await Promise.all(
    draft.lines.map((line) => loadQuote(draft.providerId, line.productId)),
  );

  let hasConflict = false;
  const lines = quotes.map((quote, index) => {
    const requested = draft.lines[index]!.quantity;

    if (
      quote.providerId !== draft.providerId ||
      quote.productId !== draft.lines[index]!.productId ||
      quote.requiresPrescription ||
      !quote.isVisible ||
      quote.availableQuantity < 1
    ) {
      throw new Error('Offline POS draft is no longer eligible for counter checkout');
    }

    const quantity = Math.min(requested, quote.availableQuantity);
    if (
      quantity !== requested ||
      quote.availableQuantity < requested ||
      quote.fiscalProfile === null
    ) {
      hasConflict = true;
    }

    return { quote, quantity };
  });

  return { lines, hasConflict };
}
