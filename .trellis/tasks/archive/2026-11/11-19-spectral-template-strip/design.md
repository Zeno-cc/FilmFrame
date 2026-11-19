# 技术设计：光谱负片模板片边长条支持

## 1. 边界

保持不变：
- 光谱算法、stock 资源、颜色管线、物理长条、经典边框长条。
- `FilmSettings`、localStorage 键、渲染签名、Worker 请求/响应结构。
- 模板资产、模板布局、输出宽高、行数与帧距。
- 单张光谱行为与其他片边方式。

改变：
- 模板片边长条的光谱入口限制。
- Worker 与主线程的模板长条渲染，使 Kodak Gold 200 也能走光谱。
- 长条光谱后端的生命周期由逐帧改为长条级共享。

## 2. 入口守卫

`services/spectral/scope.ts` 改为按实际可执行路径判断：

```ts
export function spectralStripSupported(settings: Pick<
  FilmSettings,
  'imagingMode' | 'brandText' | 'frameRenderMode' | 'edgeRenderMode' | 'useFilmOverlayTemplate'
>): boolean {
  if (settings.imagingMode !== 'spectral') return false;
  if (settings.edgeRenderMode === 'physical135') return true;
  return supportsSpectralStock(settings.brandText)
    && (settings.frameRenderMode ?? 'real135') === 'real135'
    && settings.useFilmOverlayTemplate !== false;
}

export function assertSpectralStripSupported(settings): void {
  if (settings.imagingMode !== 'spectral') return;
  if (settings.edgeRenderMode === 'physical135') return;
  if (spectralStripSupported(settings)) return;
  throw new Error('Spectral template strip needs a supported stock and the 135 template path.');
}
```

三处调用继续保留：
- `filmWorkerClient.generateFilmStrip`：启动前快速失败。
- `filmEngine.generateFilmStrip`：主线程兜底。
- `filmWorker` 长条消息：Worker 兜底。

标准 UI 可产生的“光谱 + 模板片边 + 长条”组合全部放行；只有不支持光谱的胶片或 `useFilmOverlayTemplate=false` 旧配置仍失败。

## 3. 共享光谱会话

`services/spectral/canvasAdapter.ts` 新增：

```ts
export interface SpectralApertureSession {
  process(
    ctx: SpectralContext,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<void>;
  dispose(): void;
}

export async function createSpectralApertureSession(
  settings: FilmSettings,
  width: number,
  height: number,
): Promise<SpectralApertureSession | null>;
```

行为：
- `!supportsSpectral(settings)` → `null`。
- 创建时一次性加载 backend 模块、stock pipeline，并按 `width/height` 创建 backend、复用的 `Float32Array`。
- `process()` 要求传入尺寸与创建尺寸一致，否则抛出明确错误；同一长条模板布局尺寸固定。
- 每帧只做 `getImageData` → 写复用的 Float32Array → `backend.render` → `release` → `putImageData`。
- `dispose()` 只释放 backend 与后端资源；不触碰画布。
- 现有 `applySpectralToAperture()` 改为内部创建独立 session、处理一帧、`finally dispose`，保持单张与旧调用行为。

长条级使用：
- 非 Gold 的 `renderFlattenedReal135Strip`：按 `layout.frame.imageW/H` 创建 session，在 `finally` 释放。
- Gold 200 的 Worker / 主线程长条分支：按 `layout.frame.imageW/H` 创建 session，在 `finally` 释放。
- 每帧 `process(ctx, imageX, imageY, imageW, imageH)`；Gold 在 `imagingMode==='spectral'` 时不再调用 `applyGold200Look`。
- Worker 终止或异常时不跨长条复用；主线程路径必须 `finally dispose`。

## 4. 渲染分支

### 4.1 非 Gold

`drawFlattenedReal135Frame` 增加可选 `session`：
- `session` 存在时调用 `session.process(...)`，否则保持现有 `applySpectralToAperture`。
- 调用顺序不变：铺模板 → 贴照片 → 光谱 → 颗粒 → rebate → 齿孔 → 帧号。
- Worker `renderFlattenedReal135Strip` 与主线程 `drawKodakGoldTemplateFrame` 都传入同一 session。

### 4.2 Gold 200

Worker `renderReal135Strip` 与主线程 `generateReal135FilmStrip` 的 Gold 分支：
1. 先铺连续胶片行底。
2. 每帧贴照片后：
   - `supportsSpectral(settings)` 为真：`session.process(...)`。
   - 否则：现有 `applyGold200Look(...)`。
3. 再按现有顺序叠加颗粒、边框描边和连续片边标记。

Gold 专用布局、行数、间距、输出尺寸与帧号逻辑不变。

## 5. 错误与状态

- 标准组合不再进入 `App.tsx` 的 “single frames only” 错误分支。
- 若旧配置 `useFilmOverlayTemplate=false` 仍触发，错误应说明模板路径已关闭，而不是笼统说“只支持单张”；UI 可继续使用现有错误弹窗与保留策略。
- 长条失败时保留单张成片与旧长条，不发布部分结果。
- Worker 超时继续走现有 `WorkerTimeoutError` 分支，与本限制无关。

## 6. 兼容与性能

- `renderAdmission.getStripCanvasSize` 不需要改；模板长条尺寸与现在完全一致。
- 36 帧模板长条约 40MP、160MB 级别，低于默认预算；硬上界仍是 Canvas 边长 32767。
- 共享 session 后，后端只创建一次；峰值 working set 由单帧尺寸决定。
- 需要实测 CPU 与 WebGL2 耗时；若 36 帧超时不可接受，应先限制帧数或提示，不发布卡死路径。

## 7. 测试设计

### 单元

- `spectralStripSupported`：
  - spectral + physical → true
  - spectral + legacy-template + 支持光谱 + 模板开启 → true
  - spectral + legacy-template + blocked stock → false
  - spectral + legacy-template + `useFilmOverlayTemplate=false` → false
  - legacy 成像 → false
- `createSpectralApertureSession`：创建一次后端、尺寸不匹配抛错、`dispose` 调用一次；单张包装路径每次释放。
- `filmWorkerClientFallback`：光谱模板长条不再以 `single frames only` 拒绝。
- 旧的“unsupported”断言改为“成功进入渲染路径”。

### 几何

- `renderAdmission` 模板/物理/经典长条尺寸基线不变。
- 36 帧模板长条不触预算；超上限仍给出既有错误。

### Playwright

- Gold 200 + spectral + template + strip：成功出图，长条可见，无“需要处理”弹窗。
- Portra 400 同样成功。
- Gold 200 + spectral + template + single：仍成功，行为不变。
- Gold 200 + legacy + template + strip：仍走 Gold look（与光谱输出有明显差异）。
- 物理片边光谱长条、经典色彩长条不变。
- 强制主线程与 Worker 都跑同一用例，输出尺寸与非空一致。

### 像素一致性

- 同一胶片、同照片、同设置：单张光谱输出的片窗矩形与长条第一帧对应区域比较，允许既定容差；分别验证 CPU 与 WebGL2。
- Gold 200 与一款非 Gold 各一组；记录容差与失败样例。

### 性能

- 复用 `tests/e2e/strip-performance.spec.ts` 的探针，记录 4/12/36 帧预览耗时与后端创建次数。
- 断言长条只创建一个 session；耗时明显优于逐帧创建的后端生命周期基线。

## 8. 受影响文件

- `services/spectral/scope.ts`
- `services/spectral/canvasAdapter.ts`
- `services/filmWorker.ts`
- `services/filmEngine.ts`
- `services/filmWorkerClient.ts`（仅守卫类型与错误）
- `App.tsx`（错误映射与旧配置文案）
- `tests/filmWorkerClientFallback.test.ts`
- `tests/renderAdmission.test.ts`
- `tests/e2e/spectral-production.spec.ts`
- `tests/e2e/physical135.spec.ts`
- 新增 `tests/e2e/spectral-template-strip.spec.ts`
- `tests/e2e/strip-performance.spec.ts`
- `README.md`、`handoff.md`、`docs/project/rendering.md`、`docs/project/product-workflows.md`
- `.trellis/spec/frontend/spectral-rendering.md`

## 9. 回滚

- 恢复 `assertSpectralStripSupported` 的旧限制即可回退入口。
- 共享 session 与渲染分支可独立回退；内部枚举、存储和输出尺寸未变。
- 模板资产与既有光谱单张路径不受影响。
