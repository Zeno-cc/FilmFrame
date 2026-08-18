# 实现计划：前端胶片味 / 复古感再进化

## 执行方式

- 主会话：完成规划与验收。
- **grok 子代理**：按本清单改前端样式/少量结构，保持业务逻辑不动。
- 编码前加载 `trellis-before-dev`（frontend 层）。

## 清单

### 1. Token 与全局氛围

- [x] 扩展 `styles/tokens.css`：surface、vignette、grain opacity、shadow 分层、可选 safelight wash。
- [x] 在 `styles/base.css` 增加全局氛围伪元素（noise + vignette），尊重 reduced-motion。
- [x] 确认不破坏现有 selection / focus 可见性。

### 2. 共享材质与控件

- [x] `styles/components.css` 增加 `.ff-surface` 系列或增强 `.ff-panel`。
- [x] Button / IconButton / SegmentedControl：primary/secondary 压印感，避免塑料 flat。
- [x] Modal/Sheet：纸面或台面投影，去掉过度「通用弹窗」感。

### 3. 壳层

- [x] `AppHeader` / `SessionMeter`：仪表化但不拥挤；保留功能与 aria。
- [x] `AppShell`：仅在需要时加 atmosphere 挂载点 class。

### 4. 空暗房

- [x] 重构 `EmptyDarkroom` 视觉层级：胶片底 + 台面内容 + 引言卡片。
- [x] 增强胶片齿孔/画格，避免空洞灰框。
- [x] 保留 testid：`empty-darkroom-film-track`、`photography-quote` 等。
- [x] 三列 steps 去 feature 化，改成更短的工艺提示。

### 5. 工作区

- [x] `PhotoCard` 帧号/边/入选态材质化。
- [x] `WorkspaceToolbar` / `FilmSequenceRail` 与整体统一。
- [x] 有图状态背景与空态同一套桌面隐喻。

### 6. 第三方 JS（按需）

- [x] 先交付 CSS 路径。
- [x] 若 grain 不够：自研 tile 生成模块；再评估依赖。
- [x] 写入简短说明（为何需要 / 如何关）。

### 7. 验证

- [x] `npm run check`
- [x] 相关 e2e 或手工路径：空态、上传、卡片、设置、导出按钮可见性
- [x] 截图前后对比（桌面空态 + 有图）— 见 screenshots/ 与 visual-review.md
- [x] `git diff --check`

## 建议提交切分

1. `style(ui): atmosphere tokens and base grain/vignette`
2. `style(ui): darkroom surfaces for shell cards and empty state`
3. `fix(ui): keep e2e selectors / reduced motion`（如有）

## 子代理提示要点

- 不要改导出/worker/access。
- 不要大规模重构目录。
- 优先 CSS 与现有 class 前缀 `ff-`。
- 所有用户可见文案中文。
- 做完跑 check。
