# AIM — All In Medico

## Task 0041 — V1 Reuse & Integration Audit

**CTO review report**

**Audit date:** 2026-09-19

**Repository:** [`pmdzayan/medsphere-services`](https://github.com/pmdzayan/medsphere-services)

**Authoritative branch:** `feature/database-architecture`

**Verified authoritative commit:** [`7ec50206d31e38f1e73c2f797f89d843bbeb6070`](https://github.com/pmdzayan/medsphere-services/commit/7ec50206d31e38f1e73c2f797f89d843bbeb6070)

**Authoritative tree:** `c867e449e98fa5d6e32368ade2e7b2df4a370373`
**Release state:** not approved for production or real healthcare data

### Evidence labels

- **VERIFIED FACT** — directly observed in source, schema, migration, test, CI, or upstream repository evidence.
- **ARCHITECTURAL INFERENCE** — conclusion derived from verified implementation facts.
- **RECOMMENDATION** — proposed action; not current implementation.
- **UNKNOWN / NEEDS VALIDATION** — evidence was insufficient or runtime validation could not be completed.

---

## 1. Executive summary

### Decision

AIM should **not** replace its core with a pharmacy ERP, POS application, hospital system, or generic healthcare project. That would be an architectural regression. AIM already owns the hard part: tenant-scoped identity, live authorization, exact-user audit, transactional inventory, FEFO allocation, reservations, trusted availability, patient privacy, and bounded event/notification infrastructure.

The right reuse strategy is narrow:

1. **Reuse AIM internally first.** Most remaining work should extend the accepted modular-monolith runtime, database transaction patterns, BFF contracts, UI primitives, audit writers, event outbox/inbox, and authorization boundaries.
2. **Reuse open source only at commodity edges.** Strong candidates exist for accessible UI primitives, icons, barcode decoding, PWA caching, telemetry collection, dashboards, and host security monitoring.
3. **Keep healthcare and integrity rules AIM-owned.** Pharmacy sale/return ledgers, tax and invoice correctness, dispensing, substitution safety, provider verification, tenant isolation, privacy, consent, inventory availability, reservation integrity, and clinical authorization cannot be delegated to generic code.
4. **Do not import whole applications.** The named pharmacy/POS leads are unlicensed, immature, abandoned, incompatible, copyleft-sensitive, or single-store systems. They are useful only as workflow references.
5. **Correct the roadmap.** Supplier/procurement expansion belongs in V2; forecasting, prediction, ML, and advanced recommendations belong in V3. Hospital, doctor, and laboratory capabilities remain V1 expansion scope because `PRODUCT_ROADMAP.md` explicitly includes them, but they should follow a pharmacy-first release tranche rather than block every pharmacy learning cycle.

### Current-state verdict

**VERIFIED FACT:** Tasks 0036–0040 exist in the authoritative tree and their bounded implementations are real. Patient notifications/activity, reservation-derived patient timeline, pharmacy inventory analytics, pharmacy verification APIs/BFFs, and pharmacy provider-access management are not proposals.

**VERIFIED FACT:** AIM's accepted runtime is still centered on `apps/auth-service`, `apps/web`, PostgreSQL 16, and Redis 7. The separate API gateway, billing, notification, reservation, and search deployables are health-only scaffolds; they are not production business services.

**VERIFIED FACT:** AIM has strong end-to-end pharmacy inventory, reservation, patient search, availability trust, authorization, and audit foundations. It does **not** yet implement POS/cart/sales, GST invoices, returns/refunds, barcode workflows, prescriptions/dispensing, medicine substitution safety, true offline operation, or hospital/doctor/laboratory workflows.

**ARCHITECTURAL INFERENCE:** Describing full V1 as nearly complete is not defensible. The repository contains a mature platform and pharmacy inventory core, not a complete multi-domain V1 product.

### Recommended next move

Task 0042 should be **Pharmacy Catalog, Barcode & Inventory Import Foundation**. It closes the data-entry bottleneck that otherwise contaminates POS, batch receiving, invoices, and dispensing. It should reuse the existing `Product`, `Inventory`, `Batch`, ledger, provider authorization, audit, DTO, BFF, and browser-permission boundaries; use a bounded barcode library; and avoid inventing a second inventory system.

---

## 2. Verified repository state

### Start gate

| Check                         | Result   | Evidence                                                                                                    |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| Remote repository             | **PASS** | `origin` resolved to `pmdzayan/medsphere-services`.                                                         |
| Authoritative branch          | **PASS** | `origin/feature/database-architecture` inspected.                                                           |
| Required SHA                  | **PASS** | Exact SHA `7ec50206d31e38f1e73c2f797f89d843bbeb6070`.                                                       |
| Commit identity               | **PASS** | Merge commit: `feat(pharmacy): add staff access management (Task 0040)` / PR #155.                          |
| Clean isolated analysis       | **PASS** | Detached audit worktree remained clean.                                                                     |
| Tree equality                 | **PASS** | Local audit tree `c867e449e98fa5d6e32368ade2e7b2df4a370373` equals the authoritative commit tree.           |
| Authoritative branch modified | **NO**   | No push, merge, deployment, branch update, dependency addition, or authoritative-branch edit was performed. |

The local audit worktree materialized the authoritative tree under a local-only commit (`99d902e7c6f54afe5cacce3edba42637fc3de001`) because the pre-existing local validation history differed from the remote merge history. This did not change source content: its tree is exactly the authoritative remote tree above.

### Exact-head CI evidence

The Task 0040 implementation commit `5d30259ebcf61a40a32c4a4f5bf711014a40de20`, which was merged by the authoritative commit, has eight successful pull-request workflow runs:

- [Quality Gates run 35452762198](https://github.com/pmdzayan/medsphere-services/actions/runs/35452762198)
- [Production Runtime & Deployment Safety run 35452762191](https://github.com/pmdzayan/medsphere-services/actions/runs/35452762191)
- [V1 Core Runtime Regression run 35452762181](https://github.com/pmdzayan/medsphere-services/actions/runs/35452762181)
- [Dashboard Runtime Certification run 35452762234](https://github.com/pmdzayan/medsphere-services/actions/runs/35452762234)
- [Reservations Runtime Certification run 35452762170](https://github.com/pmdzayan/medsphere-services/actions/runs/35452762170)
- [Stock Transfer Runtime Certification run 35452762246](https://github.com/pmdzayan/medsphere-services/actions/runs/35452762246)
- [Performance & Reliability Certification run 35452762260](https://github.com/pmdzayan/medsphere-services/actions/runs/35452762260)
- [Backup & Restore Certification run 35452762184](https://github.com/pmdzayan/medsphere-services/actions/runs/35452762184)

This is strong acceptance evidence for the merged tree. It is not proof that missing V1 capabilities exist or that production use is approved.

---

## 3. Current AIM V1 capability map

### 3.1 Runtime and architecture

**VERIFIED FACT:** `apps/auth-service/src/app.module.ts` mounts authentication, user privacy, localization, authorization, audit, inventory, notifications, verification, consent, platform administration, patient profile, patient notification, patient timeline, readiness, and metrics in one accepted NestJS runtime.

**VERIFIED FACT:** `apps/api-gateway`, `apps/billing-service`, `apps/notification-service`, `apps/reservation-service`, and `apps/search-service` contain health scaffolds rather than accepted domain implementations. `docs/status/2026-08-24-v1-current-state.md` explicitly centers the supported runtime on `apps/auth-service`, `apps/web`, PostgreSQL, and Redis.

**Recommendation:** Preserve the modular monolith. Do not turn every roadmap noun into a network service. Extract a service only when independent scaling, failure isolation, data ownership, or regulatory deployment boundaries are demonstrated.

### 3.2 Database and integrity

**VERIFIED FACT:** `packages/database/prisma/schema.prisma` contains tenant, membership, role, permission, provider access, session, platform administration, provider verification, product, inventory, batch, stock movement, availability evidence/request, reservation, audit, outbox/inbox, notification delivery, patient notification, patient timeline, and medical-record foundation models.

**VERIFIED FACT:** There are 37 Prisma migrations. Important accepted database invariants include:

- tenant-scoped composite relationships;
- append-only audit and delivery evidence;
- FEFO reservation allocations;
- idempotent command records;
- transactional stock movements;
- provider access re-read from PostgreSQL;
- one current provider verification per provider;
- one open provider-verification submission per provider;
- unique timeline/notification source identity;
- outbox/inbox idempotency.

**VERIFIED FACT:** There are no Sale, Invoice, Payment, Return, Refund, Prescription, Appointment, LaboratoryOrder, LaboratoryResult, Supplier, or PurchaseOrder models. `MedicalRecord` is a detached file-metadata foundation and is not mounted as an accepted clinical workflow.

### 3.3 Backend/API

The mounted API includes:

- secure registration/login, Google identity, organization discovery/selection, refresh, logout, lock/unlock, reauthentication, user switching, session state, and phone OTP;
- tenant roles, permissions, memberships, provider-access assignments, membership status, and effective permissions;
- tenant audit reads;
- user privacy, consent, and language preferences;
- public/patient medicine discovery, nearby results, trusted availability, live availability requests, pharmacist response APIs, reservation creation and lifecycle;
- inventory product configuration, batch receiving, adjustments, quarantine, damage, transfer, expiry, stock, reservations, and analytics;
- patient profile, notifications/activity center, and timeline;
- pharmacy profile and verification submission/review APIs;
- platform administrator authentication, invitations, lifecycle, and verification review.

The existence of an API does not prove a complete user journey. Pharmacy profile/verification and several inventory mutations lack a corresponding accepted live page/BFF path.

### 3.4 Frontend/BFF

**VERIFIED FACT:** `apps/web` includes public landing/search, authentication, platform dashboard, inventory, expiry, reservations, analytics, audit, settings, team/RBAC, pharmacy staff, and patient dashboard/medicines/activity/timeline pages.

**VERIFIED FACT:** Same-origin BFF routes validate bounded contracts and set no-store behavior for sensitive flows. Examples include `apps/web/src/lib/auth-api.ts`, strict contract modules under `apps/web/src/lib`, and route tests under `apps/web/src/app/api`.

**VERIFIED FACT:** Pharmacy profile and verification have BFF routes and contract tests but no pharmacy onboarding/profile page. Billing and documents remain visibly marked “Soon” in `apps/web/src/components/platform/app-shell.tsx`.

### 3.5 Test and delivery foundation

- 160 auth-service spec files and 93 web test files were present by static count.
- GitHub Actions include quality, database, backup/restore, production runtime, core runtime, performance, and focused UI/runtime certification workflows.
- `secure-delivery.yml` intentionally blocks production delivery.
- The current checkout has only one Playwright browser scenario file (`apps/web/e2e/dashboard.spec.ts`), so browser journey coverage is far narrower than component/BFF coverage.

---

## 4. Internal reuse findings

| Reusable AIM asset                | Evidence                                                                        | Reuse decision                               | Suitable remaining work                                                   |
| --------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| Trusted identity/session          | `apps/auth-service/src/auth`; session repository and guards                     | **Reuse directly**                           | Every staff, patient, hospital, doctor, and lab workflow                  |
| Tenant and provider authorization | `authorization/*`; `inventory/inventory-access.ts`; `@medsphere/security`       | **Reuse directly; never bypass**             | POS, returns, dispensing, provider domains, reporting                     |
| Exact-user audit                  | `audit/*`; `packages/database/src/audit.ts`                                     | **Reuse directly with new event allowlists** | Sales, returns, invoices, prescriptions, results, policy changes          |
| Provider verification             | `pharmacy-verification/*`; Task 0039 migration                                  | **Reuse with provider-type adaptation**      | Hospital/lab/clinic verification; pharmacy UI closure                     |
| Inventory ledger and FEFO         | `inventory.repository.ts`, command services, FEFO allocation, stock movements   | **Reuse directly; extend transactionally**   | POS sale depletion, returns, recalls, dispensing                          |
| Reservation integrity             | reservation services/repository, expiry workers, lifecycle tests                | **Reuse directly**                           | Pickup handoff, dispensing linkage, patient communications                |
| Availability trust                | evidence, freshness policy, trust evaluator, live requests                      | **Reuse directly**                           | Patient discovery, pharmacy confirmation, stock-confidence UI             |
| Event outbox/inbox                | `OutboxEvent`, `EventInboxReceipt`, event integration tests                     | **Reuse directly**                           | Sale/return/timeline/notification projections                             |
| Notification delivery             | queue, worker, SMTP adapter, recipient resolver, delivery evidence              | **Reuse with operational deployment**        | Receipts, ready-for-pickup, safety alerts; no second notification service |
| Patient activity center           | `PatientNotification`, activity workspace/BFF                                   | **Reuse with new producers**                 | Appointments, prescriptions, lab results, receipts                        |
| Patient timeline                  | `PatientTimelineEvent`, reservation writer, timeline workspace                  | **Reuse with domain-specific producers**     | Appointment, prescription, dispensing, result events                      |
| UI primitives                     | `components/platform/primitives.tsx`, dashboard primitives, app shell           | **Reuse now; standardize later**             | All new pages and workstations                                            |
| BFF validation pattern            | `apps/web/src/lib/*-contract.ts`, `auth-api.ts`, route tests                    | **Reuse directly**                           | POS, import, clinical, lab and reporting routes                           |
| Pagination/cursor patterns        | audit, verification, patient notifications/timeline DTOs                        | **Reuse directly**                           | Sales history, invoices, lab orders, appointments                         |
| Localization                      | domain catalog files, server locale, language provider, RTL tests               | **Reuse and scale; do not replace**          | Every new page/domain                                                     |
| Browser-permission boundary       | permission explanation dialog and permission audit script                       | **Reuse directly**                           | Barcode camera and location; never call browser APIs ad hoc               |
| Metrics/observability             | `@medsphere/common` metrics, `/metrics`, OTLP JSON exporter, alert rules        | **Reuse with collector integration**         | New low-cardinality operational metrics                                   |
| CI and recovery                   | quality gates, migration checks, populated upgrade, backup/restore, performance | **Reuse directly**                           | Every future task and final certification                                 |

### AIM-owned boundaries

The following stay AIM-owned even if external software offers similar features:

- **Owner Shield:** tenant authority, session security, administrator invariants, exact-user audit.
- **Shelf Truth:** batch identity, stock ledger, FEFO, quarantine/damage/return/recall consequences.
- **Stock Confidence:** availability evidence, freshness, pharmacist confirmation, trusted public claims.
- **Money Trail:** sale, payment, refund, tax, invoice, and stock reconciliation semantics.
- **Never Lose the Patient:** patient-scoped notification/timeline projections and consent-aware journeys.
- **Pharmacy Guardian:** verification, prescription/dispensing rules, alternative-medicine safeguards, controlled failure behavior.
- **Growth Engine:** AIM's metric definitions, tenant-safe aggregation, and product decisions; visualization engines may be external.

---

## 5. External open-source findings

### Strongest candidates

1. **OpenTelemetry Collector** — best production telemetry boundary. AIM already emits Prometheus and OTLP-compatible metrics. Run the Collector as isolated infrastructure; do not replace AIM's privacy-safe metric definitions.
2. **Radix Primitives + selectively copied shadcn/ui components** — strong accessible frontend building blocks. Adoption should be incremental through a dedicated design-system task, not a redesign.
3. **Lucide** — better than maintaining AIM's handwritten SVG path catalogue. Low-risk, tree-shakeable icon dependency after visual/accessibility review.
4. **ZXing browser** — appropriate bounded barcode decoding library. AIM must own camera permission, product matching, ambiguity handling, and inventory effects.
5. **Workbox** — appropriate service-worker/caching toolkit. It does not solve offline healthcare transactions; AIM must define queue, idempotency, conflict, expiry, and revalidation rules.
6. **SigNoz** — viable self-hosted observability backend if the deployment avoids enterprise-only paths and excludes PHI. Split licensing and operational cost require review.
7. **Apache Superset** — viable only against a de-identified, least-privilege analytics read model. It must never query the transactional database with broad tenant access.
8. **Wazuh** — useful as separately operated host/container security monitoring. GPLv2 and deployment/telemetry boundaries require legal and security review.

### Full-application reuse verdict

No inspected pharmacy/POS application is suitable as AIM's operational core. The least-bad projects still fail at least one hard gate: incompatible database/stack, single-store architecture, missing tenant isolation, weak audit semantics, unclear/no license, stale maintenance, or copyleft obligations. Their workflows may inform UX, but their authority and data model must not enter AIM.

---

## 6. License and provenance findings

### Hard rules

- No code from a repository without an explicit license may be copied, modified, bundled, or translated into AIM.
- MIT/ISC source or substantial copied components require retained copyright/license notices.
- Apache-2.0 integrations require license/NOTICE preservation and modification notices where applicable.
- GPL/AGPL projects require legal review before distribution, linking, modification, or network deployment. Pattern study is safer than code reuse.
- Split-license repositories require path-level provenance. “The repository is open source” is not enough.
- Every accepted reused unit should record upstream URL, immutable revision, source paths, local adaptation, license, and update owner in a provenance register.

### Named lead disposition

| Lead            | Exact repository/revision inspected                                                                                                                                                                                          | License evidence      | Finding                                                                                                                                                 | Disposition                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| PharmaCare ERP  | [`ishaanpadashetty/pharmacare-erp@1f62e0b673199e51ba76cb913c6fe906bcf1fbaf`](https://github.com/ishaanpadashetty/pharmacare-erp/tree/1f62e0b673199e51ba76cb913c6fe906bcf1fbaf)                                               | No root license found | Active Next/React pharmacy demo with relevant FEFO/GST ideas, but SQLite/libSQL assumptions, no established reuse rights, and no mature safety evidence | **DO NOT REUSE code; REFERENCE ONLY**                |
| MedicPOS        | [`Jerophin123/MedicPOS@04599801b128ebcf869dbd7262b5a3cf8f9a7fb8`](https://github.com/Jerophin123/MedicPOS/tree/04599801b128ebcf869dbd7262b5a3cf8f9a7fb8)                                                                     | No root license found | Java/Spring + Angular, incompatible with AIM; claims POS/GST/returns/barcode but rights and test maturity are not established                           | **DO NOT REUSE**                                     |
| NodeDR POS      | [`Raktim94/nodedr-pos@98e43e5f832043358a53cebdb5a9e299b0de4975`](https://github.com/Raktim94/nodedr-pos/tree/98e43e5f832043358a53cebdb5a9e299b0de4975)                                                                       | AGPL-3.0-only         | Active and useful counter/barcode/printing reference; Express + SQLite single-shop architecture conflicts with AIM tenant/integrity model               | **REFERENCE ONLY; legal review before any code use** |
| Studio POS      | No unique open-source repository could be established                                                                                                                                                                        | None                  | Name resolves to unrelated/commercial products; provenance cannot be established                                                                        | **DO NOT REUSE**                                     |
| offline-cashier | [`Abdallah-Tah/offline-cashier@cf32de37ad46152ee8db5433c8b553fb1d8c2049`](https://github.com/Abdallah-Tah/offline-cashier/tree/cf32de37ad46152ee8db5433c8b553fb1d8c2049)                                                     | No root license found | Laravel subscription/payment package, not an offline POS engine; wrong architecture and unclear rights                                                  | **DO NOT REUSE**                                     |
| Pharraxz        | [`zsomborjoel/pharraxz@b2b58d306ba500e00140a377ae67a9405f827534`](https://github.com/zsomborjoel/pharraxz/tree/b2b58d306ba500e00140a377ae67a9405f827534)                                                                     | Unlicense             | 2022 hospital drug-order prototype; last observed commit 2023; Spring WebFlux/MUI; build instructions still TODO                                        | **REFERENCE ONLY**                                   |
| MedCore         | [`mheraldjnleyson/MedCore-POS-Pharmacy-Management-System@3a5410744148048125be40ef2cba22f4c4e890c4`](https://github.com/mheraldjnleyson/MedCore-POS-Pharmacy-Management-System/tree/3a5410744148048125be40ef2cba22f4c4e890c4) | No license found      | Tiny upload-only repository with no README at inspected revision                                                                                        | **DO NOT REUSE**                                     |
| RetailPOS       | [`PIERONI/RetailPOS@7da605040c3b5d95222ded2295cd530adc5c8377`](https://github.com/PIERONI/RetailPOS/tree/7da605040c3b5d95222ded2295cd530adc5c8377)                                                                           | No license found      | Last observed commit 2013; no meaningful documentation; abandoned and incompatible                                                                      | **DO NOT REUSE**                                     |

---

## 7. Pharmacy findings

### Complete within accepted scope

- authentication, tenant context, live authorization and exact-user audit;
- provider-scoped stock reads;
- product/inventory configuration APIs, batch receiving APIs and adjustment APIs;
- batch/expiry data and physical-expiry reconciliation;
- FEFO reservation allocation;
- stock movements, completed transfers, damaged-stock write-off;
- one-way quarantine and bounded investigation evidence;
- staff-assisted and patient reservation creation/lifecycle;
- public and patient medicine search;
- trusted/fresh availability evaluation and live availability requests;
- reservation-derived notifications and patient activity center;
- pharmacy inventory analytics;
- pharmacy profile/verification backend and BFF;
- pharmacy provider-access staff workspace.

### Partial

- **Pharmacy onboarding/verification:** secure backend, database and BFF exist; the Task 0039 record explicitly leaves the pharmacy onboarding page UI out of scope.
- **Inventory operations UI:** stock, quarantine, damage, transfer and expiry are live; product configuration, batch receiving and adjustments do not have equivalent accepted workstation paths.
- **Pharmacist confirmation:** backend request/response, preferences and demand analytics exist; a live pharmacist request queue is not exposed in the current web pages/BFF inventory route set.
- **Notifications:** durable queue/worker/SMTP adapter exist; production scheduling and an activated real delivery environment are not certified.
- **Pickup:** reservation `READY` and `COMPLETED` states provide a lifecycle foundation; identity/handoff evidence and receipt linkage are absent.
- **Responsive counter UX:** app shell and current workspaces are responsive, but there is no POS counter journey to certify.

### Not implemented

- POS/cart/checkout;
- sale, payment, cash/UPI/card reconciliation;
- GST/HSN tax calculation and legal invoice generation;
- barcode product lookup/camera/hardware workflow;
- customer returns, refund, exchange, supplier return;
- recall, quarantine release, disposal/destruction;
- prescriptions, pharmacist validation, dispensing and partial fills;
- medicine-alternative/substitution safety;
- delivery orchestration/tracking;
- offline transaction queue and reconciliation.

### Pharmacy recommendation

Do not adopt a generic POS ledger. Build sale/return/dispensing commands on AIM's existing serializable PostgreSQL inventory transactions, command idempotency, FEFO, provider authorization, audit, and outbox primitives. Reuse external code only for barcode decoding, receipt/PDF rendering after license review, printer adapters, and accessible UI primitives.

---

## 8. Patient findings

### Complete within accepted scope

- identity and secure patient session context;
- patient profile read/update;
- medicine search, manual location and least-permission geolocation;
- trusted pharmacy availability;
- reservation create/list/detail/cancel and status;
- notification/activity center with read/read-all;
- privacy preferences and consent history/status;
- mobile-responsive patient pages and RTL-capable shell.

### Partial

- **Medical timeline:** Task 0037 is a safe projection, but currently records reservation creation/status transitions only. The candidate record explicitly says it is not an EHR and has no appointment, prescription or clinical producers.
- **Medical history/downloads:** `MedicalRecord` exists only as a schema foundation with `fileUrl`; there is no mounted consent-aware record service, secure object storage, malware scanning, download authorization, or retention policy.
- **Localization:** only English, Tamil and Urdu are enabled as complete whole-app languages. Other listed languages have shell coverage only; backend catalog support is broader but still not whole-app completeness.
- **Accessibility:** semantic labels, error association, focus behavior, reduced-motion and RTL tests are present; there is no repository-wide automated axe/WCAG certification and browser E2E is narrow.
- **Offline/mobile:** responsive web and a PWA manifest exist; there is no service worker, offline cache strategy, background sync or offline command queue.

### Missing, but already implied by V1 roadmap

- appointments;
- prescriptions and dispensing history;
- laboratory reports and safe downloads;
- cross-domain timeline producers;
- patient-controlled clinical sharing/withdrawal beyond existing consent categories.

---

## 9. Other V1 healthcare-domain findings

### Scope authority

`PRODUCT_ROADMAP.md` places Hospital, Doctor, Laboratory, Patient, Platform Services, Frontend, and Production Release before its older “AI Version 2” milestone. The current Task 0041 instruction supersedes that older AI numbering: forecasting, prediction, ML, and advanced recommendations are V3. It also explicitly places deeper supplier/procurement and broader multi-location operations in V2.

### Hospital

- **Foundation only:** `OrganizationType.HOSPITAL`, `ProviderType.HOSPITAL`, generic tenant/membership/provider/RBAC/audit foundations.
- **Not implemented:** departments, branches, beds, appointment calendars, hospital dashboards and hospital-specific verification.
- **Reuse:** tenant, provider, staff access, verification state machine, audit, notification, UI/BFF and pagination patterns.
- **AIM-owned:** clinical access separation, department/branch authority, patient relationship, appointment data boundaries.

### Doctor/clinic

- **Foundation only:** `OrganizationType.CLINIC`, global user identity, account verification, generic RBAC/audit.
- **Not implemented:** doctor identity/profile, professional verification, schedules, leave, appointments, prescriptions, medical notes or dashboard. There is no `ProviderType.DOCTOR` and no doctor model.
- **AIM-owned:** professional verification, prescriber authority, prescription integrity, signing/amendment/revocation, patient access and clinical audit.

### Laboratory

- **Foundation only:** `OrganizationType.LABORATORY`, tenant/member foundations and `MedicalRecordType.LAB_REPORT` enum.
- **Not implemented:** lab provider model/type, test catalogue, order, accession/sample/barcode, result, amendment, release or patient download workflow.
- **AIM-owned:** order/result identity, sample chain of custody, result release/amendment, critical result handling, tenant/patient boundaries.

### Supplier/procurement

- **V2:** no accepted supplier or purchase-order models exist. Product/stock receipt patterns may later be reused, but supplier profiles, procurement approvals, goods receipt and multi-location purchasing should not enter V1 merely because ERPNext or another ERP provides them.

### Predictive/AI

- **V3:** no forecasting, prediction, ML or advanced recommendation work should be added to the V1 backlog. Current analytics are deterministic operational aggregates and should stay that way.

---

## 10. Frontend and design-system findings

### Current state

`apps/web/src/components/platform/primitives.tsx` provides AIM-owned Card, GlassPanel, Button, Input, Badge, StatusIndicator, EmptyState and Skeleton components. `dashboard-primitives.tsx`, `app-shell.tsx`, `permission-explanation-dialog.tsx` and a handwritten `icon.tsx` add useful patterns. Tests cover keyboard dismissal, focus, semantic labels, mobile navigation, RTL and reduced motion in selected areas.

### Problems

- Complex dialogs, menus, selects, popovers and focus traps are repeatedly implemented rather than backed by a mature primitive library.
- `icon.tsx` maintains SVG path data AIM does not need to own.
- Only one Playwright browser spec is present; component tests cannot certify real keyboard/touch/browser behavior.
- Dark mode is in the roadmap but not implemented as a complete product theme.
- Counter information density and touch/keyboard speed cannot be evaluated until POS exists.

### Recommendation

Do not redesign AIM now. In a later design-system task:

1. retain AIM tokens, brand, layouts and existing primitives as the public design API;
2. use Radix primitives under complex interactive components;
3. selectively adapt shadcn/ui source rather than importing a visual theme wholesale;
4. replace the handwritten icon catalogue with named Lucide icons;
5. add Storybook or an equivalent component harness only if it earns its maintenance cost;
6. add automated axe checks plus Playwright keyboard, touch-size, mobile, RTL and dark-mode journeys;
7. certify pharmacy-counter flows for scan-first, keyboard-only and tablet/touch use.

---

## 11. Localization findings

### Verified implementation

- 23 locale codes and directions are declared in `apps/web/src/lib/i18n.ts`.
- English, Tamil and Urdu are the only complete enabled whole-app locales.
- Backend `@medsphere/i18n` includes English, Hindi, Tamil, Telugu, Kannada and Urdu catalogues, while `ENABLED_UI_LANGUAGES` correctly limits persisted whole-app choices to English/Tamil/Urdu.
- Domain catalogues are split by source file, but `i18n.ts` eagerly imports and merges all enabled messages into a large client bundle.
- `isLocaleComplete()` computes real key parity; tests enforce enabled locale behavior and RTL direction.
- `scripts/i18n-hardcoded-ui-audit.mjs` is a regression check for hardcoded user-facing English.

### Scalability verdict

The accepted architecture is sound and should not be replaced. Expansion needs evolution, not a library swap:

- convert domain catalogues to independently loadable locale/domain chunks before enabling many full languages;
- keep English keys/types authoritative and enforce placeholder parity, duplicate-key detection, forbidden fallback and direction coverage in CI;
- add a translation-review workflow with glossary, clinical terminology owner, reviewer identity and versioned approvals;
- measure bundle cost before introducing lazy loading; do not optimize blindly;
- keep untranslated languages disabled rather than presenting a mixed-language UI.

---

## 12. Observability, security and analytics findings

### Application-level AIM logic — keep

- privacy-safe low-cardinality metrics;
- label allowlist rejecting identifiers and sensitive-looking values;
- request correlation and redacted structured logging;
- tenant-scoped audit and notification delivery evidence;
- readiness checks, worker outcomes and domain-specific SLO definitions;
- alert rules that contain no patient, medicine, user or tenant labels.

Evidence: `packages/common/src/metrics`, `packages/logger`, `docs/operations/v1-observability-runbook.md`, and `docs/operations/v1-alert-rules.prometheus.yml`.

### Commodity infrastructure — delegate

- **OpenTelemetry Collector:** receive/scrape, batch, retry and route telemetry. Run inside AIM-controlled infrastructure with TLS/auth, egress restrictions and attribute filtering.
- **SigNoz:** optional self-hosted metrics/logs/traces backend. Do not send request bodies, patient fields, medicine search text, tenant IDs, user IDs or raw URLs. Avoid `ee/` and `cmd/enterprise/` without a commercial license.
- **Apache Superset:** optional de-identified business analytics. Use a separate read-only analytics schema/warehouse with suppressed small cohorts and no operational write path.
- **Wazuh:** optional endpoint/container security monitoring. Keep it outside the application trust boundary; ingest host/security events, not patient/business payloads.

### Current gap

The repository has telemetry production interfaces, alert rules and runbooks, but no certified live collector/backend, alert destination, production log retention, tracing backend, on-call routing or real incident drill. `secure-delivery.yml` still blocks deployment. Commodity software can close infrastructure gaps; it cannot certify AIM's data minimization or operational governance.

---

## 13. Capability matrix

External revision cells use immutable full commit SHAs. “None” means no external code is needed or recommended.

| Domain       | Capability                                             | Current AIM state                        | Repository evidence                                                                                            | V1/V2/V3                           | Internal AIM reuse available                                 | External reuse candidate                                           | Exact upstream repository                                 | Exact commit/tag inspected                                                             | License                             | Reuse strategy                           | AIM adaptation required                                              | Security/privacy risk                              | Recommendation                                         | Confidence  |
| ------------ | ------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ | ----------- |
| Platform     | Identity, login, tenant selection, session lock/switch | **COMPLETE**                             | `auth/*`; `UserSession*`; route-policy/session tests; BFF auth routes                                          | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Extend only through existing guards/repositories                     | Critical if bypassed                               | Preserve unchanged                                     | High        |
| Platform     | Tenant RBAC and provider access                        | **COMPLETE**                             | `authorization/*`; `MembershipRole`; `MembershipProviderAccess`; immediate-revocation DB tests                 | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | New permissions/migrations per domain                                | Critical tenant isolation                          | Reuse as sole authority                                | High        |
| Platform     | Exact-user audit                                       | **COMPLETE**                             | `audit/*`; `AuditEvent`; `AuditWriter`; integration tests                                                      | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Add bounded event types and metadata only                            | High; metadata leakage                             | Reuse for every mutation                               | High        |
| Platform     | Privacy and consent                                    | **PARTIAL**                              | `users/me/privacy`; `users/me/consent`; consent/privacy models and settings UI; no retention/legal-hold policy | V1                                 | Direct + adapt                                               | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Add domain-specific consent, retention and withdrawal consequences   | Critical PHI risk                                  | Complete before clinical domains                       | High        |
| Platform     | Event delivery                                         | **COMPLETE foundation**                  | `OutboxEvent`, `EventInboxReceipt`, dispatcher/consumer integration tests                                      | V1                                 | Direct                                                       | OTel is observability only, not event authority                    | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Add versioned allowlisted domain events                              | Cross-tenant/event replay                          | Reuse; no new broker yet                               | High        |
| Platform     | External notification operations                       | **PARTIAL**                              | queue, worker daemon, SMTP adapter, delivery evidence; status doc says production scheduling was open          | V1                                 | Direct + adapt                                               | OTel Collector                                                     | `open-telemetry/opentelemetry-collector`                  | `ad799ab2a56389f796aaa4fbc97a360cb10dfa99`                                             | Apache-2.0                          | Service integration                      | Deployment, secrets, retry/alert certification                       | Recipient/PHI leakage                              | Schedule existing worker; no second notification stack | High        |
| Platform     | Metrics/collector/backend                              | **FOUNDATION ONLY**                      | `/metrics`, bounded registry, OTLP JSON exporter, alert rules; no live backend                                 | V1 release                         | Direct + adapt                                               | OTel Collector; SigNoz                                             | `open-telemetry/opentelemetry-collector`; `SigNoz/signoz` | `ad799ab2a56389f796aaa4fbc97a360cb10dfa99`; `ea8f95ee087c8bb4088703023e60222a1aedfe24` | Apache-2.0; split MIT/enterprise    | Separate services                        | Attribute filtering, TLS/auth, retention, no PHI                     | OTel Collector first; SigNoz optional/legal review | High                                                   |
| Platform     | Host/container security monitoring                     | **NOT IMPLEMENTED**                      | No SIEM/EDR deployment; app security/logging exists                                                            | V1 release                         | Log/metric sources                                           | Wazuh                                                              | `wazuh/wazuh`                                             | `6513e55177cf46779bbc1bc61dbfe7d5d3eeca58`                                             | GPL-2.0 with project clarifications | Separate service/agents                  | Data minimization, network isolation, operations                     | Optional; legal/security review                    | Medium                                                 |
| Platform     | De-identified BI                                       | **FOUNDATION ONLY**                      | Operational analytics APIs exist; no warehouse/BI service                                                      | V1/V2                              | Analytics patterns                                           | Apache Superset                                                    | `apache/superset`                                         | `43fee87672297d2217ad297b1e80042a4358074b`                                             | Apache-2.0                          | Separate service                         | De-identified read model, RLS defense-in-depth, cohort suppression   | High re-identification/tenant risk                 | Do not connect to OLTP; optional after warehouse       | High        |
| Platform     | Production deployment/release                          | **PARTIAL**                              | Docker/runbooks/certification workflows; `secure-delivery.yml` blocks deployment                               | V1 release gate                    | CI/runbooks/backup                                           | OTel/Wazuh around runtime                                          | See above                                                 | See above                                                                              | Mixed                               | Integration                              | Real environment, secrets, rollback, drills                          | Critical                                           | Keep separate certification task                       | High        |
| Frontend     | Common UI primitives                                   | **PARTIAL**                              | `platform/primitives.tsx`, dashboard primitives, app shell; repeated custom interactive widgets remain         | V1                                 | Direct + adapt                                               | Radix; shadcn/ui                                                   | `radix-ui/primitives`; `shadcn-ui/ui`                     | `f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae`; `a87a63b2ca25143d26c8bd0903e4e9bc77b3f824` | MIT; MIT                            | Library + selective component adaptation | Wrap in AIM API/tokens; regression/a11y tests                        | Low/medium supply-chain                            | Incremental standardization task                       | High        |
| Frontend     | Icons                                                  | **PARTIAL/commodity duplication**        | Handwritten `components/platform/icon.tsx`                                                                     | V1                                 | Existing icon names                                          | Lucide                                                             | `lucide-icons/lucide`                                     | `951813ce76a859d4d8b145366972cbb237147a4e`                                             | ISC                                 | Library dependency                       | Stable AIM semantic names; bundle/a11y review                        | Low                                                | Replace paths later; do not redesign UI                | High        |
| Frontend     | Accessibility                                          | **PARTIAL**                              | aria/focus/RTL/reduced-motion tests; only one Playwright spec; no axe suite                                    | V1                                 | Existing patterns                                            | Radix + axe-core in test tooling                                   | `radix-ui/primitives`                                     | `f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae`                                             | MIT                                 | Library/testing                          | WCAG journeys, keyboard/touch certification                          | Patient access/safety                              | Dedicated hardening task                               | High        |
| Frontend     | Localization                                           | **PARTIAL**                              | 23 codes; only en/ta/ur complete; eager catalogue merge; parity/RTL tests                                      | V1                                 | Direct + adapt                                               | No replacement recommended                                         | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned catalog workflow               | Lazy chunks, reviewer workflow, CI parity                            | Incorrect clinical translation                     | Preserve architecture; scale it                        | High        |
| Frontend     | PWA installability                                     | **FOUNDATION ONLY**                      | `app/manifest.ts`; no service-worker registration found                                                        | V1                                 | App shell/config                                             | Workbox                                                            | `GoogleChrome/workbox`                                    | `4ea3138a120fd2c87389b54130e25f47e0fd7089`                                             | MIT                                 | Library dependency                       | Cache policy, versioning, PHI exclusion                              | Stale/private cache                                | Add bounded shell caching                              | High        |
| Frontend     | Offline transactions                                   | **NOT IMPLEMENTED**                      | No service worker, background sync, IndexedDB queue or reconciliation protocol                                 | V1 counter resilience              | Command IDs/idempotency/FEFO can be adapted                  | Workbox for transport only                                         | `GoogleChrome/workbox`                                    | `4ea3138a120fd2c87389b54130e25f47e0fd7089`                                             | MIT                                 | Library + AIM protocol                   | Draft queue, encryption, expiry, reconnect revalidation, conflict UX | Critical stock/invoice integrity                   | Never finalize stock offline without server commit     | High        |
| Pharmacy     | Organization onboarding request                        | **COMPLETE**                             | registration UI/BFF; organization join codes; pending membership; OTP                                          | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | None beyond UX linkage                                               | Enumeration/account takeover                       | Preserve                                               | High        |
| Pharmacy     | Pharmacy profile/verification                          | **PARTIAL**                              | Task 0039 backend, migration, platform review and pharmacy BFF; candidate explicitly excludes onboarding page  | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Add page using existing BFF; no backend rebuild                      | License document/privacy/trust                     | Close UI only; preserve state machine                  | High        |
| Pharmacy     | Staff/access management                                | **COMPLETE within scope**                | pharmacy staff page/BFF; existing provider access mutations; live revocation tests                             | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Link to existing role/team UI; no parallel staff model               | Privilege escalation                               | Preserve Task 0040                                     | High        |
| Pharmacy     | Medicine catalogue search                              | **COMPLETE**                             | public/patient search controllers, services, BFF/workspaces, PostgreSQL tests                                  | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Add identifiers without weakening search                             | False availability/product mismatch                | Extend catalogue schema carefully                      | High        |
| Pharmacy     | Catalogue import                                       | **NOT IMPLEMENTED**                      | No CSV/XLSX mapping/import job or import evidence model                                                        | V1                                 | Product/configuration commands, audit, DTOs                  | Parser libraries only after task review                            | None selected                                             | N/A                                                                                    | N/A                                 | AIM-owned orchestration                  | Staging, validation, dry-run, idempotent apply                       | High data corruption                               | Task 0042                                              | High        |
| Pharmacy     | Barcode workflows                                      | **NOT IMPLEMENTED**                      | No GTIN/EAN field or scan route; only generic camera-permission boundary and scan icon                         | V1                                 | Permission dialog, product search/BFF                        | ZXing browser                                                      | `zxing-js/browser`                                        | `9ad027d88d4533bd6d29f9d8d7e517e23cd361ff`                                             | MIT                                 | Library dependency                       | Barcode normalization, ambiguity, checksum, manual fallback          | Wrong medicine selection                           | Task 0042; library decodes only                        | High        |
| Pharmacy     | Inventory stock/batches                                | **COMPLETE backend; PARTIAL UI breadth** | `Inventory`, `Batch`, ledger; stock UI; configuration/receive APIs lack equivalent page/BFF                    | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Expose existing commands safely                                      | Critical stock integrity                           | Reuse; add missing workstation surfaces                | High        |
| Pharmacy     | FEFO/reservation allocation                            | **COMPLETE**                             | FEFO service/spec; reservation transactions/concurrency tests                                                  | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Reuse in sale/dispensing                                             | Critical medicine/stock safety                     | Never replace with POS code                            | High        |
| Pharmacy     | Expiry                                                 | **COMPLETE within current scope**        | expiry model/worker/worklist/BFF/UI/tests                                                                      | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Connect disposal/return outcomes later                               | Stale/expired stock                                | Preserve                                               | High        |
| Pharmacy     | Damage/quarantine                                      | **COMPLETE bounded commands**            | damage/quarantine services, evidence, UI/BFF and integration tests                                             | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Add release/disposal/recall as separate commands                     | Critical stock safety                              | Preserve current one-way semantics until Task 0044     | High        |
| Pharmacy     | Returns/refunds/exchanges                              | **NOT IMPLEMENTED**                      | No return/refund models or mounted routes                                                                      | V1                                 | Ledger, command IDs, audit, outbox                           | OSPOS/NodeDR for workflow reference only                           | `opensourcepos/opensourcepos`; `Raktim94/nodedr-pos`      | `b610ae28acfad48728d38c09e1e1e311a2a309d8`; `98e43e5f832043358a53cebdb5a9e299b0de4975` | MIT; AGPL-3.0-only                  | Pattern reuse only                       | Sale linkage, reason/evidence, stock eligibility, tax correction     | Critical fraud/stock/tax                           | AIM-native Task 0044                                   | High        |
| Pharmacy     | Recall/release/disposal                                | **NOT IMPLEMENTED**                      | ADRs explicitly exclude these; no routes/models                                                                | V1                                 | Batch status, quarantine evidence, ledger, audit             | None suitable                                                      | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Policy/state machine, approval, immutable evidence                   | Critical patient safety                            | Separate safety task/gates                             | High        |
| Pharmacy     | POS/cart/checkout                                      | **NOT IMPLEMENTED**                      | Billing service health-only; no Sale/Cart/Payment model/page                                                   | V1                                 | Product/search, FEFO, reservations, stock ledger, auth/audit | OSPOS/NodeDR as reference                                          | See above                                                 | See above                                                                              | MIT; AGPL                           | Pattern reuse                            | Serial transactions, pricing, payments, returns, receipt             | Critical money/stock                               | AIM-native Task 0043                                   | High        |
| Pharmacy     | GST/invoices                                           | **NOT IMPLEMENTED**                      | No invoice/tax/journal models or services                                                                      | V1 India                           | Audit/idempotency/outbox                                     | Generic PDF/rendering library not selected; OSPOS/NodeDR reference | See above                                                 | See above                                                                              | Mixed                               | Pattern/component reuse                  | Legal tax rules, HSN, immutable numbering, correction notes          | Critical legal/financial                           | AIM owns tax/invoice logic; obtain legal validation    | High        |
| Pharmacy     | Prescriptions/dispensing                               | **NOT IMPLEMENTED**                      | `MedicalRecordType.PRESCRIPTION` only; no mounted prescription/dispense model                                  | V1                                 | Identity, consent, audit, timeline, reservation/FEFO         | None approved                                                      | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Prescriber authority, versioning, partial fill, pharmacist evidence  | Critical clinical safety                           | Task 0049 after clinical foundation                    | High        |
| Pharmacy     | Medicine alternatives                                  | **NOT IMPLEMENTED**                      | No substitution/alternative model or rules                                                                     | V1 safety                          | Product catalogue may support bounded links later            | Drug terminology/reference data requires separate legal/data audit | None approved                                             | N/A                                                                                    | N/A                                 | AIM-owned rule/approval                  | Ingredient/strength/form/contraindication and pharmacist approval    | Critical patient harm                              | No automated recommendation in V1                      | High        |
| Pharmacy     | Trusted availability                                   | **COMPLETE**                             | freshness/evidence/trust services, public/patient search, integration tests                                    | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Reuse for sale/search; never infer from stale cache                  | High                                               | Preserve Stock Confidence                              | High        |
| Pharmacy     | Pharmacist confirmation queue                          | **PARTIAL**                              | Backend request/preference/response/demand APIs; no current staff BFF/page                                     | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Build thin UI over existing API                                      | Moderate/high availability misstatement            | Consolidate with stock workspace                       | High        |
| Pharmacy     | Reservations                                           | **COMPLETE**                             | patient/staff create, list/detail, transitions, expiry, FEFO, concurrency and UI                               | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Link to checkout/dispensing/pickup                                   | Critical double allocation                         | Preserve                                               | High        |
| Pharmacy     | Pickup foundation                                      | **PARTIAL**                              | READY/COMPLETED lifecycle and notifications; no handoff identity/receipt                                       | V1                                 | Reservation, audit, notifications                            | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Pickup token/identity, handoff evidence, sale linkage                | Wrong-patient handoff                              | Task 0046                                              | Medium-high |
| Pharmacy     | Delivery foundation                                    | **NOT IMPLEMENTED**                      | No delivery model/assignment/tracking                                                                          | V1 foundation; deeper logistics V2 | Reservation/notification/location patterns                   | No candidate approved                                              | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned boundary                       | Consent, address minimization, partner contract                      | High privacy/safety                                | Only define bounded handoff/API in V1                  | High        |
| Pharmacy     | Operational analytics                                  | **COMPLETE for current inventory**       | Task 0038 service/DTO/BFF/UI; privacy-safe aggregates                                                          | V1                                 | Direct                                                       | Superset later for de-identified BI                                | `apache/superset`                                         | `43fee87672297d2217ad297b1e80042a4358074b`                                             | Apache-2.0                          | AIM API now; service later               | Add sale metrics after sale model; no patient dimensions             | Re-identification                                  | Preserve Task 0038; no forecasting                     | High        |
| Patient      | Profile                                                | **COMPLETE**                             | patient profile module, integration tests, dashboard form/BFF                                                  | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Extend only for required domains                                     | Identity/privacy                                   | Preserve                                               | High        |
| Patient      | Medicine/location search                               | **COMPLETE**                             | patient medicines page; manual location fallback; permission explanation; nearby API                           | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | None                                                                 | Location privacy                                   | Preserve least-permission design                       | High        |
| Patient      | Reservations/status                                    | **COMPLETE**                             | patient reservation controller/service/BFF/workspace                                                           | V1                                 | Direct                                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Add pickup/dispense links                                            | Patient/tenant isolation                           | Preserve                                               | High        |
| Patient      | Activity center                                        | **COMPLETE bounded inbox**               | Task 0036 model/migration/module/BFF/UI/tests                                                                  | V1                                 | Direct + new producers                                       | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned projection                     | Produce appointment/result/receipt events later                      | Notification privacy                               | Do not rebuild                                         | High        |
| Patient      | Medical timeline                                       | **PARTIAL**                              | Task 0037 projection; reservation events only; no backfill/clinical producers                                  | V1                                 | Direct + adapt                                               | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned projection                     | Add consent-aware producers and source destinations                  | Clinical privacy/misleading completeness           | Extend; never market as full EHR now                   | High        |
| Patient      | Clinical records/downloads                             | **FOUNDATION ONLY**                      | detached `MedicalRecord` schema; no service/storage/security pipeline                                          | V1                                 | Identity/consent/audit/timeline                              | Mature object storage/AV candidates need separate audit            | None approved                                             | N/A                                                                                    | N/A                                 | Service integration + AIM authority      | Object authorization, encryption, malware scan, retention            | Critical PHI                                       | Design only with clinical domain tasks                 | High        |
| Hospital     | Profile/departments/branches/beds                      | **FOUNDATION ONLY / NOT IMPLEMENTED**    | `OrganizationType.HOSPITAL`, `ProviderType.HOSPITAL`; no domain models/routes/pages                            | V1 expansion                       | Tenant/provider/RBAC/audit/verification patterns             | ERPNext only as pattern reference                                  | `frappe/erpnext`                                          | `db6e0891099ab27f571b7b9697ba90f6573430f5`                                             | GPL-3.0                             | Pattern reference                        | AIM-native domain/authority/data model                               | Critical clinical/tenant risk                      | Task 0051; no ERP import                               | High        |
| Doctor       | Verification/profile/schedule/prescription             | **FOUNDATION ONLY / NOT IMPLEMENTED**    | `OrganizationType.CLINIC`; no doctor/provider type/model/routes                                                | V1 expansion                       | Identity/verification/RBAC/audit                             | None                                                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Professional identity, schedule, signing/versioning                  | Critical clinical safety                           | Task 0052/0053                                         | High        |
| Laboratory   | Test/order/sample/result                               | **FOUNDATION ONLY / NOT IMPLEMENTED**    | `OrganizationType.LABORATORY`; `LAB_REPORT` enum only                                                          | V1 expansion                       | Tenant/provider/RBAC/audit/timeline/notification             | Pharraxz is not a LIS; none approved                               | None                                                      | N/A                                                                                    | N/A                                 | AIM-owned                                | Chain of custody, result release/amendment, critical flags           | Critical PHI/diagnostic safety                     | Task 0054                                              | High        |
| Supplier     | Procurement and multi-location purchasing              | **NOT IMPLEMENTED**                      | Roadmap only; no supplier/PO models                                                                            | V2                                 | Inventory receipt/transfer patterns later                    | ERPNext                                                            | `frappe/erpnext`                                          | `db6e0891099ab27f571b7b9697ba90f6573430f5`                                             | GPL-3.0                             | Reference/service only after review      | Separate procurement authority/integration                           | Financial/coupling                                 | Remove from V1                                         | High        |
| Intelligence | Forecasting/prediction/ML/recommendations              | **NOT IMPLEMENTED**                      | No model/pipeline; current analytics deterministic                                                             | V3                                 | Data governance foundations later                            | None selected                                                      | None                                                      | N/A                                                                                    | N/A                                 | Future AIM-owned governance              | Evaluation, bias, explainability, human approval                     | Critical                                           | Remove from V1/V2                                      | High        |

---

## 14. Open-source reuse register

| Project                 | Repository                                                                                            | Purpose                                                                | Exact revision inspected                                                                                                                                | License                                                                        | Maintenance/contributor status                                                                  | Relevant modules/files                                                                | Architecture fit                                                                | Security concerns                                                                          | Integration cost                | Expected benefit                                            | Proposed boundary                                                       | Provenance requirements                                                              | Final classification                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Radix Primitives        | [`radix-ui/primitives`](https://github.com/radix-ui/primitives)                                       | Accessible dialogs, menus, selects, popovers, focus behavior           | [`f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae`](https://github.com/radix-ui/primitives/commit/f7ecd5ab16f5e1e820eb5786a1419a98a2d594ae)                    | MIT                                                                            | Active; July 2026 head; Vitest, Playwright and axe dependencies in root manifest                | Only required `@radix-ui/react-*` packages                                            | High for React 19; wrap under AIM primitives                                    | Supply-chain/version changes; accessibility still needs AIM journeys                       | Medium                          | Removes custom focus/ARIA plumbing                          | Frontend library only; no data access                                   | Pin versions; preserve license; dependency owner and upgrade tests                   | **SAFE CANDIDATE**                                    |
| shadcn/ui               | [`shadcn-ui/ui`](https://github.com/shadcn-ui/ui)                                                     | Copy/adapt accessible component recipes                                | [`a87a63b2ca25143d26c8bd0903e4e9bc77b3f824`](https://github.com/shadcn-ui/ui/commit/a87a63b2ca25143d26c8bd0903e4e9bc77b3f824)                           | MIT                                                                            | Active; commits 2026-09-16/17; formal security reporting                                        | `apps/v4/registry` selected components only                                           | High concept fit; generated code must be reconciled with AIM/Tailwind 3         | Copied code becomes AIM maintenance burden; transitive Radix deps                          | Medium                          | Faster consistent components without vendor runtime lock-in | Selective source copy behind AIM primitives                             | Record source path/SHA/license and local modifications per component                 | **SAFE CANDIDATE**                                    |
| Lucide                  | [`lucide-icons/lucide`](https://github.com/lucide-icons/lucide)                                       | Icons                                                                  | [`951813ce76a859d4d8b145366972cbb237147a4e`](https://github.com/lucide-icons/lucide/commit/951813ce76a859d4d8b145366972cbb237147a4e)                    | ISC; Feather-derived notice included                                           | Very active; three contributors in sampled commits on 2026-09-18/19                             | `packages/lucide-react`; required icons only                                          | High                                                                            | Low; icon semantics and bundle size                                                        | Low                             | Deletes AIM-maintained SVG path catalogue                   | Frontend dependency only                                                | Preserve ISC/derived notices; pin; tree-shake; visual regression                     | **SAFE CANDIDATE**                                    |
| ZXing browser           | [`zxing-js/browser`](https://github.com/zxing-js/browser)                                             | Browser camera/image barcode decoding                                  | [`9ad027d88d4533bd6d29f9d8d7e517e23cd361ff`](https://github.com/zxing-js/browser/commit/9ad027d88d4533bd6d29f9d8d7e517e23cd361ff)                       | MIT                                                                            | Maintained in 2026 but sampled commits are single-maintainer; package version 0.2.1             | `@zxing/browser`; `@zxing/library` peer                                               | Good bounded fit                                                                | Camera permission, malicious/oversized input, unsupported codes, maintenance concentration | Medium                          | Avoids implementing decoders; supports camera images/video  | Decode to untrusted string; AIM validates/matches/authorizes            | Pin exact package; license notice; SBOM; fuzz/size limits                            | **SAFE CANDIDATE with security controls**             |
| Workbox                 | [`GoogleChrome/workbox`](https://github.com/GoogleChrome/workbox)                                     | Service worker, precache, cache strategies, background sync primitives | [`4ea3138a120fd2c87389b54130e25f47e0fd7089`](https://github.com/GoogleChrome/workbox/commit/4ea3138a120fd2c87389b54130e25f47e0fd7089)                   | MIT                                                                            | Active September 2026; Aurora team ownership stated                                             | `workbox-precaching`, routing, strategies; background sync only after protocol design | Good for Next static/runtime caching; does not provide healthcare correctness   | Sensitive cache leakage, stale data, shared device, sync replay                            | Medium/high                     | Reliable PWA mechanics                                      | Cache public shell/static assets; no PHI response caching by default    | Pin modules; license; cache inventory; threat model and purge tests                  | **SAFE CANDIDATE for bounded caching**                |
| OpenTelemetry Collector | [`open-telemetry/opentelemetry-collector`](https://github.com/open-telemetry/opentelemetry-collector) | Receive/scrape/process/export metrics/logs/traces                      | [`ad799ab2a56389f796aaa4fbc97a360cb10dfa99`](https://github.com/open-telemetry/opentelemetry-collector/commit/ad799ab2a56389f796aaa4fbc97a360cb10dfa99) | Apache-2.0                                                                     | Very active; sampled commits from multiple contributors on 2026-09-18; mature CI/fuzzing links  | official distribution/config components                                               | Excellent: AIM already exposes Prometheus and OTLP/HTTP JSON                    | Telemetry exfiltration, insecure receivers/exporters, config injection                     | Medium                          | Deletes need for custom collector/retry/routing             | Separate internal service; allowlisted receivers/processors/exporters   | Pin image digest/version; license/NOTICE; config in repo; SBOM/CVE process           | **SAFE CANDIDATE**                                    |
| SigNoz                  | [`SigNoz/signoz`](https://github.com/SigNoz/signoz)                                                   | Self-hosted observability backend/UI                                   | [`ea8f95ee087c8bb4088703023e60222a1aedfe24`](https://github.com/SigNoz/signoz/commit/ea8f95ee087c8bb4088703023e60222a1aedfe24)                          | MIT outside `ee/` and `cmd/enterprise/`; enterprise license inside those paths | Very active; multiple contributors 2026-09-18/19; security policy present                       | community deployment excluding enterprise paths                                       | Good behind OTel; operationally heavy                                           | Split license, PHI/log ingestion, ClickHouse/retention/admin surface                       | High                            | Integrated dashboards/alerts/traces                         | Separate self-hosted service; sanitized telemetry only                  | Path-level license inventory, image/source pin, enterprise exclusion, legal approval | **REQUIRES LEGAL/LICENSING + SECURITY REVIEW**        |
| Apache Superset         | [`apache/superset`](https://github.com/apache/superset)                                               | Business intelligence dashboards                                       | [`43fee87672297d2217ad297b1e80042a4358074b`](https://github.com/apache/superset/commit/43fee87672297d2217ad297b1e80042a4358074b)                        | Apache-2.0; NOTICE                                                             | Very active; multiple contributors 2026-09-18/19; ASF security process                          | charts/dashboards against curated analytics views                                     | Poor against AIM OLTP; good against separate warehouse/read model               | Broad query engine, tenant escape, export/re-identification, admin complexity              | High                            | Avoids building commodity chart/dashboard editor            | Separate network and database principal; de-identified read-only schema | License/NOTICE, pinned release/image, config and plugin inventory                    | **SAFE ONLY BEHIND DE-IDENTIFIED ANALYTICS BOUNDARY** |
| Wazuh                   | [`wazuh/wazuh`](https://github.com/wazuh/wazuh)                                                       | Host/container threat detection and response                           | [`6513e55177cf46779bbc1bc61dbfe7d5d3eeca58`](https://github.com/wazuh/wazuh/commit/6513e55177cf46779bbc1bc61dbfe7d5d3eeca58)                            | GPL-2.0 with OpenSSL exception/project interpretation                          | Active September 2026; formal security policy                                                   | endpoint agents, manager, rules/decoders                                              | Separate infrastructure only                                                    | GPL distribution obligations, powerful agents, log sensitivity, operating burden           | High                            | Commodity endpoint/security monitoring                      | No application linkage; security events only                            | Legal review, pin packages/images, retain GPL notices/source obligations             | **REQUIRES LEGAL/LICENSING + SECURITY REVIEW**        |
| Open Source POS         | [`opensourcepos/opensourcepos`](https://github.com/opensourcepos/opensourcepos)                       | POS workflow reference                                                 | [`b610ae28acfad48728d38c09e1e1e311a2a309d8`](https://github.com/opensourcepos/opensourcepos/commit/b610ae28acfad48728d38c09e1e1e311a2a309d8)            | MIT                                                                            | Active September 2026; multiple maintainers; supported versions/security policy                 | sales/returns/tax/receipt UX only                                                     | Low code fit: PHP/CodeIgniter and generic retail model                          | Generic security and inventory semantics do not meet AIM safety boundaries                 | High if copied; low as research | Mature retail workflow vocabulary                           | Pattern study only                                                      | Cite inspected revision in design ADR; copy nothing without file-level review        | **REFERENCE ONLY**                                    |
| NodeDR POS              | [`Raktim94/nodedr-pos`](https://github.com/Raktim94/nodedr-pos)                                       | Offline-first counter, barcode, GST and printer workflow reference     | [`98e43e5f832043358a53cebdb5a9e299b0de4975`](https://github.com/Raktim94/nodedr-pos/commit/98e43e5f832043358a53cebdb5a9e299b0de4975)                    | AGPL-3.0-only                                                                  | Active August 2026; sampled work concentrated in one contributor; no root security policy found | frontend scan UX, ESC/POS deployment patterns                                         | Frontend technology similar; backend SQLite/single shop conflicts fundamentally | AGPL network-source obligation; no tenant/clinical safety; local HTTP/camera constraints   | High                            | Concrete scan/print/counter lessons                         | Pattern study only; independently implement AIM-native flow             | Record as design reference; do not copy code absent legal approval                   | **REFERENCE ONLY**                                    |
| ERPNext                 | [`frappe/erpnext`](https://github.com/frappe/erpnext)                                                 | ERP/procurement/hospital workflow reference                            | [`db6e0891099ab27f571b7b9697ba90f6573430f5`](https://github.com/frappe/erpnext/commit/db6e0891099ab27f571b7b9697ba90f6573430f5)                         | GPL-3.0                                                                        | Very active September 2026; formal security process                                             | stock, accounting, healthcare/procurement concepts                                    | Large incompatible Frappe/MariaDB application; V2 procurement candidate at most | Copyleft, massive coupling, parallel identity/tenant/accounting authority                  | Very high                       | Vocabulary and future integration reference                 | Future V2 external-system connector or reference; never AIM core        | Legal review, API contract/provenance if V2 integration proceeds                     | **REFERENCE ONLY / V2 REVIEW**                        |

---

## 15. Build-versus-reuse estimate

### Estimated distribution of remaining V1 engineering effort

| Category                               | Planning range | Normalized midpoint | What counts                                                                                                                                                                     |
| -------------------------------------- | -------------: | ------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct internal AIM reuse              |         30–35% |               32.5% | Existing auth, tenant/provider context, RBAC, audit, inventory/FEFO, reservations, event delivery, notifications, BFF, UI, localization and CI used without structural redesign |
| Direct external open-source reuse      |          5–10% |                7.5% | Radix/shadcn-derived primitives, Lucide, ZXing, Workbox mechanics, OTel Collector and separately operated commodity tools                                                       |
| Adaptation and integration             |         25–30% |               27.5% | Wrapping libraries, mapping contracts, operational deployment, privacy filters, offline conflict handling, analytics read models and AIM design-system integration              |
| Genuinely new AIM-specific engineering |         30–35% |               32.5% | POS/sale/payment/tax ledgers, returns/recall/disposal, dispensing/safety, clinical domains, lab chain of custody, consent/retention rules and release evidence                  |

### Methodology

This is an effort estimate, not a line-of-code estimate. Remaining capabilities were decomposed into:

1. reusable accepted platform/integrity work;
2. commodity mechanics available under an acceptable license;
3. integration work needed to make those mechanics safe in AIM;
4. domain semantics that AIM must design, own and certify.

The ranges reflect unresolved product/legal decisions and the fact that hospital, doctor and lab scope is documented but not decomposed into accepted specifications. The bounds are not independently additive; the midpoint scenario is normalized to 100%.

### Interpretation

About two-thirds of the remaining work can leverage existing AIM or mature commodity infrastructure, but that does **not** mean two-thirds can be copied. Most leverage appears as adaptation around AIM-owned rules. The irreducible third is where the healthcare, inventory and money risk lives.

---

## 16. Remaining V1 roadmap

The roadmap is split into a pharmacy-first release tranche and a later V1 healthcare-domain expansion tranche. Supplier/procurement expansion is removed to V2; predictive/AI work is removed to V3.

### Pharmacy-first release tranche

|     Task | Title                                                                            | Scope                                                                                                                                                                                                        | Dependencies                                                            | Reuse sources                                                                                                     | AIM-original work                                                                     | Database impact                                                               | Security/privacy impact                                                                        | Validation gates                                                                                                                                        | Complexity       |
| -------: | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **0042** | **Pharmacy Catalog, Barcode & Inventory Import Foundation**                      | Product identifiers/GTIN/EAN; manual + USB HID + camera lookup; CSV/XLSX staged import, mapping, dry-run, error export and idempotent apply; live UI for existing product/batch/adjustment APIs              | 0041 audit; accepted inventory/auth/audit/browser-permission boundaries | AIM product/config/batch commands, BFF contract pattern, permission dialog; ZXing for camera decode               | Canonical identifiers, duplicate/ambiguity policy, import staging/validation/receipts | Product identifiers, import job/row evidence, uniqueness/index migrations     | Camera least permission; malicious files; tenant/provider ownership; no silent stock overwrite | Migration/drift/populated upgrade; cross-tenant tests; malformed/duplicate import; camera/manual fallback; concurrency; exact-head CI                   | **Large**        |
| **0043** | **Pharmacy POS, Billing, GST & Invoice Transaction Core**                        | Cart, price/tax snapshot, FEFO stock commit, sale, payments, immutable invoice numbering, GST/HSN breakdown, receipt/reprint, void/correction—not clinical dispensing                                        | 0042 identifiers/catalogue; existing ledger/reservation                 | AIM FEFO, stock movements, idempotent commands, exact audit, outbox, BFF/UI; OSPOS/NodeDR workflow reference only | Sale/payment/invoice/tax state machines and reconciliation                            | Sale, line, payment, invoice, tax snapshot, command and event tables          | Financial fraud, tax correctness, session/operator attribution, tenant isolation               | Serializable concurrency; double-submit; reservation-to-sale; tax golden cases reviewed by qualified India tax/legal expert; audit; browser counter E2E | **Extra large**  |
| **0044** | **Inventory Exception Closure: Returns, Recall, Release & Disposal**             | Customer return/refund linkage, stock eligibility, supplier-return evidence only (not procurement), recall/quarantine release, disposal/destruction, reason/approval controls                                | 0043 for customer refunds; existing damage/quarantine/expiry            | AIM ledger, batch status/evidence, command IDs, audit/outbox                                                      | Safety state machines, approval policy, physical/economic consequences                | Return/refund links; recall/disposition/release evidence and constraints      | Critical patient safety, fraud, expired/contaminated stock re-entry                            | State-transition matrix; concurrency; quantity conservation; no unsafe restock; exact-user audit; regulatory review                                     | **Large**        |
| **0045** | **Compliance Closure: Retention, Legal Hold & Policy Enforcement**               | Data-class inventory, retention/deletion/anonymization, legal hold, consent consequences, policy decision boundary and operational evidence                                                                  | Current privacy/consent/audit; before new clinical PHI                  | AIM consent, audit, auth, workers, backup runbooks                                                                | Policy model, deletion workflows, holds, data-subject consequences                    | Policy/hold/job/evidence tables; deletion/anonymization migrations            | Critical PHI lifecycle; backup/restore consistency                                             | Legal/compliance review; denial and hold precedence; cross-tenant tests; restore/retention reconciliation                                               | **Extra large**  |
| **0046** | **Notification Operations & Pickup Handoff**                                     | Production scheduling/deployment for existing worker; pharmacy availability-request queue UI; pickup confirmation/identity evidence; new activity/timeline producers; bounded delivery handoff contract only | 0043 sale receipt linkage; existing worker/reservations                 | Existing queue/daemon/SMTP, patient inbox/timeline, reservations, OTel                                            | Scheduler/deployment, pickup proof, minimized address/contact boundary                | Pickup/handoff evidence; optional new notification source enums               | Recipient leakage, wrong-patient handoff, worker secret handling                               | Worker overlap/failure; provider-disabled behavior; no PHI logs; pickup authorization; runtime certification                                            | **Medium–large** |
| **0047** | **Pharmacy Profile & Verification UI Closure**                                   | Add pharmacy profile, verification submission/status and renewal UX over Task 0039 BFF; link existing staff/team controls                                                                                    | Task 0039/0040 already accepted                                         | Existing Task 0039 APIs/BFF/contracts and Task 0040 pages                                                         | UI only, help/error content, document-boundary decision                               | None unless document upload is separately approved; do not bundle it silently | Verification evidence privacy and misleading trust claims                                      | Contract/UI/accessibility/RTL/mobile tests; no reviewer/internal-note leakage                                                                           | **Small–medium** |
| **0048** | **Healthcare Workstation Design, Accessibility, Localization & PWA Resilience**  | Standardize interactive primitives/icons; counter keyboard/touch/mobile/RTL/dark mode; axe/Playwright; locale workflow/chunking; install/update shell; bounded offline draft queue with server revalidation  | 0042/0043 live counter flow                                             | AIM primitives/i18n/permission system; Radix, selected shadcn source, Lucide, Workbox                             | AIM tokens, workflow-specific UX, cache/offline safety protocol                       | Optional client-command metadata only; no alternate local database authority  | Shared-device caches, stale stock, accessibility exclusion, translation errors                 | WCAG/axe; keyboard/touch; RTL; bundle/perf; cache purge; offline/reconnect conflict; no offline final stock commit                                      | **Large**        |
| **0049** | **Production Telemetry, Security Monitoring & De-identified Analytics Boundary** | Deploy OTel Collector; select backend; alert routing; log/metric retention; incident drills; optional Wazuh; define separate de-identified BI read model, not dashboards-first                               | Existing metrics/runbooks; 0045 data policy                             | OTel Collector; optional SigNoz/Wazuh/Superset under review                                                       | Privacy filters, SLOs, data classification, operational ownership                     | Optional analytics projections/views; never BI writes to OLTP                 | Telemetry PHI leakage, admin surface, broad DB access                                          | E2E scrape/export; outage behavior; TLS/auth; data-minimization tests; alert drill; legal review of split/GPL tools                                     | **Large**        |
| **0050** | **Pharmacy-First Release Certification**                                         | Exact release artifact, migrations, security/privacy review, browser journeys, load/reliability, backup/restore/PITR evidence, rollback/canary, runbooks and controlled go/no-go                             | 0042–0049                                                               | Existing CI, recovery and runtime harnesses                                                                       | Final gaps and evidence only; no feature bundling                                     | Release ledger/compatibility metadata if approved                             | All high-risk boundaries                                                                       | Independent security review; real environment; recovery drill; incident/rollback drill; no critical findings                                            | **Large gate**   |

### V1 healthcare-domain expansion tranche

|     Task | Title                                                  | Scope                                                                                                                                                                          | Dependencies                                     | Reuse sources                                                         | AIM-original work                                                                 | Database impact                                                                        | Security/privacy impact                        | Validation gates                                                                                            | Complexity           |
| -------: | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| **0051** | **Provider-Domain Expansion Foundation**               | Hospital, clinic/doctor and laboratory provider types/profiles, verification, locations/departments and scoped staff boundaries; no clinical records yet                       | 0045 policy; existing provider/RBAC/verification | Tenant/provider/staff/audit/Task0039 state machine                    | Domain ownership, facility/professional distinctions, branch/department authority | Provider type expansion; facility/location/department/professional verification models | Cross-domain privilege and tenant leakage      | Migration/backfill; provider-type authorization matrix; exact-user audit; cross-tenant tests                | **Extra large**      |
| **0052** | **Appointments, Scheduling & Patient Coordination**    | Doctor schedules/leave, facility calendars, appointment request/confirm/cancel/complete, patient views, reminders/timeline                                                     | 0051                                             | Reservation lifecycle patterns, notifications/timeline, pagination/UI | Appointment availability/concurrency, practitioner/facility authority             | Schedule, slot, appointment, command/event tables                                      | Appointment PHI, double booking, enumeration   | Serializable booking races; consent; role matrix; notification privacy; mobile/a11y                         | **Extra large**      |
| **0053** | **Prescription & Clinical Note Integrity**             | Prescriber-authored versioned prescriptions and bounded notes; sign/amend/cancel; patient view; pharmacy read boundary; no AI diagnosis/recommendation                         | 0051, 0052, 0045                                 | Identity/RBAC/audit/consent/timeline/outbox                           | Prescriber authority, signatures/versioning, medication order semantics           | Prescription, item, amendment/signature, note/access evidence                          | Critical clinical safety and PHI               | Professional verification; immutable versions; access/consent; audit; clinical/legal review                 | **Extra large**      |
| **0054** | **Pharmacy Dispensing & Medicine-Alternative Safety**  | Link prescriptions/reservations/sales; pharmacist validation; partial/complete fills; substitution proposal and explicit pharmacist/patient evidence; OTC separation           | 0043, 0044, 0053                                 | FEFO/reservations/sales/audit/timeline/notifications                  | Dispense state machine and conservative alternative rules                         | Dispense/fill/substitution evidence and constraints                                    | Critical wrong drug/strength/form/patient harm | Clinical pharmacist review; dose/form/strength tests; race/idempotency; no autonomous recommendation        | **Extra large**      |
| **0055** | **Laboratory Orders, Samples, Results & Reports**      | Test catalogue, clinical order, accession/sample barcode, collection/rejection, result entry/review/release/amendment, critical-result evidence, patient report                | 0051, 0045; optional 0052/0053 links             | Barcode boundary, audit, notifications/timeline, provider/RBAC        | Chain of custody, result lifecycle and clinical release policy                    | Test/order/sample/result/amendment/report models                                       | Critical diagnostic PHI/safety                 | Sample identity; amendment history; reviewer authority; critical-result workflow; secure download           | **Extra large**      |
| **0056** | **Patient Cross-Domain Record & Timeline Convergence** | Consent-aware unified patient view for appointments, prescriptions, dispensing and lab reports; secure download/share/revoke; legacy reservation timeline remains source-based | 0052–0055                                        | Patient profile/activity/timeline/consent/audit                       | Record indexing, sharing and revocation consequences                              | Secure record metadata, grants, download/access evidence; object-store references      | Critical longitudinal PHI                      | Consent matrix; object authorization; malware scan; revocation; export/download audit; mobile/a11y          | **Extra large**      |
| **0057** | **Full V1 Multi-Domain Release Certification**         | Cross-domain security, tenant isolation, clinical safety, performance, recovery, operations and release approval                                                               | 0051–0056 plus pharmacy release controls         | Existing certification infrastructure                                 | Evidence and defect correction only                                               | Release metadata only unless defects require migrations                                | All V1 risks                                   | Independent clinical/security/privacy review; cross-domain E2E; disaster recovery; rollback; exact artifact | **Extra large gate** |

### Explicitly deferred

- **V2:** supplier/distributor workflows, purchasing/procurement expansion, advanced multi-location operations, delivery logistics beyond a bounded handoff contract.
- **V3:** forecasting, prediction, ML, AI assistants and advanced recommendations.

---

## 17. Work that can be deleted, combined or reduced

| Planned/likely work                                       | Action            | Evidence/rationale                                                                               | Work avoided                                                               |
| --------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Build separate inventory/reservation/search microservices | **Delete**        | Accepted modular monolith already owns these domains; scaffold services are health-only          | Duplicate auth, data ownership, transactions, deployment and observability |
| Build separate notification service                       | **Delete**        | Queue, worker, daemon, SMTP adapter, recipient resolver and evidence already run in auth-service | Entire duplicate notification architecture                                 |
| Rebuild Tasks 0036–0040                                   | **Delete**        | Implementations and tests are in authoritative tree                                              | Five redundant feature projects                                            |
| New pharmacy verification backend                         | **Delete**        | Task 0039 backend/BFF complete; only UI closure remains                                          | State-machine, migration and security duplication                          |
| Separate pharmacy staff model/workspace                   | **Delete**        | Task 0040 composes existing membership/provider-access authority                                 | Parallel identity/access source                                            |
| New patient medical timeline                              | **Delete**        | Extend `PatientTimelineEvent` with reviewed producers                                            | Second history store and UI                                                |
| New notification inbox per domain                         | **Delete**        | Extend `PatientNotification` with bounded source producers                                       | Duplicate read/unread models and pages                                     |
| Custom barcode decoder                                    | **Replace**       | ZXing is a bounded permissive library                                                            | Decoder algorithms and device compatibility maintenance                    |
| Custom service-worker framework                           | **Replace**       | Workbox handles commodity mechanics                                                              | Cache/version/sync boilerplate; AIM still owns policy                      |
| Custom icon catalogue                                     | **Replace later** | Lucide is permissive and active                                                                  | Hand-maintained SVG paths                                                  |
| Custom collector/retry/export routing                     | **Replace**       | OTel Collector is mature and protocol-native                                                     | Operational telemetry plumbing                                             |
| Custom BI dashboard builder                               | **Replace/avoid** | Current AIM analytics UI covers operations; Superset can later serve de-identified BI            | Chart editor/query builder ecosystem                                       |
| Full POS/ERP fork                                         | **Delete**        | Every inspected app conflicts with AIM authority, stack, licensing or tenancy                    | Long-term fork maintenance and safety regression                           |
| Full transactional offline database in browser            | **Reduce**        | Server remains stock/tax authority; offline draft + revalidation is safer                        | Conflict-heavy shadow ledger and false sales                               |
| V1 supplier/procurement milestone                         | **Move to V2**    | Explicit Task 0041 version boundary                                                              | Large non-launch domain                                                    |
| V1/V2 AI/forecasting work                                 | **Move to V3**    | Explicit Task 0041 version boundary                                                              | Premature model/data/governance program                                    |
| Separate frontend refactors per feature                   | **Combine**       | Common primitives, accessibility, localization and PWA cross-cut every page                      | Repeated migrations and inconsistent UI                                    |

---

## 18. Risk register

| Risk                                        | Likelihood                   | Impact      | Evidence/trigger                                                    | Mitigation                                                                                                                 | Owner/gate                                  |
| ------------------------------------------- | ---------------------------- | ----------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| License ambiguity                           | High for named leads         | High        | Several leads have no license; SigNoz is split-license              | No code reuse without immutable license evidence; legal review for GPL/AGPL/split license; provenance register             | Architecture + legal before dependency/copy |
| Abandoned dependency                        | Medium                       | High        | RetailPOS 2013; Pharraxz 2023; small single-maintainer projects     | Prefer active projects; pin; SBOM; exit plan; own adapters; quarterly review                                               | Dependency governance                       |
| Supply-chain compromise                     | Medium                       | Critical    | New frontend/infrastructure packages and container images           | Minimal dependencies; lockfile integrity; signed/digest-pinned images; SCA; provenance/SBOM; controlled updates            | CI/release gate                             |
| Security vulnerability in commodity service | Medium                       | Critical    | Superset/SigNoz/Wazuh expose large admin/query surfaces             | Private networks, SSO/RBAC, least-privilege DB, patch SLA, hardened config, security monitoring                            | Platform operations                         |
| Patient privacy leakage to telemetry/BI     | Medium                       | Critical    | Logs/traces/query tools may ingest payloads/identifiers             | Allowlist attributes; no bodies/raw URLs/IDs; de-identified read model; retention and access audit                         | 0045/0049                                   |
| Healthcare safety error                     | Medium                       | Critical    | Dispensing, alternatives, results and recalls are absent            | AIM-owned conservative state machines; qualified clinical review; human approval; immutable evidence                       | 0044/0053–0055                              |
| Tenant isolation failure                    | Low/medium                   | Critical    | New domains and external BI create new joins/access paths           | Composite FKs, trusted context only, DB-backed permissions, cross-tenant tests, separate analytics principal               | Every task gate                             |
| Inventory ledger corruption                 | Medium                       | Critical    | POS/return/offline paths will write stock                           | Serializable transactions, idempotency, conservation assertions, no offline final commit, reconciliation jobs              | 0043/0044                                   |
| Reservation/sale race                       | Medium                       | High        | Reserved stock may be sold/dispensed concurrently                   | One transactional allocation/consumption authority; lock order; concurrency certification                                  | 0043/0054                                   |
| Data migration/backfill failure             | Medium                       | Critical    | New identifiers, sales and clinical models                          | Additive migrations, nullable/backfill/check phases, populated-upgrade tests, backup/restore and rollback                  | Database gate                               |
| Architectural coupling to whole OSS app     | Medium                       | High        | POS/ERP projects bring own auth/data model                          | No full app reuse; adapters and service boundaries; pattern-only study                                                     | Architecture review                         |
| Performance regression                      | Medium                       | High        | Analytics, POS scan/search and timeline growth                      | Index/query plans, bounded pagination, load tests, caps, async projections                                                 | Performance CI                              |
| Offline stale/conflict behavior             | High if offline writes added | Critical    | No current sync protocol                                            | Cache public/static only by default; draft queue; expiry; server revalidation; visible conflict; encrypted minimal storage | 0048 safety gate                            |
| Localization error                          | Medium                       | High        | 20 listed languages are incomplete; clinical terms high risk        | Keep disabled until complete; glossary; human reviewer; placeholder/key parity; RTL/mobile tests                           | Localization owner                          |
| Accessibility failure                       | Medium                       | High        | Component coverage good but browser/axe coverage narrow             | Radix where useful; axe + Playwright; keyboard/touch/screen-reader review                                                  | 0048/release gate                           |
| Upstream breaking change                    | Medium                       | Medium/high | Rapidly moving React/UI/telemetry projects                          | Pin versions/revisions, adapter facade, changelog review, upgrade CI, rollback                                             | Dependency owner                            |
| Long-term fork burden                       | High for copied apps         | High        | POS/ERP code diverges from AIM                                      | No forks unless bounded and staffed; copy only small components with provenance                                            | CTO approval                                |
| Tax/invoice noncompliance                   | Medium                       | Critical    | GST/invoice logic absent; OSS claims are not legal authority        | Snapshot rules, immutable corrections, golden cases, qualified India tax/legal sign-off                                    | 0043 gate                                   |
| Provider verification overclaim             | Medium                       | High        | AIM verification is workflow approval, not government certification | Precise UI language, evidence limits, registry integration separately reviewed                                             | 0047/0051                                   |
| Production operations false confidence      | Medium                       | Critical    | Runbooks/metrics exist but no live collector/deployment             | Real environment certification, alert/incident/recovery/rollback drills; keep deployment freeze                            | 0049/0050/0057                              |

---

## 19. Recommended next task

### Task 0042 — Pharmacy Catalog, Barcode & Inventory Import Foundation

This is the highest-leverage next task because AIM cannot run a credible pharmacy counter if medicine and batch data must be entered manually one record at a time. Building POS first would hide bad catalogue data behind a faster interface.

Task 0042 should:

- extend the existing `Product` model with normalized identifiers instead of creating a parallel catalogue;
- support USB HID scanners as ordinary keyboard input with no browser permission;
- use the existing least-permission camera explanation flow before camera scanning;
- use ZXing only to decode; treat output as untrusted input;
- provide manual search/entry fallback;
- stage imports, show a dry-run, reject unknown columns and ambiguous products, and require an explicit authorized apply;
- call existing inventory configuration/batch/adjustment commands rather than writing stock directly;
- create immutable import receipts and exact-user audit;
- prove idempotency, tenant/provider isolation, duplicate behavior, malformed-file handling, quantity conservation and clean populated upgrade.

It should not include POS, billing, procurement, supplier workflows, delivery, prescriptions, AI matching or production deployment.

---

## 20. Evidence, commands and limitations

### Repository areas inspected

- all application/package manifests and lockfile dependency graph;
- accepted runtime module graph;
- Prisma schema and all migrations;
- backend controllers, services, repositories, DTOs, authorization guards and domain workers;
- frontend pages, BFF routes, workspaces, contracts, navigation and shared primitives;
- Tasks 0036–0040 source, migrations, tests and candidate records where present;
- localization catalogues, completeness logic, RTL behavior and audit script;
- PWA manifest and browser-permission boundary;
- metrics/exporter/logger/alert/runbook foundations;
- CI workflows, release freeze, backup/recovery and runtime certification;
- product roadmap, status overlays, ADRs, sprint records and historical audits;
- upstream repositories, immutable commits, license/security/readme/manifests for serious reuse candidates.

### Commands/checks actually executed

- Git verification: remote, fetch/ref/SHA/tree/status/worktree inspection; `git status --short`; `git rev-parse HEAD`; `git rev-parse HEAD^{tree}`.
- Static inventory: extensive `rg`, `find`, `sed`, `wc`, path/model/controller/route/test/migration enumeration.
- GitHub API: branch/commit verification; exact-head workflow runs; upstream repository search; commit, README, manifest, license and security-policy reads.
- `node --test scripts/backup-recovery.spec.mjs` — **34/34 passed**.
- `node scripts/brand-audit.js` — **0 blocking lines**; legacy names were classified as external contracts, history/migrations, stable identifiers or fixtures.
- `node scripts/browser-permission-boundary-check.mjs` — **passed**.
- Combined architecture/brand/browser/backup test attempt — backup/brand/browser checks ran, but `architecture-boundary-check.spec.js` could not load the missing local `typescript` package.
- `pnpm install --frozen-lockfile --offline` — supply-chain policy check passed for 1,226 entries, then installation stopped because current pnpm 11 ignored the repository's legacy `package.json#pnpm.overrides`, producing a lockfile configuration mismatch. No lockfile update or dependency change was made.
- `scripts/i18n-hardcoded-ui-audit.mjs` — not executable locally for the same missing TypeScript dependency.

### Limitations and unresolved evidence

1. The complete local test/build/migration suite was not rerun because dependencies were absent and frozen installation was blocked by the pnpm-version/override mismatch. Exact-head GitHub CI success is recorded separately and was not represented as local execution.
2. No application or PostgreSQL/Redis runtime was started; endpoint classifications combine source, migrations, tests and accepted CI evidence.
3. No untrusted third-party code was cloned, installed or executed.
4. Upstream security posture was assessed from current activity, manifests, tests/docs and security policies where present. This was not an exhaustive CVE, transitive dependency or container-image audit.
5. License classification is an engineering gate, not legal advice. GPL/AGPL, Unlicense, split-license and any production distribution decision needs qualified legal review.
6. “Studio POS” could not be resolved to one authoritative open-source repository. It is rejected rather than guessed.
7. `PRODUCT_ROADMAP.md` is broader than the current pharmacy runtime and older status files are stale. This report resolves the conflict by respecting the task's explicit V1/V2/V3 boundary and labeling hospital/doctor/lab as a later V1 expansion tranche.
8. Regulatory detail for India GST invoices, pharmacy dispensing, prescriptions, laboratory result handling, data retention and provider verification needs qualified legal/clinical review before implementation acceptance.

---

## Final CTO handoff (A–N)

**A. Verified AIM starting SHA**

`7ec50206d31e38f1e73c2f797f89d843bbeb6070`; authoritative tree `c867e449e98fa5d6e32368ade2e7b2df4a370373`.

**B. Repository areas inspected**

Applications, packages, schema/migrations, routes/DTOs/services/repositories, auth/RBAC/audit, web/BFF/UI, localization, tests, CI, deployment, observability, documentation and Tasks 0036–0040.

**C. Current V1 completion findings**

Strong platform, inventory, availability, reservation, patient and operational foundations; bounded Tasks 0036–0040 accepted. Full V1 remains materially incomplete because commerce/dispensing, offline reliability, compliance closure, production activation and hospital/doctor/lab workflows are open.

**D. Internal reuse findings**

The majority of remaining workflows should reuse AIM's identity, tenant/provider authority, audit, FEFO/ledger, reservations, outbox/inbox, notifications/timeline, BFF contracts, UI primitives, localization and CI.

**E. External reuse findings**

Use bounded commodity units: Radix/shadcn, Lucide, ZXing, Workbox and OpenTelemetry Collector. Treat SigNoz, Superset and Wazuh as isolated infrastructure with legal/security/privacy gates. Do not import a POS/ERP application.

**F. License/provenance findings**

Several named leads are unlicensed and unusable. NodeDR is AGPL, ERPNext GPL, Wazuh GPL, SigNoz split-license. A revision/path-level provenance register is mandatory.

**G. Remaining V1 gaps**

Catalog import/barcode, POS/cart/payments/GST/invoices, returns/recall/disposal, prescriptions/dispensing/alternatives, pickup/delivery boundary, retention/policy, complete accessibility/localization/PWA, production telemetry/security, clinical domains and release certification.

**H. Revised remaining roadmap**

Tasks 0042–0050 deliver and certify the pharmacy-first tranche. Tasks 0051–0057 add and certify the remaining documented V1 healthcare domains. Procurement moves to V2; prediction/ML/recommendations move to V3.

**I. Build-versus-reuse estimate**

Midpoint: 32.5% direct internal reuse, 7.5% direct external reuse, 27.5% adaptation/integration and 32.5% new AIM-specific engineering.

**J. Risks**

Highest risks are license ambiguity, PHI leakage, tenant isolation, stock/money corruption, clinical safety, offline conflicts, tax correctness and false production confidence.

**K. Recommended Task 0042**

Pharmacy Catalog, Barcode & Inventory Import Foundation.

**L. Files/reports created**

This report only. No repository implementation file was changed.

**M. Commands/tests actually executed**

Listed in §20. Local backup tests, brand audit and browser-permission audit passed; full local suite was blocked by the dependency-install mismatch; eight exact-head PR workflows were verified successful.

**N. Limitations/unresolved evidence**

Listed in §20. No production approval, legal opinion, clinical certification or real-data authorization is implied.

---

**Task 0041 result: COMPLETE — audit and CTO handoff only. No Task 0042 implementation was created.**
