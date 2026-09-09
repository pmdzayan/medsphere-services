import type { Prisma } from '@medsphere/database';
import type { RecordAvailabilityObservationInput } from './availability-evidence.service';
import { AvailabilityEvidenceService } from './availability-evidence.service';

const NOW = new Date('2026-09-09T12:00:00.000Z');

function transaction() {
  const tx = {
    batchStockObservation: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  return {
    tx: tx as unknown as Pick<Prisma.TransactionClient, 'batchStockObservation'>,
    findFirst: tx.batchStockObservation.findFirst,
    create: tx.batchStockObservation.create,
  };
}

function input(
  overrides: Partial<RecordAvailabilityObservationInput> = {},
): RecordAvailabilityObservationInput {
  return {
    tenantId: 'tenant-1',
    inventoryId: 'inventory-1',
    batchId: 'batch-1',
    providerId: 'provider-1',
    productId: 'product-1',
    source: 'AIM_MANAGED_INVENTORY',
    observedOnHandQuantity: 20,
    occurredAt: NOW,
    movementId: 'movement-1',
    idempotencyKey: 'command-1',
    ...overrides,
  };
}

function persisted(
  overrides: Partial<{
    tenantId: string;
    inventoryId: string;
    batchId: string;
    providerId: string;
    productId: string;
    source: 'AIM_MANAGED_INVENTORY';
    observedOnHandQuantity: number;
    occurredAt: Date;
    movementId: string | null;
  }> = {},
) {
  return {
    tenantId: 'tenant-1',
    inventoryId: 'inventory-1',
    batchId: 'batch-1',
    providerId: 'provider-1',
    productId: 'product-1',
    source: 'AIM_MANAGED_INVENTORY' as const,
    observedOnHandQuantity: 20,
    occurredAt: NOW,
    movementId: 'movement-1',
    ...overrides,
  };
}

describe('Task 0025 AvailabilityEvidenceService', () => {
  describe('monotonic evidence ordering', () => {
    it('records a new observation when no prior evidence exists', async () => {
      const { tx, findFirst, create } = transaction();
      findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      create.mockResolvedValue({ id: 'observation-1' });
      const service = new AvailabilityEvidenceService();

      await expect(service.recordObservation(tx, input(), { now: NOW })).resolves.toBe(true);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('accepts a newer observation after an older one', async () => {
      const { tx, findFirst, create } = transaction();
      findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(persisted({ occurredAt: new Date(NOW.getTime() - 3_600_000) }));
      create.mockResolvedValue({ id: 'observation-2' });
      const service = new AvailabilityEvidenceService();

      await expect(service.recordObservation(tx, input(), { now: NOW })).resolves.toBe(true);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('ignores an older delayed observation without replacing newer evidence', async () => {
      const { tx, findFirst, create } = transaction();
      findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(persisted());
      const service = new AvailabilityEvidenceService();

      await expect(
        service.recordObservation(
          tx,
          input({
            occurredAt: new Date(NOW.getTime() - 24 * 3_600_000),
            idempotencyKey: 'older-command',
          }),
          { now: NOW },
        ),
      ).resolves.toBe(false);
      expect(create).not.toHaveBeenCalled();
    });

    it('treats an equal-timestamp identical observation as a no-op', async () => {
      const { tx, findFirst, create } = transaction();
      findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(persisted());
      const service = new AvailabilityEvidenceService();

      await expect(
        service.recordObservation(tx, input({ idempotencyKey: 'second-key' }), { now: NOW }),
      ).resolves.toBe(false);
      expect(create).not.toHaveBeenCalled();
    });

    it('fails closed on conflicting equal-timestamp evidence', async () => {
      const { tx, findFirst, create } = transaction();
      findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(persisted({ observedOnHandQuantity: 19 }));
      const service = new AvailabilityEvidenceService();

      await expect(service.recordObservation(tx, input(), { now: NOW })).rejects.toThrow(
        'same batch timestamp',
      );
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('duplicate / idempotent retry safety', () => {
    it('treats an exact idempotent replay as a no-op before attempting insert', async () => {
      const { tx, findFirst, create } = transaction();
      findFirst.mockResolvedValueOnce(persisted());
      const service = new AvailabilityEvidenceService();

      await expect(service.recordObservation(tx, input(), { now: NOW })).resolves.toBe(false);
      expect(create).not.toHaveBeenCalled();
    });

    it('fails closed when an idempotency key is reused for different content', async () => {
      const { tx, findFirst, create } = transaction();
      findFirst.mockResolvedValueOnce(persisted({ observedOnHandQuantity: 19 }));
      const service = new AvailabilityEvidenceService();

      await expect(service.recordObservation(tx, input(), { now: NOW })).rejects.toThrow(
        'idempotency key is already used',
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('resolves a concurrent P2002 exact retry as a no-op', async () => {
      const { tx, findFirst, create } = transaction();
      findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(persisted());
      create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      const service = new AvailabilityEvidenceService();

      await expect(service.recordObservation(tx, input(), { now: NOW })).resolves.toBe(false);
    });

    it('propagates unexpected persistence errors', async () => {
      const { tx, findFirst, create } = transaction();
      findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      create.mockRejectedValue(new Error('connection dropped'));
      const service = new AvailabilityEvidenceService();

      await expect(service.recordObservation(tx, input(), { now: NOW })).rejects.toThrow(
        'connection dropped',
      );
    });
  });

  describe('fail-closed validation', () => {
    it('rejects an invalid evidence source', async () => {
      const { tx } = transaction();
      const service = new AvailabilityEvidenceService();
      await expect(
        service.recordObservation(tx, input({ source: 'CLIENT_SUPPLIED_FAKE' } as never), {
          now: NOW,
        }),
      ).rejects.toThrow('Availability evidence source is not accepted');
    });

    it('rejects a negative observed quantity', async () => {
      const { tx } = transaction();
      const service = new AvailabilityEvidenceService();
      await expect(
        service.recordObservation(tx, input({ observedOnHandQuantity: -1 }), { now: NOW }),
      ).rejects.toThrow('Observed quantity must be a non-negative safe integer');
    });

    it('fails closed on an implausibly-future observation timestamp', async () => {
      const { tx } = transaction();
      const service = new AvailabilityEvidenceService();
      await expect(
        service.recordObservation(
          tx,
          input({ occurredAt: new Date(NOW.getTime() + 2 * 3_600_000) }),
          { now: NOW },
        ),
      ).rejects.toThrow('implausibly in the future');
    });

    it('rejects an invalid occurrence timestamp', async () => {
      const { tx } = transaction();
      const service = new AvailabilityEvidenceService();
      await expect(
        service.recordObservation(tx, input({ occurredAt: new Date('nope') }), { now: NOW }),
      ).rejects.toThrow('Observation occurrence timestamp is invalid');
    });

    it('rejects blank, padded, or overlong idempotency keys', async () => {
      const { tx } = transaction();
      const service = new AvailabilityEvidenceService();
      for (const idempotencyKey of ['', ' padded ', 'x'.repeat(121)]) {
        await expect(
          service.recordObservation(tx, input({ idempotencyKey }), { now: NOW }),
        ).rejects.toThrow('Observation idempotency key');
      }
    });

    it('rejects an invalid internal clock', async () => {
      const { tx } = transaction();
      const service = new AvailabilityEvidenceService();
      await expect(
        service.recordObservation(tx, input(), { now: new Date(Number.NaN) }),
      ).rejects.toThrow('Availability evidence clock is invalid');
    });
  });
});
