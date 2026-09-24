import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { extractRequestMetadata, type MetadataHttpRequest } from '../auth/request-metadata';
import { CurrentIdentity } from '../common/decorators/current-identity.decorator';
import { ComplianceService } from './compliance.service';
import {
  ListSubjectDispositionJobsQueryDto,
  RequestComplianceDispositionDto,
} from './dto/compliance.dto';

/**
 * Exact-user compliance boundary. No target user, membership or tenant can be
 * supplied by the client; all three come from the authenticated identity.
 */
@Controller('users/me/compliance')
@ApiTags('Current User Compliance')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication required' })
export class ComplianceSubjectController {
  constructor(private readonly compliance: ComplianceService) {}

  @Post('disposition-requests')
  @ApiOperation({
    summary:
      'Request an allowed self-scoped retention/deletion/anonymization disposition and receive durable evidence',
  })
  requestDisposition(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Body() dto: RequestComplianceDispositionDto,
    @Req() request: MetadataHttpRequest,
  ) {
    return this.compliance.requestSubjectDisposition(
      identity,
      dto,
      extractRequestMetadata(request),
    );
  }

  @Get('disposition-requests')
  @ApiOperation({ summary: 'Read the authenticated user disposition evidence in this membership' })
  @ApiOkResponse({ description: 'Bounded disposition evidence list' })
  listDispositionRequests(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Query() query: ListSubjectDispositionJobsQueryDto,
  ) {
    return this.compliance.listSubjectDispositionJobs(identity, query.limit ?? 25);
  }
}
