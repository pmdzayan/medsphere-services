// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import PatientLayout from './layout';
import {
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  sealSessionProfile,
  type SessionProfile,
} from '@/lib/session-profile';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
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

describe('PatientLayout', () => {
  it('allows the dedicated personal NONE session', async () => {
    mockSession(personalProfile);

    const element = await PatientLayout({
      children: <main>patient child</main>,
    });

    expect(element.props.children).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects a healthcare-organization session to the platform dashboard', async () => {
    mockSession({
      ...personalProfile,
      context: {
        ...personalProfile.context,
        tenantName: 'Central Hospital',
        organizationType: 'HOSPITAL',
      },
    });

    await expect(
      PatientLayout({
        children: <main>patient child</main>,
      }),
    ).rejects.toThrow('REDIRECT:/dashboard');

    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });
});
