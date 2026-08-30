# Task 0009 — App-wide language system

## Objective

Unify authenticated and browser language preferences, expose only translation-complete UI
locales, support a real RTL locale, and prevent mixed-language or session-breaking rollout
behavior.

## Deliverables

- catalog-derived locale completeness gate;
- English, Tamil, and Urdu as the audited selectable UI locales;
- authenticated preference restoration across devices;
- server/client locale and direction agreement on initial render;
- same-origin persistence with integrity-protected session-profile synchronization;
- migration-safe handling of existing English, Hindi, Tamil, Telugu, and Kannada preferences;
- strict public error contracts and no upstream error reflection;
- frontend, backend DTO, package, RTL, persistence, and session compatibility tests; and
- app-wide language architecture documentation.
- reproducible semantic hardcoded-UI audit in the architecture gate;
- catalog-driven operational workspaces and accessible UI labels; and
- signed-out reopening persistence without coupling locale to an organization.

## Acceptance criteria

- An incomplete locale cannot be selected or newly persisted.
- Existing signed sessions without a language field remain readable and default to English.
- Existing known but incomplete preferences remain readable without rendering mixed-language UI.
- Login responses require a bounded known language value.
- Authenticated preference wins over local storage and browser preference.
- The initial server and client render agree for authenticated LTR and RTL locales.
- A successful Settings save updates both durable backend state and the live UI without a
  duplicate persistence request.
- Required formatting, lint, tests, build, and exact-head CI pass before merge.

## Status

Rebased implementation is local-only. The semantic hardcoded-English audit reports 0 unexplained
user-facing literals, but the task is not acceptance-ready until the final complete validation
run passes and a clean candidate commit is reported for publication authorization. It has not
been published or merged.
