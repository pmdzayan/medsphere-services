import { Controller, Get, Header, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { PERMISSIONS } from '../authorization/permission.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { InventoryStockQueryDto } from './dto/inventory-stock-query.dto';
import { InventoryStockListResponseDto } from './dto/inventory-stock-response.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@ApiForbiddenResponse({ description: 'Permission denied' })
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

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
}
