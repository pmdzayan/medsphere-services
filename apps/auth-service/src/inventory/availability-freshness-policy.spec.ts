/**
 * Task 0025 - V1 freshness policy unit tests.
 *
 * Deterministic: the policy constants and injected clocks are used directly,
 * never wall-clock behavior. Covers clearly fresh, just before/at/just after
 * boundary, clearly stale, missing observation, and invalid/future
 * timestamps.
 */
import {
  AVAILABILITY_FRESH_WINDOW_DEFAULT_HOURS,
  AVAILABILITY_FUTURE_SKEW_DEFAULT_MINUTES,
  classifyObservationFreshness,
  DEFAULT_AVAILABILITY_FRESHNESS_POLICY,
  parseAvailabilityFreshnessEnvironment,
} from './availability-freshness-policy';

const now = new Date('2026-09-10T12:00:00.000Z');

describe('Task 0025 availability freshness policy', () => {
  describe('parseAvailabilityFreshnessEnvironment', () => {
    it('uses conservative defaults when no variables are set', () => {
      const policy = parseAvailabilityFreshnessEnvironment({});
      expect(policy.freshWindowMs).toBe(AVAILABILITY_FRESH_WINDOW_DEFAULT_HOURS * 3_600_000);
      expect(policy.futureObservationAllowedSkewMs).toBe(
        AVAILABILITY_FUTURE_SKEW_DEFAULT_MINUTES * 60_000,
      );
    });

    it('parses bounded overrides and rejects values above the hard maximum', () => {
      const policy = parseAvailabilityFreshnessEnvironment({
        AVAILABILITY_OBSERVATION_FRESH_HOURS: '48',
        AVAILABILITY_OBSERVATION_FUTURE_SKEW_MINUTES: '10',
      });
      expect(policy.freshWindowMs).toBe(48 * 3_600_000);
      expect(policy.futureObservationAllowedSkewMs).toBe(10 * 60_000);

      expect(() =>
        parseAvailabilityFreshnessEnvironment({ AVAILABILITY_OBSERVATION_FRESH_HOURS: '9999' }),
      ).toThrow('AVAILABILITY_OBSERVATION_FRESH_HOURS must be between 1 and 168');
      expect(() =>
        parseAvailabilityFreshnessEnvironment({
          AVAILABILITY_OBSERVATION_FUTURE_SKEW_MINUTES: '9999',
        }),
      ).toThrow('AVAILABILITY_OBSERVATION_FUTURE_SKEW_MINUTES must be between 1 and 60');
    });

    it('fails closed on malformed values', () => {
      expect(() =>
        parseAvailabilityFreshnessEnvironment({ AVAILABILITY_OBSERVATION_FRESH_HOURS: 'abc' }),
      ).toThrow('AVAILABILITY_OBSERVATION_FRESH_HOURS');
      expect(() =>
        parseAvailabilityFreshnessEnvironment({
          AVAILABILITY_OBSERVATION_FUTURE_SKEW_MINUTES: '0',
        }),
      ).toThrow('AVAILABILITY_OBSERVATION_FUTURE_SKEW_MINUTES');
    });
  });

  describe('classifyObservationFreshness', () => {
    it('classifies clearly-fresh evidence as FRESH', () => {
      const observed = new Date(now.getTime() - 1_000);
      expect(
        classifyObservationFreshness(observed, now, DEFAULT_AVAILABILITY_FRESHNESS_POLICY),
      ).toBe('FRESH');
    });

    it('classifies just-before-boundary evidence as FRESH', () => {
      const observed = new Date(
        now.getTime() - DEFAULT_AVAILABILITY_FRESHNESS_POLICY.freshWindowMs + 1,
      );
      expect(
        classifyObservationFreshness(observed, now, DEFAULT_AVAILABILITY_FRESHNESS_POLICY),
      ).toBe('FRESH');
    });

    it('classifies exactly-at-boundary evidence as FRESH', () => {
      const observed = new Date(
        now.getTime() - DEFAULT_AVAILABILITY_FRESHNESS_POLICY.freshWindowMs,
      );
      expect(
        classifyObservationFreshness(observed, now, DEFAULT_AVAILABILITY_FRESHNESS_POLICY),
      ).toBe('FRESH');
    });

    it('classifies just-after-boundary evidence as STALE', () => {
      const observed = new Date(
        now.getTime() - DEFAULT_AVAILABILITY_FRESHNESS_POLICY.freshWindowMs - 1,
      );
      expect(
        classifyObservationFreshness(observed, now, DEFAULT_AVAILABILITY_FRESHNESS_POLICY),
      ).toBe('STALE');
    });

    it('classifies clearly-stale evidence as STALE', () => {
      const observed = new Date(now.getTime() - 30 * 24 * 3_600_000);
      expect(
        classifyObservationFreshness(observed, now, DEFAULT_AVAILABILITY_FRESHNESS_POLICY),
      ).toBe('STALE');
    });

    it('fails closed on an implausibly-future timestamp', () => {
      const observed = new Date(
        now.getTime() + DEFAULT_AVAILABILITY_FRESHNESS_POLICY.futureObservationAllowedSkewMs + 1,
      );
      expect(
        classifyObservationFreshness(observed, now, DEFAULT_AVAILABILITY_FRESHNESS_POLICY),
      ).toBe('INVALID');
    });

    it('accepts a timestamp within the future clock-skew tolerance as fresh', () => {
      const observed = new Date(
        now.getTime() + DEFAULT_AVAILABILITY_FRESHNESS_POLICY.futureObservationAllowedSkewMs,
      );
      expect(
        classifyObservationFreshness(observed, now, DEFAULT_AVAILABILITY_FRESHNESS_POLICY),
      ).toBe('FRESH');
    });

    it('fails closed on a non-finite observed timestamp', () => {
      const observed = new Date('not-a-date');
      expect(classified(observed)).toBe('INVALID');
    });

    it('fails closed on a non-finite clock timestamp', () => {
      expect(
        classifyObservationFreshness(
          now,
          new Date(Number.NaN),
          DEFAULT_AVAILABILITY_FRESHNESS_POLICY,
        ),
      ).toBe('INVALID');
    });

    function classified(observedAt: Date): string {
      return classifyObservationFreshness(observedAt, now, DEFAULT_AVAILABILITY_FRESHNESS_POLICY);
    }
  });
});
