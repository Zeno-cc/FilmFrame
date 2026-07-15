# Implementation Plan

## Ordered Work

1. Normalize the 11 unique source images with their measured apertures into the shared runtime contract.
2. Validate dimensions, RGB format, exact black aperture, and non-black outer edges; visually inspect a contact sheet for stretched/cropped markings.
3. Add URL constants and registry mappings in `services/filmOverlay.ts`.
4. Expand `tests/filmOverlayTemplates.test.ts` to assert complete registry coverage.
5. Expand `tests/filmWorkerClient.test.ts` to assert every flattened stock remains on the main thread.
6. Parameterize `tests/e2e/frontend-redesign.spec.ts` for the 11 new single/strip workflows.
7. Update `public/film-overlays/README.md`, `docs/project/rendering.md`, `docs/project/architecture.md`, `docs/project/file-map.md`, and `README.md`.
8. Run focused tests, then the full quality gate and representative browser visual checks.

## Validation Commands

- `npm run test -- tests/filmOverlayTemplates.test.ts tests/filmWorkerClient.test.ts`
- `npm run check`
- `npm run test:e2e`
- `git diff --check`

## Risk Controls

- Do not infer one source aperture from another; use the measured mapping in `prd.md`.
- Use only one byte-identical T-MAX 400 input.
- Force output to RGB PNG and explicitly blacken only the target aperture.
- Do not modify Gold Worker policy or the shared aperture constants.
- If a single asset fails visual QA, remove only its registry mapping and reprocess that source.
