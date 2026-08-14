const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,79}$/;
const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export class NotificationDeliveryFailure extends Error {
  constructor(
    readonly code: string,
    readonly providerKey: string,
  ) {
    super('Notification delivery failed');
    this.name = 'NotificationDeliveryFailure';
    if (!CODE_PATTERN.test(code)) throw new Error('Notification failure code is invalid');
    if (!PROVIDER_PATTERN.test(providerKey)) {
      throw new Error('Notification failure provider key is invalid');
    }
  }
}
