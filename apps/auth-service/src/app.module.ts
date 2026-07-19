import { Module } from '@nestjs/common';
import { HealthModule } from '@medsphere/common';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { ProviderVerificationModule } from './provider-verification/provider-verification.module';
import { ProvidersModule } from './providers/providers.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { LocalizationModule } from './localization/localization.module';
import { RbacModule } from './rbac/rbac.module';
import { RbacSeedService } from './rbac/rbac-seed.service';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    UsersModule,
    ProviderVerificationModule,
    ProvidersModule,
    ProductsModule,
    InventoryModule,
    LocalizationModule,
    RbacModule,
    AuditModule,
  ],
  providers: [RbacSeedService],
})
export class AppModule {}
