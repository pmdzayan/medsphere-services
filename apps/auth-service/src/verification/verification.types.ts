export const ACCOUNT_VERIFICATION_METHODS = ['PHONE', 'IDENTITY', 'AGE'] as const;
export type AccountVerificationMethod = (typeof ACCOUNT_VERIFICATION_METHODS)[number];

export const ACCOUNT_VERIFICATION_PROVIDERS = ['MOCK', 'EXTERNAL_IDENTITY_PROVIDER'] as const;
export type AccountVerificationProvider = (typeof ACCOUNT_VERIFICATION_PROVIDERS)[number];

export interface VerificationCompletionResult {
  readonly userId: string;
  readonly membershipId: string;
  readonly userStatus: 'ACTIVE' | 'PENDING_VERIFICATION' | 'INACTIVE' | 'SUSPENDED';
  readonly membershipStatus: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  readonly activated: boolean;
  readonly replayed: boolean;
}
