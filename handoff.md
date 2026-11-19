# FilmFrame 项目交接入口

> 最后核验：2026-11-14。本文描述当前源码工作区；分支、HEAD 和未提交改动以 `git status --short --branch -uall` 为准。

## 接手顺序

1. 阅读 `AGENTS.md` 和目标模块的 `.trellis/spec/` 规范。
2. 查看当前 Git 状态，保留已有工作；不要用旧快照覆盖当前实现。
3. 根据目标阅读下方文档和实际调用链。
4. 使用 `package.json` 中的检查命令验证。历史测试数量和旧文档不能证明当前行为。

当前源码、配置和本轮运行结果优先于历史计划、交接快照和提交标题。

## 当前结构

FilmFrame 的照片处理全部在浏览器中完成。项目同时包含可选的 Express/SQLite 邀请码与设备授权服务、管理界面，以及发布、备份和更新工具。服务端不处理照片。

| 范围 | 入口与职责 |
| --- | --- |
| 页面与工作流 | `App.tsx`；React 内存状态、选片、处理批次、预览与资源所有权 |
| 展示组件 | `components/`；桌面 Inspector、平板 Drawer、手机 Sheet、工作区和反馈 |
| 上传与导出 | `services/uploadFiles.ts`、`heicConversion.ts`、`previewDownload.ts`、`zip.ts` |
| 渲染门面 | `services/filmWorkerClient.ts`；可选 Worker、取消、超时与主线程重试 |
| 主线程 / Worker | `services/filmEngine.ts`、`filmWorker.ts` |
| 光谱成像 | `services/spectral/`；型号注册、延迟资源、CPU 与 WebGL2 |
| 物理片边 | `services/physical135/`；片门、齿孔、片边标记、材质与连续长条 |
| 本地偏好 / 配方 | `services/settingsStorage.ts`、`recipeStorage.ts`；白名单及旧设置迁移 |
| 访问控制 | `server/access/`；邀请码、会话、Passkey、管理设置与运行时预算 |
| 运维 | `compose.yaml`、`ops/openresty/`、`ops/release/`、`ops/updater/`、`ops/backup/` |

## 当前产品契约

- 新会话默认 Gold 200、光谱成像、物理片边、开放背光、单张 JPEG。旧偏好及旧配方按胶片能力归一化：光谱胶片上的经典边框迁移为 135 画幅 + 模板片边，非光谱胶片保留经典边框。
- `OutputMode` 决定单张或长条；`FrameRenderMode` 决定经典边框或 135 画幅；`ImagingMode` 决定经典色彩或光谱；`EdgeRenderMode` 决定模板片边或物理片边。这些维度不能互相代替。
- 胶片选择有 29 款，其中 24 款支持光谱。能力由 `stockRegistry.ts` 和 `physical135/capability.ts` 决定，不从名称或是否存在模板推断。
- 16 套历史贴图供对应型号使用；新增型号可以使用明确标注的兼容片边。兼容布局不代表独立实测扫描。
- 物理片边与模板片边都支持连续长条。光谱成像按帧显影；长条在一次任务内共享一个光谱会话（pipeline 与后端只加载一次），模板长条几何与输出尺寸不变。
- 经典边框固定主线程；135 画幅在满足浏览器能力时使用 Worker。普通 Worker 失败可以重试同设置的主线程路径，取消不能触发重试。
- JPEG/PNG/WebP 直接导入；静态 HEIC/HEIF 在本机转换为 JPEG，原文件仅保留命名、身份及 best-effort EXIF 用途。
- 图片、EXIF、构图、Blob 和 Object URL 不上传、不持久化。刷新会丢失工作区；设置和配方保存在 localStorage。
- 只有设置、照片顺序、构图与结果签名匹配的正式成片可下载。即时预览与正式结果分别管理 URL。
- Canvas 最大边长为 32767，单 Canvas RGBA 准入预算为 128–6144 MiB，默认 6144 MiB；这不保证浏览器实际能分配相应内存。ZIP 输入另有 256 MiB 上限。

## 验证入口

前端要求 Node.js >=20；Access 服务要求 Node.js 22，并需匹配本机 `better-sqlite3` ABI。

```bash
npm run check                  # Vitest、光谱数值校验、TypeScript、生产构建
npm run check:access           # Access 测试、类型检查、构建
npm run test:e2e               # 开发服务器浏览器回归
npx playwright test --config playwright.preview.config.ts # 先 build，再验证生产资产
npm run verify:provenance      # 来源清单与文件摘要；不等于分发许可审核通过
npm run check:release          # 发布门禁；执行前阅读 ops/release/README.md

git diff --check
```

浏览器组串行运行，尤其不能同时运行多个 GPU 验收组。生产预览不提供开发 `.ts` 模块，开发诊断用例必须使用默认配置。桌面 WebKit 自动化不能替代真机 iPhone Safari 验收。

## 修改时的同步检查

| 改动 | 检查范围 |
| --- | --- |
| 设置字段 / 型号 | 类型、默认值、UI、存储迁移、结果身份、渲染能力、数值资源和测试 |
| 渲染算法 | 主线程、Worker、CPU/WebGL2、单张/长条、预览/高清、旋转和导出 |
| 图片列表 / 构图 | 顺序、入选、generation、stale 判断、晚到结果和 Object URL 回收 |
| 发布 / 部署 | 两个包版本、release input、Compose、OpenResty、来源清单与构建产物 |

不提交、推送、部署或清理用户文件，除非当前任务明确授权相应操作。

## 文档与待审范围

- [产品入口](README.md)
- [文档索引](docs/project/README.md)
- [架构与访问边界](docs/project/architecture.md)
- [工程与部署](docs/project/engineering.md)
- [渲染规范](.trellis/spec/frontend/spectral-rendering.md)
- [来源与分发待审清单](ops/provenance/README.md)
- [浏览器与移动端验收](docs/project/browser-mobile-smoke.md)

`docs/plans/`、`.trellis/tasks/` 及 `docs/project/current-worktree.md` 包含历史证据，须按日期使用。旧的产品和渲染专题尚有迁移前描述，涉及光谱与物理片边时以当前源码和渲染规范为准。

历史模板授权、部分光谱数据权利、项目整体许可和对应源码仍需按来源清单审查。`public/alipay.jpg` 当前是可解析的 1260×1890 JPEG；不要继续沿用旧快照的“二维码损坏”结论。未使用的素材处理文件、旧组件和配置应先查引用与人工工作流，再决定删除。
