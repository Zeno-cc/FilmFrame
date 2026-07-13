# Hook Guidelines

> React hook usage in the current application.

## Current Pattern

The project does not maintain a custom-hooks directory and does not use React Query, SWR, or a server-state layer. Hooks are used directly in `App.tsx` and interactive components. Stateful logic becomes a custom controller/service only when it has an independent lifecycle, such as `createPreviewRenderController`.

## Hook Rules

- Use `useState` for session UI and workflow state owned by the current component.
- Use `useMemo` only for derived collections or signatures that are expensive or require stable identity; do not mirror derivable state into another state variable.
- Use `useCallback` for commands passed through component boundaries or used by effects.
- Use `useRef` for DOM focus targets, latest async state, generation counters, and resource ownership. Examples in `App.tsx` include `imagesRef`, `settingsRef`, and `stripResultRef`.
- Effects must return cleanup for event listeners, timers, Worker clients, controllers, and Object URLs.
- Keep effect dependency arrays honest. If an async workflow intentionally reads the latest state through a ref, make that ownership explicit.

```tsx
useEffect(() => {
  imagesRef.current = images;
}, [images]);

useEffect(() => {
  return () => previewControllerRef.current?.dispose();
}, []);
```

## Custom Stateful Logic

- Do not create a hook merely to shorten a component. Extract when logic has a reusable React lifecycle and a clear API.
- Pure calculations belong in `services/`, not in hooks. `createCoverPlacement`, `evaluateBatchAdmission`, and `getImageWorkflowStatus` are examples.
- Non-React controllers expose explicit methods and cleanup (`render`, `dispose`) and are owned by one component.

## Data Fetching

- There is no application server data. Runtime fetches are limited to same-origin overlay assets and reading generated Blob URLs.
- Do not add a data-fetching library for local files or static assets.
- Browser async work must preserve fallback and cleanup behavior, especially Worker-to-main-thread rendering.

## Common Mistakes

- Capturing stale image/settings arrays inside long-running render tasks.
- Starting expensive rendering on every pointer movement; crop changes are committed or debounced.
- Omitting cleanup because the component normally remains mounted.
- Using an effect to enforce a capability without also normalizing the setting at storage and command boundaries.
