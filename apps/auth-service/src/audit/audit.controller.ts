import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { PERMISSIONS } from '../authorization/permission.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { AuditService } from './audit.service';
import { AuditEventQueryDto } from './dto/audit-event-query.dto';
import { AuditEventListResponseDto, AuditEventResponseDto } from './dto/audit-event-response.dto';

@Controller('audit/events')
@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(PermissionsGuard)
@RequirePermissions(PERMISSIONS.auditEventsRead)
@ApiForbiddenResponse({ description: 'Permission denied' })
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Read bounded append-only events from the authenticated tenant' })
  @ApiOkResponse({ type: AuditEventListResponseDto })
  list(@CurrentIdentity() identity: AuthenticatedIdentity, @Query() query: AuditEventQueryDto) {
    return this.auditService.listTenantEvents(identity, query);
  }

  @Get(':eventId')
  @ApiOperation({ summary: 'Read one append-only event from the authenticated tenant' })
  @ApiOkResponse({ type: AuditEventResponseDto })
  findOne(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ) {
    return this.auditService.findTenantEvent(identity, eventId);
  }
}
