const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,120}$/;

export function normalizeRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (value.includes('@')) {
    return undefined;
  }
  return SAFE_REQUEST_ID.test(value) ? value : undefined;
}
