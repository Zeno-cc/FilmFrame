# Quality and release remediation

## Goal

Implement the reviewed, engineering-owned parts of the six-area quality plan while preserving user work, existing recipes, local-only photo processing and explicit distribution decisions.

## Scope

- Verify actual render-budget compatibility before upgrade and automatic rollback; fail closed without silently changing configuration or reporting false success.
- Prevent duplicate heavy-strip rendering after timeout, cancellation or terminal rendering errors; never publish partial strips or discard valid user work.
- Perform bounded, tested development-tool upgrades without forced audit fixes or unsupported version combinations.
- Remove only verified zero-consumer code and local generated metadata; do not delete historical assets or change their rights status.
- Measure actual 10/20/36-frame CPU/WebGL2 strips where admission allows, record constraints and choose only evidence-supported follow-up changes.
- Preserve distribution/owner decisions for licensing, historical assets, GPL/LGPL and public release.

## Acceptance Criteria

- [x] Rollback/upgrade compatibility checks reject unreadable target configurations before switching, preserve the lock/current version and provide actionable recovery behavior.
- [x] Worker strip timeout cannot trigger a duplicate main-thread strip or publish a partial artifact; normal quick failures retain intended fallback behavior.
- [x] Development dependencies are upgraded in a compatible validated set, or an evidence-backed blocker prevents unsafe partial upgrade.
- [x] Verified dead code/local metadata is removed without breaking active rendering, access or public-component contracts.
- [x] Local performance evidence records actual backend, timing, memory/resource proxies, failures and pixel correctness; no unsupported optimization is presented as completed.
- [x] Full frontend/access/operations checks, relevant production/development browser workflows and independent review pass for the resulting tree.
- [x] No Docker, deployment, public release, license change, historical asset deletion, commit or push is performed without explicit authorization.
