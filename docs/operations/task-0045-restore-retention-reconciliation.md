# Task 0045 — Restore / Retention / Legal-Hold Reconciliation

## Rule

A restored database is historical application state. Restoring a backup must never be interpreted as permission to resurrect data indefinitely or to bypass a legal hold.

Application disposition policy and backup-file retention are separate controls:

- application policy governs live/restored rows;
- `backup-retention-policy.md` governs backup archive lifetime;
- a legal hold blocks destructive application processing after restore;
- operators must not selectively edit backup archives to simulate row-level deletion.

## Restore sequence

After any production restore:

1. restore and verify the database using the canonical backup/restore runbook;
2. deploy all migrations, including Task 0045, before application traffic resumes;
3. verify `CompliancePolicy`, `ComplianceLegalHold`, `CompliancePolicyDecisionRecord`, and `ComplianceDispositionJob` integrity;
4. confirm legal holds are present before any disposition worker is run;
5. run the normal compliance retention worker against the restored state;
6. inspect the worker summary and immutable job/audit evidence;
7. investigate any failed candidate before declaring retention reconciliation complete;
8. only then return normal scheduled retention processing to service.

## Legal-hold precedence after restore

The retention worker re-evaluates the current policy and live legal-hold state. It does not trust an old "eligible for deletion" marker from the backup.

For global-user projections, any active matching hold across the user's tenant memberships forces RETAIN.

For tenant-scoped data, the exact tenant/membership scope remains authoritative.

## Previously deleted data in older backups

A backup may legitimately contain data that was deleted from the live database after the backup was created.

That does not mean the data becomes valid to keep after restore. The retention worker must re-apply the current lifecycle rules to the restored copy.

Backup archives themselves expire only under the canonical backup retention schedule or a separately approved preservation hold. Task 0045 does not silently shorten or extend those archive lifetimes.

## Previously anonymized projection data

Task 0045 stores `privacyDispositionAt` on anonymized patient notification/timeline projections. On restore:

- rows already marked as anonymized are not selected again;
- rows that predate a later anonymization may be selected and anonymized again after restore;
- domain source identifiers remain bounded internal identifiers so projection deduplication is not broken.

## Evidence reconciliation

A successful reconciliation should leave:

- no destructive mutation that lacks a corresponding decision and disposition job;
- no completed destructive job when a matching active hold applied;
- no mutation outside the explicit executable data-class matrix;
- a bounded audit event for every processed job.

## Incident behavior

If policy/hold tables are missing, inconsistent, or fail migration/integrity checks, destructive processing must remain disabled. Restore the policy evidence or resolve the incident before rerunning retention.

Do not "fix" a compliance restore by deleting evidence rows; policy decisions, holds, jobs, and audit records are intentionally protected.
