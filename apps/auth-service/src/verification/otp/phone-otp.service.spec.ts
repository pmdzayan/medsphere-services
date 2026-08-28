import { BadRequestException } from '@nestjs/common';
import { hashOtpCode } from './otp-crypto.util';
import { PhoneOtpService } from './phone-otp.service';
import { SmsProviderContractFailure } from './sms-provider-activation.contracts';

const OTP_PEPPER = Buffer.from('c'.repeat(64), 'hex');

interface ChallengeRow {
  id: string;
  codeHash: string;
  attempts: number;
  consumedAt: Date | null;
  expiresAt?: Date;
  lastRequestedAt?: Date;
  [key: string]: unknown;
}

function buildService(
  overrides: {
    membership?: unknown;
    memberships?: unknown[];
    challenge?: ChallengeRow | null;
    deliver?: jest.Mock;
  } = {},
) {
  const membership = overrides.membership;
  let challengeRow: ChallengeRow | null = overrides.challenge ?? null;

  const transaction = {
    tenantMembership: {
      findFirst: jest.fn().mockResolvedValue(membership ?? null),
      findMany: jest.fn().mockResolvedValue(overrides.memberships ?? (membership ? [membership] : [])),
    },
    phoneOtpChallenge: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(challengeRow)),
      upsert: jest.fn().mockImplementation(({ create }: { create: ChallengeRow }) => {
        challengeRow = { ...create, id: 'challenge-1', attempts: 0, consumedAt: null };
        return Promise.resolve(challengeRow);
      }),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const increment = (data.attempts as { increment?: number } | undefined)?.increment;
        challengeRow = increment
          ? {
              ...(challengeRow as ChallengeRow),
              attempts: (challengeRow as ChallengeRow).attempts + increment,
            }
          : { ...(challengeRow as ChallengeRow), ...data };
        return Promise.resolve(challengeRow);
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const prisma = {
    client: {
      $transaction: jest.fn((op: (tx: typeof transaction) => unknown) => op(transaction)),
      phoneOtpChallenge: {
        updateMany: transaction.phoneOtpChallenge.updateMany,
      },
    },
  };
  const audit = { appendTenantSystem: jest.fn().mockResolvedValue(undefined) };
  const authConfig = { value: { otpPepper: OTP_PEPPER } };
  const accountVerification = {
    applyPhoneVerified: jest.fn().mockResolvedValue({
      userId: 'user-1',
      membershipId: 'membership-1',
      userStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
      activated: true,
    }),
  };
  const deliver = overrides.deliver ?? jest.fn().mockResolvedValue({ acknowledgement: 'ACCEPTED' });
  const smsRegistry = { provider: jest.fn().mockReturnValue({ providerKey: 'test', deliver }) };

  const service = new PhoneOtpService(
    prisma as never,
    audit as never,
    authConfig as never,
    accountVerification as never,
    smsRegistry as never,
  );

  return {
    service,
    transaction,
    audit,
    accountVerification,
    deliver,
    smsRegistry,
    getChallenge: () => challengeRow,
  };
}

const MEMBERSHIP = {
  id: 'membership-1',
  tenantId: 'tenant-1',
  status: 'PENDING',
  user: { id: 'user-1', phone: '+15551234567' },
};

describe('PhoneOtpService.requestOtp', () => {
  it('resolves a unique onboarding membership without requiring an internal tenant slug', async () => {
    const { service, transaction, deliver } = buildService({ membership: MEMBERSHIP });

    await service.requestOtp({ email: 'person@example.com' });

    expect(transaction.tenantMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('fails closed when slug-free onboarding membership resolution is ambiguous', async () => {
    const { service, deliver } = buildService({
      memberships: [MEMBERSHIP, { ...MEMBERSHIP, id: 'membership-2', tenantId: 'tenant-2' }],
    });

    const result = await service.requestOtp({ email: 'person@example.com' });

    expect(result.message).toBe('If eligible, a verification code has been sent.');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('returns the same generic message when no eligible membership exists (non-enumerating)', async () => {
    const { service, deliver } = buildService({ membership: null });
    const result = await service.requestOtp({
      tenantSlug: 'acme',
      email: 'nobody@example.com',
    });
    expect(result.message).toBe('If eligible, a verification code has been sent.');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('uses only the phone bound to the stored user and exposes no caller-controlled destination', async () => {
    const { service, deliver } = buildService({
      membership: {
        ...MEMBERSHIP,
        user: { id: 'user-1', phone: '+15550001111' },
      },
    });

    await service.requestOtp({
      tenantSlug: 'acme',
      email: 'a@example.com',
    });

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].to).toBe('+15550001111');
  });

  it('creates a challenge and dispatches via the SMS provider for an eligible subject', async () => {
    const { service, deliver, audit, getChallenge } = buildService({ membership: MEMBERSHIP });
    const result = await service.requestOtp({
      tenantSlug: 'acme',
      email: 'a@example.com',
    });
    expect(result.message).toBe('If eligible, a verification code has been sent.');
    expect(deliver).toHaveBeenCalledTimes(1);
    const [[deliverArgs]] = deliver.mock.calls;
    expect(deliverArgs.to).toBe('+15551234567');
    expect(deliverArgs.body).not.toMatch(/undefined/);
    expect(getChallenge()!.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      audit.appendTenantSystem.mock.calls.some(
        ([, input]: [unknown, { eventType: string }]) =>
          input.eventType === 'authentication.otp.requested',
      ),
    ).toBe(true);
  });

  it('does not overwrite an active challenge within the resend cooldown (silent no-op)', async () => {
    const { service, deliver } = buildService({
      membership: MEMBERSHIP,
      challenge: {
        id: 'challenge-existing',
        codeHash: '0'.repeat(64),
        attempts: 0,
        consumedAt: null,
        lastRequestedAt: new Date(),
      },
    });
    const result = await service.requestOtp({
      tenantSlug: 'acme',
      email: 'a@example.com',
    });
    expect(result.message).toBe('If eligible, a verification code has been sent.');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('invalidates the challenge and surfaces a clear error when the SMS provider is unavailable', async () => {
    const deliver = jest
      .fn()
      .mockRejectedValue(
        new SmsProviderContractFailure('PROVIDER_UNAVAILABLE', 'unconfigured', 'TRANSIENT'),
      );
    const { service, transaction } = buildService({ membership: MEMBERSHIP, deliver });
    await expect(
      service.requestOtp({ tenantSlug: 'acme', email: 'a@example.com' }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction.phoneOtpChallenge.updateMany).toHaveBeenCalled();
  });
});

describe('PhoneOtpService.verifyOtp', () => {
  function challengeFor(code: string, overrides: Record<string, unknown> = {}) {
    return {
      id: 'challenge-1',
      codeHash: hashOtpCode(OTP_PEPPER, code),
      attempts: 0,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
  }

  it('rejects when no eligible membership is found (non-enumerating)', async () => {
    const { service } = buildService({ membership: null });
    await expect(
      service.verifyOtp({ tenantSlug: 'acme', email: 'nobody@example.com', code: '123456' }),
    ).rejects.toThrow('Invalid or expired verification code');
  });

  it('rejects when no challenge exists', async () => {
    const { service } = buildService({ membership: MEMBERSHIP, challenge: null });
    await expect(
      service.verifyOtp({ tenantSlug: 'acme', email: 'a@example.com', code: '123456' }),
    ).rejects.toThrow('Invalid or expired verification code');
  });

  it('rejects an incorrect code and increments attempts', async () => {
    const { service, getChallenge } = buildService({
      membership: MEMBERSHIP,
      challenge: challengeFor('111111'),
    });
    await expect(
      service.verifyOtp({ tenantSlug: 'acme', email: 'a@example.com', code: '222222' }),
    ).rejects.toThrow('Invalid verification code');
    expect(getChallenge()!.attempts).toBe(1);
  });

  it('rejects an expired challenge', async () => {
    const { service } = buildService({
      membership: MEMBERSHIP,
      challenge: challengeFor('111111', { expiresAt: new Date(Date.now() - 1000) }),
    });
    await expect(
      service.verifyOtp({ tenantSlug: 'acme', email: 'a@example.com', code: '111111' }),
    ).rejects.toThrow('expired');
  });

  it('rejects once attempts are exhausted, even with the correct code', async () => {
    const { service } = buildService({
      membership: MEMBERSHIP,
      challenge: challengeFor('111111', { attempts: 5 }),
    });
    await expect(
      service.verifyOtp({ tenantSlug: 'acme', email: 'a@example.com', code: '111111' }),
    ).rejects.toThrow('Too many attempts');
  });

  it('accepts a correct code, consumes the challenge, and delegates activation', async () => {
    const { service, accountVerification, getChallenge } = buildService({
      membership: MEMBERSHIP,
      challenge: challengeFor('111111'),
    });
    const result = await service.verifyOtp({
      tenantSlug: 'acme',
      email: 'a@example.com',
      code: '111111',
    });
    expect(result.activated).toBe(true);
    expect(result.replayed).toBe(false);
    expect(getChallenge()!.consumedAt).not.toBeNull();
    expect(accountVerification.applyPhoneVerified).toHaveBeenCalledWith(expect.anything(), {
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
  });

  it('is idempotent on replay of the same already-consumed code', async () => {
    const { service } = buildService({
      membership: MEMBERSHIP,
      challenge: challengeFor('111111', { consumedAt: new Date() }),
    });
    const result = await service.verifyOtp({
      tenantSlug: 'acme',
      email: 'a@example.com',
      code: '111111',
    });
    expect(result.replayed).toBe(true);
  });

  it('rejects a different code submitted against an already-consumed challenge', async () => {
    const { service } = buildService({
      membership: MEMBERSHIP,
      challenge: challengeFor('111111', { consumedAt: new Date() }),
    });
    await expect(
      service.verifyOtp({ tenantSlug: 'acme', email: 'a@example.com', code: '999999' }),
    ).rejects.toThrow('Invalid or expired verification code');
  });
});
