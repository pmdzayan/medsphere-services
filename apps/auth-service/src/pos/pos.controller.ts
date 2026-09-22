import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../authorization/permission.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { extractRequestMetadata, type MetadataHttpRequest } from '../auth/request-metadata';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import {
  ConfigureInventoryFiscalProfileDto,
  ConfigurePharmacyFiscalProfileDto,
  PharmacyCheckoutDto,
  VoidPharmacySaleDto,
} from './dto/pos.dto';
import { PosCheckoutService } from './pos-checkout.service';
import { PosFiscalService } from './pos-fiscal.service';

@Controller('pos/providers/:providerId')
@ApiTags('Pharmacy POS')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@ApiForbiddenResponse({ description: 'Permission denied' })
export class PosController {
  constructor(
    private readonly fiscal: PosFiscalService,
    private readonly checkout: PosCheckoutService,
  ) {}

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
  @Post('checkout')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.billingPosCheckout)
  @ApiOperation({ summary: 'Commit an atomic assigned-pharmacy POS checkout' })
  checkoutSale(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() dto: PharmacyCheckoutDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.checkout.checkout({
      actor: identity,
      providerId,
      ...dto,
      request: extractRequestMetadata(request),
    });
  }

  @Get('sales/:saleId')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.billingPosRead)
  @ApiOperation({ summary: 'Read an assigned-pharmacy POS sale and invoice snapshot' })
  getSale(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('saleId', new ParseUUIDPipe({ version: '4' })) saleId: string,
  ) {
    return this.checkout.getSale(identity, providerId, saleId);
  }

  @Post('sales/:saleId/reprint')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.billingPosRead)
  @ApiOperation({ summary: 'Record immutable invoice reprint evidence and return the receipt' })
  reprintInvoice(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('saleId', new ParseUUIDPipe({ version: '4' })) saleId: string,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.checkout.reprintInvoice({
      actor: identity,
      providerId,
      saleId,
      request: extractRequestMetadata(request),
    });
  }

  @Post('sales/:saleId/void')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermissions(PERMISSIONS.billingPosVoid)
  @ApiOperation({ summary: 'Void a POS sale and atomically restore its sold stock' })
  voidSale(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('saleId', new ParseUUIDPipe({ version: '4' })) saleId: string,
    @Body() dto: VoidPharmacySaleDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.checkout.voidSale({
      actor: identity,
      providerId,
      saleId,
      ...dto,
      request: extractRequestMetadata(request),
    });
  }
}
