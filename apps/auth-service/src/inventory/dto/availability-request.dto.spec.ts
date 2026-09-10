/**
 * Task 0026 CTO coverage correction.
 * Strict mutation-boundary tests for live availability DTOs.
 */
import { ValidationPipe } from '@nestjs/common';
import {
  AvailabilityRequestQueueQueryDto,
  RespondAvailabilityRequestDto,
} from './availability-request-response.dto';
import { CreatePublicAvailabilityRequestDto } from './public-availability-request.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('Task 0026 availability-request DTO boundaries - CTO coverage correction', () => {
  it('accepts the deliberately empty public-create body', async () => {
    await expect(
      pipe.transform({}, { type: 'body', metatype: CreatePublicAvailabilityRequestDto }),
    ).resolves.toBeInstanceOf(CreatePublicAvailabilityRequestDto);
  });

  it.each(['tenantId', 'providerId', 'patientId', 'userId', 'quantity', 'responderUserId'])(
    'rejects public-create body field %s instead of trusting client context',
    async (key) => {
      await expect(
        pipe.transform(
          { [key]: 'attacker-controlled' },
          { type: 'body', metatype: CreatePublicAvailabilityRequestDto },
        ),
      ).rejects.toThrow();
    },
  );

  it('accepts a valid CHECK_LATER pharmacist response body', async () => {
    const result = (await pipe.transform(
      {
        outcome: 'CHECK_LATER',
        idempotencyKey: 'response-1',
        expectedVersion: 1,
        retryAfterMinutes: 10,
      },
      { type: 'body', metatype: RespondAvailabilityRequestDto },
    )) as RespondAvailabilityRequestDto;

    expect(result).toMatchObject({
      outcome: 'CHECK_LATER',
      idempotencyKey: 'response-1',
      expectedVersion: 1,
      retryAfterMinutes: 10,
    });
  });

  it('rejects unknown response outcome', async () => {
    await expect(
      pipe.transform(
        { outcome: 'MAYBE', idempotencyKey: 'response-1', expectedVersion: 1 },
        { type: 'body', metatype: RespondAvailabilityRequestDto },
      ),
    ).rejects.toThrow();
  });

  it.each(['tenantId', 'providerId', 'responderUserId', 'responderMembershipId'])(
    'rejects client-selected trusted response field %s',
    async (key) => {
      await expect(
        pipe.transform(
          {
            outcome: 'AVAILABLE',
            idempotencyKey: 'response-1',
            expectedVersion: 1,
            [key]: 'attacker-controlled',
          },
          { type: 'body', metatype: RespondAvailabilityRequestDto },
        ),
      ).rejects.toThrow();
    },
  );

  it('rejects an idempotency key that becomes blank after trimming', async () => {
    await expect(
      pipe.transform(
        { outcome: 'AVAILABLE', idempotencyKey: '   ', expectedVersion: 1 },
        { type: 'body', metatype: RespondAvailabilityRequestDto },
      ),
    ).rejects.toThrow();
  });

  it('rejects expectedVersion below one', async () => {
    await expect(
      pipe.transform(
        { outcome: 'AVAILABLE', idempotencyKey: 'response-1', expectedVersion: 0 },
        { type: 'body', metatype: RespondAvailabilityRequestDto },
      ),
    ).rejects.toThrow();
  });

  it.each([4, 1441])('rejects retryAfterMinutes=%s outside the DTO bounds', async (value) => {
    await expect(
      pipe.transform(
        {
          outcome: 'CHECK_LATER',
          idempotencyKey: 'response-1',
          expectedVersion: 1,
          retryAfterMinutes: value,
        },
        { type: 'body', metatype: RespondAvailabilityRequestDto },
      ),
    ).rejects.toThrow();
  });

  it('keeps queue pagination bounded', async () => {
    await expect(
      pipe.transform(
        { limit: '51', offset: '0' },
        { type: 'query', metatype: AvailabilityRequestQueueQueryDto },
      ),
    ).rejects.toThrow();
  });
});
