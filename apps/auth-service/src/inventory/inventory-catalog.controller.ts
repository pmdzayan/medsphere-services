import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { PERMISSIONS } from '../authorization/permission.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { InventoryCatalogQueryDto } from './dto/inventory-catalog-query.dto';
import { InventoryCatalogService } from './inventory-catalog.service';

@Controller('inventory/providers/:providerId/catalog')
@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@ApiForbiddenResponse({ description: 'Permission denied' })
export class InventoryCatalogController {
  constructor(private readonly catalog: InventoryCatalogService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.inventoryStockRead)
  @ApiOperation({ summary: 'Resolve the canonical medicine catalogue for an assigned pharmacy' })
  search(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Query() query: InventoryCatalogQueryDto,
  ) {
    return this.catalog.search(identity, providerId, query);
  }
}
