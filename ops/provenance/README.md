# Third-Party Provenance and Distribution Readiness

This directory records the approved open-source reuse route for the SpektraLab integration, the notices a distributed build must carry, and the provenance questions that remain unresolved.

## Current Status

**The owner authorized public distribution on 2026-11-20.** Every rights question with a documented basis is recorded as `verified`; the remaining upstream-data questions are recorded as an owner-accepted risk and stay visible in the validator output. See `../NOTICE`, which ships with every build.

```bash
npm run verify:provenance
```

The command validates the manifest schema and each listed local SHA-256 digest. It rejects symlinked files, resolved paths outside the repository, and unapproved distribution blockers. For an unresolved entry to pass, its ID must be listed in the dated residual-risk section of the root NOTICE and its evidence must cite that decision date. The command still reports these unresolved entries for human release review.

## Decisions and Responsibilities

- On 2026-11-06 the owner approved reuse under **GPL-3.0-or-later** for covered/derived code and **CC BY-SA 4.0** for the original spektrafilm measured profiles/LUTs and their direct derivatives.
- On 2026-11-20 the owner instructed public distribution of the 1.5.0 build and accepted the residual upstream data risk listed below. That decision is recorded in `../NOTICE`, in `manifest.json` `projectDistribution.notes`, and in the evidence field of each residual entry. It is a distribution decision, not a rights verification.
- `manifest.json` pins upstream revisions, local transformations, attribution and local digests. It distinguishes code, profiles, spectral constants, tests, images and dependencies. `localPaths: []` means that no corresponding local bytes have been imported; documentation is not a substitute for an imported-data digest.
- A global license does not clear independent assets. Do not label all bundled resources GPL or CC merely because the project adopts GPL.
- These are engineering risk controls, not legal advice.

## Resolved Before Distribution

1. **Project rights and corresponding source:** `LICENSE` carries the unmodified GPL-3.0 text, `NOTICE` carries the copyright and attribution statements, and the canonical repository publishes the corresponding source of each tagged build together with the build instructions (`README.md`, `server/access/README.md`, `ops/updater/README.md`).
2. **FilmFrame historical images:** the film-edge templates, layer masks, sprocket masks and the support payment image are project-authored artwork supplied by the owner, who licenses them under the project license. The per-file derivation history stays in `asset-inventory.md`.
3. **Runtime dependency distribution:** the production inventory is four packages — react and react-dom (MIT), exif-js (MIT) and `heic-to` 1.5.2 (LGPL-3.0-or-later, shipped unmodified as a separate module). Its license text is retained at `licenses/heic-to-LGPL-3.0.txt` and the corresponding library source is the published npm package at `gitHead f37af866f9aa6212ddc84b67a279c9f2386aba4f`.
4. **CC BY-SA retention:** the original profile license text is retained verbatim and `PROFILE-CHANGELOG.md` identifies every modification and derivative.
5. **Credits surface:** the in-app "来源与许可" dialog lists each source, its license and the retained license texts, and states that the list does not by itself clear every asset. SpektraLab branding, icons, covers and fonts are not used.

## Residual Risk Recorded With The Distribution Decision

These entries stay `unresolved` in `manifest.json` and keep appearing in the validator output. Replacing the affected data with independently sourced standards data is the tracked follow-up in tasks `11-06-spectral-license-provenance` and `11-11-spektralab-full-stock-migration`.

1. **Spectral constants:** the original profile CC BY-SA notice does not prove separate permission for every Hanatos/observer/illuminant constant.
2. **Portra setup derived tables and product monochrome derived tables:** derived tables that inherit those constants or come from product profile work whose redistribution terms were not independently confirmed.
3. **CineStill spatial model:** translated GPL code whose independent numerical verification is still open.

## Required Release Evidence

- [x] `projectDistribution.rightsStatus` is verified and the corresponding-source location/status is ready.
- [x] Exact source commit and reproducible build instructions are available to recipients.
- [x] Original CC BY-SA license text is retained; `PROFILE-CHANGELOG.md` identifies every modification/derivative.
- [x] Third-party dependency notices and an in-app credits route are shipped and checked.
- [x] `npm run verify:provenance`, the normal release gate and the recorded owner decision are in place.
- [ ] All manifest entries have `rightsStatus: "verified"` with supporting evidence; no unresolved spectral data. **Not claimed:** the residual upstream data items are distributed under the recorded owner acceptance instead.

Do not bypass this review by putting the engine behind a service or converting code to another language. Photo-local processing protects privacy but does not change software/asset distribution obligations.
