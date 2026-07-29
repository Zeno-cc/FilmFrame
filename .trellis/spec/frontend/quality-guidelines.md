# Quality Guidelines

> Verification and review standards used by FilmFrame.

## Required Checks

Run before committing frontend behavior changes:

```bash
npm run check
npm run test:e2e
git diff --check
```

`npm run check` runs Vitest, strict TypeScript checking, and the production Vite build. Playwright covers the local browser workflow separately.

## Required Patterns

- Add focused Vitest coverage for pure services, state transitions, normalization, budgets, and routing policy.
- Add or update Playwright coverage for user-facing workflows, responsive behavior, dialogs/focus, and browser rendering integration.
- Verify image/Canvas changes in a real browser. Use structural assertions and screenshots where randomized grain makes exact pixel snapshots unsuitable.
- Preserve local-only privacy: no image upload, telemetry, or external processing path.
- Check resource ownership for every new Object URL, timer, Worker request, or event listener.
- Check desktop, tablet, and 390px mobile behavior for layout changes.

### Flattened Real-135 Template Assets

- Every flattened real-135 template must be an RGB `1307x1203` PNG with a fully black aperture at `x=92`, `y=211`, `width=1123`, `height=800`.
- Measure each generated source image's largest continuous black aperture before normalizing it. Source apertures differ by model, so never reuse another stock's crop coordinates.
- Normalize a source template by splitting it around the measured aperture into a 3x3 grid, resizing the edge and center regions independently to `92/1123/92` columns and `211/800/192` rows, then stitching the regions together. A global affine resize can introduce black padding at the film edges.
- Compare the outermost rows and columns with several inset bands. If a generated source contains an isolated canvas halo, replace only that outer band from mirrored valid film pixels; never rescale the full template, and restore the aperture to exact black afterward.
- When compositing a flattened template, clip all four overlay bands exactly to the aperture boundary. Never overlap opaque black aperture pixels onto the photo to hide seams; even a small inset becomes a visible black frame after scaling.
- Flattened templates use one compact dynamic frame number in the shared top-center perforation gap. Do not reuse the Gold-only bottom number or `A` suffix because stock-specific labels occupy those areas. The layered Gold path keeps its dedicated markings.
- Validate the result before registration: the aperture pixels are all black, all four outer edges retain non-black film material, and the asset renders in a browser for both single and strip workflows.

### Scenario: Optional Frame-Number Color Override

#### 1. Scope / Trigger

Apply this contract whenever dynamic frame-number color behavior changes across settings UI, persistence, render identity, main-thread Canvas rendering, or Worker rendering.

#### 2. Signatures

```ts
interface FilmSettings {
  frameNumberColor?: string;
}

function getFrameNumberColor(
  settings: Pick<FilmSettings, 'frameNumberColor'>,
  fallback: string,
): string;
```

#### 3. Contracts

- `frameNumberColor` is an optional six-digit HEX override stored as lowercase `#rrggbb`.
- An absent value preserves each renderer's previous effective frame-number color.
- An explicit value affects only application-generated frame numbers and suffixes; it must not recolor stock labels, dates, DX blocks, safety-film labels, or pixels baked into PNG templates.
- The setting must round-trip through preferences and recipes, participate in `createRenderSettingsKey`, and travel unchanged in Worker request settings.
- Film-stock changes must preserve an explicit override.

#### 4. Validation & Error Matrix

- Valid `#RRGGBB` -> normalize to lowercase and persist.
- Missing value -> omit the override and use the renderer-provided fallback.
- Invalid stored string, short HEX, or non-string -> ignore it without replacing the fallback.
- Changed explicit value -> mark existing single and strip artifacts stale.

#### 5. Good / Base / Bad Cases

- Good: `#44CC88` becomes `#44cc88` and colors dynamic numbers in main-thread and Worker output.
- Base: no override keeps the existing stock/text amber without changing current users' output.
- Bad: applying the override as the shared Canvas `fillStyle` recolors `KODAK`, `SAFETY FILM`, or DX blocks.

#### 6. Tests Required

- Settings tests assert valid normalization, invalid-value rejection, and preference/recipe round trips.
- Render-result tests assert that changing only `frameNumberColor` changes single and ordered-strip keys.
- Frame-number tests assert explicit override and fallback resolution.
- Worker tests assert the field is preserved in the request payload.
- Playwright asserts desktop/mobile availability, cross-stock persistence, and successful single/strip rendering after selection.

#### 7. Wrong vs Correct

```ts
// Wrong: leaks the override into unrelated markings.
ctx.fillStyle = settings.frameNumberColor ?? settings.textColor;
drawBrandAndFrameNumber(ctx);

// Correct: scope the override to dynamic frame-number glyphs.
drawBrand(ctx);
ctx.save();
ctx.fillStyle = getFrameNumberColor(settings, settings.textColor);
drawFrameNumber(ctx);
ctx.restore();
```

### Scenario: Optional Real-135 Sprocket Color Override

#### 1. Scope / Trigger

Apply this contract when real-135 sprocket color behavior changes across settings UI, persistence, render identity, template assets, main-thread Canvas rendering, or Worker rendering.

#### 2. Signatures

```ts
interface FilmSettings {
  real135SprocketColor?: string;
}

function getReal135SprocketMaskUrl(brand: FilmType): string | undefined;

function getReal135SprocketColor(
  settings: Pick<FilmSettings, 'real135SprocketColor'>,
): string | null;
```

#### 3. Contracts

- `real135SprocketColor` is an optional six-digit HEX override stored as lowercase `#rrggbb`.
- An absent value means `跟随原片`: flattened templates preserve their baked sprocket colors, while programmatic Gold holes retain their existing black fallback.
- An explicit value applies globally across real-135 stock and output-mode changes, preferences, recipes, and Worker request settings.
- Every key in the real-135 template registry must have a stock-specific RGBA mask at `1307x1203`; only sprocket interiors may have nonzero alpha.
- Composite the tinted mask after the film template/base and before dynamic frame markings. Scope composite state with `save()`/`restore()` or an isolated temporary canvas.
- The setting participates in `createRenderSettingsKey`, so selection and reset mark single and strip artifacts stale.
- A missing or unreadable mask preserves the source template and must not fail rendering.

#### 4. Validation & Error Matrix

- Valid `#RRGGBB` -> normalize to lowercase and persist.
- Missing value -> omit the override and preserve the renderer's existing sprocket appearance.
- Invalid stored string, short HEX, or non-string -> ignore it without replacing the fallback.
- Registered flattened template without a valid mask -> fail asset validation before release.
- Runtime mask-load failure -> continue rendering with the source-template holes unchanged.

#### 5. Good / Base / Bad Cases

- Good: `#CC3344` becomes `#cc3344` and recolors only the existing stock-specific hole interiors in single and strip output.
- Base: no override leaves every flattened template visually unchanged.
- Bad: reusing one universal hole geometry covers labels, rebate text, or perforation edges on stocks with different hole counts.

#### 6. Tests Required

- Settings tests assert valid normalization, invalid-value rejection, and preference/recipe round trips.
- Render-result and Worker-client tests assert invalidation and request propagation.
- Registry tests assert every real-135 template has a matching mask URL.
- Browser asset tests assert `1307x1203` RGBA dimensions, nonzero hole coverage, and zero aperture coverage for every mask.
- Playwright render tests sample representative flattened-template and Gold single/strip pixels and assert desktop/mobile control behavior without horizontal overflow.

#### 7. Wrong vs Correct

```ts
// Wrong: one geometry cannot match every generated stock template.
drawUniversalSprocketRectangles(ctx, settings.real135SprocketColor);

// Correct: tint the mask registered for the active stock and isolate failures.
const maskUrl = getReal135SprocketMaskUrl(settings.brandText);
const color = getReal135SprocketColor(settings);
if (maskUrl && color) {
  await compositeStockSprocketMask(ctx, maskUrl, color);
}
```

### Scenario: Real-135 Worker Routing And Cancellation

#### 1. Scope / Trigger

Apply this contract whenever real-135 template registration, Worker routing, Worker rendering, or the batch stop command changes.

#### 2. Signatures

```ts
function shouldUseWorkerForSettings(settings: FilmSettings): boolean;
function cancelFilmRendering(): void;
class WorkerCancelledError extends Error {}
```

#### 3. Contracts

- Every stock in `REAL135_TEMPLATE_URLS` uses Worker single and strip rendering when Worker, OffscreenCanvas, `convertToBlob`, and `createImageBitmap` are available and templates are enabled.
- Gold 200 keeps its layered Worker path. Other registered stocks use the flattened overlay path with shared layout, aperture bands, cover placement, grain, sprocket mask, and frame-number helpers.
- Overlay and sprocket-mask `ImageBitmap` promises are cached by URL inside the Worker. Failed loads remove their cache entry so a later request can retry.
- Classic rendering and unsupported browsers stay on the main thread. Ordinary Worker failures fall back once to the main-thread engine.
- User cancellation rejects pending work with `WorkerCancelledError`, terminates the Worker, clears the singleton, and never falls back to main-thread rendering.
- The App increments its generation before cancellation. Completed artifacts remain owned; cancelled or late results cannot update state or create an Object URL. A later request lazily creates a new Worker.

#### 4. Validation & Error Matrix

- Registered real-135 template plus capabilities -> Worker route.
- Classic mode, templates disabled, or missing capability -> direct main-thread route.
- Worker business/asset error -> main-thread fallback.
- Dispose, stop, or unmount -> cancellation error, no fallback, no user-facing processing error.
- Response after cancellation -> missing pending entry, no Object URL.
- Asset load failure -> remove cached promise; main-thread fallback remains available.

#### 5. Good / Base / Bad Cases

- Good: Portra 160 single and strip render in Worker, stop calls `terminate()`, and retry completes through a new Worker.
- Base: a browser without OffscreenCanvas renders the same request on the main thread.
- Bad: treating cancellation as an ordinary Worker error starts an expensive main-thread render after the user pressed stop.

#### 6. Tests Required

- Unit tests enumerate all 16 registry keys through `shouldUseWorkerForSettings` and cover classic/template-disabled rejection.
- Worker lifecycle tests cover pending rejection, timer cleanup, late-response suppression, message errors, timeout, and cancellation type guards.
- Playwright instruments `Worker.terminate()`, proves stop is quiet, then reruns the same batch successfully.
- Real-browser coverage renders every registered stock in single and strip modes; representative flattened output also samples aperture/sprocket pixels.

#### 7. Wrong vs Correct

```ts
// Wrong: cancellation falls through and keeps rendering on the main thread.
try { return await worker.processImage(file, settings); }
catch { return mainThread.processImage(source, settings); }

// Correct: cancellation remains terminal; only real failures fall back.
try { return await worker.processImage(file, settings); }
catch (error) {
  if (isWorkerCancelledError(error)) throw error;
  return mainThread.processImage(source, settings);
}
```

### Scenario: Seamless Decorative CSS Motion

#### 1. Scope / Trigger

Apply this contract to ambient looping motion that decorates a workflow surface without communicating state or progress.

#### 2. Signatures

```tsx
<div className="ff-motion-viewport" aria-hidden="true">
  <div className="ff-motion-track" data-testid="motion-track" />
</div>
```

```css
@keyframes ff-loop {
  to { transform: translate3d(var(--ff-loop-distance), 0, 0); }
}
```

#### 3. Contracts

- The viewport is clipped and pointer-inert; decorative descendants are excluded from the accessibility tree.
- Move one compositor track with `transform` only. Do not update React state, timers, animation frames, layout properties, background position, filters, or shadows per frame.
- The translation distance must equal the common horizontal period of every repeated child/background layer. Extend the track by at least one complete tile beyond each viewport edge.
- Semantic content and controls remain on a stationary layer above the animation.
- Hover, focus-within, and task-specific interaction states pause with `animation-play-state`; do not change duration or transform because either can jump phase.
- `prefers-reduced-motion: reduce` sets `animation: none`, preserves a deliberate static composition, and removes persistent `will-change` promotion.
- The animation must unmount with its owning surface and add no global listener or cleanup path.
- When the decoration represents horizontal 135 film, model the `36x24 mm` exposure as an exact `3:2` window independently from the wider eight-perforation transport pitch and from the full strip height.
- Model a visual 135 strip as one contiguous acetate body: both perforation rails must directly abut the exposure row, and inter-frame rebates must reveal that same base rather than the surrounding page background.

#### 4. Validation & Error Matrix

- Loop distance differs from a background period -> visible snap; align every period or use their least common multiple.
- Track does not overhang both edges -> exposed gap during translation; add full-tile overscan.
- Interaction changes duration/direction -> phase jump; pause/resume the existing animation instead.
- Reduced motion only shortens duration -> repeated flashing or one-frame jump; disable the animation entirely.
- Moving layer accepts pointer events or accessibility semantics -> interaction/noise regression; make it pointer-inert and `aria-hidden`.

#### 5. Good / Base / Bad Cases

- Good: a `360px` track containing `45px` and `360px` patterns translates exactly `-360px` with linear timing.
- Base: reduced motion shows the same complete artwork at a fixed offset with no active loop.
- Bad: animating `background-position` for multiple unrelated periods causes repainting and a seam at reset.

#### 6. Tests Required

- Playwright asserts animation name, duration, linear timing, infinite iteration, and transform progression at controlled animation times.
- Interaction tests restore the sampled animation to `running` before asserting hover/focus/drag pause, preventing false-positive pause tests.
- Reduced-motion tests assert `animation-name: none` and a non-promoted track.
- Responsive tests assert the document has no horizontal overflow and the moving surface unmounts when its owner disappears.
- Visual QA uses paused or reduced-motion screenshots at desktop, tablet, and `390px` mobile widths; inspect a live mid-cycle phase separately.

#### 7. Wrong vs Correct

```css
/* Wrong: repaints continuously and resets on a non-shared period. */
.film { animation: scroll 10s linear infinite; }
@keyframes scroll { to { background-position-x: -317px; } }

/* Correct: one phase-aligned compositor track. */
.film-track { animation: ff-film-loop 36s linear infinite; }
@keyframes ff-film-loop { to { transform: translate3d(-360px, 0, 0); } }
```

### 场景：审核快照驱动的外部语料

#### 1. 适用范围

当界面展示来自 Wikiquote 等第三方站点的名言、说明或其他编辑内容时，使用本契约。第三方接口只属于维护流程，不属于浏览器运行链路。

#### 2. 接口与数据签名

```bash
npm run sync:quotes
```

```ts
interface ReviewedPhotographyQuote {
  id: string;
  originalText: string;
  displayTextZhHans: string;
  author: string;
  sourceTitle: string;
  wikiquoteUrl: string;
  wikiquoteRevisionId: number;
  rightsNote: string;
  verifiedAt: string;
}
```

#### 3. 行为契约

- 同步命令只请求项目维护的摄影师页面白名单，并把机器提取结果写入被 Git 忽略的 `generated/` 候选文件。
- 候选内容必须经过人工核验、翻译和许可检查，才能进入 `data/photography-quotes.json`；应用只能导入这个审核快照。
- 浏览器不得自动请求 Wikiquote，也不得向第三方发送用户照片、设置或会话信息。用户主动点击精确修订来源链接不属于自动请求。
- 审核快照在模块加载时执行结构校验；非法 ID、来源、修订号或日期必须阻止构建，不能静默跳过。
- 自动更新按固定 24 小时时段计算当前内容，并使用可清理的单次 `setTimeout` 等待下一个时段边界。
- 自动变化区域使用 `aria-live="off"`；名言区不显示手动切换、暂停按钮或第三方采集技术说明。

#### 4. 校验与错误矩阵

- Wikiquote 超时、页面不存在、结构无效或候选为零 -> 同步命令失败，不写候选文件，也不修改审核快照。
- 候选未审核 -> 只能停留在 `generated/`，不得被运行时代码导入。
- 审核快照字段缺失、ID 重复或来源不是带修订号的 Wikiquote HTTPS 地址 -> 构建时抛出明确错误。
- 快照少于两条 -> 展示首条并且不创建轮播计时器。
- 组件卸载 -> 清除现有计时器；页面重新打开时根据当前时间直接计算正确时段，无需持久化状态。

#### 5. 正常、基础与错误案例

- 正常：维护者同步候选、人工核验六条记录，应用离线读取审核快照并在每个 24 小时时段展示对应名言。
- 基础：第三方接口暂时不可用，已发布快照和用户页面不受影响。
- 错误：组件定期在浏览器中请求随机名言接口，造成隐私、CORS、限流和页面稳定性风险。

#### 6. 必需测试

- 单元测试覆盖快照结构、唯一 ID、精确修订链接、时段索引和边界延迟。
- 同步测试注入可控 `fetch`，覆盖成功、HTTP 失败、页面缺失、零候选以及失败不写文件。
- Playwright 使用受控时钟验证同一时段稳定、跨时段自动切换，以及控制按钮和技术说明不存在。
- 浏览器测试确认资源请求中没有 Wikiquote 自动请求，且桌面、平板与 `390px` 移动端无布局跳动或横向溢出。

#### 7. 错误与正确实现

```ts
// 错误：把不稳定的第三方接口放进用户运行链路。
useEffect(() => {
  fetch('https://en.wikiquote.org/w/api.php?...').then(updateQuote);
}, [quoteIndex]);

// 正确：运行时只消费审核快照，并清理单次计时器。
useEffect(() => {
  if (reviewedQuotes.length < 2) return undefined;
  const timer = window.setTimeout(updateQuoteForCurrentPeriod, delayUntilNextPeriod(Date.now()));
  return () => window.clearTimeout(timer);
}, [quoteIndex]);
```

### Scenario: Destructive Roll Cleanup

#### 1. Scope / Trigger

Apply this contract when one command removes multiple `ImageItem` records or resets the current roll.

#### 2. Signatures

```ts
interface BulkDeleteCommand {
  photoCount: number;
  disabled: boolean;
  onConfirm: () => void;
}
```

#### 3. Contracts

- `App.tsx` owns deletion because it owns image state, render artifacts, async generations, and Object URLs.
- Require an accessible confirmation that names the exact photo count and initially focuses the non-destructive action.
- Disable deletion during processing/exporting; do not implicitly stop either operation.
- Revoke preview, processed, and strip URLs before clearing their owning refs. Let `createPreviewRenderController` revoke its own accepted and late editor-preview URLs on disposal.
- Invalidate async generations, clear image-owned transient state and file-input value, preserve settings/recipes/output mode, then focus a persistent add-photo control.

#### 4. Validation & Error Matrix

- No photos -> do not expose or execute the command.
- Processing/exporting -> trigger is disabled and the command guard exits without mutation.
- Cancel/Escape -> keep the roll and restore focus to the trigger.
- Confirm while idle -> remove the roll and return to the empty workspace.

#### 5. Good / Base / Bad Cases

- Good: every URL has one owner and is revoked once before its reference disappears.
- Base: cancel leaves image order, selection, artifacts, and preferences unchanged.
- Bad: clearing the array first loses URL references; manually revoking `editorPreviewUrl` duplicates controller cleanup.

#### 6. Tests Required

- Playwright asserts exact count copy, cancel-first focus, Escape/cancel restoration, busy-state disabling, empty-workspace recovery, add-photo focus, and preference preservation.
- Instrument `URL.revokeObjectURL` in a focused browser flow when resource ownership changes.
- Re-run desktop and 390px overflow checks for the bulk-action row and dialog.

#### 7. Wrong vs Correct

```ts
// Wrong: references are lost before resources are released.
setImages([]);

// Correct: release at the owner boundary, then clear refs and state.
imagesRef.current.forEach(item => {
  revokeObjectUrl(item.previewUrl);
  revokeObjectUrl(item.processedUrl);
});
imagesRef.current = [];
setImages([]);
```

### Scenario: Complete Single-Frame ZIP Export

#### 1. Scope / Trigger

Apply this contract whenever the single-frame ZIP command, artifact validity rules, batch completion, or selection behavior changes.

#### 2. Signatures

```ts
type ExportReadinessStatus = 'empty' | 'complete' | 'incomplete';

interface ExportReadiness<TItem, TArtifact> {
  status: ExportReadinessStatus;
  totalCount: number;
  readyCount: number;
  pendingCount: number;
  pendingIds: string[];
  readyEntries: Array<{ item: TItem; index: number; artifact: TArtifact }>;
}
```

#### 3. Contracts

- Evaluate only included photos and preserve their original roll indexes for ZIP filenames.
- An artifact is ready only when its MIME and render settings key match the current per-image settings; a Blob URL alone is insufficient.
- A complete selection downloads directly. An incomplete selection requires a focused choice between processing the remainder or explicitly exporting the current `N/M` results.
- The default incomplete path reuses current artifacts, processes only pending photos, then re-evaluates the latest refs before downloading.
- Stop, generation invalidation, or any failed pending image prevents automatic download and preserves successful artifacts.
- Ordered-strip download remains independently gated by a current strip key.

#### 4. Validation & Error Matrix

- No included photos -> show selection guidance and do not open an export dialog.
- `M/M` current artifacts -> run ZIP admission and download without confirmation.
- `N/M` current artifacts -> show both explicit partial export and finish-then-export actions.
- `0/M` current artifacts -> show only finish-then-export.
- Missing byte size or ZIP budget block -> show the existing actionable error and do not create a ZIP.
- Processing failure or cancellation -> do not download; retain every accepted result.

#### 5. Good / Base / Bad Cases

- Good: `2/3` opens a dialog, explicit partial export contains two entries, and the default path produces three entries after the final render succeeds.
- Base: `3/3` keeps the one-click ZIP flow.
- Bad: filtering current artifacts inside the ZIP command silently creates a two-entry archive for a three-photo selection.

#### 6. Tests Required

- Unit tests cover empty, complete, incomplete, excluded, and stale candidates.
- Playwright verifies cancel focus restoration, absence of partial export at `0/M`, both `N/M` actions, and exact ZIP central-directory entry counts.
- Stop/failure coverage asserts that no download event fires and completed cards remain available.

#### 7. Wrong vs Correct

```ts
// Wrong: silently drops selected photos without current artifacts.
const files = images.flatMap(image => image.processedUrl ? [image] : []);
downloadZip(files);

// Correct: make incompleteness explicit, then re-evaluate after processing.
const readiness = evaluateExportReadiness(candidates);
if (readiness.status === 'incomplete') openIncompleteExportDialog();
else downloadZip(readiness.readyEntries);
```

## Accessibility Review

- Use role/name selectors in E2E tests; this verifies both interaction and accessible naming.
- Dialogs must trap focus, close on Escape, and restore focus.
- Controls must remain keyboard and touch operable without horizontal overflow.
- Respect reduced motion and keep status announcements non-blocking.

## Forbidden Patterns

- No destructive Git cleanup of an existing dirty worktree.
- No CDN/runtime dependency for core libraries or user image processing.
- No silent image deletion, downscaling, compression, or selection changes when admission blocks a batch.
- No direct download of stale artifacts.
- No expensive renderer call on every crop pointer move.
- No duplicated render policy in UI components and Worker code without a tested shared contract.

## Review Checklist

- Does the change preserve `ImageItem` ordering, identity, inclusion, and artifact ownership?
- Are current/stale signatures updated for every new output-affecting field?
- Are Worker and main-thread routes intentionally aligned or explicitly gated?
- Are settings normalized in UI, persistence, and rendering boundaries?
- Do overlay assets keep the `1307x1203` canvas and `92/211/1123/800` aperture contract?
- Are new runtime files included in the Vite build and intermediate assets excluded?
- Are errors actionable without destroying user data?
- Are project docs updated when a stable behavior or invariant changes?
