# Directory Structure

> The actual frontend organization used by FilmFrame.

## Overview

FilmFrame is a single-page React application without a `src/` directory or router. The root `App.tsx` is the workflow controller. UI is grouped by feature under `components/`; browser and rendering logic lives in `services/`; shared domain types live in `types.ts`.

## Directory Layout

```text
App.tsx                  # session state, workflows, URL ownership, composition
types.ts                 # shared domain enums and interfaces
components/
  app/                   # shell, header, session meter, global menu
  workspace/             # contact sheet, photo cards, strip stage and ordering
  settings/              # recipe inspector and responsive settings surfaces
  preview/               # preview dialog and crop entry points
  feedback/              # errors, notices and support dialog
  mobile/                # fixed mobile actions
  ui/                    # reusable primitives only
  icons/                 # project-owned SVG icon components
services/                # rendering, storage and pure workflow helpers
styles/
  tokens.css             # semantic design tokens
  base.css               # document-level rules
  components.css         # application component classes
tests/                   # Vitest unit tests
tests/e2e/               # Playwright browser journeys
public/film-overlays/    # runtime film template assets
docs/                    # plans and maintained project documentation
```

## Module Organization

- Keep orchestration and browser side effects in `App.tsx`; do not duplicate workflow decisions in leaf components.
- Put reusable business calculations in a focused `services/*.ts` module. Examples: `services/batchAdmission.ts`, `services/renderTransform.ts`, and `services/workflowState.ts`.
- Put feature presentation in the matching `components/<feature>/` directory and export its public surface from that directory's `index.ts`.
- Use `components/ui/` only for domain-neutral controls such as `Button`, `ModalSurface`, and `SegmentedControl`. Film-specific behavior belongs in feature components.
- Add unit tests beside the service surface in `tests/<service>.test.ts`; add complete user journeys to `tests/e2e/frontend-redesign.spec.ts` or a new focused E2E spec.
- Runtime assets belong in `public/`; generated source/intermediate assets must not be added there because Vite publishes the whole directory.

## Naming Conventions

- React component files and exported components use PascalCase: `PhotoCard.tsx`, `RecipeInspector`.
- Service modules, helpers, variables, and callbacks use camelCase: `batchCuration.ts`, `getIncludedImages`, `onToggleIncluded`.
- Test names describe behavior, not implementation: `changing the included subset marks a generated film strip stale`.
- Use barrel files only at component directory boundaries. Services are imported directly by filename.

## Reference Modules

- `components/workspace/PhotoCard.tsx`: feature component with explicit workflow props.
- `components/ui/ModalSurface.tsx`: reusable accessible primitive.
- `services/batchCuration.ts`: small pure domain helper module.
- `services/filmWorkerClient.ts`: browser capability facade with main-thread fallback.

## Avoid

- Do not add a router, state framework, or new directory layer for a local feature.
- Do not move rendering policy into JSX or visual components.
- Do not create a generic abstraction until it removes real duplication or matches an existing project boundary.
