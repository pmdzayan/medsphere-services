export const WEB_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
export const WEB_UPDATE_CHECK_MIN_GAP_MS = 60 * 1000;
export const WEB_UPDATE_POLICY_RESPONSE_TIMEOUT_MS = 2_000;

export type WebUpdateMode = 'optional' | 'required';
export type WebUpdateReason = 'routine' | 'security' | 'incompatible';

export interface WebReleasePolicy {
  id: string;
  clientGeneration: number;
  updateMode: WebUpdateMode;
  updateReason: WebUpdateReason;
}

export interface WebUpdatePresentation {
  required: boolean;
  canDefer: boolean;
  reason: WebUpdateReason;
}

export interface WebUpdateCheckInput {
  online: boolean;
  visibilityState: 'visible' | 'hidden';
  lastCheckedAt: number;
  now: number;
  minimumGapMs?: number;
}

const RELEASE_ID_PATTERN = /^(git:[0-9a-f]{40}|content:[0-9a-f]{64})$/;

export function shouldCheckForWebUpdate({
  online,
  visibilityState,
  lastCheckedAt,
  now,
  minimumGapMs = WEB_UPDATE_CHECK_MIN_GAP_MS,
}: WebUpdateCheckInput): boolean {
  if (!online || visibilityState !== 'visible') return false;
  if (!Number.isFinite(lastCheckedAt) || lastCheckedAt <= 0) return true;
  if (!Number.isFinite(now) || now < lastCheckedAt) return true;
  return now - lastCheckedAt >= minimumGapMs;
}

export function parseWebReleasePolicy(value: unknown): WebReleasePolicy | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<WebReleasePolicy>;
  if (typeof candidate.id !== 'string' || !RELEASE_ID_PATTERN.test(candidate.id)) return null;
  if (
    !Number.isSafeInteger(candidate.clientGeneration) ||
    Number(candidate.clientGeneration) < 1 ||
    Number(candidate.clientGeneration) > 1_000_000_000
  ) {
    return null;
  }
  if (candidate.updateMode !== 'optional' && candidate.updateMode !== 'required') return null;
  if (
    candidate.updateReason !== 'routine' &&
    candidate.updateReason !== 'security' &&
    candidate.updateReason !== 'incompatible'
  ) {
    return null;
  }

  if (candidate.updateMode === 'required' && candidate.updateReason === 'routine') return null;
  if (candidate.updateMode === 'optional' && candidate.updateReason === 'incompatible') return null;

  return {
    id: candidate.id,
    clientGeneration: Number(candidate.clientGeneration),
    updateMode: candidate.updateMode,
    updateReason: candidate.updateReason,
  };
}

export function webUpdatePresentation(policy: WebReleasePolicy | null): WebUpdatePresentation {
  if (!policy) {
    return { required: false, canDefer: true, reason: 'routine' };
  }

  const required = policy.updateMode === 'required';
  return {
    required,
    canDefer: !required,
    reason: policy.updateReason,
  };
}
