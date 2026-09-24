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

export const COMPLIANCE_DISPOSITION_JOB_SOURCES = ['SUBJECT_REQUEST', 'RETENTION_EXPIRY'] as const;
export type ComplianceDispositionJobSource = (typeof COMPLIANCE_DISPOSITION_JOB_SOURCES)[number];

export const COMPLIANCE_DISPOSITION_JOB_STATUSES = ['DENIED', 'HELD', 'COMPLETED'] as const;
export type ComplianceDispositionJobStatus = (typeof COMPLIANCE_DISPOSITION_JOB_STATUSES)[number];

export type ComplianceDataScope = 'GLOBAL_USER' | 'TENANT';

export interface ComplianceDataClassDescriptor {
  readonly key: ComplianceDataClass;
  readonly description: string;
  readonly containsSensitiveData: boolean;
  readonly scope: ComplianceDataScope;
  readonly subjectRequestDispositions: readonly ComplianceDisposition[];
  readonly retentionDispositions: readonly ComplianceDisposition[];
}

const RETAIN_ONLY = ['RETAIN'] as const;
const DESTRUCTIVE = ['RETAIN', 'DELETE', 'ANONYMIZE'] as const;

/**
 * Task 0045 data-class inventory and executable disposition matrix.
 *
 * The matrix is intentionally restrictive. Financial, audit, consent,
 * authentication, membership and inventory evidence are retain-only until a
 * qualified legal/compliance rule explicitly permits a narrower lifecycle and
 * a domain-safe executor exists. Only user-owned presentation/preferences
 * data has destructive execution in V1.
 */
export const COMPLIANCE_DATA_CLASS_CATALOG: readonly ComplianceDataClassDescriptor[] = [
  {
    key: 'IDENTITY_PROFILE',
    description: 'Global account identity and contact profile',
    containsSensitiveData: true,
    scope: 'GLOBAL_USER',
    subjectRequestDispositions: RETAIN_ONLY,
    retentionDispositions: RETAIN_ONLY,
  },
  {
    key: 'AUTHENTICATION_SECURITY',
    description: 'Sessions, refresh credentials and external authentication bindings',
    containsSensitiveData: true,
    scope: 'GLOBAL_USER',
    subjectRequestDispositions: RETAIN_ONLY,
    retentionDispositions: RETAIN_ONLY,
  },
  {
    key: 'PRIVACY_PREFERENCES',
    description: 'Personal privacy and notification preferences',
    containsSensitiveData: true,
    scope: 'GLOBAL_USER',
    subjectRequestDispositions: DESTRUCTIVE,
    retentionDispositions: RETAIN_ONLY,
  },
  {
    key: 'CONSENT_EVIDENCE',
    description: 'Append-only consent grant and withdrawal evidence',
    containsSensitiveData: true,
    scope: 'GLOBAL_USER',
    subjectRequestDispositions: RETAIN_ONLY,
    retentionDispositions: RETAIN_ONLY,
  },
  {
    key: 'TENANT_MEMBERSHIP',
    description: 'Organization membership and provider-access evidence',
    containsSensitiveData: true,
    scope: 'TENANT',
    subjectRequestDispositions: RETAIN_ONLY,
    retentionDispositions: RETAIN_ONLY,
  },
  {
    key: 'AUDIT_EVIDENCE',
    description: 'Security and business audit evidence',
    containsSensitiveData: true,
    scope: 'TENANT',
    subjectRequestDispositions: RETAIN_ONLY,
    retentionDispositions: RETAIN_ONLY,
  },
  {
    key: 'PATIENT_PROFILE',
    description: 'Patient demographic/profile data',
    containsSensitiveData: true,
    scope: 'GLOBAL_USER',
    subjectRequestDispositions: RETAIN_ONLY,
    retentionDispositions: RETAIN_ONLY,
  },
  {
    key: 'PATIENT_NOTIFICATION',
    description: 'Patient in-app notification history',
    containsSensitiveData: true,
    scope: 'GLOBAL_USER',
    subjectRequestDispositions: DESTRUCTIVE,
    retentionDispositions: DESTRUCTIVE,
  },
  {
    key: 'PATIENT_TIMELINE',
    description: 'Patient timeline projection data',
    containsSensitiveData: true,
    scope: 'GLOBAL_USER',
    subjectRequestDispositions: DESTRUCTIVE,
    retentionDispositions: DESTRUCTIVE,
  },
  {
    key: 'MEDICINE_RESERVATION',
    description: 'Medicine reservation and allocation history',
    containsSensitiveData: true,
    scope: 'TENANT',
    subjectRequestDispositions: RETAIN_ONLY,
    retentionDispositions: RETAIN_ONLY,
  },
  {
    key: 'INVENTORY_OPERATION',
    description: 'Tenant inventory operational and safety evidence',
    containsSensitiveData: false,
    scope: 'TENANT',
    subjectRequestDispositions: RETAIN_ONLY,
    retentionDispositions: RETAIN_ONLY,
  },
  {
    key: 'BILLING_FINANCIAL',
    description: 'POS sale, payment, tax, invoice and refund evidence',
    containsSensitiveData: true,
    scope: 'TENANT',
    subjectRequestDispositions: RETAIN_ONLY,
    retentionDispositions: RETAIN_ONLY,
  },
] as const;

const descriptorMap = new Map<ComplianceDataClass, ComplianceDataClassDescriptor>(
  COMPLIANCE_DATA_CLASS_CATALOG.map((descriptor) => [descriptor.key, descriptor]),
);
const dataClassSet = new Set<string>(COMPLIANCE_DATA_CLASSES);

export function isComplianceDataClass(value: string): value is ComplianceDataClass {
  return dataClassSet.has(value);
}

export function complianceDataClassDescriptor(
  dataClass: ComplianceDataClass,
): ComplianceDataClassDescriptor {
  const descriptor = descriptorMap.get(dataClass);
  if (!descriptor) throw new Error('Compliance data-class catalogue invariant violated');
  return descriptor;
}
