import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditPersistenceModule } from '../audit/audit-persistence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryController } from './inventory.controller';
import { InventoryCommandService } from './inventory-command.service';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { InventoryTransferService } from './inventory-transfer.service';
import { InventoryDamageService } from './inventory-damage.service';
import { ReservationLifecycleService } from './reservation-lifecycle.service';
import { ReservationExpiryService } from './reservation-expiry.service';
import { BatchExpiryService } from './batch-expiry.service';
import { InventoryQuarantineService } from './inventory-quarantine.service';
import { ReservationRepository } from './reservation.repository';
import { ReservationService } from './reservation.service';

@Module({
  imports: [PrismaModule, AuthorizationModule, AuditPersistenceModule],
  controllers: [InventoryController],
  providers: [
    InventoryRepository,
    InventoryService,
    InventoryCommandService,
    InventoryTransferService,
    InventoryDamageService,
    ReservationRepository,
    ReservationService,
    ReservationLifecycleService,
    ReservationExpiryService,
    BatchExpiryService,
    InventoryQuarantineService,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
