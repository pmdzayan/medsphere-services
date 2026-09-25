import { describe, expect, it } from 'vitest';

import { canRegisterAimServiceWorker } from './pwa-runtime';

describe('canRegisterAimServiceWorker', () => {
  it('allows HTTPS and loopback development origins', () => {
    expect(canRegisterAimServiceWorker({ protocol: 'https:', hostname: 'aim.example' })).toBe(true);
    expect(canRegisterAimServiceWorker({ protocol: 'http:', hostname: 'localhost' })).toBe(true);
    expect(canRegisterAimServiceWorker({ protocol: 'http:', hostname: '127.0.0.1' })).toBe(true);
  });

  it('rejects insecure non-loopback origins', () => {
    expect(canRegisterAimServiceWorker({ protocol: 'http:', hostname: 'aim.example' })).toBe(false);
  });
});
