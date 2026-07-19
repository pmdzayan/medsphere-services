## Sprint objective

<!-- State the one approved sprint objective. -->

## Dependencies

- [ ] I read `PROJECT_RULES.md`, `PROJECT_STATUS.md`, `AI_HANDOFF.md`, the roadmap, and relevant ADRs.
- [ ] The preceding sprint and required dependencies are accepted.

## Changes

<!-- Summarize files, database changes, APIs/events, permissions, audit behavior, and documentation. -->

## Healthcare and architecture review

- [ ] No client-controlled identity or tenant trust was introduced.
- [ ] Tenant isolation and permissions are enforced and negatively tested where applicable.
- [ ] Sensitive data is minimized and excluded from unsafe logs.
- [ ] Database constraints, indexes, migrations, transactions, retention, and audit effects were reviewed.
- [ ] Existing code and patterns were reused; duplicate or dead code was not introduced.
- [ ] The change follows ADR-001 module boundaries or includes an accepted replacement ADR.

## Validation

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Implementation reviewed for validation, performance, security, architecture, and duplication

## Evidence

<!-- Include test names/results. A skipped or blocked command is not a pass. -->

## Remaining work

<!-- Report out-of-scope findings without implementing the next sprint. -->
