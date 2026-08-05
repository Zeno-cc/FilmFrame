# 文件与模块地图

> 最后核验：2026-08-05。排除 `.git/`、`node_modules/`、`dist/`、测试产物和本地秘密文件。

## 根目录与部署入口

| 文件 | 职责 | 维护注意 |
| --- | --- | --- |
| `App.tsx` | 根 controller；上传、选片、处理、预览、导出、URL 生命周期、设备授权续期和运行预算状态 | 鉴权判断不在 React；纯准入计算与运行配置校验属于 service |
| `types.ts` | 胶片、设置、图片与构图领域类型 | 新字段需同步 storage、主线程与 Worker |
| `index.tsx` | React 挂载入口 | `React.StrictMode` 开启 |
| `index.html` | 页面壳、favicon、module 入口 | 已无 `window.process` polyfill；安全响应头由 Nginx 设置 |
| `styles.css` | Tailwind v4 source、token/base/component 样式 | 扫描根组件与 `components/` |
| `package.json` | 前端脚本和根级聚合检查 | `check:access`、`check:all`、`verify:deployment` 已接入 |
| `tsconfig.json` | 浏览器 TypeScript 配置 | 明确排除独立的 `server/access` 包 |
| `Dockerfile` | 前端多阶段构建，最终由 Nginx 提供 `dist/` | Node 20 build stage；运行镜像不含源码工具链 |
| `nginx.conf` | 静态容器路由、健康检查和安全响应头 | 受保护资源统一 `private, no-store`，不能改回公开 immutable 缓存 |
| `compose.yaml` | 静态容器、access sidecar、私有网络与 SQLite 卷 | 两个端口都只绑定 `127.0.0.1` |
| `.env.example` | Compose 非秘密配置模板 | 真实值写本地 `.env`，不得提交 |
| `.dockerignore` | 限制前端 Docker build context | `server/access` 由自己的 build context 构建 |
| `vite.config.ts` | React/Vitest 配置 | 排除 Playwright E2E 文件 |
| `playwright.config.ts` | Full Chromium project plus focused Firefox/WebKit compatibility projects | Desktop WebKit does not replace physical iPhone evidence |
| `README.md` | 用户、开发、隐私和部署入口 | 架构事实应与本目录文档同步 |

## 浏览器应用

### `components/`

| 目录/文件 | 职责 | 维护注意 |
| --- | --- | --- |
| `CropEditor.tsx` | 构图草稿、拖动、缩放、旋转、复位与提交 | 取消不写回正式 transform |
| `app/` | AppShell、Header、SessionMeter、MoreMenu | 桌面/移动菜单不提供会清除设备授权的退出命令 |
| `workspace/` | 空态、Toolbar、接触印样、卡片、长条审片台和序列 Rail | 顺序和选择状态来自 App/service |
| `settings/` | 桌面与移动设置面板、配方 | 所有设置通过 `FilmSettings` 更新 |
| `preview/` | 原图/成片预览、导航、旋转和构图入口 | 正式 artifact 与临时预览 URL 分离 |
| `feedback/` | Toast、错误与支持弹窗 | 资源加载失败保留明确 fallback |
| `mobile/` | 移动端底部主操作 | Sheet 打开时避免重复 CTA |
| `ui/` | Button、Field、Sheet、Modal 等通用 primitive | 维持焦点、键盘和 reduced-motion 合同 |

### `services/`

| 模块 | 职责 |
| --- | --- |
| `filmWorkerClient.ts` / `filmWorker.ts` | Worker 能力/策略、请求协议、超时、取消和主线程回退 |
| `filmEngine.ts` | 主线程经典/真实 135 单图与长条渲染策略及稳定公开门面 |
| `canvasRuntime.ts` | DOM Canvas image load, Blob export, output rotation/orientation, and coupled mask mechanics |
| `filmGeometry.ts` / `filmResolution.ts` | 135 几何、cover、旋转和输出分辨率 |
| `filmOverlay.ts` / `filmSprocket.ts` | 真实 135 模板、片窗和齿孔合成 |
| `filmTexture.ts` / `filmMarkings.ts` / `filmFrameNumber.ts` | 片基纹理、标记与帧号 |
| `renderTransform.ts` / `previewRenderController.ts` | 构图归一化与即时预览生命周期 |
| `renderResult.ts` / `imageBatch.ts` / `workflowState.ts` | 结果签名、generation gate、批次和 UI 状态推导 |
| `uploadFiles.ts` | MIME、尺寸解码、大图提示和 EXIF 编排 |
| `settingsStorage.ts` / `recipeStorage.ts` | 白名单本地偏好和配方 |
| `runtimeConfig.ts` | Strict same-origin runtime-config decoding, 700 MiB fallback, and MiB-to-budget conversion |
| `renderAdmission.ts` / `renderBudget.ts` / `batchAdmission.ts` | App-local estimates and feedback, single-Canvas limits, and independent source/work-set/strip admission |
| `zip.ts` | ZIP input boundary, independent from the configured Canvas budget |
| `previewDownload.ts` / `shareArtifact.ts` | 下载和 Web Share 文件边界 |
| `photographyQuotes.ts` | 随应用发布的审核名言快照，不在浏览器运行时请求第三方 API |

依赖方向保持为 UI -> service -> 纯 helper/types。鉴权服务不应被浏览器 bundle import，浏览器 service 也不应直接读取 SQLite 或 Access JWT。

## Access sidecar

`server/access/` 是独立的 Express 5 + TypeScript + SQLite 包，有自己的 lockfile、TypeScript 配置、测试和 Dockerfile。

| 路径 | 职责 |
| --- | --- |
| `src/config.ts` | 用 Zod 校验 Host、数据库、Cloudflare Access 和 Cookie 配置 |
| `src/constants.ts` | 7 天邀请码、400 天滚动设备会话、表单 nonce 和 Cookie 常量 |
| `src/inviteCode.ts` | 128 bit Crockford 邀请码生成、规范化与 SHA-256 |
| `src/db.ts` / `src/migrate.ts` | SQLite 打开、权限、WAL、迁移和 readiness |
| `src/store.ts` | 创建/列出/兑换/撤销邀请码与会话事务 |
| `src/accessJwt.ts` | 远程 JWKS 与 Cloudflare Access JWT 验证 |
| `src/middleware/` | Host、私有来源、管理员断言、CSRF、Content-Type 和限速 |
| `src/routes/publicRoutes.ts` | `/access`、`/auth/redeem`、`/auth/refresh` |
| `src/routes/adminRoutes.ts` | 管理页、列表、创建和撤销 API |
| `src/runtimeConfig.ts` | Persisted singleton Canvas budget validation and exact MiB/byte conversion |
| `src/views/adminSettingsView.ts` | Administrator runtime-policy UI for the 128–2,048 MiB Canvas budget |
| `src/views/html.ts` | 无第三方脚本的服务端邀请页和管理页；一次性明文可清除 |
| `src/cli.ts` | SSH 应急 create/list/revoke/backup |
| `migrations/001_initial.sql` | invites、sessions 和索引的初始 schema |
| `migrations/005_render_budget.sql` | Additive singleton render-budget table seeded to 700 MiB |
| `tests/all.test.ts` | 单进程聚合测试入口，避免原生 SQLite 多进程退出问题 |
| `Dockerfile` | Node 22 多阶段构建；build stage 编译 `better-sqlite3`，非 root runtime |
| `.env.example` | sidecar 配置示例，不包含真实身份或凭据 |
| `README.md` | 路由、环境和 SSH 运维契约 |

## OpenResty 与部署验收

| 路径 | 职责 | 关键边界 |
| --- | --- | --- |
| `ops/openresty/filmframe-auth.conf.example` | 公开站点 vhost 示例 | `auth_request` 覆盖全部应用路径；内部子请求固定 `Host: access`；失败关闭 |
| `ops/openresty/filmframe-admin.conf.example` | 管理站点 vhost 示例 | 只转发 Access assertion，Node 端逐请求验签 |
| `scripts/verify-invite-deployment.mjs` | 无秘密的配置与可选线上探针 | 检查回环端口、私网、卷、CSP、no-store、公开/源站边界和 `openresty -t` |

示例 vhost 不能直接覆盖 1Panel 配置。上线时只合并 FilmFrame 的两个站点，并替换为 1Panel 已管理的真实证书路径。

## 测试地图

| 测试层 | 当前实况 | 重点 |
| --- | --- | --- |
| 根 Vitest | 27 个文件、196 项测试 | 上传、几何、设置、构图、批次、Worker、结果、运行配置、Canvas 预算、ZIP、模板、齿孔、纹理和名言 |
| Access Node test | 89 项，单进程聚合测试 | 邀请码、nonce、SQLite、并发兑换、Cookie、续期、运行配置、管理 API 和 Access JWT |
| Playwright Chromium | 42 项，`tests/e2e/` | Complete frontend regression suite, including bounded render-budget stress |
| Playwright Firefox/WebKit | 2 项，`browser-compatibility.spec.ts` | Focused local upload, rendering, preview, rotation, navigation, and export contract |

根 Vitest 与 Access 数量来自 2026-08-05 的真实执行。Access 测试必须在 Node 22 LTS 且原生依赖由同一 Node 版本安装的环境运行。

## 静态素材与生成目录

- `public/film-overlays/`：16 款真实 135 模板及 Gold 分层素材。
- `public/film-sprocket-masks/`：真实齿孔蒙版。
- `data/photography-quotes.json`：应用使用的摄影名言审核快照，由 Vite 打包进应用。
- `generated/`：`npm run sync:quotes` 按需创建的 Wikiquote 候选目录，不直接覆盖生产快照。
- `dist/`：Vite 生产构建，忽略且不作为源码事实来源。
- `node_modules/` 与 `server/access/node_modules/`：分别属于前端和 Node 22 sidecar，不能跨 Node major 复用原生模块。
- `test-results/`、`playwright-report/`：自动化产物，不提交。
- `.env`、SQLite/WAL/SHM：本地或生产状态，必须忽略且不得进入镜像/仓库。
