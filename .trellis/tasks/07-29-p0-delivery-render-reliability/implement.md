# Implementation Plan: P0 Delivery And Rendering Reliability

## Sequence

1. 启动、实现、验证并归档 `07-29-complete-process-export`。
2. 启动、实现、验证并归档 `07-29-all-film-worker-cancellation`。
3. 按父任务验收标准做一次跨子任务集成检查。
4. 运行 `npm run check`、`npm run test:e2e` 和 `git diff --check`。
5. 提交实现与任务记录，归档父任务。

## Integration Review

- 从部分完成状态触发补齐导出，处理中停止，确认不会下载；再次触发可继续并完整导出。
- 分别用 Gold 200 与非 Gold 真实 135 验证补齐导出，确保两个 Worker 分支行为一致。
- 在无 Worker 能力模拟下验证主线程回退仍能完成同一导出闭环。

## Rollback

两个子任务分开提交或保持清晰 diff 边界。Worker 改造可独立回滚，不影响导出完整性修复。
