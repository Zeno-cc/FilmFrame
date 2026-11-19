# Implementation plan

- [ ] Record a baseline **on the current working tree** (not HEAD, not a stash; `spectralAdapter.ts` / `strip.ts` / `canvas.ts` already carry uncommitted work). Build `createPhysicalRaster` for physical-135 single-frame and strip plans at `physicalStraighten: 0` and `1.5`, and store digests of `presence` / `backing` / `filmBase` / `wall`. The script must live inside the repo so module resolution works.
- [ ] Remove the `换一台` / `换一格` buttons and their `grid grid-cols-2` container from `RecipeInspector`.
- [ ] Remove the `physicalFrameSeed` / `onPhysicalFrameSeedChange` props from the component signature and call site, plus the `nextPhysicalSeed` import.
- [ ] Remove the `App.tsx` wiring: the two props passed to `RecipeInspector`, the `onPhysicalFrameSeedChange` handler, and its write-back into `images`.
- [ ] Re-run the baseline comparison; the four digests must match exactly for every case. Additionally assert `git diff --name-only` touches only the expected UI files, so a rendering change cannot hide behind a self-fulfilling digest comparison.
- [ ] Rewrite the two button-driven e2e cases rather than only deleting them: keep their panel coverage (齿孔背光 / 拉直 / 边缘灰雾 / 片轴漏光 interaction and the local-preference round trip) in a case that does not press the removed buttons. Deleting them outright would drop the only browser-level coverage of those controls and the only assertion that seed values reach saved preferences.
- [ ] Add an assertion that the panel exposes no seed controls (`换一台` / `换一格`) and that the surrounding layout still renders.
- [ ] Confirm no other test depended on the removed UI; `physical135Raster` / `physical135Plan` / `physical135Stocks` / `renderResult` / `settingsStorage` exercise seed behaviour at the function level (83 tests verified green) and stay untouched.
- [ ] Check `.trellis/spec/frontend/spectral-rendering.md` for wording that implies a user-switchable seed.

## Validation

```bash
npm run check:all
npm run test:updater
npm run test:release-contract
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx playwright test tests/e2e/physical135.spec.ts --project=chromium
git diff --check
```

Do not run Docker, deploy, commit or push. Playwright's bundled headless Chromium reports SwiftShader as the unmasked renderer and the spectral backend rejects software renderers, so real Chrome via `CHROME_PATH` is required for the WebGL2 cases.

## Scope discipline

This task deletes UI. It does not change rendering, keys, seed derivation or persistence. Any temptation to add positional seed derivation is out of scope: measured behaviour shows `frameSeed` has zero pixel effect at the default `physicalStraighten: 0`, and non-zero straightening is protected by an existing seam-continuity contract that must not be weakened for a control the user asked to remove.

## Known product consequence to report

A user who previously saved a custom `physicalBodySeed` keeps that value and its roll texture, but can no longer adjust it; the only route back is the global reset. Say this plainly in the handoff rather than implying the setting vanished.

## Completion evidence

**Scope delivered.** The two seed buttons (`换一台` / `换一格`) and their props, wiring and `images` write-back branch are gone. No rendering path, render key, seed derivation or persistence format changed.

**Why no positional derivation.** A measured isolation experiment (same frame index, only `physicalFrameSeed` varied, 831,250 `presence` samples via `createPhysicalRaster`) showed the seed has *zero* pixel effect at the default `physicalStraighten: 0`, because `plan.ts:29` and `:44-46` return the identity mapping when straightening is zero, and continuous strips take their material seed from `bodySeed` (`canvas.ts:108`, `spectralAdapter.ts:31`). At `1.5°` the same comparison differs in 26,220 samples, which is exactly the path protected by the seam-continuity contract in `tests/physical135Raster.test.ts`. Adding derivation would therefore have been a no-op by default and a contract break otherwise.

**Zero pixel change, proven.** A raster digest baseline was captured on this working tree *before* the edit and re-run after it (`research/raster-baseline.mts`, `research/raster-baseline-before.json`). Six plans — strip indices 0/1/2 at `physicalStraighten` 0 and 1.5 — produced byte-identical digests for `presence`, `backing`, `filmBase` and `wall`. `git diff --name-only` contains only the expected UI files plus pre-existing uncommitted work.

**Verification.**

| Check | Result |
| --- | --- |
| `npm run check:all` | frontend **331 passed / 38 files**, Access **121 passed, 0 failed**, build succeeded |
| `npm run test:updater` | 69 passed, 1 skipped |
| `npm run test:release-contract` | 22 passed |
| `npx tsc --noEmit` | clean |
| `git diff --check` | clean |
| Real-Chrome `tests/e2e/physical135.spec.ts` | **12/12 passed**, 6.1 min |
| Panel inspection | 0 seed buttons; 齿孔背光 / 镜头光圈 / 拉直 / 边缘灰雾 / 片轴漏光 all present and functional; screenshot shows no layout gap |

**Existing flake, not caused by this change.** `tests/physicalSpectralSession.test.ts > disposes an owned session when preparation fails before rendering` fails under the default parallel Vitest run and passes in isolation and with `--no-file-parallelism` (331/331). It was reproduced with this change stashed, so it predates this task. It does not involve seed fields.

**Pre-existing test rewrite.** The two button-driven e2e cases were rewritten rather than deleted: one keeps the full panel interaction and preference round trip without pressing the removed buttons, the other asserts the controls stay absent while the photo selection changes and that stored seed values survive in preferences.

**Product consequence.** A user who previously saved a custom `physicalBodySeed` or `physicalFrameSeed` keeps that value and its rendering, but can no longer adjust it; the only route back to defaults is the global reset. The picker is gone, the value is not surfaced anywhere.

**Not verified.** Physical iPhone/Android devices and live OpenResty/Access proxy — unchanged by this task. No commit, push, deployment or release.
