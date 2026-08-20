# Local HEIC and HEIF import

## Goal

Let users add static HEIC/HEIF photos from modern phone and camera workflows while keeping FilmFrame's existing browser-local photo processing, admission warnings, EXIF behavior, and Worker/main-thread rendering path intact.

## Background

- The current upload service accepts JPEG, PNG, and WebP only (services/uploadFiles.ts:1-82).
- The file input advertises the same three formats (App.tsx:1430-1440).
- Later rendering receives ImageItem.file and calls browser image decoders, so an HEIC source must be converted before it becomes the render file (types.ts:47-68; services/filmWorker.ts:336, 619, 809, 879).
- exif-js reads the original upload File in App.tsx:368-381; conversion must not make the original file unavailable to that callback.

## Requirements

### R1. Accept and locally prepare static HEIC/HEIF files

- Recognize .heic and .heif candidates in the upload boundary, including the standard image/heic and image/heif MIME values.
- Use heic-to/csp for browser-local conversion to a single JPEG render File at fixed intermediate quality 0.95.
- Keep all photo bytes in the current page session. Do not add an upload, server conversion, remote processing, telemetry, or storage path.

### R2. Preserve existing upload and render contracts

- Use the original File for EXIF lookup and the converted JPEG File for preview URL, dimension decoding, large-image warnings, batch admission, Worker rendering, main-thread rendering, and artifact cleanup.
- Preserve the original base filename and user-visible naming source even though the render File has JPEG MIME.
- Keep current dimension validation, large-file/large-edge warnings, Object URL ownership, and accepted-file ordering semantics.
- Keep the existing Worker message and Canvas contracts unchanged.

### R3. Handle failures per file

- A conversion or decode failure reports that file by name and does not discard successfully prepared files from the same selection.
- A failed conversion must not leave an Object URL behind. A URL created after conversion must be revoked when dimension decoding fails.
- EXIF failure remains non-fatal and produces an empty date, including when HEIC metadata cannot be parsed by exif-js.

### R4. Document and verify the new boundary

- Update the file-input/user documentation to list HEIC/HEIF and state that conversion is local, single-still oriented, and may incur a first-use dependency cost.
- Record the heic-to LGPL-3.0 license in the dependency documentation used by the project.
- Add focused Vitest coverage and a Chromium desktop E2E path for real application upload-to-develop behavior when a stable fixture is available.

## Acceptance Criteria

- [ ] AC1: JPEG, PNG, and WebP behavior remains green, and static .heic and .heif inputs are accepted when the converter can decode them.
- [ ] AC2: The upload service routes the original HEIC/HEIF File to EXIF lookup and routes the converted JPEG File to preview, dimensions, warning/admission, and the existing Worker/main-thread render path.
- [ ] AC3: Converted files retain the original user-visible filename source, expose image/jpeg to browser decoders, and use the fixed documented conversion quality.
- [ ] AC4: Converted dimensions and converted byte size drive the existing large-image warning and batch admission behavior; no new upload limit or separate HEIC admission policy is introduced.
- [ ] AC5: A failed HEIC/HEIF conversion or decode reports only that file, leaves no leaked preview URL, and does not prevent another valid file in the same selection from being added.
- [ ] AC6: GIF, SVG, text, unknown files, and other unsupported formats remain rejected with the existing per-file error behavior.
- [ ] AC7: The file input advertises HEIC/HEIF in addition to the existing formats, and maintained docs state that photos and conversion remain local to the browser session.
- [ ] AC8: Focused Vitest tests cover the orchestration and cleanup contracts, and a Chromium desktop test covers input, preview, and develop without a processing error when a stable fixture is available.
- [ ] AC9: No Worker protocol, Canvas budget, output-format setting, server endpoint, version, release, tag, deployment, or physical-device test is added or changed for this feature.

## Out of Scope

- Live Photo pairing, video or animation import, multi-frame export, and original HEIC metadata round-trip.
- Server-side or remote conversion, uploads, cloud sync, telemetry, account changes, and persistent photo storage.
- A new feature flag, compatibility wrapper, renderer protocol, or device-specific code.
- Physical iPhone, iPad, or Android testing.

## Blocking Open Questions

None.
