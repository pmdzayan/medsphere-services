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
} from '@nestjs/common';
import { PublicEndpoint } from '@medsphere/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { AvailabilityRequestService } from './availability-request.service';
import type { PublicAvailabilityResolution } from './availability-request.types';
import {
  CreatePublicAvailabilityRequestDto,
  PublicAvailabilityRequestResponseDto,
} from './dto/public-availability-request.dto';

/**
 * Task 0026 - Public (patient-facing) Live Availability surface.
 *
 * POST one provider/product to ask the pharmacy to check (no patient medical
 * data, no contact information, no quantity/batch/inventory context) and GET
 * the minimized status of a request the patient already created. Everything
 * else is server-derived and responses are minimized; responses are
 * deliberately `Cache-Control: private, no-store`.
 *
 * Route convention follows the accepted `/public/medicine-discovery` boundary
 * already used by the nearby search controller.
 */
@Controller('public/medicine-discovery')
@ApiTags('Public Live Availability')
export class PublicLiveAvailabilityController {
  constructor(private readonly requests: AvailabilityRequestService) {}

  /**
   * POST /public/medicine-discovery/providers/:providerId/products/:productId/availability-requests
   *
   * Strict empty body: any request keys are rejected by the shared strict
   * validation pipe. Throttled by IP to keep the public surface from being
   * used as an operational-spam generator.
   */
  @Post('providers/:providerId/products/:productId/availability-requests')
  @PublicEndpoint()
  @Throttle({ ip: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ask a pharmacy to check whether one product is currently available',
  })
  @ApiCreatedResponse({ type: PublicAvailabilityRequestResponseDto })
  @ApiNotFoundResponse({ description: 'Provider or product not found / not eligible' })
  @ApiTooManyRequestsResponse({ description: 'Too many requests' })
  async create(
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() _body: CreatePublicAvailabilityRequestDto,
  ): Promise<PublicAvailabilityRequestResponseDto> {
    const outcome = await this.requests.createPublicRequest(providerId, productId);
    return this.toPublicDto(outcome.resolution);
  }

  /**
   * GET /public/medicine-discovery/availability-requests/:requestId
   *
   * A patient who already created a request reads its minimized current
   * status. The request is addressed by its opaque global UUID; tenant stays
   * hidden. Expired/unknown requests return the same generic not-found so the
   * boundary does not reveal whether a request ever existed.
   */
  @Get('availability-requests/:requestId')
  @PublicEndpoint()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read the current status of an availability request' })
  @ApiOkResponse({ type: PublicAvailabilityRequestResponseDto })
  @ApiNotFoundResponse({ description: 'Request not found' })
  async get(
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
  ): Promise<PublicAvailabilityRequestResponseDto> {
    const resolution = await this.requests.getPublicStatus(requestId);
    return this.toPublicDto(resolution);
  }

  private toPublicDto(
    resolution: PublicAvailabilityResolution,
  ): PublicAvailabilityRequestResponseDto {
    return {
      requestId: resolution.requestId,
      requestStatus: resolution.requestStatus,
      requestedAt: resolution.requestedAt,
      expiresAt: resolution.expiresAt,
      respondedAt: resolution.respondedAt,
      availabilityState: resolution.availabilityState,
      confirmationSource: resolution.confirmationSource,
      confirmedAt: resolution.confirmedAt,
      retryAfterAt: resolution.retryAfterAt,
    };
  }
}
