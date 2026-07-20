import { generateKeyPairSync, randomUUID } from 'node:crypto';

/**
 * Readonly result of an ephemeral RSA test-key generation.
 *
 * Every property is derived at runtime — no key material is committed,
 * logged, or written to disk.
 */
export interface RsaKeyFixture {
  /** Private key in PEM format. */
  readonly privateKeyPem: string;
  /** Public key in PEM format. */
  readonly publicKeyPem: string;
  /** Private key PEM encoded as base64 (for environment-style config). */
  readonly privateKeyBase64: string;
  /** Public key PEM encoded as base64 (for environment-style config). */
  readonly publicKeyBase64: string;
  /** Non-sensitive test key identifier. */
  readonly keyId: string;
}

/**
 * Generate an ephemeral RSA key pair for test use.
 *
 * Keys are created every call — never cached, logged, or persisted.
 * The caller must not commit the returned values to source control.
 */
export function createRsaTestKeyFixture(): RsaKeyFixture {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const privateKeyBase64 = Buffer.from(privateKey, 'utf-8').toString('base64');
  const publicKeyBase64 = Buffer.from(publicKey, 'utf-8').toString('base64');
  const keyId = randomUUID();

  return {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    privateKeyBase64,
    publicKeyBase64,
    keyId,
  } as const;
}
