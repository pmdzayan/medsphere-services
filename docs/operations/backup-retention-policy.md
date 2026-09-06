# AIM Backup Retention Policy (Canonical)

**Status:** Proposed (Task 0022 foundation) — pending CTO review. This policy
defines the canonical retention values for the repository; it does not imply
production activation or CTO acceptance.

**Owner:** CTO / Operations

**Scope:** PostgreSQL logical backups of the AIM application database. This
file is the **single canonical source** for backup retention values. If any
other document mentions a retention number, this file wins.

## Backup types

| Type                     | Tool                                                     | Format                                                                   | Purpose                                                                                            |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Logical backup           | `pg_dump` (via `scripts/aim-backup.mjs`)                 | PostgreSQL custom archive (`--format=custom --no-owner --no-privileges`) | Portable restorable copy usable by `pg_restore` into a clean database                              |
| Provider snapshot / PITR | Managed-database or storage snapshot (not yet activated) | Provider-specific                                                        | Platform-level recovery and point-in-time recovery when the deployment architecture activates them |

Infrastructure/provider snapshots and PITR are **deployment-activation work**,
not repository-owned capabilities. Until a provider is selected and activated,
logical backups are the operative recovery path. See
`docs/operations/backup-restore-runbook.md` for what is and is not implemented.

## Retention schedule (canonical values)

| Tier                  | Frequency                    | Keep                          | Expiration action                                 |
| --------------------- | ---------------------------- | ----------------------------- | ------------------------------------------------- |
| Daily logical backup  | Once per day (production)    | **30 days**                   | Delete the archive file after 30 days             |
| Weekly logical backup | One per week (Monday)        | **12 weeks** (i.e. ~3 months) | Delete the archive file after 12 weeks            |
| Monthly archive       | One per month (1st of month) | **12 months** (i.e. 1 year)   | Office-of-record archival; delete after 12 months |

Reasoning:

- 30 days of daily backups covers the common "we noticed yesterday, restore
  from last week" incident without indefinite storage growth.
- Weekly backups give a longer recovery horizon without multiplying storage.
- Monthly archives satisfy the documented V1 "long-term recovery" desire for
  at least one year with bounded cost.
- These are **V1 engineering targets**, not a compliance commitment.
  A compliance/legal-hold review is a separate launch gate.

## Storage hygiene

- Backup files are never stored in Git, public web directories, application
  assets, or repository artifacts.
- At-rest storage must be encrypted (provider-level encryption at a minimum).
- Backup files are treated as sensitive healthcare/business data end to end.
- A backup that upload-copies to any tier must be deleted from the local
  working location only after the copy is verified (size + SHA-256).

## Failed-backup behavior

- A **failed** backup does **not** extend the retention clock and is **not**
  counted toward the "latest successful backup" age.
- A failed backup must be retried; if it fails again, follow the incident
  response in `docs/operations/backup-restore-runbook.md`.
- A stale-success warning fires when the latest successful backup is older
  than **28 hours** (100800 s), and a critical alert fires when older than
  **72 hours** (259200 s). These thresholds are mirrored in
  `docs/operations/v1-alert-rules.prometheus.yml` and are the **only**
  staleness thresholds.

## Enforcement

- The backup CLI (`scripts/aim-backup.mjs`) writes a bounded JSONL
  status record (`kind:"backup"`) that the metrics exporter
  (`scripts/aim-backup-status.mjs`) turns into Prometheus gauges.
- Operators validate restorability on a schedule (see
  `docs/operations/backup-restore-runbook.md`, "Automated restore
  verification"); a restore that fails its integrity verification is treated
  as a backup failure for retention purposes.
- This policy is expected to be reviewed when production deployment is
  activated and actual storage costs/limits are known.

## Related

- `docs/operations/backup-restore-runbook.md` (authoritative operational runbook)
- `docs/operations/v1-observability-runbook.md` (backup metrics)
- `docs/operations/v1-alert-rules.prometheus.yml` (backup alerts)
- `docs/adr/0027-production-backup-recovery-foundation.md` (architecture record)
