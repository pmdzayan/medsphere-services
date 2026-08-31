# V1 Hardcoded-English Audit

## Result

The production TSX audit currently scans 37 files under the public pages, application shell,
authentication flows, and operational workspaces. It reports:

- 30 candidate literals with an explicit justification;
- 0 unexplained candidates; and
- 0 known hardcoded user-facing English strings.

Run `node scripts/i18n-hardcoded-ui-audit.mjs` to enforce the result. Use `--json` for the
file-, line-, kind-, text-, and reason-level evidence. The audit is part of
`test:architecture`, so a newly introduced unexplained UI literal fails the architecture gate.

The earlier 204 count came from a coarse exploratory grep and its individual result set was not
stored. A one-to-one retrospective classification of those exact hits would therefore be
invented evidence. To replace it with reproducible evidence, the semantic scanner was also run
against the pre-audit Task 0009 checkpoint (`ea04d4232e2d103299f8964b18b4872629c1d3c6`). That
strict baseline found 643 semantic UI candidates: 612 unexplained genuine UI literals and 31
justified exclusions. On the current source, the same scanner finds 30 justified exclusions and
no unexplained literal.

## Classification boundary

### Genuine user-facing copy

All static copy for landing, registration, login and organization selection, verification,
dashboard, inventory, expiry and batch operations, quarantine and damaged stock, transfers,
reservations, audit, team and RBAC, settings and privacy, nearby search, loading, empty, error,
confirmation, navigation, metadata, and accessible labels is catalog-driven. A direct English
literal in those locations is a failing audit result.

### Developer, protocol, or locale-independent content

The justified literals are limited to an email-address format example,
UUID/role/permission/status/protocol codes, an invitation-code format example, and
internal expiry-urgency discriminators. These values are not English prose and must remain
stable across locales. The JSON audit names the reason for every occurrence.

### Dynamic external and backend content

The frontend does not translate tenant-authored or domain-instance data: organization and person
names, email addresses, medicine and provider names, tenant-authored role descriptions, batch and
reservation identifiers, and permission or audit-event codes. Localized surrounding labels make
the boundary clear. Known bounded statuses are mapped to catalog copy. Unknown bounded event or
permission codes are displayed as codes, not converted into invented English labels. Arbitrary
backend exception messages are never reflected into the UI; the frontend retains useful bounded
status information and renders a catalog error instead.

## Coverage and limitations

The scanner deliberately excludes tests, fixtures, API handlers, logs, source identifiers, and
non-TSX catalog modules because they do not directly render production UI. It recognizes JSX
text, visible attributes and props, visible string expressions, and common UI error boundaries.
It is a regression guard, not a substitute for rendered accessibility and language-persistence
tests.

English, Tamil, and Urdu have complete key coverage and are selectable. Their catalog schema and
placeholder parity are tested. Tamil and Urdu wording has not received independent professional
linguistic or clinical review, so key/infrastructure completeness must not be presented as
translation-quality certification.
