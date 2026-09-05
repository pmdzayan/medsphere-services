import { PrismaService } from '../prisma/prisma.service';
import { UsersRepository } from './users.repository';

describe('UsersRepository authentication scopes', () => {
  const externalIdentityFindFirst = jest.fn();
  const membershipFindFirst = jest.fn();
  const membershipFindMany = jest.fn();
  const prisma = {
    client: {
      externalAuthIdentity: { findFirst: externalIdentityFindFirst },
      tenantMembership: {
        findFirst: membershipFindFirst,
        findMany: membershipFindMany,
      },
    },
  } as unknown as PrismaService;
  const repository = new UsersRepository(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    externalIdentityFindFirst.mockResolvedValue(null);
    membershipFindFirst.mockResolvedValue(null);
    membershipFindMany.mockResolvedValue([]);
  });

  it('finds a Google subject globally but only through an active, non-deleted user', async () => {
    await repository.findGlobalGoogleIdentityBySubject('verified-google-subject');

    expect(externalIdentityFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: 'GOOGLE',
          subject: 'verified-google-subject',
          user: { status: 'ACTIVE', deletedAt: null },
        },
      }),
    );
  });

  it('lists only active, non-deleted memberships in active tenants for an active user', async () => {
    await repository.findActiveMembershipsForUser('verified-user-id');

    expect(membershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'verified-user-id',
          status: 'ACTIVE',
          deletedAt: null,
          tenant: { isActive: true, deletedAt: null },
          user: { status: 'ACTIVE', deletedAt: null },
        },
      }),
    );
  });

  it('binds organization selection to the verified user and repeats every active-state filter', async () => {
    await repository.findLoginIdentityByMembershipId(
      'verified-user-id',
      '93b31836-6a84-4db9-a935-1c55960c25da',
    );

    expect(membershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: '93b31836-6a84-4db9-a935-1c55960c25da',
          userId: 'verified-user-id',
          status: 'ACTIVE',
          deletedAt: null,
          tenant: { isActive: true, deletedAt: null },
          user: { status: 'ACTIVE', deletedAt: null },
        },
      }),
    );
  });
});
