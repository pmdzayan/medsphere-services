import { createSign, createVerify } from 'node:crypto';
import { createRsaTestKeyFixture } from './rsa-key-fixture';

describe('createRsaTestKeyFixture', () => {
  it('should generate a private key', () => {
    const fixture = createRsaTestKeyFixture();
    expect(fixture.privateKeyPem).toBeTruthy();
    expect(fixture.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
  });

  it('should generate a public key', () => {
    const fixture = createRsaTestKeyFixture();
    expect(fixture.publicKeyPem).toBeTruthy();
    expect(fixture.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
  });

  it('should produce base64 values that decode to valid PEM', () => {
    const fixture = createRsaTestKeyFixture();

    const decodedPrivate = Buffer.from(fixture.privateKeyBase64, 'base64').toString('utf-8');
    expect(decodedPrivate).toBe(fixture.privateKeyPem);

    const decodedPublic = Buffer.from(fixture.publicKeyBase64, 'base64').toString('utf-8');
    expect(decodedPublic).toBe(fixture.publicKeyPem);
  });

  it('should produce a key pair that can sign and verify', () => {
    const fixture = createRsaTestKeyFixture();
    const message = 'rsa-test-message';

    const signer = createSign('SHA256');
    signer.update(message);
    signer.end();
    const signature = signer.sign(fixture.privateKeyPem);

    const verifier = createVerify('SHA256');
    verifier.update(message);
    verifier.end();
    const isValid = verifier.verify(fixture.publicKeyPem, signature);

    expect(isValid).toBe(true);
  });

  it('should reject a signature with the wrong key', () => {
    const fixtureA = createRsaTestKeyFixture();
    const fixtureB = createRsaTestKeyFixture();
    const message = 'wrong-key-test';

    const signer = createSign('SHA256');
    signer.update(message);
    signer.end();
    const signature = signer.sign(fixtureA.privateKeyPem);

    const verifier = createVerify('SHA256');
    verifier.update(message);
    verifier.end();
    const isValid = verifier.verify(fixtureB.publicKeyPem, signature);

    expect(isValid).toBe(false);
  });

  it('should return a non-empty key ID', () => {
    const fixture = createRsaTestKeyFixture();
    expect(fixture.keyId).toBeTruthy();
    expect(typeof fixture.keyId).toBe('string');
  });

  it('should not modify process.env', () => {
    const originalEnv = { ...process.env };
    createRsaTestKeyFixture();
    expect(process.env).toEqual(originalEnv);
  });
});
