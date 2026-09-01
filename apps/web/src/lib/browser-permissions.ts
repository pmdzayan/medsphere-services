/**
 * The only production boundary allowed to invoke browser permission APIs.
 *
 * Browser permission state is device/browser state. It is deliberately not an
 * application preference and must never be treated as identity or authority.
 */
export type BrowserCapabilityState =
  'unsupported' | 'prompt' | 'granted' | 'denied' | 'unavailable' | 'error';

export type BrowserPermissionKind = 'location' | 'notifications' | 'camera';

export interface LocationCapabilityResult {
  readonly state: BrowserCapabilityState;
  readonly position?: GeolocationPosition;
}

export interface CameraCapabilityResult {
  readonly state: BrowserCapabilityState;
  readonly session?: CameraSession;
}

export class CameraSession {
  #stopped = false;

  constructor(readonly stream: MediaStream) {}

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    for (const track of this.stream.getTracks()) track.stop();
  }
}

export async function readBrowserCapability(
  kind: BrowserPermissionKind,
): Promise<BrowserCapabilityState> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';

  if (kind === 'notifications') {
    if (typeof Notification === 'undefined') return 'unsupported';
    return normalizePermissionState(Notification.permission);
  }

  if (kind === 'location' && !navigator.geolocation) return 'unsupported';
  if (kind === 'camera' && !navigator.mediaDevices?.getUserMedia) return 'unsupported';

  if (!navigator.permissions?.query) return 'prompt';

  try {
    const status = await navigator.permissions.query({ name: permissionName(kind) });
    return normalizePermissionState(status.state);
  } catch {
    // Some otherwise capable browsers reject queries for individual
    // permission names. The capability may still be requested explicitly.
    return 'prompt';
  }
}

export function requestCurrentLocation(): Promise<LocationCapabilityResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ state: 'unsupported' });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ state: 'granted', position }),
      (failure) => resolve({ state: geolocationFailureState(failure) }),
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 60_000,
      },
    );
  });
}

export async function requestBrowserNotifications(): Promise<BrowserCapabilityState> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }

  try {
    return normalizePermissionState(await Notification.requestPermission());
  } catch {
    return 'error';
  }
}

/**
 * Starts a camera session only when called from an explicit, approved scan
 * action. Audio is prohibited and every consumer must stop the returned
 * session when scanning ends or the component unmounts.
 */
export async function startCameraScan(): Promise<CameraCapabilityResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return { state: 'unsupported' };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    return { state: 'granted', session: new CameraSession(stream) };
  } catch (failure) {
    return { state: mediaFailureState(failure) };
  }
}

export type FileSelectionFailure = 'type' | 'size';

export function validateUserSelectedFile(
  file: File,
  boundary: { readonly acceptedTypes: readonly string[]; readonly maximumBytes: number },
): FileSelectionFailure | null {
  if (file.size > boundary.maximumBytes) return 'size';
  if (!boundary.acceptedTypes.includes(file.type)) return 'type';
  return null;
}

function permissionName(kind: Exclude<BrowserPermissionKind, 'notifications'>): PermissionName {
  return kind === 'location' ? 'geolocation' : ('camera' as PermissionName);
}

function normalizePermissionState(state: PermissionState | NotificationPermission) {
  if (state === 'granted' || state === 'denied') return state;
  return 'prompt';
}

function geolocationFailureState(failure: GeolocationPositionError): BrowserCapabilityState {
  if (failure.code === failure.PERMISSION_DENIED || failure.code === 1) return 'denied';
  if (
    failure.code === failure.POSITION_UNAVAILABLE ||
    failure.code === failure.TIMEOUT ||
    failure.code === 2 ||
    failure.code === 3
  ) {
    return 'unavailable';
  }
  return 'error';
}

function mediaFailureState(failure: unknown): BrowserCapabilityState {
  if (!(failure instanceof DOMException)) return 'error';
  if (failure.name === 'NotAllowedError' || failure.name === 'SecurityError') return 'denied';
  if (failure.name === 'NotFoundError' || failure.name === 'NotReadableError') return 'unavailable';
  return 'error';
}
