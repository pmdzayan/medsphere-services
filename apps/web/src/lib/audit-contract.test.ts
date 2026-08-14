import { describe, expect, it } from 'vitest';
import { isAuditEventPage, toAuditSearchParams } from './audit-contract';

const event = {
  id: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
  eventType: 'authorization.role.updated',
  outcome: 'SUCCEEDED',
  actorMembershipId: 'fcb65cb7-9071-40eb-ab52-878978d9031c',
  resourceType: 'Role',
  resourceId: 'role-1',
  requestId: 'request-1',
  metadata: { roleName: 'PHARMACY_MANAGER', roleVersion: 2 },
  occurredAt: '2026-07-31T18:00:00.000Z',
};

describe('audit frontend contract', () => {
  it('accepts a bounded audit page', () => {
    expect(isAuditEventPage({ data: [event], nextCursor: null })).toBe(true);
  });

  it('accepts only the bounded G3.10 batch-expiry metadata contract', () => {
    const batchExpiry = {
      ...event,
      eventType: 'inventory.batch.expired',
      actorMembershipId: null,
      resourceType: 'Batch',
      metadata: {
        productId: '7c8423f1-f7ab-4a74-b925-23c1188e109c',
        onHandQuantity: 20,
        affectedReservations: 1,
        releasedUnits: 4,
        resultingVersion: 5,
      },
    };
    expect(isAuditEventPage({ data: [batchExpiry], nextCursor: null })).toBe(true);
    expect(
      isAuditEventPage({
        data: [{ ...batchExpiry, metadata: { ...batchExpiry.metadata, subjectUserId: 'private' } }],
        nextCursor: null,
      }),
    ).toBe(false);
  });

  it('accepts only the bounded G3.11 batch-quarantine metadata contract', () => {
    const quarantine = {
      ...event,
      eventType: 'inventory.batch.quarantined',
      resourceType: 'Batch',
      metadata: {
        productId: '7c8423f1-f7ab-4a74-b925-23c1188e109c',
        reasonCode: 'QUALITY_SUSPECT',
        onHandQuantity: 20,
        affectedReservations: 1,
        releasedUnits: 4,
        resultingVersion: 5,
      },
    };
    expect(isAuditEventPage({ data: [quarantine], nextCursor: null })).toBe(true);
    expect(
      isAuditEventPage({
        data: [{ ...quarantine, metadata: { ...quarantine.metadata, reason: 'free text' } }],
        nextCursor: null,
      }),
    ).toBe(false);
  });

  it('rejects unknown event types and outcomes', () => {
    expect(
      isAuditEventPage({ data: [{ ...event, eventType: 'patient.exported' }], nextCursor: null }),
    ).toBe(false);
    expect(isAuditEventPage({ data: [{ ...event, outcome: 'UNKNOWN' }], nextCursor: null })).toBe(
      false,
    );
  });

  it('rejects nested or unbounded metadata', () => {
    expect(
      isAuditEventPage({
        data: [{ ...event, metadata: { payload: { private: true } } }],
        nextCursor: null,
      }),
    ).toBe(false);
    expect(
      isAuditEventPage({
        data: [{ ...event, metadata: { roleName: 'x'.repeat(241) } }],
        nextCursor: null,
      }),
    ).toBe(false);
  });

  it('rejects scalar metadata keys not reviewed for the event type', () => {
    expect(
      isAuditEventPage({
        data: [
          { ...event, metadata: { roleName: 'PHARMACY_MANAGER', email: 'private@example.test' } },
        ],
        nextCursor: null,
      }),
    ).toBe(false);
  });

  it('rejects invalid cursor and timestamp values', () => {
    expect(isAuditEventPage({ data: [event], nextCursor: 'not-a-cursor' })).toBe(false);
    expect(
      isAuditEventPage({ data: [{ ...event, occurredAt: 'yesterday' }], nextCursor: null }),
    ).toBe(false);
  });

  it('serializes only explicitly supplied filters', () => {
    const params = toAuditSearchParams({
      outcome: 'DENIED',
      resourceType: 'Role',
      resourceId: 'role-1',
      limit: 25,
    });
    expect(params.toString()).toBe('outcome=DENIED&resourceType=Role&resourceId=role-1&limit=25');
  });
});
