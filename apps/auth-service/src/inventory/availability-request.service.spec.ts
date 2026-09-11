/**
 * Task 0026 CTO coverage correction.
 * Dedicated request-creation, response, authorization and idempotency tests.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AvailabilityRequestService } from './availability-request.service';
import { assertTrustedProviderAccess } from './inventory-access';

jest.mock('./inventory-access', () => ({
  assertTrustedProviderAccess: jest.fn(),
}));

const accessMock = assertTrustedProviderAccess as jest.MockedFunction<
  typeof assertTrustedProviderAccess
>;

const NOW = new Date('2026-09-10T12:00:00.000Z');
const REQUEST_POLICY = {
  requestLifetimeMs: 15 * 60_000,
  confirmationValidityMs: 30 * 60_000,
  retryAfterMinimumMs: 5 * 60_000,
  retryAfterMaximumMs: 24 * 60 * 60_000,
};
const FRESHNESS_POLICY = {} as never;

const UNKNOWN_RESOLUTION = {
  requestId: null,
  requestStatus: 'NONE',
  requestedAt: null,
  expiresAt: null,
  respondedAt: null,
  availabilityState: 'UNKNOWN',
  confirmationSource: null,
  confirmedAt: null,
  retryAfterAt: null,
} as const;

const actor = {
  tenantId: 'tenant-a',
  membershipId: 'membership-a',
  userId: 'user-a',
};

function publicPrerequisites() {
  return {
    provider: {
      findFirst: jest.fn().mockResolvedValue({ id: 'provider-a', tenantId: 'tenant-a' }),
    },
    product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-a' }) },
    inventory: { findFirst: jest.fn().mockResolvedValue({ id: 'inventory-a' }) },
  };
}

const ENABLED_LIVE_REQUEST_PREFERENCE = {
  liveRequestsEnabled: true,
  timezone: 'UTC',
  quietHoursStartMinute: null,
  quietHoursEndMinute: null,
} as const;

function enabledPreferenceRepository() {
  return {
    pharmacyAvailabilityRequestPreference: {
      findUnique: jest.fn().mockResolvedValue(ENABLED_LIVE_REQUEST_PREFERENCE),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  accessMock.mockResolvedValue(undefined);
});

describe('AvailabilityRequestService - Task 0026 CTO coverage correction', () => {
  it('creates a minimal PENDING request and reconciles only after the transaction commits', async () => {
    let inTransaction = false;
    const transaction = {
      ...enabledPreferenceRepository(),
      availabilityRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'created' }),
      },
    };
    const prerequisites = publicPrerequisites();
    const client = {
      ...prerequisites,
      availabilityRequest: { findFirst: jest.fn() },
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => {
        inTransaction = true;
        try {
          return await operation(transaction);
        } finally {
          inTransaction = false;
        }
      }),
    };
    const audit = { appendTenantUser: jest.fn() };
    const events = { appendTenantSystem: jest.fn(), appendTenantUser: jest.fn() };
    const reconciliation = {
      findCurrentEvidence: jest.fn().mockResolvedValue(null),
      isValidLiveState: jest.fn(),
      resolveProviderProduct: jest.fn().mockImplementation(async () => {
        expect(inTransaction).toBe(false);
        return UNKNOWN_RESOLUTION;
      }),
    };

    const service = new AvailabilityRequestService(
      { client } as never,
      audit as never,
      events as never,
      reconciliation as never,
    );

    const result = await service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result).toMatchObject({ created: true, reused: false, currentEvidence: false });
    expect(transaction.availabilityRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          providerId: 'provider-a',
          productId: 'product-a',
          status: 'PENDING',
          activeDedupKey: 'provider-a:product-a',
          version: 1,
        }),
      }),
    );
    expect(events.appendTenantSystem).toHaveBeenCalledTimes(1);
    expect(reconciliation.resolveProviderProduct).toHaveBeenCalledTimes(1);
  });

  it('short-circuits request creation when current valid live evidence already exists', async () => {
    const prerequisites = publicPrerequisites();
    const client = {
      ...prerequisites,
      availabilityRequest: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const resolution = {
      ...UNKNOWN_RESOLUTION,
      requestId: 'request-existing',
      requestStatus: 'RESPONDED' as const,
      availabilityState: 'AVAILABLE' as const,
      confirmationSource: 'PHARMACY_CONFIRMED' as const,
      confirmedAt: NOW,
    };
    const reconciliation = {
      findCurrentEvidence: jest.fn().mockResolvedValue({ outcome: 'AVAILABLE' }),
      isValidLiveState: jest.fn().mockReturnValue(true),
      resolveProviderProduct: jest.fn().mockResolvedValue(resolution),
    };

    const service = new AvailabilityRequestService(
      { client } as never,
      { appendTenantUser: jest.fn() } as never,
      { appendTenantSystem: jest.fn(), appendTenantUser: jest.fn() } as never,
      reconciliation as never,
    );

    const result = await service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result).toMatchObject({
      requestId: 'request-existing',
      created: false,
      reused: false,
      currentEvidence: true,
    });
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('recovers a P2002 dedupe race only after rollback through the root Prisma client', async () => {
    const p2002 = Object.assign(new Error('unique constraint'), { code: 'P2002' });
    const transaction = {
      ...enabledPreferenceRepository(),
      availabilityRequest: {
        findFirst: jest.fn().mockResolvedValueOnce(null),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockRejectedValue(p2002),
      },
    };
    let inTransaction = false;
    const prerequisites = publicPrerequisites();
    const rootFindFirst = jest.fn().mockImplementation(async () => {
      expect(inTransaction).toBe(false);
      return { id: 'concurrent-winner' };
    });
    const client = {
      ...prerequisites,
      availabilityRequest: { findFirst: rootFindFirst },
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => {
        inTransaction = true;
        try {
          return await operation(transaction);
        } finally {
          inTransaction = false;
        }
      }),
    };
    const reconciliation = {
      findCurrentEvidence: jest.fn().mockResolvedValue(null),
      isValidLiveState: jest.fn(),
      resolveProviderProduct: jest.fn().mockResolvedValue(UNKNOWN_RESOLUTION),
    };

    const service = new AvailabilityRequestService(
      { client } as never,
      { appendTenantUser: jest.fn() } as never,
      { appendTenantSystem: jest.fn(), appendTenantUser: jest.fn() } as never,
      reconciliation as never,
    );

    const result = await service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result).toMatchObject({
      requestId: 'concurrent-winner',
      created: false,
      reused: true,
      currentEvidence: false,
    });
    expect(transaction.availabilityRequest.findFirst).toHaveBeenCalledTimes(1);
    expect(rootFindFirst).toHaveBeenCalledTimes(1);
  });

  it('maps an exhausted raw PostgreSQL serialization conflict to the existing conflict contract', async () => {
    const rawSerializationConflict = Object.assign(
      new Error('could not serialize access due to concurrent update'),
      {
        code: 'P2010',
        meta: {
          code: '40001',
          message: 'could not serialize access due to concurrent update',
        },
      },
    );

    const prerequisites = publicPrerequisites();

    const client = {
      ...prerequisites,
      availabilityRequest: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn().mockRejectedValue(rawSerializationConflict),
    };

    const reconciliation = {
      findCurrentEvidence: jest.fn().mockResolvedValue(null),
      isValidLiveState: jest.fn(),
      resolveProviderProduct: jest.fn().mockResolvedValue(UNKNOWN_RESOLUTION),
    };

    const service = new AvailabilityRequestService(
      { client } as never,
      { appendTenantUser: jest.fn() } as never,
      { appendTenantSystem: jest.fn(), appendTenantUser: jest.fn() } as never,
      reconciliation as never,
    );

    await expect(
      service.createPublicRequest('provider-a', 'product-a', {
        now: NOW,
        requestPolicy: REQUEST_POLICY,
        freshnessPolicy: FRESHNESS_POLICY,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(client.$transaction).toHaveBeenCalledTimes(10);
  });
  it('server-derives tenant from the eligible provider instead of accepting patient context', async () => {
    const transaction = {
      ...enabledPreferenceRepository(),
      availabilityRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'created' }),
      },
    };
    const client = {
      provider: {
        findFirst: jest.fn().mockResolvedValue({ id: 'provider-a', tenantId: 'server-tenant' }),
      },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-a' }) },
      inventory: { findFirst: jest.fn().mockResolvedValue({ id: 'inventory-a' }) },
      availabilityRequest: { findFirst: jest.fn() },
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const reconciliation = {
      findCurrentEvidence: jest.fn().mockResolvedValue(null),
      isValidLiveState: jest.fn(),
      resolveProviderProduct: jest.fn().mockResolvedValue(UNKNOWN_RESOLUTION),
    };

    const service = new AvailabilityRequestService(
      { client } as never,
      { appendTenantUser: jest.fn() } as never,
      { appendTenantSystem: jest.fn(), appendTenantUser: jest.fn() } as never,
      reconciliation as never,
    );

    await service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(client.inventory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'server-tenant', providerId: 'provider-a' }),
      }),
    );
    expect(transaction.availabilityRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'server-tenant' }),
      }),
    );
  });

  it.each([
    ['AVAILABLE', undefined],
    ['UNAVAILABLE', undefined],
    ['CHECK_LATER', 10],
  ] as const)(
    'persists pharmacist outcome %s with the accepted bounded timing semantics',
    async (outcome, retryAfterMinutes) => {
      const confirmedAt = new Date(NOW.getTime() + 1_000);
      const request = {
        id: 'request-a',
        providerId: 'provider-a',
        productId: 'product-a',
        status: 'PENDING' as const,
        requestedAt: new Date(NOW.getTime() - 60_000),
        expiresAt: new Date(NOW.getTime() + 15 * 60_000),
        version: 1,
      };
      let priorEvidence: null | {
        outcome: 'AVAILABLE' | 'UNAVAILABLE' | 'CHECK_LATER';
        commandHash: string;
        confirmedAt: Date;
        validUntil: Date | null;
        retryAfterAt: Date | null;
      } = null;
      const transaction = {
        availabilityRequest: {
          findFirst: jest.fn().mockImplementation(async () => request),
          updateMany: jest.fn().mockImplementation(async () => {
            request.status = 'RESPONDED' as never;
            request.version += 1;
            return { count: 1 };
          }),
        },
        providerProductAvailabilityEvidence: {
          findFirst: jest.fn().mockImplementation(async () => priorEvidence),
          create: jest
            .fn()
            .mockImplementation(
              async ({ data }: { data: typeof priorEvidence & { id: string } }) => {
                priorEvidence = {
                  outcome: data!.outcome,
                  commandHash: data!.commandHash,
                  confirmedAt: data!.confirmedAt,
                  validUntil: data!.validUntil,
                  retryAfterAt: data!.retryAfterAt,
                };
                return { id: data!.id, createdAt: confirmedAt };
              },
            ),
        },
        $queryRaw: jest.fn().mockResolvedValue([{ confirmedAt }]),
      };
      const client = {
        $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
        ),
      };
      const audit = { appendTenantUser: jest.fn() };
      const events = { appendTenantUser: jest.fn(), appendTenantSystem: jest.fn() };
      const service = new AvailabilityRequestService(
        { client } as never,
        audit as never,
        events as never,
        {} as never,
      );

      const result = await service.respond(
        actor as never,
        'provider-a',
        'request-a',
        {
          outcome,
          idempotencyKey: `key-${outcome}`,
          expectedVersion: 1,
          ...(retryAfterMinutes === undefined ? {} : { retryAfterMinutes }),
        },
        { now: NOW, requestPolicy: REQUEST_POLICY },
      );

      expect(result.outcome).toBe(outcome);
      expect(result.replayed).toBe(false);
      if (outcome === 'CHECK_LATER') {
        expect(result.validUntil).toBeNull();
        expect(result.retryAfterAt).toEqual(new Date(confirmedAt.getTime() + 10 * 60_000));
      } else {
        expect(result.validUntil).toEqual(
          new Date(confirmedAt.getTime() + REQUEST_POLICY.confirmationValidityMs),
        );
        expect(result.retryAfterAt).toBeNull();
      }
      expect(transaction.providerProductAvailabilityEvidence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-a',
            providerId: 'provider-a',
            productId: 'product-a',
            responderMembershipId: 'membership-a',
            responderUserId: 'user-a',
            outcome,
          }),
        }),
      );
      expect(audit.appendTenantUser).toHaveBeenCalledWith(
        transaction,
        expect.objectContaining({
          tenantId: 'tenant-a',
          actorMembershipId: 'membership-a',
          actorUserId: 'user-a',
          outcome: 'SUCCEEDED',
        }),
      );
    },
  );

  it('replays the exact same committed response without writing evidence twice', async () => {
    const confirmedAt = new Date(NOW.getTime() + 1_000);
    const request = {
      id: 'request-a',
      providerId: 'provider-a',
      productId: 'product-a',
      status: 'PENDING' as 'PENDING' | 'RESPONDED',
      requestedAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 15 * 60_000),
      version: 1,
    };
    let priorEvidence: null | Record<string, unknown> = null;
    const transaction = {
      availabilityRequest: {
        findFirst: jest.fn().mockImplementation(async () => request),
        updateMany: jest.fn().mockImplementation(async () => {
          request.status = 'RESPONDED';
          request.version += 1;
          return { count: 1 };
        }),
      },
      providerProductAvailabilityEvidence: {
        findFirst: jest.fn().mockImplementation(async () => priorEvidence),
        create: jest
          .fn()
          .mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            priorEvidence = {
              outcome: data.outcome,
              commandHash: data.commandHash,
              confirmedAt: data.confirmedAt,
              validUntil: data.validUntil,
              retryAfterAt: data.retryAfterAt,
            };
            return { id: data.id, createdAt: confirmedAt };
          }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ confirmedAt }]),
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new AvailabilityRequestService(
      { client } as never,
      { appendTenantUser: jest.fn() } as never,
      { appendTenantUser: jest.fn(), appendTenantSystem: jest.fn() } as never,
      {} as never,
    );
    const input = {
      outcome: 'AVAILABLE' as const,
      idempotencyKey: 'same-response',
      expectedVersion: 1,
    };

    const first = await service.respond(actor as never, 'provider-a', 'request-a', input, {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
    });
    const second = await service.respond(actor as never, 'provider-a', 'request-a', input, {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
    });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(transaction.providerProductAvailabilityEvidence.create).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of one idempotency key for different response content', async () => {
    const confirmedAt = new Date(NOW.getTime() + 1_000);
    const request = {
      id: 'request-a',
      providerId: 'provider-a',
      productId: 'product-a',
      status: 'PENDING' as 'PENDING' | 'RESPONDED',
      requestedAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 15 * 60_000),
      version: 1,
    };
    let priorEvidence: null | Record<string, unknown> = null;
    const transaction = {
      availabilityRequest: {
        findFirst: jest.fn().mockImplementation(async () => request),
        updateMany: jest.fn().mockImplementation(async () => {
          request.status = 'RESPONDED';
          request.version += 1;
          return { count: 1 };
        }),
      },
      providerProductAvailabilityEvidence: {
        findFirst: jest.fn().mockImplementation(async () => priorEvidence),
        create: jest
          .fn()
          .mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            priorEvidence = {
              outcome: data.outcome,
              commandHash: data.commandHash,
              confirmedAt: data.confirmedAt,
              validUntil: data.validUntil,
              retryAfterAt: data.retryAfterAt,
            };
            return { id: data.id, createdAt: confirmedAt };
          }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ confirmedAt }]),
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new AvailabilityRequestService(
      { client } as never,
      { appendTenantUser: jest.fn() } as never,
      { appendTenantUser: jest.fn(), appendTenantSystem: jest.fn() } as never,
      {} as never,
    );

    await service.respond(
      actor as never,
      'provider-a',
      'request-a',
      { outcome: 'AVAILABLE', idempotencyKey: 'reused-key', expectedVersion: 1 },
      { now: NOW, requestPolicy: REQUEST_POLICY },
    );

    await expect(
      service.respond(
        actor as never,
        'provider-a',
        'request-a',
        { outcome: 'UNAVAILABLE', idempotencyKey: 'reused-key', expectedVersion: 1 },
        { now: NOW, requestPolicy: REQUEST_POLICY },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.providerProductAvailabilityEvidence.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired PENDING request before creating pharmacist evidence', async () => {
    const request = {
      id: 'request-a',
      providerId: 'provider-a',
      productId: 'product-a',
      status: 'PENDING',
      requestedAt: new Date(NOW.getTime() - 20 * 60_000),
      expiresAt: NOW,
      version: 1,
    };
    const transaction = {
      availabilityRequest: {
        findFirst: jest.fn().mockResolvedValue(request),
        updateMany: jest.fn(),
      },
      providerProductAvailabilityEvidence: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new AvailabilityRequestService(
      { client } as never,
      { appendTenantUser: jest.fn() } as never,
      { appendTenantUser: jest.fn(), appendTenantSystem: jest.fn() } as never,
      {} as never,
    );

    await expect(
      service.respond(
        actor as never,
        'provider-a',
        'request-a',
        { outcome: 'AVAILABLE', idempotencyKey: 'expired-key', expectedVersion: 1 },
        { now: NOW, requestPolicy: REQUEST_POLICY },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.providerProductAvailabilityEvidence.create).not.toHaveBeenCalled();
  });

  it('fails closed when provider access is revoked and does not write evidence', async () => {
    accessMock.mockRejectedValueOnce(new NotFoundException('Provider inventory not found'));
    const transaction = {
      availabilityRequest: { findFirst: jest.fn(), updateMany: jest.fn() },
      providerProductAvailabilityEvidence: { findFirst: jest.fn(), create: jest.fn() },
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new AvailabilityRequestService(
      { client } as never,
      { appendTenantUser: jest.fn() } as never,
      { appendTenantUser: jest.fn(), appendTenantSystem: jest.fn() } as never,
      {} as never,
    );

    await expect(
      service.respond(
        actor as never,
        'provider-a',
        'request-a',
        { outcome: 'AVAILABLE', idempotencyKey: 'denied-key', expectedVersion: 1 },
        { now: NOW, requestPolicy: REQUEST_POLICY },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(accessMock).toHaveBeenCalledWith(transaction, actor, 'provider-a');
    expect(transaction.availabilityRequest.findFirst).not.toHaveBeenCalled();
    expect(transaction.providerProductAvailabilityEvidence.create).not.toHaveBeenCalled();
  });
});
