import { AvailabilityRequestService } from './availability-request.service';

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

interface PreferenceFixture {
  readonly liveRequestsEnabled: boolean;
  readonly timezone: string;
  readonly quietHoursStartMinute: number | null;
  readonly quietHoursEndMinute: number | null;
}

function buildHarness(options: {
  preference: PreferenceFixture | null;
  pendingRequestId?: string | null;
}) {
  const pendingRequestId = options.pendingRequestId ?? null;

  const preferenceFindUnique = jest.fn().mockResolvedValue(options.preference);
  const create = jest.fn().mockResolvedValue({ id: 'created-request' });
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });

  const transaction = {
    pharmacyAvailabilityRequestPreference: {
      findUnique: preferenceFindUnique,
    },
    $queryRaw: jest.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]),
    availabilityRequest: {
      findFirst: jest
        .fn()
        .mockResolvedValue(pendingRequestId === null ? null : { id: pendingRequestId }),
      count: jest.fn().mockResolvedValue(0),
      updateMany,
      create,
    },
  };

  const client = {
    provider: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'provider-a',
        tenantId: 'tenant-a',
      }),
    },
    product: {
      findFirst: jest.fn().mockResolvedValue({ id: 'product-a' }),
    },
    inventory: {
      findFirst: jest.fn().mockResolvedValue({ id: 'inventory-a' }),
    },
    availabilityRequest: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };

  const events = {
    appendTenantSystem: jest.fn(),
    appendTenantUser: jest.fn(),
  };

  const resolution =
    pendingRequestId === null
      ? UNKNOWN_RESOLUTION
      : {
          ...UNKNOWN_RESOLUTION,
          requestId: pendingRequestId,
          requestStatus: 'PENDING' as const,
          requestedAt: NOW,
          expiresAt: new Date(NOW.getTime() + 10 * 60_000),
        };

  const reconciliation = {
    findCurrentEvidence: jest.fn().mockResolvedValue(null),
    isValidLiveState: jest.fn(),
    resolveProviderProduct: jest.fn().mockResolvedValue(resolution),
  };

  const service = new AvailabilityRequestService(
    { client } as never,
    { appendTenantUser: jest.fn() } as never,
    events as never,
    reconciliation as never,
  );

  return {
    service,
    transaction,
    preferenceFindUnique,
    create,
    updateMany,
    events,
  };
}

describe('AvailabilityRequestService - Task 0027 pharmacy controls', () => {
  it('reuses an existing PENDING request before evaluating pharmacy controls', async () => {
    const harness = buildHarness({
      preference: null,
      pendingRequestId: 'existing-request',
    });

    const result = await harness.service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result).toMatchObject({
      requestId: 'existing-request',
      created: false,
      reused: true,
      currentEvidence: false,
    });

    expect(harness.preferenceFindUnique).not.toHaveBeenCalled();
    expect(harness.updateMany).not.toHaveBeenCalled();
    expect(harness.transaction.availabilityRequest.count).not.toHaveBeenCalled();
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('does not create a request when pharmacy live requests are not configured', async () => {
    const harness = buildHarness({
      preference: null,
    });

    const result = await harness.service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result).toMatchObject({
      requestId: null,
      created: false,
      reused: false,
      currentEvidence: false,
    });

    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.events.appendTenantSystem).not.toHaveBeenCalled();
  });

  it('does not create a request when pharmacy live requests are explicitly disabled', async () => {
    const harness = buildHarness({
      preference: {
        liveRequestsEnabled: false,
        timezone: 'UTC',
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
      },
    });

    const result = await harness.service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result.created).toBe(false);
    expect(result.requestId).toBeNull();
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.events.appendTenantSystem).not.toHaveBeenCalled();
  });

  it('does not create a request while the pharmacy is inside quiet hours', async () => {
    const harness = buildHarness({
      preference: {
        liveRequestsEnabled: true,
        timezone: 'UTC',
        quietHoursStartMinute: 11 * 60,
        quietHoursEndMinute: 13 * 60,
      },
    });

    const result = await harness.service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result.created).toBe(false);
    expect(result.requestId).toBeNull();
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.events.appendTenantSystem).not.toHaveBeenCalled();
  });

  it('creates normally when the pharmacy is enabled and outside quiet hours', async () => {
    const harness = buildHarness({
      preference: {
        liveRequestsEnabled: true,
        timezone: 'UTC',
        quietHoursStartMinute: 13 * 60,
        quietHoursEndMinute: 14 * 60,
      },
    });

    const result = await harness.service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result).toMatchObject({
      created: true,
      reused: false,
      currentEvidence: false,
    });

    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.events.appendTenantSystem).toHaveBeenCalledTimes(1);
  });

  it('suppresses creation when the pharmacy already has 15 active PENDING requests', async () => {
    const harness = buildHarness({
      preference: {
        liveRequestsEnabled: true,
        timezone: 'UTC',
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
      },
    });

    harness.transaction.availabilityRequest.count.mockResolvedValue(15);

    const result = await harness.service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result).toMatchObject({
      requestId: null,
      created: false,
      reused: false,
      currentEvidence: false,
    });

    expect(harness.transaction.$queryRaw).toHaveBeenCalledTimes(2);

    expect(harness.transaction.availabilityRequest.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        providerId: 'provider-a',
        status: 'PENDING',
        expiresAt: { gt: NOW },
      },
    });

    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.events.appendTenantSystem).not.toHaveBeenCalled();
  });

  it('allows the 20th creation when 19 requests were created during the rolling hour', async () => {
    const harness = buildHarness({
      preference: {
        liveRequestsEnabled: true,
        timezone: 'UTC',
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
      },
    });

    harness.transaction.availabilityRequest.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(19);

    const result = await harness.service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result).toMatchObject({
      created: true,
      reused: false,
      currentEvidence: false,
    });

    expect(harness.transaction.availabilityRequest.count).toHaveBeenCalledTimes(2);

    expect(harness.transaction.availabilityRequest.count).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId: 'tenant-a',
        providerId: 'provider-a',
        status: 'PENDING',
        expiresAt: { gt: NOW },
      },
    });

    expect(harness.transaction.availabilityRequest.count).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: 'tenant-a',
        providerId: 'provider-a',
        requestedAt: {
          gt: new Date(NOW.getTime() - 60 * 60_000),
        },
      },
    });

    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.events.appendTenantSystem).toHaveBeenCalledTimes(1);
  });

  it('suppresses the 21st creation when 20 requests were created during the rolling hour', async () => {
    const harness = buildHarness({
      preference: {
        liveRequestsEnabled: true,
        timezone: 'UTC',
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
      },
    });

    harness.transaction.availabilityRequest.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(20);

    const result = await harness.service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    expect(result).toMatchObject({
      requestId: null,
      created: false,
      reused: false,
      currentEvidence: false,
    });

    expect(harness.transaction.availabilityRequest.count).toHaveBeenCalledTimes(2);
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.events.appendTenantSystem).not.toHaveBeenCalled();
  });

  it('uses an exclusive rolling-hour boundary so a request exactly 60 minutes old is outside the window', async () => {
    const harness = buildHarness({
      preference: {
        liveRequestsEnabled: true,
        timezone: 'UTC',
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
      },
    });

    harness.transaction.availabilityRequest.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(19);

    await harness.service.createPublicRequest('provider-a', 'product-a', {
      now: NOW,
      requestPolicy: REQUEST_POLICY,
      freshnessPolicy: FRESHNESS_POLICY,
    });

    const exactBoundary = new Date(NOW.getTime() - 60 * 60_000);

    expect(harness.transaction.availabilityRequest.count).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: 'tenant-a',
        providerId: 'provider-a',
        requestedAt: { gt: exactBoundary },
      },
    });
  });
});
