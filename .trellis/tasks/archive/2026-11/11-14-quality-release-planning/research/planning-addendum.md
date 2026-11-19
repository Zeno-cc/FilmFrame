# Planning addendum — operator experience and evidence completeness

This adds missing considerations to `recommendation.md`; it does not change the six workstreams' overall order. Planning only, no implementation.

## Corrected artifact boundary

- A timed-out strip must never be published or treated as a valid partial result. Preserve already accepted single-frame artifacts and any previous strip only as stale, non-downloadable evidence. Late Worker responses must not replace newer state.

## Operator and user workflows

1. **High-budget upgrade block:** show the actual limit and a safe action: keep the current release, adjust the budget deliberately through the existing admin workflow, or follow a documented manual release. Explain whether an update downloaded artifacts and whether anything switched. Do not present a dead end or suggest silently lowering a value.
2. **Rollback block/recovery:** specify who can release/retry the held lock, which state is retained, how to verify the running version, and what to do if the host updater itself is the failing component. The recovery action must not depend on updating through the same broken path.
3. **Heavy strip timeout:** expose that rendering stopped rather than silently substituting a result. Offer a deliberate retry and preserve the user's source roll, transforms, settings and accepted single-frame output. Do not force a settings/backend change, lose work or show a generic memory failure when the cause is known.
4. **Perceived performance:** when frames complete incrementally, present truthful progress rather than a fake percentage. A user should be able to leave/stop safely without the main thread repeating the same work.

## Compatibility and accessibility

- Cover mobile/keyboard/screen-reader announcements for long operations, error/recovery actions and disabled current downloads.
- Test mobile browsers, low-memory/CPU devices and background-tab throttling; elapsed-time timeout policy must be evaluated against suspension and real device behavior, not only desktop benchmarks.
- Check touch target sizes, focus restoration and that blocking errors don't strand the user in a modal. Existing restrained darkroom controls should be reused rather than adding a new error system.

## Release and operational evidence

- Preserve privacy in benchmark/bug reports: no real photo bytes, EXIF, identifiers or settings beyond a redacted test fixture.
- Ensure log/metrics/performance attachments do not become an unexpected telemetry or distribution path.
- Produce complete corresponding-source/build evidence for the exact commit, not a source archive that omits large spectral resources, lockfiles, export tools or required source notices.
- Test old and new updater transitions, including updater failure/restart and current-link preservation. Do not rely on a green health check that omits actual runtime-config readability.

## Scope guardrails

- Do not broaden cleanup into renderer redesign, global styling changes or speculative platform migrations.
- Do not remove intermediate source assets before checking their offline/manual generation dependencies; distribution exclusion is safer than deletion.
- Track license/provenance as a release gate with an owner, not a warning that automated tooling can pass by itself.
- Performance comparisons should use a named hardware/browser class and clearly separate desktop from physical-device results.

## Suggested acceptance additions

- Every failure path has a recoverable user/admin action and preserves the current valid work.
- No stale/partial artifact can be downloaded as current; no duplicate heavy main-thread work starts after timeout.
- Current running release and lock state are inspectable after a blocked upgrade/rollback.
- Desktop and physical mobile evidence are separately labeled, and release evidence maps exactly to the distributed commit/assets.
