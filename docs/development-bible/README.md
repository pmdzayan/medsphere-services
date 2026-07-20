# MedSphere Development Bible

**Version:** 1.0

**Status:** Living engineering handbook

**Update rule:** Every accepted sprint updates its affected volumes

The Development Bible is the long-term engineering source of truth. It describes the intended and accepted product; `PROJECT_STATUS.md` records what the repository has actually completed.

| Volume | Subject              | Current authoritative source                                    | Status                 |
| -----: | -------------------- | --------------------------------------------------------------- | ---------------------- |
|     01 | Vision and Business  | This index and `PRODUCT_ROADMAP.md`                             | Foundation draft       |
|     02 | Product Requirements | Roadmap module scopes; detailed PRDs pending                    | Incremental            |
|     03 | System Architecture  | ADR-001 and architecture section below                          | Active redesign        |
|     04 | Database             | [Database Bible](04-database.md), Prisma schema, and migrations | Accepted               |
|     05 | Backend              | [Identity and Authentication Backend Bible](05-backend.md)      | Active implementation  |
|     06 | Frontend             | Frontend specification pending repository adoption              | Planned                |
|     07 | Security             | [Authentication and Session Security Bible](07-security.md)     | Active implementation  |
|     08 | Compliance           | Control mapping pending qualified review                        | Planned                |
|     09 | AI Version 2         | `PRODUCT_ROADMAP.md`; detailed AI Bible deferred                | Planned                |
|     10 | Testing              | `PROJECT_RULES.md`; detailed test matrix pending                | Stabilization priority |
|     11 | DevOps               | Current Docker/Compose/Actions plus future runbooks             | Not production-ready   |
|     12 | Roadmap              | `PRODUCT_ROADMAP.md` and `PROJECT_STATUS.md`                    | Active                 |
|     13 | Standards            | `PROJECT_RULES.md`                                              | Active                 |
|     14 | AI Workflow          | `AI_HANDOFF.md`                                                 | Active                 |
|     15 | Future Ideas         | Future integrations in the roadmap; dedicated register pending  | Incremental            |

## Volume 01 — Vision and Business

MedSphere's vision is one trustworthy healthcare ecosystem that improves access, medicine visibility, operational coordination, and patient control without weakening privacy or clinical responsibility.

Primary Version 1 users are patients, pharmacy teams, suppliers, hospitals, doctors, laboratories, organization administrators, and platform administrators. Commercial and revenue models remain product decisions and must not be embedded in technical architecture before validation.

## Volume 03 — Current architecture summary

Version 1 uses a modular monolith with bounded modules and future extraction seams. Initial bounded-context candidates are:

- Identity and Access
- Tenancy and Organization
- Provider Registry and Verification
- Medicine Catalog and Taxonomy
- Inventory and Stock Ledger
- Reservation and Fulfilment
- Consent and Privacy
- Audit and Policy
- Patient Records
- Notifications
- Reporting and Analytics

These are candidates until their ownership and dependency map is accepted in a later architecture sprint. They must not be interpreted as permission to implement every module now.

## Documentation template for every feature

Each feature specification must include:

- Purpose and users
- Functional and non-functional requirements
- Business rules and state transitions
- User stories
- Edge cases and failure behavior
- Permissions, tenant scope, consent, privacy, audit, and retention
- Data model and indexes
- API/events and validation
- UI/accessibility requirements where applicable
- Observability and operations
- Test strategy
- Acceptance criteria
- Dependencies, out-of-scope items, and future extensibility

## Change control

- Major decisions require an ADR with decision, reason, alternatives, and consequences.
- Historical documents are not silently rewritten; mark superseded guidance and link to the replacement.
- Status claims require evidence from migrations, tests, review, and quality gates.
- Future ideas are recorded without bypassing roadmap priority.
