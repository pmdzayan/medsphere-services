import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { AppModule } from './app.module';
import { configureAuthApplication } from './app.bootstrap';
import { AuthConfigFixtureKey, createAuthConfigFixture } from './auth/testing/auth-config-fixture';
import { AuthConfigService } from './auth/auth-config.service';
import { AuthenticatedIdentity } from './auth/auth.types';
import { SessionRepository } from './auth/session.repository';
import { TokenService } from './auth/token.service';
import { RedisThrottlerStorage } from './security/redis-throttler.storage';
import { UsersService } from './users/users.service';

interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

describe('S0.3 authentication HTTP security boundary', () => {
  jest.setTimeout(30000);
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
    increment: jest.fn().mockResolvedValue({ totalHits: 1, timeToExpire: 60 }),
  } as unknown as RedisThrottlerStorage;

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

    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SessionRepository)
      .useValue(sessionRepository)
      .overrideProvider(UsersService)
      .useValue(usersService)
      .overrideProvider(RedisThrottlerStorage)
      .useValue(rateLimitStorage)
      .compile();

    app = module.createNestApplication();
    configureAuthApplication(app);
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
    validateAccessIdentity.mockReset();
    getPrivacy.mockReset();
    getPrivacy.mockResolvedValue({
      sharePhone: false,
      shareEmail: false,
      allowInAppChat: true,
      privatePickup: false,
      hideSensitiveNotifications: true,
    });
  });

  it('keeps only accepted metadata and health endpoints public', async () => {
    await expect(sendRequest('/health/live')).resolves.toMatchObject({
      status: 200,
      body: { status: 'ok' },
    });

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
    expect(publicLoginBoundary.status).toBe(400);
  });

  it('denies a protected route without a bearer token using the shared error envelope', async () => {
    const response = await sendRequest('/users/me/privacy');

    expect(response).toEqual({
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

  it.each(['/rbac/roles', '/audit'])(
    'S0.4 accepted module requires authentication: %s',
    async (path) => {
      const response = await sendRequest(path);
      // S0.4 mounts RBAC and Audit modules — they now return 401 (auth required)
      // instead of 404 (not found).
      expect(response.status).toBe(401);
    },
  );

  it.each([
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
