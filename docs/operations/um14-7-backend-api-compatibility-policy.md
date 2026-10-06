# UM14.7 Backend/API Compatibility Runbook

## Policy

Configure `AIM_MIN_API_GENERATION` and `AIM_MAX_API_GENERATION` as bounded positive integers. The interval is inclusive.

Example rollout: minimum `7`, maximum `8` permits generations 7 and 8 while generation 8 adoption proceeds. Do not raise the minimum merely to force routine refreshes; UM14.4/UM14.5 govern web update requirements.

## Failure behavior

- missing/malformed client generation: HTTP 426;
- generation below minimum: HTTP 426;
- generation above maximum: HTTP 426;
- absent/malformed/reversed server policy: HTTP 503;
- supported generation: request may continue to the normal authentication, tenancy, authorization and domain checks.

Compatibility never substitutes for those checks.

## Raising the minimum

Before retiring an old generation, confirm the applicable release gates, adoption/operational evidence, update path and rollback readiness. A security-driven forced update must additionally follow the emergency-update controls when those are accepted under UM14.12.

## Rollback

If a newly introduced generation is defective, restore the previously accepted compatibility window together with the normal release rollback. Never widen the window to a generation whose contract is not known to be compatible.
