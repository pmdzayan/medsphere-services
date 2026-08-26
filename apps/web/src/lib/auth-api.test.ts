import { describe, expect, it } from 'vitest';
import { authApiUrl, resolveAuthApiBaseUrl } from './auth-api';

describe('AUTH_API_URL production boundary', () => {
  it('preserves the localhost fallback outside production', () => {
    expect(resolveAuthApiBaseUrl({ NODE_ENV: 'development' })).toBe('http://localhost:3000');
  });

  it('requires AUTH_API_URL in production', () => {
    expect(() => resolveAuthApiBaseUrl({ NODE_ENV: 'production' })).toThrow(
      'AUTH_API_URL is required in production',
    );
  });

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://0.0.0.0:3000',
    'http://[::1]:3000',
  ])('rejects production loopback destination %s', (url) => {
    expect(() =>
      resolveAuthApiBaseUrl({
        NODE_ENV: 'production',
        AUTH_API_URL: url,
      }),
    ).toThrow('AUTH_API_URL must not target a loopback host in production');
  });

  it('accepts an explicit non-loopback production origin', () => {
    expect(
      resolveAuthApiBaseUrl({
        NODE_ENV: 'production',
        AUTH_API_URL: 'https://auth.medsphere.example',
      }),
    ).toBe('https://auth.medsphere.example');
  });

  it('normalizes a trailing slash', () => {
    expect(
      resolveAuthApiBaseUrl({
        NODE_ENV: 'production',
        AUTH_API_URL: 'https://auth.medsphere.example/',
      }),
    ).toBe('https://auth.medsphere.example');
  });

  it.each([
    'ftp://auth.medsphere.example',
    'https://user:secret@auth.medsphere.example',
    'https://auth.medsphere.example/api',
    'https://auth.medsphere.example?token=secret',
    'https://auth.medsphere.example/#fragment',
  ])('rejects unsafe or malformed auth API origin %s', (url) => {
    expect(() =>
      resolveAuthApiBaseUrl({
        NODE_ENV: 'production',
        AUTH_API_URL: url,
      }),
    ).toThrow();
  });

  it('rejects malformed relative URLs', () => {
    expect(() =>
      resolveAuthApiBaseUrl({
        NODE_ENV: 'production',
        AUTH_API_URL: 'auth-service:3000',
      }),
    ).toThrow('AUTH_API_URL must be an absolute HTTP(S) URL');
  });

  it('rejects API paths without a leading slash', () => {
    expect(() => authApiUrl('auth/login')).toThrow('Auth API path must start with /');
  });
});
