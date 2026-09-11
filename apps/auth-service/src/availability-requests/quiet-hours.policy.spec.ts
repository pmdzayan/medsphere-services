import { isInQuietHours } from './quiet-hours.policy';

describe('isInQuietHours - Task 0027', () => {
  it('returns NO_QUIET_HOURS_CONFIGURED when neither boundary is set', () => {
    const result = isInQuietHours(new Date('2027-01-01T12:00:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
    });
    expect(result).toEqual({ inQuietHours: false, reason: 'NO_QUIET_HOURS_CONFIGURED' });
  });

  it('fails safe on an invalid timezone even when quiet hours are not configured', () => {
    const result = isInQuietHours(new Date('2027-01-01T12:00:00.000Z'), {
      timezone: 'Definitely/Not-A-Timezone',
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
    });

    expect(result).toEqual({
      inQuietHours: false,
      reason: 'INVALID_TIMEZONE_FAIL_SAFE',
    });
  });

  it('a same-day range (13:00-14:00 UTC): inside at 13:30', () => {
    const result = isInQuietHours(new Date('2027-01-01T13:30:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: 13 * 60,
      quietHoursEndMinute: 14 * 60,
    });
    expect(result.inQuietHours).toBe(true);
  });

  it('a same-day range (13:00-14:00 UTC): outside at 12:59', () => {
    const result = isInQuietHours(new Date('2027-01-01T12:59:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: 13 * 60,
      quietHoursEndMinute: 14 * 60,
    });
    expect(result.inQuietHours).toBe(false);
  });

  it('exactly at the start boundary is inside (inclusive start)', () => {
    const result = isInQuietHours(new Date('2027-01-01T13:00:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: 13 * 60,
      quietHoursEndMinute: 14 * 60,
    });
    expect(result.inQuietHours).toBe(true);
  });

  it('exactly at the end boundary is outside (exclusive end)', () => {
    const result = isInQuietHours(new Date('2027-01-01T14:00:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: 13 * 60,
      quietHoursEndMinute: 14 * 60,
    });
    expect(result.inQuietHours).toBe(false);
  });

  it('an overnight range (22:00-07:00 UTC): inside at 23:00', () => {
    const result = isInQuietHours(new Date('2027-01-01T23:00:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: 22 * 60,
      quietHoursEndMinute: 7 * 60,
    });
    expect(result.inQuietHours).toBe(true);
  });

  it('an overnight range (22:00-07:00 UTC): inside at 03:00 (past midnight)', () => {
    const result = isInQuietHours(new Date('2027-01-02T03:00:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: 22 * 60,
      quietHoursEndMinute: 7 * 60,
    });
    expect(result.inQuietHours).toBe(true);
  });

  it('an overnight range (22:00-07:00 UTC): outside at 12:00 (midday)', () => {
    const result = isInQuietHours(new Date('2027-01-01T12:00:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: 22 * 60,
      quietHoursEndMinute: 7 * 60,
    });
    expect(result.inQuietHours).toBe(false);
  });

  it('an overnight range: exactly at the overnight start boundary is inside', () => {
    const result = isInQuietHours(new Date('2027-01-01T22:00:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: 22 * 60,
      quietHoursEndMinute: 7 * 60,
    });
    expect(result.inQuietHours).toBe(true);
  });

  it('an overnight range: exactly at the overnight end boundary is outside', () => {
    const result = isInQuietHours(new Date('2027-01-02T07:00:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: 22 * 60,
      quietHoursEndMinute: 7 * 60,
    });
    expect(result.inQuietHours).toBe(false);
  });

  it('resolves a real non-UTC timezone correctly (Asia/Kolkata, UTC+5:30)', () => {
    // 2027-01-01T18:30:00Z is 2027-01-02T00:00:00 in Asia/Kolkata.
    const result = isInQuietHours(new Date('2027-01-01T18:30:00.000Z'), {
      timezone: 'Asia/Kolkata',
      quietHoursStartMinute: 22 * 60,
      quietHoursEndMinute: 7 * 60,
    });
    expect(result.inQuietHours).toBe(true); // 00:00 local is within 22:00-07:00
  });

  it('an invalid/unrecognized timezone fails safe with an explicit reason, never throws', () => {
    const result = isInQuietHours(new Date('2027-01-01T12:00:00.000Z'), {
      timezone: 'Not/ARealTimezone',
      quietHoursStartMinute: 22 * 60,
      quietHoursEndMinute: 7 * 60,
    });
    expect(result).toEqual({ inQuietHours: false, reason: 'INVALID_TIMEZONE_FAIL_SAFE' });
  });

  it('an out-of-range boundary minute fails safe rather than misbehaving', () => {
    const result = isInQuietHours(new Date('2027-01-01T12:00:00.000Z'), {
      timezone: 'UTC',
      quietHoursStartMinute: 1500, // >= 1440, invalid
      quietHoursEndMinute: 420,
    });
    expect(result).toEqual({ inQuietHours: false, reason: 'INVALID_TIMEZONE_FAIL_SAFE' });
  });
});
