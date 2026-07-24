import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';
import { AuditEventQueryDto } from './dto/audit-event-query.dto';

describe('AuditService tenant read boundary', () => {
  const identity: AuthenticatedIdentity = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    tenantId: randomUUID(),
    sessionId: randomUUID(),
    tokenId: randomUUID(),
  };
  let repository: jest.Mocked<AuditRepository>;
  let service: AuditService;

  beforeEach(() => {
    repository = {
      findTenantEvent: jest.fn(),
      listTenantEvents: jest.fn(),
    } as unknown as jest.Mocked<AuditRepository>;
    service = new AuditService(repository);
  });

  it('never falls back outside the authenticated tenant for an unknown event', async () => {
    const eventId = randomUUID();
    repository.findTenantEvent.mockResolvedValue(null);

    await expect(service.findTenantEvent(identity, eventId)).rejects.toThrow(NotFoundException);
    expect(repository.findTenantEvent).toHaveBeenCalledWith(identity.tenantId, eventId);
  });

  it('requires resource filters as one complete pair', async () => {
    const query = new AuditEventQueryDto();
    query.resourceId = randomUUID();

    await expect(service.listTenantEvents(identity, query)).rejects.toThrow(BadRequestException);
    expect(repository.listTenantEvents).not.toHaveBeenCalled();
  });

  it('rejects inverted date ranges and tenant-invalid cursors', async () => {
    const range = new AuditEventQueryDto();
    range.startDate = '2026-07-26T00:00:00.000Z';
    range.endDate = '2026-07-25T00:00:00.000Z';
    await expect(service.listTenantEvents(identity, range)).rejects.toThrow(BadRequestException);

    const cursor = new AuditEventQueryDto();
    cursor.cursor = randomUUID();
    repository.listTenantEvents.mockResolvedValue({ data: [], cursorFound: false });
    await expect(service.listTenantEvents(identity, cursor)).rejects.toThrow(BadRequestException);
    expect(repository.listTenantEvents).toHaveBeenCalledWith(identity.tenantId, cursor);
  });

  it('fails closed instead of exposing corrupted persisted metadata', async () => {
    repository.findTenantEvent.mockResolvedValue({
      id: randomUUID(),
      scope: 'TENANT',
      actorType: 'TENANT_USER',
      outcome: 'DENIED',
      tenantId: identity.tenantId,
      actorMembershipId: identity.membershipId,
      platformActorUserId: null,
      eventType: 'authorization.permission.denied',
      resourceType: null,
      resourceId: null,
      requestId: null,
      ipAddress: null,
      userAgent: null,
      metadata: { unexpectedPayload: { private: true } },
      occurredAt: new Date(),
    } as never);

    await expect(service.findTenantEvent(identity, randomUUID())).rejects.toThrow(
      'unsupported key',
    );
  });
});
