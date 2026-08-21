# Release Design — FilmFrame v1.4.12

## Boundary

This release changes only versioned release metadata and Git history needed to
publish the already verified candidate. It does not add product behavior.

## Release Path

```text
current candidate → ordinary integration into latest origin/main
                  → synchronized 1.4.12 metadata → pre-tag gates
                  → canonical-main commit → annotated v1.4.12 tag
                  → GitHub Actions Release → GitHub Release / manifest / bundle / images
```

The candidate must be proven to descend from a freshly fetched `origin/main`
immediately before tagging. If `main` is protected, the ordinary PR path is the
integration mechanism; force-pushes and history rewrites are not permitted.

## Release Contract

- `package.json`, `server/access/package.json`, and
  `ops/release/release-input.json` all carry exactly `1.4.12`.
- `npm run check:release` remains the reusable pre-tag gate.
- The tag is annotated, immutable, and names the exact canonical-main commit.
- Publication is successful only when the tag workflow creates the GitHub
  Release with its canonical manifest, deploy bundle, and versioned GHCR images.

## Physical-Device Gate

The frontend release contract requires iPhone Safari and Android Chrome smoke
tests before tag authorization because this candidate changes browser image and
Canvas paths. On August 21, 2026, the user explicitly approved a release-only
waiver. It does not silently reclassify desktop/browser automated coverage as a
substitute.

## Failure / Rollback Shape

Before the tag is pushed, failures stop the release and can be corrected on the
branch. After a tag workflow begins, never move, delete, or recreate the tag.
If publication fails after tagging, report the workflow evidence and create a
new patch release only after the cause is resolved.
