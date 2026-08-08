import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { validateAuditMetadata } from './audit-metadata';
import {
  AuditDatabase,
  PlatformUserAuditEventInput,
  ServiceAuditEventInput,
  SystemAuditEventInput,
  TenantSystemAuditEventInput,
  TenantUserAuditEventInput,
} from './audit.types';

@Injectable()
export class AuditWriter {
  async appendTenantUser(database: AuditDatabase, input: TenantUserAuditEventInput): Promise<void> {
    const data = this.baseData(input);
    await database.auditEvent.create({
      data: {
        id: randomUUID(),
        ...data,
        scope: 'TENANT',
        actorType: 'TENANT_USER',
        tenantId: input.tenantId,
        actorMembershipId: input.actorMembershipId,
      },
      select: { id: true },
    });
  }

  async appendTenantSystem(
    database: AuditDatabase,
    input: TenantSystemAuditEventInput,
  ): Promise<void> {
    const data = this.baseData(input);
    await database.auditEvent.create({
      data: {
        id: randomUUID(),
        ...data,
        scope: 'TENANT',
        actorType: 'SYSTEM',
        tenantId: input.tenantId,
      },
      select: { id: true },
    });
  }

  async appendService(database: AuditDatabase, input: ServiceAuditEventInput): Promise<void> {
    const data = this.baseData(input);
    await database.auditEvent.create({
      data: {
        id: randomUUID(),
        ...data,
        scope: input.tenantId ? 'TENANT' : 'PLATFORM',
        actorType: 'SERVICE',
        tenantId: input.tenantId ?? null,
      },
      select: { id: true },
    });
  }

  async appendPlatformUser(
    database: AuditDatabase,
    input: PlatformUserAuditEventInput,
  ): Promise<void> {
    const data = this.baseData(input);
    await database.auditEvent.create({
      data: {
        id: randomUUID(),
        ...data,
        scope: 'PLATFORM',
        actorType: 'PLATFORM_USER',
        platformActorUserId: input.platformActorUserId,
      },
      select: { id: true },
    });
  }

  async appendSystem(database: AuditDatabase, input: SystemAuditEventInput): Promise<void> {
    const data = this.baseData(input);
    await database.auditEvent.create({
      data: {
        id: randomUUID(),
        ...data,
        scope: 'PLATFORM',
        actorType: 'SYSTEM',
      },
      select: { id: true },
    });
  }

  private baseData(
    input:
      | TenantUserAuditEventInput
      | PlatformUserAuditEventInput
      | SystemAuditEventInput
      | TenantSystemAuditEventInput
      | ServiceAuditEventInput,
  ) {
    const hasResourceType = input.resourceType !== undefined;
    const hasResourceId = input.resourceId !== undefined;
    if (hasResourceType !== hasResourceId) {
      throw new Error('Audit resource type and identifier must be provided together');
    }

    const metadata = validateAuditMetadata(input.eventType, input.metadata ?? {});

    return {
      eventType: input.eventType,
      outcome: input.outcome,
      resourceType: this.optionalBounded(input.resourceType, 80, 'resource type'),
      resourceId: this.optionalBounded(input.resourceId, 120, 'resource identifier'),
      requestId: this.optionalBounded(input.request?.requestId, 120, 'request identifier'),
      ipAddress: input.request?.ipAddress,
      userAgent: this.optionalBounded(input.request?.userAgent, 512, 'user agent'),
      metadata,
    };
  }

  private optionalBounded(
    value: string | undefined,
    maximum: number,
    label: string,
  ): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value.length === 0 || value.length > maximum) {
      throw new Error(`Invalid audit ${label}`);
    }
    return value;
  }
}
