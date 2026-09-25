import { Injectable } from '@nestjs/common';
import { appMetrics } from '@medsphere/common';
import {
  AuditWriter as SharedAuditWriter,
  type AuditDatabase,
  type AuditOutcome,
  type PlatformUserAuditEventInput,
  type SystemAuditEventInput,
  type TenantSystemAuditEventInput,
  type TenantUserAuditEventInput,
} from '@medsphere/database';
import { classifySecurityAuditEvent } from './security-monitoring';

@Injectable()
export class AuditWriter extends SharedAuditWriter {
  override async appendTenantUser(
    database: AuditDatabase,
    input: TenantUserAuditEventInput,
  ): Promise<void> {
    await super.appendTenantUser(database, input);
    this.recordSecuritySignal(input.eventType, input.outcome);
  }

  override async appendTenantSystem(
    database: AuditDatabase,
    input: TenantSystemAuditEventInput,
  ): Promise<void> {
    await super.appendTenantSystem(database, input);
    this.recordSecuritySignal(input.eventType, input.outcome);
  }

  override async appendPlatformUser(
    database: AuditDatabase,
    input: PlatformUserAuditEventInput,
  ): Promise<void> {
    await super.appendPlatformUser(database, input);
    this.recordSecuritySignal(input.eventType, input.outcome);
  }

  override async appendSystem(
    database: AuditDatabase,
    input: SystemAuditEventInput,
  ): Promise<void> {
    await super.appendSystem(database, input);
    this.recordSecuritySignal(input.eventType, input.outcome);
  }

  private recordSecuritySignal(
    eventType: TenantUserAuditEventInput['eventType'],
    outcome: AuditOutcome,
  ): void {
    const category = classifySecurityAuditEvent(eventType, outcome);
    if (!category) return;

    appMetrics.securityEventTotal.increment({
      category,
      outcome,
    });
  }
}
