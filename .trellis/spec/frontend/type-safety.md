# Type Safety

> TypeScript conventions used by FilmFrame.

## Overview

The project uses strict TypeScript with browser DOM types and no runtime schema library. Shared domain contracts are declared in `types.ts`; service-specific result and dependency types stay with their module.

## Type Organization

- Put cross-feature domain types in `types.ts`: `FilmSettings`, `ImageItem`, `RenderTransform`, output modes, and film enums.
- Keep local component props beside the component.
- Keep service-specific result unions and dependency injection types in the service (`BatchAdmissionResult`, `WorkerRendererDependencies`).
- Use string literal unions and enums for finite behavior instead of unbounded strings.
- Use `import type` when an import is type-only.

## Validation

- Validate untrusted browser/storage values explicitly with allowlists, finite-number checks, clamps, and enum sets.
- Normalize at boundaries. `normalizeRenderTransform` clamps focus/zoom and quarter turns; settings storage normalizes persisted preferences.
- File acceptance requires MIME allowlisting plus successful image decoding and safe natural dimensions.
- Canvas and ZIP limits are checked before allocation/read, not after failure.

```ts
export type QuarterTurn = 0 | 1 | 2 | 3;

export interface RenderTransform {
  focusX: number;
  focusY: number;
  zoom?: number;
  quarterTurns: QuarterTurn;
}
```

## Common Patterns

- Discriminated unions describe workflow states and admission outcomes.
- Dependency objects make Worker and browser lifecycle code testable without weakening production types.
- `Partial<Record<FilmType, string>>` represents explicitly supported real-135 templates.
- Optional fields support backward-compatible preferences/session objects; normalize before use rather than spreading assumptions.

## Avoid

- Do not add `any` to bypass a cross-layer contract. Define the request/result type or narrow `unknown`.
- Avoid broad type assertions. Existing Canvas/OffscreenCanvas assertions are compatibility debt, not a pattern to extend.
- Do not duplicate `ImageItem` or `FilmSettings` subsets as ad hoc objects across modules.
- Do not trust `File.type`, localStorage JSON, DOM measurements, or decoded dimensions without runtime checks.
- Do not use non-null assertions unless the control flow has just established the invariant and a clearer guard is impractical.
