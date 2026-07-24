import { Injectable } from '@nestjs/common';
import { Prisma } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditEventQueryDto } from './dto/audit-event-query.dto';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTenantEvent(tenantId: string, eventId: string) {
    return this.prisma.client.auditEvent.findFirst({
      where: { id: eventId, tenantId, scope: 'TENANT' },
      include: {
        actorMembership: {
          select: { id: true, userId: true },
        },
      },
    });
  }

  async listTenantEvents(tenantId: string, query: AuditEventQueryDto) {
    let cursorBoundary:
      | {
          readonly occurredAt: Date;
          readonly id: string;
        }
      | null
      | undefined;
    if (query.cursor) {
      cursorBoundary = await this.prisma.client.auditEvent.findFirst({
        where: { id: query.cursor, tenantId, scope: 'TENANT' },
        select: { occurredAt: true, id: true },
      });
    }

    const where: Prisma.AuditEventWhereInput = {
      tenantId,
      scope: 'TENANT',
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.actorMembershipId ? { actorMembershipId: query.actorMembershipId } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.startDate || query.endDate
        ? {
            occurredAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
      ...(cursorBoundary
        ? {
            AND: [
              {
                OR: [
                  { occurredAt: { lt: cursorBoundary.occurredAt } },
                  {
                    occurredAt: cursorBoundary.occurredAt,
                    id: { lt: cursorBoundary.id },
                  },
                ],
              },
            ],
          }
        : {}),
    };

    const data = await this.prisma.client.auditEvent.findMany({
      where,
      include: {
        actorMembership: {
          select: { id: true, userId: true },
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    return { data, cursorFound: query.cursor === undefined || cursorBoundary !== null };
  }
}
