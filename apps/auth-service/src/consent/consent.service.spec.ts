import { ConsentService } from './consent.service';

const identity = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  membershipId: 'membership-1',
  sessionId: 'session-1',
  tokenId: 'token-1',
};

function buildService() {
  const consentRepository = {
    append: jest.fn(),
    findLatestPerCategory: jest.fn(),
  };
  const audit = {
    appendTenantUser: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = { client: {} };

  const service = new ConsentService(consentRepository as never, audit as never, prisma as never);

  return { service, consentRepository, audit };
}

describe('ConsentService.recordConsent', () => {
  it('always appends a new row rather than mutating a prior one -- never a database update call', async () => {
    const { service, consentRepository } = buildService();
    consentRepository.append.mockResolvedValue({
      status: 'GRANTED',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.recordConsent(
      identity as never,
      'LOCATION_USE',
      'GRANTED',
      'nearby_search_prompt',
    );

    expect(consentRepository.append).toHaveBeenCalledWith(
      identity.userId,
      'LOCATION_USE',
      'GRANTED',
      'nearby_search_prompt',
    );
    expect(result).toEqual({
      category: 'LOCATION_USE',
      status: 'GRANTED',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('records a withdrawal the same way -- as a new append, never a delete or update', async () => {
    const { service, consentRepository } = buildService();
    consentRepository.append.mockResolvedValue({
      status: 'WITHDRAWN',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });

    await service.recordConsent(
      identity as never,
      'NOTIFICATIONS_RESERVATIONS',
      'WITHDRAWN',
      'settings_privacy_page',
    );

    expect(consentRepository.append).toHaveBeenCalledWith(
      identity.userId,
      'NOTIFICATIONS_RESERVATIONS',
      'WITHDRAWN',
      'settings_privacy_page',
    );
  });

  it('audits the event with only the bounded category -- never raw source text, coordinates, or notification content', async () => {
    const { service, consentRepository, audit } = buildService();
    consentRepository.append.mockResolvedValue({
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
        metadata: { category: 'LOCATION_USE' },
      }),
    );
    const [, auditInput] = audit.appendTenantUser.mock.calls[0];
    const serialized = JSON.stringify(auditInput);
    expect(serialized).not.toContain('nearby_search_prompt');
  });

  it('audits a withdrawal with the distinct privacy.consent.withdrawn event type', async () => {
    const { service, consentRepository, audit } = buildService();
    consentRepository.append.mockResolvedValue({
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
  it('returns null status for a category with no prior consent event, never a default of GRANTED', async () => {
    const { service, consentRepository } = buildService();
    consentRepository.findLatestPerCategory.mockResolvedValue(new Map());

    const result = await service.getConsentStatus(identity.userId);

    expect(result).toEqual([
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
