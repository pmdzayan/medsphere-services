import { MODULE_METADATA } from '@nestjs/common/constants';
import { PUBLIC_ENDPOINT_METADATA } from '@medsphere/common';
import { AppModule } from '../app.module';
import { AuthController } from './auth.controller';
import { HealthController } from '@medsphere/common';
import { LocalizationController } from '../localization/localization.controller';
import { InventoryController } from '../inventory/inventory.controller';

describe('S0.4 route policy', () => {
  it.each([
    [AuthController, 'register'],
    [AuthController, 'login'],
    [AuthController, 'identifyLogin'],
    [AuthController, 'selectOrganizationLogin'],
    [AuthController, 'google'],
    [AuthController, 'selectGoogleOrganization'],
    [AuthController, 'refresh'],
    [LocalizationController, 'getSupportedLanguages'],
  ])('marks only the accepted handler public: %s.%s', (controller, handler) => {
    expect(
      Reflect.getMetadata(
        PUBLIC_ENDPOINT_METADATA,
        controller.prototype[handler as keyof typeof controller.prototype],
      ),
    ).toBe(true);
  });

  it('marks the shared health controller public at class scope', () => {
    expect(Reflect.getMetadata(PUBLIC_ENDPOINT_METADATA, HealthController)).toBe(true);
  });

  it.each(['logout', 'logoutAllDevices'] as const)(
    'does not opt the protected auth handler out of authentication: %s',
    (handler) => {
      expect(
        Reflect.getMetadata(PUBLIC_ENDPOINT_METADATA, AuthController.prototype[handler]),
      ).toBeUndefined();
    },
  );

  it('keeps the accepted inventory stock handler protected', () => {
    expect(
      Reflect.getMetadata(PUBLIC_ENDPOINT_METADATA, InventoryController.prototype.listStock),
    ).toBeUndefined();
  });

  it('mounts accepted authorization, audit, and inventory-read modules without prototypes', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as Array<{
      name?: string;
      module?: { name?: string };
    }>;
    const mountedNames = imports.map((entry) => entry.name ?? entry.module?.name);

    expect(mountedNames).toEqual(
      expect.arrayContaining([
        'HealthModule',
        'AuthRateLimitModule',
        'PrismaModule',
        'AuthModule',
        'UsersModule',
        'LocalizationModule',
        'AuthorizationModule',
        'AuditModule',
        'InventoryModule',
      ]),
    );
    expect(mountedNames).not.toEqual(
      expect.arrayContaining(['ProviderVerificationModule', 'ProvidersModule', 'ProductsModule']),
    );
  });
});
