import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { AddressInfo } from 'node:net';
import { Controller, Get, HttpException, HttpStatus, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainException, HEALTH_READINESS_CHECK, PublicEndpoint } from '@medsphere/common';
import type { ServiceLogger } from '@medsphere/logger';

import { AppModule } from './app.module';
import { configureAuthApplication } from './app.bootstrap';
import { AuthConfigFixtureKey, createAuthConfigFixture } from './auth/testing/auth-config-fixture';
import { AuthConfigService } from './auth/auth-config.service';
import { AuthenticatedIdentity } from './auth/auth.types';
import { SessionRepository } from './auth/session.repository';
import { TokenService } from './auth/token.service';
import { AuditService } from './audit/audit.service';
import { AuditWriter } from './audit/audit-writer.service';
import { AuthorizationService } from './authorization/authorization.service';
import { RedisThrottlerStorage } from './security/redis-throttler.storage';
import { UsersService } from './users/users.service';
import { InventoryCommandService } from './inventory/inventory-command.service';
import { InventoryService } from './inventory/inventory.service';
import { ReservationLifecycleService } from './inventory/reservation-lifecycle.service';
import { ReservationService } from './inventory/reservation.service';

interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

@Controller('__e2e/errors')
@PublicEndpoint()
class ErrorBoundaryTestController {
  @Get('domain')
  domainError(): never {
    throw new DomainException('BOUNDED_CLIENT_ERROR', 'x'.repeat(800), HttpStatus.BAD_REQUEST);
  }

  @Get('server')
  serverError(): never {
    throw new HttpException(
      'database connection detail must remain private',
      HttpStatus.BAD_GATEWAY,
    );
  }

  @Get('invalid-server-status')
  invalidServerStatus(): never {
    throw new HttpException('invalid status detail must remain private', 700);
  }
}

describe('S0.4 authentication and authorization HTTP security boundary', () => {
  const userId = randomUUID();
  const membershipId = randomUUID();
  const tenantId = randomUUID();
  const sessionId = randomUUID();
  const authEnvironment = createAuthConfigFixture();
  const previousEnvironment = new Map<AuthConfigFixtureKey, string | undefined>();
  const previousSwaggerEnvironment = process.env.ENABLE_SWAGGER;

  const observabilityLogger = {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } satisfies ServiceLogger;

  const validateAccessIdentity = jest.fn();
  const sessionRepository = {
    validateAccessIdentity,
  } as unknown as SessionRepository;
  const getPrivacy = jest.fn();
  const usersService = {
    getPrivacy,
  } as unknown as UsersService;
  const rateLimitStorage = {
    increment: jest.fn().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
  } as unknown as RedisThrottlerStorage;
  const readinessCheck = {
    check: jest.fn(),
  };
  const hasAllPermissions = jest.fn();
  const listRoles = jest.fn();
  const updateRole = jest.fn();
  const authorizationService = {
    hasAllPermissions,
    listRoles,
    updateRole,
  } as unknown as AuthorizationService;
  const listTenantEvents = jest.fn();
  const auditService = {
    listTenantEvents,
  } as unknown as AuditService;
  const appendTenantUser = jest.fn();
  const auditWriter = {
    appendTenantUser,
  } as unknown as AuditWriter;
  const listStock = jest.fn();
  const inventoryService = { listStock } as unknown as InventoryService;
  const configureInventory = jest.fn();
  const receiveBatch = jest.fn();
  const adjustBatch = jest.fn();
  const inventoryCommandService = {
    configureInventory,
    receiveBatch,
    adjustBatch,
  } as unknown as InventoryCommandService;
  const listReservations = jest.fn();
  const getReservation = jest.fn();
  const reservationService = {
    list: listReservations,
    get: getReservation,
  } as unknown as ReservationService;
  const transitionReservation = jest.fn();
  const reservationLifecycleService = {
    transition: transitionReservation,
  } as unknown as ReservationLifecycleService;

  let app: INestApplication;
  let module: TestingModule;
  let tokenService: TokenService;
  let authConfig: AuthConfigService;

  beforeAll(async () => {
    for (const [key, value] of Object.entries(authEnvironment) as Array<
      [AuthConfigFixtureKey, string]
    >) {
      previousEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }
    process.env.ENABLE_SWAGGER = 'false';

    module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ErrorBoundaryTestController],
    })
      .overrideProvider(SessionRepository)
      .useValue(sessionRepository)
      .overrideProvider(UsersService)
      .useValue(usersService)
      .overrideProvider(RedisThrottlerStorage)
      .useValue(rateLimitStorage)
      .overrideProvider(HEALTH_READINESS_CHECK)
      .useValue(readinessCheck)
      .overrideProvider(AuthorizationService)
      .useValue(authorizationService)
      .overrideProvider(AuditService)
      .useValue(auditService)
      .overrideProvider(AuditWriter)
      .useValue(auditWriter)
      .overrideProvider(InventoryService)
      .useValue(inventoryService)
      .overrideProvider(InventoryCommandService)
      .useValue(inventoryCommandService)
      .overrideProvider(ReservationService)
      .useValue(reservationService)
      .overrideProvider(ReservationLifecycleService)
      .useValue(reservationLifecycleService)
      .compile();

    app = module.createNestApplication();
    configureAuthApplication(app, observabilityLogger);
    await app.listen(0, '127.0.0.1');

    tokenService = module.get(TokenService);
    authConfig = module.get(AuthConfigService);
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    if (previousSwaggerEnvironment === undefined) {
      delete process.env.ENABLE_SWAGGER;
    } else {
      process.env.ENABLE_SWAGGER = previousSwaggerEnvironment;
    }
  });

  beforeEach(() => {
    readinessCheck.check.mockReset().mockResolvedValue(undefined);
    validateAccessIdentity.mockReset();
    getPrivacy.mockReset();
    hasAllPermissions.mockReset();
    listRoles.mockReset();
    updateRole.mockReset();
    listTenantEvents.mockReset();
    appendTenantUser.mockReset().mockResolvedValue(undefined);
    listStock.mockReset();
    configureInventory.mockReset();
    receiveBatch.mockReset();
    adjustBatch.mockReset();
    listReservations.mockReset();
    getReservation.mockReset();
    transitionReservation.mockReset();
    getPrivacy.mockResolvedValue({
      sharePhone: false,
      shareEmail: false,
      allowInAppChat: true,
      privatePickup: false,
      hideSensitiveNotifications: true,
    });
  });

  it('keeps only accepted metadata and health endpoints public', async () => {
    const health = await sendRequest('/health/live');
    expect(health).toMatchObject({
      status: 200,
      body: { status: 'ok' },
    });
    expect(health.headers).toMatchObject({
      'content-security-policy': expect.any(String),
      'x-content-type-options': 'nosniff',
    });
    expect(health.headers['x-powered-by']).toBeUndefined();

    const languages = await sendRequest('/localization/languages');
    expect(languages.status).toBe(200);
    expect(languages.body).toEqual([
      expect.objectContaining({ code: 'en' }),
      expect.objectContaining({ code: 'ta' }),
      expect.objectContaining({ code: 'ur' }),
    ]);

    const publicLoginBoundary = await sendRequest('/auth/login', {
      method: 'POST',
      body: {},
    });
    expect(publicLoginBoundary).toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'BadRequestException',
          message: expect.any(String),
        },
      },
    });
    expect(typeof (publicLoginBoundary.body as { error: { message: unknown } }).error.message).toBe(
      'string',
    );
  });

  it('separates process liveness from dependency-backed readiness', async () => {
    const healthy = await sendRequest('/health/ready');

    expect(healthy).toMatchObject({
      status: 200,
      body: { status: 'ok' },
    });
    expect(readinessCheck.check).toHaveBeenCalledTimes(1);

    readinessCheck.check
      .mockReset()
      .mockRejectedValue(
        new Error('postgresql://private-user:private-password@private-host/medsphere'),
      );

    const liveDuringDependencyFailure = await sendRequest('/health/live');
    expect(liveDuringDependencyFailure).toMatchObject({
      status: 200,
      body: { status: 'ok' },
    });
    expect(readinessCheck.check).not.toHaveBeenCalled();

    const unavailable = await sendRequest('/health/ready');
    expect(unavailable.status).toBe(503);
    expect(readinessCheck.check).toHaveBeenCalledTimes(1);

    const serialized = JSON.stringify(unavailable.body);
    expect(serialized).not.toContain('private-password');
    expect(serialized).not.toContain('private-user');
    expect(serialized).not.toContain('private-host');
    expect(serialized).not.toContain('postgresql://');
  });

  it('denies a protected route without a bearer token using the shared error envelope', async () => {
    const response = await sendRequest('/users/me/privacy');

    expect(response).toMatchObject({
      status: 401,
      body: {
        error: {
          code: 'UnauthorizedException',
          message: 'Authentication required',
        },
      },
    });
    expect(getPrivacy).not.toHaveBeenCalled();
  });

  it('propagates valid request identifiers and replaces unsafe identifiers', async () => {
    const accepted = await sendRequest('/users/me/privacy', {
      headers: { 'x-request-id': 'gateway:request-123' },
    });

    expect(accepted).toMatchObject({
      status: 401,
      body: { error: { requestId: 'gateway:request-123' } },
    });
    expect(accepted.headers['x-request-id']).toBe('gateway:request-123');

    const unsafe = await sendRequest('/users/me/privacy', {
      headers: { 'x-request-id': 'patient@example.test' },
    });

    expect(unsafe.status).toBe(401);

    const generatedRequestId = unsafe.headers['x-request-id'];

    expect(typeof generatedRequestId).toBe('string');
    expect(generatedRequestId).not.toBe('patient@example.test');
    expect((unsafe.body as { error: { requestId?: string } }).error.requestId).toBe(
      generatedRequestId,
    );
  });

  it('never exposes server-side exception detail through the HTTP boundary', async () => {
    await expect(
      sendRequest('/__e2e/errors/server', {
        headers: { 'x-request-id': 'gateway:error-123' },
      }),
    ).resolves.toMatchObject({
      status: 502,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong.',
          requestId: 'gateway:error-123',
        },
      },
    });

    await expect(sendRequest('/__e2e/errors/invalid-server-status')).resolves.toMatchObject({
      status: 500,
      body: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong.',
        },
      },
    });
  });

  it('bounds accepted client-facing domain error messages', async () => {
    const response = await sendRequest('/__e2e/errors/domain');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'BOUNDED_CLIENT_ERROR',
        message: expect.any(String),
      },
    });
    expect((response.body as { error: { message: string } }).error.message).toHaveLength(512);
  });

  it('rejects an algorithm-substitution token before trusted-identity lookup', async () => {
    const configuration = authConfig.value;
    const forgedToken = new JwtService().sign(
      {
        sub: userId,
        mid: membershipId,
        tid: tenantId,
        sid: sessionId,
        jti: randomUUID(),
        tokenUse: 'access',
      },
      {
        secret: 'attacker-controlled-secret',
        algorithm: 'HS256',
        issuer: configuration.issuer,
        audience: configuration.audience,
        expiresIn: 300,
        header: {
          alg: 'HS256',
          typ: 'at+jwt',
          kid: configuration.keyId,
        },
      },
    );

    const response = await sendRequest('/users/me/privacy', {
      headers: { authorization: `Bearer ${forgedToken}` },
    });

    expect(response.status).toBe(401);
    expect(validateAccessIdentity).not.toHaveBeenCalled();
    expect(getPrivacy).not.toHaveBeenCalled();
  });

  it('derives self context from the signed token and active server-side chain', async () => {
    const issued = issueAccessToken();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);

    const response = await sendRequest('/users/me/privacy', {
      headers: {
        authorization: `Bearer ${issued.value}`,
        'x-user-id': randomUUID(),
        'x-tenant-id': randomUUID(),
      },
    });

    expect(response.status).toBe(200);
    expect(validateAccessIdentity).toHaveBeenCalledWith(
      { userId, membershipId, tenantId, sessionId, securityVersion: 1 },
      issued.tokenId,
    );
    expect(getPrivacy).toHaveBeenCalledWith(userId);
  });

  it('denies the same signed access token after its live session chain is revoked', async () => {
    const issued = issueAccessToken();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValueOnce(identity).mockResolvedValueOnce(null);

    const authorization = { authorization: `Bearer ${issued.value}` };
    await expect(
      sendRequest('/users/me/privacy', { headers: authorization }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      sendRequest('/users/me/privacy', { headers: authorization }),
    ).resolves.toMatchObject({ status: 401 });
  });

  it.each(['/authorization/roles', '/audit/events', `/inventory/providers/${randomUUID()}/stock`])(
    'keeps an accepted S0.4 route authenticated: %s',
    async (path) => {
      await expect(sendRequest(path)).resolves.toMatchObject({ status: 401 });
      expect(hasAllPermissions).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['PUT', `/inventory/providers/${randomUUID()}/products/${randomUUID()}`],
    ['POST', `/inventory/providers/${randomUUID()}/products/${randomUUID()}/batches`],
    ['POST', `/inventory/providers/${randomUUID()}/batches/${randomUUID()}/adjustments`],
    ['POST', `/inventory/providers/${randomUUID()}/transfers`],
    ['POST', `/inventory/providers/${randomUUID()}/batches/${randomUUID()}/damage`],
  ] as const)('keeps an inventory mutation authenticated: %s %s', async (method, path) => {
    await expect(sendRequest(path, { method })).resolves.toMatchObject({ status: 401 });
    expect(hasAllPermissions).not.toHaveBeenCalled();
  });

  it('uses trusted identity for the provider-scoped inventory read boundary', async () => {
    const issued = issueAccessToken();
    const providerId = randomUUID();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);
    hasAllPermissions.mockResolvedValue(true);
    listStock.mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    const response = await sendRequest(
      `/inventory/providers/${providerId}/stock?limit=25&query=medicine`,
      {
        headers: {
          authorization: `Bearer ${issued.value}`,
          'x-tenant-id': randomUUID(),
          'x-provider-id': randomUUID(),
        },
      },
    );

    expect(response).toMatchObject({
      status: 200,
      body: { data: [], total: 0, limit: 25, offset: 0 },
      headers: { 'cache-control': 'private, no-store' },
    });
    expect(hasAllPermissions).toHaveBeenCalledWith(identity, ['inventory.stock.read']);
    expect(listStock).toHaveBeenCalledWith(
      identity,
      providerId,
      expect.objectContaining({ limit: 25, query: 'medicine' }),
    );
  });

  it('uses trusted identity and no-store caching for provider reservation reads', async () => {
    const issued = issueAccessToken();
    const providerId = randomUUID();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);
    hasAllPermissions.mockResolvedValue(true);
    listReservations.mockResolvedValue({ data: [], total: 0, limit: 25, offset: 0 });

    const response = await sendRequest(
      `/inventory/providers/${providerId}/reservations?limit=25&status=READY`,
      { headers: { authorization: `Bearer ${issued.value}` } },
    );

    expect(response).toMatchObject({
      status: 200,
      body: { data: [], total: 0, limit: 25, offset: 0 },
      headers: { 'cache-control': 'private, no-store' },
    });
    expect(hasAllPermissions).toHaveBeenCalledWith(identity, ['inventory.reservations.read']);
    expect(listReservations).toHaveBeenCalledWith(
      identity,
      providerId,
      expect.objectContaining({ limit: 25, status: 'READY' }),
    );
  });

  it('maps a bounded staff reservation transition and rejects worker-only expiry', async () => {
    const issued = issueAccessToken();
    const providerId = randomUUID();
    const reservationId = randomUUID();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);
    hasAllPermissions.mockResolvedValue(true);
    transitionReservation.mockResolvedValue({
      reservationId,
      status: 'CONFIRMED',
      version: 2,
      totalQuantity: 4,
      replayed: false,
    });

    const path = `/inventory/providers/${providerId}/reservations/${reservationId}/transitions`;
    const response = await sendRequest(path, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${issued.value}`,
        'x-request-id': 'reservation-transition-1',
      },
      body: { transition: 'CONFIRM', expectedVersion: 1, idempotencyKey: 'confirm-1' },
    });

    expect(response.status).toBe(200);
    expect(hasAllPermissions).toHaveBeenCalledWith(identity, ['inventory.reservations.manage']);
    expect(transitionReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: identity,
        providerId,
        reservationId,
        transition: 'CONFIRM',
        request: expect.objectContaining({ requestId: 'reservation-transition-1' }),
      }),
    );

    transitionReservation.mockClear();
    const expiry = await sendRequest(path, {
      method: 'POST',
      headers: { authorization: `Bearer ${issued.value}` },
      body: { transition: 'EXPIRE', expectedVersion: 1, idempotencyKey: 'expire-1' },
    });
    expect(expiry.status).toBe(400);
    expect(transitionReservation).not.toHaveBeenCalled();
  });

  it('passes trusted identity and bounded request metadata to inventory configuration', async () => {
    const issued = issueAccessToken();
    const providerId = randomUUID();
    const productId = randomUUID();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);
    hasAllPermissions.mockResolvedValue(true);
    configureInventory.mockResolvedValue({
      inventoryId: randomUUID(),
      version: 1,
      replayed: false,
    });

    const response = await sendRequest(`/inventory/providers/${providerId}/products/${productId}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${issued.value}`,
        'x-tenant-id': randomUUID(),
        'x-provider-id': randomUUID(),
        'x-request-id': 'inventory-configure-1',
      },
      body: {
        sellingPrice: '120.00',
        mrp: '135.00',
        discountPercentage: '5.00',
        taxPercentage: '5.00',
        minimumStockLevel: 10,
        isVisible: true,
        idempotencyKey: 'configure-1',
      },
    });

    expect(response.status).toBe(200);
    expect(hasAllPermissions).toHaveBeenCalledWith(identity, ['inventory.listings.manage']);
    expect(configureInventory).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: identity,
        providerId,
        productId,
        idempotencyKey: 'configure-1',
        request: expect.objectContaining({ requestId: 'inventory-configure-1' }),
      }),
    );
  });

  it('validates and maps the batch receipt command without accepting client identity', async () => {
    const issued = issueAccessToken();
    const providerId = randomUUID();
    const productId = randomUUID();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);
    hasAllPermissions.mockResolvedValue(true);
    receiveBatch.mockResolvedValue({
      inventoryId: randomUUID(),
      batchId: randomUUID(),
      movementId: randomUUID(),
      onHandBefore: 0,
      onHandAfter: 20,
      batchVersion: 1,
      replayed: false,
    });

    const response = await sendRequest(
      `/inventory/providers/${providerId}/products/${productId}/batches`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${issued.value}` },
        body: {
          batchNumber: 'BATCH-001',
          manufacturingDate: '2026-01-01T00:00:00.000Z',
          expiryDate: '2028-01-01T00:00:00.000Z',
          quantity: 20,
          purchasePrice: '100.00',
          sellingPrice: '120.00',
          idempotencyKey: 'receive-1',
        },
      },
    );

    expect(response.status).toBe(200);
    expect(hasAllPermissions).toHaveBeenCalledWith(identity, ['inventory.stock.receive']);
    expect(receiveBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: identity,
        providerId,
        productId,
        manufacturingDate: new Date('2026-01-01T00:00:00.000Z'),
        expiryDate: new Date('2028-01-01T00:00:00.000Z'),
      }),
    );
  });

  it('rejects unknown inventory command fields before reaching the mutation service', async () => {
    const issued = issueAccessToken();
    validateAccessIdentity.mockResolvedValue({
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
    });
    hasAllPermissions.mockResolvedValue(true);

    const response = await sendRequest(
      `/inventory/providers/${randomUUID()}/batches/${randomUUID()}/adjustments`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${issued.value}` },
        body: {
          expectedVersion: 1,
          delta: -1,
          reason: 'Verified cycle count',
          idempotencyKey: 'adjust-1',
          tenantId: randomUUID(),
        },
      },
    );

    expect(response.status).toBe(400);
    expect(adjustBatch).not.toHaveBeenCalled();
  });

  it('maps a versioned adjustment from trusted identity with its dedicated permission', async () => {
    const issued = issueAccessToken();
    const providerId = randomUUID();
    const batchId = randomUUID();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);
    hasAllPermissions.mockResolvedValue(true);
    adjustBatch.mockResolvedValue({
      inventoryId: randomUUID(),
      batchId,
      movementId: randomUUID(),
      onHandBefore: 20,
      onHandAfter: 19,
      batchVersion: 2,
      replayed: false,
    });

    const response = await sendRequest(
      `/inventory/providers/${providerId}/batches/${batchId}/adjustments`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${issued.value}` },
        body: {
          expectedVersion: 1,
          delta: -1,
          reason: 'Verified cycle count',
          idempotencyKey: 'adjust-1',
        },
      },
    );

    expect(response.status).toBe(200);
    expect(hasAllPermissions).toHaveBeenCalledWith(identity, ['inventory.stock.adjust']);
    expect(adjustBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: identity,
        providerId,
        batchId,
        expectedVersion: 1,
        delta: -1,
      }),
    );
  });

  it('derives authorization tenant context from trusted identity and ignores forged headers', async () => {
    const issued = issueAccessToken();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);
    hasAllPermissions.mockResolvedValue(true);
    listRoles.mockResolvedValue({ data: [], total: 0, limit: 50, offset: 0 });

    const response = await sendRequest('/authorization/roles', {
      headers: {
        authorization: `Bearer ${issued.value}`,
        'x-user-id': randomUUID(),
        'x-tenant-id': randomUUID(),
      },
    });

    expect(response).toMatchObject({ status: 200 });
    expect(hasAllPermissions).toHaveBeenCalledWith(identity, ['authorization.roles.read']);
    expect(listRoles).toHaveBeenCalledWith(identity, expect.objectContaining({ limit: 50 }));
  });

  it('records a durable tenant denial before returning forbidden', async () => {
    const issued = issueAccessToken();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);
    hasAllPermissions.mockResolvedValue(false);

    const response = await sendRequest('/authorization/roles', {
      headers: {
        authorization: `Bearer ${issued.value}`,
        'x-request-id': 'e2e-denial-1',
      },
    });

    expect(response.status).toBe(403);
    expect(listRoles).not.toHaveBeenCalled();
    expect(appendTenantUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId,
        actorMembershipId: membershipId,
        actorUserId: userId,
        eventType: 'authorization.permission.denied',
        request: expect.objectContaining({ requestId: 'e2e-denial-1' }),
      }),
    );
  });

  it.each([
    [undefined, 428],
    ['W/"1"', 400],
    ['1', 400],
    ['"0"', 400],
  ])('rejects a missing or malformed strong role precondition: %s', async (ifMatch, status) => {
    const issued = issueAccessToken();
    validateAccessIdentity.mockResolvedValue({
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
    });
    hasAllPermissions.mockResolvedValue(true);
    const roleId = randomUUID();

    const response = await sendRequest(`/authorization/roles/${roleId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${issued.value}`,
        ...(ifMatch ? { 'if-match': ifMatch } : {}),
      },
      body: { description: 'Updated description' },
    });

    expect(response.status).toBe(status);
    expect(updateRole).not.toHaveBeenCalled();
  });

  it('passes a strong role version and bounded request context to the service', async () => {
    const issued = issueAccessToken();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);
    hasAllPermissions.mockResolvedValue(true);
    const roleId = randomUUID();
    updateRole.mockResolvedValue({
      id: roleId,
      name: 'PHARMACY_MANAGER',
      description: 'Updated description',
      type: 'TENANT',
      version: 4,
      permissionKeys: [],
      assignmentCount: 0,
    });

    const response = await sendRequest(`/authorization/roles/${roleId}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${issued.value}`,
        'if-match': '"3"',
        'x-request-id': 'e2e-update-1',
      },
      body: { description: 'Updated description' },
    });

    expect(response.status).toBe(200);
    expect(updateRole).toHaveBeenCalledWith(
      identity,
      roleId,
      3,
      { description: 'Updated description' },
      expect.objectContaining({ requestId: 'e2e-update-1' }),
    );
  });

  it('uses the authenticated tenant for bounded audit reads', async () => {
    const issued = issueAccessToken();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
      securityVersion: 1,
    };
    validateAccessIdentity.mockResolvedValue(identity);
    hasAllPermissions.mockResolvedValue(true);
    listTenantEvents.mockResolvedValue({ data: [], nextCursor: null });

    const response = await sendRequest('/audit/events?limit=10', {
      headers: {
        authorization: `Bearer ${issued.value}`,
        'x-tenant-id': randomUUID(),
      },
    });

    expect(response).toMatchObject({ status: 200, body: { data: [], nextCursor: null } });
    expect(listTenantEvents).toHaveBeenCalledWith(identity, expect.objectContaining({ limit: 10 }));
  });

  it.each([
    '/rbac/roles',
    '/audit',
    '/provider-verification/status',
    `/providers/${randomUUID()}`,
    '/products',
    '/inventory',
  ])('does not expose an unaccepted prototype route: %s', async (path) => {
    const response = await sendRequest(path);
    expect(response.status).toBe(404);
  });

  function issueAccessToken() {
    return tokenService.issueAccessToken({
      userId,
      membershipId,
      tenantId,
      sessionId,
      securityVersion: 1,
    });
  }

  async function sendRequest(path: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const address = app.getHttpServer().address() as AddressInfo;
    const serializedBody = options.body === undefined ? undefined : JSON.stringify(options.body);

    return new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          host: '127.0.0.1',
          port: address.port,
          path,
          method: options.method ?? 'GET',
          headers: {
            accept: 'application/json',
            ...(serializedBody
              ? {
                  'content-type': 'application/json',
                  'content-length': Buffer.byteLength(serializedBody).toString(),
                }
              : {}),
            ...options.headers,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            const rawBody = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: response.statusCode ?? 0,
              body: rawBody ? (JSON.parse(rawBody) as unknown) : undefined,
              headers: response.headers,
            });
          });
        },
      );
      request.on('error', reject);
      if (serializedBody) {
        request.write(serializedBody);
      }
      request.end();
    });
  }
});
