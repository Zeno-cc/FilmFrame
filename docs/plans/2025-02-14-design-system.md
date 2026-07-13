# FilmFrame 前端重构：设计系统实施计划

> 计划日期：2025-02-14  
> 目标版本：Darkroom Contact Sheet  
> 原始规格：[SPEC.md](2025-02-14-frontend-redesign/SPEC.md)  
> 实施状态：已于 2026-07-12 落地；本文保留 token、组件和验收约束。

## 1. 目标与边界

FilmFrame 的视觉系统要让用户把它理解为一间本地数字暗房：照片是接触印样，参数是暗房配方，状态是实验室标签。视觉重构只改变界面层、组件边界和响应式表达，不改变 Canvas 输出、图片处理顺序、下载协议或存储 schema。

### 1.1 设计目标

- 让照片和成片成为第一视觉中心，界面 chrome 退后。
- 用帧号、片边、接触印样、实验室标签表达摄影语义，而不是套用通用 SaaS 卡片。
- 让每一个工作流状态同时有文字、图标和可读的视觉层级。
- 让常用控制易见，高级片边控制按模式渐进展开。
- 在桌面、平板、手机上保持同一套语义和焦点顺序。

### 1.2 非目标与硬约束

- 不修改 `services/filmEngine.ts`、`services/filmWorker.ts` 或任何 Canvas 像素算法。
- 不改变 `filmWorkerClient.processImage()`、`generateFilmStrip()`、render key、stale 判定、generation gate、Object URL 回收和 Worker fallback。
- 不把原图、成片或 transform 写入 `localStorage`，不增加上传、遥测、远程字体、远程图片或大型 UI 依赖。
- 不使用全局 sepia、照片滤镜、动态噪点、快门/卷片声音、皮革/木纹/假旋钮、玻璃拟态、紫色渐变或胶囊泛滥。
- 不把状态颜色作为唯一信息，不伪造进度百分比或剩余时间。

## 2. 现状证据与落点

当前工作区以 `App.tsx` 为唯一根控制器，约 1967 行；内联 SVG、设置表单、工作区、预览、错误和捐赠 dialog 都在同一文件中。唯一独立 UI 组件为 `components/CropEditor.tsx`。`styles.css` 只有 Tailwind 导入、少量全局样式、Toast 动画和 reduced-motion 规则，颜色和圆角大量散落在 JSX 中。`tailwind.config.cjs` 与 `styles.css` 当前只扫描入口、`App.tsx`，拆组件必须同步扩大扫描范围。

因此设计系统先以 CSS token 和显式 primitive 建立，不先改业务状态模型。每个 primitive 通过 typed props 接收状态，业务判断仍由以下既有 selector/service 提供：

- `deriveImageWorkflowStatus`
- `selectImagesForProcessing`
- `getPrimaryAction`
- `getCurrentImageArtifact`、`createImageRenderKey`
- `createOrderedStripKey`
- `previewNavigation`、`previewDownload`

## 3. 语义 Token

首阶段在 `styles/tokens.css`（或合并到 `styles.css`）定义 token；JSX 不再新增硬编码十六进制颜色。颜色 token 应通过语义 class 或 `data-*` 状态映射使用。

### 3.1 颜色

```css
:root {
  color-scheme: dark;

  --ff-bg-deep: #0b0a08;
  --ff-bg: #100f0c;
  --ff-panel: #17140f;
  --ff-panel-raised: #1e1a14;
  --ff-panel-soft: #242019;

  --ff-line: #3a3328;
  --ff-line-soft: #29241c;
  --ff-line-strong: #5a4d3a;

  --ff-paper: #f0e8d6;
  --ff-paper-muted: #b9ae98;
  --ff-paper-dim: #877d6b;
  --ff-ink: #17130e;

  --ff-amber: #d89a2b;
  --ff-amber-hover: #eeae37;
  --ff-amber-soft: rgba(216, 154, 43, 0.14);
  --ff-safelight: #8c312b;
  --ff-safelight-soft: rgba(140, 49, 43, 0.16);

  --ff-success: #7b8f6b;
  --ff-success-text: #b9cba8;
  --ff-warning: #c18331;
  --ff-danger: #d26d5e;
  --ff-info: #8692a0;
  --ff-focus: #f0b33c;
  --ff-overlay: rgba(5, 4, 3, 0.88);
}
```

使用规则：

- 页面背景使用 `--ff-bg-deep` / `--ff-bg`，普通容器使用 `--ff-panel`。
- `--ff-panel-raised` 仅用于少量抬升区域，避免每个元素都变成卡片。
- 正文使用 `--ff-paper`，辅助信息使用 `--ff-paper-muted` / `--ff-paper-dim`。
- `--ff-amber` 只用于主操作、当前选中、少量帧号；处理中的局部状态使用 `--ff-safelight`。
- 成功、警告和错误必须同时有文案或图标；照片、Canvas 和预览不得应用这些颜色作为滤镜。

### 3.2 字体与字号

```css
:root {
  --ff-font-display: "Songti SC", "STSong", "Noto Serif CJK SC",
    "Source Han Serif SC", Georgia, serif;
  --ff-font-ui: Inter, ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Noto Sans SC",
    "Microsoft YaHei", sans-serif;
  --ff-font-mono: "SFMono-Regular", Consolas, "Liberation Mono",
    ui-monospace, monospace;
}
```

| 语义 | 规格 | 用途 |
| --- | --- | --- |
| 页面标题 | 28/36 desktop，24/32 mobile | Workspace、空态 |
| 区块标题 | 18/26 | Inspector section |
| 正文 | 14/22 或 15/24 | 说明、状态、帮助 |
| 字段/按钮 | 12/18 至 14/20 | 表单和操作 |
| 文件名/参数 | 12/18 mono | 文件、帧号、技术值 |
| 微标签 | 10/14，仅冗余英文 | `CONTACT SHEET` 等 |

display serif 只用于品牌和主要标题；UI sans 用于交互和正文；mono 用于文件名、帧号、参数和技术状态。中文不强制大写，英文微标签可以 uppercase + tracking。重要信息不得小于 12px。

### 3.3 间距、形状与层级

- 使用 4px 网格：`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`。
- 组件内间距 12–16px；字段间距 16px；Inspector section 间距 24px；卡片间距 desktop 20–24px、mobile 12–16px。
- 按钮、输入、分段控件圆角 4px；卡片 6px；dialog 8px；圆形只用于头像式图标按钮或状态点。
- 默认边框 1px `--ff-line-soft`，hover/focus 提升到 `--ff-line-strong`；阴影使用暖黑短阴影 `0 12px 32px rgba(0,0,0,.28)`。

### 3.4 材料、纹理与动效

允许 1.5%–2.5% 不透明度的静态噪点、极淡工作台纹理、片边齿孔 motif、Header 极弱安全灯红光和矩形实验室印章。噪点与纹理必须位于页面背景层，不能覆盖 `<img>`、Canvas 或 Preview。

```css
:root {
  --ff-motion-fast: 120ms;
  --ff-motion-base: 180ms;
  --ff-motion-slow: 260ms;
  --ff-ease: cubic-bezier(.22, 1, .36, 1);
}
```

Button hover 只改变颜色/边框；卡片最多上移 1px；Drawer/Dialog 为 180–260ms；Toast 进入约 220ms。处理中只显示静态脉冲或边缘扫描，不显示虚假百分比。`prefers-reduced-motion: reduce` 时取消位移、缩放、循环动画，保留即时状态切换。

## 4. UI Primitive 计划

组件集中放在 `components/ui/`，每个组件不超过约 250 行，props 显式 typed，不通过 Context 隐藏业务数据。

| Primitive | 责任 | 必须提供的状态 |
| --- | --- | --- |
| `Button` | 主/次/ghost/danger 操作 | hover、focus-visible、disabled、loading |
| `IconButton` | 熟悉的单图标动作 | `aria-label`、`title`、44px 触控尺寸 |
| `SegmentedControl` | 单张/长条、原图/成片等互斥选择 | selected、disabled、键盘语义 |
| `Field` | label、帮助、错误和控件布局 | required/disabled/error |
| `RangeField` | range + 当前数值 | 键盘、数值 aria-label、触控尺寸 |
| `StatusStamp` | 状态文字、英文微标签、图标 | 6 种 workflow 状态、非颜色表达 |
| `Disclosure` | Inspector 桌面折叠 | `aria-expanded`、收起不卸载字段 |
| `ModalSurface` | Preview、Error、Support、Drawer 基础层 | 初始焦点、Tab 闭环、Escape、焦点恢复 |
| `Sheet` | 手机底部设置 | scroll lock、safe area、固定 footer |
| `NoticeToast` | info/success/warning/error | `aria-live`、手动关闭、reduced motion |

图标集中到 `components/icons/FilmFrameIcons.tsx`，继续使用本地内联 SVG、`currentColor`、16/18/20px 三档和 1.75–2px stroke；不引入图标库。关键动作不能只用图标替代文字。

### 4.1 Workflow 状态视觉映射

展示层只映射 service 返回的 `ImageWorkflowStatusKind`，不复制状态判断。

| kind | 中文 | 英文标签 | 视觉组合 |
| --- | --- | --- | --- |
| `unprocessed` | 待冲洗 | WAITING | 中性轮廓 + 状态图标 |
| `stale` | 需重洗 | RE-DEVELOP | amber 轮廓 + detail |
| `queued` | 排队中 | QUEUED | info 轮廓 |
| `processing` | 冲洗中 | DEVELOPING | safelight 局部强调 + 静态脉冲 |
| `complete` | 已出片 | READY | success 轮廓 + 下载可用 |
| `failed` | 冲洗失败 | ERROR | danger 轮廓 + 错误详情/重试 |

## 5. CSS/Tailwind 实施顺序

1. 新增 `styles/tokens.css`、`styles/base.css`、`styles/components.css`，或在不拆文件的情况下在 `styles.css` 维持同样层次。
2. 在 `styles.css` 增加扫描范围：

   ```css
   @source "./index.html";
   @source "./index.tsx";
   @source "./App.tsx";
   @source "./components/**/*.tsx";
   @source "./components/**/*.ts";
   ```

   若新增 `hooks/` 或 `features/`，同步加入。
3. 用 `.ff-panel`、`.ff-lab-label`、`.ff-focus-ring` 等语义 class 承载高复用外观；tone/status 使用显式 map 或 `data-*`，不拼接动态 Tailwind 类。
4. 保留现有 Toast 生命周期、safe-area 底栏和 reduced-motion 规则；无全局 `outline: none`。
5. 深色 native select、range thumb、disabled 文本和滚动条在 Safari/Chromium 各验证一次。

## 6. 设计系统验收清单

- [ ] 页面首屏呈现“数字暗房/接触印样”语义，而非通用后台。
- [ ] 所有新颜色来自 token，JSX 不新增散落 hex；生产构建不会 purge 新组件样式。
- [ ] 用户照片和 Canvas 结果保持原色、清晰度，不应用 UI 滤镜、透明度或 blur 动画。
- [ ] 组件圆角、间距、字体和动效符合本文件 token；没有 `rounded-2xl`/`rounded-full` 泛滥。
- [ ] 六种图片状态都有文字、图标和可读对比度，不能只看颜色区分。
- [ ] 所有 icon-only 控件有 `aria-label` 和 tooltip/title；触控目标至少 44×44px。
- [ ] Dialog/Drawer/Sheet 具备初始焦点、Tab 闭环、Escape 和焦点恢复。
- [ ] `prefers-reduced-motion` 与 200% 缩放下仍能完成主流程。
- [ ] 不引入远程字体、图片、遥测、上传、大型 UI/动画依赖。
- [ ] `npm run test`、`npm run typecheck`、`npm run build` 在每个阶段通过。

## 7. 交付证据

每个阶段记录：变更文件、截图尺寸、token/组件状态、门禁命令输出和未解决项。当前基线已验证为 16 个 Vitest 文件/118 项断言通过，TypeScript 与 Vite production build 通过；原始工作区的未提交改动不得被重置或覆盖。

本次落地文件包括 `styles/{tokens,base,components}.css`、`components/ui/`、`components/icons/FilmFrameIcons.tsx` 与 feature 组件目录。`StatusStamp` 已用于 PhotoCard；其余 primitive 保持为小型可复用边界，避免为了抽象而重写稳定的业务组件。最终验证为 118 项 Vitest 断言、TypeScript、production build 和 10 条 Chromium E2E。
