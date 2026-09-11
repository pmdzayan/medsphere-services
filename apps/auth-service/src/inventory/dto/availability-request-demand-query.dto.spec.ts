/**
 * Task 0028 - Strict query-boundary tests for the privacy-safe live demand
 * analytics read.
 */
import { ValidationPipe } from '@nestjs/common';
import {
  AVAILABILITY_REQUEST_DEMAND_DEFAULT_DAYS,
  AVAILABILITY_REQUEST_DEMAND_DEFAULT_LIMIT,
  AvailabilityRequestDemandQueryDto,
} from './availability-request-demand-query.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('Task 0028 AvailabilityRequestDemandQueryDto boundaries', () => {
  it('defaults to a bounded 7-day window and a limit of 25', async () => {
    const result = (await pipe.transform(
      {},
      { type: 'query', metatype: AvailabilityRequestDemandQueryDto },
    )) as AvailabilityRequestDemandQueryDto;

    expect(result).toBeInstanceOf(AvailabilityRequestDemandQueryDto);
    expect(result.days).toBe(AVAILABILITY_REQUEST_DEMAND_DEFAULT_DAYS);
    expect(result.limit).toBe(AVAILABILITY_REQUEST_DEMAND_DEFAULT_LIMIT);
  });

  it.each([
    ['days', '1', 1],
    ['days', '90', 90],
    ['limit', '1', 1],
    ['limit', '100', 100],
  ])('accepts the bounded %s=%s boundary', async (key, raw, expected) => {
    const result = (await pipe.transform(
      { [key]: raw },
      { type: 'query', metatype: AvailabilityRequestDemandQueryDto },
    )) as AvailabilityRequestDemandQueryDto;

    expect((result as unknown as Record<string, number>)[key]).toBe(expected);
  });

  it.each([
    ['days', '0'],
    ['days', '91'],
    ['days', '-1'],
    ['days', '1.5'],
    ['days', 'abc'],
    ['days', ''],
    ['limit', '0'],
    ['limit', '101'],
    ['limit', '-1'],
    ['limit', '1.5'],
    ['limit', 'abc'],
    ['limit', ''],
  ])('rejects out-of-bounds or non-integer %s=%s', async (key, raw) => {
    await expect(
      pipe.transform(
        { [key]: raw },
        { type: 'query', metatype: AvailabilityRequestDemandQueryDto },
      ),
    ).rejects.toThrow();
  });

  it('rejects an unknown query key instead of silently accepting telemetry-like input', async () => {
    await expect(
      pipe.transform(
        { days: '7', limit: '25', period: '2026-09-01:2026-09-10', deviceFingerprint: 'x' },
        { type: 'query', metatype: AvailabilityRequestDemandQueryDto },
      ),
    ).rejects.toThrow();
  });

  it('converts numeric strings into integers for both accepted keys', async () => {
    const result = (await pipe.transform(
      { days: '7', limit: '10' },
      { type: 'query', metatype: AvailabilityRequestDemandQueryDto },
    )) as AvailabilityRequestDemandQueryDto;

    expect(result.days).toBe(7);
    expect(result.limit).toBe(10);
  });
});
