// The catalogue test does not need a live Prisma client. This focused
// mock keeps the unit test isolated from generated-client runtime
// initialization while preserving the `Prisma.TransactionClient`
// type contract used by `audit.ts`.
jest.mock('@prisma/client', () => ({ Prisma: {} }));

import { AUDIT_EVENT_TYPES, AUDIT_METADATA_KEYS } from './audit';

/**
 * Candidate Task 0039 (PROVISIONAL). Focused catalogue test proving
 * the accepted Task 0032 audit event survives Task 0039's own
 * additions to the SAME TypeScript catalogue file, and that all 7
 * Task 0039 event types are genuinely present with bounded, non-
 * sensitive metadata allowlists.
 *
 * Lives here (in `packages/database/src`, importing `./audit`
 * directly) rather than in `apps/auth-service`, because this package
 * owns `audit.ts` and had no established Jest convention of its own
 * -- adding one here (see `packages/database/jest.config.ts`) keeps
 * every TypeScript project's `rootDir` boundary intact instead of
 * reaching across a package boundary from `apps/auth-service`.
 * Run with: `pnpm --filter @medsphere/database test`
 * (or `npx jest` from within `packages/database`).
 */
describe('audit event catalogue -- Task 0032/0039 coexistence (candidate Task 0039)', () => {
  it('CORRECTION (mandatory): patient.profile.updated (Task 0032) remains in the catalogue with its accepted metadata contract unchanged', () => {
    expect(AUDIT_EVENT_TYPES).toContain('patient.profile.updated');
    expect(AUDIT_METADATA_KEYS['patient.profile.updated']).toEqual(['fieldsChanged']);
  });

  it('all 7 Task 0039 pharmacy.verification.* event types are present in the catalogue', () => {
    const task0039Events = [
      'pharmacy.verification.submitted',
      'pharmacy.verification.resubmitted',
      'pharmacy.verification.review-started',
      'pharmacy.verification.approved',
      'pharmacy.verification.rejected',
      'pharmacy.verification.suspended',
      'pharmacy.verification.expired',
    ] as const;
    for (const eventType of task0039Events) {
      expect(AUDIT_EVENT_TYPES).toContain(eventType);
      expect(AUDIT_METADATA_KEYS[eventType]).toBeDefined();
    }
  });

  it('every Task 0039 metadata allowlist is bounded and contains no sensitive/document fields', () => {
    const sensitivePattern = /(license|government|document|password|credential|token|secret)/i;
    const task0039Events = [
      'pharmacy.verification.submitted',
      'pharmacy.verification.resubmitted',
      'pharmacy.verification.review-started',
      'pharmacy.verification.approved',
      'pharmacy.verification.rejected',
      'pharmacy.verification.suspended',
      'pharmacy.verification.expired',
    ] as const;
    for (const eventType of task0039Events) {
      const keys = AUDIT_METADATA_KEYS[eventType];
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.length).toBeLessThanOrEqual(3);
      for (const key of keys) {
        expect(key).not.toMatch(sensitivePattern);
      }
    }
  });

  it('Task 0051 provider-domain and scoped-authorization event types are present with bounded metadata', () => {
    const task0051Events = [
      'authorization.provider-location-access.added',
      'authorization.provider-location-access.removed',
      'authorization.provider-department-access.added',
      'authorization.provider-department-access.removed',
      'provider.domain.created',
      'provider.location.created',
      'provider.department.created',
      'provider.verification.submitted',
      'provider.verification.resubmitted',
      'provider.verification.review-started',
      'provider.verification.approved',
      'provider.verification.rejected',
      'provider.verification.suspended',
      'provider.verification.expired',
    ] as const;

    const sensitivePattern =
      /(license|registration|government|document|password|credential|token|secret|clinical|patient)/i;

    for (const eventType of task0051Events) {
      expect(AUDIT_EVENT_TYPES).toContain(eventType);
      const keys = AUDIT_METADATA_KEYS[eventType];
      expect(keys).toBeDefined();
      expect(keys.length).toBeLessThanOrEqual(3);
      for (const key of keys) {
        expect(key).not.toMatch(sensitivePattern);
      }
    }
  });

  it('a bogus event type is not present in the catalogue', () => {
    expect(AUDIT_EVENT_TYPES).not.toContain('bogus.event.type');
  });
});
