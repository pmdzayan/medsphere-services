import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationRecipientResolverService } from './reservation-recipient-resolver.service';

const tenantId = randomUUID();
const membershipId = randomUUID();
const email = `${randomUUID()}@medsphere.test`;
const input = {
  tenantId,
  recipientType: 'TENANT_MEMBERSHIP' as const,
  recipientReferenceId: membershipId,
  channel: 'EMAIL' as const,
};

describe('G3.25 ReservationRecipientResolverService', () => {
  const findFirst = jest.fn();
  const prisma = {
    client: {
      tenantMembership: { findFirst },
    },
  } as unknown as PrismaService;
  const service = new ReservationRecipientResolverService(prisma);

  beforeEach(() => findFirst.mockReset());

  it('resolves one active same-tenant membership with a minimal authoritative query', async () => {
    findFirst.mockResolvedValue(eligibleRecipient());

    await expect(service.resolve(input)).resolves.toEqual({ destinationToken: email });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: membershipId, tenantId },
      select: {
        status: true,
        endedAt: true,
        deletedAt: true,
        tenant: { select: { isActive: true, deletedAt: true } },
        user: { select: { email: true, status: true, deletedAt: true } },
      },
    });
  });

  it('fails closed before querying for unsupported recipient types', async () => {
    await expect(
      service.resolve({ ...input, recipientType: 'TENANT_OPERATIONAL_ROUTE' }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_TYPE_UNSUPPORTED' });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('fails closed before querying for unsupported channels', async () => {
    await expect(service.resolve({ ...input, channel: 'SMS' })).rejects.toMatchObject({
      code: 'RECIPIENT_CHANNEL_UNSUPPORTED',
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('fails closed before querying for malformed opaque references', async () => {
    await expect(
      service.resolve({ ...input, recipientReferenceId: 'not-a-uuid' }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_REFERENCE_INVALID' });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('conceals missing and cross-tenant references as unavailable', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.resolve(input)).rejects.toMatchObject({ code: 'RECIPIENT_UNAVAILABLE' });
  });

  it.each([
    ['suspended membership', { status: 'SUSPENDED' as const }],
    ['ended membership', { endedAt: new Date() }],
    ['deleted membership', { deletedAt: new Date() }],
  ])('rejects a disabled %s', async (_label, membershipPatch) => {
    findFirst.mockResolvedValue({ ...eligibleRecipient(), ...membershipPatch });
    await expect(service.resolve(input)).rejects.toMatchObject({ code: 'RECIPIENT_DISABLED' });
  });

  it('rejects inactive tenant or user state', async () => {
    findFirst
      .mockResolvedValueOnce({
        ...eligibleRecipient(),
        tenant: { isActive: false, deletedAt: null },
      })
      .mockResolvedValueOnce({
        ...eligibleRecipient(),
        user: { email, status: 'SUSPENDED', deletedAt: null },
      });

    await expect(service.resolve(input)).rejects.toMatchObject({ code: 'RECIPIENT_DISABLED' });
    await expect(service.resolve(input)).rejects.toMatchObject({ code: 'RECIPIENT_DISABLED' });
  });

  it('rejects malformed stored destinations without exposing them in the error', async () => {
    const unsafeDestination = ' copied@example.test ';
    findFirst.mockResolvedValue({
      ...eligibleRecipient(),
      user: { email: unsafeDestination, status: 'ACTIVE', deletedAt: null },
    });

    let failure: unknown;
    try {
      await service.resolve(input);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: 'RECIPIENT_DESTINATION_INVALID' });
    expect(String(failure)).not.toContain(unsafeDestination);
    expect(JSON.stringify(failure)).not.toContain(unsafeDestination);
  });
});

function eligibleRecipient() {
  return {
    status: 'ACTIVE' as const,
    endedAt: null,
    deletedAt: null,
    tenant: { isActive: true, deletedAt: null },
    user: { email, status: 'ACTIVE' as const, deletedAt: null },
  };
}
