export const WEB_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
export const WEB_UPDATE_CHECK_MIN_GAP_MS = 60 * 1000;

export interface WebUpdateCheckInput {
  online: boolean;
  visibilityState: 'visible' | 'hidden';
  lastCheckedAt: number;
  now: number;
  minimumGapMs?: number;
}

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
