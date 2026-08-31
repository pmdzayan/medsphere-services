// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { BRAND } from '@medsphere/brand';
import manifest from './manifest';

describe('AIM PWA manifest', () => {
  it('uses the approved installed application identity', () => {
    const value = manifest();
    expect(value.name).toBe(BRAND.fullName);
    expect(value.short_name).toBe(BRAND.shortName);
    expect(value).not.toHaveProperty('description');
    expect(value.display).toBe('standalone');
    expect(value.start_url).toBe('/');
    expect(value.icons).toEqual([
      expect.objectContaining({ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }),
    ]);
  });
});
