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
import { AvailabilityRequestService } from './availability-request.service';
import { AvailabilityRequestDemandAnalyticsService } from './availability-request-demand.service';
import { AvailabilityRequestPreferenceService } from './availability-request-preference.service';
import { AvailabilityRequestExpiryService } from './availability-request-expiry.service';
import { LiveAvailabilityReconciliationService } from './live-availability-reconciliation.service';
import { PublicMedicineSearchController } from './public-medicine-search.controller';
import { PublicMedicineSearchService } from './public-medicine-search.service';
import { PublicNearbyMedicineSearchService } from './public-nearby-medicine-search.service';
import { PublicNearbyMedicineSearchController } from './public-nearby-medicine-search.controller';
import { PublicLiveAvailabilityController } from './public-live-availability.controller';
import { PatientMedicineSearchController } from './patient-medicine-search.controller';
import { PatientMedicineSearchService } from './patient-medicine-search.service';
import { PatientReservationController } from './patient-reservation.controller';
import { PatientReservationService } from './patient-reservation.service';

@Module({
  imports: [PrismaModule, AuthorizationModule, AuditPersistenceModule],
  controllers: [
    InventoryController,
    PublicMedicineSearchController,
    PublicNearbyMedicineSearchController,
    PublicLiveAvailabilityController,
    PatientMedicineSearchController,
    PatientReservationController,
  ],
  providers: [
    InventoryRepository,
    InventoryEventWriter,
    AvailabilityEvidenceService,
    AvailabilityTrustEvaluator,
    AvailabilityTrustService,
    AvailabilityRequestService,
    AvailabilityRequestDemandAnalyticsService,
    AvailabilityRequestPreferenceService,
    AvailabilityRequestExpiryService,
    LiveAvailabilityReconciliationService,
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
    PatientMedicineSearchService,
    PatientReservationService,
  ],
  exports: [InventoryService, AvailabilityTrustService],
})
export class InventoryModule {}
