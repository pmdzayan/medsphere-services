export class VerificationResponseDto {
  id!: string;
  tenantId!: string;
  providerType!: string;
  status!: string;
  licenseNumber!: string;
  licenseExpiryDate!: string;
  businessRegistrationNumber!: string;
  governmentIdReference!: string;
  verificationNotes?: string | null;
  submittedAt!: string;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  createdAt!: string;
  updatedAt!: string;
}
