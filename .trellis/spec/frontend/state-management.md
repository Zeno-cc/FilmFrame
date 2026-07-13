# State Management

> State ownership and lifecycle conventions used by FilmFrame.

## Overview

FilmFrame uses React state only. There is no global store, router state, or server cache. `App.tsx` owns the page session and sends controlled props and commands to presentation components. Pure service functions derive statuses, signatures, transforms, and admission decisions.

## State Categories

- **Session domain state:** `images`, `settings`, output mode, recipes, current strip artifact. Owned by `App.tsx`.
- **Transient UI state:** open dialog/sheet, preview selection, drag state, notices, local crop draft. Owned by the nearest component that coordinates it.
- **Derived state:** included images, pending counts, workflow status, current artifact validity. Compute with pure helpers; do not persist separately.
- **Persistent preferences:** only the normalized FilmSettings whitelist and local recipes in `localStorage`. Never persist files, Blob URLs, transforms, or rendered artifacts.
- **Async ownership state:** generation IDs, active/queued image IDs, and refs to latest state prevent late tasks from overwriting newer state.

## Update Patterns

- Treat arrays and domain objects as immutable. Merge async image results by stable `id`, not by captured array index.
- Preserve the latest ordering and additions while a batch runs. `mergeImageTaskResult` and generation checks are the reference behavior.
- Revoke replaced, deleted, rejected, or unmounted Object URLs at the ownership boundary.
- A result is current only when MIME and its stable settings key match current state. A URL alone is not proof of validity.
- Selection is session-only. `getIncludedStripImages` preserves each image's original roll position so frame numbering may intentionally skip excluded frames.

```ts
setImages(current => mergeImageTaskResult(current, imageId, generation, result));
```

## Global and Server State

- Do not introduce a global state library for the current single-page workflow.
- There is no server state. Images remain local to the browser and disappear on refresh.
- Promote state above a component only when two sibling surfaces need the same authoritative value or command.

## Common Mistakes

- Replacing the whole image array with an async snapshot.
- Keeping both a source value and a second synchronized copy when it can be derived.
- Revoking the current artifact as soon as settings change; stale artifacts remain owned until replacement/removal, but cannot be downloaded as current.
- Persisting `filmOverlayUrl` or other runtime URLs.
- Renumbering selected strip images instead of retaining full-roll positions.
