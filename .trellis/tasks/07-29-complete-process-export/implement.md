# Implementation Plan: Complete Process And Export

## Ordered Work

1. 提取并测试导出完整性纯函数，沿用现有“当前结果”判定逻辑。
2. 将 ZIP 打包函数改为接收显式结果集合，避免 UI 分支隐式过滤。
3. 增加不完整导出确认对话框，接入焦点恢复和忙碌状态。
4. 复用批处理管线实现“处理待完成照片 -> 重新校验 -> 导出”，保留已有结果与停止语义。
5. 增加部分完成两种分支、失败/停止和完整直出的端到端覆盖。
6. 执行聚焦测试、全量质量门和差异检查。

## Validation Commands

- `npm run test -- tests/exportReadiness.test.ts`
- `npm run typecheck`
- `npm run test:e2e -- --grep "ZIP|导出"`
- `npm run check`
- `npm run test:e2e`
- `git diff --check`

## Review Gates

- 下载前必须基于最新 refs 二次校验，不能依赖打开对话框时的快照。
- 只导出当前结果必须是用户明确选择，且文件数量和 `N/M` 文案一致。
- 停止和失败路径不得下载，也不得删除已有结果。

## Rollback Point

纯决策 helper 和对话框可整体移除；ZIP 编码及长条导出保持原实现，降低回滚风险。
