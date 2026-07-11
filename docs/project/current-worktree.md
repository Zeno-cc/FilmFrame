# 稳定化交付快照

> 快照时间：2026-07-11（Asia/Shanghai）
>
> 分支：`main`
>
> 前序基线：`a036da628e1538573769fc27950c1fee6b33aff6`
> 范围：此前开发内容与本轮 P0 稳定化作为同一提交边界交付。实时 HEAD、远端和 dirty 状态以 `git status --short --branch` 为准。

## 交付范围

| 文件 | 交付内容 |
| --- | --- |
| `App.tsx` | 上传拖放、结果身份、按 ID 批次合并、stale 判定、正确下载、Worker dispose |
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
| `npm run check` | 成功：66 tests + typecheck + 54-module build |
| Vitest | 11 个文件、66 项断言通过 |
| Chromium smoke | 上传、未处理预览、处理、下载出现、格式切换 stale 均通过 |
| 浏览器 console | 仅 React DevTools 开发提示 |
| `git diff --check` | 通过 |
| `public/alipay.jpg` | `file` 识别为 data，无法读尺寸 |

## 接手规则

1. 开始任务先运行 `git status --short --branch -uall`，保护当前用户工作。
2. 改动上述模块前先阅读调用链和对应测试，不能从前序基线重新实现一遍。
3. 本文记录交付边界，不记录长期易失真的 dirty 文件清单。
4. 后续稳定化或发布时更新验证快照；历史变化应进入 commit/CHANGELOG。
