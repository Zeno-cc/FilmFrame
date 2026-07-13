# 产品与用户流程

> 最后核验：2026-07-13。主要证据：`App.tsx`、`types.ts`、`services/workflowState.ts`、`services/renderTransform.ts`、上传/预览/配方/分享服务。

## 产品边界

FilmFrame 是一个浏览器内数字暗房，不是图库或云服务。它处理本次页面会话中的本地文件，生成胶片风格图像；刷新页面后图片和结果消失，仅设置偏好保留。

明确不包含：用户系统、云同步、服务端上传、数据库、相册管理、历史任务、协作、支付接口、遥测、路由页面。

## 页面结构

应用只有一个 `App` 根组件和一个页面：

```text
Desktop (>=1180px): Header + Workspace | sticky Recipe Inspector
Tablet (768-1179px): Header + Workspace + right-side Settings Drawer
Mobile (<768px): compact Header + Workspace + fixed action bar + bottom Settings Sheet

Header
  品牌、当前胶卷摘要、添加照片、当前可用时的导出、更多操作

Workspace
  接触印象 / 连底长条 Tab
  标题、说明、添加/导出动作
  空暗房、照片接触印样或长条审片台

Recipe Inspector / Settings Sheet
  胶片与片边、输出、配方
  固定主冲洗动作

覆盖层
  全屏审片与构图、错误、支持二维码 fallback、操作提示
```

无导航路由、面包屑、全局菜单或命令面板。

## 默认状态

| 设置 | 默认值 |
| --- | --- |
| 胶片 | Kodak Gold 200 |
| 输出模式 | 单张 |
| 边框模式 | 真实 135 |
| 起始帧号 | 1 |
| 扫描输出 | 原始底片 `native` |
| 处理模式 | 快速预览 |
| 输出 | JPEG，质量 0.95 |
| 颗粒 | 15 |
| 最大卷帧数 | 36 |
| 模板 | 启用 |

首次渲染前，`loadPreferences()` 会尝试从 `filmFrame.preferences.v1` 合并合法偏好。图片、预览状态、错误和结果不恢复。

Header 的“更多操作”内“恢复默认设置”会恢复默认 FilmSettings 并切回单张模式，同时清除当前配方选中状态；照片、已保存的本地配方和会话文件不会被删除。冲洗或导出期间重置不可用。

## 核心用户旅程

### 1. 添加照片

入口：工作室顶部“添加图片”、空态点击、把文件拖入整个主工作区。

处理规则：

1. 文件 MIME 必须是 JPEG、PNG 或 WebP。
2. 立即为接受的文件创建预览 Object URL。
3. 用浏览器 `Image` 尝试读取尺寸。
4. 大于 25 MiB 或任一边超过 8000 px 时显示警告，但仍加入。
5. 用 `exif-js` 读取 `DateTimeOriginal`，最长等待 1 秒。
6. EXIF 日期转为 `YYYY/MM/DD`。
7. 尺寸解码失败会拒绝并回收 URL；EXIF 失败只影响日期。

大图 warning 非阻塞；拒绝原因进入可行动错误 dialog。SVG、GIF、HEIC、空 MIME 和损坏图片不会加入列表。

### 2. 排序与删除

图片列表顺序决定：

- 单张处理顺序；
- 帧号递增顺序；
- 长条中的视觉顺序；
- ZIP 文件前缀序号。

新导入照片默认入选。卡片和长条序列可逐张取消/恢复入选，工具栏支持全部入选和清空；单张冲洗、长条与 ZIP 只使用入选子集，但未入选照片仍可预览、排序、裁切和单独下载已有成片。

桌面保留原生拖拽；所有视口都提供上移/下移按钮，首尾边界禁用。卡片查看、重试、下载和删除在触屏下常驻可用。

### 3. 选择胶片与边框

`types.ts` 定义 16 种 `FilmType`。模板注册表中的 Kodak Gold 200 与 Kodak Portra 160 显示“真实135/经典边框”选择；切换到未注册胶片时 effect 会强制 `frameRenderMode='classic'`，并按预设覆盖 `textColor` 与孔型。

真实 135 模式隐藏：自定义文字、日期开关、孔型、颜色和边框尺寸。模板化真实单张主要响应帧号、颗粒、质量、格式、处理模式和扫描输出。

经典模式显示更多可配置项：

- 自定义文字；
- 起始帧号与日期；
- 边框、孔和文字颜色；
- 孔型；
- 边框尺寸；
- 颗粒、格式和质量。

### 4. 处理单张

`processAll()` 默认只选择未处理、待更新和失败项，并按原列表索引计算帧号；用户可显式重新冲洗全部。处理可“停止后续”，generation 变化后不再启动下一张且晚到结果被回收。第 `i` 张使用：

```text
((起始帧号 + i - 1) % maxRollFrames) + 1
```

单图成功后同时写入 `processedUrl`、`processedMime` 和 `processedSettingsKey`；失败后写入 `processingError`，其他图片继续。批次结果按图片 ID 合并到最新列表，不会整体覆盖处理中发生的新增、删除或排序。已有旧结果在新结果成功替换后回收。

### 5. 生成长条

长条把入选图片按当前整卷顺序送入渲染器，并保留其原卷帧号。真实 135 每行最多 4 帧；主线程经典长条每行最多 6 帧。选片、设置或顺序变化会让旧长条变 stale，但不会提前释放旧结果。

长条保存 MIME、Blob 字节数和“设置 + 有序图片 ID + 原卷位置”签名。切换设置、选片、增删或重排后旧结果会变 stale，不再作为 current 下载；晚到旧结果会直接回收。

### 6. 预览

单张卡片打开编辑预览，提供原图/成片切换、`调整构图`、顺时针 90 度旋转和“应用并冲洗此张”。裁切器使用固定片窗与本地草稿：拖动照片调整连续位置，滑杆或鼠标滚轮在 100%-300% 缩放；滚轮缩放保持指针下的画面位置。支持旋转、重置、取消和完成，只有完成才提交 transform。设置或 transform 变化后，300ms debounce 生成临时 preview 成片；临时 URL 与正式结果分离。只有 current 正式成片提供下载或系统分享。

### 7. 配方与分享

本地配方只保存合法 FilmSettings，名称最长 40 字、最多 12 条、同名覆盖并前移。Web Share 只发送当前正式成片文件；不支持或失败时保留下载动作，不自动触发外部 fallback。

### 8. 下载

- 卡片单图：仅下载与当前设置签名匹配的成片。
- 预览下载：仅当前有效成片提供入口。
- 单张批量：仅收集 current 成片，扩展名来自各自 MIME，按当前列表顺序打 ZIP。
- 长条：下载合成长图。

安全文件名规则：移除最后一个扩展名，只保留 ASCII 字母数字、`_`、`-` 和基本中文范围，其他字符替换为 `_`。

ZIP 文件项：`01_清洗后的原名.jpg`。ZIP 本身：`filmframe_YYYYMMDD_HHMMSS.zip`。

## 状态与反馈

| 状态 | 当前表现 |
| --- | --- |
| 空态 | 工作室优先的语义化上传按钮与本地隐私承诺 |
| 上传拖入 | 主区与虚线框琥珀色提示 |
| 单张处理 | 卡片显示等待中/冲洗中/已完成/待更新/失败；批次显示 `i/n` |
| 长条处理 | 结果区域显示 spinner |
| 部分失败 | 保留成功项，失败卡片可重试 |
| 全局失败 | “需要处理”dialog，逐项说明并保留重试/移除路径 |
| 大图 | 非阻塞 warning，文件仍已加入 |
| 无结果 | 下载按钮隐藏；主处理按钮随图片数量变化 |
| 操作反馈 | 右上角悬浮 Toast，渐入后保持展示，4 秒内渐出关闭，也可手动关闭 |

支持停止后续但不承诺中断当前 Canvas；没有暂停、后台队列或虚假时间估算。ZIP 有独立 `x/n` 打包状态和重复触发 gate。

## 快捷键与可访问性

预览支持 `Escape`、`ArrowLeft`、`ArrowRight`；裁切打开时 Escape 先取消裁切，裁切片窗支持方向键微调与 Shift 大步微调，缩放使用原生 range。上传是 button；排序有键盘/触屏按钮；icon-only 控件有名称；dialog 支持初始焦点、Tab 闭环、Escape 和焦点恢复；状态 notice 使用 `aria-live=polite`。样式尊重 `prefers-reduced-motion`。

## 本地化与视觉资源

HTML 为 `zh-CN`，中文硬编码为主，混合英文品牌和术语。没有 i18n 框架。

界面使用深黑/灰工作台与琥珀强调色。视觉 token 位于 `styles/tokens.css`，全局基础样式和组件样式分别位于 `styles/base.css`、`styles/components.css`，并由 `styles.css` 引入。展示层拆分到 `components/app`、`components/workspace`、`components/settings`、`components/preview`、`components/feedback` 和 `components/mobile`；`App.tsx` 保留状态和工作流编排。图标集中在 `components/icons/FilmFrameIcons.tsx`，未引入图标库。

## 当前行为契约表

| 能力 | classic single | classic strip | real135 single | real135 strip |
| --- | --- | --- | --- | --- |
| 支持胶片 | 全部预设 | 全部预设 | UI 为 Gold 200、Portra 160 | UI 为 Gold 200、Portra 160 |
| 自定义文字 | 是 | 是 | 模板路径否 | 否 |
| EXIF 日期 | `showDate` 时 | `showDate` 时 | 否 | 否 |
| 起始帧号 | 是，App 先循环 | 主线程直接递增 | 是，规范化 | 是，规范化 |
| 原图尺寸输出 | 基本是 | 否，固定布局 | 否，1200/1800-3600 | 否，900/1400 |
| 竖图处理 | 竖向边框 | 旋入帧 | 旋入后单张旋回 | 旋入横向帧 |
| Worker | 否，暂固定主线程 | 否，暂固定主线程 | 仅 Gold 模板；Portra 主线程 | 仅 Gold 模板；Portra 主线程 |
