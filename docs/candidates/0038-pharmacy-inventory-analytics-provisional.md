# Task 0038: pharmacy inventory analytics

This patch is based on `1c6b91d0f55960ba626eaecea1cf6baecc2836e8` and requires review before merging. It provides an assigned provider's read-only operational snapshot at `/inventory/analytics`.

The endpoint reuses the existing inventory read permission and provider assignment check. It reports product availability, reservations, expiry, quality, transfer counts, and a bounded near-expiry attention list. Counts are database aggregates; the list is capped at 50. This is a near-real-time snapshot across separate reads, so concurrent stock changes can produce small differences between metrics.

Available quantity follows the existing inventory stock projection: only active, unexpired batches count. The endpoint returns no patient names, reservation subjects, batch details, or tenant identifiers. The frontend uses the accepted staff layout and an assigned-provider selector.

The unit, BFF, and UI suites exercise permissions and numerical boundaries. A real PostgreSQL run remains necessary to validate raw aggregate SQL against the full schema before deployment.
