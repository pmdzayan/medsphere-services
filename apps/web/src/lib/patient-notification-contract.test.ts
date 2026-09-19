import { describe, expect, it } from 'vitest';
import {
  isPatientNotification,
  isListPatientNotificationsResponse,
} from './patient-notification-contract';

const BASE = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'ACCOUNT',
  title: 'Title',
  message: 'Message',
  readAt: null,
  createdAt: new Date().toISOString(),
};

/**
 * Activity Center contract hardening:
 * Center UI must be able to trust this contract before constructing
 * internal navigation -- these tests prove the destination pairing is
 * validated exactly, matching the backend's own validateDestination().
 */
describe('isPatientNotification -- strict destination pairing (candidate Task 0036)', () => {
  it('accepts NONE with a null destinationId', () => {
    expect(isPatientNotification({ ...BASE, destinationType: 'NONE', destinationId: null })).toBe(
      true,
    );
  });

  it('rejects NONE with a non-null destinationId', () => {
    expect(
      isPatientNotification({ ...BASE, destinationType: 'NONE', destinationId: 'anything' }),
    ).toBe(false);
  });

  it('accepts SETTINGS with the known "privacy" token', () => {
    expect(
      isPatientNotification({ ...BASE, destinationType: 'SETTINGS', destinationId: 'privacy' }),
    ).toBe(true);
  });

  it('rejects SETTINGS with an arbitrary token', () => {
    expect(
      isPatientNotification({ ...BASE, destinationType: 'SETTINGS', destinationId: 'other-page' }),
    ).toBe(false);
  });

  it('accepts RESERVATION with a valid UUID', () => {
    expect(
      isPatientNotification({
        ...BASE,
        destinationType: 'RESERVATION',
        destinationId: '22222222-2222-4222-8222-222222222222',
      }),
    ).toBe(true);
  });

  it('accepts APPOINTMENT with a valid UUID', () => {
    expect(
      isPatientNotification({
        ...BASE,
        destinationType: 'APPOINTMENT',
        destinationId: '33333333-3333-4333-8333-333333333333',
      }),
    ).toBe(true);
  });

  it('rejects RESERVATION with a malformed UUID', () => {
    expect(
      isPatientNotification({
        ...BASE,
        destinationType: 'RESERVATION',
        destinationId: 'not-a-uuid',
      }),
    ).toBe(false);
  });

  it('rejects a raw URL as a destinationId', () => {
    expect(
      isPatientNotification({
        ...BASE,
        destinationType: 'RESERVATION',
        destinationId: 'https://evil.example.com',
      }),
    ).toBe(false);
  });

  it('rejects a protocol-relative URL as a destinationId', () => {
    expect(
      isPatientNotification({
        ...BASE,
        destinationType: 'RESERVATION',
        destinationId: '//evil.example.com',
      }),
    ).toBe(false);
  });

  it('rejects a javascript: scheme as a destinationId', () => {
    expect(
      isPatientNotification({
        ...BASE,
        destinationType: 'RESERVATION',
        destinationId: 'javascript:alert(1)',
      }),
    ).toBe(false);
  });

  it('rejects an arbitrary path as a destinationId', () => {
    expect(
      isPatientNotification({
        ...BASE,
        destinationType: 'RESERVATION',
        destinationId: '/some/arbitrary/path',
      }),
    ).toBe(false);
  });

  it('rejects an unexpected extra top-level field', () => {
    expect(
      isPatientNotification({
        ...BASE,
        destinationType: 'NONE',
        destinationId: null,
        recipientUserId: 'leak',
      }),
    ).toBe(false);
  });
});

describe('isListPatientNotificationsResponse -- bounded page size (candidate Task 0036)', () => {
  it('accepts exactly 50 items', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      ...BASE,
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      destinationType: 'NONE',
      destinationId: null,
    }));
    expect(isListPatientNotificationsResponse({ items, nextCursor: null, unreadCount: 0 })).toBe(
      true,
    );
  });

  it('rejects 51 items', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      ...BASE,
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      destinationType: 'NONE',
      destinationId: null,
    }));
    expect(isListPatientNotificationsResponse({ items, nextCursor: null, unreadCount: 0 })).toBe(
      false,
    );
  });

  it('rejects a negative unreadCount', () => {
    expect(
      isListPatientNotificationsResponse({ items: [], nextCursor: null, unreadCount: -1 }),
    ).toBe(false);
  });

  it('rejects an unsafe (non-integer-bounded) unreadCount', () => {
    expect(
      isListPatientNotificationsResponse({
        items: [],
        nextCursor: null,
        unreadCount: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toBe(false);
  });
});
