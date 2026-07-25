const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,120}$/;

export function normalizeRequestId(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value) ? value : undefined;
}
