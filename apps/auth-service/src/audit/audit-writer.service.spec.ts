import { randomUUID } from 'node:crypto';
import { AuditWriter } from './audit-writer.service';
import { AuditDatabase, AuditMetadata } from './audit.types';

describe('AuditWriter', () => {
  const create = jest.fn();
  const database = {
    auditEvent: { create },
  } as unknown as AuditDatabase;
  const writer = new AuditWriter();

  beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: randomUUID() });
  });

  it('writes a bounded tenant event with an attributable actor and request context', async () => {
    const tenantId = randomUUID();
    const actorMembershipId = randomUUID();
    const actorUserId = randomUUID();

    await writer.appendTenantUser(database, {
      tenantId,
      actorMembershipId,
      actorUserId,
      eventType: 'authorization.role.created',
      outcome: 'SUCCEEDED',
      resourceType: 'authorization-role',
      resourceId: randomUUID(),
      metadata: {
        roleName: 'PHARMACY_MANAGER',
        roleVersion: 1,
        permissionCount: 2,
      },
      request: {
        requestId: 'request-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: 'TENANT',
        actorType: 'TENANT_USER',
        tenantId,
        actorMembershipId,
        actorUserId,
        eventType: 'authorization.role.created',
        outcome: 'SUCCEEDED',
        requestId: 'request-123',
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      }),
      select: { id: true },
    });
  });

  it('rejects a TENANT_USER event without an exact authenticated user id before persisting', async () => {
    const tenantId = randomUUID();
    const actorMembershipId = randomUUID();

    await expect(
      writer.appendTenantUser(database, {
        tenantId,
        actorMembershipId,
        actorUserId: '',
        eventType: 'authorization.role.created',
        outcome: 'SUCCEEDED',
        resourceType: 'authorization-role',
        resourceId: randomUUID(),
        metadata: {
          roleName: 'PHARMACY_MANAGER',
          roleVersion: 1,
          permissionCount: 2,
        },
      }),
    ).rejects.toThrow('Authenticated user id is required for TENANT_USER audit events');
    expect(create).not.toHaveBeenCalled();
  });

  it('never writes a user identifier on SYSTEM or platform-system evidence', async () => {
    await writer.appendSystem(database, {
      eventType: 'authentication.session.refresh.failed',
      outcome: 'DENIED',
      resourceType: 'authentication-session',
      resourceId: randomUUID(),
      metadata: { reason: 'session-not-found' },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: 'PLATFORM',
        actorType: 'SYSTEM',
      }),
      select: { id: true },
    });
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty('actorUserId');
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty('platformActorUserId');
  });

  it('rejects an unknown event before touching persistence', async () => {
    await expect(
      writer.appendSystem(database, {
        eventType: 'future.unreviewed.event' as never,
        outcome: 'FAILED',
      }),
    ).rejects.toThrow('Unsupported audit event type');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects partial resource identity before touching persistence', async () => {
    await expect(
      writer.appendSystem(database, {
        eventType: 'authentication.session.refresh.failed',
        outcome: 'DENIED',
        resourceType: 'authentication-session',
      }),
    ).rejects.toThrow('provided together');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects arbitrary, sensitive, nested, and oversized metadata', async () => {
    const base = {
      eventType: 'authentication.session.refresh.failed' as const,
      outcome: 'DENIED' as const,
    };

    await expect(
      writer.appendSystem(database, {
        ...base,
        metadata: { email: 'patient@example.test' } as unknown as AuditMetadata,
      }),
    ).rejects.toThrow('unsupported key');

    await expect(
      writer.appendSystem(database, {
        ...base,
        metadata: { reason: { nested: true } } as unknown as AuditMetadata,
      }),
    ).rejects.toThrow('bounded scalars');

    await expect(
      writer.appendSystem(database, {
        ...base,
        metadata: { reason: 'x'.repeat(241) },
      }),
    ).rejects.toThrow('bounded scalars');

    expect(create).not.toHaveBeenCalled();
  });

  it('writes platform-user evidence without assigning a tenant scope', async () => {
    const platformActorUserId = randomUUID();

    await writer.appendPlatformUser(database, {
      platformActorUserId,
      eventType: 'authentication.sessions.logout.succeeded',
      outcome: 'SUCCEEDED',
      resourceType: 'global-user-sessions',
      resourceId: platformActorUserId,
      metadata: { revokedCount: 3 },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: 'PLATFORM',
        actorType: 'PLATFORM_USER',
        platformActorUserId,
      }),
      select: { id: true },
    });
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty('tenantId');
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty('actorUserId');
    expect(create.mock.calls[0]?.[0]?.data).not.toHaveProperty('actorMembershipId');
  });
});
