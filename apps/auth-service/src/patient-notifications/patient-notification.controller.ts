import { Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { PatientNotificationService } from './patient-notification.service';
import {
  ListPatientNotificationsQueryDto,
  ListPatientNotificationsResponseDto,
  MarkNotificationReadParamsDto,
  PatientNotificationResponseDto,
} from './dto/patient-notification.dto';

/** Self-service only. Every method derives the patient from the authenticated identity. */
@Controller('patient/notifications')
@ApiTags('Patient Notifications')
@ApiBearerAuth()
export class PatientNotificationController {
  constructor(private readonly notifications: PatientNotificationService) {}

  @Get()
  @Header('cache-control', 'private, no-store')
  @ApiOperation({
    summary: "List the authenticated patient's own notifications, bounded and cursor-paginated",
  })
  @ApiOkResponse({ type: ListPatientNotificationsResponseDto })
  list(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query() query: ListPatientNotificationsQueryDto,
  ) {
    return this.notifications.list(identity, query);
  }

  @Patch(':notificationId/read')
  @Header('cache-control', 'private, no-store')
  @ApiOperation({
    summary: "Mark one of the authenticated patient's own notifications read (idempotent)",
  })
  @ApiOkResponse({ type: PatientNotificationResponseDto })
  markOneRead(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param() params: MarkNotificationReadParamsDto,
  ) {
    return this.notifications.markOneRead(identity, params.notificationId);
  }

  @Post('read-all')
  @Header('cache-control', 'private, no-store')
  @ApiOperation({
    summary: "Mark all of the authenticated patient's own unread notifications read",
  })
  markAllRead(@CurrentIdentity() identity: AuthenticatedIdentity) {
    return this.notifications.markAllRead(identity);
  }
}
