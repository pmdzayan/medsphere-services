import { assertUnacceptedPrototypeRuntimeAllowed } from '@medsphere/config';

describe('unaccepted prototype runtime gate', () => {
  it('denies implicit development startup', () => {
    expect(() =>
      assertUnacceptedPrototypeRuntimeAllowed('inventory-service', {
        NODE_ENV: 'development',
      }),
    ).toThrow('disabled until its authenticated application boundary is accepted');
  });

  it('permits only explicit direct development', () => {
    expect(() =>
      assertUnacceptedPrototypeRuntimeAllowed('inventory-service', {
        NODE_ENV: 'development',
        ENABLE_UNACCEPTED_PROTOTYPE_SERVICES: 'true',
      }),
    ).not.toThrow();
  });

  it('cannot be enabled in production', () => {
    expect(() =>
      assertUnacceptedPrototypeRuntimeAllowed('inventory-service', {
        NODE_ENV: 'production',
        ENABLE_UNACCEPTED_PROTOTYPE_SERVICES: 'true',
      }),
    ).toThrow('cannot run in production');
  });

  it.each([undefined, 'test', 'staging'])(
    'cannot be enabled outside direct development: %s',
    (nodeEnvironment) => {
      expect(() =>
        assertUnacceptedPrototypeRuntimeAllowed('inventory-service', {
          NODE_ENV: nodeEnvironment,
          ENABLE_UNACCEPTED_PROTOTYPE_SERVICES: 'true',
        }),
      ).toThrow('available only in direct development');
    },
  );
});
