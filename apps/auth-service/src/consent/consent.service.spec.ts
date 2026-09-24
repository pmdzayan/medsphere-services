import { ConsentService } from './consent.service';

const identity = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  membershipId: 'membership-1',
  sessionId: 'session-1',
  securityVersion: 1,
  tokenId: 'token-1',
};

function buildService() {
  const transaction = {
    userPrivacy: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const consentRepository = {
    appendWith: jest.fn(),
    findLatestPerCategory: jest.fn(),
  };
  const audit = {
    appendTenantUser: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    client: {
      $transaction: jest.fn(async (operation: (database: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    },
  };

  const service = new ConsentService(consentRepository as never, audit as never, prisma as never);

  return { service, consentRepository, audit, transaction };
}

describe('ConsentService.recordConsent', () => {
  it('appends the grant and audit in the same transaction without silently enabling preferences', async () => {
    const { service, consentRepository, transaction } = buildService();
    consentRepository.appendWith.mockResolvedValue({
      status: 'GRANTED',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.recordConsent(
      identity as never,
      'LOCATION_USE',
      'GRANTED',
      'nearby_search_prompt',
    );

    expect(consentRepository.appendWith).toHaveBeenCalledWith(
      transaction,
      identity.userId,
      'LOCATION_USE',
      'GRANTED',
      'nearby_search_prompt',
    );
    expect(transaction.userPrivacy.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      category: 'LOCATION_USE',
      status: 'GRANTED',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('withdraws reservation notification consent and disables its future preference atomically', async () => {
    const { service, consentRepository, transaction } = buildService();
    consentRepository.appendWith.mockResolvedValue({
      status: 'WITHDRAWN',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    await service.recordConsent(
      identity as never,
      'NOTIFICATIONS_RESERVATIONS',
      'WITHDRAWN',
      'settings_privacy_page',
    );

    expect(transaction.userPrivacy.updateMany).toHaveBeenCalledWith({
      where: { userId: identity.userId },
      data: { wantsReservationNotifications: false },
    });
  });

  it('withdraws operational notification consent and disables its future preference atomically', async () => {
    const { service, consentRepository, transaction } = buildService();
    consentRepository.appendWith.mockResolvedValue({
      status: 'WITHDRAWN',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    await service.recordConsent(
      identity as never,
      'NOTIFICATIONS_OPERATIONAL',
      'WITHDRAWN',
      'settings_privacy_page',
    );

    expect(transaction.userPrivacy.updateMany).toHaveBeenCalledWith({
      where: { userId: identity.userId },
      data: { wantsOperationalAlerts: false },
    });
  });

  it('audits only the bounded category and never the source text', async () => {
    const { service, consentRepository, audit } = buildService();
    consentRepository.appendWith.mockResolvedValue({
      status: 'GRANTED',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await service.recordConsent(
      identity as never,
      'LOCATION_USE',
      'GRANTED',
      'nearby_search_prompt',
    );

    expect(audit.appendTenantUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'privacy.consent.granted',
        outcome: 'SUCCEEDED',
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        actorUserId: identity.userId,
        metadata: { category: 'LOCATION_USE' },
      }),
    );
    const [, auditInput] = audit.appendTenantUser.mock.calls[0];
    expect(JSON.stringify(auditInput)).not.toContain('nearby_search_prompt');
  });

  it('audits a withdrawal with the distinct event type', async () => {
    const { service, consentRepository, audit } = buildService();
    consentRepository.appendWith.mockResolvedValue({
      status: 'WITHDRAWN',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await service.recordConsent(
      identity as never,
      'NOTIFICATIONS_OPERATIONAL',
      'WITHDRAWN',
      'settings_privacy_page',
    );

    expect(audit.appendTenantUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'privacy.consent.withdrawn' }),
    );
  });
});

describe('ConsentService.getConsentStatus', () => {
  it('returns null for a category with no prior consent event', async () => {
    const { service, consentRepository } = buildService();
    consentRepository.findLatestPerCategory.mockResolvedValue(new Map());

    await expect(service.getConsentStatus(identity.userId)).resolves.toEqual([
      { category: 'LOCATION_USE', status: null, updatedAt: null },
      { category: 'NOTIFICATIONS_RESERVATIONS', status: null, updatedAt: null },
      { category: 'NOTIFICATIONS_OPERATIONAL', status: null, updatedAt: null },
    ]);
  });

  it('returns the latest recorded status per category', async () => {
    const { service, consentRepository } = buildService();
    consentRepository.findLatestPerCategory.mockResolvedValue(
      new Map([
        [
          'LOCATION_USE',
          {
            category: 'LOCATION_USE',
            status: 'GRANTED',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      ]),
    );

    const result = await service.getConsentStatus(identity.userId);
    expect(result).toContainEqual({
      category: 'LOCATION_USE',
      status: 'GRANTED',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });
});
