import { createSign, createVerify } from 'node:crypto';
import { createRsaTestKeyFixture } from './rsa-key-fixture';

describe('createRsaTestKeyFixture', () => {
  it('creates an ephemeral 2048-bit RSA pair that signs and verifies', () => {
    const fixture = createRsaTestKeyFixture();
    const signer = createSign('SHA256');
    signer.update('medsphere-test');
    signer.end();

    const verifier = createVerify('SHA256');
    verifier.update('medsphere-test');
    verifier.end();

    expect(verifier.verify(fixture.publicKeyPem, signer.sign(fixture.privateKeyPem))).toBe(true);
    expect(Buffer.from(fixture.privateKeyBase64, 'base64').toString('utf8')).toBe(
      fixture.privateKeyPem,
    );
    expect(Buffer.from(fixture.publicKeyBase64, 'base64').toString('utf8')).toBe(
      fixture.publicKeyPem,
    );
  });

  it('does not mutate process.env', () => {
    const originalEnvironment = { ...process.env };
    createRsaTestKeyFixture();
    expect(process.env).toEqual(originalEnvironment);
  });
});
