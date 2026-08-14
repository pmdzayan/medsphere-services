import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAuditEvents,
  getAssignedProviders,
  getAuthorizationCatalogue,
  getProviderStock,
  getProviderReservations,
  quarantineBatch,
  recordDamagedStock,
  getPrivacyPreferences,
  getSupportedLanguages,
  register,
  transitionProviderReservation,
  updatePreferredLanguage,
  updatePrivacyPreferences,
} from './api-client';
import { REGISTRATION_CONFIRMATION_MESSAGE } from './auth-contract';

const catalogue = { roles: [], permissions: [], total: 0, effectivePermissions: [] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authenticated API client', () => {
  it('rotates an expired access credential once and retries the original request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ message: 'Expired' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ expiresIn: 900 }))
      .mockResolvedValueOnce(Response.json(catalogue));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAuthorizationCatalogue()).resolves.toEqual(catalogue);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/authorization/catalogue',
      '/api/auth/refresh',
      '/api/authorization/catalogue',
    ]);
  });

  it('returns the original bounded session error when credential rotation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ message: 'Session expired' }, { status: 401 }))
        .mockResolvedValueOnce(Response.json({ message: 'Refresh rejected' }, { status: 401 })),
    );

    await expect(getAuthorizationCatalogue()).rejects.toMatchObject({
      message: 'Session expired',
      status: 401,
    });
  });

  it('requests audit evidence with bounded query parameters', async () => {
    const page = { data: [], nextCursor: null };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAuditEvents({ outcome: 'FAILED', limit: 25 })).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith('/api/audit/events?outcome=FAILED&limit=25', {
      cache: 'no-store',
    });
  });

  it('loads assigned providers and selected provider stock through same-origin routes', async () => {
    const providers = [{ providerId: 'provider-id' }];
    const page = { data: [], total: 0, limit: 25, offset: 0 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(providers))
      .mockResolvedValueOnce(Response.json(page));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAssignedProviders()).resolves.toEqual(providers);
    await expect(
      getProviderStock({ providerId: 'provider-id', query: 'metformin', limit: 25, offset: 0 }),
    ).resolves.toEqual(page);
    expect(fetchMock.mock.calls).toEqual([
      ['/api/inventory/providers', { cache: 'no-store' }],
      [
        '/api/inventory/stock?providerId=provider-id&query=metformin&limit=25&offset=0',
        { cache: 'no-store' },
      ],
    ]);
  });

  it('submits the exact versioned quarantine command through the same-origin boundary', async () => {
    const request = {
      expectedVersion: 4,
      idempotencyKey: 'quarantine-command-1',
      reasonCode: 'QUALITY_SUSPECT' as const,
    };
    const receipt = {
      batchId: '73a97ec4-84f8-4a85-a493-b8d6feb84a27',
      status: 'QUARANTINED',
      reasonCode: 'QUALITY_SUSPECT',
      onHandQuantity: 20,
      affectedReservationCount: 1,
      releasedUnitCount: 3,
      resultingBatchVersion: 5,
      occurredAt: '2026-08-14T01:00:00.000Z',
      replayed: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(receipt));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      quarantineBatch(
        '7f51a0f3-3bd1-45d7-85f3-b8b725969df9',
        '73a97ec4-84f8-4a85-a493-b8d6feb84a27',
        request,
      ),
    ).resolves.toEqual(receipt);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/inventory/providers/7f51a0f3-3bd1-45d7-85f3-b8b725969df9/batches/73a97ec4-84f8-4a85-a493-b8d6feb84a27/quarantine',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        cache: 'no-store',
      },
    );
  });

  it('submits the exact completed damaged-stock command through the same-origin boundary', async () => {
    const request = {
      expectedVersion: 4,
      quantity: 2,
      idempotencyKey: 'damage-command-1',
      reason: 'Two sealed packs were physically damaged during handling.',
    };
    const receipt = {
      providerId: '7f51a0f3-3bd1-45d7-85f3-b8b725969df9',
      inventoryId: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
      productId: '8b4d574f-48c6-4231-8851-e65edc9f9d42',
      batchId: '73a97ec4-84f8-4a85-a493-b8d6feb84a27',
      movementId: '52f2d7a4-0948-49c4-a0a8-afbf88503a5c',
      quantity: 2,
      onHandBefore: 20,
      onHandAfter: 18,
      resultingBatchVersion: 5,
      occurredAt: '2026-08-14T02:00:00.000Z',
      replayed: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(receipt));
    vi.stubGlobal('fetch', fetchMock);

    await expect(recordDamagedStock(receipt.providerId, receipt.batchId, request)).resolves.toEqual(
      receipt,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/inventory/providers/${receipt.providerId}/batches/${receipt.batchId}/damage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        cache: 'no-store',
      },
    );
  });

  it('loads selected provider reservations with accepted filters', async () => {
    const page = { data: [], total: 0, limit: 25, offset: 0 };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getProviderReservations({ providerId: 'provider-id', status: 'READY', limit: 25, offset: 0 }),
    ).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/inventory/reservations?providerId=provider-id&status=READY&limit=25&offset=0',
      { cache: 'no-store' },
    );
  });

  it('submits the exact reservation lifecycle command through the same-origin boundary', async () => {
    const request = { transition: 'READY' as const, expectedVersion: 2, idempotencyKey: 'ready-1' };
    const receipt = {
      reservationId: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
      status: 'READY',
      version: 3,
      totalQuantity: 2,
      replayed: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(receipt));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      transitionProviderReservation(
        '7f51a0f3-3bd1-45d7-85f3-b8b725969df9',
        receipt.reservationId,
        request,
      ),
    ).resolves.toEqual(receipt);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/inventory/providers/7f51a0f3-3bd1-45d7-85f3-b8b725969df9/reservations/${receipt.reservationId}/transitions`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        cache: 'no-store',
      },
    );
  });

  it('loads and updates account settings through same-origin endpoints', async () => {
    const privacy = {
      sharePhone: false,
      shareEmail: false,
      allowInAppChat: true,
      privatePickup: false,
      hideSensitiveNotifications: true,
    };
    const languages = [{ code: 'en', name: 'English' }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(privacy))
      .mockResolvedValueOnce(Response.json(languages))
      .mockResolvedValueOnce(Response.json({ ...privacy, privatePickup: true }))
      .mockResolvedValueOnce(Response.json({ message: 'Language updated' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPrivacyPreferences()).resolves.toEqual(privacy);
    await expect(getSupportedLanguages()).resolves.toEqual(languages);
    await expect(updatePrivacyPreferences({ privatePickup: true })).resolves.toEqual({
      ...privacy,
      privatePickup: true,
    });
    await expect(updatePreferredLanguage({ preferredLanguage: 'en' })).resolves.toEqual({
      message: 'Language updated',
    });

    expect(fetchMock.mock.calls).toEqual([
      ['/api/settings/privacy', { cache: 'no-store' }],
      ['/api/settings/languages', { cache: 'no-store' }],
      [
        '/api/settings/privacy',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ privatePickup: true }),
          cache: 'no-store',
        },
      ],
      [
        '/api/settings/language',
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ preferredLanguage: 'en' }),
          cache: 'no-store',
        },
      ],
    ]);
  });
});

describe('public onboarding API client', () => {
  it('submits only the accepted registration contract without starting a session', async () => {
    const request = {
      tenantSlug: 'central-pharmacy',
      email: 'operator@example.com',
      password: 'a-secure-password',
      firstName: 'Mira',
      lastName: 'Patel',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ message: REGISTRATION_CONFIRMATION_MESSAGE }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(register(request)).resolves.toEqual({
      message: REGISTRATION_CONFIRMATION_MESSAGE,
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a bounded registration error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: 'Too many onboarding requests. Try again later.' },
            { status: 429 },
          ),
        ),
    );

    await expect(
      register({
        tenantSlug: 'central-pharmacy',
        email: 'operator@example.com',
        password: 'a-secure-password',
        firstName: 'Mira',
        lastName: 'Patel',
      }),
    ).rejects.toMatchObject({
      message: 'Too many onboarding requests. Try again later.',
      status: 429,
    });
  });
});
