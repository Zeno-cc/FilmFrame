# Research: 渲染模式命名与信息架构

- Query: 删除“经典片边”，重新命名“真实 135”和“物理底片”，让用户 5 秒分清两种输出的真实差异
- Scope: mixed（内部代码事实 + 命名/IA 方案）
- Date: 2026-11-18
- 任务: `.trellis/tasks/11-18-render-mode-simplification`

## 0. 结论摘要（可执行）

**推荐命名（候选 A）**

| 内部值 | UI 名称 | 一句话说明 |
|---|---|---|
| `edgeRenderMode = 'legacy-template'` | **模板片边** | 套用该型号的整幅片边图 |
| `edgeRenderMode = 'physical135'` | **物理片边** | 按 35mm 片门、齿孔与曝光生成 |

- 推荐把原“底片渲染”控件改名为 **“片边方式”**，提到“片边”区块的常规层级，不再藏在“高级渲染设置”里。
- 推荐删除 **“片边模式”** 这组二选一按钮：删除“经典片边”后它只剩一个有效选项，保留会成为无效控件。内部 `frameRenderMode` 仍保留为 `'real135'`，用于兼容旧数据和 Worker 的经典渲染兜底。
- 推荐保留 1 行、不超过 20 个中文字的 helper：**“模板整幅套用，物理按片门与齿孔生成”**（16 个中文字）。不要新增卡片或教学段落。
- UI 文案与内部枚举值分离：不改 `'classic' | 'real135'`、`'legacy-template' | 'physical135'`，避免旧本地设置、旧配方、渲染缓存键全部失效。

**关键事实核验**：用户所说“真实 135 的模板实际上是 AI 生成的”**成立**。仓库记录为“user-provided generated film-border artwork”，任务设计文档明确写到 imagegen skill 将这些文件归为 edit targets，运行时代码和 README 也把其称为 generated template。详见 1.5。

---

## 1. 代码事实：两个模式分别在做什么

### 1.1 枚举与持久化

`types.ts:41-45`：

```ts
export type FrameRenderMode = 'classic' | 'real135';
export type ImagingMode = 'legacy' | 'spectral';
export type EdgeRenderMode = 'legacy-template' | 'physical135';
```

`FilmSettings` 里对应字段在 `types.ts:80`、`types.ts:88`。这三个维度互相独立，不能合并成一个值：

- `frameRenderMode`：经典程序化边框 vs 135 画幅。
- `imagingMode`：经典色彩 vs 光谱模拟。
- `edgeRenderMode`：模板贴图 vs 物理片边。

当前默认值在 `App.tsx:114-124`：`imagingMode: 'spectral'`、`frameRenderMode: 'real135'`、`edgeRenderMode: 'physical135'`。也就是说新用户默认走“光谱 + 物理片边”。

### 1.2 “真实 135 贴图”实际做什么

`frameRenderMode = 'real135'` + `edgeRenderMode = 'legacy-template'`：

- 单张走 `services/filmEngine.ts:578-607`：按型号加载一张 `1307x1203` 的 PNG 模板，把照片 cover 进模板的固定黑窗，再叠加颗粒、动态帧号、可选齿孔颜色。
- Gold 200 使用分层素材（`film-base.png` + aperture mask），其余型号使用扁平模板；`services/filmOverlay.ts:28-58` 注册了全部 29 个 `FilmType`。
- 长条走 `services/filmEngine.ts:966-1053`：每个模板帧保留完整片边，`frameGap = 0` 直接相接（`services/filmOverlay.ts:175-206`）。视觉上是“完整卡片逐张相接”，不是真正连续的一张长底片。
- 模板的片边文字、品牌、磨损、片基纹理已经烘焙在图片里；照片只负责片窗内容。单张 Worker 路径会把光谱处理只作用于片窗像素（`services/filmWorker.ts:464-465`、`:588-589` → `services/spectral/canvasAdapter.ts:18-28`），但**模板图片本身仍是静态素材**，不参与光谱显影。主线程模板兜底路径 `processImageWithTemplateOverlay`（`services/filmEngine.ts:536-623`）没有调用 `applySpectralToAperture`，这是另一个需要单独确认的降级边界。

**结论**：它是“按胶片型号套用一张预先生成的整幅片边图”，不是实测胶片扫描，也不是物理曝光模型。

### 1.3 “物理底片”实际做什么

`frameRenderMode = 'real135'` + `edgeRenderMode = 'physical135'`：

- 单张走 `services/filmEngine.ts:1099-1128` → `services/physical135/spectralAdapter.ts:158-198`。
- 使用真实 135 几何：片宽 35mm、帧进给 38mm、片门 36.25×24.3mm、每帧 8 个齿孔、4.75mm 节距（`services/physical135/plan.ts:135-145`）。
- 生成连续片基、齿孔软边、片门、片边文字、灰雾、漏光、扫描背光；齿孔和片边身份来自 `services/physical135/edgeRegistry.ts`，按型号注册文字/密度/曝光参数。
- `imagingMode = 'spectral'` 且该型号通过 `supportsPhysicalSpectralStock()` 时，进入完整光谱负片显影（`services/physical135/plan.ts:148-151`；`services/physical135/spectralAdapter.ts:196-198`）。
- `imagingMode = 'legacy'` 时只做“几何 + 扫描背光兼容”，代码自己也在 UI 里写“几何与扫描背光兼容模式；不将经典色彩描述为光谱显影”（`components/settings/RecipeInspector.tsx:392`）。**因此不能把整个物理模式一律称为“光学显影”或“光谱底片”。**
- 长条走 `services/filmEngine.ts:1320-1323` → `services/physical135/strip.ts`，使用连续片孔/进给网格，不是重复完整卡片。

### 1.4 两种输出的真实差异（用于命名）

| 维度 | 模板片边 | 物理片边 |
|---|---|---|
| 片边来源 | 预先制作的整幅 PNG（按型号） | 程序化 35mm 几何 + 片边文字/密度 |
| 每帧是否相同 | 片边外观基本相同，仅帧号变化 | 齿孔位置、片基、灰雾、漏光可按 seed 变化 |
| 长条连续性 | 完整帧逐张相接，`frameGap=0` | 连续齿孔/进给，整卷材质连续 |
| 可选光谱 | 不进入模板图；单张可叠光谱，长条不支持 | 支持光谱负片（型号能力允许时），长条也支持 |
| 可调参数 | 少（帧号、齿孔颜色、扫描背景等） | 多（背光、光圈、拉直、灰雾、漏光、seed） |
| 真实边界 | 生成模板的外观，不是实测扫描 | 物理几何模型；经典色彩时不是光谱显影 |

### 1.5 “模板是 AI 生成的”核验

证据链：

1. `ops/provenance/asset-inventory.md:9`：`Historical tasks identify user-provided generated film-border artwork...`
2. `.trellis/tasks/archive/2026-07/07-14-add-remaining-real135-templates/design.md:13`：`The imagegen skill classifies the supplied files as edit targets, but no generative edit is needed...`
3. `public/film-overlays/README.md:29-37`：`Do not replace a template with its raw generated image because its aperture geometry differs.`；同文件把其他型号称为 flattened templates。
4. `services/filmOverlay.ts:185-186` 注释：`The generated template already contains the full rebate.`
5. `README.md:16`：`16 套历史 PNG 模板`。

**结论**：模板确实来自生成式图片资产（imagegen），后续只做了确定性的几何归一化，没有重新生成。命名不能继续用“真实”修饰它。

---

## 2. 三组中文命名候选与评分

评分口径：每项 1-5 分，**5 分最好**；“误读风险”5 分表示风险最低；“迁移成本”5 分表示成本最低。总分 30。

### 候选 A：模板 / 物理轴（推荐）

| 内部值 | 模式名 | 简短说明 |
|---|---|---|
| `legacy-template` | **模板片边** | 套用该型号的整幅片边图 |
| `physical135` | **物理片边** | 按 35mm 片门、齿孔与曝光生成 |

### 候选 B：贴图 / 连续轴

| 内部值 | 模式名 | 简短说明 |
|---|---|---|
| `legacy-template` | **片边贴图** | 直接套用型号片边图 |
| `physical135` | **连续片边** | 整卷齿孔与片边连续 |

### 候选 C：型号 / 光学轴

| 内部值 | 模式名 | 简短说明 |
|---|---|---|
| `legacy-template` | **型号片边** | 每款胶片一张固定片边 |
| `physical135` | **光学片边** | 片门、齿孔与扫描光共同生成 |

### 评分表

| 维度 | A 模板/物理 | B 贴图/连续 | C 型号/光学 |
|---|---:|---:|---:|
| 准确性 | 5 | 4 | 2 |
| 可区分性（5 秒） | 5 | 4 | 3 |
| 摄影语境 | 4 | 4 | 5 |
| 误读风险（低=高分） | 4 | 3 | 2 |
| 与“片边/底片渲染”现有界面搭配 | 5 | 4 | 4 |
| 迁移成本（低=高分） | 5 | 5 | 4 |
| **总分** | **28** | **24** | **20** |

### 推荐：候选 A

理由，按六项展开：

1. **准确性**：`模板` 直接说明这是预制的整幅素材，不再用“真实”暗示实测；`物理` 对应代码里真实的 35mm 片门、齿孔、进给和片边曝光模型。`物理片边` 比 `物理底片` 更窄、更准确：经典色彩时只做几何/背光兼容，没有完整负片显影，叫“底片”会过度承诺。
2. **可区分性**：`模板` vs `物理` 是同一轴线上的二元对照，用户不需要先理解光谱、Worker 或生成方式，5 秒内能形成“现成图 vs 按物理模型生成”的判断。B 的 `连续` 只在长条里明显，单张差异弱；C 的 `型号` 只说明按胶片区分，没说明是模板。
3. **摄影语境**：`片边` 本身就是摄影/胶片语境；`物理` 虽偏工程，但与现有 `PHYSICAL 135` 图例、`物理 135` 错误文案、`物理片边` 资源目录一致。若产品坚决不接受“物理”，备选是 `片门片边`（更摄影），但普通用户识别度低于“物理”。
4. **误读风险**：`模板` 可能被理解为“设计模板”，但在“片边”上下文里指向明确；`物理` 可能被理解为“永远走光谱”，需要用 helper 和现有条件说明兜底。C 的 `型号片边` 会让人以为是官方实测片边，`光学片边` 会在经典色彩下变成错误承诺，风险最高。
5. **与现有界面搭配**：`片边方式：模板片边 / 物理片边` 读起来自然；摘要卡 `片边：模板片边` 也自然。现有 `底片渲染` 的选项 `真实 135 贴图` 已经含有“贴图”概念，用户迁移到“模板片边”不需要重新学习。
6. **迁移成本**：只改 UI 文案，不改内部值、存储键、渲染键；`物理 135` 图例和多数错误文案可以保留“物理”一词，改动面最小。

**不推荐继续使用或新增的名字**

- `真实 135` / `真实 135 贴图`：与“生成模板”事实冲突，是本次要修的核心问题。
- `物理底片`：暗示完整负片显影，但经典色彩下只是几何/背光兼容。
- `光学片边`：同上，且只在光谱路径成立。
- `模拟片边` / `数字片边` / `合成片边`：会被读成低质量或“假”，且不必要地强调实现。
- `原厂片边` / `品牌片边` / `官方片边`：暗示品牌授权或官方实测，风险更高。

---

## 3. 推荐方案的界面结构与文案

### 3.1 推荐结构

删除“经典片边”后，“片边模式”只剩一个有效选项，不应保留。推荐：

```text
片边
  片边方式   [ 模板片边 ▾ ]
             模板整幅套用，物理按片门与齿孔生成
  起始帧号   [ 1 ]
  高级渲染设置
    （仅物理片边时）齿孔背光 / 镜头光圈 / 拉直 / 边缘灰雾 / 片轴漏光
    帧号颜色 / 齿孔颜色
```

- 把原“底片渲染”select 从 `高级渲染设置` 里提出来，放到“片边”常规层级；这样两种输出是首要选择，而不是藏在高级设置里。
- 物理专属参数继续留在 `高级渲染设置`，不增加新卡片。
- 模板模式的 `片边文字`、`默认日期`、`齿孔形状`、`边框色/齿孔色/文字色`、`边框尺寸` 都只属于经典片边分支（`RecipeInspector.tsx:325-338`、`:478-551`），删除经典片边后这些控件自然消失，不需要额外清理 UI。

### 3.2 受影响文案清单

**主控件**

| 位置 | 当前 | 建议 |
|---|---|---|
| `components/settings/RecipeInspector.tsx:303` | `片边模式` | 删除该 fieldset |
| `:311` | `真实 135` | 删除 |
| `:319` | `经典片边` | 删除 |
| `:361` | `底片渲染` | `片边方式` |
| `:363` | `aria-label="底片渲染"` | `aria-label="片边方式"` |
| `:377` | `真实 135 贴图` | `模板片边` |
| `:378` | `物理底片` | `物理片边` |
| `:358` | `PHYSICAL 135 · 本地渲染` | 可保留，或改 `物理片边 · 本地渲染`；不建议同时保留两个“物理片边”标签 |

**摘要卡**

| 位置 | 当前 | 建议 |
|---|---|---|
| `components/settings/RecipeSummaryCard.tsx:21` | `物理底片` | `物理片边` |
| 同上 | `真实 135` | `模板片边` |
| 同上 | `经典片边` | 删除该分支；旧数据先迁移 |

**帮助与错误文案**

| 位置 | 当前 | 建议 |
|---|---|---|
| `RecipeInspector.tsx:390` | `请使用真实 135 贴图` | `请改用模板片边` |
| `RecipeInspector.tsx:391` | `请使用真实 135 兼容贴图` | `请改用模板片边` |
| `services/physical135/plan.ts:157` | `请使用真实 135 兼容贴图` | `请改用模板片边` |
| `services/physical135/plan.ts:160` | `物理 135 片边不能与经典片边同时启用` | `物理片边需要启用 135 画幅`（UI 不再暴露“经典片边”） |
| `App.tsx:751` | `光谱负片目前仅支持真实 135 单张出片；胶片长条请使用经典色彩。` | `光谱负片使用模板片边时仅支持单张；胶片长条请改用物理片边或经典色彩。` |

说明：`App.tsx:751` 这句目前事实也不够准确。`services/spectral/scope.ts:3-6` 的拒绝条件是“光谱 + 非物理片边”，而光谱 + 物理片边长条是支持的。改名时应顺手修正，避免把用户引向错误的“只能用经典色彩”。

**文档与设计参考**

- `README.md:14-21`（真实 135 与经典片边小节）、`README.md:90`
- `PRODUCT.md:19`、`PRODUCT.md:30`
- `docs/project/rendering.md` 的“路由决策”与“真实 135 单张主线程路径”
- `handoff.md:34`、`handoff.md:38`
- `.impeccable/design.json:319`、`:351` 的示例文案
- `.trellis/spec/frontend/component-guidelines.md:53` 仍在用 `底片渲染` / `negativeMode` 示例，属于已过时示例，可一并更正（非本任务必须）

**测试**

- `tests/e2e/recipeControls.ts:14-16`：`label` 联合类型和 `if (label === '底片渲染')` 需改为 `片边方式`。这是最主要的单点改动。
- 直接按按钮名找 `真实 135` 的用例：`tests/e2e/worker-main-thread-fallback.spec.ts:82,162`、`tests/e2e/browser-compatibility.spec.ts:62`、`tests/e2e/render-budget-admission.spec.ts:181`、`tests/e2e/frontend-redesign.spec.ts:585,685`、`tests/e2e/spectral-stock-picker.spec.ts:92`。删除 toggle 后这些断言必须改为对“片边方式”select 的断言，或删除。
- 直接 `getByLabel('底片渲染')` 的用例：`tests/e2e/physical-migration.spec.ts:22,27,49,77,79,98`、`positive-stocks.spec.ts:25`、`portra-push-stocks.spec.ts:22`、`monochrome-stocks.spec.ts:32`、`cinestill-stocks.spec.ts:19`、`pro400h-physical.spec.ts:108` 等。
- 错误文案断言：`tests/e2e/physical135.spec.ts:444`、`tests/e2e/spectral-production.spec.ts:138`。
- 单测错误文案：`tests/physical135Plan.test.ts:115` 断言消息含 `经典片边`，若改错误文案需同步。

### 3.3 helper 文案（不超过 20 个中文字）

推荐：

> **模板整幅套用，物理按片门与齿孔生成**

（16 个中文字，不含标点）

备选：

- `模板每帧相同，物理有连续齿孔与漏光`（15 个中文字；更偏输出差异，但“每帧相同”会被动态帧号打破，需谨慎）
- `模板是整幅图，物理按片门生成`（13 个中文字；更短，但信息略少）

**是否需要 helper：需要，但只保留 1 行。** 理由：`模板` 与 `物理` 的差异是“素材来源/生成方式”，不是用户一眼能看到的色彩差异；没有一行解释，用户仍可能以为“模板”是某种物理胶片。不要新增卡片、教学段落或折叠区；直接放在“片边方式”下方，沿用现有 `text-[11px] leading-5 text-[var(--ff-paper-dim)]` 的弱化样式即可。

---

## 4. 内部枚举、持久化、旧设置、测试与文档的影响原则

### 4.1 原则：UI 文案与内部值分离

- 内部值继续使用 `'classic' | 'real135'`、`'legacy-template' | 'physical135'`，不要为了命名改存储值。
- 增加一个单点文案映射（例如 `components/settings/renderModeCopy.ts` 或 `services/renderModeLabels.ts`），集中维护：
  - `legacy-template` → `模板片边`
  - `physical135` → `物理片边`
  - `classic` → `经典片边`（仅内部/旧数据使用，不再出现在 UI）
- `RecipeInspector`、`RecipeSummaryCard`、错误文案、文档示例都从该映射取值，避免以后再次出现“真实 135”和“真实 135 贴图”两套叫法。

**不要**直接把 `EdgeRenderMode` 改成 `'template' | 'physical'`。原因：

- `filmFrame.preferences.v1` 已持久化旧值；`filmFrame.recipes.v1` 也保存 `Partial<FilmSettings>`。
- `services/renderResult.ts:32-39` 的渲染 key 包含 `frameRenderMode` / `edgeRenderMode`；改值会让所有已出片立刻变成“过期”，迫使用户重新冲洗。
- `services/settingsStorage.ts:15`、`:17` 的合法值集合、`services/filmWorkerClient.ts:109-111` 的 Worker 路由、`services/renderAdmission.ts:73,128` 的画布准入都依赖旧值。

### 4.2 旧本地设置迁移

现状：`services/settingsStorage.ts:7` 有 `CURRENT_RENDER_PREFERENCE_VERSION = 1`，`mergeSettings()` 在版本小于当前值时补 `edgeRenderMode: 'legacy-template'` 和 `imagingMode: 'legacy'`（`services/settingsStorage.ts:175-190`）。

建议：

1. 把 `CURRENT_RENDER_PREFERENCE_VERSION` 升到 `2`。
2. 对 `renderPreferenceVersion < 2` 且 `frameRenderMode === 'classic'` 的偏好，显式映射为：
   - `frameRenderMode: 'real135'`
   - `edgeRenderMode: 'legacy-template'`
   - `imagingMode: 'legacy'`（旧 classic 渲染实际忽略 `imagingMode`，映射到 legacy 最能保持旧观感）
3. 映射后给一次 `info` 提示：`经典片边已停用，已切换为模板片边`。不要静默改模式。
4. 旧配方（`filmFrame.recipes.v1`）没有版本字段，`services/recipeStorage.ts:62` 只做 `normalizeSettingsPatch`。应用配方时也要走同一个迁移函数；不要批量重写用户已保存的配方数据，只在应用时解释。若配方含 `frameRenderMode: 'classic'`，同样映射并提示。
5. 迁移只做一次，且要有单测：旧偏好/旧配方加载后不再出现 `classic` 的 UI 状态，渲染结果可复现。

### 4.3 `frameRenderMode` 的去留

- UI 固定为 `real135`，但**暂时保留** `frameRenderMode` 字段和 `'classic'` 值。
- `services/filmWorker.ts:550-557` 和 `:904-911` 在 `useFilmOverlayTemplate === false` 或 `!supportsReal135Template()` 时仍会调用 `renderClassicFrame` / `renderClassicStrip`。当前 UI 不会把 `useFilmOverlayTemplate` 设为 `false`，且 29 个 `FilmType` 全部注册了模板，所以这条兜底实际不可达；但它仍是 Worker 的显式降级路径。
- 如果本任务直接删除 `'classic'` 值和 classic 渲染器，需要同时处理这条兜底，否则 Worker 的类型/路由会出现空洞。建议把“删除渲染器”拆成后续独立任务；本任务只删除 UI 入口和面向用户的“经典片边”概念。

### 4.4 测试策略

- 内部值测试保留：`tests/physical135Plan.test.ts`、`tests/settingsStorage.test.ts`、`tests/renderResult.test.ts` 继续验证旧值。
- 新增迁移测试：旧 `frameRenderMode: 'classic'` → `real135` + `legacy-template` + `legacy`，并断言只提示一次。
- E2E 改为按新 label 查询；优先使用 `getByLabel('片边方式')`，不要继续依赖分段按钮的可见文本。
- 新增一条断言：页面上不再存在“经典片边”按钮/选项，且“片边模式”这组 segmented control 不存在。

### 4.5 文档策略

- 用户文档改用新名字；但 **provenance 文档不要改**。`ops/provenance/asset-inventory.md`、`public/film-overlays/README.md`、归档任务里的 “generated” / “imagegen” 是权利与来源证据，删除或弱化会破坏可信度。
- UI 不必主动写“AI 生成”。用“模板”已经足够诚实；是否在 credits/advanced 里披露生成来源，应由发布/权利审核决定，不要用命名偷偷暗示“实测”。
- 公开分发仍受 `ops/provenance/asset-inventory.md:19-24` 的 `owner-review` 阻塞；命名重构不改变这个结论。

---

## 5. “片边模式”控件是否还应该存在

### 5.1 代码事实

- `supportsReal135Template()` 对全部 29 个 `FilmType` 返回 `true`（`services/filmOverlay.ts:28-58` 的注册表覆盖了 `types.ts:2-37` 的全部枚举；已核对无缺失）。
- `RecipeInspector.tsx:106-107`：`supportsReal135` 恒为 true，`isReal135` 默认也为 true（`frameRenderMode ?? 'real135'`）。
- `RecipeInspector.tsx:301-323`：`片边模式` 的显示条件只有 `supportsReal135`，所以它对所有胶片都显示。
- `App.tsx:116` 默认 `frameRenderMode: 'real135'`；唯一写入 `'classic'` 的 UI 入口就是 `RecipeInspector.tsx:316`。
- `services/settingsStorage.ts:207` 的 `frameRenderMode: supportsReal135Template(brandText) ? settings.frameRenderMode : 'classic'` 分支当前不可达（没有不支持模板的型号）。
- 删除“经典片边”后，这组 segmented control 只剩“真实 135”一个按钮，属于无效控件。

### 5.2 推荐：固定为一种，删除“片边模式”控件

**推荐方案：固定 `frameRenderMode = 'real135'`，删除“片边模式”二选一控件；把原“底片渲染”提升为“片边方式”。**

理由：

1. 29 款胶片全部有模板，控件不再承担“某型号不支持真实 135”的分流职责。
2. 保留单选项控件会让用户以为还有另一种模式，违背“减负”。
3. 提升“片边方式”后，两种真实输出（模板/物理）成为首要选择，符合 5 秒目标。
4. 内部 `frameRenderMode` 仍可作为兼容/兜底字段，不影响旧数据。

### 5.3 如果产品只想删除“光谱胶片上的经典片边”

存在另一种解释：只在 `imagingMode = 'spectral'` 的胶片上移除经典片边，非光谱胶片仍保留。代码上可行，但**不推荐**：

- 需要把 `片边模式` 的显示条件改成“仅非光谱型号/仅 `!supportsSpectralStock`”，于是 5 款 blocked 光谱型号（ColorPlus 200、Pro Image 100、Superia 400、T-Max 400、P3200，见 `services/spectral/stockRegistry.ts:29-33`）仍显示二选一，其余 24 款不显示。用户切换胶片时控件忽隐忽现，信息架构更复杂。
- 更严重的是 stale state：当前选择“经典片边”时，`isReal135` 变为 false，`成像方式` 整块被隐藏（`RecipeInspector.tsx:243`），但 `settings.imagingMode` 仍是 `'spectral'`；再切回真实 135，光谱又出现。经典片边渲染路径本身也不读取 `imagingMode`。这正是“经典片边 + 光谱”名不副实的原因之一。
- 如果保留这条局部方案，必须同时做两件事：选中经典片边时强制 `imagingMode: 'legacy'`，并在切回真实 135 时给用户明确提示；否则只是把矛盾藏起来。

**结论**：基于“全部型号都有模板”和“经典片边与光谱组合会静默降级”这两个事实，推荐全局删除 UI 入口，而不是按胶片条件显示。

---

## 6. 实施顺序建议（研究结论，不是代码改动）

1. 先加文案映射层，保持内部值不变。
2. 删除 `片边模式` fieldset；`frameRenderMode` 固定 `real135`。
3. 把“底片渲染”改成“片边方式”，提到常规层级；选项改名 `模板片边 / 物理片边`。
4. 更新摘要卡、错误文案、App 光谱长条提示。
5. 升 `CURRENT_RENDER_PREFERENCE_VERSION` 到 2，迁移旧 `classic` 偏好/配方并提示。
6. 更新 E2E selector 与错误文案断言；新增“控件已删除”和“旧设置迁移”测试。
7. 更新 README/PRODUCT/rendering/handoff/design 示例；provenance 文档保持原样。
8. 单独评估是否删除 classic 渲染器和 `frameRenderMode` 字段（不建议与本任务同批）。

---

## 7. Caveats / Not Found

- **未找到**任何代码或文档把模板明确标为“AI 生成”的运行时文案；证据来自 provenance 和归档任务，足以确认事实，但不适合直接作为用户文案。
- **未找到**模板来源的生成工具、prompt 或版权归属；`ops/provenance/asset-inventory.md:19-24` 仍列为未解决。命名改成“模板”不会解决授权问题。
- `physical135` 对 4 个型号没有片边文字定义（`FUJI_ACROS_II`、`FUJI_PROVIA_100F`、`FUJI_VELVIA_100`、`KODAK_KODACHROME_64`，见 `services/physical135/edgeRegistry.ts` 未注册），经典色彩下仍可渲染几何/齿孔，但没有该型号的片边文字。命名“物理片边”不会改变这个能力边界；如果 UI 要避免过度承诺，应保留现有条件说明。
- 本报告只读代码与文档，未运行测试，未修改生产代码。
