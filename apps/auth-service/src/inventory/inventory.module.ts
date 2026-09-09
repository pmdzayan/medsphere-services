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
import { ReservationCreationService } from './reservation-creation.service';
import { InventoryEventWriter } from './inventory-event-writer';
import { AvailabilityEvidenceService } from './availability-evidence.service';
import { AvailabilityTrustEvaluator } from './availability-trust.evaluator';
import { AvailabilityTrustService } from './availability-trust.service';
import { PublicMedicineSearchController } from './public-medicine-search.controller';
import { PublicMedicineSearchService } from './public-medicine-search.service';
import { PublicNearbyMedicineSearchService } from './public-nearby-medicine-search.service';
import { PublicNearbyMedicineSearchController } from './public-nearby-medicine-search.controller';

@Module({
  imports: [PrismaModule, AuthorizationModule, AuditPersistenceModule],
  controllers: [
    InventoryController,
    PublicMedicineSearchController,
    PublicNearbyMedicineSearchController,
  ],
  providers: [
    InventoryRepository,
    InventoryEventWriter,
    AvailabilityEvidenceService,
    AvailabilityTrustEvaluator,
    AvailabilityTrustService,
    InventoryService,
    InventoryCommandService,
    InventoryTransferService,
    InventoryDamageService,
    ReservationRepository,
    ReservationService,
    ReservationCreationService,
    ReservationLifecycleService,
    ReservationExpiryService,
    BatchExpiryService,
    InventoryQuarantineService,
    PublicMedicineSearchService,
    PublicNearbyMedicineSearchService,
  ],
  exports: [InventoryService, AvailabilityTrustService],
})
export class InventoryModule {}
