# P0 交付可靠性与渲染响应

## Goal

让整卷照片从冲洗到导出的交付结果完整、明确、可中止，并让真实 135 的高成本合成不再阻塞界面。

## Requirements

- 子任务一补齐导出闭环：存在未处理、已失效或失败照片时，不得静默导出不完整 ZIP。
- 子任务二补齐渲染执行层：全部 16 款真实 135 在浏览器支持时由 Worker 渲染，“停止”必须终止当前 Worker 计算。
- 保留不支持 Worker 浏览器的主线程回退，且不改变既有胶片视觉、设置持久化和导出文件格式。
- 两个子任务可分别验证和回滚；先完成导出闭环，再推进 Worker 改造。

## Acceptance Criteria

- [x] 部分照片已冲洗时，主操作会先处理剩余照片再导出，界面不再无提示遗漏。
- [x] 用户仍可明确选择只导出当前有效成片，并能看到 `N/M` 范围。
- [x] 16 款已注册真实 135 单帧与长条渲染在支持环境中均进入 Worker。
- [x] 停止批量处理会终止 Worker，已完成结果保留，迟到结果不会覆盖状态或显示错误。
- [x] 单元测试、类型检查、构建和端到端测试全部通过。

## Task Map

- `07-29-complete-process-export`：完整冲洗与导出闭环。
- `07-29-all-film-worker-cancellation`：全型号 Worker 与真实取消。

## Constraints

- 不引入新的运行时依赖。
- 不把父任务作为直接实现目标；子任务分别启动、检查和归档。
- 不借机调整视觉资产或扩大到会话恢复、HEIC、撤销等后续需求。

## Verification Evidence

- `npm run check`: 24 test files / 165 tests, strict typecheck, and production build passed.
- `npm run test:e2e`: 36 Chromium journeys passed, including all 16 real-135 single/strip paths, exact partial/full ZIP entry counts, Worker termination, and retry through a new Worker.
- `git diff --check`: passed before both implementation commits.
