import { classifySecurityAuditEvent } from './security-monitoring';

describe('classifySecurityAuditEvent', () => {
  it.each([
    ['authorization.permission.denied', 'DENIED', 'authorization_denied'],
    ['authentication.session.refresh.replayed', 'DENIED', 'credential_replay'],
    ['platform.authentication.session.refresh.replayed', 'DENIED', 'credential_replay'],
    ['authentication.session.unlock.failed', 'DENIED', 'workstation_unlock_failed'],
    ['authentication.organization.join.code.rejected', 'DENIED', 'join_code_rejected'],
    ['authorization.membership.revoked', 'SUCCEEDED', 'account_control'],
    ['platform.session.revoked', 'SUCCEEDED', 'session_security'],
  ] as const)('maps %s to %s', (eventType, outcome, expected) => {
    expect(classifySecurityAuditEvent(eventType, outcome)).toBe(expected);
  });

  it('does not project routine business or successful session creation events', () => {
    expect(
      classifySecurityAuditEvent('billing.pos.sale.completed', 'SUCCEEDED'),
    ).toBeNull();
    expect(
      classifySecurityAuditEvent('authentication.session.created', 'SUCCEEDED'),
    ).toBeNull();
  });
});
