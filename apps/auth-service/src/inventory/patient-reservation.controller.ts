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
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { extractRequestMetadata, MetadataHttpRequest } from '../auth/request-metadata';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { CancelPatientReservationDto } from './dto/cancel-patient-reservation.dto';
import { CreatePatientReservationDto } from './dto/create-patient-reservation.dto';
import { PatientReservationQueryDto } from './dto/patient-reservation-query.dto';
import {
  PatientReservationCancellationResponseDto,
  PatientReservationCreationResponseDto,
  PatientReservationListResponseDto,
  PatientReservationResponseDto,
} from './dto/patient-reservation-response.dto';
import { PatientReservationService } from './patient-reservation.service';

/**
 * Task 0034 - Patient medicine reservation surface.
 *
 * Every method is scoped exclusively by @CurrentIdentity(). There is no body
 * field or header that can select a different user, and no permissions guard
 * is applied: a patient needs no pharmacy staff membership to create or
 * manage their own reservations. The global JwtAuthGuard still authenticates
 * every request.
 *
 * Responses are `Cache-Control: private, no-store` and contain only
 * patient-appropriate presentation fields.
 */
@Controller('patient/reservations')
@ApiTags('Patient Reservations')
@ApiBearerAuth()
export class PatientReservationController {
  constructor(private readonly reservations: PatientReservationService) {}

  @Post('providers/:providerId')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Reserve medicines at a verified provider for the authenticated identity',
  })
  @ApiCreatedResponse({ type: PatientReservationCreationResponseDto })
  @ApiNotFoundResponse({ description: 'Provider or product not found / not eligible' })
  @ApiConflictResponse({ description: 'Stock, expiry, or idempotency conflict' })
  create(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('providerId', new ParseUUIDPipe({ version: '4' })) providerId: string,
    @Body() dto: CreatePatientReservationDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.reservations.create({
      identity,
      providerId,
      items: dto.items,
      idempotencyKey: dto.idempotencyKey,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      request: extractRequestMetadata(request),
    });
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: "List the authenticated patient's own reservations" })
  @ApiOkResponse({ type: PatientReservationListResponseDto })
  list(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query() query: PatientReservationQueryDto,
  ) {
    return this.reservations.list(identity, query);
  }

  @Get(':reservationId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: "Read one of the authenticated patient's own reservations" })
  @ApiOkResponse({ type: PatientReservationResponseDto })
  @ApiNotFoundResponse({ description: 'Medicine reservation not found' })
  get(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' })) reservationId: string,
  ) {
    return this.reservations.get(identity, reservationId);
  }

  @Post(':reservationId/cancel')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Cancel one of the authenticated patient\u2019s own active reservations',
  })
  @ApiOkResponse({ type: PatientReservationCancellationResponseDto })
  @ApiNotFoundResponse({ description: 'Medicine reservation not found' })
  @ApiConflictResponse({ description: 'State, expiry, version, or idempotency conflict' })
  cancel(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('reservationId', new ParseUUIDPipe({ version: '4' })) reservationId: string,
    @Body() dto: CancelPatientReservationDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.reservations.cancel({
      identity,
      reservationId,
      expectedVersion: dto.expectedVersion,
      idempotencyKey: dto.idempotencyKey,
      request: extractRequestMetadata(request),
    });
  }
}
