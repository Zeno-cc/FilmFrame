# Research: Local HEIC and HEIF import

- Query: What is the smallest browser-local change that lets FilmFrame accept static HEIC/HEIF photos while preserving the existing preview, dimension, admission, EXIF, Worker, Canvas, and privacy contracts?
- Scope: internal repository and dependency research
- Date: 2026-08-20

## Confirmed repository behavior

- services/uploadFiles.ts:1-82 currently allowlists only image/jpeg, image/png, and image/webp. It creates the preview Object URL before dimension decoding, revokes it on decode failure, reads EXIF after successful dimensions, and stores the same file in the ImageItem passed to later rendering.
- App.tsx:368-414 supplies the upload service with URL.createObjectURL, the browser dimension reader, and an exif-js callback. App.tsx:1430-1440 restricts the file input to JPEG, PNG, and WebP.
- types.ts:47-68 defines ImageItem.file as a File. services/filmWorker.ts:336, 619, 809, and 879 pass that file to createImageBitmap, so an undecoded HEIC file cannot remain on the render path after admission.
- services/filmWorkerClient.ts:65-80 and 255-335 already carry a normal File through Worker or main-thread rendering. Changing the Worker request protocol is unnecessary if upload preparation produces a browser-decodable File.
- nginx.conf:11 permits same-origin scripts and worker-src self blob: but does not permit unsafe-eval. The converter entry must therefore honor the repository CSP rather than relying on a default build that requires an unsafe-eval exception.
- The privacy contract in README.md, docs/project/architecture.md, docs/project/product-workflows.md, and .trellis/spec/frontend/quality-guidelines.md requires photo bytes, EXIF, Blob URLs, and rendered output to stay in the current browser session.

## Dependency findings

- heic-to 1.5.2 provides browser-local isHeic(file) detection and heicTo({ blob, type: 'image/jpeg' }) conversion using libheif/WebAssembly.
- The package provides a heic-to/csp entry specifically for applications whose Content Security Policy cannot allow unsafe-eval; that entry is the required import boundary for this project.
- npm metadata reports an unpacked package size of approximately 24.4 MB. This is a meaningful first-use/download cost and must be documented as a trade-off rather than hidden behind a generic image helper.
- The package is licensed LGPL-3.0. The dependency and its license must be recorded in the project dependency documentation/review notes.
- The converter is suitable for local static-image conversion. It is not a reason to add a server endpoint, upload path, metadata service, or device-specific code.

## Chosen behavior

1. Accept static .heic and .heif inputs in addition to the existing JPEG, PNG, and WebP formats. MIME and extension hints may identify a candidate, but successful converter decoding remains the acceptance check.
2. Convert HEIC/HEIF to one JPEG Blob locally, using a fixed documented intermediate quality of 0.95, then wrap it in a render File with image/jpeg MIME. The original filename and last-modified value remain available for user-facing naming and EXIF lookup.
3. Keep the original input File only for the EXIF callback during upload preparation. Store the converted render File in ImageItem.file, so preview, dimensions, batch admission, Worker rendering, main-thread rendering, download naming, and cleanup continue to use the existing contracts.
4. Use the first/main still image when a source contains multiple image items. Live Photo pairing, video, animation, and full multi-frame preservation are not part of this task.
5. Report conversion or decode failure for that file only. Other files in the same selection continue through the existing loop. No preview Object URL is created until conversion succeeds; any URL created after conversion is revoked on dimension failure or normal image ownership cleanup.
6. Do not promise original HEIC metadata preservation. The original File is offered to exif-js; if the library cannot read the HEIC metadata, the image remains usable with an empty EXIF date.

## Test strategy

- Keep converter-specific code behind a small service/dependency seam so tests/uploadFiles.test.ts can verify orchestration without loading WebAssembly in every Vitest case.
- Extend focused upload tests for HEIC success, HEIF success, render-file metadata, original-file EXIF routing, size/dimension warnings, per-file conversion failure, URL cleanup, and unchanged rejection of GIF, SVG, text, and unknown inputs.
- Add a small checked-in HEIC fixture for a Chromium E2E path if a stable fixture can be generated and decoded by the pinned browser/dependency combination. The browser test must exercise the real application input, preview, and develop flow; it must not claim physical-device evidence.
- If a portable real fixture cannot be produced without relying on a machine-specific encoder, retain the injected conversion tests and record real-fixture browser coverage as deferred rather than fabricating a device or decoder result. This is a fixture portability risk, not a reason to alter production privacy or Worker contracts.

## Deferred and excluded behavior

- No server-side conversion, image upload, remote API, telemetry, or cloud storage.
- No complete Live Photo semantics, video import, animated output, multi-frame export, or original HEIC metadata round-trip.
- No change to the Worker message protocol, Canvas budget policy, output-format setting, or physical-device test matrix.
