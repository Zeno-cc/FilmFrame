# Design: Complete release pipeline and HEIC import

## Integration topology

The child tasks remain the ownership boundaries. The parent adds only sequencing and cross-child review:

~~~text
release workflow contracts + reusable CI gate
                  ↓
local HEIC/HEIF upload integration
                  ↓
fresh remote main ancestry check
                  ↓
ordinary fast-forward/protected-branch delivery (only if safe)
~~~

The final arrow is a delivery decision, not an instruction to mutate refs during implementation. The current request explicitly excludes release/tag/deployment publication and physical-device testing.

## Child boundaries

- Canonical-main child owns .github/workflows/release.yml ancestry enforcement, release-tooling contract tests, and maintained release-process documentation.
- Pre-tag child owns package.json gate composition, .github/workflows/ci.yml, trusted tag workflow gate reuse, release contract tests, updater gate wiring, and focused Worker fallback tests.
- HEIC child owns the heic-to/csp dependency, local conversion service, upload File-role split, App input wiring, upload tests, documentation, and any portable Chromium fixture/test.
- Parent owns no product code and should not duplicate child tests. Its verification is the cross-child artifact review plus final repository/ref boundary review.

## Cross-child contracts

### Release gate contract

The trusted tag workflow keeps tag-specific repository/ref/tag/HEAD and exact release-input checks before dependencies. It then runs one reusable npm run check:release gate before bundle/image/manifest/Release operations. The PR/main workflow runs that gate with read-only permissions and stops before all publication steps.

### Renderer contract

HEIC conversion produces an ordinary browser-decodable File before the existing Worker capability predicate. Therefore the Worker fallback child does not need an HEIC branch, and HEIC integration must not alter Worker messages, Canvas budget calculations, or fallback cancellation semantics.

### Privacy contract

HEIC conversion is a local Blob operation. The existing same-origin requests for app assets/runtime configuration remain the only network activity relevant to the photo workflow. No child may add a photo-bearing request or persistent storage.

### Git lineage contract

The final integration candidate is selected only after both product/automation children pass their checks. A fresh fetch determines whether origin/main is an ancestor; the stale local tracking ref is not sufficient. If ancestry fails, no push or tag action occurs.

## Verification layers

1. Validate each child manifest and planning artifact before activation.
2. Implement/check each child independently in the documented order.
3. Run cross-child release contract tests and the reusable desktop gate after integration.
4. Run git diff --check and inspect that no version/ref/publication/device artifacts changed.
5. At the separate delivery decision, fetch the live remote and use ancestry/fast-forward checks only; stop on divergence.

## Compatibility, rollout, and rollback

- The release guard affects future stable-tag runs whose workflow commit includes it; it cannot retroactively govern historical tags whose workflow did not contain the guard.
- PR/main CI consumes time and read-only runner resources but does not broaden publication permissions.
- HEIC adds a material first-use browser dependency and an LGPL-3.0 review obligation; it remains opt-in by file type and does not change existing formats.
- Before any main delivery, normal commits can correct workflow/upload behavior. After a fast-forward delivery, use ordinary revert/fix commits; never rewrite remote history or move stable tags.
