# Third-Party Provenance and Distribution Readiness

This directory records the approved open-source reuse route for the SpektraLab integration. It does **not** claim that FilmFrame is ready to distribute a GPL-derived build.

## Current Status

**Public distribution is blocked pending the items below.** Local prototype work may continue only with pinned sources and retained notices; no push or deployment is implied.

```bash
npm run verify:provenance
```

The command validates the manifest schema and every listed local SHA-256 digest, rejecting symlinked files and resolved paths outside the repository. It then prints distribution blockers. A zero exit status means the inventory is internally consistent, **not** that legal review or public release has passed.

## Decisions and Responsibilities

- On 2026-11-06 the owner approved reuse under **GPL-3.0-or-later** for covered/derived code and **CC BY-SA 4.0** for the original spektrafilm measured profiles/LUTs and their direct derivatives.
- `manifest.json` pins upstream revisions, local transformations, attribution and local digests. It distinguishes code, profiles, spectral constants, tests, images and dependencies. `localPaths: []` means that no corresponding local bytes have been imported; documentation is not a substitute for an imported-data digest.
- A global license does not clear independent assets. Do not label all bundled resources GPL or CC merely because the project adopts GPL.
- These are engineering risk controls, not legal advice. Owner/legal review is required for uncertain copyright and combined-work distribution questions.

## Blockers Requiring Action

1. **FilmFrame historical images:** archived tasks establish that the film borders were user-provided generated artwork and geometrically normalized locally. They do not establish generator/tool, source inputs or redistribution permission. Confirm ownership/license or replace the affected templates and their derivatives. See `asset-inventory.md`.
2. **Spectral constants:** the original profile CC BY-SA notice does not prove separate permission for every Hanatos/observer/illuminant constant. Before public redistribution, record source-specific terms or replace with appropriately licensed independently sourced standards data. Every prototype import must add a pinned source/digest entry.
3. **Project rights and corresponding source:** the current repository has no root license and cannot be presumed cleared for GPL relicensing. After resolving existing code/asset rights, add the approved GPL license/copyright notices and publish the exact corresponding source/build instructions for each distributed build.
4. **Runtime dependency distribution:** `heic-to` 1.5.2 is pinned to npm `gitHead f37af866f9aa6212ddc84b67a279c9f2386aba4f`; its license text is included. Review and document LGPL application/combined-work source, relinking and notice requirements. Other direct/transitive runtime dependencies also require a distribution inventory before release.
5. **Credits surface:** when derived resources ship, provide accessible human-readable attribution and licenses in the application/help UI. Do not use SpektraLab branding, icons, covers, fonts or imply endorsement.

## Required Release Evidence

- [ ] All manifest entries have `rightsStatus: "verified"` with supporting evidence; no unresolved spectral data.
- [ ] `projectDistribution.rightsStatus` is verified and the corresponding-source location/status is ready.
- [ ] Exact source commit and reproducible build instructions are available to recipients.
- [ ] Original CC BY-SA license text is retained; `PROFILE-CHANGELOG.md` identifies every modification/derivative.
- [ ] Third-party dependency notices and an in-app credits route are shipped and checked.
- [ ] `npm run verify:provenance`, the normal release gate and human rights review pass.

Do not bypass this review by putting the engine behind a service or converting code to another language. Photo-local processing protects privacy but does not change software/asset distribution obligations.
