import type {
  ComplianceDisposition,
  ComplianceEvaluationContext,
  CompliancePolicyDecision,
  CompliancePurpose,
} from './compliance.types';

export interface CompliancePolicySnapshot {
  readonly id: string;
  readonly allowedPurposes: readonly CompliancePurpose[];
  readonly retentionDays: number | null;
  readonly expiryDisposition: ComplianceDisposition;
  readonly subjectRequestDisposition: ComplianceDisposition;
  readonly version: number;
}

export interface ComplianceHoldSnapshot {
  readonly id: string;
}

export interface CompliancePolicyEvaluationInput {
  readonly policy: CompliancePolicySnapshot | null;
  readonly hold: ComplianceHoldSnapshot | null;
  readonly purpose: CompliancePurpose;
  readonly context: ComplianceEvaluationContext;
  readonly requestedDisposition: ComplianceDisposition | null;
}

export interface CompliancePolicyEvaluationResult {
  readonly decision: CompliancePolicyDecision;
  readonly effectiveDisposition: ComplianceDisposition;
  readonly policyId: string | null;
  readonly policyVersion: number | null;
  readonly legalHoldId: string | null;
}

/**
 * Pure fail-closed policy decision function.
 *
 * Precedence:
 * 1. missing policy -> DENY / preserve;
 * 2. purpose not allowlisted -> DENY / preserve;
 * 3. ACCESS never destroys data and is allowed only after 1+2;
 * 4. active legal hold overrides DELETE/ANONYMIZE;
 * 5. subject requests must match the configured subject-request disposition;
 * 6. retention expiry uses the configured expiry disposition.
 */
export function decideCompliancePolicy(
  input: CompliancePolicyEvaluationInput,
): CompliancePolicyEvaluationResult {
  const policy = input.policy;
  if (!policy) {
    return denied();
  }

  if (!policy.allowedPurposes.includes(input.purpose)) {
    return denied(policy);
  }

  if (input.context === 'ACCESS') {
    if (input.requestedDisposition !== null) {
      return denied(policy);
    }
    return {
      decision: 'ALLOW',
      effectiveDisposition: 'RETAIN',
      policyId: policy.id,
      policyVersion: policy.version,
      legalHoldId: null,
    };
  }

  if (input.context === 'SUBJECT_REQUEST') {
    if (input.requestedDisposition === null) {
      return denied(policy);
    }
    if (
      input.hold &&
      (input.requestedDisposition === 'DELETE' || input.requestedDisposition === 'ANONYMIZE')
    ) {
      return held(policy, input.hold);
    }
    if (input.requestedDisposition !== policy.subjectRequestDisposition) {
      return denied(policy);
    }
    return {
      decision: 'ALLOW',
      effectiveDisposition: input.requestedDisposition,
      policyId: policy.id,
      policyVersion: policy.version,
      legalHoldId: null,
    };
  }

  if (input.requestedDisposition !== null) {
    return denied(policy);
  }

  if (
    input.hold &&
    (policy.expiryDisposition === 'DELETE' || policy.expiryDisposition === 'ANONYMIZE')
  ) {
    return held(policy, input.hold);
  }

  return {
    decision: 'ALLOW',
    effectiveDisposition: policy.expiryDisposition,
    policyId: policy.id,
    policyVersion: policy.version,
    legalHoldId: null,
  };
}

function denied(policy?: CompliancePolicySnapshot): CompliancePolicyEvaluationResult {
  return {
    decision: 'DENY',
    effectiveDisposition: 'RETAIN',
    policyId: policy?.id ?? null,
    policyVersion: policy?.version ?? null,
    legalHoldId: null,
  };
}

function held(
  policy: CompliancePolicySnapshot,
  hold: ComplianceHoldSnapshot,
): CompliancePolicyEvaluationResult {
  return {
    decision: 'LEGAL_HOLD',
    effectiveDisposition: 'RETAIN',
    policyId: policy.id,
    policyVersion: policy.version,
    legalHoldId: hold.id,
  };
}
