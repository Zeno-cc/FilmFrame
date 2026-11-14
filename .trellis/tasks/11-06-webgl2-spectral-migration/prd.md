# Validate WebGL2 spectral rendering and migrate FilmFrame film looks

## Goal

Accelerate the validated browser-local spectral film pipeline with WebGL2, then migrate FilmFrame's real-135 film looks incrementally while preserving local-only photo processing, a correct CPU fallback and existing Canvas composition/export contracts.

The user explicitly authorized autonomous implementation, Trellis task creation and staged migration, including replacing duplicate film looks and adding missing negative stocks. This supersedes the earlier deferred-GPU/product-UI hold for this new phase; it does not clear unresolved redistribution rights or permit unsupported claims of full SpektraLab parity.

## Existing Evidence to Reuse

- `11-06-spectral-negative-print-prototype` has a correct CPU TypeScript Portra 400/Endura reference, 10 focused tests, strict green/non-dark-gray tolerances, explicit historical dark-column drift, typed resource validation and browser measurements.
- CPU 1080p performance is not interactive; repeated-print retained arrays are about 213.57MiB excluding fixed resources/JSON/Canvas/GC. GPU migration must improve this without hiding float precision or copying every intermediate back to CPU.
- `ops/provenance/manifest.json` and `services/spectral/NOTICE.md` record source/license constraints. Public distribution remains subject to those records.

## Scope

### Phase A — WebGL2 Feasibility

- Implement a small WebGL2 spectral renderer with float render targets and independently checked capabilities.
- Compare film exposure, negative density, paper density and final print RGB against the existing CPU path on gray-ramp/green and ordinary sRGB input.
- Measure setup/upload/render/readback/repeat-print and texture/array memory at 256x256 and 1920x1080 on Chromium; focused Firefox/WebKit checks; context-loss/failure behavior.
- No production default change during feasibility.

### Phase B — Architecture Integration

- Introduce a shared spectral backend interface so CPU and WebGL2 execute the same film/paper/output semantics.
- Insert spectral processing after real-135 aperture crop/cover/rotation and before existing grain/template/markings/export.
- Support explicit experimental Portra 400 real-135 single-frame first; legacy remains default until real-renderer A/B and performance review pass.
- Preserve main/Offscreen Worker boundaries, cancellation, stale-result identity, Object URL lifecycle, bounded allocations, normalized preferences/recipes, and CPU fallback with the same requested look.

### Phase C — Negative Stock Migration

- Inventory all upstream negative camera-film profiles, their declared paper pairing and FilmFrame mapping.
- Generalize the validated backend from one fixed Portra resource to data-driven film/paper setups, without duplicating algorithms per stock.
- For each supported duplicate FilmFrame stock (Gold, Portra 160/400/800, Ektar, Ultramax), replace the legacy aperture color approximation with validated spectral processing while retaining owned border/template behavior.
- Add missing negative stocks with clear mapping and references (Fujifilm C200, Fujifilm X-Tra 400 as a distinct new stock rather than a Superia replacement, Fujifilm Pro 400H, and Kodak Vision3 50D/200T/250D/500T after their K75P/tungsten prerequisites). Do not treat print papers (including Ektacolor Edge), slide films or cinema-print stocks as camera negatives. Exact pinned ColorPlus, Pro Image, Superia 400, T-Max 400 and P3200 profiles are unavailable; record them as blocked rather than substitute another brand/model. B&W and CineStill's distinct halation need separate validated behavior.
- Validate each added/replaced stock's numerical response, UI/persistence/result identity, actual output and resource provenance. If a profile cannot meet the required input/config/resource contract, document the blocker instead of faking parity.

## Requirements

- R1: Keep photos and processing local to the user's browser; no server/GPU conversion service, CDN or remote photo processing.
- R2: WebGL2 must preserve negative density in floating-point textures, not quantize it to 8-bit Canvas before printing.
- R3: GPU capability detection must include WebGL2 and `EXT_color_buffer_float`; texture allocation/readback/context loss must be bounded and cleaned up.
- R4: CPU and GPU must be compared with explicit numerical tolerances on small fixtures and real sRGB-to-ProPhoto inputs; an unsupported GPU path may not silently change the requested look.
- R5: Maintain existing crop geometry, film templates, main/Worker fallback, cancellation, export MIME/quality, Blob/Object URL ownership, current/stale signatures and legacy defaults.
- R6: Migrate film stocks through a data-driven registry with exact source/profile digests and valid paper pairings; no arbitrary LUT-only approximation presented as spectral parity.
- R7: Report actual measured performance, memory and compatibility rather than assuming native Metal speeds transfer to WebGL2.
- R8: Keep GPL-3.0-or-later derived-code and CC BY-SA 4.0 profile/derivative notices and unresolved-data blockers visible; no public distribution without clearance.

## Acceptance Criteria

- [x] WebGL2 capability/failure/context-loss behavior is tested, including resource cleanup and honest CPU fallback.
- [x] CPU/GPU film/negative/paper/output values agree within documented tolerances for gray, green, neutral and representative sRGB photos.
- [x] GPU benchmark demonstrates measured improvement at 1080p and explicit GPU texture/readback accounting; no 200MiB JS-plane assumption is presented as GPU memory proof.
- [x] Real FilmFrame Portra experimental single-frame flow completes on GPU and CPU with matching settings/result identity and no external image requests.
- [x] All duplicate negative FilmFrame stocks have a deliberate migration result and all newly supported negative stocks are registered, rendered and tested or explicitly blocked with evidence.
- [x] Desktop/mobile controls, preference/recipe compatibility, Worker cancellation/fallback, JPEG/PNG export and current legacy flows pass.
- [x] Trellis research/design/implementation/check artifacts, measured go/no-go decisions and final scope audit are complete.
- [x] No public distribution is claimed while provenance/license blockers remain unresolved.

## Out of Scope for This Migration

- Camera-negative scan inversion, RAW decode, full native spatial/stochastic parity (grain/halation/DIR diffusion/glare), full CAM16 pipeline, all SpektraLab UI formats, or native Metal/WASM rewrite.
- Replacing the entire React/Canvas UI, remote rendering or weakening privacy.
- Treating all 28 SpektraLab resources as negative camera films or blindly replacing slide/print-paper types.
- Guaranteeing GPL/asset legal clearance without the required owner/source review.
