# Research: 光谱 + 模板片边 + 胶片长条 的技术可行性

- Query: 光谱负片 + 模板片边选择「胶片长条」被阻止；限制来自哪、为什么、能否支持、四条路线成本/风险
- Scope: internal（渲染/Worker/引擎/admission/测试）+ 设计文档
- Date: 2026-11-19
- 配套文件：`research/ux-options.md`（用户侧交互方案，本文件聚焦渲染与数据流）

> 证据分级标记：**[已证]** 实际代码/测试/文档；**[推断]** 由代码结构合理外推；**[未知]** 未验证。

---

## 1. 限制来源：函数与条件

唯一限制点在 `services/spectral/scope.ts:3-7` **[已证]**：

```ts
export function assertSpectralStripSupported(settings: Pick<FilmSettings, 'imagingMode' | 'edgeRenderMode'>): void {
  if (settings.imagingMode === 'spectral' && settings.edgeRenderMode !== 'physical135') {
    throw new Error('Spectral film processing currently supports real-135 single frames only; strip rendering is not yet available.');
  }
}
```

条件含义：**`imagingMode === 'spectral'` 且 `edgeRenderMode !== 'physical135'` 即抛错**。`EdgeRenderMode` 只有 `'legacy-template'`（模板片边）与 `'physical135'`（物理片边）两个值（`types.ts:45`），所以被拦截的就是「光谱 + 模板片边」。

App 层把该异常的 message 映射为用户可见文案（`App.tsx:757-758`）：

```ts
: e instanceof Error && e.message.includes('single frames only')
  ? '光谱负片使用模板片边时仅支持单张；胶片长条请改用物理片边或经典色彩。'
```

### 三处调用（同一函数，双重兜底）**[已证]**

| 位置 | 作用 |
|---|---|
| `services/filmWorkerClient.ts:306` | `generateFilmStrip` 首行同步断言，**早于 Worker/主线程分配**（客户端入口） |
| `services/filmEngine.ts:1319` | 主线程引擎 `generateFilmStrip` 入口（主线程兜底） |
| `services/filmWorker.ts:967` | Worker `onmessage` 收到 `generateFilmStrip` 时（Worker 兜底） |

### 为什么存在：能力限制、预算限制，还是历史缺失？

**结论：主因是「按设计划定的实现边界 + 未做验证」，不是硬性渲染能力或内存上界。** **[推断，证据如下]**

证据：

1. **渲染原语已经存在且已被用于按帧光谱**。模板长条路径 `renderFlattenedReal135Strip`（`services/filmWorker.ts:838`）逐帧调用 `drawFlattenedReal135Frame`（`services/filmWorker.ts:439`），其中第 464 行就是 `await applySpectralToAperture(ctx, layout.imageX, ...)`。也就是说：**非 Gold 的模板长条每一帧本身就具备执行光谱的代码路径**，只是被 `assertSpectralStripSupported` 在入口处提前拦下。**[已证]**
2. **物理长条（允许光谱）与模板长条共用同一批光谱原语**（`applySpectralToAperture` / `createSpectralBackend`），差异只是物理长条额外用了共享 session（`services/physical135/strip.ts:143-144`）。**[已证]**
3. **无任何内存/像素预算直接把模板光谱长条判为不可行**：`assertSpectralStripSupported` 只读 `imagingMode` 与 `edgeRenderMode`，完全不看帧数、尺寸、预算。**[已证]**
4. 文档明确写成「暂不支持」而非「不支持」：`docs/project/rendering.md:9`「光谱配合贴图片边时只支持单张」；`docs/project/product-workflows.md:118`「光谱成像与贴图片边组合暂不支持长条」；`README.md:19`。**[已证]**
5. `services/spectral/scope.ts` 与光谱/物理功能在同一提交 `463895b "feat(render): add spectral imaging and physical 135"`（2026-11-14）一次性引入，没有后续单独实现模板光谱长条。**[已证]**

因此判断：这是**历史实现缺失（先支持单张 + 物理长条，模板长条留白）**，叠加一个**保守验证边界**。以下次要因素也是当初划界的合理理由 **[推断]**：

- **每帧一个光谱 backend 生命周期**：`applySpectralToAperture` 内部每次 `createSpectralBackend(...)` 并在 `finally` 里 `dispose()`（`services/spectral/canvasAdapter.ts:48-89`）。N 帧即 N 次资源加载 + 后端创建/销毁，未做 session 复用（物理长条做了）。慢，但可行。
- **Kodak Gold 200 的模板长条分支不跑光谱**：worker `renderReal135Strip`（`services/filmWorker.ts:894`）在 Gold 分支走 `applyGold200Look`（约 894-960 行），主线程 `generateReal135FilmStrip`（`services/filmEngine.ts:966`）Gold 分支同样用 `applyGold200Look`。所以即使放开守卫，**Gold 200 模板长条仍不会变光谱**，需要额外补分支。**[已证]**

---

## 2. 光谱 + 模板片边「单张」当前完整数据流

入口 App 默认值即为该组合：`imagingMode:'spectral'`、`frameRenderMode:'real135'`、`edgeRenderMode:'physical135'`、`useFilmOverlayTemplate:true`（`App.tsx:119-129`）；用户将片边切到「模板片边」后成立。**[已证]**

单张链路（Worker 优先，失败回主线程，二者都实现同一套）：

1. `generateFilmStrip` 不对单张生效；单张走 `processImage`。Worker 决策：`shouldUseWorkerForSettings`（`services/filmWorkerClient.ts:107-113`）要求 `real135 && supportsReal135Template(brand) && useFilmOverlayTemplate !== false`。**[已证]**
2. Worker `renderReal135Frame`（`services/filmWorker.ts:519`）：`edgeRenderMode !== 'physical135'` → 若非 Gold 走 `renderFlattenedReal135Frame`（`:475`）。
3. `drawFlattenedReal135Frame`（`:439`）：
   - 填底 `#050403`；`useFilmOverlayTemplate` 时 `ctx.drawImage(overlay, 0,0,filmW,filmH)` 铺模板（`:453`）。
   - `drawImageCoverAutoRotate` 把源图按 cover+旋转画到片窗 `layout.imageX/Y/W/H`（`:454-462`）。
   - **光谱只作用于片窗像素**：`applySpectralToAperture(ctx, layout.imageX, layout.imageY, layout.imageW, layout.imageH, settings)`（`:464`）。
   - 叠加颗粒、模板 rebate 覆盖层、齿孔遮罩、帧号（`:465-472`）。
4. `applySpectralToAperture`（`services/spectral/canvasAdapter.ts:18-90`）：
   - `supportsSpectral` 要求 `imagingMode==='spectral' && supportsSpectralStock(brand) && frameRenderMode==='real135' && useFilmOverlayTemplate !== false`（`:10-16`）——**光谱本身依赖模板开启**。
   - `getImageData(片窗)` → 转 ProPhoto/单色 → `backend.render({width,height,pixels})` → `readRgb` → 写回 `putImageData`。
   - 每帧创建并 `dispose` 一个 `createSpectralBackend`；limits 为 `maxPixels = w*h`，`maxWorkingSetBytes = w*h*7*3*4 + 81*3*8`（CineStill 另加）。
5. 模板合成：overlay 是完整「卡片」（含左右片边与上下 rebate），`drawKodakGoldOverlayLayer` 在片窗四周重贴 overlay 边条（`services/filmOverlay.ts:207+`）。

**结果尺寸**：`createKodakGoldOverlayLayout(targetImageWidthPx)`（`services/filmOverlay.ts:115`）以模板 1307×1203 为基准（`TEMPLATE_W/H` `:24-25`），APERTURE 为 `x=92/1307, y=211/1203, w=1123/1307, h=800/1203`（`:68-73`）：
- `filmW = round(targetImageWidthPx / (1123/1307))`；`filmH = round(filmW*1203/1307)`。
- 单张 preview `targetImageWidthPx=1200` → filmW≈1396, filmH≈1285；另有 `scanOutputAspect==='4:3'` 时经 `getScannerCanvasSize` 再外包一层。
- 预算：单张走 `evaluateSingleImageRenderAdmission` / `getSingleImageCanvasSizes`（`services/renderAdmission.ts:69-116`），模板分支即 `createKodakGoldOverlayLayout`；`scanOutputAspect` 默认模板为 `'native'`（`:112`）。默认上限 `maxEdge=32767`、`maxPixels≈6GiB/4`（`services/renderBudget.ts:11-19`）。

---

## 3. 长条现有路径

入口统一：App `processAll()`（`App.tsx:542+`）→ `batchMode==='strip'` → `evaluateBatchAdmission({operation:'strip', stripCanvas:getStripCanvasSize(settings, n)})`（`App.tsx:582-592`）→ `generateFilmStrip`（`services/filmWorkerClient.ts:301`）。

`getStripCanvasSize`（`services/renderAdmission.ts:119`）按 `edgeRenderMode` / 模板能力分支，**不读 `imagingMode`**。`batchAdmission`/`renderAdmission`/`filmResolution` 均无光谱相关判断 **[已证]**。

| 路径 | 触发条件 | 入口 | 几何 / 尺寸 | Worker | 输出 |
|---|---|---|---|---|---|
| **A. 模板长条（非光谱）** | `real135` + 模板可用 + `useFilmOverlayTemplate!==false`，`edgeRenderMode==='legacy-template'` | Worker `renderReal135Strip:894`（非 Gold→`renderFlattenedReal135Strip:838`；Gold→894-960 分支）。主线程 `generateReal135FilmStrip:966`（非 Gold `drawKodakGoldTemplateFrame`；Gold 专用分支） | `createFilmTemplateStripLayout`（`filmOverlay.ts:175`）：每帧 `filmW×filmH`，**`frameGap=0`**，整幅卡片相接；`maxPerRow=4`；`totalW = padding*2 + cols*filmW`，`totalH = padding*2 + rows*filmH + (rows-1)*rowGap`。preview 每帧宽 900/高清 1400（`filmResolution.ts:27`） | **是**（`shouldUseWorkerForSettings` 满足） | `canvasToBlob` |
| **B. 物理长条（可光谱）** | `edgeRenderMode==='physical135'` | Worker `:901`，主线程 `filmEngine:1321` → `renderPhysicalStripCanvas`（`physical135/strip.ts:103`） | `createPhysicalStripPlan`（`strip.ts:41`）：`pxPerMm=round(stripTarget/36)`；每帧走片 `advance=38mm`，高 `35mm`；`outputWidth = count*38*pxPerMm`，`outputHeight = 35*pxPerMm`。preview→`pxPerMm=25`（单帧 950×875，见 `renderAdmission.test.ts:52` 10 帧=9500×875）。连续单条，**无换行** | **是** | `canvasToBlob` |
| **C. 经典边框长条** | `frameRenderMode==='classic'`，或 `real135` 但无模板（`!supportsReal135Template`）或 `useFilmOverlayTemplate===false`（`filmWorker:905` → `renderClassicStrip:640`；主线程 `generateReal135FilmStrip` 返回 null 后落到通用经典长条 `filmEngine:1330+`） | Worker `renderClassicStrip` | 固定 `frameHeight=1200`，`borderSize=16%`，`frameWidth=imageHeight*1.5`，`gap=frameWidth*0.055`，**`maxPerRow=6`**；`totalHeight = rows*1200+(rows-1)*100`（对齐 `renderAdmission.getStripCanvasSize` 非模板分支） | **是** | `canvasToBlob` |

补充：
- 物理长条光谱通过 **共享 session** 实现：`paintPhysicalStrip` 里 `plan.kind==='spectral-negative'` 时一次性 `createPhysicalSpectralSession`（`physical135/strip.ts:143-144`），逐帧 `renderPhysicalSpectralCanvas`，`finally` 释放（`strip.ts` 末尾）。**[已证]**
- 「经典色彩」（`imagingMode='legacy'`）不触发光谱守卫：`assertSpectralStripSupported` 要求 `imagingMode==='spectral'`，故 legacy 长条任何片边组合都放行。

---

## 4. 若要支持「光谱 + 模板片边长条」的最小正确实现

### 4.1 逐张光谱后按模板拼接 vs 全帧一次光谱 pipeline

**结论：必须逐张（按帧）光谱，再按模板帧拼接。全帧一次性 pipeline 不是现有设计。** **[已证 + 推断]**

- `SpectralBackend.render(image: RgbImage)` 只接收单一 `{width,height,pixels}` 图像（`services/spectral/backend.ts:30-33`），物理长条也是逐帧 `renderPhysicalSpectralCanvas`。全帧一次性意味着把整条片窗拼成一张巨图送入 backend，像素量与 working set 都随帧数线性放大，且破坏「每帧独立显影、共享 roll 材质」的既有契约（`spec/frontend/spectral-rendering.md`：each strip frame develops independently）。**[已证]**
- 最小正确做法 = 复用已有的**按帧**原语：每帧把源图画进片窗 → `applySpectralToAperture(片窗)` → 叠加模板/颗粒/齿孔 → 绘入长条 canvas。这条路 `renderFlattenedReal135Strip` 已存在（`filmWorker.ts:838`），非 Gold 股票**已经就是这样写的**。

### 4.2 需要改哪些文件 / 协议 / admission / 签名 / 测试 **[推断]**

最小集合：

1. `services/spectral/scope.ts`：把断言从「`edgeRenderMode !== 'physical135'` 即禁止」改为按「该 stock + 该渲染路径是否真正执行光谱」判定，或直接放开、把校验下沉到各渲染路径。
2. `services/filmWorker.ts` / `services/filmEngine.ts`：Gold 200 模板长条分支（worker `:894` 起、engine `:966` Gold 分支）目前用 `applyGold200Look`，若允许 Gold 光谱长条需补 `supportsSpectral` 分支；非 Gold 分支已具备光谱。
3. 可选但强烈建议：仿物理长条引入**长条级共享光谱 session**，避免每帧 `createSpectralBackend`/`dispose`。当前 `applySpectralToAperture` 无 session 参数（`canvasAdapter.ts:18`），需新增一个接受 session 的变体；`canvasAdapter` 还需支持「帧尺寸固定」的复用前提（backend 的 canvas 尺寸在 `createSpectralBackend` 时固定）。
4. admission：`assertSpectralStripSupported` 目前**不在** admission 链路内；放开后 admission 无需改（已谱无关），但可在 admission 增加「光谱长条帧数上限」提示（见 4.3）。
5. 协议：`WorkerRequest` / `WorkerResponse` 类型（`filmWorkerClient.ts:22`、`:44`）无需新增字段（仍发整卷 `images`），若采用 session 复用也只是 Worker 内部实现。
6. 测试：
   - 单元：`tests/filmWorkerClientFallback.test.ts:250-260` 的 `rejects.toThrow('single frames only')` 需重写为「模板光谱长条被接受」。
   - e2e：`tests/e2e/spectral-production.spec.ts:132-143`、`tests/e2e/physical135.spec.ts:438-451` 两条「explicitly unavailable」断言需替换为成功渲染断言。
   - 建议新增 `spectral-physical-parity` 风格的模板光谱长条像素/一致性测试（现有 `tests/e2e/spectral-physical-parity.spec.ts` 可作模板）。

### 4.3 帧数 / Canvas / 内存上界，是否有硬阻塞

**无硬阻塞，但存在与大帧数相关的两个真实上界** **[推断，基于 renderBudget 常量]**：

- **边长 32767**（`renderBudget.ts:11`）。模板长条每行 4 帧、垂直堆叠：`totalH = padding*2 + rows*filmH + (rows-1)*rowGap`。preview 单帧 filmH≈964、rowGap≈77 → 约 **135 帧**触顶；物理长条水平展开 `count*950px` → 约 **34 帧**触顶（`renderAdmission.test.ts:52` 10 帧=9500）。回到整卷上限 `maxRollFrames=36`（`App.tsx:126`），模板长条在 36 帧内不会触顶。
- **像素预算**：默认 `maxPixels = 6144MiB/4 ≈ 1.61e9`。模板 36 帧（9 行）约 `4260×9364 ≈ 39.9MP ×4 ≈ 160MB`，远低于上限。**[推断]**
- **光谱 working set**：`applySpectralToAperture` 每帧 `~w*h*7*3*4` 字节，帧尺寸固定、逐帧串行且立即 dispose（`canvasAdapter.ts:57-59, 89`）→ 峰值由「单帧 working set + 长条 canvas」决定，不随帧数累加。**因此内存不是阻塞点**；真正成本是**时间**（N 次资源加载 + N 次 backend 创建/销毁）。**[推断]**

**是否需要限制帧数或分块**：**[推断]** 典型整卷（≤36 帧）在模板布局下不触任何上界，无需分块；但考虑到每帧光谱耗时，建议在 admission 层对「光谱 + 模板长条」给出帧数/耗时提示或上限（复用 `BATCH_ADMISSION_LIMITS` 风格），而非硬失败。

### 4.4 模板尺寸与光谱输出的兼容性

**[已证]** 模板是完整卡片：`TEMPLATE_W/H = 1307×1203`，片窗 `1123×800`，由 `createKodakGoldOverlayLayout` 按目标片窗宽等比缩放（`filmOverlay.ts:115-135`）。模板长条用 `createFilmTemplateStripLayout`，**`frameGap=0`**，每帧占满 `filmW`（完整卡片，字幕/片边都在卡内），所以相邻帧是「卡片贴卡片」，不是「仅片窗」。**[已证]**（`filmOverlay.ts:175-206`）

光谱只改片窗像素（`applySpectralToAperture(片窗)`），不影响卡片片边；模板作为 overlay 先贴底、后叠 rebate（`drawFlattenedReal135Frame`）。**二者尺寸体系天然兼容**：光谱作用区域 = 模板卡片内的片窗矩形 = `layout.imageX/Y/W/H`，与单张路径完全同一几何，无需为长条改尺寸映射。

> 注：Gold 200 用的是另一套 `createKodakGoldStripLayout`（`filmOverlay.ts:137`），`frameGap = imageW*0.065`、基于片窗而非整卡宽度。若要 Gold 光谱长条，几何与光谱需分别按该布局核对（`renderAdmission.test.ts:41` 4 帧→3998×1038）。

---

## 5. 四条路线成本 / 风险

> 事实/推断/未知已分列。工作量单位为人日粗糙估计，非承诺。

| 路线 | 内容 | 事实依据 | 推断工作量 | 风险 |
|---|---|---|---|---|
| **A. 真正支持长条** | 放开守卫 + 逐帧光谱 + 模板拼接 | 非 Gold 模板长条已含 `applySpectralToAperture`（`filmWorker.ts:464/588`）；物理长条已示范共享 session（`physical135/strip.ts:143`） | 中（1-3 人日）：改 scope + 补 session 复用 + Gold 分支 + 3 处测试重写 + 数值/像素验收 | **中**。① 每帧 backend 生命周期导致慢，需 session 复用否则大卷卡顿；② Gold 分支不走光谱，必须单独处理否则静默出错误结果；③ 需证明与单张光谱像素一致（parity），否则「同设置单张/长条不一致」；④ 文档/README 措辞需同步 |
| **B. UI 层禁止组合** | 选中即禁用/自动切换（选光谱时禁模板+长条，或选长条时把片边切物理/色彩） | 已有自动纠正先例：`RecipeInspector.tsx:346-348`、`settingsStorage.ts:180-181`、`App.tsx:222-224/1114` | 小（0.5-1 人日） | **低**。需定义权威组合规则与提示；不改变渲染，无像素风险。缺点：剥夺用户组合自由度，且「片边」与「出片方式」分处两个面板，联动规则要清晰 |
| **C. 弹窗一键改物理/色彩** | 保留现状，弹窗给「改用物理片边 / 改用经典色彩」两个动作 | `ErrorDialog` 支持 `onRetry`/`onSupport`（`components/feedback/ErrorDialog.tsx`）；catch 已能区分该错误（`App.tsx:757`） | 小-中（0.5-1.5 人日）：catch 分支改为带动作回调；动作改 settings 后可选自动重跑 | **低-中**。改动面小；需保证切换后是新设置生效（generation/settingsKey 已存在，`App.tsx:696` 附近 `acceptImageRenderResult`）；避免双重弹窗（先 admission 后该错误） |
| **D. 仅改文案** | 维持现状，不改行为 | 现状即此 | 极小（<0.5 人日） | **低**。最快，但用户仍被挡，未解决诉求；文案已在 `App.tsx:758` 与两处 e2e 断言/文档绑定，改字需同步 `tests/e2e/spectral-production.spec.ts:138`、`tests/e2e/physical135.spec.ts:444`、`README.md:19`、`docs/project/rendering.md:9`、`docs/project/product-workflows.md:118` |

### 推荐顺序 **[推断，非既有结论]**

1. **C（弹窗一键改）** 最低风险解决「用户被卡死、不知怎么办」，且复用现成 `ErrorDialog` 动作能力与 catch 分支点。可作为立即交付。
2. **A（真正支持）** 若产品确认「光谱 + 模板长条」是核心诉求则应做，但需接受中风险与 parity 验收成本；建议先做非 Gold 股票的 session 复用版，Gold 单独决策。
3. **B（UI 禁止）** 若倾向「不新增渲染路径」，B 比 C 更早拦截（用户不用走完流程才被拒），但需明确组合规则；B 与 C 不冲突，可叠加。
4. **D（仅改文案）** 仅作为「先止血、明确不做 A」时的兜底，单独 D 价值最低。

**关键依赖**：是否做 A 取决于产品对「模板片边长条必须光谱」的取舍；B/C/D 都不依赖 A。

---

## 6. 受影响文件 file:line 清单

### 限制与调用
- `services/spectral/scope.ts:3-7` — 唯一限制函数（`assertSpectralStripSupported`）
- `services/filmWorkerClient.ts:5,301-324` — import + `generateFilmStrip`（含 `:306` 断言，Worker 前）
- `services/filmEngine.ts:54,1313-1340` — import + 主线程 `generateFilmStrip`（含 `:1319` 断言）
- `services/filmWorker.ts:3,967` — import + Worker `onmessage` 断言

### 渲染路径
- `services/filmWorker.ts:439-473` — `drawFlattenedReal135Frame`（`:464` 光谱）
- `services/filmWorker.ts:475-517` — `renderFlattenedReal135Frame`
- `services/filmWorker.ts:838-891` — `renderFlattenedReal135Strip`（模板长条，非 Gold）
- `services/filmWorker.ts:894-960` — `renderReal135Strip`（`:901` 物理 / `:905` classic / `:912` flattened / Gold 分支）
- `services/filmWorker.ts:640-690` — `renderClassicStrip`
- `services/filmEngine.ts:966-1120` — `generateReal135FilmStrip`（模板长条，非 Gold `drawKodakGoldTemplateFrame`，Gold 分支）
- `services/filmEngine.ts:690-790` — `drawKodakGoldTemplateFrame`（`:774` 光谱）

### 光谱适配与后端
- `services/spectral/canvasAdapter.ts:10-16` — `supportsSpectral`
- `services/spectral/canvasAdapter.ts:18-90` — `applySpectralToAperture`（每帧 backend 生命周期 `:48-89`）
- `services/spectral/backend.ts:24-87` — `SpectralBackend` 接口与 CPU 实现（逐帧 `render`）
- `services/spectral/stockRegistry.ts` — `SPECTRAL_STOCKS` / `supportsSpectralStock`

### 物理长条（可复用参照）
- `services/physical135/strip.ts:41-60` — `createPhysicalStripPlan`
- `services/physical135/strip.ts:103-176` — `renderPhysicalStripCanvas` / `paintPhysicalStrip`（`:143-144` 共享 session）
- `services/physical135/spectralAdapter.ts:48-79` — `createPhysicalSpectralSession`
- `services/physical135/capability.ts:4-18` — `PHYSICAL_SPECTRAL_UNSUPPORTED` / `supportsPhysicalSpectralStock`
- `services/physical135/plan.ts:155-169` — `assertPhysicalCombination`

### 几何 / 布局 / 预算
- `services/filmOverlay.ts:24-25,68-73` — `TEMPLATE_W/H`、`APERTURE`
- `services/filmOverlay.ts:115-135` — `createKodakGoldOverlayLayout`
- `services/filmOverlay.ts:137-173` — `createKodakGoldStripLayout`（Gold，frameGap=imageW*0.065）
- `services/filmOverlay.ts:175-206` — `createFilmTemplateStripLayout`（**frameGap=0**）
- `services/filmResolution.ts:20-30` — `getReal135StripTargetImageWidth`（preview 900 / 高清 1400）
- `services/renderAdmission.ts:69-116` — 单张尺寸/准入（模板分支）
- `services/renderAdmission.ts:119-158` — `getStripCanvasSize`（物理/模板/经典三分支）
- `services/renderBudget.ts:11-24` — `maxEdge=32767`、`maxPixels≈6GiB/4`
- `services/batchAdmission.ts` — `BATCH_ADMISSION_LIMITS`（长条 canvas 计入工作集）

### UI / 文案 / 状态
- `App.tsx:757-758` — 异常→文案映射
- `App.tsx:582-592,619-640` — 长条 admission 与 `generateFilmStrip` 调用
- `App.tsx:1726-1730` — `<ErrorDialog>`（当前无 `onRetry`）
- `App.tsx:119-129` — 默认设置（spectral + physical135）
- `components/settings/RecipeInspector.tsx:249-283` — 成像方式
- `components/settings/RecipeInspector.tsx:336-361` — 片边方式（含 `:346-348` 自动降级先例）
- `services/settingsStorage.ts:206-230` — `normalizeSpectralRenderMode`
- `services/physical135/capability.ts:20-22` — `defaultEdgeForStock`
- `services/renderModePresentation.ts` — `EDGE_MODE_LABELS`

### 测试 / 文档
- `tests/filmWorkerClientFallback.test.ts:250-260` — `rejects.toThrow('single frames only')`（需改）
- `tests/e2e/spectral-production.spec.ts:132-143` — 「explicit single-frame boundary」（需改）
- `tests/e2e/physical135.spec.ts:438-451` — 「legacy spectral strips remain explicitly unavailable」（需改）
- `tests/renderAdmission.test.ts:41-52` — 长条尺寸断言（模板 3998×1038 / 物理 9500×875，几何回归基线）
- `tests/e2e/strip-performance.spec.ts` — 长条性能探针（物理光谱 cpu/webgl2，可作光谱长条性能基线）
- `README.md:19`、`handoff.md:33-37`、`docs/project/rendering.md:9`、`docs/project/product-workflows.md:118`
- `.trellis/spec/frontend/spectral-rendering.md`（物理光谱长条契约 `:193-199`；「dynamic resource load for spectral single-frame rendering」`:157-159`）
- `.trellis/spec/frontend/component-guidelines.md:54`、`.trellis/spec/frontend/state-management.md:27-31`

### 验证方案 **[推断]**
1. 单元：改写 `filmWorkerClientFallback.test.ts` 断言为「模板光谱长条不再抛错且进入 Worker/主线程」；新增 Gold 与非 Gold 两条分支测试。
2. 几何回归：`renderAdmission.test.ts` 保持模板/物理/经典尺寸基线不变。
3. e2e：`spectral-production` / `physical135` 中两条「不可用」断言替换为「成功渲染 + 长条图存在」；新增模板光谱长条像素/尺寸断言（可参考 `spectral-physical-parity.spec.ts`）。
4. 像素一致性：对同一 stock 单张光谱 vs 模板长条单帧，比较片窗像素（CPU 与 WebGL2 各一遍），验证无二次颜色转换或尺寸错位。
5. 性能：用 `strip-performance.spec.ts` 的探针跑 cpu/webgl2 × 帧数梯度，确认 session 复用后耗时可接受；不通过则退回路线 B/C。
6. Worker/主线程双路：`worker-main-thread-fallback.spec.ts` 思路，强制主线程与 Worker 各出一遍，比较输出。
7. 预算边界：构造大帧数（如 36 帧）确认不触 `maxEdge`；构造超限帧数确认 admission 给出可读提示而非崩溃。

---

## Caveats / 未验证

- **[未知]** 模板光谱长条的**绝对耗时**与 memory 峰值未实测；「内存非阻塞」是基于 `renderBudget` 常量与逐帧串行 dispose 的推断，需用 `strip-performance.spec.ts` 探针确认。
- **[未知]** Gold 200 光谱长条的**几何正确性**（`createKodakGoldStripLayout` + 光谱 + Gold look 互斥处理）未验证。
- **[未知]** 恒等/parity 精度：模板长条光谱与单张光谱是否像素级一致，未做实测。
- **[推断]** 「限制主因是历史缺失」基于三处调用、渲染原语已存在、文档措辞「暂不支持」、单提交引入四点；若团队另有未记录原因（例如曾实测 Gold/某些 stock 结果错误），本结论需修正——建议向作者确认。
- 本文件未改动任何生产代码或配置，仅新增研究文件。
