import { createPrivateKey, createPublicKey, KeyObject, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const MINIMUM_RSA_MODULUS_BITS = 2048;
const MINIMUM_REFRESH_PEPPER_BYTES = 32;

export interface AuthConfiguration {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly issuer: string;
  readonly audience: string;
  readonly keyId: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshIdleTtlSeconds: number;
  readonly refreshAbsoluteTtlSeconds: number;
  readonly refreshTokenPepper: Buffer;
  readonly argon2MemoryKiB: number;
  readonly argon2TimeCost: number;
  readonly argon2Parallelism: number;
  readonly googleOAuthClientId?: string;
}

type AuthEnvironment = NodeJS.ProcessEnv;

function requireValue(environment: AuthEnvironment, name: string): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`Missing required authentication environment variable: ${name}`);
  }
  return value;
}

function decodeBase64(name: string, value: string): Buffer {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`${name} must be valid padded base64`);
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 0 || decoded.toString('base64') !== value) {
    throw new Error(`${name} must be canonical base64`);
  }
  return decoded;
}

function parseInteger(
  environment: AuthEnvironment,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const raw = requireValue(environment, name);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a decimal integer`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function validateRsaKey(name: string, key: KeyObject): void {
  if (key.asymmetricKeyType !== 'rsa') {
    throw new Error(`${name} must contain an RSA key`);
  }

  const modulusLength = key.asymmetricKeyDetails?.modulusLength;
  if (!modulusLength || modulusLength < MINIMUM_RSA_MODULUS_BITS) {
    throw new Error(`${name} must use an RSA modulus of at least 2048 bits`);
  }
}

function parseKeys(environment: AuthEnvironment): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const privateKeyPem = decodeBase64(
    'AUTH_JWT_PRIVATE_KEY_BASE64',
    requireValue(environment, 'AUTH_JWT_PRIVATE_KEY_BASE64'),
  ).toString('utf8');
  const publicKeyPem = decodeBase64(
    'AUTH_JWT_PUBLIC_KEY_BASE64',
    requireValue(environment, 'AUTH_JWT_PUBLIC_KEY_BASE64'),
  ).toString('utf8');

  let privateKey: KeyObject;
  let publicKey: KeyObject;
  try {
    privateKey = createPrivateKey(privateKeyPem);
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    throw new Error('Authentication JWT key material is not valid PEM');
  }

  validateRsaKey('AUTH_JWT_PRIVATE_KEY_BASE64', privateKey);
  validateRsaKey('AUTH_JWT_PUBLIC_KEY_BASE64', publicKey);

  const derivedPublic = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const configuredPublic = publicKey.export({ format: 'der', type: 'spki' });
  if (
    derivedPublic.length !== configuredPublic.length ||
    !timingSafeEqual(derivedPublic, configuredPublic)
  ) {
    throw new Error('Authentication JWT public key does not match the private key');
  }

  return { privateKeyPem, publicKeyPem };
}

function parseIssuer(environment: AuthEnvironment): string {
  const raw = requireValue(environment, 'AUTH_JWT_ISSUER');
  let issuer: URL;
  try {
    issuer = new URL(raw);
  } catch {
    throw new Error('AUTH_JWT_ISSUER must be an absolute URL');
  }

  if (
    issuer.protocol !== 'https:' ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash
  ) {
    throw new Error('AUTH_JWT_ISSUER must be a clean HTTPS URL');
  }
  return issuer.toString().replace(/\/$/, '');
}

export function parseAuthEnvironment(environment: AuthEnvironment): AuthConfiguration {
  const keys = parseKeys(environment);
  const audience = requireValue(environment, 'AUTH_JWT_AUDIENCE');
  const keyId = requireValue(environment, 'AUTH_JWT_KEY_ID');

  if (audience.length > 120 || !/^[A-Za-z0-9._:/-]+$/.test(audience)) {
    throw new Error('AUTH_JWT_AUDIENCE has an invalid format');
  }
  if (keyId.length > 64 || !/^[A-Za-z0-9._-]+$/.test(keyId)) {
    throw new Error('AUTH_JWT_KEY_ID has an invalid format');
  }

  const accessTokenTtlSeconds = parseInteger(
    environment,
    'AUTH_ACCESS_TOKEN_TTL_SECONDS',
    60,
    3600,
  );
  const refreshIdleTtlSeconds = parseInteger(
    environment,
    'AUTH_REFRESH_IDLE_TTL_SECONDS',
    300,
    2_592_000,
  );
  const refreshAbsoluteTtlSeconds = parseInteger(
    environment,
    'AUTH_REFRESH_ABSOLUTE_TTL_SECONDS',
    3600,
    15_552_000,
  );

  if (refreshIdleTtlSeconds < accessTokenTtlSeconds) {
    throw new Error('Refresh idle TTL must not be shorter than the access-token TTL');
  }
  if (refreshAbsoluteTtlSeconds < refreshIdleTtlSeconds) {
    throw new Error('Refresh absolute TTL must not be shorter than the refresh idle TTL');
  }

  const refreshTokenPepper = decodeBase64(
    'AUTH_REFRESH_TOKEN_PEPPER',
    requireValue(environment, 'AUTH_REFRESH_TOKEN_PEPPER'),
  );
  if (refreshTokenPepper.length < MINIMUM_REFRESH_PEPPER_BYTES) {
    throw new Error('AUTH_REFRESH_TOKEN_PEPPER must contain at least 32 random bytes');
  }

  return Object.freeze({
    ...keys,
    issuer: parseIssuer(environment),
    audience,
    keyId,
    accessTokenTtlSeconds,
    refreshIdleTtlSeconds,
    refreshAbsoluteTtlSeconds,
    refreshTokenPepper: Buffer.from(refreshTokenPepper),
    argon2MemoryKiB: parseInteger(environment, 'AUTH_ARGON2_MEMORY_KIB', 19_456, 262_144),
    argon2TimeCost: parseInteger(environment, 'AUTH_ARGON2_TIME_COST', 2, 10),
    argon2Parallelism: parseInteger(environment, 'AUTH_ARGON2_PARALLELISM', 1, 8),
    googleOAuthClientId: environment.GOOGLE_OAUTH_CLIENT_ID?.trim() || undefined,
  });
}

@Injectable()
export class AuthConfigService {
  private readonly configuration = parseAuthEnvironment(process.env);

  get value(): AuthConfiguration {
    return this.configuration;
  }
}
