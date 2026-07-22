/**
 * Notification domain enums.
 *
 * These mirror the Prisma schema enums for type-safe usage in the
 * notification-service without importing Prisma-generated types directly.
 */

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  PUSH = 'PUSH',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

export enum NotificationProviderType {
  SMTP = 'SMTP',
  SENDGRID = 'SENDGRID',
  TWILIO = 'TWILIO',
  AWS_SES = 'AWS_SES',
  FCM = 'FCM',
  WHATSAPP_BUSINESS = 'WHATSAPP_BUSINESS',
  MOCK = 'MOCK',
}

/**
 * Maps a notification channel to the provider types that can deliver it.
 */
export const CHANNEL_PROVIDER_MAP: Record<NotificationChannel, NotificationProviderType[]> = {
  [NotificationChannel.EMAIL]: [
    NotificationProviderType.SMTP,
    NotificationProviderType.SENDGRID,
    NotificationProviderType.AWS_SES,
    NotificationProviderType.MOCK,
  ],
  [NotificationChannel.SMS]: [NotificationProviderType.TWILIO, NotificationProviderType.MOCK],
  [NotificationChannel.WHATSAPP]: [
    NotificationProviderType.WHATSAPP_BUSINESS,
    NotificationProviderType.MOCK,
  ],
  [NotificationChannel.PUSH]: [NotificationProviderType.FCM, NotificationProviderType.MOCK],
};
