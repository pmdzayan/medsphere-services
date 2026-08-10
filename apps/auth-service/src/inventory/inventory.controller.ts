import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiConflictResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { extractRequestMetadata, MetadataHttpRequest } from '../auth/request-metadata';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { PERMISSIONS } from '../authorization/permission.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { InventoryStockQueryDto } from './dto/inventory-stock-query.dto';
import { InventoryStockListResponseDto } from './dto/inventory-stock-response.dto';
import {
  AdjustBatchDto,
  ConfigureInventoryDto,
  ReceiveBatchDto,
} from './dto/inventory-command.dto';
import {
  InventoryConfigurationResponseDto,
  StockMutationResponseDto,
} from './dto/inventory-command-response.dto';
import { InventoryCommandService } from './inventory-command.service';
import { InventoryService } from './inventory.service';
import { ProviderReservationQueryDto } from './dto/reservation-query.dto';
import {
  ProviderReservationListResponseDto,
  ProviderReservationResponseDto,
  ProviderReservationTransitionResponseDto,
} from './dto/reservation-response.dto';
import { TransitionProviderReservationDto } from './dto/reservation-transition.dto';
import { ReservationLifecycleService } from './reservation-lifecycle.service';
import { ReservationService } from './reservation.service';
import { RecordCompletedTransferDto } from './dto/inventory-transfer.dto';
import { CompletedTransferResponseDto } from './dto/inventory-transfer-response.dto';
import { InventoryTransferService } from './inventory-transfer.service';
import { RecordDamagedStockDto } from './dto/inventory-damage.dto';
import { DamagedStockResponseDto } from './dto/inventory-damage-response.dto';
import { InventoryDamageService } from './inventory-damage.service';
import { QuarantineBatchDto } from './dto/inventory-quarantine.dto';
import { BatchQuarantineResponseDto } from './dto/inventory-quarantine-response.dto';
import { InventoryQuarantineService } from './inventory-quarantine.service';

@Controller('inventory')
@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@ApiForbiddenResponse({ description: 'Permission denied' })
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly inventoryCommands: InventoryCommandService,
    private readonly reservations: ReservationService,
    private readonly reservationLifecycle: ReservationLifecycleService,
    private readonly inventoryTransfers: InventoryTransferService,
    private readonly inventoryDamage: InventoryDamageService,
    private readonly inventoryQuarantine: InventoryQuarantineService,
  ) {}

  @Post('providers/:providerId/batches/:batchId/quarantine')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.inventoryBatchQuarantine)
  @ApiOperation({ summary: 'Quarantine an active assigned-provider batch' })
  @ApiOkResponse({ type: BatchQuarantineResponseDto })
  @ApiNotFoundResponse({ description: 'Assigned provider batch not found' })
  @ApiConflictResponse({ description: 'State, expiry, version, or idempotency conflict' })
  quarantineBatch(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('batchId', new ParseUUIDPipe({ version: '4' })) batchId: string,
    @Body() dto: QuarantineBatchDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.inventoryQuarantine.quarantine({
      actor: identity,
      providerId,
      batchId,
      ...dto,
      request: extractRequestMetadata(request),
    });
  }

  @Post('providers/:providerId/batches/:batchId/damage')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.inventoryStockDamage)
  @ApiOperation({ summary: 'Record an atomic completed damaged-stock write-off' })
  @ApiOkResponse({ type: DamagedStockResponseDto })
  @ApiNotFoundResponse({ description: 'Assigned provider batch not found' })
  @ApiConflictResponse({ description: 'Stock, expiry, version, or idempotency conflict' })
  recordDamagedStock(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('batchId', new ParseUUIDPipe({ version: '4' })) batchId: string,
    @Body() dto: RecordDamagedStockDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.inventoryDamage.recordCompleted({
      actor: identity,
      providerId,
      batchId,
      ...dto,
      request: extractRequestMetadata(request),
    });
  }

  @Post('providers/:providerId/transfers')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.inventoryStockTransfer)
  @ApiOperation({ summary: 'Record an atomic completed transfer between assigned providers' })
  @ApiOkResponse({ type: CompletedTransferResponseDto })
  @ApiNotFoundResponse({ description: 'Assigned provider inventory or batch not found' })
  @ApiConflictResponse({ description: 'Stock, provenance, version, or idempotency conflict' })
  recordCompletedTransfer(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) sourceProviderId: string,
    @Body() dto: RecordCompletedTransferDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.inventoryTransfers.recordCompleted({
      actor: identity,
      sourceProviderId,
      ...dto,
      request: extractRequestMetadata(request),
    });
  }

  @Get('providers/:providerId/reservations')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.inventoryReservationsRead)
  @ApiOperation({ summary: 'List operational reservations for an assigned provider' })
  @ApiOkResponse({ type: ProviderReservationListResponseDto })
  @ApiNotFoundResponse({ description: 'Provider reservations not found' })
  listReservations(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Query() query: ProviderReservationQueryDto,
  ) {
    return this.reservations.list(identity, providerId, query);
  }

  @Get('providers/:providerId/reservations/:reservationId')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.inventoryReservationsRead)
  @ApiOperation({ summary: 'Get an operational reservation for an assigned provider' })
  @ApiOkResponse({ type: ProviderReservationResponseDto })
  @ApiNotFoundResponse({ description: 'Medicine reservation not found' })
  getReservation(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' })) reservationId: string,
  ) {
    return this.reservations.get(identity, providerId, reservationId);
  }

  @Post('providers/:providerId/reservations/:reservationId/transitions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.inventoryReservationsManage)
  @ApiOperation({ summary: 'Transition an active reservation for an assigned provider' })
  @ApiOkResponse({ type: ProviderReservationTransitionResponseDto })
  @ApiNotFoundResponse({ description: 'Medicine reservation not found' })
  @ApiConflictResponse({ description: 'State, version, stock, or idempotency conflict' })
  transitionReservation(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' })) reservationId: string,
    @Body() dto: TransitionProviderReservationDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.reservationLifecycle.transition({
      actor: identity,
      providerId,
      reservationId,
      ...dto,
      request: extractRequestMetadata(request),
    });
  }

  @Get('providers/:providerId/stock')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.inventoryStockRead)
  @ApiOperation({ summary: 'List stock for a provider assigned to the active membership' })
  @ApiOkResponse({ type: InventoryStockListResponseDto })
  @ApiNotFoundResponse({ description: 'Provider stock not found' })
  listStock(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Query() query: InventoryStockQueryDto,
  ) {
    return this.inventoryService.listStock(identity, providerId, query);
  }

  @Put('providers/:providerId/products/:productId')
  @RequirePermissions(PERMISSIONS.inventoryListingsManage)
  @ApiOperation({ summary: 'Create or version-update an inventory listing' })
  @ApiOkResponse({ type: InventoryConfigurationResponseDto })
  @ApiNotFoundResponse({ description: 'Assigned provider or active product not found' })
  @ApiConflictResponse({ description: 'Version or idempotency conflict' })
  configureInventory(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() dto: ConfigureInventoryDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.inventoryCommands.configureInventory({
      actor: identity,
      providerId,
      productId,
      ...dto,
      request: extractRequestMetadata(request),
    });
  }

  @Post('providers/:providerId/products/:productId/batches')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.inventoryStockReceive)
  @ApiOperation({ summary: 'Receive a new batch into an assigned provider listing' })
  @ApiOkResponse({ type: StockMutationResponseDto })
  @ApiNotFoundResponse({ description: 'Assigned provider inventory not found' })
  @ApiConflictResponse({ description: 'Batch or idempotency conflict' })
  receiveBatch(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() dto: ReceiveBatchDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.inventoryCommands.receiveBatch({
      actor: identity,
      providerId,
      productId,
      ...dto,
      manufacturingDate: dto.manufacturingDate ? new Date(dto.manufacturingDate) : undefined,
      expiryDate: new Date(dto.expiryDate),
      request: extractRequestMetadata(request),
    });
  }

  @Post('providers/:providerId/batches/:batchId/adjustments')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.inventoryStockAdjust)
  @ApiOperation({ summary: 'Record a versioned stock-count adjustment for an assigned provider' })
  @ApiOkResponse({ type: StockMutationResponseDto })
  @ApiNotFoundResponse({ description: 'Assigned provider batch not found' })
  @ApiConflictResponse({ description: 'Held-stock, version, or idempotency conflict' })
  adjustBatch(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('batchId', new ParseUUIDPipe({ version: '4' })) batchId: string,
    @Body() dto: AdjustBatchDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.inventoryCommands.adjustBatch({
      actor: identity,
      providerId,
      batchId,
      ...dto,
      request: extractRequestMetadata(request),
    });
  }
}
