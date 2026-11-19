# 技术设计：渲染模式减负与命名重构

## 1. 边界

本任务只改设置呈现、状态归一化和相关文案，不改渲染算法。

保持不变：
- `FilmSettings.frameRenderMode: 'classic' | 'real135'`
- `FilmSettings.edgeRenderMode: 'legacy-template' | 'physical135'`
- `FilmSettings.imagingMode: 'legacy' | 'spectral'`
- localStorage 键、配方结构、渲染签名键和 Worker 协议。
- `renderClassicFrame` / `renderClassicStrip`：5 款非光谱胶片仍需要经典边框。
- 16 个 PNG 模板、11 个程序化兼容片边、物理片边与光谱资源。

改变：
- 光谱胶片的经典边框入口与无效的“片边模式”二选一。
- 片边实现的控件名称、层级与摘要文案。
- 光谱胶片读取/换片/配方应用时的冲突状态归一化。

## 2. 能力范围

以 `services/spectral/stockRegistry.ts` 的 `supportsSpectralStock(brandText)` 为唯一依据：

- `true`（24 款）：固定 `frameRenderMode='real135'`，隐藏“画幅样式”。
- `false`（ColorPlus 200、Pro Image 100、Superia 400、T-Max 400、P3200）：保留“画幅样式：135 画幅 / 经典边框”。

不使用 `imagingMode === 'spectral'` 判断是否隐藏经典边框，因为用户可能当前选了经典色彩，但该胶片仍具备光谱能力；范围必须按胶片能力而不是当前色彩选项判断。

## 3. 状态归一化

新增单一纯函数，建议放在 `services/settingsStorage.ts`：

```ts
export interface SpectralRenderMigration {
  settings: FilmSettings;
  migratedClassic: boolean;
}

export function normalizeSpectralRenderMode(settings: FilmSettings): SpectralRenderMigration;
```

规则：

```ts
if (supportsSpectralStock(settings.brandText)
    && (settings.frameRenderMode ?? 'real135') === 'classic') {
  return {
    migratedClassic: true,
    settings: {
      ...settings,
      frameRenderMode: 'real135',
      edgeRenderMode: 'legacy-template',
      imagingMode: 'legacy',
    },
  };
}
return { settings, migratedClassic: false };
```

选择 `legacy-template + legacy` 是保持旧经典边框最接近的可用输出；不会突然切到物理片边或光谱显影。

调用点：

1. `loadPreferences()`：归一化保存的偏好，并返回 `migratedClassicEdge` 标志，App 用现有 notice 提示一次。
2. `applyRecipe()`：应用旧配方后归一化；只对本次结果生效，不重写 `filmFrame.recipes.v1` 中的原始配方。
3. `settingsForFilmStock()`：从非光谱经典边框切到光谱胶片时立即归一化，清除不可表示状态。
4. 保存偏好时正常保存归一化后的值，不做版本号升级；按能力迁移比版本迁移更稳定，也避开 `applyRecipe` 固定传版本 0 的陷阱。

冲突归一化还应保证：
- `frameRenderMode='classic'` 时 `edgeRenderMode` 永远不进入物理参数 UI。
- `imagingMode` 在经典边框下不参与渲染，切换回 135 画幅时不会被呈现为“经典片边 + 光谱模拟”。

## 4. 文案与层级

新增纯文案模块 `services/renderModePresentation.ts`，集中提供：

```ts
export const FRAME_MODE_LABELS = {
  real135: '135 画幅',
  classic: '经典边框',
} as const;

export const EDGE_MODE_LABELS = {
  'legacy-template': '模板片边',
  physical135: '物理片边',
} as const;

export const EDGE_MODE_HELPER = '模板整幅套用，物理按片门与齿孔生成';
```

`RecipeInspector`、`RecipeSummaryCard`、物理能力错误文案和光谱长条提示从这里取文案，避免再次分叉。内部错误可以继续使用英文错误码或旧类型名，但用户可见句子不再使用“底片渲染”“真实 135 贴图”“物理底片”。

### 4.1 设置面板结构

光谱胶片：

```text
片边
  片边方式  [模板片边 / 物理片边]
            模板整幅套用，物理按片门与齿孔生成
  起始帧号
  高级渲染设置
    （仅物理片边）齿孔背光、镜头光圈、拉直、边缘灰雾、片轴漏光
    颜色与帧号设置
```

非光谱胶片：

```text
片边
  画幅样式  [135 画幅 / 经典边框]
  （仅 135 画幅）片边方式 [模板片边 / 物理片边]
                 模板整幅套用，物理按片门与齿孔生成
  起始帧号
  高级渲染设置
    （仅 135 画幅 + 物理片边）物理参数
    （仅经典边框）日期、齿孔、颜色、边框尺寸
```

具体行为：
- `supportsSpectralStock` 为真时，整组“画幅样式” fieldset 不渲染。
- 非光谱胶片选择经典边框时，`片边方式` 和物理参数不渲染；经典专属控件照旧显示。
- `片边方式` 从当前 `高级渲染设置` 内的 `底片渲染` select 提升到“片边”常规层。
- `高级渲染设置` 只保留参数，不再用“PHYSICAL 135”图例描述模板模式。
- helper 只出现一次，使用现有弱化说明样式，不加卡片。

## 5. 受影响组件与数据流

### `RecipeInspector.tsx`

- 判断新增 `const hasSpectralStock = supportsSpectralStock(settings.brandText)`。
- 仅 `!hasSpectralStock` 渲染“画幅样式”二选一。
- `isReal135` 仍由设置值计算，但光谱胶片加载后已被归一化为真。
- 将 `底片渲染` select 移出高级 fieldset；更新所有 option 与错误文案。
- 物理参数继续仅在 `edgeRenderMode === 'physical135'` 时显示。
- 经典专属控件继续仅在 `!isReal135` 时显示，代码保留给非光谱胶片。

### `RecipeSummaryCard.tsx`

- 使用集中文案：
  - `!real135` → “经典边框”
  - `real135 + physical135` → “物理片边”
  - `real135 + legacy-template` → “模板片边”
- 不再显示“真实 135”或“物理底片”。

### `settingsStorage.ts`

- 引入 `supportsSpectralStock`。
- 实现 `normalizeSpectralRenderMode`，在 `settingsForFilmStock` 内调用。
- `loadPreferences` 返回新增静态迁移标志；保持现有返回字段兼容。
- 不改变白名单，不删除 `'classic'`，避免旧值静默丢失。
- 不提升 `CURRENT_RENDER_PREFERENCE_VERSION`；能力归一化独立于版本。

### `App.tsx`

- 加载偏好后，用返回的标志显示一次现有 notice：`经典片边已停用，已切换为模板片边`。
- 应用旧配方后比较归一化结果，必要时提示一次。
- 更新光谱长条提示：
  “光谱负片使用模板片边时仅支持单张；胶片长条请改用物理片边或经典色彩。”
- 保持默认值 `frameRenderMode='real135'`、`edgeRenderMode='physical135'`、`imagingMode='spectral'` 不变。

### `services/physical135/plan.ts`

- 只改用户可见错误：
  - `请使用真实 135 兼容贴图` → `请改用模板片边`
  - `物理 135 片边不能与经典片边同时启用` → `物理片边需要启用 135 画幅`
- 不改能力判断、可见性检查或 throw 条件。

## 6. 兼容与迁移

| 旧状态 | 行为 |
|---|---|
| 光谱胶片 + `frameRenderMode='classic'` 偏好 | 加载为 `real135 + legacy-template + legacy`，提示一次 |
| 光谱胶片 + `classic` 旧配方 | 仅应用时迁移，不修改已保存配方 |
| 非光谱胶片 + `classic` 偏好/配方 | 保持经典边框，不移除功能 |
| `legacy-template` 旧设置 | 原值保留，只改显示名称 |
| `physical135` 旧设置 | 原值保留，只改显示名称 |
| 现有已出片设置签名 | 内部值不变；除迁移用户的设置变化外，不产生额外 stale |

## 7. 测试策略

### 单元

- 新增 `normalizeSpectralRenderMode`：
  - 光谱 + classic → real135 + legacy-template + legacy
  - 光谱 + real135 不变
  - 非光谱 + classic 不变
  - 非光谱 + real135 不变
- `settingsForFilmStock`：
  - 非光谱 classic 切到光谱后清除 classic
  - 光谱切到非光谱时保留 real135
- `loadPreferences`：
  - 旧光谱 classic 提示标志为 true
  - 旧非光谱 classic 标志为 false
- 现有白名单、枚举与渲染 key 测试继续通过。

### Playwright

- 光谱胶片（Gold 200 / Portra 400）：
  - 不存在“片边模式”字段组、没有“经典片边”按钮。
  - 存在 `片边方式`，选项为 `模板片边` / `物理片边`。
  - 切换到物理片边显示物理参数；切回模板片边隐藏。
- 非光谱胶片（ColorPlus 200）：
  - 可见“画幅样式”；选择经典边框后 `片边方式` 与物理参数消失。
  - 切回 135 画幅重新出现。
- 旧偏好夹具：
  - 光谱 + classic 被迁移，提示出现一次。
  - 非光谱 + classic 不被迁移。
- 摘要卡和光谱长条错误提示使用新文案。
- 390px 设置面板无横向溢出。

## 8. 回滚

- UI 文案与控件条件可以独立还原，不影响持久化值。
- 迁移函数可移除；内部枚举和旧数据始终保持可读。
- 不删除经典渲染器、资产或字段，因此回滚不涉及数据恢复。
- 若条件显示造成明显布局跳动，可回退为始终显示“画幅样式”，但属于新决策。

## 9. 风险

- 条件显示导致控件随胶片切换出现/消失；这是用户已确认的范围取舍。
- “模板”可能被理解为设计模板，helper 用于明确其“整幅套用”语义。
- 不显示“AI”是刻意的：11 款使用程序化兼容片边，不能统一称 AI；生成来源留在 provenance。
- 经典边框的几条错误文案仍被非光谱胶片使用，不能删除。

## 10. Impeccable Shape Brief

- **Mode:** Operate；这是现有设置面板的 Refinement，不更换视觉世界，不新增页面。
- **Audience and moment:** 摄影爱好者已选好胶片，正在“片边”区块决定成片外观；目标是在扫读控件时直接理解两种输出的差异，而不是学习渲染架构。
- **Product truth:** 胶片和照片仍是主角；设置只是精确、低干扰的决策面。模板片边是预制整幅素材，物理片边按 35mm 片门与齿孔生成；不把任一者描述成实测扫描。
- **Focal moment:** 用户第一次看到“片边方式：模板片边 / 物理片边”以及其下的一行 helper，能够在 5 秒内完成选择，不需要先理解旧“真实 135”的父子层级。
- **Hierarchy:** “片边方式”位于“片边”区块的常规层级；起始帧号紧随其后；物理参数留在“高级渲染设置”。“画幅样式”只在 5 款非光谱胶片出现，避免对光谱用户展示单选项控件。
- **Form:** 沿用现有 label、select、fieldset、Disclosure、间距与氧化橙选中态；不新增卡片、分段控件变体或装饰性图标。模板/物理选择使用原生 select，减少控件竞争。
- **Copy:** 模式名只用第 4 节的集中文案；helper 只出现一次，不用“AI”“真实”“官方”“原厂”“模拟”“降级”等暗示质量或来源的形容词。
- **States:** 光谱（无画幅样式）、非光谱 135（有画幅样式 + 片边方式）、非光谱经典边框（无片边方式/物理参数）、物理能力受限（保留现有条件说明）、旧 classic 迁移（一次 notice）、处理中（禁用全部控件）。任何状态都不得出现两个同义“真实 135”。
- **Responsive:** 复用现有设置面板宽度与滚动；390px 下控件占满宽度、标签不换行挤压、无横向溢出；触控高度保持 44px。
- **Accessibility:** select 保持可读 `aria-label`；迁移提示可被辅助技术识别但不抢焦点；控件出现/消失不移动键盘焦点到不可见元素。
- **Anti-goals:** 不新增教学段落、模式卡片、比较表、切换动画或图标；不把“模板”包装成技术品牌；不因为简化而删除 5 款非光谱胶片的经典边框。
- **Visual verification:** 实现完成后在真实页面检查 1440px 与 390px：光谱 Gold 200、非光谱 ColorPlus 200、模板/物理/经典三种状态；再运行 Impeccable 机械检测器。
