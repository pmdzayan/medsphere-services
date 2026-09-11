import { evaluatePharmacyLiveRequestPreference } from './pharmacy-live-request.policy';

const NOW = new Date('2026-09-10T12:00:00.000Z');

const ENABLED = {
  liveRequestsEnabled: true,
  timezone: 'UTC',
  quietHoursStartMinute: null,
  quietHoursEndMinute: null,
} as const;

describe('evaluatePharmacyLiveRequestPreference - Task 0027', () => {
  it('fails closed when the pharmacy has no preference row', () => {
    expect(evaluatePharmacyLiveRequestPreference(null, NOW)).toEqual({
      allowed: false,
      reason: 'PHARMACY_LIVE_REQUESTS_NOT_CONFIGURED',
    });
  });

  it('rejects an explicitly disabled pharmacy', () => {
    expect(
      evaluatePharmacyLiveRequestPreference(
        {
          ...ENABLED,
          liveRequestsEnabled: false,
        },
        NOW,
      ),
    ).toEqual({
      allowed: false,
      reason: 'PHARMACY_LIVE_REQUESTS_DISABLED',
    });
  });

  it('allows an enabled pharmacy with no quiet hours configured', () => {
    expect(evaluatePharmacyLiveRequestPreference(ENABLED, NOW)).toEqual({
      allowed: true,
      reason: 'ALLOWED',
    });
  });

  it('fails closed on an invalid timezone even when quiet hours are not configured', () => {
    expect(
      evaluatePharmacyLiveRequestPreference(
        {
          ...ENABLED,
          timezone: 'Definitely/Not-A-Timezone',
        },
        NOW,
      ),
    ).toEqual({
      allowed: false,
      reason: 'PHARMACY_IN_QUIET_HOURS',
    });
  });

  it('suppresses an enabled pharmacy while inside quiet hours', () => {
    expect(
      evaluatePharmacyLiveRequestPreference(
        {
          ...ENABLED,
          quietHoursStartMinute: 11 * 60,
          quietHoursEndMinute: 13 * 60,
        },
        NOW,
      ),
    ).toEqual({
      allowed: false,
      reason: 'PHARMACY_IN_QUIET_HOURS',
    });
  });

  it('allows an enabled pharmacy outside quiet hours', () => {
    expect(
      evaluatePharmacyLiveRequestPreference(
        {
          ...ENABLED,
          quietHoursStartMinute: 13 * 60,
          quietHoursEndMinute: 14 * 60,
        },
        NOW,
      ),
    ).toEqual({
      allowed: true,
      reason: 'ALLOWED',
    });
  });

  it('fails closed when the configured timezone cannot be resolved', () => {
    expect(
      evaluatePharmacyLiveRequestPreference(
        {
          ...ENABLED,
          timezone: 'Definitely/Not-A-Timezone',
          quietHoursStartMinute: 22 * 60,
          quietHoursEndMinute: 7 * 60,
        },
        NOW,
      ),
    ).toEqual({
      allowed: false,
      reason: 'PHARMACY_IN_QUIET_HOURS',
    });
  });
});
