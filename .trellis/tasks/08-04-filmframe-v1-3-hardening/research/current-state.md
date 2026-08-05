# v1.3 Current-State Evidence

## Verified Baseline

- Production runs FilmFrame v1.2.0 at revision
  `fa2f3125ad9cfccfa8e76cffbb73ad37fbf7afab` with Access schema 4.
- The trusted v1.2.0 Release completed the repository quality gates, including
  166 frontend tests, 81 Access tests, 40 Chrome Playwright tests, proxy E2E,
  backup checks, release contracts, container builds, and attestations.
- Production update job `43f47ad9-228a-4411-86ef-95c5bcd71934` completed with
  state `succeeded`; both services reported healthy after cutover.

## Repository Gaps

1. `.github/workflows/release.yml` does not invoke the updater Python tests or
   `ops/updater/tests/test-install-layout.sh`.
2. `playwright.config.ts` defines only a Chrome project.
3. `services/renderBudget.ts` uses 700 MiB for estimated single-Canvas RGBA
   bytes. The value is hard-coded and the Access database, administration page,
   and public FilmFrame host currently expose no runtime-settings contract.
   Upload warnings and operation-level working-set/ZIP limits are separate
   contracts.
4. `App.tsx` contains pure render-admission helpers alongside React lifecycle
   and artifact ownership.
5. `services/filmEngine.ts` combines browser Canvas mechanics with film drawing
   policy and main-thread fallback rendering.

## Interpretation Rules

- A local test failure caused by concurrent dev servers, unavailable socket
  binding, or a mismatched native Node module is not evidence of a v1.2.0
  regression. The trusted Ubuntu Release result is the authoritative baseline.
- Desktop WebKit automation is not physical iPhone Safari evidence.
- A numeric Canvas estimate is a guardrail, not a guarantee that every browser
  or device can allocate that amount.
- The existing administration host is the correct ownership boundary for a
  global render-budget write. The public application needs only a
  session-protected, exact-path read; it must not receive administrator or
  invitation records.
- Code extraction is successful only when ownership and behavior become clearer;
  fewer lines alone are not an acceptance criterion.
