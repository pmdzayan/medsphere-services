import { BadRequestException, NotFoundException } from '@nestjs/common';
import { assertTrustedProviderAccess } from './inventory-access';
import { AvailabilityRequestPreferenceService } from './availability-request-preference.service';

jest.mock('./inventory-access', () => ({
  assertTrustedProviderAccess: jest.fn(),
}));

const accessMock = jest.mocked(assertTrustedProviderAccess);

const ACTOR = {
  tenantId: 'tenant-a',
  membershipId: 'membership-a',
  userId: 'user-a',
} as never;

function buildHarness(options?: {
  provider?: { id: string } | null;
  preference?: {
    liveRequestsEnabled: boolean;
    timezone: string;
    quietHoursStartMinute: number | null;
    quietHoursEndMinute: number | null;
  } | null;
}) {
  const provider = options?.provider === undefined ? { id: 'provider-a' } : options.provider;
  const preference = options?.preference ?? null;

  const rootProviderFindFirst = jest.fn().mockResolvedValue(provider);
  const transactionProviderFindFirst = jest.fn().mockResolvedValue(provider);

  const rootPreferenceFindUnique = jest.fn().mockResolvedValue(preference);

  const upsert = jest.fn().mockImplementation(async ({ create, update }) => ({
    liveRequestsEnabled: update.liveRequestsEnabled ?? create.liveRequestsEnabled,
    timezone: update.timezone ?? create.timezone,
    quietHoursStartMinute: update.quietHoursStartMinute ?? create.quietHoursStartMinute,
    quietHoursEndMinute: update.quietHoursEndMinute ?? create.quietHoursEndMinute,
  }));

  const advisoryLock = jest.fn().mockResolvedValue([{ locked: 1 }]);

  const transaction = {
    provider: {
      findFirst: transactionProviderFindFirst,
    },
    pharmacyAvailabilityRequestPreference: {
      upsert,
    },
    $queryRaw: advisoryLock,
  };

  const client = {
    provider: {
      findFirst: rootProviderFindFirst,
    },
    pharmacyAvailabilityRequestPreference: {
      findUnique: rootPreferenceFindUnique,
    },
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
  };

  const appendTenantUser = jest.fn().mockResolvedValue(undefined);

  const service = new AvailabilityRequestPreferenceService(
    { client } as never,
    { appendTenantUser } as never,
  );

  return {
    service,
    client,
    transaction,
    rootPreferenceFindUnique,
    upsert,
    advisoryLock,
    appendTenantUser,
  };
}

describe('AvailabilityRequestPreferenceService - Task 0027', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accessMock.mockResolvedValue(undefined);
  });

  it('fails closed when an assigned pharmacy has no preference row', async () => {
    const harness = buildHarness();

    await expect(harness.service.get(ACTOR, 'provider-a')).resolves.toEqual({
      configured: false,
      liveRequestsEnabled: false,
      timezone: null,
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
    });

    expect(accessMock).toHaveBeenCalledTimes(1);
    expect(harness.rootPreferenceFindUnique).toHaveBeenCalledWith({
      where: { providerId: 'provider-a' },
      select: {
        liveRequestsEnabled: true,
        timezone: true,
        quietHoursStartMinute: true,
        quietHoursEndMinute: true,
      },
    });
  });

  it('normalizes and atomically configures an assigned pharmacy with exact-user audit', async () => {
    const harness = buildHarness();

    const result = await harness.service.configure({
      actor: ACTOR,
      providerId: 'provider-a',
      liveRequestsEnabled: true,
      timezone: '  Asia/Kolkata  ',
      quietHoursStartMinute: 1320,
      quietHoursEndMinute: 420,
      request: {
        requestId: 'request-a',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    });

    expect(result).toEqual({
      configured: true,
      liveRequestsEnabled: true,
      timezone: 'Asia/Kolkata',
      quietHoursStartMinute: 1320,
      quietHoursEndMinute: 420,
    });

    expect(harness.advisoryLock).toHaveBeenCalledTimes(1);
    expect(harness.upsert).toHaveBeenCalledWith({
      where: { providerId: 'provider-a' },
      create: {
        providerId: 'provider-a',
        tenantId: 'tenant-a',
        liveRequestsEnabled: true,
        timezone: 'Asia/Kolkata',
        quietHoursStartMinute: 1320,
        quietHoursEndMinute: 420,
      },
      update: {
        liveRequestsEnabled: true,
        timezone: 'Asia/Kolkata',
        quietHoursStartMinute: 1320,
        quietHoursEndMinute: 420,
      },
      select: {
        liveRequestsEnabled: true,
        timezone: true,
        quietHoursStartMinute: true,
        quietHoursEndMinute: true,
      },
    });

    expect(harness.advisoryLock.mock.invocationCallOrder[0]).toBeLessThan(
      harness.upsert.mock.invocationCallOrder[0],
    );

    expect(harness.appendTenantUser).toHaveBeenCalledWith(
      harness.transaction,
      expect.objectContaining({
        tenantId: 'tenant-a',
        actorMembershipId: 'membership-a',
        actorUserId: 'user-a',
        eventType: 'inventory.availability-request.preference.configured',
        outcome: 'SUCCEEDED',
        resourceType: 'PharmacyAvailabilityRequestPreference',
        resourceId: 'provider-a',
        metadata: {
          liveRequestsEnabled: true,
          timezone: 'Asia/Kolkata',
          quietHoursStartMinute: 1320,
          quietHoursEndMinute: 420,
        },
      }),
    );
  });

  it('rejects an invalid timezone before opening a transaction', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.configure({
        actor: ACTOR,
        providerId: 'provider-a',
        liveRequestsEnabled: true,
        timezone: 'Definitely/Not_A_Timezone',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.client.$transaction).not.toHaveBeenCalled();
    expect(harness.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unpaired quiet-hours boundary before opening a transaction', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.configure({
        actor: ACTOR,
        providerId: 'provider-a',
        liveRequestsEnabled: true,
        timezone: 'UTC',
        quietHoursStartMinute: 100,
        quietHoursEndMinute: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.client.$transaction).not.toHaveBeenCalled();
    expect(harness.upsert).not.toHaveBeenCalled();
  });

  it('rejects configuration for an assigned non-pharmacy provider', async () => {
    const harness = buildHarness({
      provider: null,
    });

    await expect(
      harness.service.configure({
        actor: ACTOR,
        providerId: 'provider-a',
        liveRequestsEnabled: false,
        timezone: 'UTC',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(harness.advisoryLock).not.toHaveBeenCalled();
    expect(harness.upsert).not.toHaveBeenCalled();
    expect(harness.appendTenantUser).not.toHaveBeenCalled();
  });
});
