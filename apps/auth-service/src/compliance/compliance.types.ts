export const COMPLIANCE_DATA_CLASSES = [
  'IDENTITY_PROFILE',
  'AUTHENTICATION_SECURITY',
  'PRIVACY_PREFERENCES',
  'CONSENT_EVIDENCE',
  'TENANT_MEMBERSHIP',
  'AUDIT_EVIDENCE',
  'PATIENT_PROFILE',
  'PATIENT_NOTIFICATION',
  'PATIENT_TIMELINE',
  'MEDICINE_RESERVATION',
  'INVENTORY_OPERATION',
  'BILLING_FINANCIAL',
] as const;

export type ComplianceDataClass = (typeof COMPLIANCE_DATA_CLASSES)[number];

export const COMPLIANCE_PURPOSES = [
  'ACCOUNT_SECURITY',
  'SERVICE_DELIVERY',
  'INVENTORY_OPERATIONS',
  'BILLING_TAX',
  'PRIVACY_PREFERENCE',
  'LEGAL_COMPLIANCE',
  'AUDIT_SECURITY',
  'PATIENT_CARE',
] as const;

export type CompliancePurpose = (typeof COMPLIANCE_PURPOSES)[number];

export const COMPLIANCE_DISPOSITIONS = ['RETAIN', 'DELETE', 'ANONYMIZE'] as const;
export type ComplianceDisposition = (typeof COMPLIANCE_DISPOSITIONS)[number];

export const COMPLIANCE_EVALUATION_CONTEXTS = [
  'ACCESS',
  'SUBJECT_REQUEST',
  'RETENTION_EXPIRY',
] as const;
export type ComplianceEvaluationContext = (typeof COMPLIANCE_EVALUATION_CONTEXTS)[number];

export const COMPLIANCE_POLICY_DECISIONS = ['ALLOW', 'DENY', 'LEGAL_HOLD'] as const;
export type CompliancePolicyDecision = (typeof COMPLIANCE_POLICY_DECISIONS)[number];

export const COMPLIANCE_LEGAL_HOLD_REASONS = [
  'LITIGATION',
  'REGULATORY_REQUEST',
  'SECURITY_INVESTIGATION',
  'CONTRACTUAL_PRESERVATION',
  'OTHER',
] as const;
export type ComplianceLegalHoldReason = (typeof COMPLIANCE_LEGAL_HOLD_REASONS)[number];

export const COMPLIANCE_LEGAL_HOLD_STATUSES = ['ACTIVE', 'RELEASED'] as const;
export type ComplianceLegalHoldStatus = (typeof COMPLIANCE_LEGAL_HOLD_STATUSES)[number];

export interface ComplianceDataClassDescriptor {
  readonly key: ComplianceDataClass;
  readonly description: string;
  readonly containsSensitiveData: boolean;
  readonly destructiveExecutionStatus: 'NOT_IMPLEMENTED' | 'PARTIAL' | 'AVAILABLE';
}

/**
 * Explicit Task 0045 data-class inventory. The execution status is deliberately
 * conservative: the policy engine may decide what is permitted, but destructive
 * processing is not implied until a class-specific executor is separately
 * implemented and certified.
 */
export const COMPLIANCE_DATA_CLASS_CATALOG: readonly ComplianceDataClassDescriptor[] = [
  {
    key: 'IDENTITY_PROFILE',
    description: 'Global account identity and contact profile',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'AUTHENTICATION_SECURITY',
    description: 'Sessions, refresh credentials and external authentication bindings',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'PRIVACY_PREFERENCES',
    description: 'Personal privacy and notification preferences',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'CONSENT_EVIDENCE',
    description: 'Append-only consent grant and withdrawal evidence',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'TENANT_MEMBERSHIP',
    description: 'Organization membership and provider-access evidence',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'AUDIT_EVIDENCE',
    description: 'Security and business audit evidence',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'PATIENT_PROFILE',
    description: 'Patient demographic/profile data',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'PATIENT_NOTIFICATION',
    description: 'Patient in-app notification history',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'PATIENT_TIMELINE',
    description: 'Patient timeline projection data',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'MEDICINE_RESERVATION',
    description: 'Medicine reservation and allocation history',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'INVENTORY_OPERATION',
    description: 'Tenant inventory operational and safety evidence',
    containsSensitiveData: false,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
  {
    key: 'BILLING_FINANCIAL',
    description: 'POS sale, payment, tax, invoice and refund evidence',
    containsSensitiveData: true,
    destructiveExecutionStatus: 'NOT_IMPLEMENTED',
  },
] as const;

const dataClassSet = new Set<string>(COMPLIANCE_DATA_CLASSES);

export function isComplianceDataClass(value: string): value is ComplianceDataClass {
  return dataClassSet.has(value);
}
