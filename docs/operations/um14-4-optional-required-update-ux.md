# UM14.4 — Optional-versus-Required Web Update UX

## Purpose

UM14.4 classifies a waiting web/PWA release as either deferable or required without weakening UM14.3 safe activation.

## Release configuration

Normal release:

```text
AIM_WEB_UPDATE_MODE=optional
AIM_WEB_UPDATE_REASON=routine
```

A non-critical security release may also be optional:

```text
AIM_WEB_UPDATE_MODE=optional
AIM_WEB_UPDATE_REASON=security
```

Required security release:

```text
AIM_WEB_UPDATE_MODE=required
AIM_WEB_UPDATE_REASON=security
```

Required incompatible release:

```text
AIM_WEB_UPDATE_MODE=required
AIM_WEB_UPDATE_REASON=incompatible
```

The generator rejects unknown values, `required/routine`, `optional/incompatible`, and required mode without an explicit reason.

Do not place CVE descriptions, exploit detail, credentials, database URLs, patient information, organization information, or arbitrary free-text messages in these values.

## Runtime flow

1. UM14.3 discovers a waiting service worker.
2. The page sends `GET_RELEASE_POLICY` to that waiting worker using a dedicated message port.
3. The worker responds with `AIM_RELEASE_POLICY` and only its bounded release identity/mode/reason.
4. While policy is resolving, the defer action is withheld.
5. Optional policy shows **Later** and **Update now**.
6. Required policy omits **Later** and keeps the update notice persistent.
7. **Update now** still sends `SKIP_WAITING`.
8. AIM reloads only after `controllerchange`.

A legacy/malformed worker that does not return valid policy falls back to optional behavior after the bounded response timeout.

## Security boundary

UM14.4 is a UX/release-classification control, not the final compatibility enforcement layer.

It does not:

- reject backend requests from unsupported clients;
- define a minimum supported version;
- revoke sessions or tokens;
- expose vulnerability details;
- authorize automatic reload;
- change the Task 0059 cache boundary.

UM14.5 owns minimum-supported-client enforcement.

## Validation

```bash
pnpm --filter @medsphere/web test
pnpm test:architecture
pnpm test:network-efficiency-boundary
pnpm --filter @medsphere/web build
```

The web package test command also runs the release-marker Node tests, which validate the allowed update-mode/reason combinations and secret-free marker output.
