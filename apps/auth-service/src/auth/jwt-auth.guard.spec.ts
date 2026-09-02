import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ENDPOINT_METADATA } from '@medsphere/common';

import { DEDICATED_AUTH_ENDPOINT_METADATA } from './dedicated-auth-endpoint.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard Task 0014 dedicated authentication boundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('bypasses normal JWT authentication for a dedicated-auth endpoint', () => {
    const handler = () => undefined;
    class Controller {}

    const reflector = {
      getAllAndOverride: jest.fn((metadataKey: string) => {
        if (metadataKey === PUBLIC_ENDPOINT_METADATA) {
          return false;
        }

        if (metadataKey === DEDICATED_AUTH_ENDPOINT_METADATA) {
          return true;
        }

        return false;
      }),
    } as unknown as Reflector;

    const context = {
      getHandler: () => handler,
      getClass: () => Controller,
    } as unknown as ExecutionContext;

    const passportGuardPrototype = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
      canActivate(context: ExecutionContext): boolean | Promise<boolean>;
    };

    const passportCanActivate = jest
      .spyOn(passportGuardPrototype, 'canActivate')
      .mockReturnValue(false);

    const guard = new JwtAuthGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(DEDICATED_AUTH_ENDPOINT_METADATA, [
      handler,
      Controller,
    ]);

    expect(passportCanActivate).not.toHaveBeenCalled();
  });
});
