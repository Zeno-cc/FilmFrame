# Research: 渲染模式（片边 / 底片 / 成像）审计

- Query: 精简渲染模式，只保留光谱胶片的真实 135；重命名“真实 135 / 物理底片”
- Scope: internal（源码、测试、文档、资产来源记录）
- Date: 2026-11-18
- 代码基线：当前工作区（`git status` 显示 App.tsx、RecipeInspector.tsx、filmWorker.ts、rendering.md 等 20+ 文件有未提交修改）。本文行号取自当前工作区，不是 `HEAD`；提交或 rebase 后需重新核对。

## 0. 结论摘要

1. 界面上看似“两套模式”，代码里实际是 **三个正交字段**：
   - `frameRenderMode: 'classic' | 'real135'` —— 是否使用真实 135 模板体系（UI 标签“片边模式：真实 135 / 经典片边”）。
   - `edgeRenderMode: 'legacy-template' | 'physical135'` —— 在“真实 135”内部选择片边实现（UI 标签“底片渲染：真实 135 贴图 / 物理底片”）。
   - `imagingMode: 'legacy' | 'spectral'` —— 色彩成像（UI 标签“成像方式：经典色彩 / 光谱模拟”）。
2. “经典片边”= `frameRenderMode='classic'`，走 `renderClassicFrame` / `renderClassicStrip` 的程序化边框；它 **不是** `edgeRenderMode='legacy-template'`。
3. “真实 135 贴图”= `frameRenderMode='real135'` + `edgeRenderMode='legacy-template'`，与“真实 135”共用同一套模板渲染入口。**两者不是两个可并存的功能，而是父模式和它的一个实现选项。**
4. “物理底片”= `frameRenderMode='real135'` + `edgeRenderMode='physical135'`，走 `services/physical135/` 的几何 + 材质 + 可选光谱显影。
5. “真实 135 模板是 AI 生成”在仓库中 **不能直接证实**。可证实的是：资产被记录为 “user-provided generated film-border artwork”，生成工具/提示词/权利均未记录（见 §4）。这是强推断，不是已验证事实。
6. `edgeRenderMode='legacy-template'` **不能删除**：它是 9 款有光谱、但没有已验收物理片边的胶片的唯一片边路径，也是“光谱 + 单张”的既有组合（CineStill、反转片、黑白片等）。删除它会直接移除这些胶片的可用功能。
7. 最小、可回滚的切分是：先改文案 → 再隐藏并强制 `frameRenderMode='real135'`（保留旧枚举解析）→ 最后单独删死代码。不要在第一步就删除枚举值或改持久化键。

---

## 1. 字段模型（事实）

定义位置：`types.ts:41-45`、`types.ts:61-96`。

| 字段 | 类型 / 取值 | 默认值（新会话） | 读取点（主要） |
|---|---|---|---|
| `frameRenderMode` | `'classic' \| 'real135'`，可选 | `'real135'`（`App.tsx:116`） | `filmWorker.ts:970/984`、`filmEngine.ts:1099/1325`、`renderAdmission.ts:73/128`、`filmWorkerClient.ts:107-113`、`RecipeInspector.tsx:107` |
| `edgeRenderMode` | `'legacy-template' \| 'physical135'`，可选 | `'physical135'`（`App.tsx:124`） | `filmWorker.ts:525/900`、`filmEngine.ts:1100/1320`、`renderAdmission.ts:79/123`、`physical135/plan.ts:149/155` |
| `imagingMode` | `'legacy' \| 'spectral'`，可选 | `'spectral'`（`App.tsx:114`） | `spectral/canvasAdapter.ts:10-15`、`RecipeInspector.tsx:249`、`physical135/plan.ts:149/162-166` |

补充事实：

- 所有缺省读取都写作 `(settings.frameRenderMode ?? 'real135')`、`(settings.edgeRenderMode ?? 'legacy-template')`、`(settings.imagingMode ?? 'legacy')`。即 **`undefined` 的语义是 real135 / 模板片边 / 经典色彩**，不是物理底片。
- `App.tsx` 的新会话默认值是 Gold 200 + 光谱 + 真实 135 + 物理底片 + 开放背光（`App.tsx:100-127`），但 `loadPreferences` 会把已存偏好叠加到这些默认值上（`App.tsx:203-206`）。
- `supportReal135Template()` 对当前 29 个 `FilmType` **全部返回 true**：`filmOverlay.ts:28-58` 有 29 个条目。因此 `RecipeInspector.tsx:301` 的“片边模式”区块对每一款胶片都会显示（`supportsReal135` 实际恒为 true）。

### 1.1 三个字段不是替代关系

`handoff.md:34` 已明确写出：“`OutputMode` 决定单张或长条；`FrameRenderMode` 决定经典或真实 135；`ImagingMode` 决定经典色彩或光谱；`EdgeRenderMode` 决定贴图或物理片边。这些维度不能互相代替。”

代码与之一致，但命名与 UI 层级造成重叠：
- “真实 135”（父模式）与“真实 135 贴图”（子选项）只差一个词，用户无法从名称判断前者是容器、后者是片边实现。
- “底片渲染”这个标签实际选择的是 **片边实现**，不是底片/负片本身；物理路径确实渲染整段负片，模板路径只是覆盖一张已生成的片边图。

---

## 2. 持久化白名单与迁移（事实）

文件：`services/settingsStorage.ts`

### 2.1 存储键与版本

- 偏好：`localStorage['filmFrame.preferences.v1']`（`settingsStorage.ts:6`）。
- 配方：`localStorage['filmFrame.recipes.v1']`（`recipeStorage.ts:4`），最多 12 条。
- 偏好包版本：`CURRENT_RENDER_PREFERENCE_VERSION = 1`（`settingsStorage.ts:7`），保存时写入 `renderPreferenceVersion`（`settingsStorage.ts:245-255`）。

### 2.2 白名单

`normalizeSettingsPatch()` 只接受下列值：

| 字段 | 允许值 | 位置 |
|---|---|---|
| `frameRenderMode` | `'classic'`, `'real135'` | `settingsStorage.ts:17`, `141-143` |
| `edgeRenderMode` | `'legacy-template'`, `'physical135'` | `settingsStorage.ts:15`, `153-155` |
| `imagingMode` | `'legacy'`, `'spectral'` | `settingsStorage.ts:13`, `133-135` |
| `physical*` | 见 `settingsStorage.ts:156-170` | |
| `filmOverlayUrl` | **不持久化**，加载时始终取默认值 | `settingsStorage.ts:191`、测试 `tests/settingsStorage.test.ts:225-233` |

未知或不合法值会被 **静默丢弃**，不会报错，也不会回退到默认值——`mergeSettings` 会用当前 `defaults` 的值（`settingsStorage.ts:181-192`）。这对重命名是高风险点：旧配方里的旧枚举名会消失，而不是被映射。

### 2.3 现有迁移逻辑

`mergeSettings()`（`settingsStorage.ts:175-193`）：

```ts
...(renderPreferenceVersion < CURRENT_RENDER_PREFERENCE_VERSION && normalized.edgeRenderMode === undefined
  ? { edgeRenderMode: 'legacy-template' as const } : {}),
...(renderPreferenceVersion < CURRENT_RENDER_PREFERENCE_VERSION && normalized.imagingMode === undefined
  ? { imagingMode: 'legacy' as const } : {}),
...compatibleEdge,
```

- 版本 0（没有 `renderPreferenceVersion` 的旧包）且字段缺失 → 强制 `legacy-template` + `legacy` 色彩。
- `compatibleEdge`：当 `imagingMode === 'spectral'` 且该胶片没有“物理光谱”能力时，强制 `edgeRenderMode='legacy-template'`（`settingsStorage.ts:179-180`）。
- 配方应用走 `mergeSettings(current, recipe, 0)`（`App.tsx:1098-1102`），即 **每次都按版本 0 处理**：配方里缺 `edgeRenderMode`/`imagingMode` 时会被强制成 `legacy-template`/`legacy`。这是既有行为，测试 `tests/e2e/physical-migration.spec.ts:28-49` 依赖它。
- `settingsForFilmStock()` 只在显式换胶片时套用片边默认值，且仅当该胶片 **不具备** 物理光谱能力时才覆盖（`settingsStorage.ts:200-209`）。因此从 CineStill（legacy-template）切到 Portra 400（支持物理）不会自动切回 physical135。

### 2.4 版本号陷阱

现有守卫写的是 `renderPreferenceVersion < CURRENT_RENDER_PREFERENCE_VERSION`。如果只是把 `CURRENT` 从 1 改成 2：

- 版本 1 的包如果显式保存了 `edgeRenderMode`/`imagingMode`，不会被强制（因为 `normalized.* !== undefined`）。
- 但任何缺字段的旧包（包括 `applyRecipe` 永远传 0 的路径）会再次落入“legacy”分支。
- 新迁移必须写成显式区间（例如 `version >= 1 && version < 2`），不能复用当前的泛化 `< CURRENT` 判断。

---

## 3. 四个用户名称的实际代码路径

### 3.1 对照表（事实）

| UI 名称 | 实际字段与值 | 渲染入口 | 资产依赖 | 适用胶片 |
|---|---|---|---|---|
| 真实 135 | `frameRenderMode='real135'` | Worker `renderReal135Frame`（`filmWorker.ts:519`）/ 主线程 `processImage` real135 分支（`filmEngine.ts:1099-1139`） | 取决于子选项：模板 PNG 或物理计划 | 全部 29 款 |
| 经典片边 | `frameRenderMode='classic'` | Worker `renderClassicFrame` / `renderClassicStrip`（`filmWorker.ts:346/640`）；主线程 `filmEngine.ts:1141-1307`、`1330+` | **无 PNG 资产**；只用 `FILM_PRESETS` 的字体/颜色/孔型参数 | 全部 29 款 |
| 真实 135 贴图 | `frameRenderMode='real135'` + `edgeRenderMode='legacy-template'` | 与“真实 135”同一入口；Gold 走分层路径，其余走扁平模板/兼容片边 | 16 个 PNG + 11 个 `COMPATIBILITY_135_OVERLAY` 哨兵 | 全部 29 款 |
| 物理底片 | `frameRenderMode='real135'` + `edgeRenderMode='physical135'` | `services/physical135/`：`createPhysicalFilmPlan` → `renderPhysicalFrame` / `renderPhysicalStripCanvas`，光谱时走 `spectralAdapter.ts` | 无 PNG 模板；使用 `edgeRegistry.ts` 的型号片边定义 + 光谱资源 | 25 款有物理片边定义；其中 15 款可做“物理 + 光谱” |

### 3.2 模板路径的资产分层（事实）

`public/film-overlays/` 共 16 个片边 PNG（`ls` 结果）+ `film-base.png` + 2 个派生 mask。

- 16 个 PNG 对应 16 款胶片；Portra 800 PUSH1/PUSH2 复用 `kodak-portra-800.png`（`filmOverlay.ts:34-35`）。
- 其余 11 个条目是 `COMPATIBILITY_135_OVERLAY` 哨兵（`filmOverlay.ts:39-55`），运行时 **不加载图片**，改由 `paintCompatibility135Frame()` 程序化绘制通用片边（`compatibility135.ts:7-43`；Worker 的 `loadReal135Overlay` 对哨兵返回 `null`，`filmWorker.ts:177-180`）。
- 因此“真实 135 贴图”这个文案对 11 个条目并不准确：它们没有贴图，只有程序化兼容片边，并且画面里固定写有 `135 · COMPATIBILITY`（`compatibility135.ts:37`）。

### 3.3 删除“经典片边”到底删什么

删除的是 `frameRenderMode='classic'` 分支，不是 `edgeRenderMode='legacy-template'`：

- `edgeRenderMode='legacy-template'` 仍然被“真实 135”使用，且是光谱胶片唯一的模板片边路径。
- “经典片边”的可见控件全部包在 `!isReal135` 条件里（`RecipeInspector.tsx:325-338` 的片边文字、`478-549` 的日期/齿孔形状/边框色/齿孔色/文字色/边框尺寸）。
- 经典片边还影响裁剪画幅：`App.tsx:1689-1693` 只在 `isReal135Mode` 时给 `CropEditor` 传 `landscapeFrameAspect`；经典模式不限制画幅。

---

## 4. “真实 135 模板是 AI 生成”的证据核查

### 4.1 已验证事实

- `ops/provenance/manifest.json:94-101`：
  - `attribution`: “User-provided generated film-border artwork; original generator/source and rights need owner confirmation.”
  - `rightsStatus`: `owner-review`
  - `license`: `NOASSERTION`
- `ops/provenance/manifest.json:176`：“Archived task 07-14-add-remaining-real135-templates records user-supplied generated sources and normalization; … Generator/rights are not documented.”
- `ops/provenance/README.md:24`：“archived tasks establish that the film borders were **user-provided generated artwork** … They do not establish generator/tool, source inputs or redistribution permission.”
- `ops/provenance/asset-inventory.md:9`：“16 flattened stock templates plus Gold base | Historical tasks identify user-provided generated film-border artwork … | Original generator/tool/prompts/source images, copyright owner and permission …”
- 归档任务 `.trellis/tasks/archive/2026-07/07-14-add-remaining-real135-templates/prd.md`：
  - “The user supplied 12 PNG files …”（第 10 行附近）
  - “Do not add or regenerate visual content. This task performs deterministic geometry normalization only.”（需求 3）
  - 源文件名形如 `48-01-228d394f.png`、`54-01-d17750ae.png`（Source Mapping 表）。
  - `public/film-overlays/README.md`：“Do not replace a template with its raw generated image because its aperture geometry differs.”

### 4.2 推断

- 上述记录足以证明这些片边图是 **外部生成图**，被本地做几何归一化；结合批量哈希式文件名，符合图像生成工具的批量输出特征。
- 但仓库 **没有任何一行** 明确写 “AI / 模型 / 提示词 / Midjourney / 生成式”。因此“AI 生成”是合理推断，不是仓库已验证事实。

### 4.3 未知

- 具体生成工具、模型、提示词、输入素材。
- 版权归属与再分发许可（`rightsStatus: owner-review`，公开分发仍被列为阻塞项）。
- 13 个 `COMPATIBILITY_135_OVERLAY` 条目从来不是生成图，不能归入“AI 模板”。

**对命名的影响（事实约束）**：把全部模板统称“AI 模板”会错误描述 11 个程序化兼容条目；把“真实 135 贴图”改名为“AI 片边”也会让兼容条目失实。更安全的方向是“胶片模板 / 兼容片边 / 物理片边”，并把生成来源放在说明文字或 provenance，而不是字段名。

---

## 5. 光谱能力与物理能力分布（事实）

来源：`services/spectral/stockRegistry.ts:13-52`、`services/physical135/edgeRegistry.ts:21-47`、`services/physical135/capability.ts:4-22`。

- 29 款胶片中 **24 款支持光谱**；5 款 `blocked`：ColorPlus 200、Pro Image 100、Superia 400、T-Max 400、P3200。
- 25 款有物理片边定义；缺 4 款：Provia 100F、Velvia 100、Kodachrome 64、Acros II。
- `supportsPhysicalSpectralStock()` 又从 24 款光谱中排除 9 款：CineStill 800T、Provia、Velvia、Ektachrome、Kodachrome、Acros、HP5、Tri-X、T-Max 100。最终 **15 款支持“物理 + 光谱”**。

| FilmType | UI 标签 | 模板资产 | 光谱 | 物理片边 | 物理+光谱 |
|---|---|---|---|---|---|
| KODAK_PORTRA_160 | KODAK PORTRA 160 | PNG | yes | yes | yes |
| KODAK_PORTRA_400 | KODAK PORTRA 400 | PNG | yes | yes | yes |
| KODAK_PORTRA_800 | KODAK PORTRA 800 | PNG | yes | yes | yes |
| KODAK_PORTRA_800_PUSH1 | KODAK PORTRA 800 PUSH 1 | PNG（复用 800） | yes | yes | yes |
| KODAK_PORTRA_800_PUSH2 | KODAK PORTRA 800 PUSH 2 | PNG（复用 800） | yes | yes | yes |
| KODAK_EKTAR_100 | KODAK EKTAR 100 | PNG | yes | yes | yes |
| KODAK_GOLD_200 | KODAK GOLD 200 | PNG | yes | yes | yes |
| KODAK_ULTRAMAX_400 | GC 400 KODAK | PNG | yes | yes | yes |
| KODAK_COLORPLUS_200 | KODAK COLORPLUS 200 | PNG | no (blocked) | yes | no |
| KODAK_PROIMAGE_100 | KODAK PRO IMAGE 100 | PNG | no (blocked) | yes | no |
| FUJI_PROVIA_100F | FUJI PROVIA 100F | compat 哨兵 | yes | no | no |
| FUJI_VELVIA_100 | FUJI VELVIA 100 | compat 哨兵 | yes | no | no |
| KODAK_EKTACHROME_E100 | KODAK EKTACHROME E100 | PNG | yes | yes | no |
| KODAK_KODACHROME_64 | KODAK KODACHROME 64 | compat 哨兵 | yes | no | no |
| KODAK_TRI_X_400 | KODAK TRI-X 400 | PNG | yes | yes | no |
| KODAK_TMAX_100 | KODAK T-MAX 100 | PNG | yes | yes | no |
| KODAK_TMAX_400 | KODAK T-MAX 400 | PNG | no (blocked) | yes | no |
| KODAK_P3200 | KODAK T-MAX P3200 | PNG | no (blocked) | yes | no |
| FUJI_SUPERIA | FUJI SUPERIA 400 | PNG | no (blocked) | yes | no |
| FUJI_C200 | FUJI C200 | compat 哨兵 | yes | yes | yes |
| FUJI_XTRA_400 | FUJI X-TRA 400 | compat 哨兵 | yes | yes | yes |
| FUJI_PRO_400H | FUJI PRO 400H | compat 哨兵 | yes | yes | yes |
| FUJI_ACROS_II | FUJI ACROS II | compat 哨兵 | yes | no | no |
| KODAK_VISION3_50D | KODAK VISION3 50D | compat 哨兵 | yes | yes | yes |
| KODAK_VISION3_200T | KODAK VISION3 200T | compat 哨兵 | yes | yes | yes |
| KODAK_VISION3_250D | KODAK VISION3 250D | compat 哨兵 | yes | yes | yes |
| KODAK_VISION3_500T | KODAK VISION3 500T | compat 哨兵 | yes | yes | yes |
| CINESTILL_800T | CINESTILL 800T | PNG | yes | yes | no |
| ILFORD_HP5 | ILFORD HP5 PLUS | PNG | yes | yes | no |

### 5.1 “经典片边是否只用于非光谱/旧渲染”

事实上更精确：

- `supportsSpectral()` 要求 `imagingMode='spectral'` **且** `frameRenderMode='real135'` **且** `useFilmOverlayTemplate !== false`（`spectral/canvasAdapter.ts:10-15`）。所以 `frameRenderMode='classic'` 时 **光谱一定不执行**，`renderClassicFrame` 只画边框/文字/颗粒。
- UI 在 `!isReal135` 时隐藏“成像方式”下拉（`RecipeInspector.tsx:243`），但点击“经典片边” **不会** 把 `imagingMode` 重置为 `legacy`（`RecipeInspector.tsx:316` 只更新 `frameRenderMode`）。结果可能出现“配方卡显示光谱模拟 + 片边显示经典片边”，实际渲染却按经典色彩输出（`RecipeSummaryCard.tsx:20-21`）。这是当前命名/状态重叠造成的真实不一致。
- 经典片边并非“只用于旧数据”：它对全部 29 款都可选（`RecipeInspector.tsx:301` 的条件恒真），也是 `frameRenderMode` 缺字段时的显式选项之一。
- 经典片边固定主线程：`shouldUseWorkerForSettings()` 只对 real135 返回 true（`filmWorkerClient.ts:107-113`）；`docs/project/architecture.md:112` 与 `docs/project/rendering.md:27` 均如此描述。

---

## 6. “真实 135 贴图”与“物理底片”的互斥性、差异

### 6.1 互斥关系（事实）

- 二者是 `edgeRenderMode` 的 **同一枚举的两个值**，天然互斥，不能同时存在（`types.ts:45`）。
- 但 `frameRenderMode='real135'` 是二者共同的前提；物理路径要求 `frameRenderMode` 为 real135，否则抛错：`物理 135 片边不能与经典片边同时启用。`（`physical135/plan.ts:159-161`）。
- 物理路径与 `imagingMode='legacy'` 可以共存，此时 `physicalRenderingKind()` 返回 `'geometry-compatibility'`（`physical135/plan.ts:148-152`），UI 文案也明确“几何与扫描背光兼容模式；不将经典色彩描述为光谱显影”（`RecipeInspector.tsx:392`）。
- 光谱 + 模板片边只允许 **单张**；长条会抛 `Spectral film processing currently supports real-135 single frames only`（`spectral/scope.ts:3-7`），App 把它翻译成“光谱负片目前仅支持真实 135 单张出片；胶片长条请使用经典色彩。”（`App.tsx:751`）。
- 光谱 + 物理片边受能力表约束：缺物理片边或孔密度未验收时抛错（`physical135/plan.ts:155-167`）。

### 6.2 组合矩阵（事实）

| frameRenderMode | edgeRenderMode | imagingMode | 结果 |
|---|---|---|---|
| real135 | legacy-template | legacy | 模板/兼容片边 + 经典色彩；单张与长条均可 |
| real135 | legacy-template | spectral | 模板/兼容片边 + 光谱；**仅单张** |
| real135 | physical135 | legacy | 物理几何兼容 + 经典色彩；单张与连续长条 |
| real135 | physical135 | spectral | 物理光谱显影；需 15 款能力清单；单张与连续长条 |
| classic | legacy-template | legacy | 程序化经典边框；单张与长条 |
| classic | legacy-template | spectral | 光谱被静默跳过，实际经典色彩 |
| classic | physical135 | any | 抛错（`physical135/plan.ts:159-161`） |

UI 层面物理片边只在 `isReal135` 时出现（`RecipeInspector.tsx:356-380`），所以正常操作不会产生 `classic + physical135`；但旧数据/直接写存储可以。

### 6.3 画质、性能、输出差异（可验证部分）

| 维度 | 模板片边（legacy-template） | 物理片边（physical135） |
|---|---|---|
| 几何来源 | 固定 1307×1203 模板，片窗 `x=92,y=211,w=1123,h=800`（`filmOverlay.ts:24-26,68-73`；`docs/project/rendering.md:47-55`） | 135 全幅物理模型：片宽 35 mm、帧进 38 mm、片门 36.25×24.3 mm、孔距 4.75 mm（`physical135/plan.ts:135-146`） |
| 单张输出尺寸 | 由 `createKodakGoldOverlayLayout(targetImageWidthPx)` 反推整张胶片 | 由 `physicalPlanForSettings` 按 px/mm 计算 `outputWidth/Height` |
| 长条 | 每行最多 4 帧，帧间可零间隙（`renderAdmission.ts:133-135`）；预览 4 帧示例 3998×1038（`tests/renderAdmission.test.ts:41`） | 连续单条，`count × 38 mm`；预览 10 帧示例 9500×875（`tests/renderAdmission.test.ts:50-52`） |
| 片边内容 | PNG 模板或程序化兼容片边（固定 `135 · COMPATIBILITY`） | 按型号片边注册表绘制 imprint（`edgeRegistry.ts`）+ 灰雾/漏光/齿孔相位 |
| 光谱 | 支持单张；依赖模板存在 | 支持单张与连续长条；依赖 15 款能力清单 |
| 线程 | Worker（`shouldUseWorkerForSettings` 为 true 时）；失败回主线程 | 同样经 `frameRenderMode='real135'` 走 Worker；Worker 内进入 physical 分支（`filmWorker.ts:525-548`） |
| 性能 | 一次 `drawImage` 覆盖 + 逐帧 cover/颗粒；较轻 | 逐像素栅格（presence/backing/filmBase/wall），光谱时还有后端计算；较重（`physical135/canvas.ts:150-160`、`spectralAdapter.ts`） |
| 可调参数 | 帧号、颗粒、齿孔颜色、扫描底板 | 加上齿孔背光、光圈、拉直、边缘灰雾、片轴漏光、seed（`RecipeInspector.tsx:394-429`） |

注意：`tests/renderAdmission.test.ts:42-45` 的经典长条 6 帧 10893×1600 是经典模式尺寸，仅在保留经典路径时才有意义。

---

## 7. 删除“经典片边”的影响面（事实清单）

### 7.1 UI

- `components/settings/RecipeInspector.tsx`
  - `106-107`：`isReal135` 判定。
  - `301-323`：“片边模式”fieldset 与两个按钮（真实 135 / 经典片边）；`supportsReal135` 恒真。
  - `325-338`：“片边文字”输入，仅 `!isReal135`。
  - `356-430`：物理底片区，仅 `isReal135`。
  - `478-549`：经典模式专属的日期、齿孔形状、边框色/齿孔色/文字色、边框尺寸，仅 `!isReal135`。
  - `437-449`：帧号颜色对两种模式都显示；若删经典，`textColor` 仍作为帧号颜色 fallback 使用（`108-111`）。
- `components/settings/RecipeSummaryCard.tsx:19-21`：摘要卡把 `frameRenderMode='classic'` 显示为“经典片边”，否则显示“真实 135”或“物理底片”。
- `App.tsx:1689-1693`：经典模式不传裁剪画幅；删除后该三元分支可简化。
- `components/settings/MobileSettingsSheet.tsx:22` 只是“片边”tab 标签，不涉及模式值。

### 7.2 持久化 / 迁移

- 偏好包 `filmFrame.preferences.v1` 中的 `frameRenderMode`；白名单 `settingsStorage.ts:17,141-143`。
- 配方包 `filmFrame.recipes.v1` 中的 `settings.frameRenderMode`；`recipeStorage.ts:62` 复用同一白名单。
- 旧配方应用路径 `App.tsx:1094-1104`（`mergeSettings(..., 0)`）。
- 旧偏好迁移 `settingsStorage.ts:175-193`。
- 若从白名单移除 `'classic'`：旧值被静默丢弃，`mergeSettings` 会用当前 `defaults.frameRenderMode`。如果当前是 real135，用户会 **无提示地** 从经典边框变成模板片边；如果当前是 classic，则保持 classic 但不被持久化。这是必须显式迁移的点。

### 7.3 Worker

- `services/filmWorker.ts:346-437` `renderClassicFrame`、`640+` `renderClassicStrip` 变死代码。
- `services/filmWorker.ts:550-557`、`904-910`：模板不可用或 `useFilmOverlayTemplate === false` 时回退 `renderClassicFrame`/`renderClassicStrip`（并强制 `frameRenderMode:'classic'`）。删经典后必须改为回退程序化 real135（`drawFlattenedReal135Frame` 传 `overlay=null` 会调用 `paintCompatibility135Frame`，见 `filmWorker.ts:452`）。
- `services/filmWorker.ts:964-1004`：消息分发里的 classic 分支。
- `services/filmWorkerClient.ts:107-113`：`shouldUseWorkerForSettings` 的 classic 排除；删除后可直接要求 `real135`（该字段本身也可能被折叠）。

### 7.4 主线程

- `services/filmEngine.ts:1092-1307`：`processImage` 的 classic 分支（边框、齿孔、文字、日期）。
- `services/filmEngine.ts:1313-1328`：`generateFilmStrip` 的 classic 分支与 `create135LandscapeLayout` 路径。
- 仅经典使用的辅助函数：`drawFilmBase`（`filmEngine.ts:303-331`）、`drawHole`、`draw135Markings` 的一部分；`drawReal135FilmBase`（`331+`）属于程序化 real135，不是经典。
- `enableRealisticRebate` 同时被经典与程序化 real135 使用（`filmEngine.ts:308,342`；`filmTexture.ts:128,146`），不能因为删经典就删该字段。

### 7.5 Admission

- `services/renderAdmission.ts:49-67` `getClassicSingleCanvasSize`。
- `renderAdmission.ts:73-74`、`139-155`：classic 单张/长条尺寸分支。
- 经典长条每行 6 帧、高 1600、边界 16%（`renderAdmission.ts:139-155`）；删除后这些常量与预算测试失去对象。
- 测试：`tests/renderAdmission.test.ts:42-45,66-80`。

### 7.6 结果签名 / 缓存

- `services/renderResult.ts:12-48`：`createRenderSettingsKey()` 把 `frameRenderMode`（第 32 项）与 `edgeRenderMode`（第 39 项）都纳入签名。
- `App.tsx:167-180`、`688`、`871`：`processedSettingsKey` 只存在会话内 `ImageItem` 上；**不落盘**。因此改枚举值只会让当前会话已生成结果变 stale，不会破坏刷新后的历史文件。
- 但改枚举值会让 `createRenderSettingsKey` 对所有结果变化，等于全量重渲染；改名/改值必须一次性完成，避免同一会话内新旧值混用。
- 测试：`tests/renderResult.test.ts:38-65`（含 `'render mode'` 与 `'edge renderer'` 两项）。

### 7.7 测试

单元测试直接依赖 classic：

- `tests/settingsStorage.test.ts:59`（白名单接受 classic）、`181-195`（版本迁移）。
- `tests/renderResult.test.ts:46`（classic 改变签名）。
- `tests/renderAdmission.test.ts:42-45`、`66-80`（classic 单张/长条尺寸与预算）。
- `tests/filmWorkerClient.test.ts:243`（classic 不走 Worker）。
- `tests/filmWorkerClientFallback.test.ts:33`（classic 回退主线程）。
- `tests/physical135Plan.test.ts:115`（classic + physical 抛“经典片边”）。
- E2E：`tests/e2e/physical-migration.spec.ts:28-49` 覆盖旧偏好保留 legacy-template/legacy 色彩；没有直接点击“经典片边”的 E2E。删除 UI 选项不会直接命中现有 E2E，但 `frameRenderMode='classic'` 的 localStorage 夹具需要检查。

### 7.8 文档

- `README.md:14-22`：整节“真实 135 与经典片边”；`README.md:90` 操作步骤。
- `PRODUCT.md:19,30`：能力与工作流描述。
- `handoff.md:26,34,36-38`：四维模型与线程策略。
- `docs/project/rendering.md:5-9,19-27,84-...`：路由与真实 135 路径。
- `docs/project/product-workflows.md:44-45,91-95,118,171-179`：默认状态、能力、限制。
- `docs/project/architecture.md:112`：classic 固定主线程。
- `docs/project/file-map.md:45,48,114`。
- `docs/plans/2025-02-14-frontend-redesign/SPEC.md:48,109,684-765,1098-1100,1574`：历史设计稿，含旧命名；按 `handoff.md:82` 的规则不应作为当前事实来源，但若做全局文案一致性检查会被搜到。
- `public/film-overlays/README.md`：模板资产说明（不涉及 classic，但涉及“raw generated image”表述）。

### 7.9 资产

- 删除经典片边 **不需要删除任何 PNG**。16 个模板、齿孔 mask、Gold 分层素材都服务于 real135 模板路径。
- 反过来说，若未来要删“真实 135 贴图”，才会影响 `public/film-overlays/` 与 `public/film-sprocket-masks/`，以及 provenance 清单 `ops/provenance/manifest.json:94-176`。

### 7.10 既有本地设置会怎样

| 旧状态 | 若只删 UI、保留枚举 | 若从白名单删除 classic |
|---|---|---|
| `frameRenderMode='classic'` 偏好 | 继续按 classic 渲染；UI 无入口 | 值被丢弃，回落到默认 real135；画面静默改变 |
| 含 classic 的旧配方 | 应用后仍 classic；UI 无入口 | 应用时值被丢弃，保留当前 frameRenderMode |
| `useFilmOverlayTemplate=false` 旧配方 | real135 时 Worker/主线程回退 classic（`filmWorker.ts:550`、`filmEngine.ts:537`） | 必须改为回退程序化 real135，否则抛错或错误输出 |
| `edgeRenderMode='legacy-template'` | 不受影响 | 不受影响（不要动这个值） |

---

## 8. 建议的最小、可回滚迁移切分（供决策，不实施）

### Slice 0：只改文案（零持久化影响）

目标：先消除“真实 135 / 真实 135 贴图 / 物理底片 / 经典片边”的语义重叠。

- `RecipeInspector.tsx:303` “片边模式”保留或改为“片边风格”。
- `RecipeInspector.tsx:311` “真实 135”保持不变（父模式）。
- `RecipeInspector.tsx:319` “经典片边”改为“程序化边框（旧）”。
- `RecipeInspector.tsx:361` “底片渲染”改为“片边实现”；`377` “真实 135 贴图”改为“胶片模板”；`378` “物理底片”改为“物理片边”。
- `RecipeSummaryCard.tsx:21` 同步。
- 优点：不动枚举、不动存储、不动测试；回滚只需还原文案。
- 风险：`tests/e2e/*` 大量用 `getByLabel('底片渲染')` 定位（`tests/e2e/recipeControls.ts:14-17` 及 20+ spec），改标签必须同步改 helper 与所有调用点，否则 E2E 全挂。建议先改 helper 的 label 常量，再改 UI。

### Slice 1：移除“经典片边”入口，保留旧代码与旧枚举

目标：光谱胶片只保留真实 135；旧数据仍能渲染。

- UI：删除 `RecipeInspector.tsx:301-323` 的 fieldset；`!isReal135` 的专属控件（325-338、478-549）随 `isReal135` 恒真而不可达，可先保留。
- 状态：在换胶片/加载偏好时把 `frameRenderMode` 归一为 `'real135'`；`settingsForFilmStock` 不再保留 classic（`settingsStorage.ts:207` 目前保留）。
- 迁移：在 `normalizeSettingsPatch` 之后增加显式映射（`classic → real135`），而不是把 `'classic'` 从白名单删除。这样旧偏好/旧配方会被 **读取并转换**，不会静默丢弃。
- 版本：若新增 `renderPreferenceVersion=2`，用 `version >= 1 && version < 2` 的显式分支；不要复用 `version < CURRENT` 的泛化守卫（见 §2.4）。
- 渲染：保留 `renderClassicFrame`/`renderClassicStrip` 与主线程 classic 分支一个版本，处理 `useFilmOverlayTemplate=false` 的旧配方；或在该分支内改用程序化 real135。
- 测试：更新 `tests/settingsStorage.test.ts`、`tests/renderResult.test.ts`、`tests/renderAdmission.test.ts`、`tests/filmWorkerClient.test.ts`、`tests/filmWorkerClientFallback.test.ts`、`tests/physical135Plan.test.ts`；新增“旧 classic 偏好加载后变 real135”的迁移测试。
- 回滚：还原 UI 条件 + 去掉迁移分支即可；数据未被破坏（旧值仍可读）。

### Slice 2：删除 classic 死代码（独立提交）

前提：Slice 1 已上线并确认无旧配方依赖。

- 删除 `renderClassicFrame`/`renderClassicStrip` 及 worker 分发分支。
- 删除 `filmEngine.ts` classic 分支、`getClassicSingleCanvasSize`、classic 长条常量。
- 从 `FilmSettings` 移除 classic-only 字段（`borderColor`、`holeColor`、`borderSize`、`holeType`、`showDate`、`dateStr`、`customText`、`textColor` 中的经典用途需逐项确认；`textColor` 仍被帧号颜色 fallback 使用，不能直接删）。
- 同步 README/PRODUCT/handoff/rendering/product-workflows/architecture/file-map。
- 保留 `edgeRenderMode='legacy-template'`。

### 8.1 无法安全删除 / 必须保留兼容的部分

1. `edgeRenderMode='legacy-template'`：9 款光谱胶片没有物理片边；光谱 + 单张仍依赖它（`spectral/scope.ts` 只允许 physical 走长条）。
2. `frameRenderMode='classic'` 的 **读取兼容**：至少保留一个版本的解析/映射，否则旧偏好和旧配方会静默变样。
3. `useFilmOverlayTemplate !== false` 的旧语义：模板关闭时必须仍有可用的程序化 real135 回退，不能落到已删除的 classic。
4. `filmOverlayUrl` 的“不持久化、加载取默认”行为（`settingsStorage.ts:191`）。
5. `COMPATIBILITY_135_OVERLAY` 哨兵与 `paintCompatibility135Frame`：11 款胶片没有 PNG，不能假设“模板 = 图片”。
6. `ops/provenance/` 的资产来源/权利记录：删除或改名资产前必须保留，`rightsStatus` 仍是 `owner-review`。
7. 渲染签名 `createRenderSettingsKey`：任何枚举重命名都要接受“会话内全量 stale”，不能只改一半。

---

## 9. 建议的新内部枚举名（不实施）

先明确命名约束：
- `legacy-template` 同时覆盖 16 个 PNG 和 11 个程序化兼容片边，所以名字里不能出现 “AI” 或 “image”。
- `physical135` 实际渲染整段负片 + 齿孔 + 片边标记，叫 `physical-film` 比 `physical135` 更准确。
- `frameRenderMode` 的 `real135` 在删除 classic 后只剩一个有效值；不建议立刻删除字段（迁移成本大于收益），可保留并标 deprecated。

| 方案 | 字段 | 建议值 | 优点 | 代价 |
|---|---|---|---|---|
| A（推荐，最小） | `EdgeRenderMode` | `'stock-template' \| 'physical-film'` | 语义准确；覆盖 PNG 与兼容片边 | 需在 `normalizeSettingsPatch` 做旧值映射；签名变化 |
| A | `FrameRenderMode` | 保留 `'real135'`，`'classic'` 标 deprecated | 不动父模式；迁移最小 | 名称仍不完美 |
| B（更彻底） | 新字段 `edgeImplementation` | `'template' \| 'physical'` | 新名字干净；旧字段只读 | 双字段并存，复杂度更高 |
| B | 删除 `FrameRenderMode` | 不再需要 | 模型最简 | 需处理所有 `?? 'real135'` 与旧配方 |
| C（仅文案） | 不改枚举 | — | 零迁移风险 | 内部变量仍叫 legacy-template，维护者仍会混淆 |

如果目标是“用户不再看到两套相似名字”，方案 A + Slice 0/1 足够；方案 B 应作为后续清理，不应与删除 classic 混在一个提交里。

更贴近事实的 UI 文案建议：
- `frameRenderMode='classic'` → “程序化边框（旧）”
- `frameRenderMode='real135'` → “135 胶片片边”
- `edgeRenderMode='legacy-template'` → “胶片模板”（说明：16 款扫描式模板，其余为兼容片边）
- `edgeRenderMode='physical135'` → “物理片边”
- “底片渲染” → “片边实现”

---

## 10. 受影响文件清单（file:line）

### 核心类型与状态

- `types.ts:41` `FrameRenderMode`
- `types.ts:44` `ImagingMode`
- `types.ts:45` `EdgeRenderMode`
- `types.ts:78,80,88` 三个字段
- `services/settingsStorage.ts:15-18` 白名单
- `services/settingsStorage.ts:133-155` 归一化
- `services/settingsStorage.ts:175-193` 合并与迁移
- `services/settingsStorage.ts:200-209` 换胶片默认
- `services/settingsStorage.ts:245-259` 保存
- `services/recipeStorage.ts:4,53-68,95-115` 配方持久化
- `App.tsx:100-127` 新会话默认
- `App.tsx:203-209` 加载与 setSettings
- `App.tsx:317` 保存偏好
- `App.tsx:1094-1104` 应用配方（版本 0）
- `App.tsx:1399` 重置默认

### UI

- `components/settings/RecipeInspector.tsx:106-107`
- `components/settings/RecipeInspector.tsx:243-257` 成像方式
- `components/settings/RecipeInspector.tsx:301-323` 片边模式
- `components/settings/RecipeInspector.tsx:325-338` 片边文字
- `components/settings/RecipeInspector.tsx:356-430` 物理底片区
- `components/settings/RecipeInspector.tsx:437-549` 颜色/日期/齿孔/边框
- `components/settings/RecipeSummaryCard.tsx:19-21`
- `App.tsx:1689-1693` 裁剪画幅
- `tests/e2e/recipeControls.ts:14-17` 标签依赖

### 渲染：Worker / 主线程 / 门面

- `services/filmWorker.ts:346-437` `renderClassicFrame`
- `services/filmWorker.ts:439-473` `drawFlattenedReal135Frame`
- `services/filmWorker.ts:519-561` `renderReal135Frame`（含 physical 与 classic 回退）
- `services/filmWorker.ts:640-690` `renderClassicStrip`
- `services/filmWorker.ts:894-912` `renderReal135Strip`
- `services/filmWorker.ts:964-1004` 分发
- `services/filmEngine.ts:531-626` 模板路径
- `services/filmEngine.ts:1092-1139` 单张 real135 分支
- `services/filmEngine.ts:1141-1307` 单张 classic 分支
- `services/filmEngine.ts:1313-1328` 长条分发
- `services/filmWorkerClient.ts:107-113` Worker 选择
- `services/filmWorkerClient.ts:263-324` 门面与回退

### 能力与几何

- `services/filmOverlay.ts:24-66` 模板注册表
- `services/filmSprocket.ts:7-47` 齿孔 mask 注册表
- `services/compatibility135.ts:7-43` 兼容片边
- `services/spectral/stockRegistry.ts:13-52`
- `services/spectral/canvasAdapter.ts:10-15`
- `services/spectral/scope.ts:3-7`
- `services/physical135/capability.ts:4-22`
- `services/physical135/edgeRegistry.ts:21-55`
- `services/physical135/plan.ts:135-168`
- `services/physical135/strip.ts:22-57`
- `services/physical135/canvas.ts:160-190`

### Admission / 签名

- `services/renderAdmission.ts:49-96`
- `services/renderAdmission.ts:119-156`
- `services/renderResult.ts:12-48`
- `services/exportReadiness.ts`（不读取三个字段）
- `services/workflowState.ts:13,38`（只比较 settingsKey）

### 测试

- `tests/settingsStorage.test.ts:59,181-195`
- `tests/renderResult.test.ts:46,49`
- `tests/renderAdmission.test.ts:42-45,66-80`
- `tests/filmWorkerClient.test.ts:243`
- `tests/filmWorkerClientFallback.test.ts:33`
- `tests/physical135Plan.test.ts:115`
- `tests/e2e/physical-migration.spec.ts:22-99`
- `tests/e2e/spectral-production.spec.ts:16-17`（spectral + legacy-template）
- `tests/e2e/monochrome-stocks.spec.ts:19-32`
- `tests/e2e/positive-stocks.spec.ts:24-25`
- `tests/e2e/cinestill-stocks.spec.ts:18-19`
- `tests/e2e/spectral-stock-picker.spec.ts:1-84`（29/24/5 计数）

### 文档 / 资产来源

- `README.md:14-22,90,171`
- `PRODUCT.md:19,30`
- `handoff.md:26,34,36-38,82`
- `docs/project/rendering.md:5-9,19-27,47-55,84-...`
- `docs/project/product-workflows.md:44-45,91-95,118,171-179`
- `docs/project/architecture.md:112`
- `docs/project/file-map.md:45,48,114`
- `docs/plans/2025-02-14-frontend-redesign/SPEC.md:48,109,684-765,1098-1100,1574`（历史）
- `public/film-overlays/README.md`
- `ops/provenance/manifest.json:94-176`
- `ops/provenance/README.md:24`
- `ops/provenance/asset-inventory.md:9,11,28`
- `.trellis/tasks/archive/2026-07/07-14-add-remaining-real135-templates/prd.md`（Source Mapping、需求 3）

---

## 11. 未验证 / 未知

1. “模板是 AI 生成”：仓库只写 `generated`，未写生成工具/模型/提示词；`rightsStatus=owner-review` 仍未关闭。
2. 16 个 PNG 与 11 个兼容条目的画面差异是否被产品接受为“同一功能”：README 与 docs 只说“兼容片边”，未定义用户可见的质量等级。
3. 删除经典片边后，5 款无光谱胶片（ColorPlus 200、Pro Image 100、Superia 400、T-Max 400、P3200）是否仍需要“程序化边框”作为唯一非模板风格；当前代码没有替代品。
4. `docs/project/rendering.md` 与 `.trellis/spec/frontend/spectral-rendering.md:82` 仍存在“physical 是实验/legacy-template 默认”的旧表述，与 `App.tsx` 新会话默认 physical 不一致；本文按代码判定，文档需单独校正。
5. 未执行测试/构建。本报告只做静态审计；行号基于当前有未提交修改的工作区，提交后需复核。
