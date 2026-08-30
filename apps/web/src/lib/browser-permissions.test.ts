import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CameraSession,
  readBrowserCapability,
  requestBrowserNotifications,
  requestCurrentLocation,
  startCameraScan,
  validateUserSelectedFile,
} from './browser-permissions';

const originalNotification = globalThis.Notification;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: originalNotification,
  });
  Reflect.deleteProperty(navigator, 'geolocation');
  Reflect.deleteProperty(navigator, 'mediaDevices');
  Reflect.deleteProperty(navigator, 'permissions');
});

describe('central browser permission capability', () => {
  it('does not request location while reading startup capability state', async () => {
    const getCurrentPosition = vi.fn();
    installNavigator('geolocation', { getCurrentPosition });

    expect(await readBrowserCapability('location')).toBe('prompt');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('reports location unsupported without invoking a browser request', async () => {
    expect(await readBrowserCapability('location')).toBe('unsupported');
  });

  it('returns precise location only after the explicit request function is called', async () => {
    const position = locationPosition(12.9716, 77.5946);
    const getCurrentPosition = vi.fn((success: PositionCallback) => success(position));
    installNavigator('geolocation', { getCurrentPosition });

    expect(getCurrentPosition).not.toHaveBeenCalled();
    await expect(requestCurrentLocation()).resolves.toEqual({ state: 'granted', position });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: true }),
    );
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'unavailable'],
    [99, 'error'],
  ] as const)('maps geolocation error code %s to %s', async (code, state) => {
    installNavigator('geolocation', {
      getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
        failure(locationFailure(code)),
    });

    await expect(requestCurrentLocation()).resolves.toEqual({ state });
  });

  it.each(['granted', 'denied', 'default'] as const)(
    'keeps notification browser state distinct for %s',
    async (permission) => {
      const requestPermission = vi.fn().mockResolvedValue(permission);
      installNotification(permission, requestPermission);

      expect(await readBrowserCapability('notifications')).toBe(
        permission === 'default' ? 'prompt' : permission,
      );
      expect(requestPermission).not.toHaveBeenCalled();
      await expect(requestBrowserNotifications()).resolves.toBe(
        permission === 'default' ? 'prompt' : permission,
      );
    },
  );

  it('reports notifications unsupported and contains request failures', async () => {
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: undefined });
    expect(await readBrowserCapability('notifications')).toBe('unsupported');

    installNotification('default', vi.fn().mockRejectedValue(new Error('raw browser detail')));
    await expect(requestBrowserNotifications()).resolves.toBe('error');
  });

  it('never treats a MedSphere preference as browser notification permission', async () => {
    const medSphereNotificationPreference = true;
    installNotification('denied', vi.fn());

    expect(medSphereNotificationPreference).toBe(true);
    expect(await readBrowserCapability('notifications')).toBe('denied');
  });

  it('requests camera only from the explicit scan action and disables audio', async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    installNavigator('mediaDevices', { getUserMedia });

    expect(await readBrowserCapability('camera')).toBe('prompt');
    expect(getUserMedia).not.toHaveBeenCalled();

    const result = await startCameraScan();
    expect(result.state).toBe('granted');
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.any(Object) }),
    );

    result.session?.stop();
    result.session?.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('handles camera denial and unavailable hardware without reflecting exceptions', async () => {
    installNavigator('mediaDevices', {
      getUserMedia: vi
        .fn()
        .mockRejectedValueOnce(new DOMException('private browser detail', 'NotAllowedError'))
        .mockRejectedValueOnce(new DOMException('private browser detail', 'NotFoundError')),
    });

    await expect(startCameraScan()).resolves.toEqual({ state: 'denied' });
    await expect(startCameraScan()).resolves.toEqual({ state: 'unavailable' });
  });

  it('stops every active media track', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }] as unknown as MediaStreamTrack[];
    const session = new CameraSession({ getTracks: () => tracks } as unknown as MediaStream);
    session.stop();
    expect(tracks.every((track) => vi.mocked(track.stop).mock.calls.length === 1)).toBe(true);
  });

  it('validates only the user-selected file object at the existing type and size boundary', () => {
    const boundary = { acceptedTypes: ['image/jpeg'], maximumBytes: 1_000 } as const;
    expect(
      validateUserSelectedFile(new File(['ok'], 'scan.jpg', { type: 'image/jpeg' }), boundary),
    ).toBeNull();
    expect(
      validateUserSelectedFile(new File(['bad'], 'scan.txt', { type: 'text/plain' }), boundary),
    ).toBe('type');
    expect(
      validateUserSelectedFile(
        new File([new Uint8Array(1_001)], 'large.jpg', { type: 'image/jpeg' }),
        boundary,
      ),
    ).toBe('size');
  });

  it('does not log raw coordinates, media details, or upstream permission exceptions', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    installNavigator('geolocation', {
      getCurrentPosition: (success: PositionCallback) => success(locationPosition(1.2345, 6.789)),
    });

    await requestCurrentLocation();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

function installNavigator(key: string, value: unknown) {
  Object.defineProperty(navigator, key, { configurable: true, value });
}

function installNotification(
  permission: NotificationPermission,
  requestPermission: () => Promise<NotificationPermission>,
) {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: { permission, requestPermission },
  });
}

function locationPosition(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  } as GeolocationPosition;
}

function locationFailure(code: number): GeolocationPositionError {
  return {
    code,
    message: 'private browser detail',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}
