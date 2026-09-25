import { describe, expect, it } from 'vitest';

import { resolveWorkstationAppearance } from './workstation-appearance';

describe('resolveWorkstationAppearance', () => {
  it('follows the operating-system preference only in system mode', () => {
    expect(resolveWorkstationAppearance('system', false)).toBe('light');
    expect(resolveWorkstationAppearance('system', true)).toBe('dark');
  });

  it('keeps an explicit operator choice stable across system changes', () => {
    expect(resolveWorkstationAppearance('light', true)).toBe('light');
    expect(resolveWorkstationAppearance('dark', false)).toBe('dark');
  });
});
