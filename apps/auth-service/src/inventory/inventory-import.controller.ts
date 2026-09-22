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
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { extractRequestMetadata, MetadataHttpRequest } from '../auth/request-metadata';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { PERMISSIONS } from '../authorization/permission.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { ApplyInventoryImportDto, StageInventoryImportDto } from './dto/inventory-import.dto';
import { InventoryImportService } from './inventory-import.service';

@Controller('inventory/providers/:providerId/imports')
@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@ApiForbiddenResponse({ description: 'Permission denied' })
export class InventoryImportController {
  constructor(private readonly imports: InventoryImportService) {}

  @Post('stage')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.inventoryListingsManage, PERMISSIONS.inventoryStockReceive)
  @ApiOperation({ summary: 'Stage and dry-run a bounded pharmacy inventory import' })
  @ApiConflictResponse({ description: 'Idempotency or staging conflict' })
  stage(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() dto: StageInventoryImportDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.imports.stage(identity, providerId, dto, extractRequestMetadata(request));
  }

  @Get(':importJobId')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.inventoryListingsManage, PERMISSIONS.inventoryStockReceive)
  @ApiOperation({ summary: 'Read the authoritative dry-run preview for an assigned pharmacy' })
  getPreview(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('importJobId', new ParseUUIDPipe({ version: '4' })) importJobId: string,
  ) {
    return this.imports.getPreview(identity, providerId, importJobId);
  }

  @Post(':importJobId/apply')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.inventoryListingsManage, PERMISSIONS.inventoryStockReceive)
  @ApiOperation({ summary: 'Atomically apply a valid staged pharmacy inventory import' })
  @ApiConflictResponse({ description: 'Preview is invalid, stale, already applied, or conflicts' })
  apply(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('importJobId', new ParseUUIDPipe({ version: '4' })) importJobId: string,
    @Body() dto: ApplyInventoryImportDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.imports.apply(
      identity,
      providerId,
      importJobId,
      dto,
      extractRequestMetadata(request),
    );
  }
}
