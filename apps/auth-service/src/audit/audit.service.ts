import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { AuditRepository } from './audit.repository';
import { AuditEventQueryDto } from './dto/audit-event-query.dto';
import { AuditEventListResponseDto, AuditEventResponseDto } from './dto/audit-event-response.dto';

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async findTenantEvent(
    identity: AuthenticatedIdentity,
    eventId: string,
  ): Promise<AuditEventResponseDto> {
    const event = await this.repository.findTenantEvent(identity.tenantId, eventId);
    if (!event) {
      throw new NotFoundException('Audit event not found');
    }
    return this.mapEvent(event);
  }

  async listTenantEvents(
    identity: AuthenticatedIdentity,
    query: AuditEventQueryDto,
  ): Promise<AuditEventListResponseDto> {
    if ((query.resourceType === undefined) !== (query.resourceId === undefined)) {
      throw new BadRequestException('Resource type and identifier must be supplied together');
    }
    if (
      query.startDate &&
      query.endDate &&
      new Date(query.startDate).getTime() > new Date(query.endDate).getTime()
    ) {
      throw new BadRequestException('Audit date range is invalid');
    }

    const result = await this.repository.listTenantEvents(identity.tenantId, query);
    if (!result.cursorFound) {
      throw new BadRequestException('Audit cursor is invalid');
    }
    const hasMore = result.data.length > query.limit;
    const page = hasMore ? result.data.slice(0, query.limit) : result.data;
    return {
      data: page.map((event) => this.mapEvent(event)),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  private mapEvent(event: {
    id: string;
    eventType: string;
    outcome: 'SUCCEEDED' | 'DENIED' | 'FAILED';
    actorMembershipId: string | null;
    resourceType: string | null;
    resourceId: string | null;
    requestId: string | null;
    metadata: unknown;
    occurredAt: Date;
  }): AuditEventResponseDto {
    return {
      id: event.id,
      eventType: event.eventType,
      outcome: event.outcome,
      actorMembershipId: event.actorMembershipId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      requestId: event.requestId,
      metadata: event.metadata as Record<string, string | number | boolean | null>,
      occurredAt: event.occurredAt.toISOString(),
    };
  }
}
