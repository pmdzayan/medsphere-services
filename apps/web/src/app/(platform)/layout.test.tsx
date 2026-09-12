// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import PlatformLayout from './layout';
import {
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  sealSessionProfile,
  type SessionProfile,
} from '@/lib/session-profile';
import { readServerWorkstationSessionState } from '@/lib/server-workstation-session';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock('@/lib/server-workstation-session', () => ({
  readServerWorkstationSessionState: vi.fn(),
}));

const personalProfile: SessionProfile = {
  expiresIn: 900,
  user: {
    id: 'patient-user',
    email: 'patient@example.com',
    firstName: 'Patient',
    lastName: 'User',
    preferredLanguage: 'en',
  },
  context: {
    membershipId: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    tenantName: 'AIM Personal Accounts',
    organizationType: 'NONE',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

function mockSession(profile: SessionProfile) {
  const refreshToken = 'refresh-secret';
  const sealed = sealSessionProfile(profile, refreshToken);

  vi.mocked(cookies).mockResolvedValue({
    get(name: string) {
      if (name === REFRESH_COOKIE) {
        return { name, value: refreshToken };
      }

      if (name === PROFILE_COOKIE) {
        return { name, value: sealed };
      }

      return undefined;
    },
  } as never);
}

describe('PlatformLayout patient boundary', () => {
  it('redirects a personal NONE session before loading the staff workstation shell', async () => {
    mockSession(personalProfile);

    await expect(
      PlatformLayout({
        children: <main>platform child</main>,
      }),
    ).rejects.toThrow('REDIRECT:/patient/dashboard');

    expect(redirect).toHaveBeenCalledWith('/patient/dashboard');
    expect(readServerWorkstationSessionState).not.toHaveBeenCalled();
  });
});
