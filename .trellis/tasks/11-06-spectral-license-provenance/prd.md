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
