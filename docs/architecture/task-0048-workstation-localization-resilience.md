# Task 0048 Workstation Localization and Resilience Contract

Task 0048 hardens AIM's healthcare workstation without changing healthcare authority.

## Localization workflow

- English is the source catalogue.
- Tamil and Urdu remain the only non-English locales enabled for the complete application until every production key has a reviewed translation.
- A new user-facing key must land with English, Tamil and Urdu values in the same pull request.
- Placeholder names and semantics must remain identical across complete locales.
- RTL behavior is certified in a real browser using Urdu.
- Clinical, legal, tax, safety and trust wording requires human review before a new locale may be marked complete. Machine translation alone is not sufficient release evidence.
- Feature catalogues remain independently owned files and are composed by the central i18n registry. This keeps review scope bounded without permitting mixed-language production UI.

## Workstation interaction contract

- Shared buttons, inputs, selects and checkboxes expose keyboard focus and at least a 44px-class touch target.
- Decorative icons never enter the focus order.
- System, light and dark appearance preferences are presentation-only and may be stored locally because they contain no healthcare or identity data.
- Reduced-motion behavior remains mandatory for animated workstation surfaces.
- Mobile and RTL journeys must not create horizontal overflow or unnamed controls.

## PWA cache contract

- Cache Storage is limited to versioned Next.js static assets, the web manifest and the public icon.
- API requests, navigations, authenticated pages and healthcare records are never service-worker cached.
- The update protocol may activate a waiting worker only after an explicit operator action.
- Cache purge applies only to AIM public-static caches.

## Offline POS contract

Offline POS is a draft-resilience feature, not an offline transaction engine.

The browser may keep a bounded, short-lived, memory-only draft containing only provider id, product ids, quantities, place-of-supply state code and payment method. It must not persist recipient identity, reservation ids, pickup proofs, payment references, cash amounts, fiscal overrides, idempotency keys, invoices or healthcare records.

On reconnect, every product line must be re-quoted against the authoritative server. Stale quantities are reduced and surfaced as a conflict; ineligible, hidden, unavailable or prescription-required items fail closed. Revalidation never auto-submits checkout. The operator must review and explicitly submit a new online server-authoritative sale.

The architecture gate in `scripts/offline-draft-boundary-check.mjs` prevents durable browser storage or transaction execution from being added to the offline helper without failing CI.
