import { createHmac, timingSafeEqual } from 'node:crypto';

import type { AuthenticatedSession } from './auth-contract';
import { isKnownLanguageCode } from './settings-contract';

export const ACCESS_COOKIE = 'medsphere_access';
export const REFRESH_COOKIE = 'medsphere_refresh';
export const PROFILE_COOKIE = 'medsphere_profile';

export type SessionProfile = AuthenticatedSession;

type SessionProfilePayload = Omit<SessionProfile, 'user'> & {
  user: Omit<SessionProfile['user'], 'preferredLanguage'> & {
    preferredLanguage?: SessionProfile['user']['preferredLanguage'];
  };
};

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
    if (!isSessionProfilePayload(parsed)) return null;
    return {
      ...parsed,
      user: { ...parsed.user, preferredLanguage: parsed.user.preferredLanguage ?? 'en' },
    };
  } catch {
    return null;
  }
}

function sign(payload: string, integrityKey: string): string {
  return createHmac('sha256', integrityKey).update(payload).digest('base64url');
}

function isSessionProfilePayload(value: unknown): value is SessionProfilePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SessionProfilePayload>;
  return (
    Number.isSafeInteger(candidate.expiresIn) &&
    Number(candidate.expiresIn) > 0 &&
    Boolean(
      candidate.user &&
      isBoundedString(candidate.user.id, 100) &&
      isBoundedString(candidate.user.email, 254) &&
      isBoundedString(candidate.user.firstName, 100) &&
      isBoundedString(candidate.user.lastName, 100) &&
      (candidate.user.preferredLanguage === undefined ||
        isKnownLanguageCode(candidate.user.preferredLanguage)),
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
