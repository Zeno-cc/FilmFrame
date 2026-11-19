# 实施上下文摘要：渲染模式减负

本文件是 39KB 审计与命名研究的精简交付，供实施/检查子代理直接使用。

## 事实

- 三个正交字段：
  - `frameRenderMode: 'classic' | 'real135'`（旧 UI“片边模式”）
  - `edgeRenderMode: 'legacy-template' | 'physical135'`（旧 UI“底片渲染”）
  - `imagingMode: 'legacy' | 'spectral'`
- “经典片边”=`frameRenderMode='classic'`，不是 `edgeRenderMode='legacy-template'`。
- `legacy-template` 同时用于 16 个 PNG 模板和 11 个程序化兼容片边；9 款光谱胶片没有已验收物理片边，仍依赖它。不能删除。
- 29 款胶片中 24 款 `supportsSpectralStock` 为真；5 款 blocked：ColorPlus 200、Pro Image 100、Superia 400、T-Max 400、P3200。
- 用户已确认：经典片边只从 24 款光谱胶片移除，非光谱胶片保留。
- 仓库证实模板为 “user-provided generated film-border artwork”；未记录具体生成工具/提示词。UI 用“模板片边”，不要写“AI”或“实测扫描”，也不改 provenance。

## 必须采用的用户文案

- `frameRenderMode='real135'` → `135 画幅`
- `frameRenderMode='classic'` → `经典边框`
- `edgeRenderMode='legacy-template'` → `模板片边`
- `edgeRenderMode='physical135'` → `物理片边`
- 旧“底片渲染”标签 → `片边方式`
- helper：`模板整幅套用，物理按片门与齿孔生成`

## 行为

- 光谱胶片：不渲染“画幅样式”/“片边模式”二选一；固定 `real135`；显示“片边方式”。
- 非光谱胶片：显示“135 画幅 / 经典边框”；经典边框时隐藏片边方式和物理参数。
- 迁移：光谱 + `classic` → `real135 + legacy-template + legacy`，使用现有 notice 提示一次。
- 非光谱 + classic 不变；不批量重写旧配方，只在应用时迁移。
- 不改白名单、localStorage 键、枚举值、渲染签名键。
- 不移除 `renderClassicFrame`/`renderClassicStrip`，不移除模板或物理资产。

## 关键文件

- `components/settings/RecipeInspector.tsx`
  - 106-107 模式判定
  - 301-323 片边模式 fieldset
  - 353-434 高级渲染/底片渲染/物理参数
  - 325-338、478-549 经典专属控件
- `components/settings/RecipeSummaryCard.tsx:19-21`
- `services/settingsStorage.ts`
  - 15-18 白名单
  - 175-193 mergeSettings
  - 199-210 settingsForFilmStock
  - 216+ loadPreferences
- `App.tsx`：load/applyRecipe/notice/光谱长条提示（审计为 751、1094-1104）
- `services/physical135/plan.ts:157-160` 用户错误
- `services/spectral/stockRegistry.ts:49-52` capability
- `tests/e2e/recipeControls.ts:14-18` selector 单点

## 验证

- 单测：光谱/非光谱 × classic/real135；旧偏好/配方迁移；切换胶片归一化；内部枚举和渲染 key 不变。
- Playwright：光谱胶片无经典入口；非光谱仍可经典；新名称；摘要/错误；390px 无溢出。
- 更新所有 `getByLabel('底片渲染')`、`getByRole('button', {name:'真实 135'})` 与旧错误文案断言。
- 命令：`npm run typecheck`、相关 Vitest、相关 Playwright、`npm run build`、`npm test`。

## 不要做

- 不要全局删除经典片边或经典渲染器。
- 不要改内部枚举、持久化键或渲染签名。
- 不要修改光谱/物理算法、Worker 协议、输出尺寸。
- 不要把“模板”称为 AI、官方、原厂或实测扫描。
