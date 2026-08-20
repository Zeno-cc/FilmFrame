# Implementation plan: Local HEIC and HEIF import

## Ordered checklist

1. Add heic-to 1.5.2 to the root dependencies and update the root lockfile; do not alter the Access service dependency tree.
2. Add services/heicConversion.ts using the heic-to/csp entry, candidate detection, first/main-still selection, fixed JPEG quality 0.95, original-name preservation, and a narrow conversion error boundary.
3. Update services/uploadFiles.ts types and orchestration so input/original and render File roles are explicit, conversion precedes preview URL allocation, and existing dimension/EXIF/warning/error behavior remains intact.
4. Inject the conversion callback in App.tsx, update the file input accept value, and keep the original File available to the existing EXIF callback.
5. Extend tests/uploadFiles.test.ts for HEIC and HEIF success, original-versus-render File routing, converted dimensions/warnings, per-file conversion failure, URL cleanup, and unchanged unsupported-format rejection.
6. Add a small portable HEIC fixture and a Chromium E2E path for input, preview, and develop if the pinned browser/dependency combination can decode the fixture reliably. If it cannot, record the browser-fixture limitation as deferred and keep the injected service tests authoritative for orchestration.
7. Update README.md, docs/project/product-workflows.md, and any maintained dependency/privacy note that lists supported input formats or local processing boundaries.
8. Run focused tests, then typecheck/build and the relevant desktop Playwright coverage. Do not run iPhone, iPad, Android, or other physical-device testing.

## Validation commands

~~~bash
npm run test:upload
npm run typecheck
npm run build
npx playwright test tests/e2e/<heic-import-spec>.spec.ts --project=chromium
git diff --check
~~~

If the fixture is portable, include the HEIC E2E in the normal browser suite; otherwise report the deferred fixture explicitly and do not substitute a mocked device result.

## Review gates

- heic-to/csp is used; no CSP relaxation or remote conversion path appears.
- The original File reaches EXIF lookup, while only the converted JPEG File reaches ImageItem.file and createImageBitmap.
- Conversion happens before preview URL allocation, and every URL created by the existing upload workflow still has one clear owner and revoke path.
- Converted dimensions and bytes, not an invented HEIC-only limit, drive current warning/admission logic.
- Existing JPEG/PNG/WebP, unsupported-format, EXIF-failure, Worker, Canvas, and privacy tests remain green.
- No version bump, tag, Release, deployment, remote ref mutation, or physical-device test is part of this child task.

## Risky files and rollback points

- package.json and the root lockfile: dependency/license/size changes must be reviewed before merge; revert the dependency and integration together if the CSP entry or bundle cost is unacceptable.
- services/heicConversion.ts: converter API or multi-output handling can reject valid phone images; keep the service small so it can be corrected without touching renderers.
- services/uploadFiles.ts and App.tsx: an incorrect File-role split can break EXIF, preview, or Worker rendering; focused tests must assert each route.
- Binary HEIC fixture: if it is not portable across the pinned desktop browser/dependency versions, remove only the fixture-specific browser assertion and retain the documented deferred item; do not change production behavior to suit one encoder.
