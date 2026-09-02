import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';
import { LockedSessionVerifierService } from './locked-session-verifier.service';

describe('LockedSessionVerifierService', () => {
  const userId = randomUUID();
  const membershipId = randomUUID();
  const tenantId = randomUUID();
  const sessionId = randomUUID();
  const presentedHash = 'a'.repeat(64);
  const lockedAt = new Date('2026-09-01T12:00:00.000Z');

  let prisma: jest.Mocked<PrismaService>;
  let tokenService: jest.Mocked<TokenService>;
  let service: LockedSessionVerifierService;

  const lockedSessionRow = {
    id: sessionId,
    userId,
    membershipId,
    tenantId,
    lockedAt,
    securityVersion: 2,
  };

  beforeEach(() => {
    tokenService = {
      parseRefreshCredential: jest.fn(),
      hashRefreshCredential: jest.fn(),
    } as unknown as jest.Mocked<TokenService>;
    prisma = {
      client: {
        userSession: {
          findFirst: jest.fn(),
        },
      },
    } as unknown as jest.Mocked<PrismaService>;

    service = new LockedSessionVerifierService(prisma, tokenService);
    tokenService.parseRefreshCredential.mockReturnValue({ sessionId, verifier: 'v'.repeat(43) });
    tokenService.hashRefreshCredential.mockReturnValue(presentedHash);
  });

  describe('verifyLockedSession', () => {
    it('returns the server-derived identity for a valid locked session', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue(lockedSessionRow);

      const result = await service.verifyLockedSession('msr.presented');

      expect(result).toEqual({
        identity: { userId, membershipId, tenantId, sessionId, securityVersion: 2 },
        lockedAt,
        securityVersion: 2,
      });
      expect(prisma.client.userSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: sessionId,
            status: 'ACTIVE',
            lockedAt: { not: null },
            refreshCredentials: {
              some: { hash: presentedHash, status: 'ACTIVE' },
            },
          }),
        }),
      );
    });

    it('fails closed when the session is not locked', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue({
        ...lockedSessionRow,
        lockedAt: null,
      });

      await expect(service.verifyLockedSession('msr.presented')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when the session is not found', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyLockedSession('msr.presented')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when the refresh credential hash does not match', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyLockedSession('msr.wrong')).rejects.toThrow(UnauthorizedException);
      expect(tokenService.hashRefreshCredential).toHaveBeenCalledWith('msr.wrong');
    });

    it('fails closed when the refresh credential is revoked or used', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyLockedSession('msr.presented')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when the session is expired', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyLockedSession('msr.presented')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when the identity chain is disabled', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyLockedSession('msr.presented')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed for a malformed refresh credential', async () => {
      tokenService.parseRefreshCredential.mockImplementation(() => {
        throw new UnauthorizedException('Invalid refresh credential');
      });

      await expect(service.verifyLockedSession('not-a-credential')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('does not mutate or consume the credential (read-only verification)', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue(lockedSessionRow);

      await service.verifyLockedSession('msr.presented');

      expect(prisma.client.userSession.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.client.userSession.updateMany).toBeUndefined();
      expect(prisma.client.userSessionRefreshCredential).toBeUndefined();
    });
  });

  describe('verifySessionState', () => {
    it('reports locked state for a locked session', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue(lockedSessionRow);

      const result = await service.verifySessionState('msr.presented');

      expect(result).toEqual({
        identity: { userId, membershipId, tenantId, sessionId, securityVersion: 2 },
        locked: true,
        lockedAt,
        securityVersion: 2,
      });
    });

    it('reports active state for an unlocked session', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue({
        ...lockedSessionRow,
        lockedAt: null,
      });

      const result = await service.verifySessionState('msr.presented');

      expect(result).toEqual({
        identity: { userId, membershipId, tenantId, sessionId, securityVersion: 2 },
        locked: false,
        lockedAt: null,
        securityVersion: 2,
      });
    });

    it('fails closed when the session is not found', async () => {
      (prisma.client.userSession.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.verifySessionState('msr.presented')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
