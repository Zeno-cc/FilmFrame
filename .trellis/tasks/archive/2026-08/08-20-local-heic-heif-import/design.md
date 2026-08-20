# Design: Local HEIC and HEIF import

## Boundaries and ownership

services/uploadFiles.ts remains the upload-orchestration boundary. A small services/heicConversion.ts module owns the heic-to/csp dependency, candidate detection, fixed conversion options, and conversion-specific error boundary. App.tsx continues to own browser APIs and injects the conversion and EXIF callbacks into upload preparation.

No backend, OpenResty, Worker protocol, Canvas renderer, batch-admission policy, or persistent-storage change is needed.

## Data flow

~~~text
Original HEIC/HEIF File
  ├─ EXIF callback (best effort; empty date is valid)
  └─ heic-to/csp local conversion, first/main still, JPEG quality 0.95
       └─ render File (same user-visible name, image/jpeg)
            └─ existing Object URL → dimension check → warning/admission
                 └─ existing ImageItem.file → Worker or main-thread renderer
~~~

For JPEG, PNG, and WebP, the preparation callback returns the original File, so the existing path remains unchanged. For HEIC/HEIF, conversion happens before createObjectUrl; this prevents a failed conversion from allocating a preview URL. The render File is the only File stored in ImageItem.file, while the original File is used transiently for EXIF and naming decisions.

## Type and dependency seam

- Define a service-local conversion result/dependency type rather than widening ImageItem with a second source-file field.
- Make upload preparation generic over the input File and render File, or use an equivalent explicit prepareRenderFile callback, so the type system records that EXIF and rendering may receive different File objects.
- Import the converter only through heic-to/csp. Do not relax nginx.conf CSP or add a build-time unsafe-eval exception.
- Detect candidates from isHeic(file) plus the supported HEIC/HEIF MIME/extension hints. Let actual conversion/decode reject false candidates; do not add hashes, checksums, or a second signature database.
- Create a new File around the converted Blob with the original filename, original lastModified when available, and type image/jpeg. The fixed intermediate quality is 0.95, matching the product's current default JPEG quality and making the lossy step explicit.

## Error and resource ownership

- Conversion errors are caught per input file and become the existing upload error collection entry for that filename.
- No Object URL is allocated before conversion. If dimension decoding fails after conversion, revoke the render URL exactly as the current service does.
- The converted File does not own a separate URL. The existing ImageItem.previewUrl, processed URLs, strip URL, and unmount/remove cleanup remain the only Object URL owners.
- EXIF parsing is best effort and remains non-blocking for image acceptance. A converter that does not expose readable HEIC metadata does not turn a valid image into an upload error.

## Browser and compatibility behavior

- Update the hidden input accept value to include image/heic, image/heif, .heic, and .heif alongside the existing MIME values.
- The converter handles one primary still image. If its API returns multiple decoded items, select the first/main result and do not expose animation or Live Photo controls.
- The existing File-based Worker capability predicate and render budget checks continue to apply to the converted File. No Worker-specific HEIC branch is introduced.
- The large-file warning measures the converted render File because that is the byte payload and decoded image used by the renderer. The original filename remains the message/name identity.

## Documentation and license

Update README.md and the maintained product workflow documentation to list HEIC/HEIF, local conversion, first-use cost, single-still scope, and the lack of server upload. Record heic-to 1.5.2 and its LGPL-3.0 license in the dependency notes without copying the package license into application output.

## Verification and rollback

- Vitest uses the conversion callback seam to prove routing, metadata, failures, and URL cleanup without making every unit test depend on WebAssembly startup.
- A Chromium test uses a checked-in fixture and the real application path when the fixture is portable. If fixture creation proves machine-specific, keep the deterministic orchestration tests and document the browser-fixture gap as deferred; do not weaken production conversion or claim device evidence.
- Validate with focused upload tests, typecheck/build, the relevant Chromium E2E, and the existing desktop release/browser gates. Do not run physical-device tests.
- Rollback is a normal dependency/code revert before release; no stored data, schema, remote ref, tag, or deployment state is changed.
