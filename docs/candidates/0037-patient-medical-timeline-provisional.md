# Task 0037: patient medical timeline

This patch is based on `1c6b91d0f55960ba626eaecea1cf6baecc2836e8` and requires review before merging. It adds a patient-scoped, read-only timeline projection. It is not an electronic health record or a substitute for the source reservation data.

`PatientTimelineEvent` stores a bounded title and summary, source identity, occurrence time, and optional internal destination. The authenticated patient's global user ID scopes every read. `(sourceType, sourceEventId)` is unique for idempotent ingestion. The visible timeline currently records medicine reservation creation and status transitions; appointment, prescription, and other clinical events need their own reviewed producers. Existing historical reservations are not backfilled by this patch.

The patient route `/patient/timeline` uses the existing patient layout and has a dashboard entry. Reservation destinations link to `/patient/medicines#reservations`; unknown and unsupported destinations have no link. The API and BFF reject unexpected identity and query parameters and return no source metadata to the browser.

The migration follows the latest accepted schema migration. Validate it with a real PostgreSQL database before deployment; local schema validation and in-memory tests do not apply SQL migrations.
