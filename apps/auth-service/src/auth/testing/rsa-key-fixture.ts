import { generateKeyPairSync, randomUUID } from 'node:crypto';

export interface RsaKeyFixture {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly privateKeyBase64: string;
  readonly publicKeyBase64: string;
  readonly keyId: string;
}

/** Generates ephemeral test-only key material; nothing is persisted or logged. */
export function createRsaTestKeyFixture(): RsaKeyFixture {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    privateKeyBase64: Buffer.from(privateKey, 'utf8').toString('base64'),
    publicKeyBase64: Buffer.from(publicKey, 'utf8').toString('base64'),
    keyId: randomUUID(),
  };
}
