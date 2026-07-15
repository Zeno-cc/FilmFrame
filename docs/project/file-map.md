# 文件与模块地图

> 最后核验：2026-07-14。排除 `.git/`、`node_modules/`、`dist/` 和被忽略的手工浏览器产物。

## 根目录

| 文件 | 职责 | 维护注意 |
| --- | --- | --- |
| `App.tsx` | 根 controller；状态、上传、处理、重试、预览、下载、URL 生命周期与 feature 组件编排 | 展示层已拆分，仍需保留 service 业务契约 |
| `types.ts` | 领域类型、16 种 FilmType、预设 | 新设置必须同步 storage 和两套引擎 |
| `index.tsx` | React 挂载 | StrictMode 开启 |
| `index.html` | 页面壳、favicon、process polyfill | 无 CSP/meta description |
| `styles.css` | Tailwind v4 source、token/base/component 样式入口 | 扫描根组件与 `components/` |
| `package.json` | 脚本、依赖、Node >=20 | Vitest、typecheck、build 和聚合 check |
| `package-lock.json` | npm lockfile v3 | 已加入 Vitest 2.1.9，当前直接依赖树干净 |
| `vite.config.ts` | React/Vitest 配置 | 排除 Playwright E2E 文件，避免被 Vitest 发现 |
| `playwright.config.ts` | Chromium E2E web server 与输出配置 | 使用已安装的系统 Chrome channel |
| `tsconfig.json` | strict TS、ES2020、bundler resolution | unused 检查关闭 |
| `postcss.config.cjs` | Tailwind v4 PostCSS + autoprefixer | 当前实际 CSS 管线 |
| `tailwind.config.cjs` | 旧式 content/font 配置 | v4 主要通过 CSS `@source` 扫描，需确认此文件是否仍生效 |
| `metadata.json` | 应用名、描述、空权限 | 非运行时核心 |
| `netlify.toml` | 空文件 | 不构成部署配置 |
| `README.md` | 用户介绍和快速开发说明 | clone URL、素材、许可等有过期内容 |
| `.gitignore` | 忽略依赖、dist、日志、Playwright、DS_Store | `public/.DS_Store` 仍会被构建复制 |
| `handoff.md` | 项目接手入口 | 发布前更新快照 |

## `components/`

| 目录/文件 | 职责 | 维护注意 |
| --- | --- | --- |
| `CropEditor.tsx` | 自由裁切本地草稿、直接拖动、缩放、旋转、复位与提交 | 只在完成时提交；预览几何必须继续复用 renderTransform 语义 |
| `app/` | AppShell、Header、SessionMeter、MoreMenu | Header 只派发既有 callback，不复制业务判断 |
| `workspace/` | 空态、Toolbar、接触印样、卡片、长条审片台、序列 Rail | 图片排序/状态来自 App 与 workflow service |
| `settings/` | Recipe Inspector、桌面栏与移动/平板设置面板 | 所有字段仍通过 App 的 FilmSettings 更新 |
| `preview/` | Preview Dialog、Before/After、导航与构图入口 | 正式 artifact 与临时 preview URL 必须分离 |
| `feedback/` | Toast、错误和支持 Dialog | QR 加载失败必须保留 fallback，不伪造二维码 |
| `mobile/` | 固定底部主操作栏 | Sheet 打开时必须隐藏，避免双 CTA |
| `ui/` | Button、Field、Sheet、Modal 等通用 primitive | 维持 focus-visible 与 reduced-motion 行为 |
| `icons/` | FilmFrame 本地 SVG 图标 | 保持 `currentColor`、明确的 aria label |

## `services/`

| 文件 | 公开入口 | 职责 |
| --- | --- | --- |
| `filmWorkerClient.ts` | `processImage`, `generateFilmStrip` | Worker 能力/策略判断、请求 Map、失败回退 |
| `filmWorker.ts` | Worker `self.onmessage` | OffscreenCanvas 两模式两输出的渲染 |
| `filmEngine.ts` | `processImage`, `processImageReal135`, `generateFilmStrip` | 主线程完整渲染、模板 fallback、经典模式 |
| `filmGeometry.ts` | layout、cover、rotate helpers | 135 物理几何和图像装框 |
| `filmOverlay.ts` | 真实 135 模板注册表与 layout/draw helpers | 模板 aperture 与连续长条布局 |
| `filmResolution.ts` | 两个 target width helper | 真实模式 preview/high 尺寸 |
| `filmColor.ts` | `applyGold200Look` | Gold 200 像素色彩变换 |
| `filmTexture.ts` | grain/dust/scratch/base texture | 主线程真实程序化纹理 |
| `filmMarkings.ts` | 135 marking helpers | 程序化文字和 DX-like 标记 |
| `filmFrameNumber.ts` | normalize/positions/draw | 帧号循环和模板动态编号 |
| `settingsStorage.ts` | normalize/merge/load/save | `filmFrame.preferences.v1` |
| `uploadFiles.ts` | `prepareUploadedImages` | MIME allowlist、尺寸解码、大图警告、EXIF 编排 |
| `previewNavigation.ts` | index/next/source | 纯函数预览导航 |
| `previewDownload.ts` | source/name/build | 预览下载 |
| `zip.ts` | `createZipBlob` | 自研 Store ZIP32、CRC32 |
| `renderResult.ts` | settings key、artifact、MIME 命名 | current/stale 结果身份 |
| `imageBatch.ts` | 按 ID 合并、generation gate | 防旧批次覆盖最新列表 |
| `renderBudget.ts` | canvas/strip budget | 分配大画布前拒绝超限 |
| `renderTransform.ts` | normalize/key/cover placement | 连续位置、1-3x 缩放、用户旋转与自动旋入契约 |
| `workflowState.ts` | status/select/move/primary action | UI 工作流纯函数 |
| `previewRenderController.ts` | debounce/generation/revoke | 即时预览生命周期 |
| `recipeStorage.ts` | load/save/delete | `filmFrame.recipes.v1` 本地配方 |
| `shareArtifact.ts` | capability/share result | Web Share 文件边界 |

依赖方向原则：UI 可以依赖 service；通用纯 service 不应反向依赖 `App`。渲染 helper 依赖 `types.ts`，但不应依赖 React。

## `tests/`

| 文件 | 覆盖意图 | 当前实况 |
| --- | --- | --- |
| `filmGeometry.test.ts` | 135 尺寸、帧号、旋转、模板/长条布局、分辨率 | Vitest 真实执行通过 |
| `previewNavigation.test.ts` | 循环导航、源选择 | 真实执行通过 |
| `settingsStorage.test.ts` | 白名单、钳制、存取 | 真实执行通过 |
| `uploadFiles.test.ts` | MIME、大图、EXIF、解码失败回收 | Vitest 真实执行通过 |
| `previewDownload.test.ts` | artifact 下载与未处理原图禁用 | Vitest 真实执行通过 |
| `renderResult.test.ts` | MIME、settings key、stale、顺序 | Vitest 真实执行通过 |
| `imageBatch.test.ts` | 删除晚到、新增/排序保留、generation | Vitest 真实执行通过 |
| `filmWorkerClient.test.ts` | 构造、超时、dispose、晚到、路由 | Vitest 真实执行通过 |
| `renderBudget.test.ts` | 画布边长/面积和长条边界 | Vitest 真实执行通过 |
| `zip.test.ts` | ZIP 签名和输入内存预算 | Vitest 真实执行通过 |

测试由 Vitest 执行，当前 18 个文件、137 项断言。新增 transform、batch curation/admission、workflow、preview controller、recipe 和 share 覆盖；`tests/e2e/frontend-redesign.spec.ts` 使用 Playwright 覆盖桌面空态、移动/平板设置、上传冲洗审片、选片、长条和二维码 fallback。

## `public/`

| 文件 | 状态 |
| --- | --- |
| `alipay.jpg` | 约 252KB，但不是可解析 JPEG，需替换 |
| `.DS_Store` | 不应发布；当前会被 Vite 复制 |
| `film-overlays/film-base.png` | 运行时分层素材 |
| `film-overlays/aperture-mask-derived.png` | 运行时分层 mask |
| `film-overlays/aperture-shadow-derived.png` | 运行时加载但不绘制 |
| `film-overlays/kodak-gold-200.png` | Gold 200 legacy fallback |
| `film-overlays/kodak-portra-160.png` | Portra 160 flattened real-135 template |
| `film-overlays/kodak-portra-400.png` | Portra 400 flattened real-135 template |
| `film-overlays/kodak-ektar-100.png` | Ektar 100 flattened real-135 template |
| `film-overlays/kodak-portra-800.png` | Portra 800 flattened real-135 template |
| `film-overlays/kodak-{ultramax-400,colorplus-200,pro-image-100}.png` | Kodak 彩色负片 flattened real-135 templates |
| `film-overlays/kodak-ektachrome-e100.png` | Ektachrome E100 flattened real-135 template |
| `film-overlays/kodak-{tri-x-400,tmax-100,tmax-400,tmax-p3200}.png` | Kodak 黑白 flattened real-135 templates |
| `film-overlays/fuji-superia-400.png` | Fuji Superia 400 flattened real-135 template |
| `film-overlays/cinestill-800t.png` | CineStill 800T flattened real-135 template |
| `film-overlays/ilford-hp5-plus.png` | Ilford HP5 Plus flattened real-135 template |
| 其他 mask/shadow PNG | 当前源码未引用，疑似中间素材 |
| `film-overlays/README.md` | runtime template geometry and normalization contract |

Vite 会原样复制整个 `public/`，不是只复制被 import 的资源。

## 生成与忽略目录

- `node_modules/`：非源码；安装 Vitest 时 npm 已移除审计初期发现的重复 extraneous 目录。
- `dist/`：生产构建，忽略，不应作为源码事实来源。
- `.playwright-cli/`：手工浏览器快照/日志，忽略，不能替代自动化测试。
- `output/`：可用于本地 QA 产物，但不应把临时截图当成源码或长期测试证据。
