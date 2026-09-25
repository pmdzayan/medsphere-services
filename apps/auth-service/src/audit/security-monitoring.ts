import type { AuditEventType, AuditOutcome } from '@medsphere/database';

export type SecurityEventCategory =
  | 'authorization_denied'
  | 'credential_replay'
  | 'workstation_unlock_failed'
  | 'join_code_rejected'
  | 'account_control'
  | 'session_security';

const EVENT_CATEGORY: Partial<Record<AuditEventType, SecurityEventCategory>> = {
  'authorization.permission.denied': 'authorization_denied',
  'authentication.session.refresh.replayed': 'credential_replay',
  'platform.authentication.session.refresh.replayed': 'credential_replay',
  'authentication.session.unlock.failed': 'workstation_unlock_failed',
  'authentication.organization.join.code.rejected': 'join_code_rejected',
  'authorization.membership.suspended': 'account_control',
  'authorization.membership.revoked': 'account_control',
  'platform.admin.suspended': 'account_control',
  'platform.session.revoked': 'session_security',
  'authentication.session.locked': 'session_security',
  'platform.authentication.session.locked': 'session_security',
};

export function classifySecurityAuditEvent(
  eventType: AuditEventType,
  outcome: AuditOutcome,
): SecurityEventCategory | null {
  const category = EVENT_CATEGORY[eventType];
  if (!category) return null;

  // Security-control actions are useful as operational evidence even when
  // successful. Rejections/replays/denials keep their existing audit outcome;
  // no identity or free-form metadata is projected into monitoring.
  return outcome === 'SUCCEEDED' || outcome === 'DENIED' || outcome === 'FAILED' ? category : null;
}
