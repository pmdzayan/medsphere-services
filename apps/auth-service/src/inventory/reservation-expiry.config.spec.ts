import {
  RESERVATION_EXPIRY_DEFAULT_BATCH_SIZE,
  RESERVATION_EXPIRY_DEFAULT_MAXIMUM_RECORDS,
  parseReservationExpiryEnvironment,
} from './reservation-expiry.config';

describe('reservation expiry configuration', () => {
  it('uses bounded defaults', () => {
    expect(parseReservationExpiryEnvironment({})).toEqual({
      batchSize: RESERVATION_EXPIRY_DEFAULT_BATCH_SIZE,
      maximumRecords: RESERVATION_EXPIRY_DEFAULT_MAXIMUM_RECORDS,
    });
  });

  it('accepts explicit bounded positive integers', () => {
    expect(
      parseReservationExpiryEnvironment({
        RESERVATION_EXPIRY_BATCH_SIZE: '100',
        RESERVATION_EXPIRY_MAX_RECORDS: '1000',
      }),
    ).toEqual({ batchSize: 100, maximumRecords: 1_000 });
  });

  it.each([
    ['RESERVATION_EXPIRY_BATCH_SIZE', '0'],
    ['RESERVATION_EXPIRY_BATCH_SIZE', '101'],
    ['RESERVATION_EXPIRY_BATCH_SIZE', ' 10'],
    ['RESERVATION_EXPIRY_MAX_RECORDS', '-1'],
    ['RESERVATION_EXPIRY_MAX_RECORDS', '1001'],
    ['RESERVATION_EXPIRY_MAX_RECORDS', '1.5'],
  ])('rejects invalid %s=%s', (name, value) => {
    expect(() => parseReservationExpiryEnvironment({ [name]: value })).toThrow(name);
  });
});
