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

@Controller('inventory')
@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@ApiForbiddenResponse({ description: 'Permission denied' })
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly inventoryCommands: InventoryCommandService,
  ) {}

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
