import {
  RESERVATION_READY_DEFAULT_LOCALE,
  RESERVATION_READY_TEMPLATE_KEY,
  RESERVATION_READY_TEMPLATE_VERSION,
  ReservationNotificationComposerService,
} from './reservation-notification-composer.service';

describe('G3.26 ReservationNotificationComposerService', () => {
  const service = new ReservationNotificationComposerService();
  const input = {
    templateKey: RESERVATION_READY_TEMPLATE_KEY,
    templateVersion: RESERVATION_READY_TEMPLATE_VERSION,
    variables: { status: 'READY' },
  } as const;

  it('composes the deterministic reservation-ready contract', () => {
    expect(service.compose(input)).toEqual({
      templateKey: 'reservation-ready',
      templateVersion: 1,
      locale: 'en',
      subject: 'Your reservation is ready',
      body: 'Your reserved item is ready for collection.',
      metadata: {
        workflowKey: 'reservation-ready-membership-v1',
        contentClass: 'OPERATIONAL',
      },
    });
  });

  it('keeps the composition snapshot deterministic', () => {
    expect(service.compose(input)).toMatchInlineSnapshot(`
      {
        "body": "Your reserved item is ready for collection.",
        "locale": "en",
        "metadata": {
          "contentClass": "OPERATIONAL",
          "workflowKey": "reservation-ready-membership-v1",
        },
        "subject": "Your reservation is ready",
        "templateKey": "reservation-ready",
        "templateVersion": 1,
      }
    `);
  });

  it('defaults locale explicitly and rejects unapproved locales', () => {
    expect(service.compose(input).locale).toBe(
      RESERVATION_READY_DEFAULT_LOCALE,
    );
    expectCode(
      () => service.compose({ ...input, locale: 'fr' }),
      'TEMPLATE_LOCALE_UNSUPPORTED',
    );
  });

  it('rejects unsupported template identifiers and versions', () => {
    expectCode(
      () => service.compose({ ...input, templateKey: 'anything-else' }),
      'TEMPLATE_KEY_UNSUPPORTED',
    );
    expectCode(
      () => service.compose({ ...input, templateVersion: 2 }),
      'TEMPLATE_VERSION_UNSUPPORTED',
    );
  });

  it.each([
    [{ status: 'CONFIRMED' }],
    [{}],
    [{ status: 'READY', message: 'arbitrary free text' }],
    [{ status: 'READY', diagnosis: 'private' }],
    [{ status: 'READY', prescription: 'private' }],
    [{ status: 'READY', email: 'recipient@example.test' }],
    [{ status: 'READY', medicineName: 'private' }],
  ])('rejects unexpected or sensitive variables: %p', (variables) => {
    expectCode(
      () => service.compose({ ...input, variables }),
      'TEMPLATE_VARIABLES_INVALID',
    );
  });

  it('does not echo rejected private or free-text values through failures', () => {
    const privateValue = 'do-not-leak-this-value';
    let error: unknown;
    try {
      service.compose({
        ...input,
        variables: { status: 'READY', message: privateValue },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: 'TEMPLATE_VARIABLES_INVALID',
      providerKey: 'composition',
    });
    expect(String(error)).not.toContain(privateValue);
    expect(JSON.stringify(error)).not.toContain(privateValue);
  });
});

function expectCode(action: () => unknown, code: string): void {
  let error: unknown;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  expect(error).toMatchObject({ code, providerKey: 'composition' });
}
