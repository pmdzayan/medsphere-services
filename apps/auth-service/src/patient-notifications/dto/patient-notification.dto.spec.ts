import { ValidationPipe } from '@nestjs/common';
import { ListPatientNotificationsQueryDto } from './patient-notification.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

/**
 * Verifies strict unreadOnly
 * boolean parsing. @Type(() => Boolean) alone follows plain-JS
 * Boolean() coercion, under which ANY non-empty string -- including
 * the literal string "false" -- becomes true. These tests prove the
 * corrected strictOptionalBoolean() transform instead.
 */
describe('ListPatientNotificationsQueryDto -- strict unreadOnly boolean (candidate Task 0036 correction)', () => {
  it('omitted unreadOnly is accepted and left undefined (default behavior)', async () => {
    const result = (await pipe.transform(
      { limit: '10' },
      { type: 'query', metatype: ListPatientNotificationsQueryDto },
    )) as ListPatientNotificationsQueryDto;
    expect(result.unreadOnly).toBeUndefined();
  });

  it('the query-string literal "true" becomes boolean true', async () => {
    const result = (await pipe.transform(
      { unreadOnly: 'true' },
      { type: 'query', metatype: ListPatientNotificationsQueryDto },
    )) as ListPatientNotificationsQueryDto;
    expect(result.unreadOnly).toBe(true);
  });

  it('the query-string literal "false" becomes boolean false -- never coerced to true', async () => {
    const result = (await pipe.transform(
      { unreadOnly: 'false' },
      { type: 'query', metatype: ListPatientNotificationsQueryDto },
    )) as ListPatientNotificationsQueryDto;
    expect(result.unreadOnly).toBe(false);
  });

  it('an arbitrary string value is rejected with a 400, not silently treated as true', async () => {
    await expect(
      pipe.transform(
        { unreadOnly: 'banana' },
        { type: 'query', metatype: ListPatientNotificationsQueryDto },
      ),
    ).rejects.toThrow();
  });

  it('a numeric-looking string is rejected, not coerced', async () => {
    await expect(
      pipe.transform(
        { unreadOnly: '1' },
        { type: 'query', metatype: ListPatientNotificationsQueryDto },
      ),
    ).rejects.toThrow();
  });

  it('an empty string is rejected, not silently treated as true', async () => {
    await expect(
      pipe.transform(
        { unreadOnly: '' },
        { type: 'query', metatype: ListPatientNotificationsQueryDto },
      ),
    ).rejects.toThrow();
  });
});
