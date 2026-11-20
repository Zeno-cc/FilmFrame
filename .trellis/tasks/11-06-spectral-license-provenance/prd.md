# Prepare GPL and film-asset provenance for spectral integration

## Goal

Make the approved open-source reuse route auditable before a FilmFrame build containing SpektraLab/spektrafilm-derived code or resources is publicly distributed.

## Parent and Dependencies

- Parent: `.trellis/tasks/11-06-integrate-spektralab-negative/prd.md`.
- Decision: on 2026-11-06 the user accepted GPL-3.0-or-later and CC BY-SA 4.0 reuse.
- Required before public distribution of the spectral integration; a local/private controlled prototype must still preserve source notices and avoid unapproved third-party assets.
- This task does not decide copyright ownership or provide legal advice; unresolved rights are surfaced for the project owner.

## Requirements

- R1: Record pinned source revisions, copyright holders, license texts, copied/modified files, and modification history for all reused code, measured profiles, LUTs, and spectral constants.
- R2: Adopt the GPL-3.0-or-later license and corresponding-source/distribution notices appropriate to the resulting covered work after the owner resolves FilmFrame's existing code/asset rights.
- R3: Preserve CC BY-SA 4.0 attribution/share-alike for the original measured profiles and direct derivatives, including Andrea Volpato, the canonical spektrafilm URL, change indication, and a separate profile/LUT changelog.
- R4: Inventory FilmFrame's current 16 film templates, layered masks, fonts, icons, photos and other bundled visual resources; identify creator/source/license or explicitly mark them unresolved.
- R5: Review third-party runtime/build dependencies and compatibility, including existing LGPL `heic-to`; do not assume one global license clears differently licensed assets.
- R6: Provide human-readable credits in project documentation and an accessible application/license surface when derived resources ship; do not use SpektraLab branding or imply endorsement.

## Acceptance Criteria

- [ ] A machine-readable provenance manifest maps every redistributed third-party file/data blob to pinned source, digest, author, license, local modifications, and notice location.
- [ ] GPL-3.0-or-later text and source attribution are present for derived code; release documentation explains how recipients obtain the exact corresponding source.
- [ ] Unmodified CC BY-SA profile license text and a separate modifications changelog accompany every reused/derived profile/LUT.
- [ ] Spectral constants have explicit source/license evidence or are replaced by independently sourced, appropriately licensed standards data; unresolved provenance blocks distribution.
- [ ] Every existing FilmFrame template/mask/font/image has documented permission/provenance or is excluded/replaced before public distribution; an owner-approved record resolves each exception.
- [ ] Third-party dependency notices and an in-app/help credit entry are available without collecting photos or adding network processing.
- [ ] `npm run check` and focused release/provenance validation pass; review confirms no SpektraLab trademark/asset with unclear rights is shipped.

## Out of Scope

- Implementing the spectral renderer, UI or physical film edges.
- Uploading photos or contacting external processing services.
- Treating generated user photos as CC BY-SA; the upstream profile notice explicitly leaves finished photographs to their authors.
- Declaring unresolved historical assets legally cleared without owner evidence.

## Evidence

- Parent research: `../11-06-integrate-spektralab-negative/research/spektralab-negative-pipeline.md` and `spektralab-film-edge-and-licensing.md`.
- SpektraLab pinned `02d82b56cf65f0f8e802a708612edc4e9a4790af`; upstream spektrafilm pinned `3bb2c2d2801ff68b92019cf1dbcbb133d60832bc`.
- `README.md:202-204` currently records that FilmFrame has no license and warns against assuming code/asset reuse permission.

## Release outcome (2026-11-20)

`v1.5.2` is published as a GitHub Release (tagged commit `a69cbb6`, container images and deploy bundle pinned by digest with attested provenance). Resolved before distributing:

- Root `LICENSE` carrying the unmodified GPL-3.0 text and `NOTICE` with project attribution, upstream revisions, dependency inventory, corresponding-source instructions and the residual risk.
- `projectDistribution.rightsStatus` verified and `correspondingSource.status` ready: the canonical repository publishes the source of each tagged build plus the build instructions.
- Owner-supplied film templates, layer masks, sprocket masks and the payment image recorded as project artwork licensed by the owner; `heic-to` recorded with retained LGPL text and pinned upstream source; the CC BY-SA derived tables verified with retained license text and `PROFILE-CHANGELOG.md`.

Still unresolved, and deliberately NOT marked verified (this is the residual the owner accepted on 2026-11-20, and `npm run verify:provenance` prints it for every build):

- `spektrafilm-spectral-constants` — the hanatos spectral-upsampling coefficients have no source-specific terms.
- `portra-setup-derived-tables`, `product-monochrome-derived-tables` — derived tables that inherit that data or come from product profile work with unconfirmed redistribution terms.
- `cinestill-spatial-model` — translated GPL code whose independent numerical verification is still open.

Remaining work: replace the affected constants with independently sourced standards data, or obtain source-specific permission, then verify the entries and withdraw the acceptance.
