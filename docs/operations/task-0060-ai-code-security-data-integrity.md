# Task 0060 — AI-Code Security & Data-Integrity Gate

## Purpose

Task 0060 treats AI-assisted and other high-risk AIM changes as untrusted until repository-controlled security and data-integrity evidence passes.

ADR-035 supersedes ADR-032's human-review-only approval semantics. Independent human approval remains preferred, but an authorized solo maintainer may use a tightly bounded independently evidenced path when no reviewer is available.

## Non-waivable automated controls

Every dedicated Task 0060 workflow run retains:

- locked dependency installation;
- production dependency audit at moderate-or-higher severity;
- first-party GitHub CodeQL JavaScript/TypeScript analysis;
- Task 0060 policy/unit/repository-boundary tests;
- change-aware hard-fail scanning for configured secrets, unsafe raw SQL, runtime execution, TLS disabling, destructive migration operations, and other configured rules.

Passing Task 0060 never waives AIM's normal lint/test/build, clean migration/drift, populated-upgrade, runtime, backup/recovery, performance, network, or release-certification controls.

## Approval paths

### Preferred: independent human review

A high-risk pull request passes the review requirement when a reviewer other than the author, who is not a bot, has a latest submitted review state of `APPROVED`.

### Solo-maintainer path

The policy currently authorizes the repository maintainer listed under:

`approval.soloMaintainer.authorizedMaintainers`

The solo path requires:

1. the exact PR head SHA already has a Task 0060 GitHub workflow run;
2. at least 12 hours have elapsed from the earliest GitHub-hosted workflow run for that exact head;
3. the head has not changed;
4. the authorized maintainer posts exactly:

```text
AIM-SOLO-REVIEW: <40-character-head-sha>
```

5. the comment's GitHub server timestamp is after the cooling period;
6. the issue-comment event reruns Task 0060 on that exact head;
7. all automated security controls pass.

A new commit creates a new head SHA. The prior attestation then stops matching and cannot satisfy the gate.

## Why workflow-run time is used

Local Git commit timestamps are author-controlled. The cooling period therefore uses GitHub Actions workflow-run creation time as independent platform evidence. The PR comment timestamp is also supplied by GitHub.

## Commands

Focused Task 0060 validation:

```bash
pnpm test:ai-code-security-gate
```

Change-aware gate:

```bash
node scripts/ai-code-security-data-integrity-gate.mjs diff \
  --base <base-sha> \
  --head <head-sha> \
  --author <pr-author> \
  --reviews <reviews-json> \
  --comments <issue-comments-json> \
  --runs <workflow-runs-json>
```

## Failure interpretation

- `Hard security failure`: the change contains a configured non-waivable unsafe addition.
- `cooling-off period is still active`: leave the exact head unchanged until the reported timestamp.
- `exact-head solo attestation required`: after cooling, post the exact `AIM-SOLO-REVIEW: <head>` comment.
- `PR author is not an authorized solo maintainer`: independent human approval is required unless governance explicitly adds that maintainer.
- CodeQL/dependency/policy-test failures must be fixed; attestation cannot override them.

## Transition bootstrap

The ADR-035 migration has a one-time exact-base and exact-file waiver because the old Task 0060 rule cannot independently approve its own replacement in a repository with no second human reviewer. The waiver expires and becomes unusable as soon as the authoritative base advances.

## Repository enforcement note

The authoritative branch currently has no GitHub branch protection/ruleset enforcing required checks server-side. Task 0060 therefore produces strong evidence but cannot technically prevent a repository administrator from manually bypassing it. Server-side required-check enforcement should be configured when repository settings/access permit it.

## Out of scope

- claiming automated analysis proves clinical correctness;
- replacing qualified security/privacy/compliance review;
- weakening Task 0050 production-release evidence;
- allowing hard-fail findings through solo attestation;
- using a second account controlled by the same person as "independent" review.
