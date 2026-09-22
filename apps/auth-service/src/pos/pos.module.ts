import { Module } from '@nestjs/common';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PharmacyVerificationModule } from '../pharmacy-verification/pharmacy-verification.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PosCheckoutService } from './pos-checkout.service';
import { PosController } from './pos.controller';
import { PosEventWriter } from './pos-event-writer';
import { PosFiscalService } from './pos-fiscal.service';

@Module({
  imports: [
    PrismaModule,
    AuthorizationModule,
    AuditPersistenceModule,
    InventoryModule,
    PharmacyVerificationModule,
  ],
  controllers: [PosController],
  providers: [PosFiscalService, PosCheckoutService, PosEventWriter],
  exports: [PosFiscalService, PosCheckoutService],
})
export class PosModule {}
