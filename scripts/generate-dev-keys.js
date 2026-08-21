#!/usr/bin/env node
// Generates development-only cryptographic material for a local .env:
// an RSA key pair (matching apps/auth-service/src/auth/auth-config.service.ts's
// requirements -- PKCS#8 private / SPKI public, >= 2048-bit) and a refresh
// token pepper (>= 32 random bytes). Prints .env-ready lines to stdout;
// never writes to any file, so it can never accidentally overwrite or leak
// into a committed .env. Uses only Node's built-in crypto module -- no new
// dependency.
//
// This mirrors the exact algorithm already used for ephemeral test keys in
// apps/auth-service/src/auth/testing/rsa-key-fixture.ts, applied to real
// local-development use rather than test fixtures.

const { generateKeyPairSync, randomBytes } = require('node:crypto');

function generateDevKeyMaterial() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    privateKeyBase64: Buffer.from(privateKey, 'utf8').toString('base64'),
    publicKeyBase64: Buffer.from(publicKey, 'utf8').toString('base64'),
    refreshPepperBase64: randomBytes(32).toString('base64'),
  };
}

function main() {
  const { privateKeyBase64, publicKeyBase64, refreshPepperBase64 } = generateDevKeyMaterial();
  console.log('# Development-only key material. Never commit these values.');
  console.log('# Paste the three lines below into your local .env, replacing any');
  console.log('# existing AUTH_JWT_PRIVATE_KEY_BASE64 / AUTH_JWT_PUBLIC_KEY_BASE64 /');
  console.log('# AUTH_REFRESH_TOKEN_PEPPER lines.');
  console.log(`AUTH_JWT_PRIVATE_KEY_BASE64=${privateKeyBase64}`);
  console.log(`AUTH_JWT_PUBLIC_KEY_BASE64=${publicKeyBase64}`);
  console.log(`AUTH_REFRESH_TOKEN_PEPPER=${refreshPepperBase64}`);
}

if (require.main === module) {
  main();
}

module.exports = { generateDevKeyMaterial };
