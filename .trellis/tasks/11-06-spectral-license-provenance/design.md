# Design: GPL and asset provenance

## Boundary

The user approved GPL-3.0-or-later and CC BY-SA 4.0 reuse on 2026-11-06. This child builds the rights/notice/provenance record and identifies owner decisions. It does not claim unverified historical assets are cleared and does not implement the spectral renderer.

## Data Contract

Use a versioned manifest with source repository/URL, pinned commit, upstream path, local path where imported, SHA-256, author/copyright holder, SPDX or explicit unresolved status, modifications and notice location. Distinguish source code, measured profiles/LUTs, spectral constants, test baselines, existing FilmFrame artwork/fonts and dependencies.

Every uncertain entry remains a release blocker. GPL project adoption is recorded as the approved direction, but adding a license file does not retroactively grant rights to third-party FilmFrame templates or other bundled works.

## Deliverables

- License texts and factual attribution for SpektraLab/spektrafilm; CC modification changelog.
- Third-party provenance manifest plus validator covering required fields, digest/path consistency where local assets exist, unresolved statuses and release-blocking behavior.
- Inventory of all current runtime images/templates/masks/fonts/icons and origin evidence in git/docs where available; unresolved means unresolved, not presumed free.
- Dependency/license review including existing `heic-to` LGPL boundary.
- Owner-facing unresolved-rights register and corresponding-source/distribution checklist; public release remains blocked until cleared.

## Coordination

Main agent owns the global manifest and license-child artifacts. Prototype agent supplies exact imported-resource records through its own task artifacts; merge them after completion rather than concurrently overwriting the global manifest.
