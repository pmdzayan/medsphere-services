import { createHmac, timingSafeEqual } from 'node:crypto';

import type { AuthenticatedSession } from './auth-contract';

export const ACCESS_COOKIE = 'medsphere_access';
export const REFRESH_COOKIE = 'medsphere_refresh';
export const PROFILE_COOKIE = 'medsphere_profile';

export type SessionProfile = AuthenticatedSession;

export function sealSessionProfile(profile: SessionProfile, integrityKey: string): string {
  const payload = Buffer.from(JSON.stringify(profile), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, integrityKey)}`;
}

export function readSessionProfile(
  sealedProfile: string | undefined,
  integrityKey: string | undefined,
): SessionProfile | null {
  if (!sealedProfile || !integrityKey) {
    return null;
  }

  const separator = sealedProfile.lastIndexOf('.');
  if (separator <= 0 || separator === sealedProfile.length - 1) {
    return null;
  }

  const payload = sealedProfile.slice(0, separator);
  const suppliedSignature = sealedProfile.slice(separator + 1);
  const expectedSignature = sign(payload, integrityKey);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return isSessionProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sign(payload: string, integrityKey: string): string {
  return createHmac('sha256', integrityKey).update(payload).digest('base64url');
}

function isSessionProfile(value: unknown): value is SessionProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SessionProfile>;
  return (
    Number.isSafeInteger(candidate.expiresIn) &&
    Number(candidate.expiresIn) > 0 &&
    Boolean(
      candidate.user &&
      isBoundedString(candidate.user.id, 100) &&
      isBoundedString(candidate.user.email, 254) &&
      isBoundedString(candidate.user.firstName, 100) &&
      isBoundedString(candidate.user.lastName, 100),
    ) &&
    Boolean(
      candidate.context &&
      isBoundedString(candidate.context.membershipId, 100) &&
      isBoundedString(candidate.context.tenantId, 100) &&
      isBoundedString(candidate.context.tenantName, 200) &&
      isBoundedString(candidate.context.organizationType, 50),
    )
  );
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}
