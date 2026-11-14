# Spectral Rendering Contracts

## Scenario: Physical 135 Raster And Orientation Contracts

### 1. Scope / Trigger

Apply this contract whenever physical film planning, rasterization, orientation,
film-presence/backing composition, or continuous-strip coordinates change.

### 2. Signatures

```ts
interface PhysicalFilmPlan {
  outputWidth: number;
  outputHeight: number;
  pxPerMm: number;
}

interface PhysicalRaster {
  width: number;
  height: number;
  presence: Float32Array;
  backing: Float32Array;
  filmBase: Float32Array;
  wall: Float32Array;
}
```

### 3. Contracts

- `plan.outputWidth` and `plan.outputHeight` are the single owners of output
  orientation and row stride. `createPhysicalRaster` copies them exactly; it
  never transposes them again from `orientation` or film millimetres.
- Every row-major array uses `pixel = y * raster.width + x`. Return the raster
  dimensions and reject a Canvas with different dimensions before painting.
- Portrait planning already transposes film/gate/perforations once. Do not infer
  another automatic output rotation from that portrait plan: only originally
  portrait sources preserve the established output-orientation restoration.
- Each strip frame develops independently. Its global advance offset belongs in
  scan/material coordinates, while gate/perforation drawing and per-frame seed
  indices remain local to the frame. A perforation crossing an advance boundary
  retains one roll-mm identity in both windows: do not re-index it from the
  cropped center. Perforation SDF distance uses local millimetres, but its
  roughness/reflection sampling uses roll millimetres. Shared roll material and
  edge fog/leaks use the stable body/material seed, not a photograph's frame
  seed; that photograph seed still controls its own scan registration.
  Adjacent material is continuous at the same film-mm sample, not necessarily
  identical at two different pixel centers. The local-to-roll advance belongs
  to the affine scan registration exactly once; `filmToCanvas`/`canvasToFilm`
  keep gate/perforation geometry local, while `filmToRollPoint` is the sole
  additional local-to-roll material translation. Straightening uses the fixed
  local frame center, never the full-roll length or an expanded crop window.
  Derive perforation identity from `filmToRollPoint(plan, canvasToFilm(plan,
  hole.center.s, hole.center.t))`, not from scan-canvas coordinates plus an
  advance. Glyph transforms include `plan.frame.straightenDegrees` as well as
  the established portrait quarter-turn.
  Do not add the advance again in raster or spectral exposure sampling.
- Keep one roll-owned imprint layout, but rasterize each frame through
  `physicalStripFrameImprints` in that frame's local scan coordinates. Never
  paint at the full-roll rotation center and then crop an unrotated window.
  Rectangle coverage consumes the original local film-mm rectangle; transformed
  output corners are only scan bounds, not the coverage input. Include DX/imprint
  pixels in acceptance rather than excluding the region most likely to regress.
- Backing applies only after negative/paper/scan. Any aperture pixel with
  presence 1 must have zero open backing; it cannot become a white scanline.

### 4. Validation & Error Matrix

- Portrait plan and Canvas dimensions differ -> programming error; reject before
  spectral work rather than relying on equal total array lengths.
- Manually rotated landscape -> use its transformed portrait plan without a
  second automatic orientation restoration.
- Originally portrait source -> preserve the established single automatic output
  orientation restoration after development and optional scanner composition.
- Strip frame changes -> preserve the global advance in material sampling and
  local gate/perforation registration; never reset material phase at each seam.

### 5. Good / Base / Bad Cases

- Good: a `1155x1254` portrait Canvas and raster both use width 1155; the gate
  center has presence 1 and backing 0 in CPU and WebGL2 final exports.
- Base: landscape output remains `1254x1155`, and legacy-template default is
  unchanged while physical rendering is experimental.
- Bad: allocating a portrait raster as `1254x1155` because `orientation` says
  portrait, then reading it through a `1155x1254` Canvas. Equal element counts
  conceal the bug until periodic backing appears as horizontal white lines.

### 6. Tests Required

- Assert portrait/landscape raster dimensions, row strides, gate-center presence
  and zero backing, with a runtime dimension mismatch rejection.
- Render a natural-color image through the actual UI, rotate a landscape source
  90 degrees, and inspect final Blob pixels for saturated backing rows inside
  the aperture. Do not use dimensions or Blob existence as visual acceptance.
- Exercise both Worker and forced-main routes, PNG/JPEG, scanner background,
  and five-frame strips. Check local perforation phases and identical film-mm
  material samples at strip boundaries without weakening numerical tolerances.

### 7. Wrong vs Correct

```ts
// Wrong: transposes portrait twice and corrupts every subsequent row lookup.
const width = plan.orientation === 'portrait' ? plan.film.height * plan.pxPerMm : plan.film.width * plan.pxPerMm;

// Correct: the plan already owns orientation.
const width = plan.outputWidth;
const height = plan.outputHeight;
```



## Scenario: Data-Driven Spectral Film Stocks

### 1. Scope / Trigger

Apply this contract when adding a film/paper spectral resource, changing its
runtime registry, or modifying the shared CPU/WebGL2 aperture renderer.

### 2. Signatures

```ts
type SpectralBackendPreference = 'auto' | 'webgl2' | 'cpu';

interface SpectralStockDefinition {
  filmType: FilmType | null;
  profileId: string;
  paperId: string;
  status: 'replace-look' | 'add' | 'blocked';
}

function loadSpectralStockResource(filmType: FilmType): Promise<PortraSetupResource>;
function createPortraPipeline(resource: PortraSetupResource): PortraPipeline;
```

`npm run test:spectral-stocks` resolves TypeScript through `vite-node --script`;
plain `node` does not resolve the source modules' extensionless imports.

### 3. Contracts

- Bind the selected `FilmType` to its own decoded film ID, paper ID, exact
  source-derived arrays, reference illuminant and viewing illuminant. Never use
  a display-name match to select the default Portra resource for another stock.
- Declare the input color space per family. Color-negative and positive stocks
  use scene-linear ProPhoto; SpektraLab product B&W uses source-linear sRGB.
  The exposure LUT transform, byte-input transform and mid-gray probe are
  distinct contracts, not interchangeable matrix inverses. Apply a color-space
  conversion exactly once at the owning adapter boundary; never add an implicit
  conversion inside a stock's stage renderer or use `sourceSrgb` as a hidden
  alternate meaning for the same `RgbImage`.
- CineStill 800T must retain its Vision3 500T alias identity and apply its
  whole-frame headroom plus four signed per-channel Gaussian components before
  ordinary negative development. Do not clamp negative weights or substitute an
  ordinary Vision3 render. The current bounded CPU/WebGL2 path uses reflected-
  edge truncate-3 FIR, not source IIR parity for sigma >= 3. Compatibility edges
  and physical perforation are separate capabilities and remain disabled for
  this alias until independently validated.
- Keep the registry free of JSON resource imports. UI capability checks use the
  lightweight metadata; `canvasAdapter` dynamically loads the resource and
  backend only for spectral single-frame rendering. Module Workers must retain
  `type: 'module'` and Vite `worker.format = 'es'` when code splitting is used.
- Pro 400H's perforation CMY is the same finite-sample least-squares solve used
  by upstream `overscan.cpp`. Do not impose a residual acceptance threshold that
  upstream does not have. Anchor the solved CMY and residual independently, then
  compare film-presence/print output on CPU and WebGL2 and final Worker/main
  pixels. Its X-Tra-derived 135 imprint is an approximate layout, not a measured
  Pro 400H scan; keep that distinction visible in settings and task evidence.
- `replace-look` changes only aperture color. A compatible border or sprocket
  mask is not evidence of an independently measured physical stock template.
  Without a stock-specific edge asset, use the shared `compatibility135` painter
  in both Worker and main-thread paths. It draws the selected name, generic
  geometry and a COMPATIBILITY label; never borrow another stock's branded scan
  or DX marks. Its sprocket registry entry is programmatic, not a network URL.
- `blocked` stocks keep legacy rendering and expose no spectral control. A
  same-brand film, print paper, slide profile, B&W profile or halation-free
  alias is not an interchangeable color-negative resource.
- Use an isolated scratch canvas for WebGL2. Apply the float pipeline after
  aperture cover/rotation and before grain/template/markings/export. Preserve
  source alpha and never quantize intermediate densities into Canvas bytes.
  Temporary spatial textures and frame-owned exposure textures must release on
  success, allocation failure and disposal; never read and write the same texture
  in a fragment pass. Main-thread overlay rasterization must be redrawn after
  resizing its intermediate canvas, exactly once, to match Worker overlay pixels.
- `auto` may select the equivalent CPU spectral pipeline on unsupported or
  known-inaccurate software renderers. Explicit `webgl2` failure, context loss
  and disposal must be visible, not silently converted to legacy output.
- Imaging mode and backend participate in settings/result identity. Release
  textures, framebuffers, programs, VAOs, listeners and owned GL contexts at
  their owning boundary; Blob URL ownership remains unchanged.

### 4. Validation & Error Matrix

- Missing/mismatched film-paper identity or resource digest -> reject before
  rendering; do not fall back to Portra.
- Unsupported stock in spectral mode -> actionable error; legacy remains
  available only through an explicit user setting.
- Known-inaccurate software GPU in `auto` -> equivalent CPU spectral rendering.
- Explicit GPU context loss/disposal or allocation budget failure -> reject;
  release owned resources and do not schedule a cancelled replacement.
- Ordinary Worker failure -> one identical-settings main-thread retry;
  cancellation remains terminal and has no fallback.

### 5. Good / Base / Bad Cases

- Good: Vision3 200T uses its own Kodak 2383/K75P/tungsten resource, and
  switching stocks invalidates the old result while releasing the GPU frame.
- Base: an old recipe without imaging fields remains in legacy mode; every
  existing unsupported stock continues through its established renderer.
- Bad: map ColorPlus to Fuji C200, call a family-compatible border an exact
  scan, or print stage errors without failing a numerical validation command.

### 6. Tests Required

- Run all supported non-Portra stock resources through gray/green film raw,
  negative density, paper exposure/density and final output references with
  explicit stage tolerances. Include K75P and tungsten cases where applicable.
- Check CPU/GPU intermediate and final stages with hardware-specific measured
  precision. Do not relax a threshold to hide SwiftShader chromatic residuals.
- Exercise actual FilmFrame aperture rendering, not only the isolated harness;
  cover Worker/forced-main, CPU/auto, persistence/recipes, stale results,
  JPEG/PNG export and local-only requests.
- Assert setup/frame resource byte accounting returns to setup-only after frame
  release and zero after disposal. Report draw, readback and CPU times separately.
- Record profile/source digests and modification notices. Technical tests do
  not clear profile-data or historic-asset distribution blockers.

### 7. Wrong vs Correct

```ts
// Wrong: every selected stock silently receives the Portra setup.
const pipeline = createPortraPipeline();

// Correct: the registry selects the exact lazy resource before either backend runs.
const stock = spectralStockForFilm(settings.brandText);
if (!stock || stock.status === 'blocked') throw new Error('Unsupported spectral stock');
const resource = await loadSpectralStockResource(stock.filmType!);
const pipeline = createPortraPipeline(resource);
```
