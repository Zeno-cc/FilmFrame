# FilmFrame 项目交接入口

> 最后核验：2026-07-12
>
> 当前开发基线：`main` / `e5c5a84` 加 P0/P1 体验升级工作区
>
> 重要：分支、远端和工作区状态必须以当前 `git status` 为准。

## 0. 新会话先读这里

FilmFrame 是一个纯浏览器端的单页图片处理应用。用户把本地照片加入内存后，应用通过 Canvas 生成经典胶片边框或 Kodak Gold 200 风格的真实 135 胶片效果，支持单张处理、连续长条、预览、单图下载和 ZIP 批量下载。项目没有后端、数据库、登录、业务 API、必需环境变量或遥测。

接手顺序：

1. 先读本文，特别是“当前开发态”和“不可误判的事实”。
2. 根据任务进入对应专题文档：
   - [产品与用户流程](docs/project/product-workflows.md)
   - [系统架构与数据流](docs/project/architecture.md)
   - [渲染引擎与图像算法](docs/project/rendering.md)
   - [文件与模块地图](docs/project/file-map.md)
   - [开发、测试与部署](docs/project/engineering.md)
   - [风险、排障与后续计划](docs/project/operations-and-risks.md)
   - [当前工作区快照](docs/project/current-worktree.md)
3. 运行 `git status --short`，确认本文快照之后是否又有变化。
4. 修改前定位真实调用链。渲染逻辑同时存在主线程版和 Worker 版，不能只改其中一套。
5. 修改后运行 `npm run check`，它会依次执行真实 Vitest、TypeScript 和生产构建。

事实冲突时的优先级：当前源码和配置 > 亲自执行的验证结果 > 本交接文档 > `README.md` > 提交标题和历史描述。

## 1. 30 秒项目概览

| 项目 | 当前事实 |
| --- | --- |
| 产品 | FilmFrame / Digital Darkroom，中文为主的本地胶片边框生成器 |
| 形态 | 无路由的 React 单页应用 |
| 技术栈 | React 19、TypeScript、Vite 5、Tailwind CSS 4、Canvas 2D、Web Worker、OffscreenCanvas、exif-js |
| 运行边界 | 图片只在浏览器内存处理；Worker 只请求同源静态素材 |
| 输出 | JPEG/PNG 单张、连续胶片长条、Store 模式 ZIP32 |
| 渲染模式 | `classic`；`real135` 仅在 Kodak Gold 200 下通过 UI 开放 |
| 加速 | Gold 200 真实 135 在能力满足时走 Worker；classic 暂固定主线程 |
| 状态 | React 内存状态；偏好和本地配方写入 `localStorage`，图片和结果不持久化 |
| 部署 | `dist/` 静态站；没有已落盘的有效平台配置 |
| 测试现状 | Vitest；16 个测试文件、117 项断言；`npm run check` 聚合验证 |
| 当前开发 | P0 主流程/移动端与 P1 自由裁切创作闭环已实现，尚未提交 |

## 2. 快速开始

要求 Node.js `>=20`。可复现安装优先使用 `npm ci`：

```bash
npm ci
npm run dev
```

默认开发地址由 Vite 输出，通常是 `http://localhost:5173/`。

生产检查：

```bash
npm run build
npm run preview
```

当前验证入口：

```bash
npm run test:geometry
npm run test:preview
npm run test:settings
npm run test:upload
npm run test:download
npm run typecheck
npm run check
```

`test:*` 和 `npm test` 现在都会真实执行断言。旧 geometry 失败来自已经没有生产调用的 segment helper；本轮删除了该死实现和失真断言，其余几何契约保留并通过。详见 [工程文档](docs/project/engineering.md)。

## 3. 系统主链路

```text
index.html
  -> index.tsx
  -> App.tsx
       -> uploadFiles.ts             上传检查、尺寸、EXIF
       -> filmWorkerClient.ts        渲染门面和 Worker 降级
            -> filmWorker.ts         Worker / OffscreenCanvas
            -> filmEngine.ts         主线程 Canvas 与完整 fallback
       -> previewNavigation.ts       预览循环导航
       -> previewDownload.ts         下载源和文件名
       -> previewRenderController.ts 即时预览 debounce/generation
       -> renderTransform.ts         每图连续位置、缩放与旋转契约
       -> workflowState.ts           任务状态、排序和主操作
       -> recipeStorage.ts           本地设置配方
       -> shareArtifact.ts           Web Share 文件分享
       -> zip.ts                     ZIP32 打包
       -> settingsStorage.ts         localStorage 偏好
```

单张处理按图片顺序串行执行，降低同时解码多张大图的峰值。每张失败只标记该项，不中断其他图片。长条处理一次性创建整张画布；图片顺序、删除或新增会使已有长条失效并回收其 blob URL。

## 4. 两种输出模式与两种边框模式

这里存在两个独立维度，接手时不要混淆：

| 维度 | 值 | 含义 |
| --- | --- | --- |
| `OutputMode` | `single` | 每张生成独立成片，最终可 ZIP |
| `OutputMode` | `strip` | 把全部照片合成连续胶片长条 |
| `FrameRenderMode` | `classic` | 程序化边框、齿孔、文字和日期 |
| `FrameRenderMode` | `real135` | 真实 135 视觉；UI 只为 Kodak Gold 200 开放 |

真实 135 的主线程单张 fallback 顺序是：

```text
分层素材 film-base + aperture-mask-derived + aperture-shadow-derived
  -> 旧单图模板 kodak-gold-200.png
  -> 程序化 135 renderer
```

`aperture-shadow-derived.png` 当前仍加载，但主线程和 Worker 都暂时禁用了绘制，原因是避免照片边缘变暗。

## 5. 不可误判的技术事实

- `App.tsx` 是 1800 多行单体根组件，承担 UI、状态和工作流编排。没有组件目录、路由或状态库，下一轮应按已稳定契约拆分。
- `filmEngine.ts` 和 `filmWorker.ts` 维护两套渲染实现，已经存在行为差异。涉及尺寸、旋转、纹理、长条、标记或导出时必须检查两边。
- Worker client 懒创建；能力条件为 `Worker`、`OffscreenCanvas`、`convertToBlob`、`createImageBitmap` 全部存在，构造失败安全回退。
- Worker 请求有 120 秒超时、`messageerror`、dispose 和卸载终止；晚到响应不会创建无主 Object URL。
- 所有照片和成片由 `File`、Blob、Object URL 留在浏览器内存。偏好之外没有持久化。
- 每张图可记录连续 focus、1-3x zoom 和四分之一旋转；`CropEditor` 只在完成时提交本地草稿。共享 RenderTransform 先应用用户旋转，再判断真实 135 自动旋入。单张只恢复自动旋入，不撤销用户旋转。
- 视觉颗粒、灰尘、划痕和部分 DX 标记使用 `Math.random()`，同一输入不会得到逐像素确定的输出。
- ZIP 是项目自研的 Store 模式 ZIP32，不压缩、无 ZIP64，单文件和总档案受约 4 GiB 边界约束。
- 所有新画布受 32767 边长和 6400 万像素预算保护；ZIP 输入另限制为 256 MiB。
- `netlify.toml` 是空文件，不代表项目已有 Netlify 配置。
- README 声称 MIT，但仓库没有 `LICENSE` 文件。
- `public/alipay.jpg` 当前不是可解析的 JPEG，捐赠二维码大概率破图。
- `autoCropToFilmRatio` 已类型化、默认化和持久化，但渲染路径没有读取，是死配置。
- `JetBrains Mono` 仅写在字体栈中，项目没有加载该字体。

## 6. 稳定化提交边界

本轮以 `a036da628e15` 为前序基线，将此前尚未提交的 Worker、上传和下载开发内容，与项目级审查后的 P0 稳定化修复一起收束。主要包含：

- 真正的 Worker 渲染、生命周期、超时和 fallback；
- 上传拖放、校验拆分与预览下载命名；
- 竖图输出方向恢复、帧号统一和模板阴影调整；
- 渲染结果身份、批次 generation、stale 判定与 Blob URL 所有权；
- Canvas/ZIP 容量预算、真实 Vitest 门禁和项目交接文档。

完整提交范围和验证证据见 [稳定化交付快照](docs/project/current-worktree.md)。后续工作不要从前序基线重新实现这些能力；修改前应先阅读当前调用链和测试契约。

## 7. 当前最高优先级风险

1. Worker 与主线程仍有重复渲染实现；classic 已固定主线程止血，但长期仍需共享渲染契约。
2. 上传已严格限制 JPEG/PNG/WebP 并拒绝解码失败；仍缺批次总源像素预算和 HEIC 等格式的明确转码策略。
3. ZIP 有 256 MiB 输入预算并改为顺序读取，但仍是内存内 Store ZIP，不适合超大档案。
4. transform 已有共享几何与 payload 测试，但尚无真实 Canvas/OffscreenCanvas 像素基准矩阵。
5. 生产发布会复制 `public/` 全部内容，包括 `.DS_Store`、素材说明和多个可能仅为中间产物的 PNG。
6. `public/alipay.jpg` 仍损坏，需所有者提供正确原图。
7. 开发工具链审计仍有 1 high、2 moderate、1 low；生产依赖审计为 0，升级需单独验证。

风险证据、影响和建议顺序见 [风险与排障](docs/project/operations-and-risks.md)。

## 8. 修改时的同步规则

| 改动 | 同步检查 |
| --- | --- |
| 新增设置字段 | `types.ts`、默认值、UI、storage 白名单/迁移、主线程、Worker、文档 |
| 改渲染算法 | 主线程与 Worker 两条路径、单张与长条、预览与高清、真实与经典 |
| 改模板素材 | 资源尺寸、`filmOverlay.ts` 固定 aperture 坐标、fallback、发布体积、素材文档 |
| 改输出格式 | Canvas 导出、Worker Blob、单图命名、预览下载、ZIP、结果失效策略 |
| 改图片列表 | Object URL 回收、预览当前项、长条失效、处理中竞态 |
| 改存储 schema | `filmFrame.preferences.v1` 版本、校验、旧值迁移、测试 |
| 改部署 | 构建目录、Node 版本、静态资产、缓存/安全头、README 与工程文档 |

## 9. 文档维护约定

- `README.md` 面向最终用户和快速启动；不要放大量内部实现。
- `handoff.md` 是 AI/开发者唯一入口，维护当前快照、关键事实和专题索引。
- `docs/project/` 存放长期工程知识；避免把同一段实现细节复制到多个文件。
- 架构或行为发生变化时，更新对应专题的“最后核验”日期和提交。
- 重大且不可逆的设计选择再新增 `docs/project/decisions/NNNN-title.md`，当前尚无 ADR。
- 每次发布或重大稳定化后刷新 [稳定化交付快照](docs/project/current-worktree.md)，工作区实时状态只引用 `git status`，不要把易过期的 dirty 列表写成长期事实。

## 10. 仍需项目所有者确认

- 目标浏览器矩阵，尤其 Safari/iOS 对 OffscreenCanvas、EXIF orientation 和超大 Canvas 的要求。
- 胶片素材的来源、授权和哪些中间 PNG 可删除。
- 正确的支付宝二维码原文件。
- 实际生产托管平台，以及缓存、安全头和发布流程。
- 是否确实采用 MIT；若是，应补正式 `LICENSE`。
- 竖图旋转方向和真实 135 输出的视觉产品标准。
