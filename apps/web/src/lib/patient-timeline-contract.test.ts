import { describe, expect, it } from 'vitest';
import { isListPatientTimelineResponse, isPatientTimelineEvent } from './patient-timeline-contract';

const VALID_EVENT = {
  id: '11111111-1111-4111-8111-111111111111',
  eventType: 'RESERVATION_STATUS_CHANGED',
  title: 'Reservation confirmed',
  summary: 'Your reservation was confirmed.',
  destinationType: 'NONE',
  destinationId: null,
  occurredAt: new Date('2027-01-01T00:00:00.000Z').toISOString(),
  createdAt: new Date('2027-01-01T00:05:00.000Z').toISOString(),
};

function makeUuid(n: number) {
  return `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
}

describe('isPatientTimelineEvent (candidate Task 0037)', () => {
  it('accepts a valid timeline event', () => {
    expect(isPatientTimelineEvent(VALID_EVENT)).toBe(true);
  });

  it('rejects a malformed (non-UUID) event id', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, id: 'not-a-uuid' })).toBe(false);
  });

  it('rejects a malformed occurredAt timestamp', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, occurredAt: 'not-a-date' })).toBe(false);
  });

  it('rejects a malformed createdAt timestamp', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, createdAt: 'not-a-date' })).toBe(false);
  });

  it('rejects a missing required field', () => {
    const withoutTitle: Record<string, unknown> = { ...VALID_EVENT };
    delete withoutTitle.title;
    expect(isPatientTimelineEvent(withoutTitle)).toBe(false);
  });

  it('rejects an unexpected extra event key (e.g. a leaked internal field)', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, recipientUserId: 'leak' })).toBe(false);
    expect(isPatientTimelineEvent({ ...VALID_EVENT, sourceType: 'leak' })).toBe(false);
    expect(isPatientTimelineEvent({ ...VALID_EVENT, sourceEventId: 'leak' })).toBe(false);
  });

  it('rejects an oversized title beyond the bounded maximum', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, title: 'x'.repeat(161) })).toBe(false);
  });

  it('accepts a title exactly at the bounded maximum', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, title: 'x'.repeat(160) })).toBe(true);
  });

  it('rejects an oversized summary beyond the bounded maximum', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, summary: 'x'.repeat(501) })).toBe(false);
  });

  it('rejects an empty eventType', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, eventType: '' })).toBe(false);
  });

  it('rejects a whitespace-only eventType (regression: bare .length > 0 previously accepted it)', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, eventType: '   ' })).toBe(false);
  });

  it('rejects a whitespace-only title', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, title: '   ' })).toBe(false);
  });

  it('rejects a whitespace-only summary', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, summary: '   ' })).toBe(false);
  });

  it('rejects an invalid destinationType not on the accepted allowlist', () => {
    expect(isPatientTimelineEvent({ ...VALID_EVENT, destinationType: 'ARBITRARY' })).toBe(false);
  });

  it('rejects NONE paired with a non-null destinationId', () => {
    expect(
      isPatientTimelineEvent({ ...VALID_EVENT, destinationType: 'NONE', destinationId: 'x' }),
    ).toBe(false);
  });

  it('accepts NONE only when destinationId is exactly null', () => {
    expect(
      isPatientTimelineEvent({ ...VALID_EVENT, destinationType: 'NONE', destinationId: null }),
    ).toBe(true);
  });

  it('rejects RESERVATION with a malformed (non-UUID) destinationId', () => {
    expect(
      isPatientTimelineEvent({
        ...VALID_EVENT,
        destinationType: 'RESERVATION',
        destinationId: 'not-a-uuid',
      }),
    ).toBe(false);
  });

  it('accepts RESERVATION with a valid UUID destinationId', () => {
    expect(
      isPatientTimelineEvent({
        ...VALID_EVENT,
        destinationType: 'RESERVATION',
        destinationId: makeUuid(1),
      }),
    ).toBe(true);
  });

  it('accepts APPOINTMENT with a valid UUID destinationId', () => {
    expect(
      isPatientTimelineEvent({
        ...VALID_EVENT,
        destinationType: 'APPOINTMENT',
        destinationId: makeUuid(2),
      }),
    ).toBe(true);
  });

  it('accepts SETTINGS only with the fixed known token "privacy"', () => {
    expect(
      isPatientTimelineEvent({
        ...VALID_EVENT,
        destinationType: 'SETTINGS',
        destinationId: 'privacy',
      }),
    ).toBe(true);
    expect(
      isPatientTimelineEvent({
        ...VALID_EVENT,
        destinationType: 'SETTINGS',
        destinationId: 'arbitrary-token',
      }),
    ).toBe(false);
  });

  it('rejects a raw URL, javascript: scheme, or protocol-relative destinationId', () => {
    for (const destinationId of [
      'https://evil.example.com',
      'javascript:alert(1)',
      '//evil.example.com',
    ]) {
      expect(
        isPatientTimelineEvent({ ...VALID_EVENT, destinationType: 'RESERVATION', destinationId }),
      ).toBe(false);
    }
  });

  it('never passes unknown/unsafe data through unchecked -- a plain string, array, or null value is rejected outright', () => {
    expect(isPatientTimelineEvent('not an object')).toBe(false);
    expect(isPatientTimelineEvent(['array'])).toBe(false);
    expect(isPatientTimelineEvent(null)).toBe(false);
    expect(isPatientTimelineEvent(undefined)).toBe(false);
  });
});

describe('isListPatientTimelineResponse (candidate Task 0037)', () => {
  it('accepts a valid list envelope', () => {
    expect(isListPatientTimelineResponse({ items: [VALID_EVENT], nextCursor: null })).toBe(true);
  });

  it('accepts an empty list', () => {
    expect(isListPatientTimelineResponse({ items: [], nextCursor: null })).toBe(true);
  });

  it('accepts exactly 50 items', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ ...VALID_EVENT, id: makeUuid(i) }));
    expect(isListPatientTimelineResponse({ items, nextCursor: null })).toBe(true);
  });

  it('rejects 51 items', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ ...VALID_EVENT, id: makeUuid(i) }));
    expect(isListPatientTimelineResponse({ items, nextCursor: null })).toBe(false);
  });

  it('rejects an unexpected envelope key', () => {
    expect(isListPatientTimelineResponse({ items: [], nextCursor: null, unreadCount: 0 })).toBe(
      false,
    );
  });

  it('rejects a malformed nextCursor (empty string)', () => {
    expect(isListPatientTimelineResponse({ items: [], nextCursor: '' })).toBe(false);
  });

  it('rejects an oversized nextCursor beyond the bounded maximum', () => {
    expect(isListPatientTimelineResponse({ items: [], nextCursor: 'x'.repeat(201) })).toBe(false);
  });

  it('accepts a nextCursor exactly at the bounded maximum', () => {
    expect(isListPatientTimelineResponse({ items: [], nextCursor: 'x'.repeat(200) })).toBe(true);
  });

  it('rejects a list containing even one invalid item', () => {
    expect(
      isListPatientTimelineResponse({
        items: [VALID_EVENT, { ...VALID_EVENT, id: 'bad' }],
        nextCursor: null,
      }),
    ).toBe(false);
  });
});
