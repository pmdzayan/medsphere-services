# V1 App-Wide Language System

## Status

Task 0009 is rebased on the accepted Task 0010 source. The operational workspaces are catalog
driven and the reproducible hardcoded-English audit reports no unexplained user-facing literals.
Publication remains blocked until the complete local certification suite passes and the owner
authorizes publication.

## Supported UI boundary

The language selector exposes only locales whose current audited V1 catalog is complete:

- English (`en`)
- Tamil (`ta`)
- Urdu (`ur`, right-to-left)

The registry contains 23 planned V1 India-language locale codes: `en`, `as`, `bn`, `brx`, `doi`,
`gu`, `hi`, `kn`, `ks`, `kok`, `mai`, `ml`, `mni`, `mr`, `ne`, `or`, `pa`, `sa`, `sat`, `sd`,
`ta`, `te`, and `ur`. The other 20 remain recognized preferences but are not selectable until
their full UI catalogs pass the same completeness gate. A signed legacy session remains valid
and renders English rather than producing a mixed-language interface.

## Preference precedence

The web application resolves a locale in this order:

1. verified authenticated session profile;
2. a same-site, non-sensitive locale cookie for server-rendered signed-out reopening;
3. local browser storage;
4. browser language preference; and
5. English.

The root layout applies the resolved locale to the initial server-rendered `lang` and `dir`
attributes. The client provider uses the same locale on its first render to avoid a language or
direction hydration flash. Locale state is user/browser scoped and independent of the selected
organization. Organization selection, navigation, refresh, and signed-out reopening do not
reset it.

## Persistence and security

- Authenticated changes use the existing same-origin language BFF and self-only backend API.
- The client cannot supply a user, tenant, membership, or organization identity.
- Successful updates reseal the integrity-protected session profile with the existing refresh
  credential; forged or stale profile data is cleared rather than trusted.
- Public failures use stable bounded codes and never reflect upstream exception text.
- Preference persistence is best effort and never blocks the already-safe local UI change.
- The locale cookie contains only an allowlisted language code; authentication and tenant state
  remain in their existing protected boundaries.

## Completeness gate

English is the source catalog. A non-English locale is selectable only when every current
translation key has a real override. Tests cover completeness, RTL behavior, preference
precedence, persistence, session migration safety, strict request/response parsing, and the
backend DTO allowlist.

Adding a new translation key automatically makes a locale incomplete until the matching
override is supplied. Adding another selectable locale requires updating both the frontend
complete-locale contract and `@medsphere/i18n`'s enabled UI language set with tests.

All enabled catalogs consume the same key and placeholder schema. Missing non-English keys fall
back to English at lookup time, while the production selector refuses any locale with a missing
key. That prevents a selectable language from silently dropping healthcare or security copy.

Feature catalogs share the same `translate` and `LanguageProvider` contracts. Privacy/permission
controls (Task 0013) and workstation-lock UI (Task 0014) must add keys to these catalogs; they do
not get separate English-only translation paths.

See `docs/i18n/v1-hardcoded-english-audit.md` for the reproducible static-copy classification and
dynamic backend-content boundary.

## Out of scope

This task does not claim completed translations for the remaining Indian languages,
machine-translated clinical or catalog data, locale-specific external notification content, or a
new translation management service. Tamil and Urdu have complete application key coverage, but
their linguistic and clinical quality has not been independently certified.

Operational workspace chrome and messages are not out of scope. Any remaining direct English in
those user-facing surfaces is an acceptance blocker, not an allowed fallback for an enabled
locale.
