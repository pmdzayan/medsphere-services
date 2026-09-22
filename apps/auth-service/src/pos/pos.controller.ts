import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PERMISSIONS } from '../authorization/permission.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { extractRequestMetadata, type MetadataHttpRequest } from '../auth/request-metadata';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import {
  ConfigureInventoryFiscalProfileDto,
  ConfigurePharmacyFiscalProfileDto,
} from './dto/pos.dto';
import { PosFiscalService } from './pos-fiscal.service';

@Controller('pos/providers/:providerId')
@ApiTags('Pharmacy POS')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@ApiForbiddenResponse({ description: 'Permission denied' })
export class PosController {
  constructor(private readonly fiscal: PosFiscalService) {}

  @Get('fiscal-profile')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.billingPosRead)
  @ApiOperation({ summary: 'Read assigned-pharmacy POS fiscal configuration' })
  getFiscalProfile(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
  ) {
    return this.fiscal.getPharmacyProfile(identity, providerId);
  }

  @Put('fiscal-profile')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.billingPosConfigure)
  @ApiOperation({ summary: 'Configure assigned-pharmacy POS fiscal profile' })
  configureFiscalProfile(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() dto: ConfigurePharmacyFiscalProfileDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.fiscal.configurePharmacyProfile({
      actor: identity,
      providerId,
      ...dto,
      request: extractRequestMetadata(request),
    });
  }

  @Put('inventories/:inventoryId/fiscal-profile')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.billingPosConfigure)
  @ApiOperation({ summary: 'Configure assigned inventory HSN/UQC/CESS snapshot source' })
  configureInventoryFiscalProfile(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('inventoryId', new ParseUUIDPipe({ version: '4' })) inventoryId: string,
    @Body() dto: ConfigureInventoryFiscalProfileDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.fiscal.configureInventoryProfile({
      actor: identity,
      providerId,
      inventoryId,
      ...dto,
      request: extractRequestMetadata(request),
    });
  }

  @Get('products/:productId/quote')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.billingPosRead)
  @ApiOperation({ summary: 'Read a server-authoritative POS product price/tax/stock quote' })
  getProductQuote(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.fiscal.getProductQuote(identity, providerId, productId);
  }
}
