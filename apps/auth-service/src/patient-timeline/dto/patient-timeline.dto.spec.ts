import { ValidationPipe } from '@nestjs/common';
import { ListPatientTimelineQueryDto } from './patient-timeline.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

/** Exercise the same transform and whitelist policy as the HTTP boundary. */
describe('ListPatientTimelineQueryDto -- ValidationPipe boundary (candidate Task 0037)', () => {
  it('accepts a valid cursor and limit', async () => {
    const result = (await pipe.transform(
      { cursor: 'abc', limit: '10' },
      { type: 'query', metatype: ListPatientTimelineQueryDto },
    )) as ListPatientTimelineQueryDto;
    expect(result.cursor).toBe('abc');
    expect(result.limit).toBe(10);
  });

  it('applies the default limit when omitted', async () => {
    const result = (await pipe.transform(
      {},
      { type: 'query', metatype: ListPatientTimelineQueryDto },
    )) as ListPatientTimelineQueryDto;
    expect(result.limit).toBe(20);
  });

  it('rejects an unexpected/unknown query parameter -- fails closed rather than silently trusting it', async () => {
    await expect(
      pipe.transform(
        { recipientUserId: 'attacker' },
        { type: 'query', metatype: ListPatientTimelineQueryDto },
      ),
    ).rejects.toThrow();
  });

  it.each(['userId', 'patientId', 'tenantId', 'membershipId', 'sourceType', 'sourceEventId'])(
    'rejects "%s" as an unknown query parameter',
    async (key) => {
      await expect(
        pipe.transform({ [key]: 'x' }, { type: 'query', metatype: ListPatientTimelineQueryDto }),
      ).rejects.toThrow();
    },
  );

  it('rejects limit=0', async () => {
    await expect(
      pipe.transform({ limit: '0' }, { type: 'query', metatype: ListPatientTimelineQueryDto }),
    ).rejects.toThrow();
  });

  it('rejects a limit above the maximum (50)', async () => {
    await expect(
      pipe.transform({ limit: '51' }, { type: 'query', metatype: ListPatientTimelineQueryDto }),
    ).rejects.toThrow();
  });

  it('accepts a limit exactly at the maximum (50)', async () => {
    const result = (await pipe.transform(
      { limit: '50' },
      { type: 'query', metatype: ListPatientTimelineQueryDto },
    )) as ListPatientTimelineQueryDto;
    expect(result.limit).toBe(50);
  });

  it('rejects a malformed (non-numeric) limit', async () => {
    await expect(
      pipe.transform(
        { limit: 'not-a-number' },
        { type: 'query', metatype: ListPatientTimelineQueryDto },
      ),
    ).rejects.toThrow();
  });

  it('rejects a negative limit', async () => {
    await expect(
      pipe.transform({ limit: '-5' }, { type: 'query', metatype: ListPatientTimelineQueryDto }),
    ).rejects.toThrow();
  });

  it('rejects an oversized cursor beyond the bounded max length', async () => {
    await expect(
      pipe.transform(
        { cursor: 'x'.repeat(500) },
        { type: 'query', metatype: ListPatientTimelineQueryDto },
      ),
    ).rejects.toThrow();
  });
});
