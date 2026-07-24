import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AUDIT_METADATA_KEYS, isAuditEventType } from './audit.constants';
import {
  AuditDatabase,
  AuditMetadata,
  AuditMetadataValue,
  PlatformUserAuditEventInput,
  SystemAuditEventInput,
  TenantUserAuditEventInput,
} from './audit.types';

const APPLICATION_METADATA_LIMIT_BYTES = 12 * 1024;
const FORBIDDEN_METADATA_KEY =
  /(password|credential|token|secret|authorization|email|phone|medical|clinical|payload|snapshot|oldvalue|newvalue)/i;

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
    input: TenantUserAuditEventInput | PlatformUserAuditEventInput | SystemAuditEventInput,
  ) {
    if (!isAuditEventType(input.eventType)) {
      throw new Error('Unsupported audit event type');
    }

    const hasResourceType = input.resourceType !== undefined;
    const hasResourceId = input.resourceId !== undefined;
    if (hasResourceType !== hasResourceId) {
      throw new Error('Audit resource type and identifier must be provided together');
    }

    const metadata = input.metadata ?? {};
    this.validateMetadata(input.eventType, metadata);

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

  private validateMetadata(eventType: keyof typeof AUDIT_METADATA_KEYS, metadata: AuditMetadata) {
    if (
      metadata === null ||
      Array.isArray(metadata) ||
      Object.getPrototypeOf(metadata) !== Object.prototype
    ) {
      throw new Error('Audit metadata must be a plain object');
    }

    const allowedKeys = new Set<string>(AUDIT_METADATA_KEYS[eventType]);
    for (const [key, value] of Object.entries(metadata)) {
      if (!allowedKeys.has(key) || FORBIDDEN_METADATA_KEY.test(key)) {
        throw new Error('Audit metadata contains an unsupported key');
      }
      this.validateMetadataValue(value);
    }

    if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > APPLICATION_METADATA_LIMIT_BYTES) {
      throw new Error('Audit metadata exceeds the application size limit');
    }
  }

  private validateMetadataValue(value: AuditMetadataValue): void {
    if (value === null || typeof value === 'boolean') {
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return;
    }
    if (typeof value === 'string' && value.length <= 240) {
      return;
    }
    throw new Error('Audit metadata values must be bounded scalars');
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
