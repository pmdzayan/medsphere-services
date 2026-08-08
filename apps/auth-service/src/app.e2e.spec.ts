import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { AddressInfo } from 'node:net';
import { Controller, Get, HttpException, HttpStatus, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { DomainException, PublicEndpoint } from '@medsphere/common';

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

interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

const E2E_LIFECYCLE_TIMEOUT_MS = 60_000;

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
      .overrideProvider(AuthorizationService)
      .useValue(authorizationService)
      .overrideProvider(AuditService)
      .useValue(auditService)
      .overrideProvider(AuditWriter)
      .useValue(auditWriter)
      .compile();

    app = module.createNestApplication();
    configureAuthApplication(app);
    await app.listen(0, '127.0.0.1');

    tokenService = module.get(TokenService);
    authConfig = module.get(AuthConfigService);
  }, E2E_LIFECYCLE_TIMEOUT_MS);

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
  }, E2E_LIFECYCLE_TIMEOUT_MS);

  beforeEach(() => {
    validateAccessIdentity.mockReset();
    getPrivacy.mockReset();
    hasAllPermissions.mockReset();
    listRoles.mockReset();
    updateRole.mockReset();
    listTenantEvents.mockReset();
    appendTenantUser.mockReset().mockResolvedValue(undefined);
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
    expect(languages.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'en' }),
        expect.objectContaining({ code: 'hi' }),
        expect.objectContaining({ code: 'ta' }),
        expect.objectContaining({ code: 'te' }),
        expect.objectContaining({ code: 'kn' }),
      ]),
    );

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

  it('echoes only bounded, log-safe request identifiers in error envelopes', async () => {
    await expect(
      sendRequest('/users/me/privacy', {
        headers: { 'x-request-id': 'gateway:request-123' },
      }),
    ).resolves.toMatchObject({
      status: 401,
      body: { error: { requestId: 'gateway:request-123' } },
    });

    const unsafe = await sendRequest('/users/me/privacy', {
      headers: { 'x-request-id': 'patient@example.test' },
    });
    expect(unsafe.status).toBe(401);
    expect(unsafe.body).not.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ requestId: expect.anything() }),
      }),
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
      { userId, membershipId, tenantId, sessionId },
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

  it.each(['/authorization/roles', '/audit/events'])(
    'keeps an accepted S0.4 route authenticated: %s',
    async (path) => {
      await expect(sendRequest(path)).resolves.toMatchObject({ status: 401 });
      expect(hasAllPermissions).not.toHaveBeenCalled();
    },
  );

  it('derives authorization tenant context from trusted identity and ignores forged headers', async () => {
    const issued = issueAccessToken();
    const identity: AuthenticatedIdentity = {
      userId,
      membershipId,
      tenantId,
      sessionId,
      tokenId: issued.tokenId,
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
    return tokenService.issueAccessToken({ userId, membershipId, tenantId, sessionId });
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
