# FilmFrame 前端整体重构规格

> 文档状态：Approved for implementation
>
> 面向执行者：Codex / 前端工程师
>
> 基线：用户提供的 `FilmFrame-main` 当前工作区，包含尚未提交的 P0/P1 主流程、移动端与自由裁切改动
>
> 目标版本代号：**Darkroom Contact Sheet**
>
> 语言：界面以简体中文为主，保留少量摄影暗房语境中的英文技术标签

---

## 0. 执行摘要

本次不是简单更换颜色、圆角或背景纹理，而是对 FilmFrame 的界面架构、视觉系统、组件边界和响应式交互进行一次完整重构。

新的产品体验应被理解为：

> **一间为摄影师设计的浏览器数字暗房。用户把一卷照片放到接触印样台上，选择片边与输出配方，冲洗、审片、调整构图，最后导出。**

视觉关键词：

- 复古胶片，而不是廉价怀旧滤镜；
- 暗房、接触印样、底片片边、帧号、实验室标签；
- 专业摄影工具，而不是模拟相机玩具；
- 温暖、克制、可长期使用；
- 图片优先，界面退后；
- 有物理质感，但不做过度拟物。

重构后必须完整保留当前功能：本地上传、排序、单张与长条模式、真实 135 与经典边框、逐张状态、停止后续处理、即时预览、Before/After、自由裁切、旋转、单张冲洗、配方、分享、下载、ZIP、错误恢复和隐私边界。

**本轮不修改 Canvas 胶片渲染算法，也不改变图片处理结果。** UI 可以重排和重命名，但不能破坏现有业务契约、Blob URL 所有权、Worker fallback、结果 stale 判定、localStorage schema 或下载行为。

---

## 1. 当前项目事实与问题审计

### 1.1 当前技术与产品事实

以提供的源码为准：

- React 19 + TypeScript + Vite 5 + Tailwind CSS 4；
- 单页应用，无路由、无后端、无账号、无数据库；
- 图片只在浏览器内存中处理，不上传；
- 单张和连续胶片长条是两个输出模式；
- `classic` 与 `real135` 是两个片边渲染模式；
- UI 目前只对 Kodak Gold 200 开放真实 135；
- 16 种胶片型号主要用于片边标记、颜色、字体和孔型预设，不应在文案中误导用户认为每一种都进行了完整胶片色彩模拟；
- 图片支持 JPEG、PNG、WebP；
- 图片顺序决定冲洗顺序、帧号、长条顺序和 ZIP 序号；
- 当前有逐张 `未处理 / 待更新 / 等待中 / 冲洗中 / 已完成 / 失败` 状态；
- 已具备自由平移、100%–300% 缩放与四分之一旋转的构图编辑器；
- 设置使用 `filmFrame.preferences.v1`，配方使用 `filmFrame.recipes.v1`；
- `App.tsx` 约 1967 行，承担大部分状态、工作流和 UI；
- `styles.css` 只扫描 `App.tsx`、`index.tsx` 和 `index.html`，拆组件时必须扩充 Tailwind `@source`；
- 主线程与 Worker 有两套渲染实现，本次 UI 重构不得顺手改写渲染引擎；
- `public/alipay.jpg` 在当前快照中不可解析，不能假设捐赠二维码可用。

### 1.2 当前界面问题

#### 结构问题

1. 桌面端把所有参数、社区入口、输出模式和主操作塞在同一条左侧栏，信息架构近似通用后台表单。
2. 输出模式是工作区级别的视图切换，却被放在设置栏中，用户难以理解它会重构中央工作区。
3. 关键操作“添加、冲洗、下载”分布在多个位置，视觉优先级不稳定。
4. 移动端设置直接插入页面尾部，展开后产生非常长的文档流；用户需要在照片列表与参数之间大幅滚动。
5. 社区与捐赠入口占据设置栏高优先级位置，干扰创作主流程。
6. 当前空态是常见的虚线上传框，无法建立 FilmFrame 独有的产品记忆。

#### 视觉问题

1. 纯黑背景、亮橙按钮、灰色卡片构成了常见 SaaS 工具风格，缺少暗房与胶片的材料感。
2. 大量圆角、胶囊和渐变与专业摄影工具的克制气质不一致。
3. 胶片元素只出现在 Logo 与生成结果中，界面结构本身没有使用帧号、接触印样、片边标记等摄影语言。
4. 字体层级接近默认系统后台；文件信息、帧号、技术参数和标题没有形成“编辑部 / 实验室标签”的区分。
5. 当前 10px 文本较多，关键信息在高密度屏幕和移动端可读性不足。
6. Hover 覆盖层在桌面端遮住照片，照片本身没有成为真正的视觉中心。

#### 工程问题

1. `App.tsx` 单体导致 UI 变更风险高、难以测试和复用。
2. 大量硬编码十六进制颜色和 Tailwind 类散布在 JSX 中，没有语义化设计 token。
3. 图标、按钮、分段控件、字段和 dialog 样式重复。
4. 当前组件目录只有 `CropEditor`，无法按功能域演进。
5. 没有自动浏览器级 UI 测试或稳定的响应式验收矩阵。

---

## 2. 产品定位与设计原则

### 2.1 产品定位

FilmFrame 不是图库、在线修图器或相机模拟器。它是一个轻量、本地、单会话的 **Digital Darkroom / 数字暗房**。

产品主流程应被组织成：

```text
选片 -> 排序 -> 选择暗房配方 -> 冲洗 -> 审片/调整构图 -> 导出
```

界面术语可以带有暗房感，但不能牺牲清晰度。中文是主信息，英文只作为视觉标签或摄影技术术语。

### 2.2 六条设计原则

1. **Image first**：照片和成片占据最大面积，界面 chrome 不与照片争夺注意力。
2. **Film semantics, not costume**：使用帧号、片边、接触印样、实验室标签等真实摄影语义，不堆叠皮革、木纹、假旋钮和复古相机装饰。
3. **Progressive control**：常用设置先出现；经典片边的高级定制按条件展开。
4. **Every state is visible**：未处理、需重洗、等待、处理中、完成、失败、导出中都必须可见，且不能只靠颜色表达。
5. **Local by design**：本地处理与不上传是核心信任信息，但不重复轰炸用户。
6. **Tactile, not theatrical**：动效短、轻、可关闭；不使用快门声、胶片抖动、灰尘飘动等戏剧效果。

### 2.3 明确禁止的视觉方向

- 不使用大面积棕黄色 sepia 滤镜覆盖界面或用户照片；
- 不模拟皮革机身、木制暗房桌、金属旋钮、镜头光圈按钮；
- 不使用假胶片划痕动画、快门声音、卷片声音；
- 不把每个容器做成胶囊；
- 不使用霓虹橙、紫色渐变或玻璃拟态作为主风格；
- 不随机旋转照片卡片，不做剪贴簿风格；
- 不把上传图片染色、降亮或加噪作为 UI 效果；
- 不使用远程图片、远程字体或运行时 CDN。

---

## 3. 范围、非目标与不可破坏契约

### 3.1 本轮范围

- 全局界面信息架构重组；
- 桌面、平板、移动端响应式重构；
- 完整设计系统与 CSS token；
- 空态、上传态、接触印样、照片卡片、长条模式、设置面板、预览、裁切、反馈和 dialog 重设计；
- `App.tsx` UI 组件化；
- 增加浏览器级关键流程测试；
- 修复捐赠二维码加载失败时的 UI fallback；
- 更新项目文档与界面截图基线。

### 3.2 本轮非目标

- 不新增后端、登录、云同步、历史任务或 IndexedDB；
- 不增加路由或多页面；
- 不迁移到 Next.js、Remix 或其他框架；
- 不引入全局状态库；
- 不修改 Canvas 胶片绘制、Gold 200 色彩算法、输出尺寸或随机纹理；
- 不新增胶片型号；
- 不增加任意角旋转、透视、AI 主体检测或可变裁切比例；
- 不改变下载命名、ZIP 格式、文件安全清洗规则；
- 不改变 localStorage key 或 schema；
- 不宣称所有胶片型号都具备真实色彩模拟；
- 不伪造处理百分比或剩余时间；
- 不自行制作或替换真实支付二维码。

### 3.3 不可破坏的工程契约

1. UI 继续通过 `filmWorkerClient.processImage()` 与 `generateFilmStrip()` 调用渲染门面。
2. 不绕过 `renderResult` 的 settings key、MIME 和 stale 判定。
3. 不削弱 generation gate、晚到结果回收和 Object URL 生命周期。
4. 不把原图、成片或 transform 写入 localStorage。
5. 图片数组顺序继续作为业务顺序唯一来源。
6. 处理依然逐张串行；单张失败不能中断其他项。
7. “停止后续”不承诺中断当前 Canvas，只停止下一项并丢弃晚到旧结果。
8. 移除图片、替换结果、关闭预览和卸载时的 URL 回收逻辑必须保留。
9. `classic` 当前固定主线程、Gold 200 真实 135 按能力使用 Worker 的策略不变。
10. 所有现有 Vitest 契约继续通过。

---

## 4. 目标信息架构

### 4.1 顶层区域

重构为三个稳定区域：

```text
┌─────────────────────────────────────────────────────────────────────┐
│ App Header：品牌 / 当前胶卷摘要 / 添加 / 导出 / 更多              │
├──────────────────────────────────────────────┬──────────────────────┤
│                                              │                      │
│ Workspace：接触印样或连底长条                │ Recipe Inspector     │
│                                              │ 暗房配方与输出设置   │
│                                              │                      │
│                                              │ Sticky Develop CTA   │
└──────────────────────────────────────────────┴──────────────────────┘
```

- **输出模式**从设置栏移到 Workspace 顶部，作为主视图 Tab；
- **设置面板**移到桌面端右侧，符合摄影软件常见的“图像在左、参数在右”习惯；
- **添加与导出**进入全局 Header；
- **冲洗主操作**固定在设置面板底部，移动端固定在底部动作栏；
- **GitHub、捐赠、重置**进入 Header 的“更多”菜单或设置面板次级区域，不再抢占主流程。

### 4.2 页面语义结构

建议 DOM：

```tsx
<AppShell>
  <AppHeader />
  <div className="app-body">
    <main id="workspace">
      <WorkspaceToolbar />
      <WorkspaceContent />
    </main>
    <RecipeInspector />
  </div>
  <MobileActionBar />
  <MobileSettingsSheet />
  <PreviewDialog />
  <FeedbackLayer />
</AppShell>
```

Workspace 内容：

```text
WorkspaceContent
  ├─ EmptyDarkroom                 images.length === 0
  ├─ ContactSheet                  single + images
  │    └─ PhotoCard[]
  └─ FilmStripWorkspace            strip + images
       ├─ StripStage
       └─ FilmSequenceRail
```

### 4.3 工作区级导航

使用两个 Tab，而不是设置项：

- `单张成片`，英文微标签 `CONTACT SHEET`；
- `连底长条`，英文微标签 `FILM STRIP`。

要求：

- 使用 button + `aria-pressed`，或标准 `tablist/tab` 语义；
- 切换时不能丢失图片、设置或单张已完成结果；
- 处理或导出期间沿用当前禁用策略；
- Tab 中显示数量或状态摘要，例如 `单张成片 · 4`；
- 不使用仅图标模式。

---

## 5. 响应式布局规格

### 5.1 断点

使用以下产品断点，不依赖设备名称：

| 区间 | 布局 |
| --- | --- |
| `< 640px` | 手机；单列接触印样；固定底部动作栏；设置为全宽底部 Sheet |
| `640–767px` | 大手机；单列或条件双列；设置仍为 Sheet |
| `768–1179px` | 平板/小桌面；工作区全宽；设置为右侧 Drawer |
| `>= 1180px` | 桌面；工作区 + 344px 固定右侧 Inspector |
| `>= 1536px` | 大桌面；Inspector 368px；接触印样最多四列 |

### 5.2 桌面布局

- Header 高度：64px；`position: sticky; top: 0; z-index` 高于工作区；
- App body：`grid-template-columns: minmax(0, 1fr) 344px`；
- Inspector：`position: sticky; top: 64px; height: calc(100dvh - 64px)`；
- Inspector 自身可滚动，底部 CTA 固定在 Inspector 内；
- Workspace 保持页面主滚动，不再套一层不必要的纵向滚动容器；
- 工作区左右 padding：32px，大屏 40px；
- 不再使用固定 `max-w-6xl` 压缩大屏图片区域；最大内容宽度可设为 1500px，并水平居中；
- 1440px 宽度下，工作区至少能容纳三张合理尺寸的卡片。

### 5.3 平板布局

- Header 保留；
- Inspector 默认关闭，通过 Header 的“配方”按钮打开右侧 Drawer；
- Drawer 宽 `min(380px, 92vw)`；
- Drawer 使用 `role="dialog"`、`aria-modal="true"`、焦点闭环、Escape 关闭和焦点恢复；
- 工作区两列卡片；
- 底部不固定两套重复主按钮，Header 与 Drawer footer 之间只能存在一个当前主操作。

### 5.4 手机布局

- Header 高度约 56px；只显示 Logo、简短胶卷摘要和设置按钮；
- 工作区 padding 12–16px；
- 首屏必须看见：品牌、隐私提示、工作区标题/模式和“添加照片”；
- Bottom Action Bar 固定底部，高度至少 64px，加 `env(safe-area-inset-bottom)`；
- 主按钮占剩余宽度，左侧设置按钮 44px；
- 设置不再插入页面尾部；使用从底部升起的 Sheet；
- Sheet 高度 `min(92dvh, 760px)`，包含固定 Header、可滚动 Body、固定 Footer；
- Sheet 内按 `胶片 / 输出 / 配方` 三个子 Tab 分组，避免一次滚动整张长表单；
- 打开 Sheet 时锁定背景滚动；关闭后恢复触发按钮焦点；
- 照片卡片单列，图片本身可点击打开预览；
- 所有操作目标至少 44×44px；
- 不允许横向页面溢出。

---

## 6. 视觉设计系统

### 6.1 核心概念：Darkroom Contact Sheet

视觉材料来自四类真实摄影语义：

1. **暗房工作台**：暖黑、炭灰、低反射表面；
2. **接触印样纸**：骨白、微黄纸张、细线标记；
3. **胶片片边**：帧号、孔位、单色品牌标记；
4. **安全灯**：克制的深红，只用于处理中、警告与局部氛围。

不要让界面本身看起来“陈旧”。复古感来自材料、排版和摄影术语，不来自脏污和低清晰度。

### 6.2 颜色 token

在 `styles.css` 或 `styles/tokens.css` 定义语义变量。JSX 禁止继续散落硬编码颜色。

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

- 页面背景使用 `--ff-bg-deep` / `--ff-bg`；
- 主面板使用 `--ff-panel`；
- 抬升容器使用 `--ff-panel-raised`，数量要少；
- 正文使用 `--ff-paper`；次要文字使用 `--ff-paper-muted`；
- `--ff-amber` 只用于主操作、当前选中和少量帧号；
- `--ff-safelight` 不作为普通按钮主色；
- 成功、警告、错误不能只使用颜色，必须有文字或图标；
- 用户照片和渲染结果不得加 UI 色彩滤镜。

### 6.3 字体

本轮不加载远程字体，也不要求提交字体文件。使用系统优先栈：

```css
--ff-font-display:
  "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC",
  Georgia, serif;

--ff-font-ui:
  Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;

--ff-font-mono:
  "SFMono-Regular", Consolas, "Liberation Mono", ui-monospace, monospace;
```

应用规则：

- 品牌、Workspace 主标题、空态标题：display serif；
- 按钮、表单、正文：UI sans；
- 文件名、帧号、参数值、处理状态技术标签：mono；
- 中文不要强制 uppercase；英文微标签可以 uppercase + tracking；
- essential text 不小于 12px；
- 10px 只能用于冗余的装饰性英文标签，不能承载唯一信息。

建议字号：

| 用途 | 字号 / 行高 |
| --- | --- |
| 页面标题 | 28/36 desktop，24/32 mobile |
| 区块标题 | 18/26 |
| 正文 | 14/22 或 15/24 |
| 表单标签 | 12/18 |
| 按钮 | 13/18 或 14/20 |
| 文件名 | 12/18 mono |
| 微标签 | 10/14，仅冗余信息 |

### 6.4 间距与网格

采用 4px 基础网格：

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

- 组件内部默认 12–16px；
- 卡片间距 desktop 20–24px，mobile 12–16px；
- Inspector section 之间 24px；
- 表单字段之间 16px；
- 不使用不规则、密集的 6px/7px/11px 组合。

### 6.5 边框、圆角和阴影

- 普通按钮圆角 4px；
- 输入、分段控件圆角 4px；
- 卡片圆角 6px；
- Dialog 8px；
- 只有头像式图标按钮、状态点可用圆形；
- 不使用大面积 `rounded-2xl`、`rounded-full`；
- 边框使用 `--ff-line-soft`，Hover/Focus 提升到 `--ff-line-strong`；
- 阴影使用暖黑，尽量短：`0 12px 32px rgba(0,0,0,.28)`；
- 接触印样卡片可以有极轻内描边，不能像浮动 SaaS 卡片。

### 6.6 纹理与胶片图形

允许：

- 页面最外层增加 1.5%–2.5% 不透明度的静态细微噪点；
- 使用 CSS repeating gradients 绘制非常淡的工作台纹理；
- 在空态、长条排序轨和 section divider 中使用片边孔位 motif；
- Header 背景可以有极弱的安全灯径向红光；
- 状态标签使用实验室印章式矩形轮廓。

不允许：

- 纹理覆盖 `<img>`、Canvas 输出或预览；
- 每个组件都加入齿孔；
- 高对比纸张污渍；
- 动态噪点或闪烁。

### 6.7 图标

- 继续使用本地内联 SVG；
- 集中到 `components/icons/FilmFrameIcons.tsx`；
- 统一 `currentColor`、16/18/20px 三档和 1.75–2px stroke；
- 不增加图标库依赖；
- 仅图标按钮必须有 `aria-label` 和 tooltip/title；
- 图标不得代替关键文字。

### 6.8 动效

```css
--ff-motion-fast: 120ms;
--ff-motion-base: 180ms;
--ff-motion-slow: 260ms;
--ff-ease: cubic-bezier(.22, 1, .36, 1);
```

- Button Hover：颜色/边框 120ms，不做大比例缩放；
- Card Hover：边框和阴影 180ms，最多上移 1px；
- Drawer/Dialog：180–260ms；
- Toast：进入 220ms，退出 180ms；
- 处理中可以使用静态脉冲或边缘扫描，不显示假百分比；
- `prefers-reduced-motion: reduce` 下取消位移、缩放与循环动画，仅保留即时状态切换。

---

## 7. 全局 Header 规格

### 7.1 桌面 Header

左侧：

- FilmFrame Logo；
- 品牌名 `FilmFrame`；
- 英文微标签 `LOCAL DIGITAL DARKROOM`。

中部或品牌右侧：当前会话摘要：

```text
ROLL 01  /  4 FRAMES  /  LOCAL ONLY
```

说明：

- `4 FRAMES` 来自 `images.length`；
- 不显示不存在的胶卷持久化概念；`ROLL 01` 只是本次会话的视觉标签，不能让用户误以为会保存历史；
- 在没有图片时显示 `NEW ROLL / LOCAL ONLY`。

右侧：

1. 次级按钮：`添加照片`；
2. 有当前有效结果时显示 `导出成片`；
3. `更多`菜单：重置设置、GitHub、支持作者、隐私说明。

行为：

- `添加照片` 始终可见，处理或导出期间沿用现有可用性；
- `导出成片` 只在 `hasAnyResult` 时显示；
- 导出中显示当前 `exportMessage`；
- 重置设置在 processing/exporting 时禁用；
- 菜单关闭后恢复触发按钮焦点。

### 7.2 手机 Header

- 左：紧凑 Logo + `FilmFrame`；
- 中/下：`4 张 · 本地处理`；
- 右：设置按钮；
- 不在 Header 同时放“添加、导出、更多”三个大按钮；这些动作交给工作区和底部栏。

---

## 8. Workspace Toolbar 规格

Toolbar 从上到下：

1. 页面 eyebrow：`CONTACT SHEET` 或 `FILM STRIP`；
2. 标题：`接触印样` / `连底长条`；
3. 一句状态说明；
4. 模式 Tab；
5. 右侧动作：添加照片；有结果时可显示导出。

文案：

- 单张：`按当前暗房配方逐张冲洗，并在这里完成审片与构图。`
- 长条：`按当前顺序把这一卷合成为连续片基。`

状态摘要示例：

```text
4 张照片 · 2 已出片 · 2 待冲洗
```

不要在 Workspace 重复完整隐私长文；只显示一个小型 `LOCAL ONLY` 标记。空态中再给完整说明。

---

## 9. 空态 EmptyDarkroom

### 9.1 视觉

空态不是一个普通虚线框。使用“未曝光胶片引片 + 接触印样台”构图：

- 中央使用内联 SVG 或 CSS 绘制一段简化片边；
- 上下各有少量齿孔；
- 中间是上传 icon 与文案；
- 背景仍是工作台，不模拟真实木桌；
- Drop active 时 amber 描边和轻微 safelight glow；
- 不使用大圆形加号作为唯一识别。

### 9.2 文案

标题：`把这一卷带进暗房`

正文：`添加 JPG、PNG 或 WebP。照片只在当前浏览器中处理，关闭或刷新页面后不会保留。`

主按钮：`选择照片`

次级说明：`也可以把照片拖到工作区`

底部三步：

```text
01 选片  ·  02 配方  ·  03 冲洗与导出
```

### 9.3 交互与语义

- 上传主体使用真实 `<button>`；
- 隐藏 file input 继续限制 JPEG/PNG/WebP；
- Workspace 全区域保留拖放；
- Drag enter 显示覆盖层：`松开以加入这一卷`；
- 混合文件结果继续使用现有逐项 warning/error；
- 不接受的文件不创建卡片。

---

## 10. Contact Sheet / 单张成片规格

### 10.1 容器

- 使用 `<ol>` 表示有业务顺序的照片集合；
- 每个项目为 `<li><PhotoCard /></li>`；
- Grid：
  - `<640`：1 列；
  - `640–1023`：2 列；
  - `1024–1535`：3 列；
  - `>=1536`：4 列，但要根据 Inspector 后实际可用宽度决定；
- 20 张以上仍使用普通 DOM Grid，本轮不引入虚拟化；
- Grid 中不能因不同方向照片改变卡片高度。

### 10.2 卡片结构

```text
┌──────────────────────────────────┐
│ FRAME 01               [状态印章]│
│                                  │
│           图像预览               │
│                                  │
│ [查看] [下载] [重试] [删除]       │
├──────────────────────────────────┤
│ 01-landscape.jpg                 │
│ 2026/07/12 或 无 EXIF 日期        │
│                       [↑] [↓]    │
└──────────────────────────────────┘
```

视觉规则：

- 图片区固定 3:2 或 4:3 视觉窗口，`object-contain`；
- 使用纯暖黑 matte，不能裁掉原图或生成结果；
- 已完成时显示当前有效 artifact；未处理/待更新显示原图；
- 不给图片加透明度或统一滤镜；
- Frame number 使用 mono + amber；
- 卡片背景 `--ff-panel-raised`，边框 1px；
- Hover 不使用覆盖整个照片的 60% 黑层；
- 操作区使用底部窄条或右下角浮层，但照片在 Hover 时仍清晰可见；
- 触屏始终可见必要操作；桌面也必须通过 Tab 聚焦显示操作。

### 10.3 帧号

卡片显示两个不同概念时必须明确：

- 列表顺序：`01 / 04`；
- 输出帧号：由 `frameNumberForIndex()` 得出的 `FRAME 01`。

若两者相同，可只强调输出帧号并在 metadata 中显示 `1 / 4`。不要自行重新计算帧号逻辑。

### 10.4 状态映射

使用现有 `ImageWorkflowStatusKind`，UI 文案调整如下：

| kind | 主文案 | 英文微标签 | 视觉 |
| --- | --- | --- | --- |
| `unprocessed` | 待冲洗 | WAITING | 中性轮廓 |
| `stale` | 需重洗 | RE-DEVELOP | amber 轮廓，显示现有 detail |
| `queued` | 排队中 | QUEUED | info 轮廓 |
| `processing` | 冲洗中 | DEVELOPING | safelight + spinner/静态脉冲 |
| `complete` | 已出片 | READY | success 轮廓 |
| `failed` | 冲洗失败 | ERROR | danger 轮廓 + detail |

注意：

- `deriveImageWorkflowStatus` 仍是状态真相来源；
- 可以在 UI 层映射文案，但不要复制状态判断；
- `failed` 且保留当前成片时，仍允许下载；
- `stale` 不能下载；
- 状态同时提供文本、图标和 `aria-label`。

### 10.5 卡片操作

- 点击图片或 `查看`：打开该图 Preview；
- `下载`：仅 current artifact；
- `重试`：仅失败状态；
- `删除`：遵循 `imageRemovalAllowed`；
- `上移/下移`：所有视口可用；
- 桌面保留原生拖拽与 grip；
- 拖拽时显示明确插入位置，不靠卡片突然交换；
- 首项上移、末项下移禁用且带可解释 label；
- 删除不增加确认 dialog，沿用当前快速工作流；
- 处理期间不能导致竞态的限制继续由现有业务状态决定。

### 10.6 设置变化后的表现

- 当前成片 stale 后，卡片立即显示 `需重洗`；
- 图片区回到原图或当前既有实现的安全源；
- detail：`参数已调整，重新冲洗后生效`；
- Workspace 摘要更新为 `4 张需重洗`；
- Header/Inspector 的导出入口不能包含 stale 项；
- 不允许旧结果静默伪装成最新结果。

---

## 11. Recipe Inspector / 暗房配方规格

### 11.1 总体结构

桌面右侧 Inspector：

```text
[暗房配方]                      [重置]
[当前配方摘要卡]

胶片与片边
  胶片型号
  真实135 / 经典边框
  起始编号

影像质感
  颗粒
  经典模式的片边定制...

输出
  扫描比例
  快速预览 / 高清导出
  JPG / PNG
  JPG 质量

我的配方
  选择 / 保存 / 删除

[sticky footer summary]
[开始冲洗 · 4 张]
[重新冲洗全部]
```

### 11.2 当前配方摘要卡

显示：

```text
KODAK GOLD 200
REAL 135 · NATIVE · JPG 95
GRAIN 15 · START FRAME 01
```

- 左侧使用当前 `FILM_PRESETS` 的 `brandColor` 作为极窄色条；
- 不使用整卡大面积品牌色；
- 对非 Gold 200 明确写 `CLASSIC REBATE`；
- 辅助文案：`经典模式主要改变片边标记与结构；真实 135 当前仅支持 Gold 200。`

### 11.3 Section 行为

桌面可以使用原生 `<details>` 或自定义 disclosure：

- `胶片与片边` 默认展开；
- `影像质感` 默认展开；
- `输出` 默认展开；
- `我的配方` 默认收起，但有已选配方时展开；
- 收起不卸载表单状态；
- Disclosure button 有 `aria-expanded`；
- 手机 Sheet 使用内部 Tab，不叠加过多 Accordion。

### 11.4 胶片型号

继续使用原生 `<select>`，增加 `optgroup`：

- Kodak Professional Color；
- Kodak Consumer Color；
- Kodak Reversal；
- Black & White；
- Fujifilm / CineStill / Ilford。

要求：

- 选中非 Gold 200 时继续强制 `frameRenderMode='classic'`；
- 在字段下显示当前模式可用性说明；
- 不实现复杂自定义 combobox；
- 显示名称来自 `FilmType`，不复制字符串常量。

### 11.5 真实 135 设置

仅 Gold 200 显示：

- `片边模式`：真实 135 / 经典片边；
- `扫描输出`：4:3 扫描 / 原始底片，仅单张真实 135；
- `处理模式`：快速预览 / 高清出片；
- `颗粒强度`；
- `起始编号`。

文案把 `高清导出` 改为 `高清出片`，内部 value 仍是 `high`。

### 11.6 经典片边设置

在 `frameRenderMode === 'classic'` 时显示：

- 自定义片边文字；
- 起始编号；
- 默认日期；
- 显示 EXIF 日期开关；
- 齿孔形状；
- 边框色、齿孔色、文字色；
- 边框尺寸；
- 颗粒强度。

改进要求：

- 三个颜色字段使用“色块 + hex 值”组合，不只显示浏览器 color input；
- Range 同时显示当前数值；
- `showDate` 使用 switch/checkbox，但保持标准 input；
- 自定义文字 placeholder：`例如 SHOT BY ZENO`；
- 标注这是“片边文字”，不要暗示会写入照片画面。

### 11.7 输出设置

- 输出格式：JPG / PNG；
- JPG 文案：`JPG · 体积较小`；
- PNG 文案：`PNG · 无损`；
- 质量仅在 JPEG 时显示；
- Processing mode 仅在真实 135 时显示；
- 输出格式变化继续使现有结果 stale；
- 不新增 WebP 输出。

### 11.8 配方管理

- 标题：`我的暗房配方`；
- 说明：`只保存参数，不保存照片、构图或成片。`；
- 选择、应用、删除和保存沿用现有 service；
- 最多 12 条、名称 40 字和同名覆盖规则不变；
- 保存成功使用非阻塞 Toast；
- 删除按钮使用 danger ghost，不做大红色块；
- 无配方时显示一句空态，不显示空 select；
- 当前配方有名称时，摘要卡显示名称。

### 11.9 Inspector Sticky Footer

Footer 显示一行摘要：

```text
4 张待冲洗 · JPG · 快速预览
```

主按钮标签沿用现有业务推导：

- 无图：`先添加照片`；
- 单张有 pending：`冲洗待更新照片（4）`；
- 单张全部 current：`全部成片均为最新`，按钮禁用；
- 长条无结果：`生成胶片长条`；
- 长条有 current：`重新生成胶片长条`；
- processing：`停止后续`；
- 已有单张结果时显示次级 `重新冲洗全部`。

主按钮使用 amber，processing 状态使用 neutral/safelight，不使用 amber。

---

## 12. Mobile Settings Sheet

### 12.1 结构

```text
┌──────────────────────────┐
│ 暗房配方        [关闭]   │
│ [胶片] [输出] [配方]     │
├──────────────────────────┤
│ 可滚动字段内容           │
│                          │
├──────────────────────────┤
│ 当前摘要                 │
│ [主操作]                 │
└──────────────────────────┘
```

### 12.2 要求

- 使用现有 dialog 焦点管理能力抽成共享 `ModalSurface`；
- 打开时初始焦点到 Sheet 标题或第一个字段；
- Tab 循环限制在 Sheet；
- Escape 关闭；
- 背景点击可关闭，但 processing 中不能误触导致停止；
- Body 使用 `overscroll-behavior: contain`；
- Footer 不随字段滚走；
- 主操作不能与页面底部栏同时重复出现：Sheet 打开时隐藏或 inert 页面底部栏；
- 安全区 padding 正确；
- 390×844 下没有控件遮挡或横向滚动。

---

## 13. 处理流程与反馈规格

### 13.1 开始冲洗

点击后：

- Header session summary 切换为 `DEVELOPING 1 / 4`；
- Inspector CTA 变为 `停止后续`；
- 当前卡片显示 `冲洗中`；
- 后续待处理卡片显示 `排队中`；
- 已完成和不在本轮的 current 卡片保持可见；
- 不锁死整个页面；允许查看已完成结果；
- 不显示虚假的总百分比或时间估计。

### 13.2 停止后续

- 文案保持 `停止后续`，不要写成“立即取消”；
- 点击后给 Toast：`已停止后续任务，当前正在处理的照片可能仍需片刻结束。`；
- 已成功结果保留；
- 未开始项回到 `待冲洗/需重洗`；
- 晚到旧结果继续按现有 generation 规则回收。

### 13.3 批次完成

Toast/Notice 示例：

- 全成功：`这一卷冲洗完成，共 4 张成片。`；
- 部分失败：`已完成 3 张，1 张冲洗失败。可在卡片上重试。`；
- 停止：`已停止后续任务，完成 2 张，剩余 2 张待冲洗。`。

Notice 采用“实验室便笺”外观：暖深色表面、左侧细色条、图标、关闭按钮。不要使用绿色大面积 banner。

### 13.4 大图与上传 warning

- Warning 不打开阻塞式错误 dialog；
- 使用 amber Notice；
- 文案说明文件已加入，只是可能处理较慢；
- 真正不可解码/不支持的文件才进入错误汇总；
- 错误 dialog 必须列出文件名和可行动建议。

---

## 14. 连底长条 Film Strip Workspace

### 14.1 未生成状态

中央 Stage 使用一段横向片基视觉：

- 中间说明：`按当前顺序合成 4 张照片`；
- 提示：`拖动缩略图或使用上下移动按钮调整叙事顺序。`；
- Inspector Footer CTA：`生成胶片长条`。

### 14.2 Sequence Rail

- Desktop 为横向 rail；
- 每张缩略图带序号、文件名 tooltip、删除、上移/下移；
- Rail 上下使用非常克制的齿孔重复图案；
- 缩略图不使用 60% opacity；Hover 只提升边框；
- Drag 时显示插入 marker；
- Touch 仍靠按钮完成排序；
- 图片数组变化时当前 strip 失效，UI 显示 `需重新生成`。

### 14.3 生成中

- Stage 中显示 `正在拼合胶片长条…` 和 spinner；
- 不显示假百分比；
- 删除行为继续遵守 strip processing 限制；
- CTA 为 `停止后续` 时沿用当前实际能力和文案，不暗示可中断当前大画布操作。

### 14.4 已生成

- 结果放在中性深色 light table 上；
- 图片 `object-contain`，允许横向滚动；
- 工具条：预览、下载、重新生成；
- Header 与移动底栏的主操作切换为下载；
- 设置或顺序变化后，不显示旧结果为 current；显示空的 stale state 和 `配方或顺序已变化，请重新生成。`。

---

## 15. Preview / 审片 Dialog

### 15.1 总体布局

Preview 是全屏“暗房审片台”，而不是普通图片 lightbox：

```text
[FRAME 01 / 文件名 / 1 of 4]               [分享] [下载] [关闭]

                      图像

[上一张]                                      [下一张]

[原图 | 成片] [调整构图] [旋转] [应用并冲洗此张]
```

### 15.2 视觉

- 背景 `--ff-overlay`，加入非常弱的 vignette；
- 图像区域不加纹理；
- 顶部信息使用矩形实验室标签，不用大胶囊；
- 上/下一张按钮靠屏幕边缘，44px 目标；
- 底部控制条使用 `--ff-panel-raised`，圆角 6px；
- 控制条不覆盖图片；
- Toast 在 Preview 内也不能遮挡右上角操作。

### 15.3 行为

- `Escape` 关闭；
- 左右方向键循环导航；
- 关闭后恢复到打开该 Preview 的卡片；
- 原图/成片切换使用当前 `previewSourceMode`；
- 即时 preview 生成时，保留上一张可用图像并显示小型 `正在生成预览`，不要把图像降到难以观看；
- 当前正式 artifact 才显示下载和分享；
- 分享失败不自动触发下载；
- 图片切换后 source mode 重置为 `成片`，保持当前行为；
- 图片可用区域适配竖图与横图，不裁切。

### 15.4 手机 Preview

- 顶部栏紧凑；
- 图像区使用剩余高度；
- 底部控制分成两行或横向 scroll，不允许按钮挤到屏幕外；
- 上/下一张手势本轮非必需，不要自行加入复杂 swipe；
- `调整构图` 是文字按钮，不只显示图标。

---

## 16. Crop Editor / 构图编辑器

### 16.1 保留的业务行为

- 固定片窗；
- 拖动照片；
- 100%–300% 连续缩放；
- 鼠标滚轮保持指针下画面位置；
- 方向键微调，Shift 大步；
- 90 度旋转；
- Reset；
- Cancel 不提交；
- Done 一次性提交 transform；
- expensive render 只在提交后触发；
- 使用共享 `renderTransform` 语义。

### 16.2 新视觉

- 外部 matte 使用深暖黑；
- 片窗边界使用 paper white 1px；
- 片窗外可以有 55%–70% 暗遮罩，但不改变片窗内图片；
- 三分线细、低对比，Focus 时稍增强；
- 左上显示 `FRAME 01 · CROP`；
- 右上显示 `100%` mono；
- 控制条与 Preview 同一设计语言；
- 缩放 slider 是主要控件，旋转/复位为 icon + accessible label；
- `完成`用 amber；`取消`为 ghost；
- 不添加裁切比例、网格类型、对齐辅助等新功能。

### 16.3 响应式

- Desktop：片窗最大宽度 1180px，控制条最大宽度 900px；
- Mobile：片窗尽量占据中间空间，控制条固定在正常流底部，不能覆盖片窗；
- 使用 `100dvh` 和安全区；
- 横屏手机也必须可访问全部按钮；
- 390×844 无横向溢出。

---

## 17. 导出与下载体验

### 17.1 Header 与主操作

- 单张 current artifact 存在时，Header 显示 `导出成片`；
- 手机在全部 current 时，底栏主操作为 `下载成片`；
- 单张多图调用现有 ZIP；
- 长条调用当前长图下载；
- 不改变文件名、MIME 和 ZIP 顺序。

### 17.2 导出中

- 按钮 disabled；
- 显示真实 `exportMessage`，例如 `正在打包 2/4`；
- 禁止重复触发；
- 其他危险操作按现有 gate 禁用；
- 完成后 Toast：`成片已准备好。`；
- 浏览器阻止下载时进入可行动错误提示。

### 17.3 单图下载

- 卡片下载只在 current artifact 时显示；
- Preview 下载同样只使用 current artifact；
- stale 或未处理状态不提供下载伪入口。

---

## 18. Feedback、Error、Support Dialog

### 18.1 Toast / Notice

支持 `info / success / warning / error` 四种 tone：

- Desktop 右上，Header 下方 16px；
- Mobile 顶部居中，避开安全区和 Header；
- 最大宽度 420px；
- 4 秒自动离开，允许手动关闭；
- `aria-live="polite"`；严重错误 dialog 使用 `assertive` 或聚焦标题；
- reduced motion 下无位移动画。

### 18.2 Error Dialog

- 标题不要固定为泛化“出错了”；按场景使用 `需要处理`；
- 支持多行文件级错误；
- 主按钮 `我知道了`；
- 若上下文有重试/移除，应在卡片上提供实际动作；
- Dialog 用暗色，与全局主题一致；
- 不使用白底营销弹窗。

### 18.3 Support / 捐赠

- 移入 Header 更多菜单；
- 文案从粉色“奶茶按钮”改为克制的 `支持 FilmFrame`；
- Dialog 保留感谢文案，但匹配暗房视觉；
- QR 图片必须实现 `onError` fallback：
  - 显示 `二维码暂不可用，请在资源替换后重试。`；
  - 不显示 broken image icon；
  - 不伪造二维码；
- 在正确资产由项目所有者提供前，允许隐藏扫码 CTA；
- GitHub 链接保留为次级入口。

---

## 19. 文案系统

### 19.1 主术语

| 当前/内部 | 新界面主文案 |
| --- | --- |
| 工作室 | 接触印样 / 暗房工作台，根据区域使用 |
| 单张卡片 | 单张成片 |
| 连底长条 | 连底长条 |
| 胶片配置 | 暗房配方 |
| 边框模式 | 片边模式 |
| 真实135 | 真实 135 |
| 经典边框 | 经典片边 |
| 快速预览 | 快速预览 |
| 高清导出 | 高清出片 |
| 未处理 | 待冲洗 |
| 待更新 | 需重洗 |
| 已完成 | 已出片 |
| 失败 | 冲洗失败 |
| 调整构图 | 调整构图 |
| 应用并冲洗此张 | 应用并冲洗此张 |
| 我的配方 | 我的暗房配方 |

内部 enum、service 返回值和测试可保持原文案；UI 可以通过映射展示新文案。

### 19.2 语气

- 清楚、克制、专业；
- 可以使用“这一卷、冲洗、出片、审片”，但不要每句都强行暗房化；
- 错误必须说明发生了什么和下一步；
- 隐私文案要直接：`照片只在当前设备处理，不会上传。`；
- 不使用夸张口号、感叹号堆叠或 emoji。

---

## 20. 组件架构与文件规划

### 20.1 重构策略

不要一次把业务逻辑全部改成新 reducer。先保持 `App.tsx` 作为 controller，再抽离纯展示和局部交互组件。每完成一层都运行测试。

最终目标：

- `App.tsx` 主要负责状态、derived view model、业务 callbacks 和组件编排；
- 业务服务继续位于 `services/`；
- UI 组件按 feature 组织；
- 单个组件建议不超过 250 行；
- `App.tsx` 最终建议不超过 500–650 行；
- 不通过 Context 隐藏关键业务数据流；优先显式 typed props。

### 20.2 建议文件树

```text
components/
  app/
    AppShell.tsx
    AppHeader.tsx
    MoreMenu.tsx
    SessionMeter.tsx
  ui/
    Button.tsx
    IconButton.tsx
    SegmentedControl.tsx
    Field.tsx
    RangeField.tsx
    StatusStamp.tsx
    Disclosure.tsx
    ModalSurface.tsx
    Sheet.tsx
  icons/
    FilmFrameIcons.tsx
  workspace/
    Workspace.tsx
    WorkspaceToolbar.tsx
    EmptyDarkroom.tsx
    ContactSheet.tsx
    PhotoCard.tsx
    PhotoCardActions.tsx
    FilmStripWorkspace.tsx
    FilmSequenceRail.tsx
  settings/
    RecipeInspector.tsx
    RecipeSummaryCard.tsx
    FilmSettingsSection.tsx
    LookSettingsSection.tsx
    ClassicRebateSettings.tsx
    OutputSettingsSection.tsx
    RecipeManager.tsx
    MobileSettingsSheet.tsx
  preview/
    PreviewDialog.tsx
    PreviewHeader.tsx
    PreviewControls.tsx
    CropEditor.tsx
  feedback/
    NoticeToast.tsx
    ErrorDialog.tsx
    SupportDialog.tsx
  mobile/
    MobileActionBar.tsx

styles/
  tokens.css
  base.css
  components.css

App.tsx
styles.css
```

可以保留现有 `components/CropEditor.tsx` 路径并逐步迁移，避免大批 import 一次性变化。

### 20.3 关键 Props 参考

```ts
interface PhotoCardProps {
  item: ImageItem;
  index: number;
  total: number;
  frameNumber: number;
  status: ImageWorkflowStatus;
  artifact: RenderArtifact | null;
  active: boolean;
  removalAllowed: boolean;
  onOpen: (id: string) => void;
  onRetry: (id: string) => void;
  onDownload: (artifact: RenderArtifact, filename: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  dragProps: React.HTMLAttributes<HTMLElement>;
}
```

```ts
interface RecipeInspectorProps {
  settings: FilmSettings;
  outputMode: OutputMode;
  imageCount: number;
  pendingCount: number;
  processedCount: number;
  processing: boolean;
  exporting: boolean;
  processButtonLabel: string;
  recipes: Recipe[];
  onSettingsChange: (next: FilmSettings) => void;
  onProcess: (force?: boolean) => void;
  onStop: () => void;
  onReset: () => void;
  // recipe callbacks...
}
```

不要把整个 `App` state 作为一个无类型 `any` 对象传递。

### 20.4 状态真相来源

- 图片状态：`deriveImageWorkflowStatus`；
- 需要处理的图片：`selectImagesForProcessing`；
- 主操作：`getPrimaryAction`；
- 当前 artifact：`getCurrentImageArtifact` / render key；
- 长条 current：ordered strip key；
- 预览导航：`previewNavigation`；
- 下载：`previewDownload` / existing download helpers。

UI 组件只展示这些结果，不复制业务判断。

---

## 21. CSS 与 Tailwind 4 实施规范

### 21.1 Source 扫描

当前 `styles.css` 只扫描少数文件。拆分组件后必须至少包含：

```css
@source "./index.html";
@source "./index.tsx";
@source "./App.tsx";
@source "./components/**/*.tsx";
@source "./components/**/*.ts";
```

如增加 `hooks/` 或 `features/`，同步加入。

### 21.2 Token 与 utility

- Token 放 CSS，不在每个组件重复 hex；
- 可以使用 Tailwind utility 进行布局；
- 颜色和高复用外观用语义 class，例如 `.ff-panel`、`.ff-lab-label`、`.ff-focus-ring`；
- 不构造 Tailwind 无法静态识别的动态字符串，如 `bg-${tone}-500`；
- tone、status、variant 使用显式 map 或 `data-*` 属性；
- 控件状态用 `focus-visible`，不要用全局 `outline: none`；
- 保留 `prefers-reduced-motion`；
- 滚动条使用暖灰，不要抢眼。

### 21.3 全局背景

建议：

```css
body {
  margin: 0;
  min-width: 320px;
  min-height: 100dvh;
  background:
    radial-gradient(circle at 88% 6%, rgba(140,49,43,.08), transparent 28rem),
    var(--ff-bg-deep);
  color: var(--ff-paper);
  font-family: var(--ff-font-ui);
}
```

噪点使用单独 pseudo layer，`pointer-events:none`，不得覆盖在照片上方。

### 21.4 表单

- input/select 背景 `--ff-panel-soft`；
- 文本至少 13px；
- 高度至少 40px，触控上下文 44px；
- Focus ring 明确；
- Disabled 不仅降低 opacity，也要改变 cursor 并保持可读；
- Range thumb 视觉清晰但不过大；
- Native select 的 option 背景兼容深色。

---

## 22. 可访问性要求

1. 目标为 WCAG AA 级对比度；正文至少 4.5:1，大字号至少 3:1。
2. 所有交互目标移动端至少 44×44px。
3. 上传使用 button/label 语义，可通过 Enter/Space 操作。
4. 模式切换、分段控件有 `aria-pressed` 或正确 radio/tab 语义。
5. 所有 icon-only 控件有 `aria-label`。
6. 状态不只靠颜色；包含文本和可选图标。
7. Dialog/Drawer/Sheet：初始焦点、Tab 闭环、Escape、焦点恢复。
8. Preview 保留左右方向键与 Escape。
9. Crop viewport 保留键盘平移和 range；说明写入 `aria-label`。
10. Drag reorder 有上移/下移等价操作。
11. 处理和导出摘要使用 `aria-live="polite"`，不在每一帧刷屏。
12. 错误 dialog 标题与描述通过 `aria-labelledby/aria-describedby` 关联。
13. `prefers-reduced-motion` 下界面仍可理解。
14. 200% 浏览器缩放时不丢失功能、不产生双向滚动。
15. Essential text 不使用 10px。
16. 装饰性齿孔、噪点和英文微标签标记 `aria-hidden`。

---

## 23. 性能、隐私与资产要求

### 23.1 性能

- UI 重构不得使图片重新解码或产生额外 Object URL；
- 卡片组件使用稳定 `key={img.id}`；
- 不在 render 中读取大 Blob；
- 不对图片应用 blur/filter 动画；
- 不为每张卡片创建高成本 backdrop-filter；
- 20 张 4K 图片时滚动仍应流畅；
- Inspector 设置变化可以触发现有 preview debounce，但不能新增无 debounce 的渲染调用；
- 不引入超过必要范围的大型 UI 库或动画库。

### 23.2 隐私

- 不新增遥测、分析、错误上报或远程字体；
- 不新增任何图片网络上传；
- Worker 继续只读取同源静态资源；
- Header 或空态明确说明 local-only；
- 不把用户文件名发送到外部链接。

### 23.3 资产

- Logo、空态和装饰使用内联 SVG 或本地小型资源；
- 不把现有胶片 overlay 当成 UI 背景；
- 删除或避免发布 `.DS_Store`；
- 捐赠二维码由项目所有者提供有效文件；在此之前实现 fallback；
- 不提交未经授权的摄影作品作为 demo；测试使用合成小图。

---

## 24. 测试计划

### 24.1 现有门禁

每个阶段至少运行：

```bash
npm run test
npm run typecheck
npm run build
```

最终运行：

```bash
npm run check
```

不得删除、跳过或弱化现有 16 个 Vitest 文件与断言。

### 24.2 新增浏览器测试

建议增加 `@playwright/test` dev dependency，并添加：

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

关键 E2E：

1. Desktop 1440×1000 空态可见 Header、local-only、上传主按钮和 Inspector；
2. Mobile 390×844 空态首屏可见品牌、上传和底部主操作；
3. 上传 JPG/PNG/WebP 后出现正确数量卡片；
4. 上移/下移改变列表顺序和 Frame 标识；
5. 桌面拖拽排序仍工作；
6. 修改设置后 current 结果显示 `需重洗` 且下载入口消失；
7. Classic 模式处理 2 张合成 fixture，状态到 `已出片`；
8. Preview Before/After、左右导航、Escape；
9. Crop Editor 打开、缩放、旋转、取消、完成；
10. Mobile Settings Sheet 焦点管理、Escape、背景锁滚动；
11. 长条模式顺序轨、生成态和 stale 态；
12. 部分失败显示重试；
13. ZIP 导出期间重复点击被阻止；
14. Support QR 失败时显示 fallback，无 broken image；
15. reduced motion 下无循环位移动画。

### 24.3 测试图片

提交到 `tests/fixtures/` 的合成图片：

- `landscape.jpg`；
- `portrait.png`；
- `square.webp`；
- 每张尽量小于 20KB；
- 不包含第三方摄影版权素材。

### 24.4 视觉验收尺寸

至少人工或 screenshot 检查：

- 360×800；
- 390×844；
- 768×1024；
- 1024×768；
- 1440×1000；
- 1536×864；
- 2560×1440。

场景：

- 空态；
- 1 张、4 张、20 张；
- 横图、竖图、方图混合；
- 未处理、需重洗、等待、处理中、完成、失败混合；
- 12 个配方；
- 超长中英文文件名；
- Preview；
- Crop；
- Mobile Sheet；
- Strip generated/stale；
- 200% zoom。

---

## 25. 分阶段实施计划

### Phase 0：保护基线

- [ ] 运行 `git status --short`，不得重置或丢弃当前未提交改动；
- [ ] 读 `handoff.md` 与 `docs/project/*`；
- [ ] 运行现有测试、typecheck、build，记录基线；
- [ ] 保存当前桌面/移动空态、上传态、Preview、Crop 截图；
- [ ] 确认本轮不修改渲染输出像素。

完成标准：现有功能清单与状态契约被记录，基线测试结果可复现。

### Phase 1：设计 token 与 UI primitives

- [ ] 新建 token/base/component 样式文件；
- [ ] 更新 Tailwind `@source`；
- [ ] 实现 Button、IconButton、SegmentedControl、Field、RangeField、StatusStamp；
- [ ] 集中图标；
- [ ] 重构 NoticeToast 使用新视觉；
- [ ] 保留 reduced motion。

完成标准：primitives 有一致 focus/disabled/hover，App 尚未大改也能编译。

### Phase 2：App Shell 与 Header

- [ ] 实现 AppShell；
- [ ] 实现桌面/手机 Header；
- [ ] 把 GitHub、支持、重置移入更多菜单；
- [ ] 添加 session meter；
- [ ] 保留上传、导出和 reset callback。

完成标准：空态在 1440 与 390 都符合目标层级，不改变上传行为。

### Phase 3：Recipe Inspector 与 Mobile Sheet

- [ ] 抽离所有设置 section；
- [ ] 实现 current recipe summary；
- [ ] 桌面右侧 sticky Inspector；
- [ ] 平板 Drawer；
- [ ] 手机 bottom Sheet + 内部三 Tab；
- [ ] 实现 sticky CTA；
- [ ] 保留所有 settings、recipe 和 reset 行为。

完成标准：所有现有参数仍可修改和持久化；390×844 不再出现长页面尾部设置区。

### Phase 4：Workspace、空态与 Contact Sheet

- [ ] 输出模式移到 Workspace Tab；
- [ ] 实现 EmptyDarkroom；
- [ ] 实现 ContactSheet 与 PhotoCard；
- [ ] 保留 drag、上移/下移、删除、查看、重试、下载；
- [ ] 映射新状态文案；
- [ ] 实现 Workspace summary。

完成标准：单张模式完整可用，Hover/Touch/Keyboard 都能完成关键操作。

### Phase 5：Film Strip Workspace

- [ ] 实现 strip stage；
- [ ] 实现 sequence rail 与排序；
- [ ] 生成中、已生成、stale、空状态；
- [ ] Header/底栏下载行为同步。

完成标准：顺序、删除、生成、预览、下载与旧契约一致。

### Phase 6：Preview 与 Crop

- [ ] 抽离 PreviewDialog；
- [ ] 重做 header、image stage、controls；
- [ ] 保留键盘导航与焦点恢复；
- [ ] 重做 CropEditor 视觉和响应式；
- [ ] 保留 transform 逻辑零改动或最小改动。

完成标准：横/竖/方图在桌面与手机都无控件遮挡，Before/After 与 crop contract 通过。

### Phase 7：Feedback、Support 与细节

- [ ] 新 ErrorDialog；
- [ ] SupportDialog 与 QR fallback；
- [ ] drag-active overlay；
- [ ] processing / exporting 状态细节；
- [ ] 长文件名、空配方、满配方和失败场景；
- [ ] 清理硬编码旧颜色和冗余 CSS；
- [ ] 清理 public `.DS_Store`，但不擅自删除可能授权不明的胶片素材。

完成标准：所有状态都有完整 UI，不存在破图或默认浏览器错误外观。

### Phase 8：测试、文档与收尾

- [ ] 新增 Playwright 关键流程；
- [ ] 运行 `npm run check`；
- [ ] 运行 `npm run test:e2e`；
- [ ] 更新 README 界面描述；
- [ ] 更新 `docs/project/product-workflows.md` 与 `file-map.md`；
- [ ] 更新 handoff/current-worktree；
- [ ] 保存最终响应式截图。

完成标准：所有 Definition of Done 条目满足。

---

## 26. Definition of Done

### 26.1 视觉与体验

- [ ] 第一眼能感知“数字暗房 / 接触印样”，而不是通用后台；
- [ ] 复古感来自胶片语义、排版和材料，不是脏旧滤镜；
- [ ] 用户照片在所有状态都保持真实色彩与清晰度；
- [ ] 桌面以图像工作区为中心，设置在右；
- [ ] 移动端设置通过 Sheet，不再形成超长页面尾部；
- [ ] 空态、上传、处理中、完成、失败、stale、导出、Preview、Crop 和 Strip 都有设计完成态；
- [ ] Header、Inspector、底栏没有重复竞争的主 CTA；
- [ ] 390×844 与 1440×1000 均无横向溢出或遮挡；
- [ ] 200% zoom 仍可完成主流程。

### 26.2 功能

- [ ] 支持 JPEG/PNG/WebP 上传与拖放；
- [ ] 支持排序、删除、重试；
- [ ] 单张和长条模式行为不变；
- [ ] 真实 135 与经典片边条件显示正确；
- [ ] 所有 FilmSettings 字段行为不变；
- [ ] 设置变化正确触发 stale；
- [ ] 批量处理、停止后续、部分失败、重新冲洗正确；
- [ ] Preview、即时预览、Before/After、分享、下载正确；
- [ ] Crop 的 pan/zoom/rotate/reset/cancel/commit 正确；
- [ ] 配方保存/应用/删除/上限/持久化正确；
- [ ] ZIP 和长条下载正确；
- [ ] 捐赠 QR 失败时有 fallback。

### 26.3 工程

- [ ] `App.tsx` 不再包含整页 1900+ 行 JSX；
- [ ] UI 按 feature 组件化，props 有明确类型；
- [ ] 设计 token 取代绝大多数硬编码 hex；
- [ ] Tailwind 能扫描所有新组件；
- [ ] 不增加运行时网络依赖；
- [ ] 不新增全局状态库或大型 UI 库；
- [ ] 不改变渲染引擎的视觉输出；
- [ ] Object URL、generation、stale 和 worker fallback 契约未退化；
- [ ] 所有旧测试通过；
- [ ] 新 E2E 通过；
- [ ] TypeScript 与 production build 通过。

---

## 27. Codex 执行规则

Codex 必须按以下顺序工作：

1. 先读取 `handoff.md`、项目文档、`App.tsx`、`CropEditor.tsx` 和 workflow/render result 相关 service；
2. 先运行基线检查，不得根据 README 猜测真实行为；
3. 不得执行 `git reset --hard`、`git clean -fd` 或覆盖当前未提交工作；
4. 每个 Phase 独立完成并运行测试，不做一次性大爆炸重写；
5. 业务判断继续由 service 提供，展示组件不得复制 render key、stale、队列或帧号算法；
6. 不为追求视觉而修改 Canvas 输出、图片尺寸、质量、颗粒算法或模板；
7. 不增加远程字体、远程图片、遥测或图片上传；
8. 不自行生成支付二维码；
9. 任何新依赖都必须说明必要性，默认不增加；Playwright 是允许的 dev dependency；
10. 所有异步 callback、Object URL 与卸载清理必须在拆组件后继续工作；
11. 新组件必须兼容 StrictMode；
12. 每次调整 Tailwind 文件路径都确认 production build 中样式未被 purge；
13. 完成后给出：文件变更清单、测试结果、未解决事项、桌面与移动截图路径。

---

## 28. 可延后到后续版本的方向

以下想法与新视觉兼容，但不属于本轮：

- 会话恢复或 IndexedDB；
- 胶卷 24/36 张 UI 控制；
- HEIC 转码；
- 确定性纹理 seed；
- 更多真实 135 模板；
- 自定义裁切比例；
- 历史导出记录；
- PWA；
- 多语言；
- 快捷键面板；
- 色彩模拟参数与真实胶片 profile。

不要把这些功能混入本次重构，以免视觉重构演变为产品重写。

---

## 29. 最终体验验收叙事

一个第一次使用 FilmFrame 的摄影师，在手机或桌面打开页面后，应当在数秒内理解：这里是一间本地数字暗房，照片不会上传。他点击“选择照片”，几张图片像一卷接触印样一样排列，并带有清楚的帧号与状态。右侧或底部 Sheet 中的“暗房配方”只突出常用参数，更深的片边定制按模式出现。点击“开始冲洗”后，他能看到哪一张正在处理、哪些正在等待；完成后可以直接审片、对比原图和成片、调整构图并单独重洗。最后，他从稳定的主操作导出 ZIP 或连底长条。

整个过程中，界面有胶片的文化和暗房的质感，但照片始终是主角；所有状态真实、所有操作可恢复、所有文件留在本地。
