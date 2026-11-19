# 实施计划：渲染模式减负与命名重构

## 前置条件

- 用户已确认经典片边只在具备光谱能力的胶片上移除；5 款非光谱胶片保留。
- 本任务不删除经典渲染器、不修改内部枚举值和光谱/物理算法。
- 实施前复核当前工作区已有的未提交修改，不覆盖用户改动。
- 第一次 UI 编辑前读取 Impeccable `craft-floor.md`；实现完成后再运行一次机械检测器，不提前跑。

## 执行顺序

### 1. 建立集中文案

- [x] 新增 `services/renderModePresentation.ts`，导出：
  - `FRAME_MODE_LABELS`: `135 画幅` / `经典边框`
  - `EDGE_MODE_LABELS`: `模板片边` / `物理片边`
  - `EDGE_MODE_HELPER`: `模板整幅套用，物理按片门与齿孔生成`
- [x] 不把内部枚举改名；所有用户可见名称从该模块读取。

### 2. 状态归一化与迁移

- [x] 在 `services/settingsStorage.ts` 增加 `normalizeSpectralRenderMode(settings)`，使用 `supportsSpectralStock`。
- [x] 光谱胶片 + `frameRenderMode='classic'` → `real135 + legacy-template + legacy`。
- [x] `settingsForFilmStock()` 调用归一化，确保从非光谱经典边框切到光谱胶片时不保留冲突状态。
- [x] `loadPreferences()` 返回一次性的 `migratedClassicEdge` 标志；不修改 localStorage 键或版本常量。
- [x] `applyRecipe()` 应用后归一化；旧配方只在应用时转换，不批量重写。
- [x] 保持非光谱胶片的 `classic` 不变。

### 3. 重排设置面板

- [x] `RecipeInspector.tsx` 以 `supportsSpectralStock(settings.brandText)` 控制“画幅样式”：
  - 光谱胶片：不渲染该控件。
  - 非光谱胶片：显示“135 画幅 / 经典边框”。
- [x] 将“片边方式”select 从高级 fieldset 提升到“片边”常规层级。
- [x] 选项改为“模板片边 / 物理片边”，下方只放一行 helper。
- [x] 物理参数仍仅在物理片边时显示；“高级渲染设置”不再用“PHYSICAL 135”图例描述模板模式。
- [x] 经典边框专属控件继续仅在 `!isReal135` 时显示。
- [x] 保留 `aria-label`、44px 触控高度和现有 Disclosure 行为。

### 4. 同步摘要、错误与长条提示

- [x] `RecipeSummaryCard.tsx` 使用集中文案；经典模式显示“经典边框”。
- [x] `services/physical135/plan.ts` 用户错误改为“请改用模板片边”“物理片边需要启用 135 画幅”。
- [x] `RecipeInspector.tsx` 内的兼容提示不再出现“真实 135 贴图”。
- [x] `App.tsx` 光谱长条提示改为“光谱负片使用模板片边时仅支持单张；胶片长条请改用物理片边或经典色彩。”
- [x] App 在旧光谱偏好/配方迁移时用现有 notice 显示一次：
  `经典片边已停用，已切换为模板片边`
- [x] 搜索并替换所有当前用户界面里的“真实 135”“真实 135 贴图”“物理底片”“底片渲染”。

### 5. 测试更新

- [x] 单测新增：
  - 光谱 + classic 迁移
  - 光谱 + real135 不变
  - 非光谱 + classic 不变
  - 非光谱 + real135 不变
  - 非光谱 classic 切到光谱后清除 classic
  - 旧偏好/旧配方的迁移标志只触发一次
- [x] 更新 `tests/e2e/recipeControls.ts` 的 label 联合类型和高级设置分支：`底片渲染` → `片边方式`。
- [x] 更新所有 `getByLabel('底片渲染')`、`getByRole('button', { name: '真实 135' })`、错误文案断言。
- [x] Playwright 新增：
  - Gold 200 / Portra 400：无“画幅样式”“经典片边”；有“片边方式”和两个新选项。
  - ColorPlus 200：保留“画幅样式”；选择经典边框后片边方式与物理参数消失。
  - 光谱旧偏好 `classic` 加载后迁移并提示；非光谱旧 `classic` 保留。
  - 摘要卡显示“模板片边 / 物理片边 / 经典边框”。
  - 390px 设置面板无横向溢出。
- [x] 不改渲染算法测试期望，除非设置输入变化。
- [x] 真实页面视觉检查：1440px 与 390px 下分别查看 Gold 200 光谱、ColorPlus 200 非光谱、模板片边、物理片边、经典边框和迁移提示；确认没有新增卡片、无控件重叠、无不可见焦点目标。
- [x] UI 完成后运行 `"/Users/zacheryxu/.zcode/cli/plugins/cache/impeccable/impeccable/4.9.2/skills/impeccable/scripts/impeccable" detect --json --changed`，处理与本任务相关的真实问题；不修复与本次无关的历史发现。

### 6. 文档

- [x] 更新 `README.md` 中“真实 135 与经典片边”小节和操作步骤。
- [x] 更新 `PRODUCT.md` 的工作流/能力描述。
- [x] 更新 `docs/project/rendering.md`、`docs/project/product-workflows.md`、`handoff.md`、`docs/project/architecture.md` 中当前模式文案。
- [x] 更新 `.impeccable/design.json` 里的示例文案（若仍被引用）。
- [x] 不修改 provenance 文档中的 generated / imagegen 来源记录。

## 验证命令

```bash
npx vitest run tests/settingsStorage.test.ts tests/renderResult.test.ts \
  tests/renderAdmission.test.ts tests/filmWorkerClient.test.ts \
  tests/filmWorkerClientFallback.test.ts tests/physical135Plan.test.ts
npx playwright test tests/e2e/physical-migration.spec.ts \
  tests/e2e/spectral-production.spec.ts tests/e2e/spectral-stock-picker.spec.ts \
  tests/e2e/monochrome-stocks.spec.ts tests/e2e/positive-stocks.spec.ts \
  tests/e2e/cinestill-stocks.spec.ts tests/e2e/portra-push-stocks.spec.ts \
  tests/e2e/pro400h-physical.spec.ts --project=chromium --workers=1
npm run typecheck
npm run build
npm test
"/Users/zacheryxu/.zcode/cli/plugins/cache/impeccable/impeccable/4.9.2/skills/impeccable/scripts/impeccable" detect --json --changed
```

若选择拆提交，建议顺序：
1. 文案与 UI 层。
2. 归一化、迁移与 notice。
3. 测试与文档。

## 实施结果（2026-11-18）

- 设置面板按胶片能力分流；默认光谱 Gold 200 只显示“片边方式”，ColorPlus 200 保留“画幅样式”。
- 旧光谱 `classic` 偏好/配方迁移为 135 画幅 + 模板片边 + 经典色彩，并提示一次；非光谱 classic 保持。
- 浏览器标题改为中性的“FilmFrame - 本地数字暗房”。
- `npm test`: 40 文件 / 373 项通过。
- 专项 Playwright：`render-mode-simplification` 6/6、`physical-migration` 4/4、相关兼容/选片 5/5。
- `npm run typecheck` 与 `npm run build` 通过。
- 1440px/390px 实际截图检查通过：无横向溢出，层级与 helper 符合设计。
- 已知与本任务无关的失败仍存在：Wikimedia 图库外部请求断言、WebGL2 物理渲染与 Worker/主线程哈希差异。

## 风险与回滚

- 控件按胶片能力出现/消失是已确认产品取舍；不要再用 `imagingMode` 二次判断。
- 不删 `classic` 枚举、白名单、渲染器、经典专属字段或 5 款非光谱胶片的经典入口。
- 不修改 `createRenderSettingsKey` 的字段；否则会造成不必要的全量 stale。
- `loadPreferences` 返回结构若变化，必须同步所有调用与测试，不能让迁移标志被忽略。
- 回滚可只还原 UI 条件与迁移调用；旧设置和渲染器保持可读。
- 如果实施中发现需要全局删除经典片边或删除模板能力，停止并回到 PRD，不在本任务扩大范围。
