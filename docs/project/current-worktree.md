# 稳定化交付快照

> 快照时间：2026-07-12（Asia/Shanghai）
>
> 分支：`main`
>
> 当前 HEAD：`e5c5a84`
> 范围：此前开发内容与本轮 P0 稳定化作为同一提交边界交付。实时 HEAD、远端和 dirty 状态以 `git status --short --branch` 为准。

## 当前未提交 P0/P1 体验升级与前端重构

- P0：严格上传、可见状态、仅处理待更新、停止后续、ZIP 互斥进度、移动工作室优先、触屏排序与 dialog 无障碍。
- P1：共享 RenderTransform、连续自由裁切与 1-3x 缩放、四分之一旋转、即时 preview、Before/After、本地配方和 Web Share。
- Darkroom Contact Sheet：设计 token、feature 组件、桌面 Inspector、平板 Drawer、手机 Sheet、接触印样/长条工作区、审片/反馈重构和 Playwright E2E。
- 执行规约位于 `docs/plans/2026-07-12-p0-workflow-experience/`、`docs/plans/2026-07-12-p1-creative-loop/` 和 `docs/plans/2026-07-12-free-crop-editor/`。

## 交付范围

| 文件 | 交付内容 |
| --- | --- |
| `App.tsx` | 上传拖放、结果身份、按 ID 批次合并、stale 判定、正确下载、Worker dispose |
| `components/{app,workspace,settings,preview,feedback,mobile,ui,icons}` | Darkroom Contact Sheet 展示层、响应式布局、可访问 dialog/sheet、局部图标与 primitive |
| `styles/{tokens,base,components}.css` | 语义色彩、排版、控件与 reduced-motion 样式 |
| `tests/e2e/frontend-redesign.spec.ts` | 桌面、手机、平板、处理/预览/长条、二维码 fallback 浏览器旅程 |
| `playwright.config.ts` | 本地 Chromium E2E 运行配置 |
| `package.json` / lock | Vitest 2.1.9、真实 test/typecheck/check 脚本 |
| `services/filmEngine.ts` | 竖图恢复、帧号统一、画布预算、阴影调整、classic 主线程渲染 |
| `services/filmGeometry.ts` | 明确自动旋转角和输出恢复角 |
| `services/filmOverlay.ts` | overlay 绘制类型泛化到 `CanvasImageSource` |
| `services/filmWorkerClient.ts` | 懒 Worker、pending/timeout/dispose、构造 fallback、classic 路由止血 |
| `tests/filmGeometry.test.ts` | Vitest 迁移、旋转与 24/36 帧契约 |

## 新增模块

| 文件 | 内容 |
| --- | --- |
| `services/filmWorker.ts` | 完整 Worker 渲染入口，约 673 行 |
| `services/previewDownload.ts` | 下载源与安全命名纯函数 |
| `services/uploadFiles.ts` | 上传准备、大图提示、EXIF 容错 |
| `tests/previewDownload.test.ts` | 预览下载断言 |
| `tests/uploadFiles.test.ts` | 上传服务断言 |
| `services/renderResult.ts` | artifact MIME、settings key 和命名 |
| `services/imageBatch.ts` | generation gate 和按 ID 结果合并 |
| `services/renderBudget.ts` | Canvas/strip 容量预算 |
| `tests/renderResult.test.ts` | 结果 identity/stale 断言 |
| `tests/imageBatch.test.ts` | 晚到、删除、新增、排序断言 |
| `tests/renderBudget.test.ts` | 边长、面积、长条预算断言 |
| `tests/filmWorkerClient.test.ts` | Worker 生命周期和路由断言 |
| `tests/zip.test.ts` | ZIP 签名和内存预算断言 |

`filmWorker.ts`、`previewDownload.ts`、`uploadFiles.ts` 及最初两份测试属于审计前已有开发；result/batch/budget/Worker/ZIP 测试模块由项目级审查后的稳定化工作新增。它们在本次交付中共同构成完整行为边界。

## 相对前序基线的关键差异

- `filmWorkerClient` 从保留插槽变为真正创建 Worker，并增加构造 fallback、超时、dispose 和晚到响应防护。
- 上传支持把文件拖到整个 main，而不仅是点击 input。
- 预览只允许下载 current 成片，原图和 stale 结果没有下载入口。
- 非 Gold 胶片强制经典模式，避免显示不支持的真实模板。
- 竖图旋入与成品恢复方向已经明确并由测试锁定。
- aperture shadow 继续加载但不绘制，避免照片边缘异常变暗。

## 本轮稳定化文档

本次交付包含：

```text
handoff.md
docs/project/README.md
docs/project/product-workflows.md
docs/project/architecture.md
docs/project/rendering.md
docs/project/file-map.md
docs/project/engineering.md
docs/project/operations-and-risks.md
docs/project/current-worktree.md
docs/plans/2026-07-11-project-stabilization/SPEC.md
docs/plans/2026-07-11-project-stabilization/TASKS.md
docs/plans/2026-07-11-project-stabilization/TDD.md
docs/plans/2026-07-11-project-stabilization/PLAN.md
```

手工浏览器检查曾临时生成 `output/playwright/handoff-home.png`；交付前已删除，不属于项目文档。

## 验证快照

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 成功：137 tests + typecheck + production build |
| Vitest | 18 个文件、137 项断言通过 |
| Chromium E2E | 14 条旅程通过，包含选片同步、仅处理入选、长条 stale 与 390px 无横向溢出 |
| 浏览器 console | 仅 React DevTools 开发提示 |
| `git diff --check` | 通过 |
| `public/alipay.jpg` | `file` 识别为 data，无法读尺寸 |

## 接手规则

1. 开始任务先运行 `git status --short --branch -uall`，保护当前用户工作。
2. 改动上述模块前先阅读调用链和对应测试，不能从前序基线重新实现一遍。
3. 本文记录交付边界，不记录长期易失真的 dirty 文件清单。
4. 后续稳定化或发布时更新验证快照；历史变化应进入 commit/CHANGELOG。
