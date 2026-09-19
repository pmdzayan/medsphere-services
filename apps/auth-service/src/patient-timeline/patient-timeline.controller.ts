import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { PatientTimelineService } from './patient-timeline.service';
import {
  GetPatientTimelineEventParamsDto,
  ListPatientTimelineQueryDto,
  ListPatientTimelineResponseDto,
  PatientTimelineEventResponseDto,
} from './dto/patient-timeline.dto';

/**
 * Candidate Task 0037 (PROVISIONAL). Read-only, self-service only --
 * every method is scoped exclusively by @CurrentIdentity(). There is
 * no route parameter, body field, or header anywhere in this
 * controller that can select a different patient's history, and there
 * is no create/update/delete route at all.
 */
@Controller('patient/timeline')
@ApiTags('Patient Medical Timeline')
@ApiBearerAuth()
export class PatientTimelineController {
  constructor(private readonly timeline: PatientTimelineService) {}

  @Get()
  @Header('cache-control', 'private, no-store')
  @ApiOperation({
    summary: "List the authenticated patient's own timeline, bounded and cursor-paginated",
  })
  @ApiOkResponse({ type: ListPatientTimelineResponseDto })
  list(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query() query: ListPatientTimelineQueryDto,
  ) {
    return this.timeline.list(identity, query);
  }

  @Get(':timelineEventId')
  @Header('cache-control', 'private, no-store')
  @ApiOperation({ summary: "Read one of the authenticated patient's own timeline events" })
  @ApiOkResponse({ type: PatientTimelineEventResponseDto })
  getOne(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Param() params: GetPatientTimelineEventParamsDto,
  ) {
    return this.timeline.getOne(identity, params.timelineEventId);
  }
}
