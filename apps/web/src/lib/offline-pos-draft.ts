import { isCanonicalUuid } from './inventory-contract';
import type { PosPaymentMethod } from './pos-contract';

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_DRAFTS = 3;
const MAX_LINES = 100;

export interface OfflinePosDraftLine {
  productId: string;
  quantity: number;
}

export interface OfflinePosDraft {
  providerId: string;
  lines: OfflinePosDraftLine[];
  placeOfSupplyStateCode: string;
  paymentMethod: PosPaymentMethod;
  createdAt: number;
  expiresAt: number;
}

export interface OfflinePosDraftInput {
  providerId: string;
  lines: OfflinePosDraftLine[];
  placeOfSupplyStateCode: string;
  paymentMethod: PosPaymentMethod;
}

/**
 * Task 0048 intentionally keeps offline POS drafts in module memory only.
 *
 * Nothing here writes IndexedDB, localStorage, sessionStorage, Cache Storage,
 * a service worker queue, or a backend endpoint. That means a browser refresh,
 * tab close, sign-out or process restart destroys the draft. This is a safety
 * feature for shared healthcare workstations: product selections can still be
 * health-adjacent information and must not become durable browser data.
 *
 * The queue is not a transaction queue. It cannot contain recipient identity,
 * reservation ids, pickup proofs, payment references, cash amounts, invoice
 * fields, fiscal overrides, or idempotency keys. The server remains the only
 * authority that can quote stock, allocate FEFO batches, complete a reservation,
 * create a sale, calculate final tax, or issue an invoice.
 */
const drafts = new Map<string, OfflinePosDraft>();

function isPaymentMethod(value: string): value is PosPaymentMethod {
  return value === 'CASH' || value === 'CARD' || value === 'UPI' || value === 'OTHER';
}

function isDraftLine(line: OfflinePosDraftLine): boolean {
  return (
    isCanonicalUuid(line.productId) &&
    Number.isSafeInteger(line.quantity) &&
    line.quantity > 0 &&
    line.quantity <= 10000
  );
}

function purgeExpired(now: number): void {
  for (const [providerId, draft] of drafts) {
    if (draft.expiresAt <= now) drafts.delete(providerId);
  }
}

export function enqueueOfflinePosDraft(
  input: OfflinePosDraftInput,
  options: Readonly<{ now?: number; ttlMs?: number }> = {},
): OfflinePosDraft | null {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  purgeExpired(now);

  if (
    !isCanonicalUuid(input.providerId) ||
    input.lines.length < 1 ||
    input.lines.length > MAX_LINES ||
    !input.lines.every(isDraftLine) ||
    !/^\d{2}$/.test(input.placeOfSupplyStateCode) ||
    !isPaymentMethod(input.paymentMethod) ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 1000 ||
    ttlMs > DEFAULT_TTL_MS
  ) {
    return null;
  }

  const draft: OfflinePosDraft = {
    providerId: input.providerId,
    lines: input.lines.map((line) => ({ ...line })),
    placeOfSupplyStateCode: input.placeOfSupplyStateCode,
    paymentMethod: input.paymentMethod,
    createdAt: now,
    expiresAt: now + ttlMs,
  };

  drafts.delete(input.providerId);
  drafts.set(input.providerId, draft);

  while (drafts.size > MAX_DRAFTS) {
    const oldestProviderId = drafts.keys().next().value as string | undefined;
    if (!oldestProviderId) break;
    drafts.delete(oldestProviderId);
  }

  return { ...draft, lines: draft.lines.map((line) => ({ ...line })) };
}

export function peekOfflinePosDraft(
  providerId: string,
  now = Date.now(),
): OfflinePosDraft | null {
  purgeExpired(now);
  const draft = drafts.get(providerId);
  if (!draft) return null;
  return { ...draft, lines: draft.lines.map((line) => ({ ...line })) };
}

export function takeOfflinePosDraft(
  providerId: string,
  now = Date.now(),
): OfflinePosDraft | null {
  const draft = peekOfflinePosDraft(providerId, now);
  if (!draft) return null;
  drafts.delete(providerId);
  return draft;
}

export function clearOfflinePosDraft(providerId?: string): void {
  if (providerId) drafts.delete(providerId);
  else drafts.clear();
}

export function offlinePosDraftCount(now = Date.now()): number {
  purgeExpired(now);
  return drafts.size;
}
