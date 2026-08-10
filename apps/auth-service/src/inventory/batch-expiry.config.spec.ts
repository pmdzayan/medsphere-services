import {
  BATCH_EXPIRY_DEFAULT_BATCH_SIZE,
  BATCH_EXPIRY_DEFAULT_MAXIMUM_ALLOCATIONS,
  BATCH_EXPIRY_DEFAULT_MAXIMUM_RECORDS,
  BATCH_EXPIRY_DEFAULT_MAXIMUM_RESERVATIONS,
  parseBatchExpiryEnvironment,
} from './batch-expiry.config';

describe('batch expiry configuration', () => {
  it('uses bounded defaults', () => {
    expect(parseBatchExpiryEnvironment({})).toEqual({
      batchSize: BATCH_EXPIRY_DEFAULT_BATCH_SIZE,
      maximumRecords: BATCH_EXPIRY_DEFAULT_MAXIMUM_RECORDS,
      maximumReservationsPerBatch: BATCH_EXPIRY_DEFAULT_MAXIMUM_RESERVATIONS,
      maximumAllocationsPerBatch: BATCH_EXPIRY_DEFAULT_MAXIMUM_ALLOCATIONS,
    });
  });

  it('accepts each explicit hard limit', () => {
    expect(
      parseBatchExpiryEnvironment({
        BATCH_EXPIRY_BATCH_SIZE: '100',
        BATCH_EXPIRY_MAX_RECORDS: '1000',
        BATCH_EXPIRY_MAX_RESERVATIONS: '500',
        BATCH_EXPIRY_MAX_ALLOCATIONS: '5000',
      }),
    ).toEqual({
      batchSize: 100,
      maximumRecords: 1_000,
      maximumReservationsPerBatch: 500,
      maximumAllocationsPerBatch: 5_000,
    });
  });

  it.each([
    ['BATCH_EXPIRY_BATCH_SIZE', '0'],
    ['BATCH_EXPIRY_MAX_RECORDS', '1001'],
    ['BATCH_EXPIRY_MAX_RESERVATIONS', '501'],
    ['BATCH_EXPIRY_MAX_ALLOCATIONS', '5001'],
    ['BATCH_EXPIRY_MAX_ALLOCATIONS', ' 10'],
  ])('rejects invalid %s=%s', (name, value) => {
    expect(() => parseBatchExpiryEnvironment({ [name]: value })).toThrow(name);
  });
});
