// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth-api', () => ({
  authApiUrl: vi.fn((path: string) => `https://auth.example.test${path}`),
}));

import { readServerWorkstationSessionState } from './server-workstation-session';

describe('readServerWorkstationSessionState', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts an exact server-authoritative workstation state without exposing the credential', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        locked: true,
        lockedAt: '2026-09-02T08:30:00.000Z',
        securityVersion: 4,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(readServerWorkstationSessionState('locked-refresh-secret')).resolves.toEqual({
      locked: true,
      lockedAt: '2026-09-02T08:30:00.000Z',
      securityVersion: 4,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://auth.example.test/auth/session-state');
    expect(url).not.toContain('locked-refresh-secret');

    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'x-locked-session-refresh': 'locked-refresh-secret',
      },
    });

    expect(init.body).toBeUndefined();
  });

  it('fails closed when the authentication service rejects the session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Unauthorized' }, { status: 401 })),
    );

    await expect(readServerWorkstationSessionState('locked-refresh-secret')).resolves.toBeNull();
  });

  it('fails closed when the service returns a malformed successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          locked: false,
          lockedAt: null,
        }),
      ),
    );

    await expect(readServerWorkstationSessionState('locked-refresh-secret')).resolves.toBeNull();
  });

  it('fails closed when the authentication service is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    await expect(readServerWorkstationSessionState('locked-refresh-secret')).resolves.toBeNull();
  });
});
